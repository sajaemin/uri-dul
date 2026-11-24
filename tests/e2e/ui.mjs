// Two phones use the real app against the real backend: pair up, then mood, question, photo, date, letter,
// roulette, reload. Screenshots go to tests/e2e/shots. Needs web/config.js written by provision.mjs.
// Usage: node tests/e2e/ui.mjs   (UD_APP_URL to test an already served copy instead of serving web/ locally)
import { chromium, devices } from 'playwright';
import { spawn } from 'child_process';
import fs from 'fs';
import { sql } from '../../scripts/sb.mjs';

const REF = process.env.UD_REF;
const SHOTS = new URL('./shots/', import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0, server = null;
const ok = (c, l) => { console.log(`${c ? '✓' : '✗'} ${l}`); if (!c) failed++; };
const ymdKST = n => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const ME = 'E2E재민', PT = 'E2E은지';

let base = process.env.UD_APP_URL;
if (!base) {
  server = spawn('python3', ['-m', 'http.server', '8765', '--bind', '127.0.0.1', '--directory', 'web'], { stdio: 'ignore' });
  base = 'http://127.0.0.1:8765/';
  await sleep(1200);
}

const browser = await chromium.launch();
const errors = [];
async function phone(name) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|fonts\.g/.test(m.text())) errors.push(`${name} console: ${m.text()}`); });
  page.setDefaultTimeout(20000);
  return page;
}
const shot = (p, n) => p.screenshot({ path: SHOTS + n + '.png', fullPage: false }).catch(() => {});
const tab = (p, t) => p.click(`#t-${t}`);
const step = async (label, fn) => { try { await fn(); ok(true, label); } catch (e) { ok(false, `${label} — ${e.message.split('\n')[0]}`); } };

