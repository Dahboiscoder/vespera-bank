import assert from 'node:assert/strict';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);
const crypto = await import('node:crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = ''; for (const ch of clean) { const idx = BASE32_ALPHABET.indexOf(ch); if (idx === -1) continue; bits += idx.toString(2).padStart(5, '0'); }
  const bytes = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totpCodeAt(secret, counter) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 | (hmac[offset+1] & 0xff) << 16 | (hmac[offset+2] & 0xff) << 8 | (hmac[offset+3] & 0xff)) % 1000000;
  return String(code).padStart(6, '0');
}
function currentTotp(secret) { return totpCodeAt(secret, Math.floor(Date.now()/30000)); }

const email = `twofa${Date.now()}@example.test`;
const password = 'Password#2026';
let r = await fetch(base + '/register', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({name:'Twofa Test',email,phone:'+15550001234',password,confirmPassword:password}), redirect:'manual' });
const cookie = r.headers.get('set-cookie');
const access = r.headers.get('location').split('access=')[1];

r = await fetch(base + `/dashboard/security?access=${access}`, { headers:{cookie} });
let html = await r.text();
assert.ok(html.includes('Set Up 2FA'));
assert.ok(!html.includes('Biometric'), 'fake Biometric badge should be gone');
const csrf = html.match(/name="_csrf" value="([^"]+)/)[1];
console.log('security page shows real badges, no fake Biometric, 2FA not yet set up');

r = await fetch(base + '/dashboard/security/2fa/start', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:access}), redirect:'manual' });
assert.equal(r.status, 302);
r = await fetch(base + `/dashboard/security?access=${access}`, { headers:{cookie} });
html = await r.text();
const secretMatch = html.match(/Manual entry key: <b>([A-Z2-7]+)<\/b>/);
assert.ok(secretMatch, 'pending secret should be shown');
const secret = secretMatch[1];
console.log('2FA setup started, secret shown');

r = await fetch(base + '/dashboard/security/2fa/confirm', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:access,code:'000000'}), redirect:'manual' });
assert.equal(r.status, 302);
assert.ok(r.headers.get('location').includes('twofaError'));
console.log('wrong code rejected during confirm');

const code1 = currentTotp(secret);
r = await fetch(base + '/dashboard/security/2fa/confirm', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:access,code:code1}), redirect:'manual' });
assert.equal(r.status, 302);
r = await fetch(base + `/dashboard/security?access=${access}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('Two-factor authentication is enabled'));
console.log('correct code confirms and enables 2FA');

// Now log in again with password -> should be challenged for 2FA
r = await fetch(base + '/login', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({email,password}), redirect:'manual' });
assert.equal(r.status, 302);
assert.equal(r.headers.get('location'), '/login/2fa');
const challengeCookie = r.headers.get('set-cookie');
console.log('password login redirects to 2FA challenge instead of dashboard');

r = await fetch(base + '/login/2fa', { method:'POST', headers:{cookie:challengeCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({code:'000000'}), redirect:'manual' });
assert.equal(r.status, 400);
console.log('wrong 2FA code at login rejected');

const code2 = currentTotp(secret);
r = await fetch(base + '/login/2fa', { method:'POST', headers:{cookie:challengeCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({code:code2}), redirect:'manual' });
assert.equal(r.status, 302);
assert.ok(r.headers.get('location').startsWith('/dashboard'));
const loggedInCookie = r.headers.get('set-cookie');
const newAccess = r.headers.get('location').split('access=')[1];
console.log('correct 2FA code completes login');

// Login alert notification should exist
r = await fetch(base + `/dashboard/notifications?access=${newAccess}`, { headers:{cookie:loggedInCookie} });
html = await r.text();
assert.ok(html.includes('New sign-in to your account'), 'login alert notification should have been created');
console.log('login alert notification created');

// Disable 2FA
r = await fetch(base + `/dashboard/security?access=${newAccess}`, { headers:{cookie:loggedInCookie} });
html = await r.text();
const csrf2 = html.match(/name="_csrf" value="([^"]+)/)[1];
r = await fetch(base + '/dashboard/security/2fa/disable', { method:'POST', headers:{cookie:loggedInCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf2,_access:newAccess,password:'WrongPassword#1'}), redirect:'manual' });
assert.equal(r.status, 302);
assert.ok(r.headers.get('location').includes('twofaError'));
r = await fetch(base + '/dashboard/security/2fa/disable', { method:'POST', headers:{cookie:loggedInCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf2,_access:newAccess,password}), redirect:'manual' });
assert.equal(r.status, 302);
r = await fetch(base + `/dashboard/security?access=${newAccess}`, { headers:{cookie:loggedInCookie} });
html = await r.text();
assert.ok(html.includes('Set Up 2FA'), '2FA should be back to not-enabled state');
console.log('2FA disabled after password confirmation, login no longer requires it');

r = await fetch(base + '/login', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({email,password}), redirect:'manual' });
assert.equal(r.status, 302);
assert.ok(r.headers.get('location').startsWith('/dashboard'));
console.log('login goes straight to dashboard again after 2FA disabled');

console.log('Two-factor authentication tests passed');
