// End-to-end test against the real Supabase project: two people pair up, a stranger is kept out,
// data and photos flow both ways in real time, and a change reaches the push function and is sent.
// Needs UD_URL, UD_KEY, UD_REF, NOTIFY_SECRET, SUPABASE_ACCESS_TOKEN (set by scripts/provision.mjs).
import fs from 'fs';
import vm from 'vm';
import { sql } from '../../scripts/sb.mjs';

vm.runInThisContext(fs.readFileSync(new URL('../../web/vendor/supabase.js', import.meta.url), 'utf8'));
const { UD_URL: URL0, UD_KEY: KEY, UD_REF: REF, NOTIFY_SECRET } = process.env;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const ok = (cond, label) => { console.log(`${cond ? '✓' : '✗'} ${label}`); if (!cond) failed++; };
const client = () => supabase.createClient(URL0, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
async function person() {
  const c = client();
  const { data, error } = await c.auth.signInAnonymously();
  if (error) throw new Error('anonymous sign-in failed: ' + error.message);
  c.realtime.setAuth(data.session.access_token);
  return { c, uid: data.user.id };
}
const rpc = async (p, name, args) => { const r = await p.c.rpc(name, args || {}); return r; };
const errOf = r => (r.error && r.error.message) || '';

const users = [];
let cid = null;
try {
  const A = await person(), B = await person(), C = await person(), D = await person();
  users.push(A.uid, B.uid, C.uid, D.uid);
  ok(true, 'four phones signed in anonymously');

  // pairing
  const a = (await rpc(A, 'create_couple')).data;
  cid = a.couple_id;
  ok(a.role === 'me' && a.code.length === 6 && a.rc.length === 8, `A started a couple (code ${a.code.slice(0, 2)}····)`);
  ok(/code_not_found/.test(errOf(await rpc(B, 'join_couple', { p_code: 'ZZZZZZ' }))), 'a wrong code is refused');
  const b = (await rpc(B, 'join_couple', { p_code: a.code.toLowerCase() })).data;
  ok(b && b.role === 'partner' && b.partner_joined, 'B joined with the code');
  ok(/couple_full/.test(errOf(await rpc(C, 'join_couple', { p_code: a.code }))), 'a third person cannot join');

  // documents
  const doc = (p, coll, id, data) => p.c.from('docs').upsert({ couple_id: cid, coll, id, data, by_user: p.uid });
  ok(!(await doc(A, 'couple', 'main', { me: { name: '테스트A' }, partner: { name: '테스트B' }, start: '2025-03-14' })).error, 'A saved the couple info');
  const seen = await B.c.from('docs').select('data').eq('couple_id', cid).eq('coll', 'couple');
  ok(seen.data && seen.data.length === 1 && seen.data[0].data.me.name === '테스트A', 'B reads what A saved');
  const cs = await C.c.from('docs').select('id').eq('couple_id', cid);
  ok(!cs.error && cs.data.length === 0, 'the stranger reads nothing');
  ok(!!(await C.c.from('docs').insert({ couple_id: cid, coll: 'answers', id: 'x', data: {}, by_user: C.uid })).error, 'the stranger cannot write');
  ok(!!(await B.c.from('docs').upsert({ couple_id: cid, coll: 'answers', id: 'y', data: {}, by_user: A.uid })).error, 'B cannot write in A\'s name');

  // realtime: B hears A's change
  let heard = null;
  const ch = B.c.channel('t-' + cid).on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: 'couple_id=eq.' + cid }, p => { if (p.new && p.new.coll === 'moods') heard = p.new; });
  await new Promise(res => ch.subscribe(s => { if (s === 'SUBSCRIBED') res(); }));
  await sleep(1500);
  // the change feed can take a few seconds to warm up after a deploy, so A writes again if B has not heard yet
  for (let k = 0; k < 4 && !heard; k++) {
    await doc(A, 'moods', '2026-01-01_me', { date: '2026-01-01', who: 'me', m: 'love', note: 'e2e ' + k });
    for (let i = 0; i < 32 && !heard; i++) await sleep(250);
  }
  ok(heard && heard.data.m === 'love', 'B got A\'s mood live (realtime)');
  await B.c.removeChannel(ch);

  // photos
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const path = `${cid}/e2e.png`;
  const up = await A.c.storage.from('photos').upload(path, new Blob([png], { type: 'image/png' }), { contentType: 'image/png' });
  ok(!up.error, 'A uploaded a photo');
  const su = await B.c.storage.from('photos').createSignedUrl(path, 600);
  const got = su.data ? Buffer.from(await (await fetch(su.data.signedUrl)).arrayBuffer()) : Buffer.alloc(0);
  ok(got.equals(png), 'B downloaded the same photo');
  const cu = await C.c.storage.from('photos').createSignedUrl(path, 600);
  ok(!!cu.error, 'the stranger cannot get the photo');
  ok(!!(await C.c.storage.from('photos').upload(`${cid}/evil.png`, new Blob([png], { type: 'image/png' }))).error, 'the stranger cannot put photos in our folder');

  // push: B registers a phone; A answers; the trigger calls the function, which encrypts and sends to B
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const p256dh = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey)).toString('base64url');
  const sub = { endpoint: `${URL0}/functions/v1/config?e2e=${Date.now()}`, keys: { p256dh, auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url') } };
  ok(!(await rpc(B, 'save_push', { p_sub: sub })).error, 'B turned on notifications');
  const since = (await sql(REF, 'select now() as t'))[0].t;
  await doc(A, 'answers', '2026-01-01_me', { date: '2026-01-01', text: 'e2e 답' });
  let rows = [];
  for (let i = 0; i < 30; i++) {
    rows = await sql(REF, `select status_code, content::text as content from net._http_response where created >= $1 order by created`, [since]);
    if (rows.some(r => /"sent"/.test(r.content || ''))) break;
    await sleep(1000);
  }
  const hit = rows.find(r => /"sent"/.test(r.content || ''));
  ok(hit && hit.status_code === 200 && /"sent":1/.test(hit.content), `the change reached the push function and one notification was sent (${hit ? hit.content : 'no response'})`);
  // B turns off answer notifications: A's next answer is skipped for B
  await doc(B, 'prefs', 'partner', { off: ['answers'] });
  const since2 = (await sql(REF, 'select now() as t'))[0].t;
  await doc(A, 'answers', '2026-01-02_me', { date: '2026-01-02', text: 'e2e 답 2' });
  let rows2 = [];
  for (let i = 0; i < 30; i++) {
    rows2 = await sql(REF, `select status_code, content::text as content from net._http_response where created >= $1 order by created`, [since2]);
    if (rows2.some(r => /"muted"|"sent"/.test(r.content || ''))) break;
    await sleep(1000);
  }
  ok(rows2.some(r => /"muted"/.test(r.content || '')) && !rows2.some(r => /"sent":1/.test(r.content || '')), 'a notification kind B turned off is not sent');
  await doc(B, 'prefs', 'partner', { off: [] });
  const fn = u => fetch(`${URL0}/functions/v1/${u}`, { method: 'POST', headers: { 'x-notify-secret': NOTIFY_SECRET, 'Content-Type': 'application/json', apikey: KEY }, body: '{}' });
  const dm = await fn(`daily?slot=morning&couple=${cid}`), de = await fn(`daily?slot=evening&couple=${cid}`);
  const again = await (await fn(`daily?slot=morning&couple=${cid}`)).json().catch(() => ({}));
  ok(again.sent === 0, 'the 9am job sends at most once a day');
  ok(dm.status === 200 && de.status === 200, `the 9am and 6pm jobs run (${dm.status}, ${de.status})`);
  const bad = await fetch(`${URL0}/functions/v1/notify`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY }, body: '{}' });
  ok(bad.status === 403, 'outsiders cannot trigger notifications');
  const cfg = await (await fetch(`${URL0}/functions/v1/config`, { headers: { apikey: KEY } })).json();
  ok(typeof cfg.vapidPublicKey === 'string' && cfg.vapidPublicKey.length > 80, 'the app can get the push key');
  const jobs = await sql(REF, `select jobname from cron.job where jobname like 'uridul-%' order by 1`);
  ok(jobs.length === 2 && !jobs.some(j => j.jobname === 'uridul-snap'), 'only the 9am and 6pm schedules run');

  // home-screen widget: a private key gives a read-only summary, no sign-in needed
  const wt = (await rpc(B, 'widget_token')).data;
  const wr = await fetch(`${URL0}/functions/v1/widget?t=${wt}`);
  const wj = wr.ok ? await wr.json() : {};
  ok(wj.ready && wj.me === '테스트B' && wj.partner === '테스트A' && wj.days > 600, `the widget summary works without signing in (${wr.status}, ${wj.days} days)`);
  ok((await fetch(`${URL0}/functions/v1/widget?t=AAAAAAAAAAAAAAAAAAAAAAAA`)).status === 404, 'an unknown widget key gets nothing');
  const wt2 = (await rpc(B, 'widget_token', { p_reset: true })).data;
  ok(wt2 !== wt && (await fetch(`${URL0}/functions/v1/widget?t=${wt}`)).status === 404, 'resetting the widget key stops the old one');
  const rcLeak = await B.c.from('couples').select('me_rc');
  ok(!!rcLeak.error, 'B cannot read A\'s recovery code');

  // recovery: a new phone takes A's place with the code + A's recovery code
  ok(/bad_recovery/.test(errOf(await rpc(D, 'recover_couple', { p_code: a.code, p_rc: 'WRONG123' }))), 'a wrong recovery code is refused');
  const d = (await rpc(D, 'recover_couple', { p_code: a.code, p_rc: a.rc })).data;
  ok(d && d.role === 'me', 'a new phone recovered A\'s records');
  const an = await A.c.from('docs').select('id').eq('couple_id', cid);
  ok(!an.error && an.data.length === 0, 'the old phone lost access');

  await B.c.storage.from('photos').remove([path]);
} catch (e) {
  console.error(e);
  failed++;
} finally {
  if (cid) await sql(REF, 'delete from public.couples where id = $1', [cid]).catch(e => console.error('cleanup', e.message));
  const ids = users.filter(u => /^[0-9a-f-]{36}$/.test(u)).map(u => `'${u}'`).join(',');
  if (ids) await sql(REF, `delete from auth.users where id in (${ids})`).catch(e => console.error('cleanup', e.message));
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall backend checks passed');
process.exit(failed ? 1 : 0);
