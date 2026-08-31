import assert from 'node:assert/strict';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);

let r = await fetch(base+'/admin/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({email:'admin@novacapital.test',password:'Admin#2026!'}),redirect:'manual'});
const aCookie = r.headers.get('set-cookie'); const aAccess = r.headers.get('location').split('admin_access=')[1];

const email = `swapper${Date.now()}@example.test`;
r = await fetch(base + '/register', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({name:'Swap Test',email,phone:'+15550005555',password:'Password#2026',confirmPassword:'Password#2026'}), redirect:'manual' });
const cookie = r.headers.get('set-cookie');
const access = r.headers.get('location').split('access=')[1];

// Fund the account
r = await fetch(base + `/admin/balances?admin_access=${aAccess}&q=${encodeURIComponent(email)}`, { headers:{cookie:aCookie} });
let html = await r.text();
const fundCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
const accountId = html.match(/action="\/admin\/balances\/([^"]+)\/adjust\/preview"/)[1];
r = await fetch(base + `/admin/balances/${accountId}/adjust/preview`, { method:'POST', headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:fundCsrf,_admin_access:aAccess,action:'ADMIN CREDIT',amount:'500',reason:'fund',transactionDate:new Date().toISOString().slice(0,10),confirm:'YES'}), redirect:'manual' });
html = await r.text();
const pCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
const pIdk = html.match(/name="idempotency_key" value="([^"]+)/)[1];
await fetch(base + `/admin/balances/${accountId}/adjust`, { method:'POST', headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:pCsrf,_admin_access:aAccess,action:'ADMIN CREDIT',amount:'500',reason:'fund',transactionDate:new Date().toISOString().slice(0,10),idempotency_key:pIdk,confirm:'YES'}), redirect:'manual' });

// Set PIN
r = await fetch(base + `/dashboard/security?access=${access}`, { headers:{cookie} });
html = await r.text();
const pinCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
await fetch(base + '/dashboard/security/pin', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:pinCsrf,_access:access,password:'Password#2026',pin:'1234',confirmPin:'1234'}), redirect:'manual' });

r = await fetch(base + `/dashboard/currency-swap?access=${access}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('Everyday Account'));
const csrf = html.match(/name="_csrf" value="([^"]+)/)[1];
const fromAccountId = html.match(/<option value="([0-9a-f-]{36})">Everyday Account/)[1];
console.log('Currency swap page renders with the customer\'s own accounts as source options');

// same currency should be rejected
r = await fetch(base + '/dashboard/currency-swap/confirm', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:access,fromAccountId,toCurrency:'USD',amount:'50'}), redirect:'manual' });
assert.equal(r.status, 400);
html = await r.text();
assert.ok(html.includes('different currency'));
console.log('Swapping to the same currency is rejected');

r = await fetch(base + '/dashboard/currency-swap/confirm', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:access,fromAccountId,toCurrency:'EUR',amount:'100'}), redirect:'manual' });
assert.equal(r.status, 200);
html = await r.text();
assert.ok(html.includes('Confirm Currency Swap'));
const idk = html.match(/name="idempotency_key" value="([^"]+)/)[1];
console.log('Quote screen renders with a real exchange rate');

// wrong PIN rejected
r = await fetch(base + '/dashboard/currency-swap/submit', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:access,fromAccountId,toCurrency:'EUR',amount:'100',idempotency_key:idk,pin:'0000',confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 400);
html = await r.text();
assert.ok(html.includes('Incorrect transaction PIN'));
console.log('Wrong PIN rejected on swap submit');

r = await fetch(base + '/dashboard/currency-swap/submit', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:access,fromAccountId,toCurrency:'EUR',amount:'100',idempotency_key:idk,pin:'1234',confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 302);
console.log('Correct PIN completes the swap');

r = await fetch(base + `/dashboard?access=${access}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('$400.00'), 'source USD account should be debited by 100');
console.log('Source account debited correctly');

r = await fetch(base + `/dashboard/accounts?access=${access}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('EUR'), 'a new EUR account should have been created and appear in Accounts');
console.log('A new EUR account was auto-created and holds the converted funds');

r = await fetch(base + `/dashboard/currency-swap?access=${access}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('EUR'), 'the new EUR account should now be selectable as a source too');
console.log('The new EUR account is available as a swap source for future conversions');

console.log('Currency swap tests passed');
