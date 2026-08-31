import assert from 'node:assert/strict';
import { registerAndActivate } from './_test-helpers.js';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);

const email = `cardcheck${Date.now()}@example.com`;
const { cookie, access } = await registerAndActivate(base, { name:'Card Check', email, phone:'+15550009999', password:'Password#2026' });

let r = await fetch(base + `/dashboard/cards?access=${access}`, { headers:{cookie} });
let html = await r.text();
assert.ok(html.includes('No Cards Yet'));
assert.ok(html.includes('Virtual Cards Made Easy'));
const csrf = html.match(/name="_csrf" value="([^"]+)/)[1];
console.log('Empty state renders with promo panel');

r = await fetch(base + '/dashboard/cards/apply', { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:access,network:'Visa',spendingLimit:'750'}), redirect:'manual' });
assert.equal(r.status, 302);
r = await fetch(base + `/dashboard/cards?access=${access}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('Application Pending'));
assert.ok(html.includes('<b>1</b>'), 'pending applications stat should be 1');
assert.ok(html.includes('already have a card application pending'));
console.log('Application submitted, shows as pending, blocks a second application');

r = await fetch(base+'/admin/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({email:'admin@novacapital.test',password:'Admin#2026!'}),redirect:'manual'});
const aCookie = r.headers.get('set-cookie'); const aAccess = r.headers.get('location').split('admin_access=')[1];
r = await fetch(base + `/admin/cards?admin_access=${aAccess}&status=pending`, { headers:{cookie:aCookie} });
html = await r.text();
assert.ok(html.includes(email));
const cardIdMatch = html.match(/\/admin\/cards\/([0-9a-f-]{36})/);
assert.ok(cardIdMatch, 'admin list should link to a review page');
const cardId = cardIdMatch[1];
r = await fetch(base + `/admin/cards/${cardId}?admin_access=${aAccess}`, { headers:{cookie:aCookie} });
html = await r.text();
assert.ok(html.includes('Submit Decision'));
const aCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
r = await fetch(base + `/admin/cards/${cardId}/action`, { method:'POST', headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:aCsrf,_admin_access:aAccess,action:'approve',confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 302);
console.log('Admin approves the card application');

// A second approval attempt on the same (now non-pending) application must be rejected
r = await fetch(base + `/admin/cards/${cardId}/action`, { method:'POST', headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:aCsrf,_admin_access:aAccess,action:'approve',confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 400);
console.log('Re-reviewing an already-decided application is rejected');

r = await fetch(base + `/dashboard/cards?access=${access}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('•••• '));
assert.ok(!html.includes('Application Pending'));
assert.ok(html.includes('Freeze card'));
console.log('Approved card shows a real masked number and controls');

const freezeMatch = html.match(/action="[^"]*\/dashboard\/cards\/([0-9a-f-]{36})\/freeze/);
const myCardId = freezeMatch[1];
r = await fetch(base + `/dashboard/cards/${myCardId}/freeze`, { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:access}), redirect:'manual' });
assert.equal(r.status, 302);
r = await fetch(base + `/dashboard/cards?access=${access}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('Frozen'));
assert.ok(html.includes('Unfreeze card'));
console.log('Freeze works and toggles the UI');

// Another customer cannot freeze someone else's card
const other = await (async () => {
  const otherEmail = `cardother${Date.now()}@example.com`;
  return await registerAndActivate(base, { name:'Other Person', email:otherEmail, phone:'+15550001111', password:'Password#2026' });
})();
r = await fetch(base + `/dashboard/cards?access=${other.access}`, { headers:{cookie:other.cookie} });
html = await r.text();
const otherCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
r = await fetch(base + `/dashboard/cards/${myCardId}/unfreeze`, { method:'POST', headers:{cookie:other.cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:otherCsrf,_access:other.access}), redirect:'manual' });
assert.equal(r.status, 404, 'a customer must not be able to control another customer\'s card');
console.log('Card ownership enforced (404 for a non-owner action)');

r = await fetch(base + `/dashboard/cards/${myCardId}/limit`, { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:access,spendingLimit:'1200'}), redirect:'manual' });
assert.equal(r.status, 302);
r = await fetch(base + `/dashboard/cards?access=${access}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('1,200'), 'spending limit should update');
console.log('Spending limit update works');

r = await fetch(base + `/dashboard/cards/${myCardId}/report-lost`, { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_access:access,confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 302);
r = await fetch(base + `/dashboard/cards?access=${access}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('Cancelled'));
assert.ok(html.includes('Apply for a New Card'), 'a new application should be allowed once the old card is cancelled');
console.log('Report lost/stolen cancels the card and unblocks a new application');

console.log('Cards tests passed');
