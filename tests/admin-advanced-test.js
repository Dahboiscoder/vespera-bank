import assert from 'node:assert/strict';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);
let r = await fetch(base+'/admin/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({email:'admin@novacapital.test',password:'Admin#2026!'}),redirect:'manual'});
assert.equal(r.status,302);
const cookie = r.headers.get('set-cookie');
const loc = r.headers.get('location');
const adminAccess = loc.split('admin_access=')[1];
for (const p of ['/admin/dashboard','/admin/users','/admin/accounts','/admin/transactions','/admin/approvals','/admin/services','/admin/fees','/admin/reports']) {
  r = await fetch(base+p+`?admin_access=${adminAccess}`, { headers:{cookie} });
  assert.equal(r.status,200,p);
}
r = await fetch(base+'/admin/transactions'+`?admin_access=${adminAccess}`, { headers:{cookie} });
let html = await r.text();
const csrf = html.match(/name="_csrf" value="([^"]+)/)[1];
const accountId = html.match(/<option value="([0-9a-f-]{36})"/)?.[1];
assert.ok(accountId);
r = await fetch(base+'/admin/transactions', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_admin_access:adminAccess,account_id:accountId,kind:'Deposit',status:'pending',amount:'125',fee:'0',reference:'ADV-APPROVE',description:'Approval test',confirm:'YES'}), redirect:'manual' });
assert.equal(r.status,302);
r = await fetch(base+'/admin/approvals'+`?admin_access=${adminAccess}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('ADV-APPROVE'));
const txPath = html.match(/href="(\/admin\/transactions\/[^"]+)/)[1];
r = await fetch(base+txPath, { headers:{cookie} });
html = await r.text();
const approveCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
r = await fetch(base+txPath.split('?')[0]+'/approve', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:approveCsrf,_admin_access:adminAccess,confirm:'YES'}), redirect:'manual' });
assert.equal(r.status,302);
r = await fetch(base+'/admin/audit-logs'+`?admin_access=${adminAccess}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('TRANSACTION_APPROVED'));

// Historical-date creation via preview -> commit, then a full reversal round-trip
const historicalDate = '2020-06-15T10:30';
r = await fetch(base+`/admin/transactions/preview?admin_access=${adminAccess}`, { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,account_id:accountId,kind:'Deposit',amount:'500',status:'completed',description:'Backdated correction deposit',transaction_date:historicalDate,payment_method:'Bank Transfer',counterparty_details:'Acme Corp Payroll'}), redirect:'manual' });
assert.equal(r.status, 200, 'preview should render 200');
html = await r.text();
assert.ok(html.includes('Confirm Transaction') && html.includes('ADMIN_CREATED'));
const idk1 = html.match(/name="idempotency_key" value="([^"]+)/)[1];
const previewCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
r = await fetch(base+'/admin/transactions', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:previewCsrf,_admin_access:adminAccess,account_id:accountId,kind:'Deposit',amount:'500',status:'completed',description:'Backdated correction deposit',transaction_date:historicalDate,payment_method:'Bank Transfer',counterparty_details:'Acme Corp Payroll',idempotency_key:idk1,confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 302);

r = await fetch(base+`/admin/transactions?admin_access=${adminAccess}&q=Backdated`, { headers:{cookie} });
html = await r.text();
const txId = html.match(/\/admin\/transactions\/([a-f0-9-]{36})/)[1];

// Duplicate submission with the same idempotency_key must be a no-op, not a second row
r = await fetch(base+'/admin/transactions', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:previewCsrf,_admin_access:adminAccess,account_id:accountId,kind:'Deposit',amount:'500',status:'completed',description:'Backdated correction deposit',transaction_date:historicalDate,idempotency_key:idk1,confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 302);
const redirectedId = r.headers.get('location').match(/\/admin\/transactions\/([a-f0-9-]{36})/)[1];
assert.equal(redirectedId, txId, 'duplicate idempotency_key submit redirects to the same transaction, not a new one');

r = await fetch(base+`/admin/transactions/${txId}?admin_access=${adminAccess}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('Bank Transfer') && html.includes('Acme Corp Payroll') && html.includes('ADMIN_CREATED'));
const detailCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];

r = await fetch(base+`/admin/transactions/${txId}/reverse/preview?admin_access=${adminAccess}`, { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:detailCsrf,reason:'Customer disputed this deposit'}), redirect:'manual' });
assert.equal(r.status, 200);
html = await r.text();
assert.ok(html.includes('Confirm Reversal'));
const revIdk = html.match(/name="idempotency_key" value="([^"]+)/)[1];
const revCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
r = await fetch(base+`/admin/transactions/${txId}/reverse`, { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:revCsrf,_admin_access:adminAccess,reason:'Customer disputed this deposit',idempotency_key:revIdk,confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 302, 'reverse commit should redirect');

r = await fetch(base+`/admin/transactions/${txId}?admin_access=${adminAccess}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('>reversed<'), 'original transaction status is now reversed');
assert.ok(html.includes('This transaction was reversed by'), 'reversal linkage shown on original');

// Double-reversal must be blocked
r = await fetch(base+`/admin/transactions/${txId}/reverse/preview?admin_access=${adminAccess}`, { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:detailCsrf,reason:'try again'}), redirect:'manual' });
assert.equal(r.status, 400, 'reversing an already-reversed transaction must be rejected');

console.log('Admin advanced tests passed');
