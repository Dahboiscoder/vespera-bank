import assert from 'node:assert/strict';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);

let r = await fetch(base+'/admin/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({email:'admin@novacapital.test',password:'Admin#2026!'}),redirect:'manual'});
const superCookie = r.headers.get('set-cookie');
const superAccess = r.headers.get('location').split('admin_access=')[1];

r = await fetch(base+`/admin/admin-users?admin_access=${superAccess}`, { headers:{cookie:superCookie} });
assert.equal(r.status, 200, 'SUPER_ADMIN can access admin-users page');
let html = await r.text();
const csrf = html.match(/name="_csrf" value="([^"]+)/)[1];

const viewerEmail = `viewer${Date.now()}@example.test`;
r = await fetch(base+'/admin/admin-users', { method:'POST', headers:{cookie:superCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_admin_access:superAccess,name:'Viewer Test',email:viewerEmail,password:'ViewerPass#1',role:'VIEWER',confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 302, 'viewer creation should redirect');

const financeEmail = `finance${Date.now()}@example.test`;
r = await fetch(base+'/admin/admin-users', { method:'POST', headers:{cookie:superCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_admin_access:superAccess,name:'Finance Test',email:financeEmail,password:'FinancePass#1',role:'FINANCE_ADMIN',confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 302, 'finance admin creation should redirect');

// VIEWER: can view, cannot mutate
r = await fetch(base+'/admin/login', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({email:viewerEmail,password:'ViewerPass#1'}), redirect:'manual' });
const viewerCookie = r.headers.get('set-cookie');
const viewerAccess = r.headers.get('location').split('admin_access=')[1];

r = await fetch(base+`/admin/transactions?admin_access=${viewerAccess}`, { headers:{cookie:viewerCookie} });
assert.equal(r.status, 200, 'viewer can view transactions page');
r = await fetch(base+'/admin/transactions/preview', { method:'POST', headers:{cookie:viewerCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_admin_access:viewerAccess,account_id:'00000000-0000-0000-0000-000000000000',kind:'Deposit',amount:'10',description:'test'}), redirect:'manual' });
assert.equal(r.status, 403, 'viewer must be denied creating a transaction preview');
r = await fetch(base+`/admin/admin-users?admin_access=${viewerAccess}`, { headers:{cookie:viewerCookie} });
assert.equal(r.status, 403, 'viewer must be denied admin-users management');

// FINANCE_ADMIN: can adjust balances, cannot manage admin users
r = await fetch(base+'/admin/login', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({email:financeEmail,password:'FinancePass#1'}), redirect:'manual' });
const financeCookie = r.headers.get('set-cookie');
const financeAccess = r.headers.get('location').split('admin_access=')[1];

r = await fetch(base+`/admin/balances?admin_access=${financeAccess}`, { headers:{cookie:financeCookie} });
assert.equal(r.status, 200, 'finance admin can view balances page');
r = await fetch(base+`/admin/admin-users?admin_access=${financeAccess}`, { headers:{cookie:financeCookie} });
assert.equal(r.status, 403, 'finance admin must be denied admin-users management');

// Unauthorized access
r = await fetch(base+'/admin/dashboard', { redirect:'manual' });
assert.equal(r.status, 302);
assert.ok(r.headers.get('location').startsWith('/admin/login'), 'unauthenticated request redirected to admin login');

const custEmail = `rbaccust${Date.now()}@example.test`;
r = await fetch(base + '/register', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({name:'RBAC Cust',email:custEmail,phone:'+15550008888',password:'Password#2026',confirmPassword:'Password#2026'}), redirect:'manual' });
const custCookie = r.headers.get('set-cookie');
r = await fetch(base+'/admin/dashboard', { headers:{cookie:custCookie}, redirect:'manual' });
assert.equal(r.status, 302, 'customer session cannot access any admin route');

console.log('Admin RBAC tests passed');
