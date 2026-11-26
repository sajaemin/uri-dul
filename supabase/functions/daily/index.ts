// Called by cron at 09:00 (reminders for dates, anniversaries, birthdays) and 18:00 Korea time (today's question).
import { addDays, admin, coupleNames, cors, diffDays, fmtTime, json, nextStart, sendToUser, todayKST, trusted, wants, type Ev, type Role } from '../_shared/common.ts';

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
    if (slot === 'snap') continue; // 오늘의 한 장 was turned off
    const names = await coupleNames(c.id);
    if (slot === 'evening') {
      if (!c.me || !c.partner) continue;
      const { data: ans } = await admin.from('docs').select('id').eq('couple_id', c.id).eq('coll', 'answers').like('id', `${today}_%`);
      const has = new Set((ans ?? []).map((a) => a.id));
      for (const role of ['me', 'partner'] as Role[]) {
        if (has.has(`${today}_${role}`)) continue;
        if (!(await wants(c.id, role, 'evening'))) continue;
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
      if (!(await wants(c.id, to, 'letters'))) continue;
      sent += await sendToUser(c[to], { title: '편지가 도착했어요 💌', body: `${names[from]}님이 남긴 편지가 오늘 열렸어요`, tag: `letter-${l.id}`, url: './#mem' });
    }

    // morning reminders
    const { data: docs } = await admin.from('docs').select('coll, id, data').eq('couple_id', c.id).in('coll', ['couple', 'events', 'memories']);
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
    // 1년 전 오늘: a memory from this day in an earlier year
    const past = (docs ?? []).filter((x) => x.coll === 'memories').map((x) => x.data as any)
      .filter((m) => typeof m?.date === 'string' && m.date < today && sameMD(m.date, today))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const memLine = past ? `📸 ${Number(today.slice(0, 4)) - Number(past.date.slice(0, 4))}년 전 오늘: ${past.title}` : '';
    if (!items.length && !memLine) continue;
    const body = dateToday ? [dateToday, ...items.filter((_, i) => i !== dateIdx)].join(' · ') : items.join(' · ');
    const msg = {
      title: dateToday ? '오늘은 데이트 날!' : items.length ? '오늘의 알림' : `${memLine.split(':')[0].slice(3)}의 우리`,
      body: [body, memLine].filter(Boolean).join('\n'),
      tag: `daily-${today}`,
      url: items.length ? './#cal' : './#home',
    };
    for (const role of ['me', 'partner'] as Role[]) if (await wants(c.id, role, 'morning')) sent += await sendToUser(c[role], msg);
  }
  return json({ slot, today, sent });
});
