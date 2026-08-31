import assert from 'node:assert/strict';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);

async function fundCustomer(adminCookie, adminAccess, email) {
  let r = await fetch(base + `/admin/balances?admin_access=${adminAccess}&q=${encodeURIComponent(email)}`, { headers:{cookie:adminCookie} });
  let html = await r.text();
  const fundCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
  const accountId = html.match(/action="\/admin\/balances\/([^"]+)\/adjust\/preview"/)[1];
  r = await fetch(base + `/admin/balances/${accountId}/adjust/preview`, { method:'POST', headers:{cookie:adminCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:fundCsrf,_admin_access:adminAccess,action:'ADMIN CREDIT',amount:'200',reason:'fund',confirm:'YES'}), redirect:'manual' });
  html = await r.text();
  const pCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
  const pIdk = html.match(/name="idempotency_key" value="([^"]+)/)[1];
  await fetch(base + `/admin/balances/${accountId}/adjust`, { method:'POST', headers:{cookie:adminCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:pCsrf,_admin_access:adminAccess,action:'ADMIN CREDIT',amount:'200',reason:'fund',idempotency_key:pIdk,confirm:'YES'}), redirect:'manual' });
}

let r = await fetch(base+'/admin/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({email:'admin@novacapital.test',password:'Admin#2026!'}),redirect:'manual'});
const aCookie = r.headers.get('set-cookie'); const aAccess = r.headers.get('location').split('admin_access=')[1];

const email = `pin${Date.now()}@example.test`;
r = await fetch(base + '/register', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({name:'Pin Flow',email,phone:'+15550001234',password:'Password#2026',confirmPassword:'Password#2026'}), redirect:'manual' });
const cookie = r.headers.get('set-cookie');
const access = r.headers.get('location').split('access=')[1];
await fundCustomer(aCookie, aAccess, email);

// A transfer cannot even reach the confirmation screen without a transaction PIN set
r = await fetch(base + `/dashboard/transfers/internal?access=${access}`, { headers:{cookie} });
let html = await r.text();
const csrf = html.match(/name="_csrf" value="([^"]+)/)[1];
r = await fetch(base + '/dashboard/transfers/confirm', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:access,transfer_type:'Internal',recipient_name:'Savings',account_iban:'INT-1',amount:'10',currency:'USD',purpose:'test'}), redirect:'manual' });
assert.equal(r.status, 400);
html = await r.text();
assert.ok(html.includes('Transaction PIN required'));
console.log('Transfer blocked until a transaction PIN is set');

// Setting a PIN requires the current account password
r = await fetch(base + `/dashboard/security?access=${access}`, { headers:{cookie} });
html = await r.text();
const secCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
r = await fetch(base + '/dashboard/security/pin', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:secCsrf,_access:access,password:'WrongPassword#1',pin:'1234',confirmPin:'1234'}), redirect:'manual' });
assert.equal(r.status, 400);
html = await r.text();
assert.ok(html.includes('Incorrect password'));
console.log('PIN setup rejects an incorrect account password');

r = await fetch(base + '/dashboard/security/pin', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:secCsrf,_access:access,password:'Password#2026',pin:'1234',confirmPin:'1234'}), redirect:'manual' });
assert.equal(r.status, 302);
console.log('Transaction PIN set');

// Confirm now requires both a PIN field and an emailed OTP code, for every transfer type
r = await fetch(base + '/dashboard/transfers/confirm', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:access,transfer_type:'Internal',recipient_name:'Savings',account_iban:'INT-1',amount:'10',currency:'USD',purpose:'test'}), redirect:'manual' });
assert.equal(r.status, 200);
html = await r.text();
assert.ok(html.includes('Verification code'));
assert.ok(html.includes('Transaction PIN'));
const idk = html.match(/name="idempotency_key" value="([^"]+)/)[1];
const code = html.match(/your verification code is: <b>(\d{6})<\/b>/)[1];
console.log('Confirm screen requires both a transaction PIN and an emailed OTP code');

