// Draws the two characters at every stage (and facing left) as PNGs for the yard widget.
// They come from charSVG() in web/index.html, so run this again after changing how the characters look.
// Usage: node scripts/render-chars.mjs   → web/widget/char-{me,partner}-{0..8}[-l].png
import { chromium } from 'playwright';
import fs from 'fs';

const html = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const start = html.indexOf('function charSVG(w, st) {');
const end = html.indexOf('\n}\n', start) + 2;
const charSVG = new Function(`${html.slice(start, end)}; return charSVG;`)();
const outDir = new URL('../web/widget/', import.meta.url).pathname;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 240, height: 240 }, deviceScaleFactor: 1 });
for (const w of ['me', 'partner']) for (let st = 0; st <= 8; st++) for (const flip of [false, true]) {
  const svg = charSVG(w, st).replace('<svg ', `<svg width="240" height="240" style="overflow:visible;${flip ? 'transform:scaleX(-1)' : ''}" `);
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await p.screenshot({ path: `${outDir}char-${w}-${st}${flip ? '-l' : ''}.png`, omitBackground: true, clip: { x: 0, y: 0, width: 240, height: 240 } });
}
await b.close();
console.log('drew 36 character images');
