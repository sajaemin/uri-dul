// Public: hands the browser the VAPID public key it needs to subscribe to push.
import { cors, json } from '../_shared/common.ts';

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  return json({ vapidPublicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? null });
});
