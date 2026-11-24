// Touches the database so Supabase keeps the free project awake; restores it if it was paused anyway.
import { api, findProject, refOf, waitHealthy, sql, publicKey } from './sb.mjs';

const p = await findProject();
if (!p) { console.log('No project yet, nothing to do'); process.exit(0); }
const ref = refOf(p);
if (p.status === 'INACTIVE') {
  console.log('Project was paused, restoring it');
  await api('POST', `/v1/projects/${ref}/restore`, {}, { allow: [400] });
  await waitHealthy(ref, 20);
}
const [row] = await sql(ref, 'select count(*)::int as couples from public.couples');
console.log(`Database is awake (${row.couples} couple${row.couples === 1 ? '' : 's'})`);
// one call through the public API as well, like the app does
const key = await publicKey(ref);
const r = await fetch(`https://${ref}.supabase.co/functions/v1/config`, { headers: { apikey: key } });
console.log(`API answered ${r.status}`);
