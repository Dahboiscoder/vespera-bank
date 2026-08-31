import assert from 'node:assert/strict';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);

const email = `borrower${Date.now()}@example.test`;
let r = await fetch(base + '/register', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({name:'Borrower Test',email,phone:'+15550004444',password:'Password#2026',confirmPassword:'Password#2026'}), redirect:'manual' });
const cookie = r.headers.get('set-cookie');
const access = r.headers.get('location').split('access=')[1];

r = await fetch(base + `/dashboard/loans?access=${access}`, { headers:{cookie} });
let html = await r.text();
assert.ok(html.includes('No loan applications yet'));
assert.ok(html.includes('Personal Loan'), 'seeded loan products should appear in the dropdown');
const csrf = html.match(/name="_csrf" value="([^"]+)/)[1];
const productId = html.match(/<option value="([0-9a-f-]{36})">Personal Loan/)[1];
console.log('Loans page renders empty state with real loan products to choose from');

// Amount outside the product's min/max should be rejected
r = await fetch(base + '/dashboard/loans/apply', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:access,productId,principal:'999999',termMonths:'36',purpose:'Too much'}), redirect:'manual' });
assert.equal(r.status, 400);
html = await r.text();
assert.ok(html.includes('must be between'));
console.log('Amount outside the product range is rejected');

r = await fetch(base + '/dashboard/loans/apply', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:access,productId,principal:'5000',termMonths:'36',purpose:'Debt consolidation'}), redirect:'manual' });
assert.equal(r.status, 302);
r = await fetch(base + `/dashboard/loans?access=${access}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('Pending Review'));
assert.ok(html.includes('already have a loan application pending'));
console.log('Loan application submitted, shows as pending, blocks a second one');

r = await fetch(base+'/admin/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({email:'admin@novacapital.test',password:'Admin#2026!'}),redirect:'manual'});
const aCookie = r.headers.get('set-cookie'); const aAccess = r.headers.get('location').split('admin_access=')[1];
r = await fetch(base + `/admin/loans?admin_access=${aAccess}&status=pending`, { headers:{cookie:aCookie} });
html = await r.text();
assert.ok(html.includes(email));
const loanId = html.match(/\/admin\/loans\/([0-9a-f-]{36})/)[1];
r = await fetch(base + `/admin/loans/${loanId}?admin_access=${aAccess}`, { headers:{cookie:aCookie} });
html = await r.text();
assert.ok(html.includes('Estimated Monthly Payment'));
const aCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
r = await fetch(base + `/admin/loans/${loanId}/action`, { method:'POST', headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:aCsrf,_admin_access:aAccess,action:'approve',confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 302);
console.log('Admin approves the loan application');

r = await fetch(base + `/admin/loans/${loanId}/action`, { method:'POST', headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:aCsrf,_admin_access:aAccess,action:'approve',confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 400);
console.log('Re-reviewing an already-decided application is rejected');

r = await fetch(base + `/dashboard?access=${access}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('$5,000.00'), 'account balance should reflect the disbursed loan principal');
r = await fetch(base + `/dashboard/loans?access=${access}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('Approved'));
assert.ok(!html.includes('already have a loan application pending'));
console.log('Loan disbursed to the account and a new application is now allowed');

console.log('Loans tests passed');
