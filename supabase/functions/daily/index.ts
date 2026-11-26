// Called by cron at 09:00 (reminders for dates, anniversaries, birthdays) and 18:00 Korea time (today's question).
import { addDays, admin, coupleNames, cors, diffDays, fmtTime, json, nextStart, nowMinKST, sendToUser, snapMoment, todayKST, trusted, type Ev, type Role } from '../_shared/common.ts';

const dl = (n: number) => (n === 0 ? '오늘' : `D-${n}`);
const sameMD = (a: string, b: string) => a.slice(5) === b.slice(5);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!trusted(req)) return json({ error: 'forbidden' }, 403);
  const slot = new URL(req.url).searchParams.get('slot') || 'morning';
  const today = todayKST();
  const { data: couples } = await admin.from('couples').select('id, me, partner');
  let sent = 0;

  for (const c of couples ?? []) {
    if (slot === 'snap') {
      // runs every 10 minutes; fires once, in the 10 minutes after this couple's moment
      if (!c.me || !c.partner) continue;
      const m = snapMoment(c.id, today), now = nowMinKST();
      if (now < m || now >= m + 10) continue;
      const { error } = await admin.from('snap_sent').insert({ couple_id: c.id, date: today });
      if (error) continue; // already sent today
      for (const role of ['me', 'partner'] as Role[]) {
        sent += await sendToUser(c[role], { title: '📸 오늘의 한 장 시간이에요!', body: '10분 안에 지금 모습을 찍어 올려요. 둘 다 올리면 함께 공개돼요', tag: `snap-${today}`, url: './#home' });
      }
      continue;
    }
    const names = await coupleNames(c.id);
    if (slot === 'evening') {
      if (!c.me || !c.partner) continue;
      const { data: ans } = await admin.from('docs').select('id').eq('couple_id', c.id).eq('coll', 'answers').like('id', `${today}_%`);
      const has = new Set((ans ?? []).map((a) => a.id));
      for (const role of ['me', 'partner'] as Role[]) {
        if (has.has(`${today}_${role}`)) continue;
        const other: Role = role === 'me' ? 'partner' : 'me';
        const body = has.has(`${today}_${other}`) ? `${names[other]}님은 벌써 답했어요. 내 답을 쓰면 열려요` : '오늘의 질문이 기다리고 있어요';
        sent += await sendToUser(c[role], { title: '오늘의 질문', body, tag: `q-${today}`, url: './#q' });
      }
      continue;
    }

    // morning: letters that open today go to the person they were written for
    const { data: letters } = await admin.from('docs').select('id, data').eq('couple_id', c.id).eq('coll', 'letters').eq('data->>openAt', today);
    for (const l of letters ?? []) {
      const from = (l.data as any).from as Role;
      if (from !== 'me' && from !== 'partner') continue;
      const to: Role = from === 'me' ? 'partner' : 'me';
      sent += await sendToUser(c[to], { title: '편지가 도착했어요 💌', body: `${names[from]}님이 남긴 편지가 오늘 열렸어요`, tag: `letter-${l.id}`, url: './#mem' });
    }

    // morning reminders
    const { data: docs } = await admin.from('docs').select('coll, id, data').eq('couple_id', c.id).in('coll', ['couple', 'events']);
    const main = (docs ?? []).find((d) => d.coll === 'couple' && d.id === 'main')?.data as any;
    if (!main?.start) continue;
    const items: string[] = [];
    let dateToday: string | null = null;
    let dateIdx = -1;

    for (const d of (docs ?? []).filter((x) => x.coll === 'events')) {
      const ev = d.data as Ev;
      const s = nextStart(ev, today);
      if (!s) continue;
      const k = diffDays(today, s);
      if (!(ev.alerts ?? []).includes(k)) continue;
      items.push(`${dl(k)} ${ev.title}${ev.time ? ` (${fmtTime(ev.time)})` : ''}`);
      if (k === 0 && ev.kind === 'date' && !dateToday) { dateToday = `${ev.title}${ev.time ? ' ' + fmtTime(ev.time) : ''}`; dateIdx = items.length - 1; }
    }
    const dayNo = diffDays(main.start, today) + 1;
    for (const k of [0, 1, 7]) {
      const n = dayNo + k;
      if (main.autoAnniv !== false && n > 0 && n % 100 === 0) items.push(`${dl(k)} ${n.toLocaleString('ko-KR')}일`);
      const day = addDays(today, k);
      const years = Number(day.slice(0, 4)) - Number(main.start.slice(0, 4));
      if (years > 0 && sameMD(day, main.start)) items.push(`${dl(k)} ${years}주년`);
      for (const role of ['me', 'partner'] as Role[]) {
        const b = main[role]?.birthday;
        if (b && sameMD(day, b)) items.push(`${dl(k)} ${names[role]} 생일`);
      }
    }
    if (!items.length) continue;
    const msg = {
      title: dateToday ? '오늘은 데이트 날!' : '오늘의 알림',
      body: dateToday ? [dateToday, ...items.filter((_, i) => i !== dateIdx)].join(' · ') : items.join(' · '),
      tag: `daily-${today}`,
      url: './#cal',
    };
    sent += await sendToUser(c.me, msg);
    sent += await sendToUser(c.partner, msg);
  }
  return json({ slot, today, sent });
});
