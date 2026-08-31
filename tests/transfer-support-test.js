import assert from 'node:assert/strict';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);

async function customerLogin(email='customer@novacapital.test', password='Customer#2026!') {
  const r = await fetch(base+'/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({email,password}),redirect:'manual'});
  assert.equal(r.status,302);
  return { cookie:r.headers.get('set-cookie'), access:r.headers.get('location').split('access=')[1] };
}
async function adminLogin(){
  const r = await fetch(base+'/admin/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({email:'admin@novacapital.test',password:'Admin#2026!'}),redirect:'manual'});
  assert.equal(r.status,302);
  return { cookie:r.headers.get('set-cookie'), access:r.headers.get('location').split('admin_access=')[1] };
}

const a = await adminLogin();
let r = await fetch(base+`/admin/balances?admin_access=${a.access}&q=customer@novacapital.test`, { headers:{cookie:a.cookie} });
let html = await r.text();
const fundCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
const fundAccountId = html.match(/\/admin\/balances\/([0-9a-f-]{36})\/adjust/)[1];
r = await fetch(base+`/admin/balances/${fundAccountId}/adjust`, { method:'POST', headers:{cookie:a.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:fundCsrf,_admin_access:a.access,action:'ADMIN CREDIT',amount:'100',currency:'USD',reason:'Transfer test funding',reference:'TRANSFER-FUND',confirm:'YES'}), redirect:'manual' });
assert.equal(r.status,302);
let c = await customerLogin();
r = await fetch(base+`/dashboard/security?access=${c.access}`, { headers:{cookie:c.cookie} });
html = await r.text();
const pinCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
r = await fetch(base+'/dashboard/security/pin', { method:'POST', headers:{cookie:c.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:pinCsrf,_access:c.access,password:'Customer#2026!',pin:'1234',confirmPin:'1234'}), redirect:'manual' });
assert.equal(r.status,302);

// Submit and (if not already reviewed from a prior run) approve KYC, since sending money
// (SEPA/Wire/Withdrawal) now requires an approved identity verification
const pngBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
r = await fetch(base+`/dashboard/kyc?access=${c.access}`, { headers:{cookie:c.cookie} });
html = await r.text();
const kycCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
const kycForm = new FormData();
kycForm.append('_csrf', kycCsrf); kycForm.append('_access', c.access);
kycForm.append('fullLegalName', 'Existing Customer'); kycForm.append('dateOfBirth', '1990-01-01');
kycForm.append('idType', 'Passport'); kycForm.append('idNumber', 'P0001'); kycForm.append('address', '1 Main St');
kycForm.append('idFrontImage', new Blob([pngBytes], { type:'image/png' }), 'front.png');
kycForm.append('selfieImage', new Blob([pngBytes], { type:'image/png' }), 'selfie.png');
kycForm.append('termsAccepted', 'yes');
r = await fetch(base+'/dashboard/kyc', { method:'POST', headers:{cookie:c.cookie}, body:kycForm, redirect:'manual' });
assert.equal(r.status, 302);
r = await fetch(base+`/admin/users?admin_access=${a.access}&q=customer%40novacapital.test`, { headers:{cookie:a.cookie} });
html = await r.text();
const custUserId = html.match(/\/admin\/users\/([0-9a-f-]{36})/)[1];
r = await fetch(base+`/admin/kyc/${custUserId}?admin_access=${a.access}`, { headers:{cookie:a.cookie} });
html = await r.text();
if (html.includes('Pending Review')) {
  const kycAdminCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
  r = await fetch(base+`/admin/kyc/${custUserId}/action`, { method:'POST', headers:{cookie:a.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:kycAdminCsrf,_admin_access:a.access,action:'approve',confirm:'YES'}), redirect:'manual' });
  assert.equal(r.status, 302);
}

