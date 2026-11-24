// 우리 둘 — Supabase backend for the installable app.
// Exposes window.UDB with the same small surface the page already uses (db, assets, downloads),
// plus couple pairing and push subscription helpers.
(() => {
  const C = window.UD_CONFIG || {};
  const UDB = {available: !!(C.url && C.key && window.supabase)};
  window.UDB = UDB;
  if (!UDB.available) return;
  let sb = null;
  const err = (e, code) => Object.assign(new Error((e && e.message) || String(e)), {code: code || (e && e.code) || 'unavailable'});
  const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  UDB.start = async () => {
    sb = window.supabase.createClient(C.url, C.key, {auth: {persistSession: true, autoRefreshToken: true, storageKey: 'ud-auth', detectSessionInUrl: false}});
    let {data: {session}} = await sb.auth.getSession();
    if (!session) {
      const r = await sb.auth.signInAnonymously();
      if (r.error) throw err(r.error, /anonymous/i.test(r.error.message) ? 'anon_disabled' : 'auth');
      session = r.data.session;
    }
    UDB.uid = session.user.id;
    return UDB.info();
  };
  const rpc = async (name, args) => {
    const {data, error} = await sb.rpc(name, args || {});
    if (error) {
      const m = error.message || '';
      throw err(error, ['code_not_found', 'couple_full', 'bad_recovery', 'no_couple'].find(k => m.includes(k)) || 'unavailable');
    }
    return data;
  };
  UDB.info = () => rpc('my_info');
  UDB.create = () => rpc('create_couple');
  UDB.join = code => rpc('join_couple', {p_code: code});
  UDB.recover = (code, rc) => rpc('recover_couple', {p_code: code, p_rc: rc});
  UDB.savePush = sub => rpc('save_push', {p_sub: sub});
  UDB.dropPush = endpoint => rpc('drop_push', {p_endpoint: endpoint});
  UDB.vapid = async () => {
    const r = await fetch(C.url + '/functions/v1/config', {headers: {apikey: C.key}});
    const j = await r.json();
    if (!j.vapidPublicKey) throw err('push is not set up yet', 'no_vapid');
    return j.vapidPublicKey;
  };
  UDB.watchCouple = (cid, cb) => {
    sb.channel('couple-' + cid).on('postgres_changes', {event: '*', schema: 'public', table: 'couples', filter: 'id=eq.' + cid}, cb).subscribe();
  };

  // ---------- documents: a tiny Firestore-like store over one "docs" table ----------
  function deepMerge(a, b) {
    const out = {...a};
    for (const k of Object.keys(b)) {
      const v = b[k];
      out[k] = v && typeof v === 'object' && !Array.isArray(v) && a && typeof a[k] === 'object' && a[k] && !Array.isArray(a[k]) ? deepMerge(a[k], v) : v;
    }
    return out;
  }
  function makeDB(cid) {
    const cache = new Map();
    const listeners = new Set();
    const key = (c, i) => c + '/' + i;
    const meta = {fromCache: false, hasPendingWrites: false};
    const snapDoc = (c, i) => { const d = cache.get(key(c, i)); return {id: i, exists: !!d, data: () => d, metadata: meta}; };
    const snapColl = c => {
      const docs = [];
      for (const [k, d] of cache) if (k.startsWith(c + '/')) docs.push({id: k.slice(c.length + 1), exists: true, data: () => d, metadata: meta});
      return {docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: meta};
    };
    const fire = c => { for (const l of listeners) if (l.coll === c) l.kind === 'doc' ? l.cb(snapDoc(c, l.id)) : l.cb(l.q(snapColl(c))); };
    const fireAll = () => { for (const l of listeners) l.kind === 'doc' ? l.cb(snapDoc(l.coll, l.id)) : l.cb(l.q(snapColl(l.coll))); };
    async function load() {
      const next = new Map();
      for (let from = 0; ; from += 1000) {
        const {data, error} = await sb.from('docs').select('coll,id,data').eq('couple_id', cid).range(from, from + 999);
        if (error) throw err(error);
        data.forEach(r => next.set(key(r.coll, r.id), r.data));
        if (data.length < 1000) break;
      }
      cache.clear(); for (const [k, v] of next) cache.set(k, v);
      fireAll();
    }
    const ready = load();
    sb.channel('docs-' + cid).on('postgres_changes', {event: '*', schema: 'public', table: 'docs', filter: 'couple_id=eq.' + cid}, p => {
      if (p.eventType === 'DELETE') {
        const o = p.old || {};
        if (o.couple_id && o.couple_id !== cid) return;
        if (o.coll) { cache.delete(key(o.coll, o.id)); fire(o.coll); }
      } else if (p.new && p.new.coll) {
        cache.set(key(p.new.coll, p.new.id), p.new.data); fire(p.new.coll);
      }
    }).subscribe();
    const resync = () => { if (document.visibilityState === 'visible') load().catch(() => {}); };
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('online', resync);

    const write = async (c, i, data) => {
      cache.set(key(c, i), data); fire(c);
      const {error} = await sb.from('docs').upsert({couple_id: cid, coll: c, id: i, data, by_user: UDB.uid});
      if (error) throw err(error, /quota|limit/i.test(error.message) ? 'quota_exceeded' : 'unavailable');
    };
    const docRef = path => {
      const [c, i] = path.split('/');
      return {
        id: i, path,
        get: async () => { await ready; return snapDoc(c, i); },
        set: data => write(c, i, data),
        update: async patch => { await ready; const cur = cache.get(key(c, i)); if (!cur) throw err('missing document', 'invalid_argument'); return write(c, i, deepMerge(cur, patch)); },
        delete: async () => {
          cache.delete(key(c, i)); fire(c);
          const {error} = await sb.from('docs').delete().match({couple_id: cid, coll: c, id: i});
          if (error) throw err(error);
        },
        onSnapshot: (cb, onErr) => {
          const l = {kind: 'doc', coll: c, id: i, cb};
          listeners.add(l);
          ready.then(() => cb(snapDoc(c, i)), e => onErr && onErr(err(e)));
          return () => listeners.delete(l);
        },
      };
    };
    const collRef = (c, ord, lim) => {
      const q = s => {
        let docs = s.docs;
        if (ord) { const [f, dir] = ord; docs = [...docs].sort((a, b) => { const x = a.data()[f], y = b.data()[f]; return (x > y ? 1 : x < y ? -1 : 0) * (dir === 'desc' ? -1 : 1); }); }
        if (lim) docs = docs.slice(0, lim);
        return {...s, docs, size: docs.length, empty: !docs.length};
      };
      return {
        path: c,
        orderBy: (f, dir) => collRef(c, [f, dir || 'asc'], lim),
        limit: n => collRef(c, ord, n),
        doc: id => docRef(c + '/' + (id || rid())),
        add: async data => { const r = docRef(c + '/' + rid()); await r.set(data); return r; },
        get: async () => { await ready; return q(snapColl(c)); },
        onSnapshot: (cb, onErr) => {
          const l = {kind: 'coll', coll: c, cb, q};
          listeners.add(l);
          ready.then(() => cb(q(snapColl(c))), e => onErr && onErr(err(e)));
          return () => listeners.delete(l);
        },
      };
    };
    return {doc: docRef, collection: c => collRef(c), ready};
  }

  // ---------- photos: private bucket, one folder per couple ----------
  function makeAssets(cid) {
    const extOf = t => ({'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif'})[t] || 'jpg';
    return {
      upload: async blob => {
        const type = blob.type || 'image/jpeg';
        const path = `${cid}/${rid()}.${extOf(type)}`;
        const up = await sb.storage.from('photos').upload(path, blob, {contentType: type, upsert: false});
        if (up.error) throw err(up.error, /exceed|size/i.test(up.error.message) ? 'quota_exceeded' : 'unavailable');
        const s = await sb.storage.from('photos').createSignedUrl(path, 315360000);
        if (s.error) throw err(s.error);
        return {id: path, url: s.data.signedUrl, contentType: type, sizeBytes: blob.size};
      },
      delete: async id => { await sb.storage.from('photos').remove([id]); },
    };
  }

  // ---------- saving files to the phone: the share sheet ("이미지 저장"), or a normal download ----------
  const shareFiles = async files => {
    if (navigator.canShare && navigator.canShare({files})) {
      try { await navigator.share({files}); return {status: 'saved'}; }
      catch (e) {
        if (e && e.name === 'AbortError') throw err('declined', 'declined');
        if (e && e.name === 'NotAllowedError') throw err('needs a fresh tap', 'need_tap');
        throw err(e);
      }
    }
    for (const f of files) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(f); a.download = f.name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
    return {status: 'saved'};
  };
  const mime = n => ({png: 'image/png', webp: 'image/webp', gif: 'image/gif'})[n.split('.').pop()] || 'image/jpeg';
  const toFile = ({filename, data}) => new File([data], filename, {type: data.type || mime(filename)});
  const makeDL = () => ({save: r => shareFiles([toFile(r)]), saveMany: rs => shareFiles(rs.map(toFile))});

  UDB.open = info => ({db: makeDB(info.couple_id), assets: makeAssets(info.couple_id), dl: makeDL()});
})();
