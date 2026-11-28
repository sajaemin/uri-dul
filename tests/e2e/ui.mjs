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
  page.on('console', m => { if (m.type() === 'error' && current !== 'cleanup' && !/favicon|fonts\.g/.test(m.text())) errors.push(`${name} console: ${m.text()}`); });
  page.on('response', r => { if (r.status() >= 400 && current !== 'cleanup') errors.push(`${name} got ${r.status()} for ${r.url().replace(/token=[^&]+/, 'token=…').slice(0, 160)} (step: ${current})`); });
  page.setDefaultTimeout(20000);
  return page;
}
const shot = (p, n) => p.screenshot({ path: SHOTS + n + '.png', fullPage: false }).catch(() => {});
const tab = async (p, t) => { if (t === 'q') { await p.click('#t-mem'); await p.click('[data-act=mem-tab][data-v=q]'); } else await p.click(`#t-${t}`); };
let nfail = 0;
let current = 'start';
const step = async (label, fn) => { current = label; try { await fn(); ok(true, label); } catch (e) { ok(false, `${label} — ${e.message.split('\n')[0]} ${(e.message.split('\n').find(l => /waiting for|locator\(/.test(l)) || '').trim().slice(0, 200)}`); nfail++; await shot(A, `fail-${nfail}-A`); await shot(B, `fail-${nfail}-B`); } };

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

  await step('the mood calendar shows both moods for today', async () => {
    await A.click('.mchip[data-v=happy]');
    await A.click('[data-act=mcal-open]');
    await A.locator('.mc.today .mce', { hasText: '🥺' }).filter({ hasText: '😊' }).waitFor();
    await shot(A, '03b-A-mood-calendar');
    await A.click('[data-act=mcal-close]');
  });

  await step('a swapped question changes on both phones, once a day', async () => {
    await tab(A, 'q'); await tab(B, 'q');
    const before = await B.locator('.q').first().innerText();
    await A.click('[data-act=q-swap]');
    await A.locator('.qsw').waitFor();
    const after = await A.locator('.q').first().innerText();
    if (after === before) throw new Error('question did not change');
    await B.locator('.q', { hasText: after }).waitFor();
    await B.locator('.qsw').waitFor();
    if (await B.locator('[data-act=q-swap]').count()) throw new Error('could swap twice');
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
    await tab(A, 'grow'); await tab(B, 'grow');
    await B.locator('.hlist li.done', { hasText: '오늘의 질문 답하기' }).waitFor();
    await B.locator('.hlist li.done', { hasText: '둘 다 답하면 보너스' }).waitFor();
    await A.locator('.hlist li.done', { hasText: '둘 다 답하면 보너스' }).waitFor();
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

  await step('a decorated letter arrives as written, and B replies', async () => {
    await tab(A, 'mem'); await A.click('[data-act=mem-tab][data-v=lt]');
    await A.click('[data-act=l-new]');
    await A.click('[data-act=l-paper][data-v=mint]'); await A.click('[data-act=l-ink][data-v=blue]');
    await A.click('[data-act=l-stk][data-v="🍓"]'); await A.click('[data-act=l-stk][data-v="🐰"]');
    await A.fill('#l-title', '꾸민 편지'); await A.fill('#l-text', '스티커 붙인 편지야');
    await A.click('#lf button[type=submit]');
    await B.locator('.env', { hasText: '꾸민 편지' }).click();
    await B.locator('.paper.pp-mint .lstk', { hasText: '🍓' }).waitFor();
    await B.locator('.paper.pp-mint .lstk', { hasText: '🐰' }).waitFor();
    await shot(B, '07b-B-decorated-letter');
    await B.click('[data-act=l-reply]');
    await B.fill('#l-text', '답장이야');
    await B.click('#lf button[type=submit]');
    await A.locator('.env', { hasText: 'Re: 꾸민 편지' }).filter({ hasText: '답장' }).waitFor();
  });

  await step('the roulette picks something', async () => {
    await B.click('[data-act=mem-tab][data-v=bk]');
    await B.click('[data-act=roul-spin]');
    await B.locator('.rbox.hit').waitFor();
    await shot(B, '08-B-roulette');
  });

  await step('a memory from a year ago shows on home; stars and 또 갈래 make it a 단골', async () => {
    const d = new Date(Date.now() + 9 * 3600e3); d.setUTCFullYear(d.getUTCFullYear() - 1); const yago = d.toISOString().slice(0, 10);
    await tab(A, 'mem'); await A.click('[data-act=mem-tab][data-v=tl]');
    await A.click('[data-act=mem-new]');
    await A.fill('#m-title', '1년 전 테스트 추억'); await A.fill('#m-date', yago); await A.fill('#m-place', '연남동 테스트카페');
    await A.click('#mf button[type=submit]');
    await tab(B, 'home');
    await B.locator('.otd', { hasText: '1년 전 테스트 추억' }).waitFor();
    await shot(B, '09-B-on-this-day');
    const card = p => p.locator('article.mem', { hasText: '1년 전 테스트 추억' });
    await tab(A, 'mem'); await A.click('[data-act=mem-tab][data-v=tl]');
    await card(A).locator('[data-act=mem-rate]').nth(4).click();
    await card(A).locator('[data-act=mem-again]').click();
    await tab(B, 'mem'); await B.click('[data-act=mem-tab][data-v=tl]');
    await card(B).locator('.agt').waitFor();
    await card(B).locator('[data-act=mem-again]').click();
    await card(B).locator('.mr-both').waitFor();
    await B.click('[data-act=mem-tab][data-v=map]');
    await B.locator('.regs li', { hasText: '연남동 테스트카페' }).filter({ hasText: '둘 다 또 갈래' }).waitFor();
    await shot(B, '10-B-regulars');
    await A.click('[data-act=mem-tab][data-v=map]');
    await A.locator('.regs li', { hasText: '★ 5.0' }).waitFor();
  });

  await step('comments: A comments on a memory and B on a date; each sees the other\'s', async () => {
    await tab(A, 'mem'); await A.click('[data-act=mem-tab][data-v=tl]');
    const card = p => p.locator('article.mem', { hasText: '1년 전 테스트 추억' });
    await card(A).locator('[data-act=cmt-open]').click();
    await card(A).locator('[data-cref]').fill('여기 또 가자');
    await card(A).locator('[data-act=cmt-send]').click();
    await tab(B, 'mem'); await B.click('[data-act=mem-tab][data-v=tl]');
    await card(B).locator('.cmt-t', { hasText: '여기 또 가자' }).waitFor();
    await tab(B, 'home');
    await B.locator('#view [data-act=ev-edit]').first().click();
    await B.locator('#ef [data-cref]').fill('몇 시에 만나?');
    await B.locator('#ef [data-cref]').press('Enter');
    await B.locator('#ef .cmt.me', { hasText: '몇 시에 만나?' }).waitFor();
    await B.click('[data-act=sheet-close]');
    await tab(A, 'home');
    await A.locator('#view [data-act=ev-edit]').first().click();
    await A.locator('#ef .cmt', { hasText: '몇 시에 만나?' }).waitFor();
    await shot(A, '10b-A-comments');
    await A.click('[data-act=sheet-close]');
  });

  await step('A buys a tulip with hearts; it shows up in B\'s yard', async () => {
    await tab(A, 'grow');
    await A.locator('.yard .cr[data-w=me]').waitFor();
    await A.click('[data-act=shop-open]');
    const before = await A.locator('.wallet b').innerText();
    await A.click('[data-act=shop-buy][data-v=tulip]');
    await A.locator('.wallet b').filter({ hasNotText: before }).waitFor();
    await A.click('[data-act=shop-close]');
    await tab(B, 'grow');
    await B.locator('.yard .yi[title="튤립"]').waitFor();
    await shot(B, '11-B-yard');
  });

  await step('A feeds B\'s character; B sees who fed it', async () => {
    await tab(A, 'grow');
    await A.locator('.gcol:not(.mine) [data-act=feed-open]').click();
    await A.click('[data-act=feed-buy][data-v=rice]');
    await tab(B, 'grow');
    await B.locator('.gcol.mine', { hasText: '주먹밥 줬어요' }).waitFor();
    await shot(B, '11b-B-fed');
  });

  await step('B copies the widget code and the widget shows today', async () => {
    await B.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(base).origin });
    await B.click('#t-us');
    await B.click('[data-act=wg-copy]');
    const code = await B.evaluate(() => navigator.clipboard.readText());
    const m = code.match(/const API = '([^']+)'/);
    if (!m || !code.includes('ListWidget')) throw new Error('clipboard has no widget script');
    if (code.includes('__APP_URL__')) throw new Error('app address missing from the widget script');
    const j = await (await fetch(m[1])).json();
    if (!j.ready || j.me !== PT || j.partner !== ME || !j.next || j.next.title !== '테스트 데이트') throw new Error('widget data: ' + JSON.stringify(j).slice(0, 200));
    if (!Array.isArray(j.upcoming) || !j.upcoming.length || !j.progress || typeof j.progress.pct !== 'number') throw new Error('widget extras missing: ' + JSON.stringify(j).slice(0, 300));
    const app = code.match(/const APP = '([^']+)'/)[1];
    if ((await fetch(app + 'widget/duo.png')).status !== 200) throw new Error('widget picture not served at ' + app);
    const y = j.yard;
    if (!y || !Array.isArray(y.chars) || y.chars.length !== 2 || !y.items.some(it => it.e === '🌷')) throw new Error('yard widget data: ' + JSON.stringify(y).slice(0, 300));
    if ((await fetch(app + `widget/char-${y.chars[0].role}-${y.chars[0].stage}.png`)).status !== 200) throw new Error('character picture not served');
    await shot(B, '09-B-widget-card');
  });

  await step('after a reload B is still signed in with everything there', async () => {
    if (!(await B.evaluate(() => !!navigator.serviceWorker && !!navigator.serviceWorker.controller))) await B.reload();
    await B.reload();
    if (!(await B.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller)))) throw new Error('the service worker is not running');
    await B.locator('#t-home').waitFor();
    await tab(B, 'home');
    await B.locator('.hero').filter({ hasText: ME }).waitFor();
    await tab(B, 'q');
    await B.locator('.bub', { hasText: 'A가 쓴 답이에요' }).waitFor();
  });

  await step('A deletes the photo', async () => {
    await tab(A, 'ph'); await A.locator('[data-act=seg][data-v=out]').click();
    await A.locator('.tile').first().click(); await A.click('[data-act=del]'); await A.click('[data-act=del-yes]');
    await A.locator('.tile').waitFor({ state: 'detached' });
    await tab(B, 'home'); await B.locator('.dphoto').waitFor({ state: 'detached' });
    await A.waitForTimeout(6000); // the file itself is removed a few seconds after the record
  });
} finally {
  current = 'cleanup'; // the test couple is deleted now; the phones may still react to that
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
