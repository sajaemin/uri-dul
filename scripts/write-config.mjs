// Usage: node scripts/write-config.mjs <project-ref> <keys.json from `supabase projects api-keys -o json`>
// Prints web/config.js with the project URL and its public (anon or publishable) key. Never a secret key.
import fs from 'fs';

const [ref, file, mode] = process.argv.slice(2);
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const list = Array.isArray(raw) ? raw : (raw.keys || raw.api_keys || []);
const val = k => k.api_key || k.key || k.value || '';
const isSecret = k => /service_role|secret/i.test(`${k.name || ''} ${k.type || ''}`) || /^sb_secret_/.test(val(k));
const pub = list.filter(k => !isSecret(k) && val(k));
const pick = pub.find(k => (k.name || '') === 'anon') || pub.find(k => /publishable/i.test(`${k.type || ''} ${k.name || ''}`)) || pub.find(k => /anon/i.test(k.name || ''));
if (!ref || !pick) {
  console.error('Could not find a public key in', file, list.map(k => k.name || k.type));
  process.exit(1);
}
if (mode === '--key-only') { process.stdout.write(val(pick)); process.exit(0); }
process.stdout.write(`// Written by the deploy workflow.\nwindow.UD_CONFIG = {url: 'https://${ref}.supabase.co', key: '${val(pick)}'};\n`);
