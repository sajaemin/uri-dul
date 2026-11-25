// Stand-in for web/backend.js when no Supabase is reachable: same window.UDB surface, data kept in localStorage.
// Used by tests/local/walk.mjs to look at every real-mode screen. Set localStorage 'mock-partner' = '1' to have
// a partner already joined, 'mock-start' = 'pair' | 'couple' to start at pairing or inside a couple.
(() => {
  const LS = 'mock-udb';
  const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } };
  const st = Object.assign({info: null, docs: {}}, load());
  const save = () => localStorage.setItem(LS, JSON.stringify(st));
  const listeners = new Set();
  const meta = {hasPendingWrites: false, fromCache: false};
  const snapDoc = (c, i) => { const d = st.docs[c + '/' + i]; return {id: i, exists: !!d, data: () => d, metadata: meta}; };
  const snapColl = c => ({docs: Object.keys(st.docs).filter(k => k.startsWith(c + '/')).map(k => ({id: k.slice(c.length + 1), exists: true, data: () => st.docs[k], metadata: meta})), metadata: meta});
  const fire = () => { for (const l of listeners) setTimeout(() => l(), 0); };
  const deep = (a, b) => { const o = {...(a || {})}; for (const k in b) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? deep(o[k], b[k]) : b[k]; return o; };
  function makeQuery(c, ord, lim) {
    const run = () => { let d = snapColl(c).docs; if (ord) d = d.sort((x, y) => { const a = x.data()[ord[0]], b = y.data()[ord[0]]; return (a < b ? -1 : a > b ? 1 : 0) * (ord[1] === 'desc' ? -1 : 1); }); if (lim) d = d.slice(0, lim); return {docs: d, metadata: meta}; };
    return {
      orderBy: (f, dir) => makeQuery(c, [f, dir || 'asc'], lim),
      limit: n => makeQuery(c, ord, n),
      get: async () => run(),
      onSnapshot: (cb) => { const l = () => cb(run()); listeners.add(l); l(); return () => listeners.delete(l); },
      doc: i => docRef(c, i),
    };
  }
  function docRef(c, i) {
    const k = c + '/' + i;
    return {
      set: async d => { st.docs[k] = JSON.parse(JSON.stringify(d)); save(); fire(); },
      update: async d => { if (!st.docs[k]) throw new Error('not found'); st.docs[k] = deep(st.docs[k], d); save(); fire(); },
      delete: async () => { delete st.docs[k]; save(); fire(); },
      get: async () => snapDoc(c, i),
      onSnapshot: cb => { const l = () => cb(snapDoc(c, i)); listeners.add(l); l(); return () => listeners.delete(l); },
    };
  }
  const db = {doc: p => { const [c, i] = p.split('/'); return docRef(c, i); }, collection: c => makeQuery(c)};
  const code = () => Array.from({length: 6}, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  const later = v => new Promise(r => setTimeout(() => r(v), 150));
  const U = window.UDB = {available: true, uid: 'mock-user'};
  U.start = async () => later(st.info);
  U.info = async () => later(st.info);
  U.create = async () => { st.info = st.info || {couple_id: 'c1', code: code(), role: 'me', rc: 'RC' + code(), partner_joined: localStorage.getItem('mock-partner') === '1'}; save(); return later(st.info); };
  U.join = async c => { if (!/^[A-Z0-9]{6}$/.test(c)) { const e = new Error('code_not_found'); e.code = 'code_not_found'; throw e; } st.info = {couple_id: 'c1', code: c, role: 'partner', rc: 'RC' + code(), partner_joined: true}; save(); return later(st.info); };
  U.recover = async (c) => { st.info = {couple_id: 'c1', code: c, role: 'me', rc: 'RC' + code(), partner_joined: true}; save(); return later(st.info); };
  U.savePush = async () => later(true);
  U.dropPush = async () => later(true);
  U.vapid = async () => later('BAAA');
  U.widgetToken = async () => later('W'.repeat(24));
  U.widgetUrl = t => 'https://example.supabase.co/functions/v1/widget?t=' + t;
  U.watchCouple = () => () => {};
  U.open = () => ({
    db,
    assets: {upload: async blob => { const url = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); }); return {id: 'a' + Date.now(), url, contentType: blob.type}; }, delete: async () => {}},
    dl: {save: async () => {}, saveMany: async () => {}},
  });
  U.partnerJoins = () => { if (st.info) { st.info.partner_joined = true; save(); } };
})();
