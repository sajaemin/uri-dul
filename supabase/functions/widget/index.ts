// Read-only summary for the home-screen / lock-screen widget (Scriptable), unlocked by a per-person widget key.
import { admin, cors, diffDays, json, nextStart, todayKST, type Ev, type Role } from '../_shared/common.ts';

const MOODS: Record<string, [string, string]> = { love: ['🥰', '설레'], happy: ['😊', '좋아'], calm: ['😌', '평온'], miss: ['🥺', '보고 싶어'], tired: ['😪', '피곤해'], busy: ['🫠', '바빠'], sad: ['🥲', '울적해'], grr: ['😤', '짜증 나'] };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const t = new URL(req.url).searchParams.get('t') || '';
  if (!/^[A-Z0-9]{24}$/.test(t)) return json({ error: 'bad_key' }, 400);
  const { data: c } = await admin.from('couples').select('id, me, partner, me_wt, partner_wt').or(`me_wt.eq.${t},partner_wt.eq.${t}`).maybeSingle();
  if (!c) return json({ error: 'unknown_key' }, 404);
  const role: Role = c.me_wt === t ? 'me' : 'partner';
  const other: Role = role === 'me' ? 'partner' : 'me';
  const today = todayKST();

  const { data: rows } = await admin.from('docs').select('coll, id, data').eq('couple_id', c.id).in('coll', ['couple', 'events', 'moods', 'answers', 'letters', 'photos']);
  const docs = rows ?? [];
  const main = docs.find((d) => d.coll === 'couple' && d.id === 'main')?.data as any;
  if (!main?.start) return json({ ready: false, message: '앱에서 우리 정보를 먼저 넣어 주세요' });
  const name = (r: Role) => main[r]?.name || (r === role ? '나' : '상대');

  // next date
  let next: { title: string; date: string; time: string; days: number } | null = null;
  for (const d of docs.filter((x) => x.coll === 'events')) {
    const ev = d.data as Ev;
    if (ev.kind !== 'date') continue;
    const s = nextStart(ev, today);
    if (s && (!next || s < next.date || (s === next.date && (ev.time || '') < next.time))) next = { title: ev.title, date: s, time: ev.time || '', days: diffDays(today, s) };
  }

  // next anniversary or birthday
  const dayNo = diffDays(main.start, today) + 1;
  const cands: { label: string; days: number }[] = [];
  if (main.autoAnniv !== false) { const n = Math.ceil(dayNo / 100) * 100; cands.push({ label: `${n.toLocaleString('ko-KR')}일`, days: n - dayNo }); }
  const yearly = (md: string, label: (y: number) => string) => {
    for (let i = 0; i < 2; i++) {
      const y = Number(today.slice(0, 4)) + i, ds = `${y}-${md}`;
      if (ds >= today) { cands.push({ label: label(y), days: diffDays(today, ds) }); return; }
    }
  };
  yearly(main.start.slice(5), (y) => `${y - Number(main.start.slice(0, 4))}주년`);
  for (const r of ['me', 'partner'] as Role[]) if (main[r]?.birthday) yearly(main[r].birthday.slice(5), () => `${name(r)} 생일`);
  const anniv = cands.filter((x) => x.label !== '0주년').sort((a, b) => a.days - b.days)[0] || null;

  const mood = (r: Role) => { const m = docs.find((d) => d.coll === 'moods' && d.id === `${today}_${r}`)?.data as any; const mo = m && MOODS[m.m]; return mo ? { emoji: mo[0], label: mo[1], note: m.note || '' } : null; };
  const answered = (r: Role) => docs.some((d) => d.coll === 'answers' && d.id === `${today}_${r}`);
  const newPhotos = docs.filter((d) => d.coll === 'photos' && (d.data as any).from === other && !((d.data as any).savedBy || {})[role]).length;
  const letters = docs.filter((d) => d.coll === 'letters' && (d.data as any).from === other);
  const unread = letters.filter((d) => (d.data as any).openAt <= today && !(d.data as any).readAt).length;
  const sealed = letters.filter((d) => (d.data as any).openAt > today).map((d) => (d.data as any).openAt as string).sort();

  return json({
    ready: true,
    me: name(role), partner: name(other),
    days: dayNo, start: main.start,
    next, anniv,
    mood: { me: mood(role), partner: mood(other) },
    question: { me: answered(role), partner: answered(other) },
    newPhotos, letters: { unread, sealed: sealed.length, nextOpen: sealed[0] ? diffDays(today, sealed[0]) : null },
    updated: new Date().toISOString(),
  });
});
