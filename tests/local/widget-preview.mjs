// Runs web/widget.scriptable.js against a small stand-in for Scriptable's widget API and draws the result as
// HTML, so the layouts can be looked at without an iPhone. It is an approximation of iOS, not iOS itself.
// Usage: node tests/local/widget-preview.mjs [out.png]
import { chromium } from 'playwright';
import fs from 'fs';

const src = fs.readFileSync(new URL('../../web/widget.scriptable.js', import.meta.url), 'utf8');
const duoPng = fs.readFileSync(new URL('../../web/widget/duo.png', import.meta.url)).toString('base64');
const coverPng = process.env.COVER ? fs.readFileSync(process.env.COVER).toString('base64') : null;
const out = process.argv[2] || '/tmp/widget-preview.png';
const CHARS = {}; for (const f of fs.readdirSync(new URL('../../web/widget/', import.meta.url))) if (f.startsWith('char-')) CHARS[f] = fs.readFileSync(new URL('../../web/widget/' + f, import.meta.url)).toString('base64');
const yard = { theme: 'spring', chars: [{ role: 'me', name: '재민', stage: 3 }, { role: 'partner', name: '은지', stage: 6 }],
  items: [{ k: 'tree', e: '🌳', cat: 'flower', x: 18, y: 38 }, { k: 'house', e: '🏡', cat: 'home', x: 78, y: 40 }, { k: 'fountain', e: '⛲', cat: 'home', x: 50, y: 52 }, { k: 'dog', e: '🐶', cat: 'pet', x: 80, y: 84 }, { k: 'sunf', e: '🌻', cat: 'flower', x: 28, y: 88 }, { k: 'cloud', e: '☁️', cat: 'sky', x: 70, y: 8 }, { k: 'tulip', e: '🌷', cat: 'flower', x: 60, y: 76 }] };
const sample = {
  ready: true, me: '재민', partner: '은지', days: 623, start: '2025-03-14',
  next: { title: '성수 카페 데이트', date: '2026-11-28', time: '14:00', days: 2 },
  anniv: { label: '700일', days: 77 },
  upcoming: [{ title: '성수 카페 데이트', days: 2, kind: 'date', time: '14:00' }, { title: '은지 생일', days: 2, kind: 'anniv', time: '' }, { title: '필라테스', days: 5, kind: 'plan', time: '19:30' }],
  progress: { label: '700일', left: 77, pct: 0.23 },
  cover: 'https://example/cover.jpg',
  mood: { me: { emoji: '😊', label: '좋아', note: '' }, partner: { emoji: '🥺', label: '보고 싶어', note: '주말까지 어떻게 기다리지' } },
  question: { me: false, partner: true }, newPhotos: 3, letters: { unread: 1, sealed: 2, nextOpen: 77 }, updated: new Date().toISOString(), yard,
};
const quiet = { ...sample, next: null, upcoming: [], mood: { me: null, partner: null }, newPhotos: 0, letters: { unread: 0, sealed: 0, nextOpen: null }, question: { me: true, partner: true } };

