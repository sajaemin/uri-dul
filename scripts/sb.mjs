// Small client for the Supabase Management API (https://api.supabase.com), used by the deploy, test and keepalive jobs.
// Needs SUPABASE_ACCESS_TOKEN in the environment.
const API = 'https://api.supabase.com';
export const NAME = process.env.UD_PROJECT_NAME || 'uri-dul';
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function api(method, path, body, { tries = 6, allow = [] } = {}) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is not set');
  for (let i = 1; ; i++) {
    let res, text;
    try {
      res = await fetch(API + path, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      text = await res.text();
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(3000 * i);
      continue;
    }
    if (res.ok || allow.includes(res.status)) {
      try { return { status: res.status, data: text ? JSON.parse(text) : null }; } catch { return { status: res.status, data: text }; }
    }
    if ((res.status === 429 || res.status >= 500) && i < tries) { await sleep(4000 * i); continue; }
    const err = new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
    err.status = res.status;
    throw err;
  }
}

export async function findProject() {
  const { data } = await api('GET', '/v1/projects');
  const ref = process.env.UD_PROJECT_REF;
  return (data || []).find(p => (ref ? p.ref === ref || p.id === ref : p.name === NAME)) || null;
}

export const refOf = p => p.ref || p.id;

export async function waitHealthy(ref, minutes = 15) {
  const end = Date.now() + minutes * 60e3;
  let last = '';
  while (Date.now() < end) {
    const { data } = await api('GET', `/v1/projects/${ref}`);
    if (data.status !== last) { console.log(`  project status: ${data.status}`); last = data.status; }
    if (data.status === 'ACTIVE_HEALTHY') return data;
    if (/FAILED|REMOVED/.test(data.status)) throw new Error(`project is ${data.status}`);
    await sleep(10000);
  }
  throw new Error('project did not become healthy in time');
}

/** Runs SQL as the database owner. Returns rows. */
export async function sql(ref, query, parameters) {
  const body = parameters ? { query, parameters } : { query };
  const { data } = await api('POST', `/v1/projects/${ref}/database/query`, body);
  return data;
}

export async function publicKey(ref) {
  for (const reveal of ['false', 'true']) {
    const { data } = await api('GET', `/v1/projects/${ref}/api-keys?reveal=${reveal}`);
    const list = (data || []).filter(k => k.api_key && !/secret|service_role/i.test(`${k.type || ''} ${k.name || ''}`) && !/^sb_secret_/.test(k.api_key));
    const pick = list.find(k => k.type === 'publishable') || list.find(k => k.name === 'anon');
    if (pick) return pick.api_key;
  }
  throw new Error('no public API key found');
}
