import assert from 'node:assert/strict';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);

let r = await fetch(base+'/admin/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({email:'admin@novacapital.test',password:'Admin#2026!'}),redirect:'manual'});
const cookie = r.headers.get('set-cookie');
const access = r.headers.get('location').split('admin_access=')[1];

const email = `moneytest${Date.now()}@example.com`;
await fetch(base + '/register', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({firstName:'Money',lastName:'Test',email,phone:'+15550006666',accountType:'Checking',password:'Password#2026',confirmPassword:'Password#2026'}), redirect:'manual' });

r = await fetch(base+`/admin/balances?admin_access=${access}&q=${encodeURIComponent(email)}`, { headers:{cookie} });
let html = await r.text();
const accountId = html.match(/action="\/admin\/balances\/([^"]+)\/adjust\/preview"/)?.[1];
assert.ok(accountId);

async function adjust(action, amount, reason) {
  let csrf = (await (await fetch(base+`/admin/balances?admin_access=${access}&q=${encodeURIComponent(email)}`, { headers:{cookie} })).text()).match(/name="_csrf" value="([^"]+)/)[1];
  let res = await fetch(base+`/admin/balances/${accountId}/adjust/preview`, { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:csrf,_admin_access:access,action,amount:String(amount),reason,confirm:'YES'}), redirect:'manual' });
  const previewHtml = await res.text();
  const previewCsrf = previewHtml.match(/name="_csrf" value="([^"]+)/)[1];
  const idk = previewHtml.match(/name="idempotency_key" value="([^"]+)/)[1];
  res = await fetch(base+`/admin/balances/${accountId}/adjust`, { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:previewCsrf,_admin_access:access,action,amount:String(amount),reason,idempotency_key:idk,confirm:'YES'}), redirect:'manual' });
  assert.equal(res.status, 302, `adjust ${action} ${amount} should redirect`);
}

// Classic float-precision regression: 0.10 + 0.20 must equal exactly 0.30
await adjust('ADMIN CREDIT', '0.10', 'precision test 1');
await adjust('ADMIN CREDIT', '0.20', 'precision test 2');
r = await fetch(base+`/admin/balances?admin_access=${access}&q=${encodeURIComponent(email)}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('$0.30'), 'expected exact $0.30 after 0.10 + 0.20');

// Large boundary amount stays exact
await adjust('ADMIN CREDIT', '999.99', 'boundary test');
r = await fetch(base+`/admin/balances?admin_access=${access}&q=${encodeURIComponent(email)}`, { headers:{cookie} });
html = await r.text();
assert.ok(html.includes('$1,000.29'), 'expected exact $1,000.29 after adding 999.99 to 0.30');

// Sub-cent amount rejected by Zod validation
const finalCsrf = (await (await fetch(base+`/admin/balances?admin_access=${access}&q=${encodeURIComponent(email)}`, { headers:{cookie} })).text()).match(/name="_csrf" value="([^"]+)/)[1];
r = await fetch(base+`/admin/balances/${accountId}/adjust/preview`, { method:'POST', headers:{cookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:finalCsrf,_admin_access:access,action:'ADMIN CREDIT',amount:'10.999',reason:'subcent'}), redirect:'manual' });
assert.equal(r.status, 400, 'sub-cent amount should be rejected');

console.log('Admin money math tests passed');
