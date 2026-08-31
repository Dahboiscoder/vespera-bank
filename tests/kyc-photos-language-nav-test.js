import assert from 'node:assert/strict';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);

// 1x1 px PNG
const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

// Registration requires email verification first, then hands the new customer
// straight to identity verification as the next step
const email = `kyc${Date.now()}@example.com`;
let r = await fetch(base + '/register', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({firstName:'Kyc',lastName:'Flow',email,phone:'+15550007777',accountType:'Checking',password:'Password#2026',confirmPassword:'Password#2026'}), redirect:'manual' });
assert.equal(r.status, 302);
assert.equal(r.headers.get('location'), '/register/verify');
const { cookie, access } = await (async () => {
  const rvCookie = (r.headers.get('set-cookie')||'').match(/register_verify=([^;]+)/)[1];
  let vr = await fetch(base + '/register/verify', { headers:{cookie:`register_verify=${rvCookie}`} });
  const code = (await vr.text()).match(/your code is: <b>(\d{6})<\/b>/)[1];
  vr = await fetch(base + '/register/verify', { method:'POST', headers:{cookie:`register_verify=${rvCookie}`,'content-type':'application/x-www-form-urlencoded'}, body:form({code}), redirect:'manual' });
  assert.ok(vr.headers.get('location').startsWith('/dashboard/kyc?access='), vr.headers.get('location'));
  const sidMatch = (vr.headers.get('set-cookie')||'').match(/sid=([^;]+)/);
  return { cookie: `sid=${sidMatch[1]}`, access: vr.headers.get('location').split('access=')[1] };
})();
console.log('Registration requires email verification, then redirects straight to identity verification');

r = await fetch(base + `/dashboard/kyc?access=${access}`, { headers:{cookie} });
let html = await r.text();
assert.equal(r.status, 200);
assert.ok(html.includes('enctype="multipart/form-data"'));
assert.ok(html.includes('idFrontImage') && html.includes('idBackImage'));
const csrf = html.match(/name="_csrf" value="([^"]+)/)[1];
console.log('KYC page renders the ID/passport photo upload form');

const fd1 = new FormData();
fd1.append('_csrf', csrf); fd1.append('_access', access);
fd1.append('fullLegalName', 'Kyc Flow'); fd1.append('dateOfBirth', '1990-01-01');
fd1.append('idType', 'Passport'); fd1.append('idNumber', 'P1234567'); fd1.append('address', '1 Main St');
fd1.append('selfieImage', new Blob([pngBytes], { type:'image/png' }), 'selfie.png');
fd1.append('termsAccepted', 'yes');
r = await fetch(base + '/dashboard/kyc', { method:'POST', headers:{cookie}, body:fd1 });
assert.equal(r.status, 400);
html = await r.text();
assert.ok(html.includes('Please upload a clear photo'));
console.log('Missing front-of-ID photo is rejected with a clear message');

const fd2 = new FormData();
fd2.append('_csrf', csrf); fd2.append('_access', access);
fd2.append('fullLegalName', 'Kyc Flow'); fd2.append('dateOfBirth', '1990-01-01');
fd2.append('idType', 'Passport'); fd2.append('idNumber', 'P1234567'); fd2.append('address', '1 Main St');
fd2.append('idFrontImage', new Blob([Buffer.from('not-an-image')], { type:'text/plain' }), 'front.txt');
r = await fetch(base + '/dashboard/kyc', { method:'POST', headers:{cookie}, body:fd2 });
assert.equal(r.status, 400);
html = await r.text();
assert.ok(html.includes('JPEG, PNG, or WEBP'));
console.log('Non-image file upload is rejected');

const fd2b = new FormData();
fd2b.append('_csrf', csrf); fd2b.append('_access', access);
fd2b.append('fullLegalName', 'Kyc Flow'); fd2b.append('dateOfBirth', '1990-01-01');
fd2b.append('idType', 'Passport'); fd2b.append('idNumber', 'P1234567'); fd2b.append('address', '1 Main St');
fd2b.append('idFrontImage', new Blob([pngBytes], { type:'image/png' }), 'front.png');
fd2b.append('termsAccepted', 'yes');
r = await fetch(base + '/dashboard/kyc', { method:'POST', headers:{cookie}, body:fd2b });
assert.equal(r.status, 400);
html = await r.text();
assert.ok(html.includes('Please upload a selfie'));
console.log('Missing selfie photo is rejected with a clear message');

