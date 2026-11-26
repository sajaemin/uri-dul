// 우리 둘 위젯 (Scriptable)
// 홈 화면: 작게·중간·크게 / 잠금 화면: 직사각형·원형·한 줄
// 위젯을 길게 눌러 '위젯 편집 → Parameter'에 '사진'이라고 적으면 홈 배경 사진이 위젯 배경이 돼요.
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
const C = (l, dk) => Color.dynamic(new Color(l), new Color(dk));
const T = usePhoto
  ? { ink: new Color('#ffffff'), mut: new Color('#ffffff', 0.82), pink: new Color('#ffd1df'), chip: new Color('#000000', 0.28), hot: new Color('#ff5f8f', 0.92), hotInk: new Color('#ffffff'), track: new Color('#ffffff', 0.28), fill: new Color('#ffffff') }
  : { ink: C('#4b2f3a', '#ffe9f0'), mut: C('#9b7480', '#c9a3ae'), pink: C('#ff4f82', '#ff7aa3'), chip: C('#ffffff', '#ffffff'), hot: C('#ff5f8f', '#ff5f8f'), hotInk: new Color('#ffffff'), track: C('#ffd3df', '#4a2a36'), fill: C('#ff5f8f', '#ff7aa3') };
const chipAlpha = usePhoto ? 1 : 0.72;

const w = new ListWidget();
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
if (!acc) {
  if (usePhoto) {
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
    g.colors = [C('#ffdfe9', '#3b1f2b'), C('#fff7f9', '#1c1115')];
    g.locations = [0, 1];
    w.backgroundGradient = g;
  }
  w.setPadding(14, 14, 14, 14);
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
  s.backgroundColor = hot ? T.hot : usePhoto ? T.chip : Color.dynamic(new Color('#ffffff', chipAlpha), new Color('#ffffff', 0.08));
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
  if (d.snap && d.snap.open && !d.snap.me) extras.push('📸 오늘의 한 장');
  else if (d.snap && d.snap.me && d.snap.partner) extras.push('✨ 한 장 공개');
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
    text(big, num(d.days), 34, T.pink, 'heavy'); big.addSpacer(2); text(big, '일째', 13, T.ink, 'bold');
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
    text(big, num(d.days), 36, T.pink, 'heavy'); big.addSpacer(2); text(big, '일째', 13, T.ink, 'bold');
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
    text(big, num(d.days), 38, T.pink, 'heavy'); big.addSpacer(2); text(big, '일째', 14, T.ink, 'bold');
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
