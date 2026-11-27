// 우리 둘 위젯 (Scriptable)
// 홈 화면: 작게·중간·크게 / 잠금 화면: 직사각형·원형·한 줄
// 위젯을 길게 눌러 '위젯 편집 → Parameter'에 '사진'이라고 적으면 위젯 배경 사진이 깔리고,
// '마당'이라고 적으면 우리 마당 위젯이 돼요(15분쯤마다 캐릭터가 다른 곳에서 놀고 있어요).
// 아래 주소에는 내 위젯 키가 들어 있어요. 다른 사람에게 보내지 마세요.
const API = '__WIDGET_URL__';
const APP = '__APP_URL__';

const fam = config.widgetFamily || 'medium';
const acc = fam.indexOf('accessory') === 0;
const param = String((typeof args !== 'undefined' && args.widgetParameter) || '').trim();
const fm = FileManager.local();
const dir = fm.joinPath(fm.cacheDirectory(), 'uridul');
if (!fm.fileExists(dir)) fm.createDirectory(dir, true);
const cachePath = name => fm.joinPath(dir, name);

// ---------- data (falls back to the last copy when offline) ----------
let d = null, stale = false;
try {
  const r = new Request(API);
  r.timeoutInterval = 15;
  d = await r.loadJSON();
  if (d && d.ready) fm.writeString(cachePath('data.json'), JSON.stringify(d));
} catch (e) {
  try { d = JSON.parse(fm.readString(cachePath('data.json'))); stale = true; } catch (e2) { d = null; }
}

async function image(url, name, maxW) {
  const p = cachePath(name);
  try {
    let img = await new Request(url).loadImage();
    if (maxW && img.size.width > maxW) {
      const dc = new DrawContext();
      dc.size = new Size(maxW, Math.round(img.size.height * maxW / img.size.width));
      dc.drawImageInRect(img, new Rect(0, 0, dc.size.width, dc.size.height));
      img = dc.getImage();
    }
    fm.writeImage(p, img);
    return img;
  } catch (e) {
    return fm.fileExists(p) ? fm.readImage(p) : null;
  }
}

// ---------- look ----------
const usePhoto = !acc && /사진|photo/i.test(param) && d && d.cover;
// always the bright pink look, like the app, even when the iPhone is in dark mode
const C = (l, a = 1) => new Color(l, a);
const T = usePhoto
  ? { star: new Color('#ffe08a'), ink: new Color('#ffffff'), mut: new Color('#ffffff', 0.82), pink: new Color('#ffd1df'), chip: new Color('#000000', 0.28), hot: new Color('#ff5f8f', 0.92), hotInk: new Color('#ffffff'), track: new Color('#ffffff', 0.28), fill: new Color('#ffffff') }
  : { ink: C('#5a2b40'), mut: C('#a87a8d'), pink: C('#ff4f86'), chip: C('#ffffff', 0.8), hot: C('#ff5c8d'), hotInk: C('#ffffff'), track: C('#ffffff', 0.85), fill: C('#ff5c8d'), star: C('#ffc53d') };

const w = new ListWidget();
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
const yardMode = !acc && /마당|yard/i.test(param) && !!(d && d.ready && d.yard);
if (yardMode) w.url = APP + '#grow';

