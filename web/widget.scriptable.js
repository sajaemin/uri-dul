// 우리 둘 위젯 (Scriptable)
// 홈 화면: 작게·중간·크게 / 잠금 화면: 직사각형·원형·한 줄
// 아래 주소에 내 위젯 키가 들어 있어요. 다른 사람에게 보내지 마세요.
const API = '__WIDGET_URL__';

const PINK = new Color('#ff5f8f');
const INK = new Color('#4b2f3a');
const MUT = new Color('#9b7480');
const fam = config.widgetFamily || 'medium';
const acc = fam.indexOf('accessory') === 0;

let d = null;
try {
  const r = new Request(API);
  r.timeoutInterval = 15;
  d = await r.loadJSON();
} catch (e) {
  d = null;
}

const w = new ListWidget();
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
if (!acc) {
  const g = new LinearGradient();
  g.colors = [new Color('#ffd3e0'), new Color('#fff6f8')];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  w.setPadding(14, 15, 14, 15);
}

function T(parent, text, size, color, bold) {
  const t = parent.addText(String(text));
  t.font = bold ? Font.boldRoundedSystemFont(size) : Font.mediumRoundedSystemFont(size);
  if (!acc && color) t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.6;
  return t;
}
const dd = n => (n === 0 ? 'D-DAY' : 'D-' + n);
const num = n => Number(n).toLocaleString('ko-KR');

if (!d || !d.ready) {
  T(w, '우리 둘', acc ? 13 : 15, PINK, true);
  T(w, d && d.message ? d.message : d && d.error ? '위젯 키가 바뀌었어요. 앱에서 다시 복사해 주세요' : '연결하지 못했어요', acc ? 11 : 12, MUT).lineLimit = 2;
} else if (fam === 'accessoryInline') {
  T(w, '♥ ' + num(d.days) + '일째' + (d.next ? ' · 데이트 ' + dd(d.next.days) : d.anniv ? ' · ' + d.anniv.label + ' ' + dd(d.anniv.days) : ''), 12);
} else if (fam === 'accessoryCircular') {
  w.addSpacer();
  const top = T(w, d.next ? dd(d.next.days) : num(d.days), 15, null, true);
  top.centerAlignText();
  const sub = T(w, d.next ? '데이트' : '일째', 10);
  sub.centerAlignText();
  w.addSpacer();
} else if (fam === 'accessoryRectangular') {
  T(w, '♥ ' + d.me + ' & ' + d.partner, 12, null, true);
  T(w, num(d.days) + '일째', 19, null, true);
  const pm = d.mood && d.mood.partner;
  T(w, d.next ? d.next.title + ' ' + dd(d.next.days) : pm ? pm.emoji + ' ' + d.partner + ' ' + pm.label : d.anniv ? d.anniv.label + ' ' + dd(d.anniv.days) : '', 12);
} else {
  const small = fam === 'small';
  const head = w.addStack();
  head.centerAlignContent();
  T(head, d.me + ' ♥ ' + d.partner, small ? 12 : 13, INK, true);
  head.addSpacer();
  if (!small && d.letters && d.letters.unread) T(head, '💌 ' + d.letters.unread, 13, PINK, true);
  w.addSpacer(small ? 2 : 4);

  const big = w.addStack();
  big.bottomAlignContent();
  T(big, num(d.days), small ? 34 : 40, PINK, true);
  big.addSpacer(3);
  T(big, '일째', 13, INK, true);
  w.addSpacer(small ? 4 : 6);

  const line = (text, color, bold) => T(w, text, 12, color || INK, bold);
  if (d.next) line('💗 ' + d.next.title + '  ' + dd(d.next.days), INK, true);
  if (d.anniv && (!d.next || fam === 'large' || fam === 'extraLarge')) line('🎉 ' + d.anniv.label + '  ' + dd(d.anniv.days));
  const pm = d.mood && d.mood.partner;
  if (small) {
    if (pm) line(pm.emoji + ' ' + pm.label, MUT);
  } else {
    line(pm ? pm.emoji + ' ' + d.partner + ' · ' + (pm.note || pm.label) : d.partner + '님 기분은 아직이에요', MUT);
    const bits = [];
    if (d.newPhotos) bits.push('📷 새 사진 ' + d.newPhotos);
    if (d.letters && d.letters.unread) bits.push('💌 편지 도착');
    if (d.question && !d.question.me) bits.push(d.question.partner ? '❓ ' + d.partner + '님이 답했어요' : '❓ 오늘의 질문');
    if (bits.length) line(bits.join('   '), PINK, true);
    if (fam === 'large' || fam === 'extraLarge') {
      w.addSpacer(8);
      const mm = d.mood && d.mood.me;
      line(mm ? mm.emoji + ' 나 · ' + (mm.note || mm.label) : '내 기분도 남겨 볼까요?', MUT);
      if (d.letters && d.letters.sealed) line('🔒 잠긴 편지 ' + d.letters.sealed + '통 · ' + (d.letters.nextOpen === 1 ? '내일' : d.letters.nextOpen + '일 뒤') + ' 열려요', MUT);
      line('📅 ' + String(d.start).replace(/-/g, '.') + '부터 함께', MUT);
    }
  }
  w.addSpacer();
}

Script.setWidget(w);
if (!config.runsInWidget) await w.presentMedium();
Script.complete();
