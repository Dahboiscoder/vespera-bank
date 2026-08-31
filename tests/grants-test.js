import assert from 'node:assert/strict';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);

const email = `grantee${Date.now()}@example.test`;
let r = await fetch(base + '/register', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({name:'Grant Applicant',email,phone:'+15550003333',password:'Password#2026',confirmPassword:'Password#2026'}), redirect:'manual' });
const cookie = r.headers.get('set-cookie');
const access = r.headers.get('location').split('access=')[1];

r = await fetch(base + `/dashboard/grants?access=${access}`, { headers:{cookie} });
let html = await r.text();
assert.ok(html.includes('No applications yet'));
const csrf = html.match(/name="_csrf" value="([^"]+)/)[1];
console.log('Empty state renders with an apply form');

r = await fetch(base + '/dashboard/grants/apply', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:access,program:'Small Business Grant',amountRequested:'250',purpose:'New equipment'}), redirect:'manual' });
assert.equal(r.status, 302);
r = await fetch(base + `/dashboard/grants?access=${access}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('Pending Review'));
assert.ok(html.includes('already have a grant application pending'));
console.log('Application submitted, shows as pending, blocks a second one');

r = await fetch(base+'/admin/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({email:'admin@novacapital.test',password:'Admin#2026!'}),redirect:'manual'});
const aCookie = r.headers.get('set-cookie'); const aAccess = r.headers.get('location').split('admin_access=')[1];
r = await fetch(base + `/admin/grants?admin_access=${aAccess}&status=pending`, { headers:{cookie:aCookie} });
html = await r.text();
assert.ok(html.includes(email));
const grantId = html.match(/\/admin\/grants\/([0-9a-f-]{36})/)[1];
r = await fetch(base + `/admin/grants/${grantId}?admin_access=${aAccess}`, { headers:{cookie:aCookie} });
html = await r.text();
assert.ok(html.includes('Submit Decision'));
const aCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];

// A role without grants.manage cannot approve
r = await fetch(base + `/admin/admin-users?admin_access=${aAccess}`, { headers:{cookie:aCookie} });
html = await r.text();
const auCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
const viewerEmail = `viewer${Date.now()}@example.test`;
r = await fetch(base + '/admin/admin-users', { method:'POST', headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:auCsrf,_admin_access:aAccess,name:'Viewer',email:viewerEmail,password:'ViewerPass#1',role:'VIEWER',confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 302);
r = await fetch(base + '/admin/login', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({email:viewerEmail,password:'ViewerPass#1'}), redirect:'manual' });
const vCookie = r.headers.get('set-cookie'); const vAccess = r.headers.get('location').split('admin_access=')[1];
r = await fetch(base + `/admin/grants/${grantId}/action`, { method:'POST', headers:{cookie:vCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_admin_access:vAccess,action:'approve',confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 403, 'a VIEWER admin must be denied grant approval');
console.log('VIEWER role denied grant approval (403)');

r = await fetch(base + `/admin/grants/${grantId}/action`, { method:'POST', headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:aCsrf,_admin_access:aAccess,action:'approve',confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 302);
console.log('Admin approves the grant application');

r = await fetch(base + `/admin/grants/${grantId}/action`, { method:'POST', headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:aCsrf,_admin_access:aAccess,action:'approve',confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 400);
console.log('Re-reviewing an already-decided application is rejected');

r = await fetch(base + `/dashboard?access=${access}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('$250.00'), 'account balance should reflect the disbursed grant');
r = await fetch(base + `/dashboard/grants?access=${access}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('Approved'));
assert.ok(!html.includes('already have a grant application pending'), 'a new application should be allowed after a decision');
console.log('Grant disbursed to the account and a new application is now allowed');

console.log('Grants tests passed');
