import assert from 'node:assert/strict';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);

let r = await fetch(base + '/login');
let html = await r.text();
assert.ok(html.includes('Continue with Google'));
r = await fetch(base + '/register');
html = await r.text();
assert.ok(html.includes('Continue with Google'));

r = await fetch(base + '/auth/google', { redirect:'manual' });
assert.equal(r.status, 302);
const googleLocation = r.headers.get('location');
if (googleLocation.startsWith('https://accounts.google.com/')) {
  const googleUrl = new URL(googleLocation);
  assert.ok(googleUrl.searchParams.get('client_id'));
  assert.equal(googleUrl.searchParams.get('response_type'), 'code');
} else {
  assert.equal(googleLocation, '/login');
  assert.ok(r.headers.get('set-cookie').includes('login_notice='));
}

r = await fetch(base + '/auth/google/callback?error=access_denied', { redirect:'manual' });
assert.equal(r.status, 302);
assert.equal(r.headers.get('location'), '/login');

r = await fetch(base + '/');
html = await r.text();
assert.ok(html.includes('Welcome to Vespera Bank'));
assert.ok(html.includes('Open an Account'));
assert.ok(!html.includes('Modern bank experience'));
assert.ok(html.includes('News & insights'));
assert.ok(html.includes('Vespera AI Assistant'));

r = await fetch(base + '/api/chat', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ message:'cards and transfers' }) });
assert.equal(r.status, 200);
// With a real AI provider configured, wording (and capitalization) varies between calls — match the topic, not exact casing.
assert.ok(/card/i.test(await r.text()));

r = await fetch(base + '/api/chat', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ message:'tell me my account balance' }) });
assert.equal(r.status, 200);
let chatData = await r.json();
// With a real AI provider configured, exact phrasing varies between calls — accept any reasonable way of saying "sign in required".
assert.ok(/sign(ed|ing)? in|log(ged|ging)? in/i.test(chatData.reply), `an anonymous visitor asking for a balance should be told to sign in, not given a generic reply. Got: ${chatData.reply}`);
console.log('Public chat widget gives a real answer for account-specific questions instead of a generic fallback');

r = await fetch(base+'/admin/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({email:'admin@novacapital.test',password:'Admin#2026!'}),redirect:'manual'});
assert.equal(r.status,302);
const cookie = r.headers.get('set-cookie');
const access = r.headers.get('location').split('admin_access=')[1];
r = await fetch(base+`/admin/balances?admin_access=${access}`, { headers:{cookie} });
html = await r.text();
const csrf = html.match(/name="_csrf" value="([^"]+)/)[1];
const accountId = html.match(/action="\/admin\/balances\/([^"]+)\/adjust\/preview"/)?.[1];
assert.ok(accountId);
r = await fetch(base+`/admin/balances/${accountId}/adjust/preview`, { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_admin_access:access,action:'ADMIN CREDIT',amount:'12',currency:'USD',reason:'Account Deposit',reference:'TYPE-CHECK'}), redirect:'manual' });
assert.equal(r.status,200);
html = await r.text();
const previewCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
const idk = html.match(/name="idempotency_key" value="([^"]+)/)[1];
r = await fetch(base+`/admin/balances/${accountId}/adjust`, { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:previewCsrf,_admin_access:access,action:'ADMIN CREDIT',amount:'12',currency:'USD',reason:'Account Deposit',reference:'TYPE-CHECK',idempotency_key:idk,confirm:'YES'}), redirect:'manual' });
assert.equal(r.status,302);
r = await fetch(base+`/admin/transactions?admin_access=${access}&q=TYPE-CHECK`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('Deposit'));
assert.ok(!html.includes('ADMIN BALANCE ADJUSTMENT'));

console.log('Feature upgrade tests passed');
