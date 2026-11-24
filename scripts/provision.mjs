// Sets up (or updates) the Supabase project for 우리 둘 using only SUPABASE_ACCESS_TOKEN:
// finds or creates the project, wakes it if paused, turns on anonymous sign-in, applies migrations,
// sets function secrets and connects the database to the functions. Writes web/config.js.
// Outputs for later workflow steps go to $GITHUB_ENV: UD_REF, UD_URL, UD_KEY, NOTIFY_SECRET.
import fs from 'fs';
import crypto from 'crypto';
import { api, findProject, refOf, waitHealthy, sql, publicKey, NAME } from './sb.mjs';

const log = (...a) => console.log(...a);
const env = (k, v, secret) => {
  if (secret) console.log(`::add-mask::${v}`);
  if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, `${k}=${v}\n`);
};
const rand = n => crypto.randomBytes(n).toString('base64url');

// 1. project
let p = await findProject();
if (!p) {
  const { data: orgs } = await api('GET', '/v1/organizations');
  let org = (orgs || [])[0];
  if (!org) {
    log('No Supabase organization yet, creating one');
    org = (await api('POST', '/v1/organizations', { name: '우리 둘' })).data;
  }
  const slug = org.slug || org.id;
  log(`Creating Supabase project "${NAME}" in organization ${org.name} (Seoul)`);
  const base = { name: NAME, organization_slug: slug, db_pass: rand(24) };
  try {
    p = (await api('POST', '/v1/projects', { ...base, region_selection: { type: 'specific', code: 'ap-northeast-2' } }, { tries: 2 })).data;
  } catch (e) {
    if (e.status === 402 || /limit|maximum|free/i.test(e.message)) {
      console.error('::error::Supabase 무료 프로젝트 한도(2개)에 걸렸어요. 쓰지 않는 프로젝트를 지우거나 멈춘 뒤 다시 실행해 주세요.');
      throw e;
    }
    if (e.status !== 400 && e.status !== 422) throw e;
    p = (await api('POST', '/v1/projects', { ...base, region: 'ap-northeast-2' }, { tries: 2 })).data;
  }
} else {
  log(`Using Supabase project "${p.name}" (${refOf(p)}), status ${p.status}`);
}
const ref = refOf(p);
if (p.status === 'INACTIVE') {
  log('Project is paused, waking it up');
  await api('POST', `/v1/projects/${ref}/restore`, {}, { allow: [400] });
}
await waitHealthy(ref, 20);

// the database can lag behind the status for a little while
for (let i = 1; ; i++) {
  try { await sql(ref, 'select 1 as ok'); break; } catch (e) { if (i >= 20) throw e; await new Promise(r => setTimeout(r, 6000)); }
}

// 2. anonymous sign-in (each phone gets its own account without email)
await api('PATCH', `/v1/projects/${ref}/config/auth`, { external_anonymous_users_enabled: true });
log('Anonymous sign-ins: on');

// 3. migrations, each applied once
await sql(ref, `create schema if not exists private;
create table if not exists private.ud_migrations (name text primary key, applied_at timestamptz not null default now());
revoke all on schema private from public, anon, authenticated;`);
const done = new Set((await sql(ref, 'select name from private.ud_migrations')).map(r => r.name));
const files = fs.readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort();
for (const f of files) {
  if (done.has(f)) continue;
  log(`Applying migration ${f}`);
  const body = fs.readFileSync(`supabase/migrations/${f}`, 'utf8');
  await sql(ref, `${body}\n;insert into private.ud_migrations (name) values ('${f.replace(/'/g, "''")}');`);
}

// 4. function secrets: push keys made once and kept; the shared trigger secret is renewed on each deploy
const { data: secrets } = await api('GET', `/v1/projects/${ref}/secrets`);
const have = new Set((secrets || []).map(s => s.name));
const notify = rand(32);
const put = [
  { name: 'NOTIFY_SECRET', value: notify },
  { name: 'VAPID_SUBJECT', value: 'mailto:uridul@users.noreply.github.com' },
];
if (!have.has('VAPID_PUBLIC_KEY') || !have.has('VAPID_PRIVATE_JWK_B64')) {
  const kp = await crypto.webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = Buffer.from(await crypto.webcrypto.subtle.exportKey('raw', kp.publicKey)).toString('base64url');
  const jwk = await crypto.webcrypto.subtle.exportKey('jwk', kp.privateKey);
  put.push({ name: 'VAPID_PUBLIC_KEY', value: pub }, { name: 'VAPID_PRIVATE_JWK_B64', value: Buffer.from(JSON.stringify(jwk)).toString('base64') });
  log('Made new push keys');
}
await api('POST', `/v1/projects/${ref}/secrets`, put);
await sql(ref, `insert into private.config (k, v) values ('functions_url', $1), ('notify_secret', $2)
  on conflict (k) do update set v = excluded.v`, [`https://${ref}.supabase.co/functions/v1`, notify]);
log('Function secrets set; database connected to the functions');

// 5. the app's public config
const key = await publicKey(ref);
fs.writeFileSync('web/config.js', `// Written by the deploy workflow.\nwindow.UD_CONFIG = {url: 'https://${ref}.supabase.co', key: '${key}'};\n`);
env('UD_REF', ref);
env('UD_URL', `https://${ref}.supabase.co`);
env('UD_KEY', key);
env('NOTIFY_SECRET', notify, true);
log('Wrote web/config.js');