const fd2c = new FormData();
fd2c.append('_csrf', csrf); fd2c.append('_access', access);
fd2c.append('fullLegalName', 'Kyc Flow'); fd2c.append('dateOfBirth', '1990-01-01');
fd2c.append('idType', 'Passport'); fd2c.append('idNumber', 'P1234567'); fd2c.append('address', '1 Main St');
fd2c.append('idFrontImage', new Blob([pngBytes], { type:'image/png' }), 'front.png');
fd2c.append('selfieImage', new Blob([pngBytes], { type:'image/png' }), 'selfie.png');
r = await fetch(base + '/dashboard/kyc', { method:'POST', headers:{cookie}, body:fd2c });
assert.equal(r.status, 400);
html = await r.text();
assert.ok(html.includes('Verification Terms'));
console.log('Missing terms acceptance is rejected with a clear message');

const fd3 = new FormData();
fd3.append('_csrf', csrf); fd3.append('_access', access);
fd3.append('fullLegalName', 'Kyc Flow'); fd3.append('dateOfBirth', '1990-01-01');
fd3.append('idType', "Driver's License"); fd3.append('idNumber', 'DL998877'); fd3.append('address', '1 Main St');
fd3.append('idFrontImage', new Blob([pngBytes], { type:'image/png' }), 'front.png');
fd3.append('idBackImage', new Blob([pngBytes], { type:'image/png' }), 'back.png');
fd3.append('selfieImage', new Blob([pngBytes], { type:'image/png' }), 'selfie.png');
fd3.append('termsAccepted', 'yes');
r = await fetch(base + '/dashboard/kyc', { method:'POST', headers:{cookie}, body:fd3, redirect:'manual' });
assert.equal(r.status, 302);
console.log('KYC submission with front, back and selfie photos is accepted');

r = await fetch(base + `/dashboard/kyc?access=${access}`, { headers:{cookie} });
html = await r.text();
assert.ok(!html.includes('data:image/png;base64'), 'customers must never see their own submitted document photos');
assert.ok(html.includes('✓ Uploaded'));
assert.ok(html.includes('Pending Review'));
console.log('Customer KYC page confirms photos were uploaded, without exposing the images, status pending');

// Admin review page shows the uploaded photos so approval is an informed decision
r = await fetch(base+'/admin/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({email:'admin@novacapital.test',password:'Admin#2026!'}),redirect:'manual'});
const aCookie = r.headers.get('set-cookie');
const aAccess = r.headers.get('location').split('admin_access=')[1];
r = await fetch(base + `/admin/users?admin_access=${aAccess}&q=${encodeURIComponent(email)}`, { headers:{cookie:aCookie} });
html = await r.text();
const userId = html.match(/\/admin\/users\/([0-9a-f-]{36})/)[1];
r = await fetch(base + `/admin/kyc/${userId}?admin_access=${aAccess}`, { headers:{cookie:aCookie} });
html = await r.text();
assert.equal(r.status, 200);
assert.ok(html.includes('data:image/png;base64'));
assert.ok(html.includes('Identity Document Photos'));
console.log('Admin review page shows the uploaded ID photos');

// Language switcher persists via cookie and actually translates header chrome
r = await fetch(base + `/set-language?lang=fr&return_to=${encodeURIComponent('/dashboard?access='+access)}`, { headers:{cookie}, redirect:'manual' });
assert.equal(r.status, 302);
assert.equal(r.headers.get('location'), '/dashboard?access=' + access);
const combinedCookie = cookie + '; ' + r.headers.get('set-cookie').split(';')[0];
r = await fetch(base + `/dashboard?access=${access}`, { headers:{cookie:combinedCookie} });
html = await r.text();
assert.ok(html.includes('Virement'), 'French nav label should appear once lang=fr cookie is set');
console.log('Language switcher persists via cookie and translates the nav');

r = await fetch(base + `/set-language?lang=en&return_to=${encodeURIComponent('https://evil.example.com')}`, { redirect:'manual' });
assert.equal(r.headers.get('location'), '/', 'return_to must be constrained to a relative path');
console.log('/set-language rejects an absolute return_to (open-redirect guard)');

// Active nav highlighting must reflect the real current page, not always "Overview"
r = await fetch(base + `/dashboard/accounts?access=${access}`, { headers:{cookie} });
html = await r.text();
const overviewMatch = html.match(/<li><a class="(active)?" href="[^"]*\/dashboard(?:\?[^"]*)?">Overview<\/a><\/li>/);
const accountsMatch = html.match(/<li><a class="(active)?" href="[^"]*\/dashboard\/accounts[^"]*">Accounts<\/a><\/li>/);
assert.ok(accountsMatch && accountsMatch[1] === 'active', 'Accounts nav item should be active on /dashboard/accounts');
assert.ok(overviewMatch && !overviewMatch[1], 'Overview nav item should not be active on /dashboard/accounts');
console.log('Active nav highlighting reflects the real current page');

console.log('KYC photo, language and nav tests passed');