r = await fetch(base+`/dashboard?access=${c.access}`, { headers:{cookie:c.cookie} });
html = await r.text();
assert.ok(html.includes('Deposit'));
assert.ok(html.includes('Withdraw'));
assert.ok(html.includes('Wire / Bank Transfer'));
assert.ok(html.includes('Money movement'));
assert.ok(!html.includes('No transfer, deposit, or withdrawal requests yet.'));
assert.ok(!html.includes('No transactions yet. Your account balance is $0.00 until an authorized admin adjusts it.'));
r = await fetch(base+`/dashboard/transactions?access=${c.access}`, { headers:{cookie:c.cookie} });
html = await r.text();
assert.ok(html.includes('Activity'));
assert.ok(html.includes('activity-list'), 'existing money-movement requests must show in the unified activity feed');
r = await fetch(base+`/dashboard/transfers/sepa?access=${c.access}`, { headers:{cookie:c.cookie} });
html = await r.text();
assert.ok(html.includes('SEPA Transfer'));
const csrf = html.match(/name="_csrf" value="([^"]+)/)[1];
r = await fetch(base+`/dashboard/transfers/confirm`, { method:'POST', headers:{cookie:c.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:c.access,transfer_type:'SEPA',recipient_name:'Invalid Beneficiary',recipient_address:'',account_iban:'BAD1',swift_bic:'',amount:'25',currency:'EUR',reference:'IBAN-FAIL',purpose:'Invoice'}), redirect:'manual' });
assert.equal(r.status,400);
html = await r.text();
assert.ok(html.includes('Valid IBAN'));
r = await fetch(base+`/dashboard/transfers/confirm`, { method:'POST', headers:{cookie:c.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:c.access,transfer_type:'SEPA',recipient_name:'Beneficiary GmbH',recipient_address:'Example Street 1, Berlin',account_iban:'DE89370400440532013000',swift_bic:'DEUTDEFF',amount:'5',currency:'EUR',reference:'SEPA-TEST',purpose:'Invoice'}), redirect:'manual' });
assert.equal(r.status,200);
html = await r.text();
assert.ok(html.includes('Confirm Transfer'));
assert.ok(html.includes('Payment provider is not configured'));
assert.ok(html.includes('I confirm this transfer request'));
assert.ok(html.includes('Verification code'), 'SEPA should require a verification code');
const idk = html.match(/name="idempotency_key" value="([^"]+)/)[1];
const sepaCode = html.match(/your verification code is: <b>(\d{6})<\/b>/)[1];

// Incorrect code must be rejected with a clear message, without consuming the correct code
r = await fetch(base+`/dashboard/transfers/submit`, { method:'POST', headers:{cookie:c.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:c.access,transfer_type:'SEPA',recipient_name:'Beneficiary GmbH',recipient_address:'Example Street 1, Berlin',account_iban:'DE89370400440532013000',swift_bic:'DEUTDEFF',amount:'5',currency:'EUR',reference:'SEPA-TEST',purpose:'Invoice',confirm:'YES',idempotency_key:idk,pin:'1234',code:'000000'}), redirect:'manual' });
assert.equal(r.status,400);
html = await r.text();
assert.ok(html.includes('Incorrect verification code'));

r = await fetch(base+`/dashboard/transfers/submit`, { method:'POST', headers:{cookie:c.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:c.access,transfer_type:'SEPA',recipient_name:'Beneficiary GmbH',recipient_address:'Example Street 1, Berlin',account_iban:'DE89370400440532013000',swift_bic:'DEUTDEFF',amount:'5',currency:'EUR',reference:'SEPA-TEST',purpose:'Invoice',confirm:'YES',idempotency_key:idk,pin:'1234',code:sepaCode}), redirect:'manual' });
assert.equal(r.status,302);
const sepaTransferId = r.headers.get('location').match(/\/dashboard\/transfers\/([a-f0-9-]{36})/)[1];

// Duplicate submission with the same idempotency_key must redirect to the same transfer, not create a second one
r = await fetch(base+`/dashboard/transfers/submit`, { method:'POST', headers:{cookie:c.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:c.access,transfer_type:'SEPA',recipient_name:'Beneficiary GmbH',recipient_address:'Example Street 1, Berlin',account_iban:'DE89370400440532013000',swift_bic:'DEUTDEFF',amount:'5',currency:'EUR',reference:'SEPA-TEST',purpose:'Invoice',confirm:'YES',idempotency_key:idk,pin:'1234',code:sepaCode}), redirect:'manual' });
assert.equal(r.status,302);
assert.equal(r.headers.get('location').match(/\/dashboard\/transfers\/([a-f0-9-]{36})/)[1], sepaTransferId, 'duplicate idempotency_key must redirect to the same transfer');

