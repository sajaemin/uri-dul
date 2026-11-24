import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendPush, vapidFromEnv, type Sub } from './webpush.ts';

export const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notify-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Requests from our own database triggers and cron jobs carry the shared secret. */
export function trusted(req: Request): boolean {
  const s = Deno.env.get('NOTIFY_SECRET');
  return !!s && req.headers.get('x-notify-secret') === s;
}

export type Msg = { title: string; body: string; tag?: string; url?: string };

export async function sendToUser(userId: string | null, msg: Msg): Promise<number> {
  if (!userId) return 0;
  const { data } = await admin.from('push_subs').select('endpoint, sub').eq('user_id', userId);
  const vapid = vapidFromEnv((k) => Deno.env.get(k));
  let sent = 0;
  for (const row of data ?? []) {
    try {
      const status = await sendPush(row.sub as Sub, msg, vapid);
      if (status === 404 || status === 410) await admin.from('push_subs').delete().eq('endpoint', row.endpoint);
      else if (status < 300) sent++;
      else console.error('push rejected', status, row.endpoint.slice(0, 40));
    } catch (e) {
      console.error('push failed', e);
    }
  }
  return sent;
}

export type Couple = { id: string; me: string | null; partner: string | null };
export type Role = 'me' | 'partner';

export async function coupleNames(coupleId: string): Promise<Record<Role, string>> {
  const { data } = await admin.from('docs').select('data').eq('couple_id', coupleId).eq('coll', 'couple').eq('id', 'main').maybeSingle();
  const d = (data?.data ?? {}) as Record<string, { name?: string }>;
  return { me: d.me?.name || '나', partner: d.partner?.name || '상대' };
}

// ---- dates in Korea time ----
const KST = 9 * 3600e3;
export const todayKST = () => new Date(Date.now() + KST).toISOString().slice(0, 10);
export const toUTC = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => ymd(toUTC(s) + n * 864e5);
export const diffDays = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / 864e5);
const WD = ['일', '월', '화', '수', '목', '금', '토'];
export const fmtDate = (s: string) => { const d = new Date(toUTC(s)); return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WD[d.getUTCDay()]})`; };
export const fmtTime = (t?: string) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}:${String(m).padStart(2, '0')}`;
};