// ---------- the yard (Parameter: 마당) ----------
// The app's yard seen from slightly above, drawn as one picture. Widgets cannot move,
// so each refresh puts the two characters somewhere new.
const YC = {
  spring: ['#ffd3e3', '#fff0f5', '#bfe8c9', '#aadfb9', '#86c99c', '#d6f1de', '#ffffff'],
  sakura: ['#ffe0ee', '#fff6fa', '#ffd3e2', '#ffc2d6', '#efa3bd', '#ffe8f0', '#ffffff'],
  beach: ['#bfe4ff', '#eef8ff', '#ffe7b6', '#ffdda0', '#e9bf7a', '#9fd8f2', '#fff8e8'],
  snow: ['#dce8f8', '#f5f9ff', '#ffffff', '#eef4ff', '#c9d8ee', '#e6effb', '#ffffff'],
  night: ['#2e2f63', '#5d4f92', '#4f8a77', '#467e6c', '#2c5a4c', '#34525e', '#d9d4ee'],
};
const YSIZE = { tulip: 26, daisy: 24, sunf: 30, clover: 22, mush: 26, pot: 30, cactus: 34, tree: 50, pine: 50, blossom: 28, kite: 30, balloon: 30, parasol: 44, slide: 46, tent: 52, carousel: 50, ferris: 60, canoe: 40, house: 62, hut: 54, camp: 48, fountain: 50, chair: 30, sofa: 40, basket: 28, lantern: 28, post: 32, log: 30, dog: 30, cat: 30, bunny: 28, chick: 24, duck: 28, squirrel: 28, turtle: 28, bfly: 24, cloud: 40, star: 22, sun: 44, moon: 38, dove: 28, rainbow: 56 }; // the same sizes as the app's shop
const CSIZE = { flower: 28, play: 36, home: 34, pet: 30, sky: 30 };
function hexMix(a, b, t) { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
async function drawYard(Y, W, H) {
  // Mirrors the app's yard: same sky band, rainbow, clouds, plot shape, stripes, fence, sizes and depth.
  const k = 3, dc = new DrawContext(), c = YC[Y.theme] || YC.spring, night = Y.theme === 'night';
  dc.size = new Size(W * k, H * k); dc.opaque = true; dc.respectScreenScale = false;
  const PX = x => x / 360 * W * k, PY = y => y / 260 * H * k, P = (x, y) => new Point(PX(x), PY(y));
  const u = Math.max(0.62, W / 330); // the app's yard is about 330pt wide; sizes follow width like it does
  const depth = y => 0.68 + 0.42 * Math.min(1, Math.max(0, (y - 18) / 76));
  // sky band and the field around the garden
  const band = 0.17 * H * k;
  for (let i = 0; i < 8; i++) { dc.setFillColor(new Color(hexMix(c[0], c[1], i / 7))); dc.fillRect(new Rect(0, band * i / 8, W * k, band / 8 + 1)); }
  dc.setFillColor(new Color(c[5])); dc.fillRect(new Rect(0, band, W * k, H * k));
  if (night) { dc.setFillColor(new Color('#ffffff', 0.55)); for (let i = 0; i < 26; i++) { const x = (i * 97) % 360, y = (i * 37) % 44; dc.fillEllipse(new Rect(PX(x), PY(y), 2.2 * k, 2.2 * k)); } }
  // rainbow: both reached the rainbow stage (upper halves of four rings, like the app)
  const cs = Y.chars || [];
  if (cs.length > 1 && cs.every(ch => ch.stage >= 7)) {
    const hb = 0.19 * H * k, cx0 = W * k / 2;
    [['#a9c8ff', 0.6425], ['#a8e6cf', 0.6825], ['#ffd36b', 0.7225], ['#ffb3c9', 0.7625]].forEach(([col, f]) => {
      const rx = 0.6 * W * k * f, ry = 1.9 * hb * f, pth = new Path(), q = 0.5523;
      pth.move(new Point(cx0 - rx, hb));
      pth.addCurve(new Point(cx0, hb - ry), new Point(cx0 - rx, hb - ry * q), new Point(cx0 - rx * q, hb - ry));
      pth.addCurve(new Point(cx0 + rx, hb), new Point(cx0 + rx * q, hb - ry), new Point(cx0 + rx, hb - ry * q));
      dc.addPath(pth); dc.setStrokeColor(new Color(col, 0.67)); dc.setLineWidth(0.035 * rx); dc.strokePath();
    });
    dc.setFillColor(new Color(c[5])); dc.fillRect(new Rect(0, hb, W * k, H * k)); // the rings stop at the band, as in the app
  }
  // clouds and little hearts in the sky (the app's 360x56 picture, scaled to cover the band)
  const bh = 0.19 * H * k, sc = Math.max(W * k / 360, bh / 56), ox = (W * k - 360 * sc) / 2, oy = (bh - 56 * sc) / 2;
  dc.setFillColor(new Color('#ffffff', night ? 0.25 : 0.92));
  for (const [x, y, rx, ry] of [[58, 26, 26, 9], [76, 20, 16, 11], [300, 22, 24, 8], [316, 17, 13, 9]]) dc.fillEllipse(new Rect(ox + (x - rx) * sc, oy + (y - ry) * sc, 2 * rx * sc, 2 * ry * sc));
  dc.setTextColor(new Color('#ff9fbb')); dc.setTextAlignedCenter();
  for (const [x, y, f] of [[150, 14, 0.5], [226, 22, 0.36]]) { const hs = 24 * f * sc; dc.setFont(Font.boldSystemFont(hs)); dc.drawTextInRect('♥', new Rect(ox + x * sc, oy + y * sc - hs * 0.15, hs, hs * 1.2)); }
  // the plot: the app's outline with rounded corners, its edge, the grass and slanted mowing stripes
  const plot = dy => { const pth = new Path(), Q = (x, y, cx, cy) => pth.addQuadCurve(P(x, y + dy), P(cx, cy + dy));
    pth.move(P(46, 50 + dy)); Q(58, 38, 42, 38); pth.addLine(P(302, 38 + dy)); Q(314, 50, 318, 38); pth.addLine(P(351, 230 + dy)); Q(334, 250, 355, 250); pth.addLine(P(26, 250 + dy)); Q(9, 230, 5, 250); pth.closeSubpath(); return pth; };
  dc.addPath(plot(9)); dc.setFillColor(new Color(c[4])); dc.fillPath();
  dc.addPath(plot(0)); dc.setFillColor(new Color(c[2])); dc.fillPath();
  const quad = [[46, 38], [314, 38], [351, 250], [9, 250]], n = [Math.cos(-24 * Math.PI / 180), Math.sin(-24 * Math.PI / 180)];
  const dot = p => p[0] * n[0] + p[1] * n[1];
  const clip = (poly, keep) => { const out = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], ka = keep(a), kb = keep(b); if (ka) out.push(a); if (ka !== kb) { const da = dot(a), db = dot(b), t = (keep.v - da) / (db - da); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } } return out; };
  const ds = quad.map(dot), lo = Math.floor(Math.min(...ds) / 30) - 1, hi = Math.ceil(Math.max(...ds) / 30) + 1;
  dc.setFillColor(new Color(c[3], 0.55));
  for (let j = lo; j <= hi; j++) {
    const k1 = p => dot(p) >= 30 * j; k1.v = 30 * j; const k2 = p => dot(p) <= 30 * j + 15; k2.v = 30 * j + 15;
    const poly = clip(clip(quad, k1), k2); if (poly.length < 3) continue;
    const pth = new Path(); pth.addLines(poly.map(([x, y]) => P(x, y))); pth.closeSubpath(); dc.addPath(pth); dc.fillPath();
  }
  const shine = new Path(); shine.move(P(40, 232)); shine.addQuadCurve(P(320, 232), P(180, 262)); dc.addPath(shine); dc.setStrokeColor(new Color('#ffffff', 0.25)); dc.setLineWidth(PY(3)); dc.strokePath();
  // picket fence along the back
  dc.setFillColor(new Color(c[6], 0.95));
  for (let x = 52; x <= 308; x += 13) dc.fillRect(new Rect(PX(x - 2), PY(x % 39 === 0 ? 20 : 22), PX(4), PY(x % 39 === 0 ? 20 : 18)));
  dc.fillRect(new Rect(PX(48), PY(26), PX(264), PY(3))); dc.fillRect(new Rect(PX(48), PY(33), PX(264), PY(3)));

  // a moment in the yard: widgets cannot move, so each refresh shows the two of them doing something
  const things = (Y.items || []).map(it => ({ kind: 'item', ...it, y: it.cat === 'sky' ? Math.min(it.y, 15) : Math.max(it.y, 24) }));
  const ground = things.filter(t => t.cat !== 'sky');
  const hourKST = (new Date().getUTCHours() + 9) % 24, asleep = hourKST >= 23 || hourKST < 7;
  const house = ground.find(t => t.k === 'house' || t.k === 'hut' || t.k === 'camp');
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const scene = asleep ? 'sleep' : pick(cs.length > 1 ? ['meet', 'meet', 'run', 'run', 'hop', 'visit'] : ['run', 'run', 'hop', 'visit']);
  const spots = [];
  cs.forEach((ch, i) => {
    let x = 16 + Math.random() * 68, y = 40 + Math.random() * 48, pose = scene;
    if (scene === 'sleep') { const b = house || { x: 50, y: 60 }; x = b.x + (i ? 7 : -7); y = Math.min(92, b.y + 10); }
    else if (scene === 'meet' && i === 1) { x = spots[0].x + (spots[0].x > 50 ? -12 : 12); y = spots[0].y + (Math.random() - 0.5) * 3; }
    else if (scene === 'visit' && i === 0 && ground.length) { const t = pick(ground); x = t.x + (t.x > 50 ? -10 : 10); y = Math.min(92, t.y + 3); }
    else if (i === 1) { for (let n2 = 0; n2 < 20 && Math.abs(spots[0].x - x) < 22; n2++) x = 16 + Math.random() * 68; pose = pick(['run', 'hop', 'stand']); }
    x = Math.min(86, Math.max(14, x)); y = Math.min(92, Math.max(32, y));
    spots.push({ x, y });
    const other = spots[0];
    const flip = scene === 'meet' && i === 1 ? x > other.x : scene === 'meet' && i === 0 ? false : Math.random() < 0.5;
    things.push({ kind: 'char', ...ch, x, y, pose, flip });
  });
  if (scene === 'meet' && spots.length > 1) things.find(t => t.kind === 'char' && t.role === cs[0].role).flip = spots[0].x > spots[1].x;
  things.sort((a, b) => a.y - b.y);
  const emoji = (e, cx, cy, sz) => { dc.setFont(Font.systemFont(sz)); dc.setTextAlignedCenter(); dc.drawTextInRect(e, new Rect(cx - sz, cy - sz * 0.62, sz * 2, sz * 1.3)); };
  for (const t of things) {
    const cx = t.x / 100 * W * k, fy = t.y / 100 * H * k;
    if (t.kind === 'item') {
      const sz = (YSIZE[t.k] || CSIZE[t.cat] || 30) * u * (t.cat === 'sky' ? 0.8 : depth(t.y)) * k;
      emoji(t.e, cx, fy - sz * 0.4, sz);
    } else {
      const name = 'char-' + t.role + '-' + t.stage + (t.flip ? '-l' : '') + '.png';
      const img = await image(APP + 'widget/' + name, name);
      const cw = 74 * u * depth(t.y) * k, lift = t.pose === 'hop' ? cw * 0.3 : 0;
      if (lift) { dc.setFillColor(new Color('#000000', 0.08)); dc.fillEllipse(new Rect(cx - cw * 0.22, fy - cw * 0.05, cw * 0.44, cw * 0.09)); }
      if (t.pose === 'run') emoji('💨', cx + (t.flip ? 1 : -1) * cw * 0.5, fy - cw * 0.12, cw * 0.32);
      if (img) dc.drawImageInRect(img, new Rect(cx - cw / 2, fy - cw * 0.92 - lift, cw, cw));
      if (t.pose === 'sleep') emoji('💤', cx + cw * 0.3, fy - cw * 0.95, cw * 0.3);
      const nm = String(t.name).slice(0, 5), fs = 10.5 * u * k, tw = fs * (nm.length * 1.02 + 1.3), ty = fy + cw * 0.08 - lift;
      const pill = new Path(); pill.addRoundedRect(new Rect(cx - tw / 2, ty - fs * 0.85, tw, fs * 1.5), fs * 0.75, fs * 0.75);
      dc.addPath(pill); dc.setFillColor(new Color('#ffffff', 0.9)); dc.fillPath();
      dc.setFont(Font.heavyRoundedSystemFont(fs)); dc.setTextColor(new Color('#5a2b40')); dc.setTextAlignedCenter();
      dc.drawTextInRect(nm, new Rect(cx - tw / 2, ty - fs * 0.78, tw, fs * 1.4));
    }
  }
  if (scene === 'meet' && spots.length > 1) { const cw = 74 * u * depth(spots[0].y) * k; emoji('💗', (spots[0].x + spots[1].x) / 200 * W * k, Math.min(spots[0].y, spots[1].y) / 100 * H * k - cw * 1.05, cw * 0.32); }
  // days together, top left
  const fsz = 11 * Math.max(0.9, u) * k;
  dc.setFont(Font.heavyRoundedSystemFont(fsz)); dc.setTextColor(new Color(night ? '#ffffff' : '#5a2b40', 0.9)); dc.setTextAlignedLeft();
  dc.drawTextInRect('♥ ' + Number(d.days).toLocaleString('ko-KR') + '일째', new Rect(10 * k, 6 * k, W * k * 0.6, fsz * 1.4));
  return dc.getImage();
}
if (!acc) {
  if (yardMode) {
    const S = { small: [158, 158], medium: [338, 158], large: [338, 354], extraLarge: [715, 354] }[fam] || [338, 158];
    w.backgroundImage = await drawYard(d.yard, S[0], S[1]);
  } else if (usePhoto) {
    const img = await image(d.cover, 'cover.jpg', 900);
    if (img) {
      const dc = new DrawContext();
      dc.size = img.size;
      dc.drawImageInRect(img, new Rect(0, 0, img.size.width, img.size.height));
      dc.setFillColor(new Color('#1c0f15', 0.42));
      dc.fillRect(new Rect(0, 0, img.size.width, img.size.height));
      w.backgroundImage = dc.getImage();
    }
  } else {
    const g = new LinearGradient();
    g.colors = [C('#ffcde0'), C('#ffe6ee'), C('#fff8f3')];
    g.locations = [0, 0.55, 1];
    w.backgroundGradient = g;
  }
  w.setPadding(yardMode ? 0 : 14, yardMode ? 0 : 14, yardMode ? 0 : 14, yardMode ? 0 : 14);
}