r = await fetch(base+`/dashboard/transfers/history?access=${c.access}`, { headers:{cookie:c.cookie} });
html = await r.text();
assert.ok(html.includes('Draft'));
assert.ok(html.includes('Beneficiary GmbH'));

// Customer-facing receipt page: owner can view, another user cannot
r = await fetch(base+`/dashboard/transfers/${sepaTransferId}?access=${c.access}`, { headers:{cookie:c.cookie} });
assert.equal(r.status,200);
html = await r.text();
assert.ok(html.includes('SEPA') && html.includes('Beneficiary GmbH'));

// The main Deposit page now just shows the customer's own account number/IBAN to receive
// money (no more "submit a deposit request" form there); the themed Tax Refund shortcut still
// exercises the underlying Deposit transfer-request pipeline used elsewhere (e.g. admin review).
r = await fetch(base+`/dashboard/transfers/deposit?access=${c.access}`, { headers:{cookie:c.cookie} });
html = await r.text();
assert.ok(html.includes('IBAN'), 'Deposit page should show the account IBAN');
assert.ok(!html.includes('Deposit Purpose'), 'Deposit page should no longer show a deposit request form');
r = await fetch(base+`/dashboard/tax-refund?access=${c.access}`, { headers:{cookie:c.cookie} });
html = await r.text();
assert.ok(html.includes('Tax Authority Refund'), 'Tax Refund page should prefill the deposit request form');
r = await fetch(base+`/dashboard/transfers/confirm`, { method:'POST', headers:{cookie:c.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:c.access,transfer_type:'Deposit',recipient_name:'External Funding Source',account_iban:'SOURCE-REF-001',amount:'15',currency:'USD',reference:'DEP-TEST',purpose:'Account funding'}), redirect:'manual' });
assert.equal(r.status,200);
html = await r.text();
assert.ok(html.includes('Confirm Transfer'));
assert.ok(html.includes('Deposit'));
assert.ok(html.includes('Verification code'), 'Deposit should now also require a verification code');
const depIdk = html.match(/name="idempotency_key" value="([^"]+)/)[1];
const depCode = html.match(/your verification code is: <b>(\d{6})<\/b>/)[1];
r = await fetch(base+`/dashboard/transfers/submit`, { method:'POST', headers:{cookie:c.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:c.access,transfer_type:'Deposit',recipient_name:'External Funding Source',account_iban:'SOURCE-REF-001',amount:'15',currency:'USD',reference:'DEP-TEST',purpose:'Account funding',confirm:'YES',idempotency_key:depIdk,pin:'1234',code:depCode}), redirect:'manual' });
assert.equal(r.status,302);

r = await fetch(base+`/dashboard/transfers/withdraw?access=${c.access}`, { headers:{cookie:c.cookie} });
html = await r.text();
assert.ok(html.includes('Withdraw Request'));
r = await fetch(base+`/dashboard/transfers/confirm`, { method:'POST', headers:{cookie:c.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:c.access,transfer_type:'Withdrawal',recipient_name:'Customer External Account',account_iban:'WITHDRAW-DEST-001',amount:'5',currency:'USD',reference:'WDR-TEST',purpose:'Personal withdrawal'}), redirect:'manual' });
assert.equal(r.status,200);
html = await r.text();
assert.ok(html.includes('Withdrawal'));
assert.ok(html.includes('Verification code'), 'Withdrawal should require a verification code');
const wdrIdk = html.match(/name="idempotency_key" value="([^"]+)/)[1];
const wdrCode = html.match(/your verification code is: <b>(\d{6})<\/b>/)[1];
r = await fetch(base+`/dashboard/transfers/submit`, { method:'POST', headers:{cookie:c.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:c.access,transfer_type:'Withdrawal',recipient_name:'Customer External Account',account_iban:'WITHDRAW-DEST-001',amount:'5',currency:'USD',reference:'WDR-TEST',purpose:'Personal withdrawal',confirm:'YES',idempotency_key:wdrIdk,pin:'1234',code:wdrCode}), redirect:'manual' });
assert.equal(r.status,302);
r = await fetch(base+`/dashboard/transfers/history?access=${c.access}`, { headers:{cookie:c.cookie} });
html = await r.text();
assert.ok(html.includes('External Funding Source'));
assert.ok(html.includes('Customer External Account'));

