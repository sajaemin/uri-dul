// Presses every button on every screen (mock backend, filled with sample data) on two phone sizes,
// light and dark. Reports script errors, sideways scrolling, unescaped markup and anything that
// throws. Usage: node tests/local/explore.mjs [outDir]
import { chromium, devices } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const root = path.resolve(new URL('../../web', import.meta.url).pathname);
const mock = fs.readFileSync(new URL('./mock-backend.js', import.meta.url));
const out = process.argv[2] || '/tmp/explore';
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if (u.endsWith('/backend.js')) { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(mock); }
  if (u.endsWith('/config.js')) { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end("window.UD_CONFIG = {url: 'https://example.supabase.co', key: 'x'};"); }
  const f = path.join(root, u === '/' ? 'index.html' : u);
  if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
}).listen(8791);

const kst = n => new Date(Date.now() + 9 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const XSS = '<img src=x onerror="window.__xss=1">';
const yago = (() => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCFullYear(d.getUTCFullYear() - 1); return d.toISOString().slice(0, 10); })();
const docs = {
  'couple/main': { autoAnniv: true, me: { name: '재민', birthday: '1997-05-21' }, partner: { name: '은지', birthday: '1998-11-28' }, start: '2025-03-14' },
  'events/e1': { alerts: [1, 0], at: 1, by: 'me', date: kst(2), endDate: '', kind: 'date', memo: '은지가 찾아둔 브런치 카페', place: '성수동', repeat: 'none', time: '14:00', title: '성수 카페 데이트', who: 'both' },
  'events/e2': { alerts: [7, 0], at: 2, by: 'me', date: '2025-06-07', endDate: '', kind: 'anniv', memo: '', place: '부산', repeat: 'yearly', time: '', title: '첫 여행', who: 'both' },
  'events/e3': { alerts: [], at: 3, by: 'partner', date: kst(-1), endDate: '', kind: 'plan', memo: XSS, place: '', repeat: 'weekly', time: '19:30', title: '필라테스 ' + XSS, who: 'partner' },
  'events/e4': { alerts: [7, 1], at: 4, by: 'me', date: kst(40), endDate: kst(42), kind: 'date', memo: 'KTX 예매하기', place: '강릉', repeat: 'none', time: '09:00', title: '아주아주아주 긴 제목의 강릉 바다 여행 일출 보고 회 먹기', who: 'both' },
  'memories/m1': { at: 1741900000000, bucketId: '', by: 'partner', date: '2025-03-14', eventId: '', geo: '', photos: [], place: '합정 카페', text: '어색하게 웃던 재민이 ' + XSS, title: '처음 만난 날' },
  'memories/m2': { at: 1749200000000, bucketId: '', by: 'me', date: '2025-06-07', eventId: '', geo: '', photos: [], place: '부산 해운대', text: '바다에 해 지는 거 끝까지 봤다', title: '첫 여행' },
  'memories/m3': { at: 1764100000000, bucketId: '', by: 'me', date: yago, eventId: '', geo: '', photos: [], place: '합정  카페', text: '두 번째로 간 날 ' + XSS, title: '단골 카페 ' + XSS, rate_partner: 5, again_partner: true, rate_me: 4 },
  [`answers/${yago}_me`]: { date: yago, text: '붕어빵 ' + XSS, at: 7 },
  [`answers/${yago}_partner`]: { date: yago, text: '호떡', at: 8 },
  'bucket/b1': { at: 1, by: 'partner', done: true, doneAt: '2026-04-26', eventId: '', memoryId: '', title: '한강 피크닉' },
  'bucket/b2': { at: 2, by: 'me', done: false, doneAt: '', eventId: '', memoryId: '', title: '강릉 바다 일출 보기 ' + XSS },
  [`answers/${kst(-1)}_me`]: { date: kst(-1), text: '떡볶이!', at: 1 },
  [`answers/${kst(-1)}_partner`]: { date: kst(-1), text: '마라탕 ' + XSS, at: 2 },
  [`answers/${kst(0)}_partner`]: { date: kst(0), text: '오늘은 내가 먼저', at: 3 },
  [`moods/${kst(0)}_partner`]: { date: kst(0), who: 'partner', m: 'miss', note: '주말까지 ' + XSS, at: 4 },
  'letters/l1': { from: 'partner', title: '700일에 열어 봐', text: '사랑해', openAt: kst(30), at: 5, readAt: 0 },
  'letters/l2': { from: 'partner', title: XSS, text: '오늘 고마웠어 ' + XSS, openAt: kst(0), at: 6, readAt: 0, paper: 'sky', ink: 'blue', stickers: [{ e: '🐻', x: 88, y: 10, r: 12 }, { e: '🌙', x: 10, y: 90, r: -8 }, { e: XSS, x: 50, y: 50, r: 0 }] },
  'photos/p1': { from: 'partner', url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23ffb3c9'/%3E%3Cstop offset='1' stop-color='%23ffe3a3'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='300' height='300' fill='url(%23g)'/%3E%3Ccircle cx='220' cy='80' r='34' fill='%23fff7c2'/%3E%3Cpath d='M0 230Q80 170 150 215T300 200V300H0z' fill='%23a8e6cf'/%3E%3C/svg%3E", at: Date.now() - 40 * 864e5, note: '', savedBy: {} },
  'yard/y1': { k: 'tree', e: '🌳', name: '나무', price: 60, cat: 'flower', placed: true, x: 18, y: 38, by: 'partner', at: 1764000000000 },
  'yard/y2': { k: 'dog', e: '🐶', name: '강아지', price: 150, cat: 'pet', placed: true, x: 78, y: 84, by: 'partner', at: 1764000000001 },
  'yard/y3': { k: 'cloud', e: '☁️', name: '구름', price: 20, cat: 'sky', placed: true, x: 70, y: 8, by: 'me', at: 1764000000002 },
  'yard/y4': { k: 'tulip', e: '🌷', name: '튤립', price: 20, cat: 'flower', placed: false, x: 0, y: 0, by: 'me', at: 1764000000003 },
  'yard/y5': { k: 'nope', e: XSS, name: XSS, price: 5, cat: 'flower', placed: true, x: 40, y: 80, by: 'me', at: 1764000000004 },
  'yard/y6': { k: 'house', e: '🏡', name: '우리 집', price: 300, cat: 'home', placed: true, x: 76, y: 40, by: 'partner', at: 1764000000006 },
  'yard/y7': { k: 'sunf', e: '🌻', name: '해바라기', price: 25, cat: 'flower', placed: true, x: 30, y: 88, by: 'partner', at: 1764000000007 },
  'yard/y8': { k: 'fountain', e: '⛲', name: '분수', price: 200, cat: 'home', placed: true, x: 50, y: 56, by: 'partner', at: 1764000000008 },
  'yard/t1': { k: 'th_sakura', e: '🎨', name: '벚꽃 동산', price: 150, cat: 'theme', placed: false, x: 0, y: 0, by: 'partner', at: 1764000000005 },
  'letters/l3': { from: 'me', title: 'Re: 답장', text: '나도 고마워', openAt: kst(0), at: 7, readAt: 0, paper: 'lilac', ink: 'violet', stickers: [{ e: '💗', x: 90, y: 88, r: 5 }], replyTo: 'l2' },
  ...Object.fromEntries([2, 3, 4, 5, 6, 8, 9, 11, 12, 15].flatMap((n, i) => [[`moods/${kst(-n)}_me`, { date: kst(-n), who: 'me', m: ['happy', 'love', 'tired', 'calm', 'happy', 'busy', 'miss', 'happy', 'sad', 'love'][i], note: i === 2 ? '야근 ' + XSS : '', at: 10 + i }], [`moods/${kst(-n)}_partner`, { date: kst(-n), who: 'partner', m: ['happy', 'love', 'calm', 'calm', 'grr', 'busy', 'miss', 'love', 'sad', 'love'][i], note: '', at: 30 + i }]])),
  'pokes/latest': { from: 'partner', at: Date.now() - 60000 },
};
const seed = { info: { couple_id: 'c1', code: 'K7QM2D', role: 'me', rc: 'RCAB12CD', partner_joined: true }, docs };

const SKIP = new Set(['reload', 'tab', 'who', 'invite-share', 'rc-share', 'push-on', 'push-off', 'push-test', 'gate-browser', 'copy-url']);
const b = await chromium.launch();
const problems = [];
const say = (k, m) => { problems.push(`[${k}] ${m}`); };

async function run(label, device, scheme, look) {
  const ctx = await b.newContext({ ...device, locale: 'ko-KR', timezoneId: 'Asia/Seoul', colorScheme: scheme });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8791' });
  await ctx.addInitScript(([s, look]) => {
    Object.defineProperty(navigator, 'standalone', { get: () => true });
    if (!localStorage.getItem('mock-udb')) { localStorage.setItem('mock-udb', JSON.stringify(s)); localStorage.setItem('ud-look', look); }
    window.alert = window.confirm = window.prompt = () => { window.__dialog = 1; };
  }, [seed, look]);
  const p = await ctx.newPage();
  p.on('pageerror', e => say(label, 'script error: ' + e.message));
  p.setDefaultTimeout(4000);
  await p.goto('http://127.0.0.1:8791/');
  await p.locator('#t-home').waitFor({ state: 'visible' });
  const check = async (where) => {
    const r = await p.evaluate(() => ({ w: document.documentElement.scrollWidth, iw: innerWidth, xss: window.__xss, dlg: window.__dialog,
      wide: [...document.querySelectorAll('#view *')].filter(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > innerWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('[style*="overflow"],.mstrip,.rtrack,.kmap,.chips,.seg,.cal'); }).slice(0, 3).map(e => e.tagName + '.' + e.className + ' "' + (e.textContent || '').trim().slice(0, 30) + '"') }));
    if (r.w > r.iw + 1) say(label, `${where}: page scrolls sideways (${r.w} > ${r.iw}) ${r.wide.join(' | ')}`);
    if (r.xss) say(label, `${where}: markup from data ran (XSS)`);
    if (r.dlg) say(label, `${where}: a dialog opened`);
  };
  const tabs = ['home', 'q', 'cal', 'mem', 'ph', 'us'];
  for (const t of tabs) {
    await p.click('#t-' + t);
    await p.waitForTimeout(250);
    await p.screenshot({ path: `${out}/${label}-${t}.png`, fullPage: !process.env.VIEWPORT });
    if (t === 'mem') { // the map tab holds 우리 단골
      await p.click('[data-act=mem-tab][data-v=map]'); await p.waitForTimeout(200);
      await p.screenshot({ path: `${out}/${label}-mem-map.png`, fullPage: !process.env.VIEWPORT });
      if (!process.env.SHOTS_ONLY) await check('mem-map');
      await p.click('[data-act=mem-tab][data-v=tl]'); await p.waitForTimeout(200);
      await p.evaluate(() => document.querySelectorAll('nav.tabs,.toast').forEach(e => { e.style.visibility = 'hidden'; }));
      await p.locator('article.mem').first().screenshot({ path: `${out}/${label}-mem-card.png` }).catch(() => {});
      await p.evaluate(() => document.querySelectorAll('nav.tabs,.toast').forEach(e => { e.style.visibility = ''; }));
    }
    if (process.env.SHOTS_ONLY) continue;
    await check(t);
    // press every button on this screen once
    const acts = await p.$$eval('#view [data-act]', els => els.filter(e => e.offsetParent !== null).map((e, i) => ({ i, act: e.dataset.act, v: e.dataset.v || '' })));
    const seen = new Set();
    for (const a of acts) {
      const key = a.act + ':' + (['cal-day', 'open', 'mem-from', 'l-read', 'map-pin'].includes(a.act) ? '' : a.v);
      if (SKIP.has(a.act) || seen.has(key)) continue;
      seen.add(key);
      const sel = `#view [data-act="${a.act}"]${a.v ? `[data-v="${a.v.replace(/"/g, '\\"')}"]` : ''}`;
      try {
        const el = p.locator(sel).first();
        if (!(await el.isVisible())) continue;
        await el.click({ timeout: 1500, force: a.act === 'cr-tap' }); if (a.act === 'di-open') await p.waitForTimeout(900);
        await p.waitForTimeout(150);
        await check(`${t} → ${a.act}${a.v ? '(' + a.v + ')' : ''}`);
        // look at overlays briefly, then close them
        if (await p.locator('#ov > *').count()) {
          const ovs = await p.$$eval('#ov [data-act]', els => els.filter(e => e.offsetParent !== null).map(e => e.dataset.act));
          for (const oa of ovs) if (['next', 'prev', 'rc-next', 'rc-prev', 'l-when', 'm-pick', 'map-view'].includes(oa)) { await p.locator(`#ov [data-act="${oa}"]`).first().click({ timeout: 800 }).catch(() => {}); }
          await p.screenshot({ path: `${out}/${label}-${t}-ov-${a.act}.png` });
          await check(`${t} → ${a.act} (overlay)`);
        }
      } catch (e) { const why = (e.message.split('\n').find(l => /intercepts|not visible|outside of the viewport|not stable/.test(l)) || '').trim(); say(label, `${t} → ${a.act}: ${e.message.split('\n')[0]} ${why}`); }
      await p.keyboard.press('Escape');
      for (const c of ['sheet-close', 'msheet-close', 'close', 'l-close', 'l-cancel', 'rc-close', 'rc-img-close', 'mcal-close', 'shop-close']) { const x = p.locator(`#ov [data-act="${c}"]`).first(); if (await x.isVisible().catch(() => false)) await x.click({ timeout: 800 }).catch(() => {}); }
      if ((await p.locator('#t-' + t).getAttribute('aria-current').catch(() => null)) !== 'page') await p.click('#t-' + t).catch(() => {});
    }
  }
  if (process.env.SHOTS_ONLY) { await ctx.close(); return; }
  // empty forms: nothing should throw
  await p.click('#t-cal'); await p.click('#view [data-act="ev-new"]').catch(() => {}); await p.locator('#e-title').fill('').catch(() => {}); await p.click('#ef button[type=submit]').catch(() => {}); await check('empty event form'); await p.keyboard.press('Escape');
  await p.click('#t-q'); await p.click('[data-act=save-ans]').catch(() => {}); await check('empty answer');
  await p.click('#t-home'); await p.click('#mnf button[type=submit]').catch(() => {}); await check('empty mood note');
  // a photo through the real upload path
  await p.click('#t-ph');
  const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; const g = c.getContext('2d'); g.fillStyle = '#7fd19b'; g.fillRect(0, 0, 640, 480); return c.toDataURL('image/png').split(',')[1]; });
  await p.setInputFiles('#file', { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }).catch(e => say(label, 'upload: ' + e.message));
  await p.waitForTimeout(800); await check('after upload');

  if (process.env.SHOTS_EXTRA) { // a look at screens that only open on a tap
    const shot = async n => { await p.waitForTimeout(300); await p.screenshot({ path: `${out}/${label}-x-${n}.png` }); };
    await p.keyboard.press('Escape'); await p.keyboard.press('Escape');
    await p.click('#t-home'); await p.click('[data-act=mcal-open]'); await shot('mcal'); await p.keyboard.press('Escape');
    // a year of both answering (the character's last stage), and nobody has answered today yet
    await p.evaluate(([t0]) => { const st = JSON.parse(localStorage.getItem('mock-udb')); for (const k of Object.keys(st.docs)) if (k.startsWith('answers/' + t0)) delete st.docs[k];
      for (let n = 1; n <= 370; n++) { const ds = new Date(Date.now() + 9 * 3600e3 - n * 864e5).toISOString().slice(0, 10); for (const w of ['me', 'partner']) st.docs[`answers/${ds}_${w}`] = st.docs[`answers/${ds}_${w}`] || { date: ds, text: '답', at: n }; }
      localStorage.setItem('mock-udb', JSON.stringify(st)); }, [kst(0)]);
    await p.reload(); await p.locator('#t-home').waitFor({ state: 'visible' }); await shot('stage8');
    await p.click('#t-q'); await p.waitForTimeout(2500); await shot('yard');
    await p.click('[data-act=shop-open]'); await shot('shop'); await p.click('[data-act=shop-cat][data-v=pet]'); await shot('shop-pet');
    await p.click('[data-act=shop-buy][data-v=chick]'); await p.waitForTimeout(300);
    await p.click('[data-act=shop-cat][data-v=theme]'); await shot('shop-theme'); await p.click('[data-act=theme-use][data-v=sakura]'); await p.keyboard.press('Escape'); await p.waitForTimeout(1500); await shot('yard-sakura');
    await p.click('[data-act=yedit]'); await p.locator('.yard.edit .yi').first().dragTo(p.locator('.yard.edit'), { targetPosition: { x: 60, y: 120 } }); await shot('yedit'); await p.click('[data-act=yedit]');
    await p.click('#t-q'); await shot('grow'); await p.locator('.qsw-b').scrollIntoViewIfNeeded(); await shot('qswap'); await p.click('.qsw-b'); await shot('qswapped');
    await p.click('#t-mem'); await p.click('[data-act=mem-tab][data-v=lt]'); await p.click('[data-act=l-new]');
    await p.click('[data-act=l-paper][data-v=butter]'); await p.click('[data-act=l-ink][data-v=straw]');
    for (const e of ['🍓', '🐰', '✨', '🎀']) await p.click(`[data-act=l-stk][data-v="${e}"]`);
    await p.fill('#l-text', '오늘도 고마워\n주말에 딸기 먹으러 가자');
    await p.locator('.lpaper').scrollIntoViewIfNeeded(); await shot('lsheet'); await p.keyboard.press('Escape');
    await p.click('[data-act=l-read][data-v=l2]'); await shot('lview'); await p.click('[data-act=l-reply]'); await shot('lreply'); await p.keyboard.press('Escape');
    await p.click('#t-us'); await p.locator('.ntog').scrollIntoViewIfNeeded(); await shot('ntog');
  }
  await ctx.close();
}

await run('13-light-cute', devices['iPhone 13'], 'light', 'cute');
if (!process.env.QUICK) await run('se-dark-cute', devices['iPhone SE'], 'dark', 'cute');
if (!process.env.QUICK) await run('15max-light', devices['iPhone 15 Pro Max'] || devices['iPhone 14 Pro Max'], 'light', 'cute');
await b.close(); srv.close();
const uniq = [...new Set(problems)];
fs.writeFileSync(`${out}/problems.txt`, uniq.join('\n') + '\n');
console.log(uniq.length ? uniq.join('\n') : 'no problems found');
console.log(`\n${uniq.length} problem(s)`);
process.exit(uniq.length ? 1 : 0);