// ---- the stand-in API: builds a tree, then turns it into HTML ----
function harness(dark, data, family, param, DUO, COVER) {
  const xesc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const css = c => (c && c.__dyn ? css(dark ? c.dark : c.light) : c ? c.css : null);
  class Color { constructor(hex, a = 1) { const h = hex.replace('#', ''); const n = parseInt(h, 16); this.css = `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; } static dynamic(l, d) { return { __dyn: true, light: l, dark: d }; } }
  class Size { constructor(w, h) { this.width = w; this.height = h; } }
  class Point { constructor(x, y) { this.x = x; this.y = y; } }
  class Rect { constructor(x, y, w, h) { Object.assign(this, { x, y, w, h }); } }
  const Font = {}; for (const [k, wgt] of [['heavyRoundedSystemFont', 800], ['boldRoundedSystemFont', 700], ['mediumRoundedSystemFont', 500], ['systemFont', 400], ['boldSystemFont', 700]]) Font[k] = s => ({ s, wgt });
  class Node { constructor(kind) { this.kind = kind; this.items = []; this.dir = 'row'; this.align = 'center'; this.pad = null; } addText(t) { const n = { kind: 'text', t, centerAlignText() { this.center = true; } }; this.items.push(n); return n; } addImage(img) { const n = { kind: 'img', img }; this.items.push(n); return n; } addStack() { const n = new Node('stack'); this.items.push(n); return n; } addSpacer(n) { this.items.push({ kind: 'sp', n }); } layoutHorizontally() { this.dir = 'row'; } layoutVertically() { this.dir = 'column'; } centerAlignContent() { this.align = 'center'; } topAlignContent() { this.align = 'flex-start'; } bottomAlignContent() { this.align = 'flex-end'; } setPadding(t, l, b, r) { this.pad = [t, r, b, l]; } }
  class ListWidget extends Node { constructor() { super('widget'); this.dir = 'column'; this.align = 'flex-start'; this.pad = [16, 16, 16, 16]; } presentSmall() {} presentMedium() {} presentLarge() {} }
  class LinearGradient {}
  const img = { size: new Size(400, 300), b64: null };
  class Request { constructor(u) { this.u = u; } async loadJSON() { if (data === null) throw new Error('offline'); return data; } async loadImage() { const cm = this.u.match(/(char-[a-z]+-\d(-l)?\.png)$/); if (cm && CHARS[cm[1]]) return { size: new Size(240, 240), b64: 'data:image/png;base64,' + CHARS[cm[1]] }; if (this.u.includes('duo')) return { size: new Size(396, 228), b64: 'data:image/png;base64,' + DUO }; if (COVER) return { size: new Size(1200, 900), b64: 'data:image/png;base64,' + COVER }; throw new Error('no'); } }
  class Path { constructor() { this.d = ''; } move(p) { this.d += `M${p.x} ${p.y}`; } addQuadCurve(p, c) { this.d += `Q${c.x} ${c.y} ${p.x} ${p.y}`; } addCurve(p, c1, c2) { this.d += `C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p.x} ${p.y}`; } addLine(p) { this.d += `L${p.x} ${p.y}`; } addLines(ps) { ps.forEach((p, i) => { this.d += `${i ? 'L' : 'M'}${p.x} ${p.y}`; }); } closeSubpath() { this.d += 'Z'; }
    addRoundedRect(r, a, b) { this.d += `M${r.x + a} ${r.y}H${r.x + r.w - a}A${a} ${b} 0 0 1 ${r.x + r.w} ${r.y + b}V${r.y + r.h - b}A${a} ${b} 0 0 1 ${r.x + r.w - a} ${r.y + r.h}H${r.x + a}A${a} ${b} 0 0 1 ${r.x} ${r.y + r.h - b}V${r.y + b}A${a} ${b} 0 0 1 ${r.x + a} ${r.y}Z`; } }
  // records what is drawn and hands it back as an SVG picture
  class DrawContext {
    constructor() { this.ops = []; this.fill = '#000'; this.tc = '#000'; this.font = { s: 12, wgt: 400 }; this.align = 'start'; this.size = new Size(100, 100); }
    setFillColor(c) { this.fill = c.css; } setStrokeColor(c) { this.stroke = c.css; } setLineWidth(n) { this.lw = n; } strokePath() { if (this.path) this.ops.push(`<path d="${this.path.d}" fill="none" stroke="${this.stroke}" stroke-width="${this.lw}" stroke-linecap="round"/>`); } setTextColor(c) { this.tc = c.css; } setFont(f) { this.font = f; } setTextAlignedCenter() { this.align = 'middle'; } setTextAlignedLeft() { this.align = 'start'; }
    fillRect(r) { this.ops.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${this.fill}"/>`); }
    fillEllipse(r) { this.ops.push(`<ellipse cx="${r.x + r.w / 2}" cy="${r.y + r.h / 2}" rx="${r.w / 2}" ry="${r.h / 2}" fill="${this.fill}"/>`); }
    addPath(p) { this.path = p; } fillPath() { if (this.path) this.ops.push(`<path d="${this.path.d}" fill="${this.fill}"/>`); }
    drawImageInRect(i, r) { r = r || new Rect(0, 0, this.size.width, this.size.height); if (i && i.b64) this.ops.push(`<image href="${i.b64}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" preserveAspectRatio="xMidYMid slice"/>`); }
    drawTextInRect(t, r) { const x = this.align === 'middle' ? r.x + r.w / 2 : r.x; this.ops.push(`<text x="${x}" y="${r.y + this.font.s * 0.95}" font-size="${this.font.s}" font-weight="${this.font.wgt}" text-anchor="${this.align}" fill="${this.tc}" font-family="ui-rounded,'Noto Sans KR',sans-serif">${xesc(t)}</text>`); }
    getImage() { const W = this.size.width, H = this.size.height; return { size: this.size, b64: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${this.ops.join('')}</svg>`).replace(/'/g, '%27') }; }
  }
  const store = {};
  const FileManager = { local: () => ({ cacheDirectory: () => '/c', joinPath: (a, b) => a + '/' + b, fileExists: p => p in store, createDirectory() {}, writeString(p, s) { store[p] = s; }, readString: p => store[p], writeImage(p, i) { store[p] = i; }, readImage: p => store[p] }) };
  class DateFormatter { string(d) { return d.toTimeString().slice(0, 5); } }
  let result = null;
  const Script = { setWidget(w) { result = w; }, complete() {} };
  const config = { widgetFamily: family, runsInWidget: true };
  const args = { widgetParameter: param || '' };
  return { env: { Color, Size, Point, Rect, Font, ListWidget, LinearGradient, Request, DrawContext, Path, FileManager, DateFormatter, Script, config, args }, get: () => result, css };
}
const SIZES = { small: [170, 170], medium: [364, 170], large: [364, 382], accessoryRectangular: [172, 76], accessoryCircular: [76, 76], accessoryInline: [240, 22] };
function toHTML(node, css, acc, parentDir = 'column') {
  if (node.kind === 'text') { const f = node.font || { s: 15, wgt: 500 }; return `<span style="font:${f.wgt} ${f.s}px ui-rounded,'SF Pro Rounded','Noto Sans KR',sans-serif;color:${acc ? '#fff' : css(node.textColor) || '#000'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;${node.center ? 'text-align:center;' : ''}${node.shadowColor ? 'text-shadow:0 1px 2px rgba(0,0,0,.35);' : ''}">${String(node.t).replace(/</g, '&lt;')}</span>`; }
  if (node.kind === 'img') return `<img src="${node.img.b64}" style="width:${node.imageSize ? node.imageSize.width : 40}px;height:${node.imageSize ? node.imageSize.height : 40}px;flex:none">`;
  if (node.kind === 'sp') return node.n == null ? '<span style="flex:1 1 0"></span>' : `<span style="flex:none;width:${node.n}px;height:${node.n}px"></span>`;
  const st = [`display:flex`, `flex-direction:${node.dir}`, `align-items:${node.align}`, `min-width:0`];
  if (node.spacing) st.push(`gap:${node.spacing}px`);
  if (node.pad) st.push(`padding:${node.pad.map(x => x + 'px').join(' ')}`);
  if (node.backgroundColor) st.push(`background:${css(node.backgroundColor)}`);
  if (node.cornerRadius) st.push(`border-radius:${node.cornerRadius}px`);
  if (node.size) { if (node.size.width) st.push(`width:${node.size.width}px;flex:none`); if (node.size.height) st.push(`height:${node.size.height}px`); }
  const flexSp = node.items.some(n => n.kind === 'sp' && n.n == null);
  // like SwiftUI: a Spacer only pushes along its own stack's axis
  if (node.kind === 'stack' && !node.size) {
    if (node.dir === 'column' && parentDir === 'row') st.push('flex:1 1 auto');
    if (flexSp && node.dir === 'row') st.push(parentDir === 'column' ? 'align-self:stretch' : 'flex:1 1 auto');
    if (flexSp && node.dir === 'column') st.push(parentDir === 'row' ? 'align-self:stretch' : 'flex:1 1 auto');
  }
  return `<div style="${st.join(';')}">${node.items.map(n => toHTML(n, css, acc, node.dir)).join('')}</div>`;
}
async function render(family, dark, data, param) {
  const h = harness(dark, data, family, param, duoPng, coverPng);
  const code = src.replace('__WIDGET_URL__', 'https://x/functions/v1/widget?t=K').replace('__APP_URL__', 'https://app/');
  const fn = new Function(...Object.keys(h.env), 'DUO', 'COVER', `return (async () => {${code}})()`);
  await fn(...Object.values(h.env), duoPng, coverPng);
  const w = h.get(), [W, H] = SIZES[family], acc = family.startsWith('accessory');
  const bg = acc ? 'rgba(255,255,255,.18)' : w.backgroundImage ? `url('${w.backgroundImage.b64}') center/cover` : w.backgroundGradient ? `linear-gradient(${h.css(w.backgroundGradient.colors[0])},${h.css(w.backgroundGradient.colors[1])})` : '#fff';
  w.pad = acc ? [2, 4, 2, 4] : w.pad;
  return `<div class="cell"><div class="wd" style="width:${W}px;height:${H}px;background:${bg};border-radius:${acc ? (family === 'accessoryCircular' ? 38 : 12) : 22}px">${toHTML(w, h.css, acc)}</div><p>${family}${dark ? ' · dark' : ''}${param ? ' · ' + param : ''}${data === quiet ? ' · 조용한 날' : ''}</p></div>`;
}
const cells = [];
for (const [f, dark, data, param] of [['small', false, sample], ['medium', false, sample], ['large', false, sample], ['small', true, sample], ['medium', true, sample], ['large', true, sample], ['small', false, quiet], ['medium', false, quiet], ['large', false, quiet], ['medium', false, sample, '사진'], ['accessoryRectangular', false, sample], ['accessoryCircular', false, sample], ['accessoryInline', false, sample], ['small', false, sample, '마당'], ['medium', false, sample, '마당'], ['large', false, sample, '마당'], ['medium', true, { ...sample, yard: { ...yard, theme: 'night' } }, '마당'], ['medium', false, { ...sample, yard: { ...yard, theme: 'beach', chars: [yard.chars[0]] } }, '마당']]) cells.push(await render(f, dark, data, param));
const html = `<html><body style="margin:0;padding:24px;background:linear-gradient(160deg,#3b2a5c,#c75b86 60%,#f3a7a0);display:flex;flex-wrap:wrap;gap:22px;width:1200px;align-items:flex-start"><style>.wd{display:flex;overflow:hidden;box-shadow:0 10px 26px rgba(0,0,0,.25)}.wd>div{flex:1;min-width:0}.cell p{color:#fff;font:600 12px sans-serif;margin:6px 4px}</style>${cells.join('')}</body></html>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1250, height: 900 }, deviceScaleFactor: 2 });
await p.setContent(html); await p.waitForTimeout(300); await p.screenshot({ path: out, fullPage: true }); await b.close();
console.log('wrote', out);
