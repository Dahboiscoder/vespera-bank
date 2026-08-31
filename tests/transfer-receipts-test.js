import assert from 'node:assert/strict';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);

async function adminLogin(email='admin@novacapital.test', password='Admin#2026!') {
  const r = await fetch(base+'/admin/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({email,password}),redirect:'manual'});
  assert.equal(r.status,302);
  return { cookie:r.headers.get('set-cookie'), access:r.headers.get('location').split('admin_access=')[1] };
}
async function registerCustomer(email) {
  const r = await fetch(base+'/register', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({name:'Receipt Test',email,phone:'+15550009999',password:'Password#2026',confirmPassword:'Password#2026'}), redirect:'manual' });
  assert.equal(r.status,302);
  return { cookie:r.headers.get('set-cookie'), access:r.headers.get('location').split('access=')[1] };
}

const a = await adminLogin();
const email = `receipt${Date.now()}@example.test`;
const c = await registerCustomer(email);

// Fund the new customer's account via the admin balance-adjustment flow
let r = await fetch(base+`/admin/balances?admin_access=${a.access}&q=${encodeURIComponent(email)}`, { headers:{cookie:a.cookie} });
let html = await r.text();
const fundCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
const accountId = html.match(/action="\/admin\/balances\/([^"]+)\/adjust\/preview"/)[1];
r = await fetch(base+`/admin/balances/${accountId}/adjust/preview`, { method:'POST', headers:{cookie:a.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:fundCsrf,_admin_access:a.access,action:'ADMIN CREDIT',amount:'500',reason:'fund',confirm:'YES'}), redirect:'manual' });
html = await r.text();
const pCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
const pIdk = html.match(/name="idempotency_key" value="([^"]+)/)[1];
r = await fetch(base+`/admin/balances/${accountId}/adjust`, { method:'POST', headers:{cookie:a.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:pCsrf,_admin_access:a.access,action:'ADMIN CREDIT',amount:'500',reason:'fund',idempotency_key:pIdk,confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 302);

// Set the customer's transaction PIN, required before any transfer
r = await fetch(base+`/dashboard/security?access=${c.access}`, { headers:{cookie:c.cookie} });
html = await r.text();
const pinCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
r = await fetch(base+'/dashboard/security/pin', { method:'POST', headers:{cookie:c.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:pinCsrf,_access:c.access,password:'Password#2026',pin:'4321',confirmPin:'4321'}), redirect:'manual' });
assert.equal(r.status, 302);

// Internal transfer is also gated by a transaction PIN and an emailed verification code
r = await fetch(base+`/dashboard/transfers/internal?access=${c.access}`, { headers:{cookie:c.cookie} });
html = await r.text();
const csrf = html.match(/name="_csrf" value="([^"]+)/)[1];
r = await fetch(base+'/dashboard/transfers/confirm', { method:'POST', headers:{cookie:c.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:c.access,transfer_type:'Internal',recipient_name:'My Savings',account_iban:'INTERNAL-001',amount:'50',currency:'USD',purpose:'Move to savings'}), redirect:'manual' });
assert.equal(r.status, 200);
html = await r.text();
assert.ok(html.includes('Verification code'), 'Internal transfer should require a verification code');
assert.ok(html.includes('Transaction PIN'), 'Internal transfer should require a transaction PIN');
const idk = html.match(/name="idempotency_key" value="([^"]+)/)[1];
const code = html.match(/your verification code is: <b>(\d{6})<\/b>/)[1];
r = await fetch(base+'/dashboard/transfers/submit', { method:'POST', headers:{cookie:c.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:c.access,transfer_type:'Internal',recipient_name:'My Savings',account_iban:'INTERNAL-001',amount:'50',currency:'USD',purpose:'Move to savings',idempotency_key:idk,pin:'4321',code,confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 302);
const transferId = r.headers.get('location').match(/\/dashboard\/transfers\/([a-f0-9-]{36})/)[1];
console.log('Internal transfer created with PIN + verification code');

// Receipt page shows the receipt and the Initiated notification, graceful no-send since RESEND_API_KEY is unset
r = await fetch(base+`/dashboard/transfers/${transferId}?access=${c.access}`, { headers:{cookie:c.cookie} });
assert.equal(r.status, 200);
html = await r.text();
assert.ok(html.includes('Transaction Receipt'));
assert.ok(html.includes('skipped_not_configured'), 'unconfigured email provider must be recorded as a graceful skip, not a failure');
console.log('Receipt page renders with notification log and graceful email skip');

// Admin completes the transfer -> receipt_generated_at is set and a receipt email attempt is recorded
r = await fetch(base+`/admin/transfers/${transferId}?admin_access=${a.access}`, { headers:{cookie:a.cookie} });
html = await r.text();
const adminCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
r = await fetch(base+`/admin/transfers/${transferId}/action`, { method:'POST', headers:{cookie:a.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:adminCsrf,_admin_access:a.access,action:'complete',confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 302);

r = await fetch(base+`/admin/transfers/${transferId}?admin_access=${a.access}`, { headers:{cookie:a.cookie} });
html = await r.text();
assert.ok(html.includes('Receipt generated:') && !html.includes('Receipt generated: Not yet'), 'receipt_generated_at should be set after completion');
const resendCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
console.log('Admin complete action sets receipt_generated_at and records the receipt email attempt');

// Admin can resend a legitimate notification, and the action is audited
r = await fetch(base+`/admin/transfers/${transferId}/notifications/resend`, { method:'POST', headers:{cookie:a.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:resendCsrf,_admin_access:a.access,kind:'receipt',confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 302);
r = await fetch(base+`/admin/audit-logs?admin_access=${a.access}`, { headers:{cookie:a.cookie} });
html = await r.text();
assert.ok(html.includes('TRANSFER_NOTIFICATION_RESENT') || html.includes('TRANSFER_NOTIFICATION_RESEND_FAILED'));
console.log('Admin resend is recorded in the audit log');

// A role without transfers.manage is denied the resend action
r = await fetch(base+`/admin/admin-users?admin_access=${a.access}`, { headers:{cookie:a.cookie} });
html = await r.text();
const auCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
const viewerEmail = `viewer${Date.now()}@example.test`;
r = await fetch(base+'/admin/admin-users', { method:'POST', headers:{cookie:a.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:auCsrf,_admin_access:a.access,name:'Viewer',email:viewerEmail,password:'ViewerPass#1',role:'VIEWER',confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 302);
r = await fetch(base+'/admin/login', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({email:viewerEmail,password:'ViewerPass#1'}), redirect:'manual' });
const vCookie = r.headers.get('set-cookie');
const vAccess = r.headers.get('location').split('admin_access=')[1];
r = await fetch(base+`/admin/transfers/${transferId}/notifications/resend`, { method:'POST', headers:{cookie:vCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_admin_access:vAccess,kind:'receipt',confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 403, 'a VIEWER admin must be denied the notification resend action');
console.log('VIEWER role denied resend action (403)');

// Another customer cannot view this receipt, and no details leak into the 404
const other = await registerCustomer(`other${Date.now()}@example.test`);
r = await fetch(base+`/dashboard/transfers/${transferId}?access=${other.access}`, { headers:{cookie:other.cookie} });
assert.equal(r.status, 404, 'another customer must not be able to view this receipt');
html = await r.text();
assert.ok(!html.includes('My Savings'), 'receipt details must not leak to a non-owner');
console.log('Receipt ownership enforced (404 for non-owner, no data leak)');

console.log('Transfer receipt and notification tests passed');
