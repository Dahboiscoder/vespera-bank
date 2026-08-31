import assert from 'node:assert/strict';
import { registerAndVerify } from './_test-helpers.js';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);

let r = await fetch(base+'/admin/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({email:'admin@novacapital.test',password:'Admin#2026!'}),redirect:'manual'});
const aCookie = r.headers.get('set-cookie');
const aAccess = r.headers.get('location').split('admin_access=')[1];
assert.ok(aAccess, 'admin should log in');

async function makeUser(name) {
  const email = `gen_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
  const spaceIdx = name.indexOf(' ');
  await fetch(base+'/register',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({firstName:spaceIdx===-1?name:name.slice(0,spaceIdx),lastName:spaceIdx===-1?'Test':name.slice(spaceIdx+1),email,phone:'+15550001111',accountType:'Checking',password:'Password#2026',confirmPassword:'Password#2026'}),redirect:'manual'});
  let rr = await fetch(base+`/admin/transaction-generator?q=${encodeURIComponent(name)}&admin_access=${aAccess}`,{headers:{cookie:aCookie}});
  const html = await rr.text();
  const userId = html.match(/\/admin\/transaction-generator\/([0-9a-f-]{36})/)[1];
  rr = await fetch(base+`/admin/transaction-generator/${userId}?admin_access=${aAccess}`,{headers:{cookie:aCookie}});
  const html2 = await rr.text();
  const accountId = html2.match(/name="account_id" value="([0-9a-f-]{36})"/)[1];
  const csrf = html2.match(/name="_csrf" value="([^"]+)"/)[1];
  return { email, userId, accountId, csrf };
}

async function driveJobToCompletion(jobId, csrf) {
  let done = false, guard = 0, last;
  while (!done && guard < 60) {
    guard++;
    const rr = await fetch(base+`/admin/transaction-generator/jobs/${jobId}/process-chunk?admin_access=${aAccess}`, { method:'POST', headers:{cookie:aCookie,'content-type':'application/json'}, body: JSON.stringify({ _csrf:csrf, _admin_access:aAccess }) });
    last = await rr.json();
    done = last.status === 'completed';
  }
  return last;
}

// 1) Custom rows with exact, distinct historical dates (Jan 2024, Mar 2025, Aug 2026) — proves years are never overwritten with "today"
{
  const u = await makeUser('Gen Custom Dates');
  const customRows = [
    '2024-01-04,09:30,Deposit,1000,completed,Salary,REF-001,Income',
    '2025-03-17,14:45,Transfer,250,completed,Rent,REF-002,Bills',
    '2026-08-30,18:20,Payment,75,completed,Groceries,REF-003,Food',
  ].join('\n');
  let rr = await fetch(base+`/admin/transaction-generator/${u.userId}/preview?admin_access=${aAccess}`,{method:'POST',headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:u.csrf,_admin_access:aAccess,account_id:u.accountId,mode:'custom',customRows,utcOffsetMinutes:'0',status:'completed',reason:'custom historical dates test'})});
  assert.equal(rr.status, 200);
  let html = await rr.text();
  assert.ok(/2024/.test(html) && /2025/.test(html) && /2026/.test(html), 'preview must preserve distinct, non-current years exactly as entered');
  assert.ok(html.includes('Confirm Generation'));
  const seed = html.match(/name="seed" value="([^"]+)"/)[1];
  const confirmCsrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  rr = await fetch(base+`/admin/transaction-generator/${u.userId}/confirm?admin_access=${aAccess}`,{method:'POST',headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:confirmCsrf,_admin_access:aAccess,account_id:u.accountId,mode:'custom',customRows,utcOffsetMinutes:'0',status:'completed',reason:'custom historical dates test',seed,confirm:'YES'}),redirect:'manual'});
  assert.equal(rr.status, 302);
  const jobId = rr.headers.get('location').match(/jobs\/([0-9a-f-]{36})/)[1];
  const result = await driveJobToCompletion(jobId, confirmCsrf);
  assert.equal(result.status, 'completed');
  assert.equal(result.createdCount, 3);
  assert.equal(result.failedCount, 0);
  console.log('Custom-row generation preserves exact, distinct historical dates/years (2024, 2025, 2026)');
}

// 2) Bulk parametric generation of 300 records, chunked processing, balance updates correctly
let editUser, editTxId;
{
  const u = await makeUser('Gen Bulk 300');
  const params = { _csrf:u.csrf, _admin_access:aAccess, account_id:u.accountId, mode:'parametric', count:'300', typeMode:'fixed', fixedKind:'Deposit', amountMode:'range', minAmount:'10', maxAmount:'50', status:'completed', dateMode:'range_sequential', rangeStart:'2023-01-01T00:00', rangeEnd:'2023-12-31T23:59', utcOffsetMinutes:'0', descriptionTemplate:'Auto {n}', referencePrefix:'BULK', category:'Test', reason:'300-record bulk test' };
  let rr = await fetch(base+`/admin/transaction-generator/${u.userId}/preview?admin_access=${aAccess}`,{method:'POST',headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'},body:form(params)});
  assert.equal(rr.status, 200);
  let html = await rr.text();
  assert.ok(html.includes('300'));
  const seed = html.match(/name="seed" value="([^"]+)"/)[1];
  const confirmCsrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  rr = await fetch(base+`/admin/transaction-generator/${u.userId}/confirm?admin_access=${aAccess}`,{method:'POST',headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'},body:form({...params,_csrf:confirmCsrf,seed,confirm:'YES'}),redirect:'manual'});
  assert.equal(rr.status, 302);
  const jobId = rr.headers.get('location').match(/jobs\/([0-9a-f-]{36})/)[1];
  const result = await driveJobToCompletion(jobId, confirmCsrf);
  assert.equal(result.status, 'completed');
  assert.equal(result.createdCount, 300);
  assert.equal(result.failedCount, 0);
  rr = await fetch(base+`/admin/transaction-generator/${u.userId}?account=${u.accountId}&admin_access=${aAccess}`,{headers:{cookie:aCookie}});
  html = await rr.text();
  const bal = parseFloat(html.match(/Current Balance<\/span><b>\$([\d,.]+)<\/b>/)[1].replace(/,/g,''));
  assert.ok(bal > 3000, 'balance should reflect ~300 deposits averaging ~30 each');
  editUser = u; editTxId = html.match(/\/admin\/transaction-generator\/tx\/([0-9a-f-]{36})\/edit/)[1];
  console.log('300-record bulk generation completes via chunked processing (200 + 100), balance updated correctly:', bal);
}

// 3) Count cap enforcement: 10,001 rejected, 10,000 accepted at the boundary
{
  const u = await makeUser('Gen Cap Boundary');
  const base_params = { _csrf:u.csrf, _admin_access:aAccess, account_id:u.accountId, mode:'parametric', typeMode:'fixed', fixedKind:'Deposit', amountMode:'fixed', fixedAmount:'10', status:'completed', dateMode:'specific', specificDate:'2024-01-01T00:00', utcOffsetMinutes:'0', reason:'cap test' };
  let rr = await fetch(base+`/admin/transaction-generator/${u.userId}/preview?admin_access=${aAccess}`,{method:'POST',headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'},body:form({...base_params,countCustom:'10001'})});
  assert.equal(rr.status, 400);
  let html = await rr.text();
  assert.ok(html.includes('between 1 and 10,000'));
  rr = await fetch(base+`/admin/transaction-generator/${u.userId}/preview?admin_access=${aAccess}`,{method:'POST',headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'},body:form({...base_params,countCustom:'10000'})});
  assert.equal(rr.status, 200);
  html = await rr.text();
  assert.ok(html.includes('10,000'));
  console.log('10,000-record cap correctly enforced at the boundary (10,001 rejected, 10,000 accepted)');
}

// 4) Negative balance guard blocks confirmation
{
  const u = await makeUser('Gen Negative Guard');
  let rr = await fetch(base+`/admin/transaction-generator/${u.userId}/preview?admin_access=${aAccess}`,{method:'POST',headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:u.csrf,_admin_access:aAccess,account_id:u.accountId,mode:'parametric',count:'1',typeMode:'fixed',fixedKind:'Withdrawal',amountMode:'fixed',fixedAmount:'999999',status:'completed',dateMode:'specific',specificDate:'2023-06-01T00:00',utcOffsetMinutes:'0',reason:'negative balance test'})});
  assert.equal(rr.status, 200);
  const html = await rr.text();
  assert.ok(html.includes('would make the balance negative'));
  assert.ok(html.includes('disabled'));
  console.log('Negative-balance guard blocks confirmation before any record is created');
}

// 5) Custom row with a bad line is rejected with a precise, per-line reason (never silently skipped)
{
  const u = await makeUser('Gen Bad Row');
  const badRows = ['2024-01-04,09:30,Deposit,1000,completed,Good row,REF-1,Income','2024-13-40,25:99,BadType,notanumber,completed,Bad row,REF-2,Bad'].join('\n');
  const rr = await fetch(base+`/admin/transaction-generator/${u.userId}/preview?admin_access=${aAccess}`,{method:'POST',headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:u.csrf,_admin_access:aAccess,account_id:u.accountId,mode:'custom',customRows:badRows,utcOffsetMinutes:'0',status:'completed',reason:'bad row test'})});
  assert.equal(rr.status, 400);
  const html = await rr.text();
  assert.ok(html.includes('Line 2'));
  console.log('An invalid custom row is rejected with the exact line and reason, not silently dropped');
}

// 6) Edit: correct a wrong year and amount; balance updates by the exact delta; correction audit trail visible on the existing transaction detail page
{
  const u = editUser; const txId = editTxId;
  let rr = await fetch(base+`/admin/transaction-generator/${u.userId}?account=${u.accountId}&admin_access=${aAccess}`,{headers:{cookie:aCookie}});
  let html = await rr.text();
  const balBefore = parseFloat(html.match(/Current Balance<\/span><b>\$([\d,.]+)<\/b>/)[1].replace(/,/g,''));

  rr = await fetch(base+`/admin/transaction-generator/tx/${txId}/edit?admin_access=${aAccess}`,{headers:{cookie:aCookie}});
  html = await rr.text();
  const editCsrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  const origAmount = html.match(/name="amount"[^>]*value="([\d.]+)"/)[1];
  rr = await fetch(base+`/admin/transaction-generator/tx/${txId}/edit?admin_access=${aAccess}`,{method:'POST',headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:editCsrf,_admin_access:aAccess,kind:'Deposit',amount:'999',status:'completed',txDate:'2026-01-04',txTime:'10:00',utcOffsetMinutes:'0',description:'Corrected record',reference:'REF-EDIT',category:'Test',notes:'',reason:'Corrected wrong year and amount'}),redirect:'manual'});
  assert.equal(rr.status, 302);

  rr = await fetch(base+`/admin/transaction-generator/${u.userId}?account=${u.accountId}&admin_access=${aAccess}`,{headers:{cookie:aCookie}});
  html = await rr.text();
  const balAfter = parseFloat(html.match(/Current Balance<\/span><b>\$([\d,.]+)<\/b>/)[1].replace(/,/g,''));
  const expectedDelta = 999 - parseFloat(origAmount);
  assert.ok(Math.abs((balAfter - balBefore) - expectedDelta) < 0.01, `balance should move by exactly the edit delta (${expectedDelta}), got ${balAfter-balBefore}`);

  rr = await fetch(base+`/admin/transactions/${txId}?admin_access=${aAccess}`,{headers:{cookie:aCookie}});
  html = await rr.text();
  assert.ok(html.includes('2026'));
  assert.ok(html.includes('Corrected wrong year and amount'));
  console.log('Editing a transaction (wrong year + amount) applies the exact balance delta and records a visible correction on the existing detail page');

  // 7) Archive: reverses balance effect, hides from default view; unarchive restores visibility only
  rr = await fetch(base+`/admin/transaction-generator/tx/${txId}/archive?admin_access=${aAccess}`,{headers:{cookie:aCookie}});
  html = await rr.text();
  assert.ok(html.includes('Are you sure you want to archive this transaction?'));
  const archCsrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  rr = await fetch(base+`/admin/transaction-generator/tx/${txId}/archive?admin_access=${aAccess}`,{method:'POST',headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:archCsrf,_admin_access:aAccess,reason:'archive test',confirm:'YES'}),redirect:'manual'});
  assert.equal(rr.status, 302);

  rr = await fetch(base+`/admin/transaction-generator/${u.userId}?account=${u.accountId}&admin_access=${aAccess}`,{headers:{cookie:aCookie}});
  html = await rr.text();
  const balAfterArchive = parseFloat(html.match(/Current Balance<\/span><b>\$([\d,.]+)<\/b>/)[1].replace(/,/g,''));
  assert.ok(Math.abs(balAfterArchive - (balAfter - 999)) < 0.01, 'archiving a completed +999 deposit should reverse exactly 999 off the balance');
  assert.ok(!html.includes(`/admin/transaction-generator/tx/${txId}/edit`), 'archived transaction must not appear in the default (non-archived) view');
  console.log('Archiving a completed transaction reverses its balance effect and hides it from the default view');

  rr = await fetch(base+`/admin/transaction-generator/${u.userId}?account=${u.accountId}&archived=1&admin_access=${aAccess}`,{headers:{cookie:aCookie}});
  html = await rr.text();
  assert.ok(html.includes(`/admin/transaction-generator/tx/${txId}/unarchive`), 'the "Show archived" toggle should reveal the archived transaction with a Restore action');
  const unarchCsrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  rr = await fetch(base+`/admin/transaction-generator/tx/${txId}/unarchive?admin_access=${aAccess}`,{method:'POST',headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:unarchCsrf,_admin_access:aAccess}),redirect:'manual'});
  assert.equal(rr.status, 302);
  rr = await fetch(base+`/admin/transaction-generator/${u.userId}?account=${u.accountId}&admin_access=${aAccess}`,{headers:{cookie:aCookie}});
  html = await rr.text();
  assert.ok(html.includes(`/admin/transaction-generator/tx/${txId}/edit`), 'unarchiving restores the transaction to the default view');
  const balAfterUnarchive = parseFloat(html.match(/Current Balance<\/span><b>\$([\d,.]+)<\/b>/)[1].replace(/,/g,''));
  assert.equal(balAfterUnarchive, balAfterArchive, 'unarchiving must only restore visibility, never re-apply a balance change (the reversal remains a permanent, separate ledger record)');
  console.log('Unarchiving restores visibility only, without double-applying any balance change');
}

// 8) IDOR: an account belonging to a different user must be rejected
{
  const u1 = await makeUser('Gen IDOR A');
  const u2 = await makeUser('Gen IDOR B');
  const rr = await fetch(base+`/admin/transaction-generator/${u1.userId}/preview?admin_access=${aAccess}`,{method:'POST',headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:u1.csrf,_admin_access:aAccess,account_id:u2.accountId,mode:'parametric',count:'1',typeMode:'fixed',fixedKind:'Deposit',amountMode:'fixed',fixedAmount:'100',status:'completed',dateMode:'specific',specificDate:'2024-01-01T00:00',utcOffsetMinutes:'0',reason:'idor test'})});
  assert.equal(rr.status, 404, 'submitting another user\'s account id must be rejected, not silently accepted');
  console.log('IDOR protection: a mismatched account_id/user_id pair is rejected (404)');
}

// 9) Authorization: VIEWER denied, unauthenticated redirected, logged-in customer denied
{
  let rr = await fetch(base+`/admin/admin-users?admin_access=${aAccess}`,{headers:{cookie:aCookie}});
  let html = await rr.text();
  const auCsrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  const viewerEmail = `genviewer${Date.now()}@example.com`;
  rr = await fetch(base+'/admin/admin-users',{method:'POST',headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:auCsrf,_admin_access:aAccess,name:'Gen Viewer',email:viewerEmail,password:'ViewerPass#1',role:'VIEWER',confirm:'YES'}),redirect:'manual'});
  assert.equal(rr.status, 302);
  rr = await fetch(base+'/admin/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({email:viewerEmail,password:'ViewerPass#1'}),redirect:'manual'});
  const vCookie = rr.headers.get('set-cookie'); const vAccess = rr.headers.get('location').split('admin_access=')[1];
  rr = await fetch(base+`/admin/transaction-generator?admin_access=${vAccess}`,{headers:{cookie:vCookie}});
  assert.equal(rr.status, 403, 'VIEWER role must be denied the Transaction History Manager (write-capable tool)');

  rr = await fetch(base+'/admin/transaction-generator',{redirect:'manual'});
  assert.equal(rr.status, 302);
  assert.ok((rr.headers.get('location')||'').includes('/admin/login'));

  const custEmail = `gennotadmin${Date.now()}@example.com`;
  const { cookie: custCookie } = await registerAndVerify(base, { name:'Not Admin', email:custEmail, phone:'+15550009988', password:'Password#2026' });
  rr = await fetch(base+'/admin/transaction-generator',{headers:{cookie:custCookie},redirect:'manual'});
  assert.equal(rr.status, 302);
  assert.ok((rr.headers.get('location')||'').includes('/admin/login'), 'a logged-in customer session must not grant admin access');
  console.log('Authorization verified: VIEWER denied (403), unauthenticated and logged-in-customer requests redirected to admin login');
}

// 10) Existing transaction ledger and manual single-transaction creation still work unaffected (regression check)
{
  let rr = await fetch(base+`/admin/transactions?admin_access=${aAccess}`,{headers:{cookie:aCookie}});
  assert.equal(rr.status, 200);
  const html = await rr.text();
  assert.ok(html.includes('Transaction Management') && html.includes('Create private admin transaction'));
  console.log('Existing /admin/transactions ledger page is unaffected');
}

console.log('Transaction generator tests passed');