r = await fetch(base+`/support/chat?access=${c.access}`, { method:'POST', headers:{cookie:c.cookie,'content-type':'application/json'}, body:JSON.stringify({message:'What is my transfer status?'}) });
assert.equal(r.status,200);
// Wording varies with a real AI provider configured vs. the rule-based fallback — check for real
// signals from the withdrawal just created (amount/status/type) rather than one exact fallback phrase.
const chatReplyText = await r.text();
assert.ok(/latest transfer|withdrawal|5\.00|draft/i.test(chatReplyText), `assistant should report on the real transfer just created. Got: ${chatReplyText}`);

r = await fetch(base+`/admin/transfers?admin_access=${a.access}&type=SEPA&status=Draft`, { headers:{cookie:a.cookie} });
html = await r.text();
assert.ok(html.includes('Transfer Management'));
assert.ok(html.includes('Beneficiary GmbH'));
r = await fetch(base+`/admin/users?admin_access=${a.access}&q=customer%40novacapital.test`, { headers:{cookie:a.cookie} });
html = await r.text();
const userId = html.match(/\/admin\/users\/([0-9a-f-]{36})/)[1];
r = await fetch(base+`/admin/users/${userId}?admin_access=${a.access}`, { headers:{cookie:a.cookie} });
html = await r.text();
assert.ok(html.includes('Account Controls'));
const acsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
r = await fetch(base+`/dashboard/transfers/confirm`, { method:'POST', headers:{cookie:c.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:c.access,transfer_type:'Deposit',recipient_name:'Beneficiary GmbH',account_iban:'DE89370400440532013000',amount:'5',currency:'USD',reference:'DISABLED-TEST',purpose:'Invoice'}), redirect:'manual' });
html = await r.text();
const disabledIdk = html.match(/name="idempotency_key" value="([^"]+)/)[1];
const disabledCode = html.match(/your verification code is: <b>(\d{6})<\/b>/)[1];
r = await fetch(base+`/admin/users/${userId}/controls`, { method:'POST', headers:{cookie:a.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:acsrf,_admin_access:a.access,action:'disable_transfers',reason:'Automated restriction check',confirm:'YES'}), redirect:'manual' });
assert.equal(r.status,302);
r = await fetch(base+`/dashboard/transfers/submit`, { method:'POST', headers:{cookie:c.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:c.access,transfer_type:'Deposit',recipient_name:'Beneficiary GmbH',account_iban:'DE89370400440532013000',amount:'5',currency:'USD',reference:'DISABLED-TEST',purpose:'Invoice',confirm:'YES',idempotency_key:disabledIdk,pin:'1234',code:disabledCode}), redirect:'manual' });
assert.equal(r.status,400);
assert.ok((await r.text()).includes('Your account is currently restricted'));
await fetch(base+`/admin/users/${userId}/controls`, { method:'POST', headers:{cookie:a.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:acsrf,_admin_access:a.access,action:'enable_transfers',reason:'Automated restore',confirm:'YES'}), redirect:'manual' });
r = await fetch(base+`/admin/ai-assistant?admin_access=${a.access}`, { headers:{cookie:a.cookie} });
html = await r.text();
assert.ok(html.includes('AI Assistant'));
r = await fetch(base+`/admin/support-tickets?admin_access=${a.access}`, { headers:{cookie:a.cookie} });
html = await r.text();
assert.ok(html.includes('Support Tickets'));
r = await fetch(base+`/webhooks/payment-provider/test`, { method:'POST', headers:{'content-type':'application/json','x-provider-signature':'bad'}, body:JSON.stringify({id:'evt_test'}) });
assert.equal(r.status,401);
console.log('Transfer and support tests passed');