// ---------- helpers ----------
function text(parent, s, size, color, weight) {
  const t = parent.addText(String(s));
  t.font = weight === 'heavy' ? Font.heavyRoundedSystemFont(size) : weight === 'bold' ? Font.boldRoundedSystemFont(size) : Font.mediumRoundedSystemFont(size);
  if (!acc && color) t.textColor = color;
  if (usePhoto) { t.shadowColor = new Color('#000000', 0.35); t.shadowRadius = 2; t.shadowOffset = new Point(0, 1); }
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  return t;
}
function row(parent) { const s = parent.addStack(); s.layoutHorizontally(); s.centerAlignContent(); return s; }
function col(parent) { const s = parent.addStack(); s.layoutVertically(); s.topAlignContent(); return s; }
function chip(parent, hot) {
  const s = row(parent);
  s.backgroundColor = hot ? T.hot : T.chip;
  s.cornerRadius = 12;
  s.setPadding(6, 9, 6, 9);
  return s;
}
function bar(parent, width, pct) {
  const track = row(parent);
  track.size = new Size(width, 7);
  track.cornerRadius = 4;
  track.backgroundColor = T.track;
  const fill = track.addStack();
  fill.size = new Size(Math.max(7, Math.round(width * Math.min(1, Math.max(0, pct)))), 7);
  fill.cornerRadius = 4;
  fill.backgroundColor = T.fill;
  track.addSpacer();
}
const dd = n => (n === 0 ? 'D-DAY' : 'D-' + n);
const num = n => Number(n).toLocaleString('ko-KR');
const when = n => (n === 0 ? '오늘' : n === 1 ? '내일' : n + '일 뒤');
const icon = k => (k === 'date' ? '💗' : k === 'anniv' ? '🎉' : '🗓️');

