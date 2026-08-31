import assert from 'node:assert/strict';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);

let r = await fetch(base+'/admin/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({email:'admin@novacapital.test',password:'Admin#2026!'}),redirect:'manual'});
const aCookie = r.headers.get('set-cookie'); const aAccess = r.headers.get('location').split('admin_access=')[1];

r = await fetch(base + `/admin/balances?admin_access=${aAccess}&q=customer@novacapital.test`, { headers:{cookie:aCookie} });
let html = await r.text();
assert.ok(html.includes('name="transactionDate"'), 'balance adjustment form should include a Transaction Date field');
const csrf = html.match(/name="_csrf" value="([^"]+)/)[1];
const accountId = html.match(/\/admin\/balances\/([0-9a-f-]{36})\/adjust/)[1];

r = await fetch(base + `/admin/balances/${accountId}/adjust/preview`, { method:'POST', headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_admin_access:aAccess,action:'ADMIN CREDIT',amount:'42',reason:'Backdated test funding',transactionDate:'2024-03-15',confirm:'YES'}), redirect:'manual' });
html = await r.text();
assert.ok(html.includes('2024-03-15'), 'preview screen should show the chosen transaction date');
const pIdk = html.match(/name="idempotency_key" value="([^"]+)/)[1];
console.log('Preview screen shows the custom transaction date');

r = await fetch(base + `/admin/balances/${accountId}/adjust`, { method:'POST', headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_admin_access:aAccess,action:'ADMIN CREDIT',amount:'42',reason:'Backdated test funding',transactionDate:'2024-03-15',idempotency_key:pIdk,confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 302);
console.log('Adjustment with a custom transaction date is applied');

r = await fetch(base + `/admin/transactions?admin_access=${aAccess}&user=customer@novacapital.test`, { headers:{cookie:aCookie} });
html = await r.text();
assert.ok(html.includes('Mar 15, 2024') || html.includes('3/15/2024'), 'transaction list should reflect the backdated date');
const txId = html.match(/\/admin\/transactions\/([0-9a-f-]{36})/)[1];
r = await fetch(base + `/admin/transactions/${txId}?admin_access=${aAccess}`, { headers:{cookie:aCookie} });
html = await r.text();
assert.ok(html.includes('Mar 15, 2024') || html.includes('3/15/2024'), 'transaction detail Transaction Date should reflect the backdate');
assert.ok(html.includes('value="transaction_date"'), 'correction form should offer transaction_date as an editable field');
const corrCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
console.log('Backdated transaction shows the chosen date, and the correction form offers to edit it');

r = await fetch(base + `/admin/transactions/${txId}/correct`, { method:'POST', headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:corrCsrf,_admin_access:aAccess,field_name:'transaction_date',new_value:'not-a-date',reason:'test bad date'}), redirect:'manual' });
assert.equal(r.status, 400);
html = await r.text();
assert.ok(html.includes('valid date'));
console.log('Malformed transaction_date correction is rejected');

r = await fetch(base + `/admin/transactions/${txId}/correct`, { method:'POST', headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:corrCsrf,_admin_access:aAccess,field_name:'transaction_date',new_value:'2019-01-01',reason:'Correcting migrated date'}), redirect:'manual' });
assert.equal(r.status, 302);
r = await fetch(base + `/admin/transactions/${txId}?admin_access=${aAccess}`, { headers:{cookie:aCookie} });
html = await r.text();
assert.ok(html.includes('Jan 1, 2019') || html.includes('1/1/2019'), 'transaction detail should reflect the corrected date');
assert.ok(html.includes('Correcting migrated date'));
console.log('Editing an existing transaction\'s date via Correction works and is recorded');

console.log('Transaction date tests passed');
