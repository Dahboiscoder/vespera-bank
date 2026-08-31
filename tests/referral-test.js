import assert from 'node:assert/strict';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);
const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

const referrerEmail = `referrer${Date.now()}@example.test`;
let r = await fetch(base + '/register', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({name:'Referrer Person',email:referrerEmail,phone:'+15550001111',password:'Password#2026',confirmPassword:'Password#2026'}), redirect:'manual' });
const rCookie = r.headers.get('set-cookie');
const rAccess = r.headers.get('location').split('access=')[1];

r = await fetch(base + `/dashboard/refer?access=${rAccess}`, { headers:{cookie:rCookie} });
let html = await r.text();
const codeMatch = html.match(/Referral code: <b>([^<]+)<\/b>/);
assert.ok(codeMatch, 'referral code should be shown');
const code = codeMatch[1];
assert.ok(html.includes(`ref=${encodeURIComponent(code)}`), 'referral link should include the code');
console.log('Referrer gets a unique referral code and shareable link');

r = await fetch(base + `/register?ref=${code}`);
html = await r.text();
assert.ok(html.includes(`Referral code applied: <b>${code}</b>`));
assert.ok(html.includes(`value="${code}"`), 'hidden ref field should carry the code');
console.log('Register page shows and carries the referral code through the form');

const referredEmail = `referred${Date.now()}@example.test`;
r = await fetch(base + '/register', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({name:'Referred Person',email:referredEmail,phone:'+15550002222',password:'Password#2026',confirmPassword:'Password#2026',ref:code}), redirect:'manual' });
assert.equal(r.status, 302);
const referredAccess = r.headers.get('location').split('access=')[1];
const referredCookie = r.headers.get('set-cookie');
console.log('Referred user registers using the code');

r = await fetch(base + `/dashboard/refer?access=${rAccess}`, { headers:{cookie:rCookie} });
html = await r.text();
assert.ok(html.includes('Referred Person'));
assert.ok(html.includes('Pending'));
console.log('Referral shows as pending on the referrer\'s page before verification');

r = await fetch(base+'/admin/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({email:'admin@novacapital.test',password:'Admin#2026!'}),redirect:'manual'});
const aCookie = r.headers.get('set-cookie'); const aAccess = r.headers.get('location').split('admin_access=')[1];

r = await fetch(base + `/dashboard/kyc?access=${referredAccess}`, { headers:{cookie:referredCookie} });
html = await r.text();
const kycCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
const kycForm = new FormData();
kycForm.append('_csrf', kycCsrf); kycForm.append('_access', referredAccess);
kycForm.append('fullLegalName', 'Referred Person'); kycForm.append('dateOfBirth', '1990-01-01');
kycForm.append('idType', 'Passport'); kycForm.append('idNumber', 'P9999'); kycForm.append('address', '1 Main St');
kycForm.append('idFrontImage', new Blob([pngBytes], { type:'image/png' }), 'front.png');
kycForm.append('selfieImage', new Blob([pngBytes], { type:'image/png' }), 'selfie.png');
kycForm.append('termsAccepted', 'yes');
r = await fetch(base + '/dashboard/kyc', { method:'POST', headers:{cookie:referredCookie}, body:kycForm, redirect:'manual' });
assert.equal(r.status, 302);

r = await fetch(base + `/admin/users?admin_access=${aAccess}&q=${encodeURIComponent(referredEmail)}`, { headers:{cookie:aCookie} });
html = await r.text();
const referredUserId = html.match(/\/admin\/users\/([0-9a-f-]{36})/)[1];
r = await fetch(base + `/admin/kyc/${referredUserId}?admin_access=${aAccess}`, { headers:{cookie:aCookie} });
html = await r.text();
const kycAdminCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
r = await fetch(base + `/admin/kyc/${referredUserId}/action`, { method:'POST', headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:kycAdminCsrf,_admin_access:aAccess,action:'approve',confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 302);
console.log('Referred user\'s identity verification is approved by an admin');

r = await fetch(base + `/dashboard/refer?access=${rAccess}`, { headers:{cookie:rCookie} });
html = await r.text();
assert.ok(html.includes('Completed'));
assert.ok(html.includes('$10.00'), 'reward amount should show as earned');
console.log('Referral is marked completed and the reward shows in the referrer\'s stats');

r = await fetch(base + `/dashboard?access=${rAccess}`, { headers:{cookie:rCookie} });
html = await r.text();
assert.ok(html.includes('$10.00'), 'referrer account balance should have been credited');
console.log('Referrer\'s account balance is actually credited the reward');

console.log('Referral tests passed');
