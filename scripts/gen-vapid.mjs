// Generates a VAPID key pair. Prints an env file: VAPID_PUBLIC_KEY (base64url, for browsers) and VAPID_PRIVATE_JWK_B64 (for the edge functions).
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const kp = await crypto.subtle.generateKey({name: 'ECDSA', namedCurve: 'P-256'}, true, ['sign', 'verify']);
const pub = await crypto.subtle.exportKey('raw', kp.publicKey);
const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
process.stdout.write(`VAPID_PUBLIC_KEY=${b64u(pub)}\nVAPID_PRIVATE_JWK_B64=${Buffer.from(JSON.stringify(jwk)).toString('base64')}\n`);
