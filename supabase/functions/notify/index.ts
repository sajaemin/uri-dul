// Called by the docs table trigger. Tells the other person what just happened.
import { admin, coupleNames, cors, fmtDate, fmtTime, json, sendToUser, todayKST, trusted, wants, type Msg, type Role } from '../_shared/common.ts';

const MOODS: Record<string, string> = { love: '🥰 설레', happy: '😊 좋아', calm: '😌 평온', miss: '🥺 보고 싶어', tired: '😪 피곤해', busy: '🫠 바빠', sad: '🥲 울적해', grr: '😤 짜증 나' };

type Row = { couple_id: string; coll: string; id: string; data: Record<string, any>; by_user: string | null };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!trusted(req)) return json({ error: 'forbidden' }, 403);
  const p = await req.json();
  const r: Row | undefined = p.record;
  if (!r) return json({ skipped: 'no record' });
  const isInsert = p.type === 'INSERT';
  const old: Row | null = p.old_record ?? null;

  const { data: c } = await admin.from('couples').select('id, me, partner').eq('id', r.couple_id).single();
  if (!c) return json({ skipped: 'no couple' });
  const actor: Role | null = r.by_user && r.by_user === c.me ? 'me' : r.by_user && r.by_user === c.partner ? 'partner' : null;
  if (!actor) return json({ skipped: 'unknown actor' });
  const other: Role = actor === 'me' ? 'partner' : 'me';
  const names = await coupleNames(r.couple_id);
  const n = names[actor];
  const d = r.data ?? {};
  let msg: Msg | null = null;
  let to: string | null = (c as any)[other];

  switch (r.coll) {
    case 'answers': {
      if (!isInsert) break;
      const { data: otherAns } = await admin.from('docs').select('id').eq('couple_id', r.couple_id).eq('coll', 'answers').eq('id', `${d.date}_${other}`).maybeSingle();
      msg = otherAns
        ? { title: '둘 다 답했어요!', body: `${n}님의 답이 열렸어요. 지금 확인해 보세요`, tag: `ans-${d.date}`, url: './#q' }
        : { title: `${n}님이 오늘의 질문에 답했어요`, body: '나도 답하면 서로의 답이 열려요', tag: `ans-${d.date}`, url: './#q' };
      break;
    }
    case 'photos':
      if (isInsert) msg = { title: `${n}님이 사진을 올렸어요`, body: d.note ? `“${d.note}”` : '시간 날 때 사진함에서 저장해 주세요', tag: 'photos', url: './#ph' };
      break;
    case 'pokes':
      msg = { title: `${n}님이 콕 찔렀어요`, body: '보고 싶다는 뜻이래요', tag: 'poke', url: './#home' };
      break;
    case 'events':
      if (isInsert) msg = { title: `${n}님이 ${d.kind === 'date' ? '데이트를 잡았어요' : '일정을 추가했어요'}`, body: `${d.title} · ${fmtDate(d.date)}${d.time ? ' ' + fmtTime(d.time) : ''}`, tag: `ev-${r.id}`, url: './#cal' };
      break;
    case 'memories':
      if (isInsert) msg = { title: `${n}님이 추억을 남겼어요`, body: d.title || '새 추억', tag: `mem-${r.id}`, url: './#mem' };
      else if (d.again_me && d.again_partner && !(old?.data?.again_me && old?.data?.again_partner)) msg = { title: '둘 다 또 가고 싶대요 💞', body: `${d.place || d.title} · 우리 단골에 넣었어요`, tag: `again-${r.id}`, url: './#mem' };
      break;
    case 'bucket':
      if (isInsert) msg = { title: `${n}님이 버킷리스트를 추가했어요`, body: d.title, tag: `bk-${r.id}`, url: './#mem' };
      else if (d.done && !old?.data?.done) msg = { title: '버킷리스트 하나 완료!', body: d.title, tag: `bk-${r.id}`, url: './#mem' };
      break;
    case 'moods': {
      const mo = MOODS[d.m as string];
      if (!mo) break;
      const changed = isInsert || old?.data?.m !== d.m;
      if (changed) msg = { title: `${n}님의 오늘 기분 ${mo}`, body: d.note ? `“${d.note}”` : '나도 오늘 기분을 남겨 볼까요?', tag: `mood-${d.date}`, url: './#home' };
      else if (d.note && d.note !== old?.data?.note) msg = { title: `${n}님이 한마디 남겼어요 ${mo.split(' ')[0]}`, body: `“${d.note}”`, tag: `mood-${d.date}`, url: './#home' };
      break;
    }
    case 'letters':
      if (!isInsert) break;
      msg = d.replyTo && d.openAt <= todayKST()
        ? { title: `${n}님이 답장을 보냈어요 💌`, body: d.title || '지금 열어 볼 수 있어요', tag: `letter-${r.id}`, url: './#mem' }
        : d.openAt <= todayKST()
        ? { title: `${n}님이 편지를 보냈어요 💌`, body: d.title || '지금 열어 볼 수 있어요', tag: `letter-${r.id}`, url: './#mem' }
        : { title: `${n}님이 편지를 남겼어요 💌`, body: `${fmtDate(d.openAt)}에 열려요. 그날 아침에 알려 드릴게요`, tag: `letter-${r.id}`, url: './#mem' };
      break;
    case 'comments': {
      if (!isInsert) break;
      const on = String(d.on || ''), coll = on.split('/')[0];
      const what = ({ photos: '사진', memories: '추억', events: '일정', bucket: '버킷리스트' } as Record<string, string>)[coll] || '기록';
      const url = ({ photos: './#ph', memories: './#mem', events: './#cal', bucket: './#mem' } as Record<string, string>)[coll] || './';
      msg = { title: `${n}님이 ${what}에 댓글을 남겼어요 💬`, body: String(d.text || '').slice(0, 80), tag: `cmt-${on}`, url };
      break;
    }
    case 'feeds': {
      if (!isInsert) break;
      const toName = d.to === 'me' || d.to === 'partner' ? (names as any)[d.to] || '' : '';
      msg = d.to === actor
        ? { title: `${n}님이 ${d.e || ''} ${d.name || '밥'}을(를) 먹었어요`, body: '우리 마당에서 냠냠 중이에요', tag: `feed-${r.id}`, url: './#grow' }
        : { title: `${n}님이 ${toName ? toName + ' ' : ''}캐릭터에게 ${d.e || ''} ${d.name || '밥'}을(를) 줬어요 🍙`, body: '배부름이 올라갔어요', tag: `feed-${r.id}`, url: './#grow' };
      break;
    }
    case 'yard':
      if (!isInsert) break;
      msg = d.cat === 'theme'
        ? { title: `${n}님이 마당을 '${d.name}'(으)로 꾸몄어요 🎨`, body: '우리 마당에 놀러 가 볼까요?', tag: `yard-${r.id}`, url: './#grow' }
        : { title: `${n}님이 마당에 ${d.e || ''} ${d.name || '새 물건'}을(를) 들였어요`, body: '우리 마당에 놀러 가 볼까요?', tag: `yard-${r.id}`, url: './#grow' };
      break;
    case 'pings':
      to = r.by_user;
      msg = { title: '알림이 잘 와요', body: '이제 상대 소식을 바로 받아요', tag: 'ping', url: './#us' };
      break;
  }
  if (!msg) return json({ skipped: 'no message' });
  const toRole: Role | null = to && to === c.me ? 'me' : to && to === c.partner ? 'partner' : null;
  if (r.coll !== 'pings' && toRole && !(await wants(c.id, toRole, r.coll))) return json({ skipped: 'muted' });
  const sent = await sendToUser(to, msg);
  return json({ sent });
});