const A = await phone('A'), B = await phone('B');
let code = '';
try {
  await step('A opens the app and starts a couple', async () => {
    await A.goto(base);
    await A.getByText('알림 없이 브라우저에서 쓰기').click();
    await A.getByRole('button', { name: '새로 시작하기' }).click();
    await A.fill('#n-me', ME); await A.fill('#n-pt', PT); await A.fill('#n-st', '2025-03-14');
    await A.click('#cf button[type=submit]');
    code = (await A.locator('.invite .bigcode').innerText({ timeout: 20000 })).trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('no invite code: ' + code);
    await shot(A, '01-A-home-invite');
  });

  await step('B opens the invite link and joins', async () => {
    await B.goto(base + '?join=' + code);
    await B.getByText('알림 없이 브라우저에서 쓰기').click();
    if ((await B.inputValue('#j-code')) !== code) throw new Error('code not prefilled');
    await B.getByRole('button', { name: '연결하기' }).click();
    await B.locator('.hero').filter({ hasText: ME }).waitFor();
    await shot(B, '02-B-home');
  });

  await step('A sees that B joined (invite card goes away)', async () => {
    await A.locator('.invite').waitFor({ state: 'detached', timeout: 20000 });
  });

  await step('B shares a mood, A sees it live', async () => {
    await B.click('.mchip[data-v=miss]');
    await A.locator('.mrow').filter({ hasText: PT }).filter({ hasText: '보고 싶어' }).waitFor();
    await B.fill('#mood-note', '오늘 너무 보고 싶다');
    await B.click('#mnf button[type=submit]');
    await A.locator('.mrow').filter({ hasText: '오늘 너무 보고 싶다' }).waitFor();
    await shot(A, '03-A-mood');
  });

  await step('the question opens only after both answer', async () => {
    await tab(A, 'q'); await A.fill('#ans', 'A가 쓴 답이에요'); await A.click('[data-act=save-ans]');
    await tab(B, 'q');
    await B.locator('.lock').filter({ hasText: '답했어요' }).waitFor();
    if (await B.locator('.bub', { hasText: 'A가 쓴 답이에요' }).count()) throw new Error('answer visible too early');
    await B.fill('#ans', 'B가 쓴 답이에요'); await B.click('[data-act=save-ans]');
    await B.locator('.bub', { hasText: 'A가 쓴 답이에요' }).waitFor();
    await A.locator('.bub', { hasText: 'B가 쓴 답이에요' }).waitFor();
    await shot(B, '04-B-question');
  });

  await step('A uploads a photo, B sees it as new and opens it', async () => {
    await tab(A, 'ph');
    const png = await A.evaluate(async () => { const c = document.createElement('canvas'); c.width = 320; c.height = 240; const g = c.getContext('2d'); g.fillStyle = '#ff6f98'; g.fillRect(0, 0, 320, 240); g.fillStyle = '#fff'; g.font = '40px sans-serif'; g.fillText('우리 둘', 90, 135); return c.toDataURL('image/png').split(',')[1]; });
    await A.setInputFiles('#file', { name: 'test.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await A.locator('[data-act=seg][data-v=out]').click();
    await A.locator('.tile').first().waitFor();
    await tab(B, 'ph');
    await B.locator('.tile .tb', { hasText: 'NEW' }).first().waitFor();
    await B.locator('.tile').first().click();
    await B.waitForFunction(() => { const i = document.querySelector('.ov .pic img'); return i && i.complete && i.naturalWidth > 0; });
    await shot(B, '05-B-photo');
    await B.click('[data-act=close]');
  });

  await step('A plans a date, B sees the countdown', async () => {
    await tab(A, 'home');
    await A.click('[data-act=ev-new]');
    await A.fill('#e-title', '테스트 데이트'); await A.fill('#e-date', ymdKST(3));
    await A.click('#ef button[type=submit]');
    await tab(B, 'home');
    await B.locator('.nd-t', { hasText: '테스트 데이트' }).waitFor();
    await B.locator('.di').waitFor();
    await shot(B, '06-B-next-date');
  });

  await step('a letter stays sealed until its day, one for today opens', async () => {
    await tab(A, 'mem'); await A.click('[data-act=mem-tab][data-v=lt]');
    await A.click('[data-act=l-new]');
    await A.fill('#l-title', '미래 편지'); await A.fill('#l-text', '사흘 뒤에 읽어 줘'); await A.fill('#l-open', ymdKST(3));
    await A.click('#lf button[type=submit]');
    await A.click('[data-act=l-new]');
    await A.fill('#l-title', '오늘 편지'); await A.fill('#l-text', '오늘 읽는 편지야');
    await A.click('#lf button[type=submit]');
    await tab(B, 'mem'); await B.click('[data-act=mem-tab][data-v=lt]');
    await B.locator('.env.sealed', { hasText: '미래 편지' }).waitFor();
    await B.locator('.env.sealed', { hasText: '미래 편지' }).click();
    if (await B.locator('.paper').count()) throw new Error('sealed letter opened');
    await B.locator('.env', { hasText: '오늘 편지' }).click();
    await B.locator('.paper', { hasText: '오늘 읽는 편지야' }).waitFor();
    await shot(B, '07-B-letter');
    await B.click('[data-act=l-close]');
    await A.locator('.env', { hasText: '오늘 편지' }).filter({ hasText: '읽었어요' }).waitFor();
  });

  await step('the roulette picks something', async () => {
    await B.click('[data-act=mem-tab][data-v=bk]');
    await B.click('[data-act=roul-spin]');
    await B.locator('.rbox.hit').waitFor();
    await shot(B, '08-B-roulette');
  });

  await step('after a reload B is still signed in with everything there', async () => {
    await B.reload();
    await B.locator('.hero').filter({ hasText: ME }).waitFor();
    await tab(B, 'q');
    await B.locator('.bub', { hasText: 'A가 쓴 답이에요' }).waitFor();
  });

  await step('A deletes the photo', async () => {
    await tab(A, 'ph'); await A.locator('[data-act=seg][data-v=out]').click();
    await A.locator('.tile').first().click(); await A.click('[data-act=del]'); await A.click('[data-act=del-yes]');
    await A.locator('.tile').waitFor({ state: 'detached' });
  });
} finally {
  const uids = [];
  for (const p of [A, B]) { try { const s = await p.evaluate(() => localStorage.getItem('ud-auth')); const u = s && JSON.parse(s).user; if (u) uids.push(u.id); } catch (e) {} }
  if (REF) {
    await sql(REF, `delete from public.couples where id in (select couple_id from public.docs where coll = 'couple' and data->'me'->>'name' = '${ME}')`).catch(e => console.error('cleanup', e.message));
    const ids = uids.filter(u => /^[0-9a-f-]{36}$/.test(u)).map(u => `'${u}'`).join(',');
    if (ids) await sql(REF, `delete from auth.users where id in (${ids})`).catch(e => console.error('cleanup', e.message));
  }
  await browser.close();
  if (server) server.kill();
}
ok(!errors.length, 'no script errors in either phone' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
console.log(failed ? `\n${failed} check(s) failed` : '\nall app checks passed');
process.exit(failed ? 1 : 0);
