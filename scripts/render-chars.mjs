// Draws the two characters at every stage (and facing left), and every yard thing, as PNGs for the yard widget.
// They come from charSVG() in web/index.html and web/art.js, so run this again after changing how they look.
// Usage: node scripts/render-chars.mjs   → web/widget/char-{me,partner}-{0..8}[-l].png, web/widget/item-<k>[-l].png
import { chromium } from 'playwright';
import fs from 'fs';

const html = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const start = html.indexOf('function charSVG(w, st, mood) {');
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
// yard things: 128px, animal friends also facing the other way
const art = fs.readFileSync(new URL('../web/art.js', import.meta.url), 'utf8');
await p.setViewportSize({ width: 128, height: 128 });
await p.setContent(`<html><body style="margin:0;background:transparent"><div id=b></div><script>${art}</script></body></html>`);
const shop = html.slice(html.indexOf('const SHOP = ['), html.indexOf('];', html.indexOf('const SHOP = [')));
const pets = new Set([...shop.matchAll(/\['(\w+)', '[^']+', '[^']+', \d+, \d+, '(walk|fly)'\]/g)].map(m => m[1]));
const keys = await p.evaluate(() => Object.keys(window.ART));
let n = 0;
for (const k of keys) for (const flip of pets.has(k) ? [false, true] : [false]) {
  await p.evaluate(([k, flip]) => { document.getElementById('b').innerHTML = window.artSVG(k, 128).replace('<svg ', `<svg style="display:block;overflow:visible;${flip ? 'transform:scaleX(-1)' : ''}" `); }, [k, flip]);
  await p.screenshot({ path: `${outDir}item-${k}${flip ? '-l' : ''}.png`, omitBackground: true, clip: { x: 0, y: 0, width: 128, height: 128 } });
  n++;
}
await b.close();
console.log(`drew 36 character images and ${n} yard things`);
