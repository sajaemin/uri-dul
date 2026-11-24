// Called once per deploy by GitHub Actions: tells the database where the functions live and which secret to send.
import { admin, cors, json, trusted } from '../_shared/common.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!trusted(req)) return json({ error: 'forbidden' }, 403);
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1`;
  const a = await admin.rpc('admin_set_config', { p_k: 'functions_url', p_v: url });
  const b = await admin.rpc('admin_set_config', { p_k: 'notify_secret', p_v: Deno.env.get('NOTIFY_SECRET')! });
  if (a.error || b.error) return json({ error: (a.error ?? b.error)!.message }, 500);
  return json({ ok: true, functions_url: url });
});