// Wrong PIN is rejected without consuming the correct OTP code
r = await fetch(base + '/dashboard/transfers/submit', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:access,transfer_type:'Internal',recipient_name:'Savings',account_iban:'INT-1',amount:'10',currency:'USD',purpose:'test',confirm:'YES',idempotency_key:idk,pin:'0000',code}), redirect:'manual' });
assert.equal(r.status, 400);
html = await r.text();
assert.ok(html.includes('Incorrect transaction PIN'));
console.log('Wrong PIN rejected');

r = await fetch(base + '/dashboard/transfers/submit', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:access,transfer_type:'Internal',recipient_name:'Savings',account_iban:'INT-1',amount:'10',currency:'USD',purpose:'test',confirm:'YES',idempotency_key:idk,pin:'1234',code}), redirect:'manual' });
assert.equal(r.status, 302);
console.log('Correct PIN + OTP code succeeds');

// Repeated wrong PINs lock the account out for a cooldown period
const emailLock = `pinlock${Date.now()}@example.test`;
r = await fetch(base + '/register', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({name:'Pin Lock',email:emailLock,phone:'+15550005678',password:'Password#2026',confirmPassword:'Password#2026'}), redirect:'manual' });
const lockCookie = r.headers.get('set-cookie');
const lockAccess = r.headers.get('location').split('access=')[1];
await fundCustomer(aCookie, aAccess, emailLock);
r = await fetch(base + `/dashboard/security?access=${lockAccess}`, { headers:{cookie:lockCookie} });
html = await r.text();
const lockPinCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
await fetch(base + '/dashboard/security/pin', { method:'POST', headers:{cookie:lockCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:lockPinCsrf,_access:lockAccess,password:'Password#2026',pin:'9999',confirmPin:'9999'}), redirect:'manual' });
r = await fetch(base + `/dashboard/transfers/internal?access=${lockAccess}`, { headers:{cookie:lockCookie} });
html = await r.text();
const lockCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
// A single confirm call issues one OTP code; since a wrong PIN is rejected before the OTP
// code is ever checked, the same idk+code can be reused across repeated wrong-PIN submits
// (this also keeps the confirm endpoint's own rate limit from being exhausted by this test).
r = await fetch(base + '/dashboard/transfers/confirm', { method:'POST', headers:{cookie:lockCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:lockCsrf,_access:lockAccess,transfer_type:'Internal',recipient_name:'Savings',account_iban:'INT-1',amount:'10',currency:'USD',purpose:'test'}), redirect:'manual' });
html = await r.text();
const lockIdk = html.match(/name="idempotency_key" value="([^"]+)/)[1];
const lockCode = html.match(/your verification code is: <b>(\d{6})<\/b>/)[1];
for (let i = 0; i < 5; i++) {
  r = await fetch(base + '/dashboard/transfers/submit', { method:'POST', headers:{cookie:lockCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:lockCsrf,_access:lockAccess,transfer_type:'Internal',recipient_name:'Savings',account_iban:'INT-1',amount:'10',currency:'USD',purpose:'test',confirm:'YES',idempotency_key:lockIdk,pin:'0000',code:lockCode}), redirect:'manual' });
  assert.equal(r.status, 400);
}
html = await r.text();
assert.ok(html.includes('Too many incorrect PIN attempts'), 'account should be locked out after repeated wrong PIN attempts');
console.log('Transaction PIN locks out after repeated failed attempts');

// Even the correct PIN is rejected while locked out (checked via submit, to avoid
// spending more of the confirm endpoint's own rate limit budget in this test run)
r = await fetch(base + '/dashboard/transfers/submit', { method:'POST', headers:{cookie:lockCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:lockCsrf,_access:lockAccess,transfer_type:'Internal',recipient_name:'Savings',account_iban:'INT-1',amount:'10',currency:'USD',purpose:'test',confirm:'YES',idempotency_key:lockIdk,pin:'9999',code:lockCode}), redirect:'manual' });
assert.equal(r.status, 400);
html = await r.text();
assert.ok(html.includes('Too many incorrect PIN attempts'), 'correct PIN must still be rejected while locked out');
console.log('Locked-out account is blocked even with the correct PIN available');

console.log('Transaction PIN tests passed');
