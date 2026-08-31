import assert from 'node:assert/strict';
import { registerAndVerify } from './_test-helpers.js';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);

let r = await fetch(base+'/admin/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({email:'admin@novacapital.test',password:'Admin#2026!'}),redirect:'manual'});
const aCookie = r.headers.get('set-cookie'); const aAccess = r.headers.get('location').split('admin_access=')[1];

const email = `statement${Date.now()}@example.com`;
const { cookie, access } = await registerAndVerify(base, { name:'Statement Test', email, phone:'+15550006666', password:'Password#2026' });

r = await fetch(base + `/admin/balances?admin_access=${aAccess}&q=${encodeURIComponent(email)}`, { headers:{cookie:aCookie} });
let html = await r.text();
const fundCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
const accountId = html.match(/action="\/admin\/balances\/([^"]+)\/adjust\/preview"/)[1];
r = await fetch(base + `/admin/balances/${accountId}/adjust/preview`, { method:'POST', headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:fundCsrf,_admin_access:aAccess,action:'ADMIN CREDIT',amount:'300',reason:'Statement test funding',transactionDate:new Date().toISOString().slice(0,10),confirm:'YES'}), redirect:'manual' });
html = await r.text();
const pCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
const pIdk = html.match(/name="idempotency_key" value="([^"]+)/)[1];
await fetch(base + `/admin/balances/${accountId}/adjust`, { method:'POST', headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:pCsrf,_admin_access:aAccess,action:'ADMIN CREDIT',amount:'300',reason:'Statement test funding',transactionDate:new Date().toISOString().slice(0,10),idempotency_key:pIdk,confirm:'YES'}), redirect:'manual' });

r = await fetch(base + `/dashboard/transactions?access=${access}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('activity-amount pos'), 'credits must be visually distinguished from debits');
assert.ok(html.includes('+$300.00'), 'the funded deposit should show as a credit with a + sign');
console.log('Transactions activity feed visually distinguishes money in from money out');

r = await fetch(base + `/dashboard/statements?access=${access}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('Generate a Statement'));
const myAccountId = html.match(/<option value="([0-9a-f-]{36})"[^>]*>Everyday Account/)[1];
console.log('Statement picker renders with the account selectable');

r = await fetch(base + `/dashboard/statements?accountId=${myAccountId}&period=all_time&access=${access}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('VESPERA BANK') && html.includes('statement-brand'));
assert.ok(html.includes('Opening Balance'));
assert.ok(html.includes('Closing Balance'));
assert.ok(html.includes('$300.00'));
assert.ok(html.includes('id="printReceiptBtn"'));
console.log('Generated statement shows letterhead, opening/closing balance and a print control');

const dlUrl = html.match(/href="([^"]*download\.csv[^"]*)"/)[1].replace(/&amp;/g,'&');
r = await fetch(base + dlUrl, { headers:{cookie} });
assert.equal(r.status, 200);
assert.ok((r.headers.get('content-disposition')||'').includes('attachment'));
const csv = await r.text();
assert.ok(csv.startsWith('Date,Type,Description,Money In,Money Out,Balance'));
assert.ok(csv.includes('300.00'));
console.log('CSV download returns a real, correctly-formatted statement file');

// A different customer cannot view or download this account's statement
const email2 = `otherstatement${Date.now()}@example.com`;
const { cookie: cookie2, access: access2 } = await registerAndVerify(base, { name:'Other Person', email:email2, phone:'+15550007777', password:'Password#2026' });
r = await fetch(base + `/dashboard/statements?accountId=${myAccountId}&period=all_time&access=${access2}`, { headers:{cookie:cookie2} });
html = await r.text();
assert.ok(html.includes('Account not found'), 'another customer must not be able to view this account\'s statement');
r = await fetch(base + `/dashboard/statements/download.csv?accountId=${myAccountId}&period=all_time&access=${access2}`, { headers:{cookie:cookie2} });
assert.equal(r.status, 404, 'another customer must not be able to download this account\'s statement CSV');
console.log('Statement viewing and CSV download are protected against cross-account access');

console.log('Statements tests passed');
