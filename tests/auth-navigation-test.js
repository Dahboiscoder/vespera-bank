import assert from 'node:assert/strict';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);

// Login page fields and links
let r = await fetch(base + '/login');
let html = await r.text();
assert.equal(r.status, 200);
for (const expected of ['Email', 'Password', 'Remember me', 'Sign in', 'Forgot password', 'Create account']) assert.ok(html.includes(expected), expected);

// Direct dashboard access redirects to /login with a next= redirect target and displays notice
r = await fetch(base + '/dashboard', { redirect: 'manual' });
assert.equal(r.status, 302);
assert.equal(r.headers.get('location'), '/login?next=%2Fdashboard');
const noticeCookie = r.headers.get('set-cookie');
r = await fetch(base + '/login?next=%2Fdashboard', { headers: { cookie: noticeCookie } });
html = await r.text();
assert.ok(html.includes('Please sign in to access your dashboard.'));
assert.ok(html.includes('name="next" value="/dashboard"'));

// Failed login stays on POST /login response and shows exact generic error
r = await fetch(base + '/login', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({email:'nobody@example.test',password:'WrongPass#1'}), redirect:'manual' });
html = await r.text();
assert.equal(r.status, 401);
assert.ok(html.includes('Incorrect email or password.'));
assert.ok(!r.headers.get('location'));

// Registration creates account, authenticated session, $0.00 dashboard
const email = `nav${Date.now()}@example.test`;
r = await fetch(base + '/register', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({name:'Navigation User', email, phone:'+15551231234', password:'Password#2026', confirmPassword:'Password#2026'}), redirect:'manual' });
assert.equal(r.status, 302);
assert.ok(r.headers.get('location').startsWith('/dashboard'));
const customerCookie = r.headers.get('set-cookie');
assert.ok(customerCookie.includes('sid='));
r = await fetch(base + '/dashboard', { headers:{cookie:customerCookie} });
html = await r.text();
assert.equal(r.status, 200);
assert.ok(html.includes('Good ') && html.includes('Navigation'));
assert.ok(html.includes('$0.00'));

// Existing user login redirects only to /dashboard, ignoring next=/register
r = await fetch(base + '/login', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({email, password:'Password#2026', next:'/register'}), redirect:'manual' });
assert.equal(r.status, 302);
assert.ok(r.headers.get('location').startsWith('/dashboard'));
const loginCookie = r.headers.get('set-cookie');

// A valid /dashboard/... next target is honored (e.g. an emailed receipt link while logged out)
r = await fetch(base + '/login', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({email, password:'Password#2026', next:'/dashboard/transfers/history'}), redirect:'manual' });
assert.equal(r.status, 302);
assert.ok(r.headers.get('location').startsWith('/dashboard/transfers/history?access='), r.headers.get('location'));

// HTTPS preview/iframe requests must receive SameSite=None; Secure cookies so login persists in Arena preview
r = await fetch(base + '/login', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded','x-forwarded-proto':'https'}, body:form({email, password:'Password#2026'}), redirect:'manual' });
assert.equal(r.status, 302);
const previewCookie = r.headers.get('set-cookie');
assert.ok(/SameSite=None/i.test(previewCookie), previewCookie);
assert.ok(/Secure/i.test(previewCookie), previewCookie);


// Public preview host without x-forwarded-proto must still receive cross-site compatible cookies
r = await fetch(base + '/login', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded','x-forwarded-host':'sbx-preview.arena.site'}, body:form({email, password:'Password#2026'}), redirect:'manual' });
assert.equal(r.status, 302);
const arenaCookie = r.headers.get('set-cookie');
assert.ok(/SameSite=None/i.test(arenaCookie), arenaCookie);
assert.ok(/Secure/i.test(arenaCookie), arenaCookie);

// Logout invalidates session, clears cookie, redirects to /login; old cookie cannot view dashboard
r = await fetch(base + '/dashboard', { headers:{cookie:loginCookie} });
html = await r.text();
const csrf = html.match(/name="_csrf" value="([^"]+)/)[1];
r = await fetch(base + '/logout', { method:'POST', headers:{cookie:loginCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf}), redirect:'manual' });
assert.equal(r.status, 302);
assert.equal(r.headers.get('location'), '/login');
r = await fetch(base + '/dashboard', { headers:{cookie:loginCookie}, redirect:'manual' });
assert.equal(r.status, 302);
assert.equal(r.headers.get('location'), '/login?next=%2Fdashboard');

// Admin remains separate
r = await fetch(base + '/admin/login', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({email:'admin@novacapital.test',password:'Admin#2026!'}), redirect:'manual' });
assert.equal(r.status, 302);
assert.ok(r.headers.get('location').startsWith('/admin/dashboard'));
const adminCookie = r.headers.get('set-cookie');
r = await fetch(base + '/admin/dashboard', { headers:{cookie:adminCookie} });
assert.equal(r.status, 200);
r = await fetch(base + '/admin/dashboard', { headers:{cookie:customerCookie}, redirect:'manual' });
assert.equal(r.status, 302);
assert.ok(r.headers.get('location').startsWith('/admin/login'));

console.log('Auth navigation tests passed');