// ---------- not connected ----------
if (!d || !d.ready) {
  if (!acc) { const top = row(w); const im = await image(APP + 'widget/duo.png', 'duo.png'); if (im) { const i = top.addImage(im); i.imageSize = new Size(46, 27); } }
  w.addSpacer(6);
  text(w, '우리 둘', acc ? 13 : 16, T.pink, 'bold');
  const msg = text(w, d && d.message ? d.message : d && d.error ? '위젯 키가 바뀌었어요. 앱 설정에서 위젯 코드를 다시 복사해 주세요' : '연결하지 못했어요. 잠시 뒤 다시 보여 드릴게요', acc ? 11 : 12, T.mut);
  msg.lineLimit = 3;
  w.addSpacer();
} else if (yardMode) {
  w.addSpacer();
} else if (fam === 'accessoryInline') {
  text(w, '♥ ' + num(d.days) + '일째' + (d.next ? ' · 데이트 ' + dd(d.next.days) : d.anniv ? ' · ' + d.anniv.label + ' ' + dd(d.anniv.days) : ''), 12);
} else if (fam === 'accessoryCircular') {
  w.addSpacer();
  const a = text(w, d.next ? dd(d.next.days) : num(d.days), 15, null, 'bold'); a.centerAlignText();
  const b = text(w, d.next ? '데이트' : '일째', 10); b.centerAlignText();
  w.addSpacer();
} else if (fam === 'accessoryRectangular') {
  text(w, '♥ ' + d.me + ' & ' + d.partner, 12, null, 'bold');
  text(w, num(d.days) + '일째', 19, null, 'heavy');
  const pm = d.mood && d.mood.partner;
  text(w, d.next ? d.next.title + ' ' + dd(d.next.days) : pm ? pm.emoji + ' ' + d.partner + ' ' + pm.label : d.anniv ? d.anniv.label + ' ' + dd(d.anniv.days) : '', 12);
} else {
  const duo = await image(APP + 'widget/duo.png', 'duo.png');
  const pm = d.mood && d.mood.partner, mm = d.mood && d.mood.me;
  const prog = d.progress || { label: '', left: 0, pct: 0 };
  const extras = [];
  if (d.newPhotos) extras.push('📷 새 사진 ' + d.newPhotos);
  if (d.letters && d.letters.unread) extras.push('💌 편지 ' + d.letters.unread);
  if (d.question && !d.question.me) extras.push(d.question.partner ? '❓ 답 기다려요' : '❓ 오늘의 질문');

  const dateChip = (parent, item, hot) => {
    const c = chip(parent, hot);
    text(c, icon(item.kind) + ' ' + item.title, 12, hot ? T.hotInk : T.ink, 'bold');
    c.addSpacer();
    text(c, dd(item.days), 12, hot ? T.hotInk : T.pink, 'heavy');
    return c;
  };
  const moodChip = (parent, who, m, mine) => {
    const c = chip(parent);
    text(c, m ? m.emoji : '·', 14);
    c.addSpacer(5);
    text(c, m ? (mine ? '나 · ' : who + ' · ') + (m.note || m.label) : (mine ? '내 기분 남기기' : who + ' 기분은 아직'), 12, m ? T.ink : T.mut, m ? 'bold' : null);
    c.addSpacer();
    return c;
  };
  const first = d.next ? { title: d.next.title, days: d.next.days, kind: 'date' } : d.anniv ? { title: d.anniv.label, days: d.anniv.days, kind: 'anniv' } : null;

  if (fam === 'small') {
    const top = row(w);
    if (duo) { const i = top.addImage(duo); i.imageSize = new Size(46, 27); }
    top.addSpacer();
    if (pm) text(top, pm.emoji, 18);
    w.addSpacer(4);
    const big = row(w); big.bottomAlignContent();
    text(big, num(d.days), 34, T.pink, 'heavy'); big.addSpacer(2); text(big, '일째', 13, T.ink, 'bold'); big.addSpacer(3); text(big, '✦', 12, T.star, 'bold');
    text(w, d.me + ' ♥ ' + d.partner, 11, T.mut, 'bold');
    w.addSpacer();
    if (first) dateChip(w, first, first.kind === 'date' && first.days <= 3);
    else { bar(w, 120, prog.pct); w.addSpacer(3); text(w, prog.label + '까지 ' + prog.left + '일', 10, T.mut, 'bold'); }
  } else if (fam === 'medium') {
    const main = row(w); main.topAlignContent();
    const left = col(main); left.size = new Size(118, 0);
    if (duo) { const i = left.addImage(duo); i.imageSize = new Size(70, 40); }
    left.addSpacer(2);
    const big = row(left); big.bottomAlignContent();
    text(big, num(d.days), 36, T.pink, 'heavy'); big.addSpacer(2); text(big, '일째', 13, T.ink, 'bold'); big.addSpacer(3); text(big, '✦', 12, T.star, 'bold');
    text(left, d.me + ' ♥ ' + d.partner, 11, T.mut, 'bold');
    left.addSpacer(7);
    bar(left, 106, prog.pct);
    left.addSpacer(3);
    text(left, prog.label + '까지 ' + prog.left + '일', 10, T.mut, 'bold');
    main.addSpacer(10);
    const right = col(main); right.spacing = 6;
    if (first) dateChip(right, first, first.kind === 'date' && first.days <= 3);
    moodChip(right, d.partner, pm, false);
    if (extras.length) { const c = chip(right); text(c, extras.slice(0, 2).join('  '), 12, T.pink, 'bold'); c.addSpacer(); }
    else if (d.upcoming && d.upcoming[1]) dateChip(right, d.upcoming[1]);
    else if (d.anniv && d.next) dateChip(right, { title: d.anniv.label, days: d.anniv.days, kind: 'anniv' });
    w.addSpacer();
  } else {
    // large and extra large
    const head = row(w);
    if (duo) { const i = head.addImage(duo); i.imageSize = new Size(76, 44); }
    head.addSpacer(10);
    const hc = col(head);
    const big = row(hc); big.bottomAlignContent();
    text(big, num(d.days), 38, T.pink, 'heavy'); big.addSpacer(2); text(big, '일째', 14, T.ink, 'bold'); big.addSpacer(3); text(big, '✦', 13, T.star, 'bold');
    text(hc, d.me + ' ♥ ' + d.partner + ' · ' + String(d.start).replace(/-/g, '.') + '부터', 11, T.mut, 'bold');
    head.addSpacer();
    w.addSpacer(10);
    const pr = row(w);
    text(pr, prog.label + '까지', 11, T.ink, 'bold'); pr.addSpacer(); text(pr, dd(prog.left), 11, T.pink, 'heavy');
    w.addSpacer(4);
    bar(w, 310, prog.pct);
    w.addSpacer(12);
    text(w, '다가오는 날', 12, T.mut, 'bold');
    w.addSpacer(5);
    const list = col(w); list.spacing = 5;
    const items = (d.upcoming || []).slice(0, 3);
    if (!items.length) { const c = chip(list); text(c, '60일 안에 잡힌 일정이 없어요. 데이트를 잡아 볼까요?', 12, T.mut); c.addSpacer(); }
    items.forEach((it, k) => dateChip(list, it, k === 0 && it.kind === 'date' && it.days <= 3));
    w.addSpacer(10);
    const moods = col(w); moods.spacing = 5;
    moodChip(moods, d.partner, pm, false);
    moodChip(moods, d.me, mm, true);
    if (extras.length) { w.addSpacer(6); const c = chip(w); text(c, extras.join('   '), 12, T.pink, 'bold'); c.addSpacer(); }
    w.addSpacer();
    const foot = row(w); foot.addSpacer();
    const df = new DateFormatter(); df.dateFormat = 'HH:mm';
    text(foot, (stale ? '오프라인 · ' : '') + df.string(d.updated ? new Date(d.updated) : new Date()) + ' 업데이트', 9, T.mut);
  }
}

Script.setWidget(w);
if (!config.runsInWidget) {
  if (fam === 'small') await w.presentSmall(); else if (fam === 'large') await w.presentLarge(); else await w.presentMedium();
}
Script.complete();
