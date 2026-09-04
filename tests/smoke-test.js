import assert from 'node:assert/strict';
import { registerAndActivate } from './_test-helpers.js';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);
async function text(path, opts={}) { const r=await fetch(base+path, opts); return { r, t:await r.text() }; }
for (const p of ['/', '/personal', '/business', '/accounts', '/savings', '/cards', '/loans', '/transfers', '/fx', '/security', '/about', '/contact', '/help', '/login', '/register']) {
  const {r,t}=await text(p); assert.equal(r.status, 200, p); assert.ok(t.includes('Vespera Bank') || t.includes('VESPERA BANK'), p);
}
const fxPage = await text('/fx?from=USD&to=JPY&amount=100');
assert.ok(fxPage.t.includes('JPY'));
assert.ok(fxPage.t.includes('Rate not configured') || fxPage.t.includes('Exchange rate'));
for (const code of ['AUD','CAD','JPY','CHF','ZAR','BRL','INR','CNY']) assert.ok(fxPage.t.includes(`<option ${code==='USD'?'selected':''}>${code}</option>`) || fxPage.t.includes(`>${code}</option>`), code);
let r = await fetch(base+'/dashboard', { redirect:'manual' }); assert.equal(r.status, 302); assert.ok(r.headers.get('location').startsWith('/login'));
const email = `user${Date.now()}@example.com`;
const { cookie, access } = await registerAndActivate(base, { name:'Jane Zero', email, phone:'+15550001111', password:'Password#2026' });
let page = await fetch(base+`/dashboard?access=${access}`, { headers:{cookie} }); let html = await page.text(); assert.equal(page.status, 200); assert.ok(html.includes('Good ') && html.includes('Jane')); assert.ok(html.includes('$0.00'));
r = await fetch(base+'/logout', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:'bad'}), redirect:'manual' }); assert.equal(r.status, 403);
console.log('Smoke tests passed');
