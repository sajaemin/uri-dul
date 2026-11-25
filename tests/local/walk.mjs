// Walks through every real-mode screen with the mock backend and saves phone-size screenshots.
// Usage: node tests/local/walk.mjs [outDir]   (needs playwright)
import { chromium, devices } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const root = path.resolve(new URL('../../web', import.meta.url).pathname);
const mock = fs.readFileSync(new URL('./mock-backend.js', import.meta.url));
const out = process.argv[2] || '/tmp/walk';
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if (u.endsWith('/backend.js')) { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(mock); }
  if (u.endsWith('/config.js')) { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end("window.UD_CONFIG = {url: 'https://example.supabase.co', key: 'x'};"); }
  const f = path.join(root, u === '/' ? 'index.html' : u);
  if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
}).listen(8790);

const b = await chromium.launch();
const errors = [];
let n = 0;
async function phone(standalone) {
  const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  if (standalone) await ctx.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  p.setDefaultTimeout(6000);
  return p;
}
const shot = async (p, name, full = true) => { await p.waitForTimeout(350); await p.screenshot({ path: `${out}/${String(++n).padStart(2, '0')}-${name}.png`, fullPage: full }); };
const visible = async (p, sel) => p.locator(sel).first().isVisible().catch(() => false);
const report = [];
const note = (k, v) => { report.push(`${k}: ${v}`); };

// Safari tab (not added to the home screen)
let p = await phone(false);
await p.goto('http://127.0.0.1:8790/?join=K7QM2D');
await shot(p, 'safari-invite-gate');
note('tabs on install gate', await visible(p, 'nav.tabs'));
await p.getByText('알림 없이 브라우저에서 쓰기').click();
await p.locator('#jf').waitFor();
await shot(p, 'pair');
note('tabs on pair', await visible(p, 'nav.tabs'));

// standalone, new couple
p = await phone(true);
await p.goto('http://127.0.0.1:8790/');
await p.getByRole('button', { name: '새로 시작하기' }).click();
await p.locator('#cf').waitFor();
await shot(p, 'setup-form');
note('tabs on setup', await visible(p, 'nav.tabs'));
note('gear on setup', await visible(p, '#t-us'));
await p.fill('#n-me', '재민'); await p.fill('#n-pt', '은지'); await p.fill('#n-st', '2025-03-14');
await p.click('#cf button[type=submit]');
await p.locator('.invite').waitFor();
await shot(p, 'home-waiting-for-partner');
for (const t of ['q', 'cal', 'mem', 'ph', 'us']) { await p.click('#t-' + t); await shot(p, 'tab-' + t + '-alone'); }
// partner joins
await p.evaluate(() => { window.UDB.partnerJoins(); });
await p.reload();
await p.click('#t-home');
await shot(p, 'home-paired');
await p.click('#t-us'); await shot(p, 'settings-paired');
await b.close(); srv.close();
fs.writeFileSync(`${out}/report.txt`, report.join('\n') + '\nerrors: ' + JSON.stringify(errors) + '\n');
console.log(report.join('\n')); console.log('errors:', errors);
