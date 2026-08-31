import assert from 'node:assert/strict';
import { registerAndVerify } from './_test-helpers.js';
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
r = await fetch(base + '/login', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({email:'nobody@example.com',password:'WrongPass#1'}), redirect:'manual' });
html = await r.text();
assert.equal(r.status, 401);
assert.ok(html.includes('Incorrect email or password.'));
assert.ok(!r.headers.get('location'));

// Registration requires email verification before any session exists, then
// lands on the (allowlisted, pre-KYC-approval) $0.00 dashboard overview
const email = `nav${Date.now()}@example.com`;
r = await fetch(base + '/register', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({firstName:'Navigation', lastName:'User', email, phone:'+15551231234', accountType:'Checking', password:'Password#2026', confirmPassword:'Password#2026'}), redirect:'manual' });
assert.equal(r.status, 302);
assert.equal(r.headers.get('location'), '/register/verify');
assert.ok(!(r.headers.get('set-cookie')||'').includes('sid='), 'no session should exist before the email code is verified');
const rvCookie = (r.headers.get('set-cookie')||'').match(/register_verify=([^;]+)/)[1];
r = await fetch(base + '/register/verify', { headers:{cookie:`register_verify=${rvCookie}`} });
const code = (await r.text()).match(/your code is: <b>(\d{6})<\/b>/)[1];
r = await fetch(base + '/register/verify', { method:'POST', headers:{cookie:`register_verify=${rvCookie}`,'content-type':'application/x-www-form-urlencoded'}, body:form({code}), redirect:'manual' });
assert.equal(r.status, 302);
assert.match(r.headers.get('location'), /^\/dashboard\/kyc\?access=/);
const sidMatch = (r.headers.get('set-cookie')||'').match(/sid=([^;]+)/);
assert.ok(sidMatch, 'expected a sid cookie among the Set-Cookie headers');
const customerCookie = `sid=${sidMatch[1]}`;
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

// A valid /dashboard/... next target is honored (e.g. an emailed link while logged out).
// Uses /dashboard/security since this account hasn't completed KYC approval and every
// other dashboard route redirects there until it does -- unrelated to the next= mechanic itself.
r = await fetch(base + '/login', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({email, password:'Password#2026', next:'/dashboard/security'}), redirect:'manual' });
assert.equal(r.status, 302);
assert.ok(r.headers.get('location').startsWith('/dashboard/security?access='), r.headers.get('location'));

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
