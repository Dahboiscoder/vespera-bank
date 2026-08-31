import assert from 'node:assert/strict';
import { registerAndActivate } from './_test-helpers.js';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);

let ar = await fetch(base+'/admin/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({email:'admin@novacapital.test',password:'Admin#2026!'}),redirect:'manual'});
const aCookie = ar.headers.get('set-cookie');
const aAccess = ar.headers.get('location').split('admin_access=')[1];
assert.ok(aAccess, 'admin should log in');

async function registerCustomer(name) {
  const email = `ibs_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`;
  const { cookie, access } = await registerAndActivate(base, { name, email, phone:'+15550001111', password:'Password#2026' });
  return { email, cookie, access };
}
async function setPin(u) {
  let r = await fetch(base+`/dashboard/security?access=${u.access}`,{headers:{cookie:u.cookie}});
  const html = await r.text();
  const csrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  await fetch(base+`/dashboard/security/pin?access=${u.access}`,{method:'POST',headers:{cookie:u.cookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:csrf,_access:u.access,password:'Password#2026',pin:'1234',confirmPin:'1234'}),redirect:'manual'});
}
async function fundEverydayAccount(u, amount) {
  // createTransferRecord always debits the account specifically named "Everyday Account" — never assume it's
  // whichever account a picker happens to default to. The standing-orders destination select shows account
  // type by name, so use it (as the customer) to resolve the real Everyday Account id first.
  let cr = await fetch(base+`/dashboard/standing-orders?access=${u.access}`,{headers:{cookie:u.cookie}});
  let chtml = await cr.text();
  const everydayMatch = chtml.match(/<option value="([0-9a-f-]{36})">Everyday Account/);
  const everydayAccountId = everydayMatch ? everydayMatch[1] : null;

  let ar2 = await fetch(base+`/admin/users?q=${encodeURIComponent(u.email)}&admin_access=${aAccess}`,{headers:{cookie:aCookie}});
  let ahtml = await ar2.text();
  const userId = ahtml.match(/\/admin\/users\/([0-9a-f-]{36})/)[1];
  assert.ok(everydayAccountId, 'should find the Everyday Account in the standing-orders destination picker');
  ar2 = await fetch(base+`/admin/transaction-generator/${userId}?account=${everydayAccountId}&admin_access=${aAccess}`,{headers:{cookie:aCookie}});
  ahtml = await ar2.text();
  const genCsrf = ahtml.match(/name="_csrf" value="([^"]+)"/)[1];
  const accountId = ahtml.match(/name="account_id" value="([0-9a-f-]{36})"/)[1];
  assert.equal(accountId, everydayAccountId, 'the funded account must be the Everyday Account, since that is the account createTransferRecord always debits');
  const rows = `2026-08-01,09:00,Deposit,${amount},completed,Initial funding,FUND-1,Income`;
  ar2 = await fetch(base+`/admin/transaction-generator/${userId}/preview?admin_access=${aAccess}`,{method:'POST',headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:genCsrf,_admin_access:aAccess,account_id:accountId,mode:'custom',customRows:rows,utcOffsetMinutes:'0',status:'completed',reason:'fund for test'})});
  ahtml = await ar2.text();
  const seed = ahtml.match(/name="seed" value="([^"]+)"/)[1];
  const confirmCsrf = ahtml.match(/name="_csrf" value="([^"]+)"/)[1];
  ar2 = await fetch(base+`/admin/transaction-generator/${userId}/confirm?admin_access=${aAccess}`,{method:'POST',headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:confirmCsrf,_admin_access:aAccess,account_id:accountId,mode:'custom',customRows:rows,utcOffsetMinutes:'0',status:'completed',reason:'fund for test',seed,confirm:'YES'}),redirect:'manual'});
  const jobId = ar2.headers.get('location').match(/jobs\/([0-9a-f-]{36})/)[1];
  await fetch(base+`/admin/transaction-generator/jobs/${jobId}/process-chunk?admin_access=${aAccess}`,{method:'POST',headers:{cookie:aCookie,'content-type':'application/json'},body:JSON.stringify({_csrf:confirmCsrf,_admin_access:aAccess})});
  return userId;
}

// 1) Insights renders real data, not the old hardcoded chart
{
  const u = await registerCustomer('Insights Customer');
  const r = await fetch(base+`/dashboard/insights?access=${u.access}`,{headers:{cookie:u.cookie}});
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.ok(html.includes('insight-stats-grid'), 'Insights should render the real stats grid');
  assert.ok(!(html.includes('height:35%') && html.includes('height:55%') && html.includes('height:42%')), 'the old hardcoded fake bar heights must be gone');
  assert.ok(html.includes('Income this month') && html.includes('Spent this month'));
  const dash = await (await fetch(base+`/dashboard?access=${u.access}`,{headers:{cookie:u.cookie}})).text();
  assert.ok(dash.includes('/dashboard/insights'), 'Insights must be reachable from the dashboard menu');
  console.log('Insights page renders real, data-driven content and is reachable from navigation');
}

// 2) Preferences: language reuses /set-language, currency/date-format/theme are real and persisted
{
  const u = await registerCustomer('Prefs Customer');
  let r = await fetch(base+`/dashboard/settings?access=${u.access}`,{headers:{cookie:u.cookie}});
  let html = await r.text();
  assert.ok(html.includes('action="/set-language"'), 'language select should post to the existing real /set-language endpoint');
  assert.ok(!html.includes('type="button">Save preferences'), 'the old dead Save-preferences button must be gone');
  const csrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  r = await fetch(base+`/dashboard/settings?access=${u.access}`,{method:'POST',headers:{cookie:u.cookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:csrf,_access:u.access,preferred_currency:'EUR',date_format:'YYYY_MM_DD',theme_preference:'dark'}),redirect:'manual'});
  assert.equal(r.status, 302);
  r = await fetch(base+`/dashboard?access=${u.access}`,{headers:{cookie:u.cookie}});
  html = await r.text();
  assert.ok(html.includes('data-theme="dark"'), 'saved dark theme preference should apply to the customer shell');
  r = await fetch(base+`/dashboard/settings?access=${u.access}`,{headers:{cookie:u.cookie}});
  html = await r.text();
  assert.ok(/<option selected>EUR<\/option>/.test(html), 'preferred currency should persist');
  console.log('Preferences (language/currency/date format/theme) are real and persisted');
}

// 3) Edit Profile actually saves
{
  const u = await registerCustomer('Profile Customer');
  let r = await fetch(base+`/dashboard/profile?access=${u.access}`,{headers:{cookie:u.cookie}});
  let html = await r.text();
  assert.ok(html.includes('action="/dashboard/profile/edit'), 'Edit Profile must be a real form, not a dead button');
  const csrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  r = await fetch(base+`/dashboard/profile/edit?access=${u.access}`,{method:'POST',headers:{cookie:u.cookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:csrf,_access:u.access,first_name:'Updated',last_name:'Name',phone:'+15559990000',country:'Kenya',city:'Nairobi'}),redirect:'manual'});
  assert.equal(r.status, 302);
  r = await fetch(base+`/dashboard/profile?access=${u.access}`,{headers:{cookie:u.cookie}});
  html = await r.text();
  assert.ok(html.includes('Updated Name') && html.includes('>Kenya<') && html.includes('>Nairobi<'), 'profile edits must actually persist');
  console.log('Edit Profile saves real changes (name, phone, country, city)');
}

// 4) Beneficiaries: create, quick-picker prefill on transfer form, edit, delete
{
  const u = await registerCustomer('Beneficiary Customer');
  let r = await fetch(base+`/dashboard/beneficiaries?access=${u.access}`,{headers:{cookie:u.cookie}});
  let html = await r.text();
  const csrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  r = await fetch(base+`/dashboard/beneficiaries?access=${u.access}`,{method:'POST',headers:{cookie:u.cookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:csrf,_access:u.access,label:'My Landlord',transfer_type:'Withdrawal',recipient_name:'Landlord LLC',account_iban:'US00LANDLORD0001',currency:'USD'}),redirect:'manual'});
  assert.equal(r.status, 302);
  r = await fetch(base+`/dashboard/beneficiaries?access=${u.access}`,{headers:{cookie:u.cookie}});
  html = await r.text();
  assert.ok(html.includes('My Landlord'));
  const beneficiaryId = html.match(/\/dashboard\/beneficiaries\/([0-9a-f-]{36})\/edit/)[1];

  r = await fetch(base+`/dashboard/transfers/withdraw?access=${u.access}`,{headers:{cookie:u.cookie}});
  html = await r.text();
  assert.ok(html.includes('Use a saved beneficiary') && html.includes('My Landlord'), 'the transfer form should show the saved beneficiary as a quick-pick option');
  r = await fetch(base+`/dashboard/transfers/withdraw?access=${u.access}&beneficiary=${beneficiaryId}`,{headers:{cookie:u.cookie}});
  html = await r.text();
  assert.ok(html.includes('value="Landlord LLC"') && html.includes('value="US00LANDLORD0001"'), 'selecting a beneficiary should prefill the transfer form');
  console.log('Beneficiaries: create + quick-picker prefill on the transfer form works');

  r = await fetch(base+`/dashboard/beneficiaries/${beneficiaryId}/edit?access=${u.access}`,{headers:{cookie:u.cookie}});
  html = await r.text();
  const editCsrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  r = await fetch(base+`/dashboard/beneficiaries/${beneficiaryId}/edit?access=${u.access}`,{method:'POST',headers:{cookie:u.cookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:editCsrf,_access:u.access,label:'My Landlord (Updated)',transfer_type:'Withdrawal',recipient_name:'Landlord LLC',account_iban:'US00LANDLORD0002',currency:'USD'}),redirect:'manual'});
  assert.equal(r.status, 302);
  r = await fetch(base+`/dashboard/beneficiaries?access=${u.access}`,{headers:{cookie:u.cookie}});
  html = await r.text();
  assert.ok(html.includes('My Landlord (Updated)') && html.includes('US00LANDLORD0002'));
  console.log('Beneficiaries: edit works');

  r = await fetch(base+`/dashboard/beneficiaries/${beneficiaryId}/delete?access=${u.access}`,{headers:{cookie:u.cookie}});
  html = await r.text();
  assert.ok(html.includes('Are you sure you want to delete'));
  const delCsrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  r = await fetch(base+`/dashboard/beneficiaries/${beneficiaryId}/delete?access=${u.access}`,{method:'POST',headers:{cookie:u.cookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:delCsrf,_access:u.access,confirm:'YES'}),redirect:'manual'});
  assert.equal(r.status, 302);
  r = await fetch(base+`/dashboard/beneficiaries?access=${u.access}`,{headers:{cookie:u.cookie}});
  html = await r.text();
  assert.ok(!html.includes('My Landlord'), 'deleted beneficiary must be gone');
  console.log('Beneficiaries: delete with confirmation works');
}

// 5) Save-as-beneficiary checkbox on a real transfer's confirm/submit flow
{
  const u = await registerCustomer('Save Beneficiary Customer');
  await setPin(u);
  await fundEverydayAccount(u, 1000);
  let r = await fetch(base+`/dashboard/transfers/internal?access=${u.access}`,{headers:{cookie:u.cookie}});
  let html = await r.text();
  const csrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  r = await fetch(base+`/dashboard/transfers/confirm?access=${u.access}`,{method:'POST',headers:{cookie:u.cookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:csrf,_access:u.access,transfer_type:'Internal',recipient_name:'Friend Account',account_iban:'US00FRIEND0001',amount:'50',currency:'USD',purpose:'Split rent'})});
  html = await r.text();
  assert.ok(html.includes('Save this recipient as a beneficiary'));
  const devCode = html.match(/your verification code is: <b>(\d{6})<\/b>/)[1];
  const idk = html.match(/name="idempotency_key" value="([^"]+)"/)[1];
  const submitCsrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  r = await fetch(base+`/dashboard/transfers/submit?access=${u.access}`,{method:'POST',headers:{cookie:u.cookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:submitCsrf,_access:u.access,transfer_type:'Internal',recipient_name:'Friend Account',account_iban:'US00FRIEND0001',amount:'50',currency:'USD',purpose:'Split rent',idempotency_key:idk,pin:'1234',code:devCode,save_beneficiary:'YES',confirm:'YES'}),redirect:'manual'});
  assert.equal(r.status, 302);
  r = await fetch(base+`/dashboard/beneficiaries?access=${u.access}`,{headers:{cookie:u.cookie}});
  html = await r.text();
  assert.ok(html.includes('Friend Account'), 'checking "save this recipient" during a real transfer should create a beneficiary automatically');
  console.log('Save-as-beneficiary checkbox on a real transfer creates a beneficiary automatically');
}

// 6) Standing Orders: full authorize -> activate -> auto-execute -> next_run_date advances lifecycle
{
  const u = await registerCustomer('Standing Order Customer');
  await setPin(u);
  await fundEverydayAccount(u, 1000);
  let r = await fetch(base+`/dashboard/standing-orders?access=${u.access}`,{headers:{cookie:u.cookie}});
  let html = await r.text();
  assert.ok(html.includes('<option>Internal</option>'), 'a two-account customer should be able to create an Internal standing order');
  const csrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  const section = html.match(/destination_account_id"[\s\S]*?<\/select>/)[0];
  const destAccountId = [...section.matchAll(/<option value="([0-9a-f-]{36})">([^<]+)</g)].find(m=>m[2].includes('Savings'))[1];
  const startDate = new Date().toISOString().slice(0,10);
  r = await fetch(base+`/dashboard/standing-orders/preview?access=${u.access}`,{method:'POST',headers:{cookie:u.cookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:csrf,_access:u.access,transfer_type:'Internal',destination_account_id:destAccountId,amount:'150',frequency:'monthly',start_date:startDate,reference:'SAVE',purpose:'Automatic savings'})});
  assert.equal(r.status, 200);
  html = await r.text();
  assert.ok(html.includes('150.00') && html.includes('monthly'));
  assert.ok(html.includes('reviewed the same way as any other transfer'), 'copy must be honest that standing orders still go through review, not an automatic bypass');
  const devCode = html.match(/your verification code is: <b>(\d{6})<\/b>/)[1];
  const idk = html.match(/name="idempotency_key" value="([^"]+)"/)[1];
  const actCsrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  r = await fetch(base+`/dashboard/standing-orders/activate?access=${u.access}`,{method:'POST',headers:{cookie:u.cookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:actCsrf,_access:u.access,transfer_type:'Internal',destination_account_id:destAccountId,amount:'150',frequency:'monthly',start_date:startDate,reference:'SAVE',purpose:'Automatic savings',idempotency_key:idk,pin:'1234',code:devCode,confirm:'YES'}),redirect:'manual'});
  assert.equal(r.status, 302);

  r = await fetch(base+`/dashboard/standing-orders?access=${u.access}`,{headers:{cookie:u.cookie}});
  html = await r.text();
  const beforeRow = html.match(/<tr><td>[\s\S]*?<\/tr>/)[0];
  assert.ok(beforeRow.includes('active') && beforeRow.includes('Internal'));
  const beforeNextRun = beforeRow.match(/<td>([^<]+, 2026[^<]*)<\/td><td><span class="status">active/)[1];

  r = await fetch(base+`/dashboard?access=${u.access}`,{headers:{cookie:u.cookie}});
  assert.equal(r.status, 200);

  r = await fetch(base+`/dashboard/standing-orders?access=${u.access}`,{headers:{cookie:u.cookie}});
  html = await r.text();
  const afterRow = html.match(/<tr><td>[\s\S]*?<\/tr>/)[0];
  assert.ok(afterRow.includes('active'), `a well-funded standing order should stay active after executing. Row: ${afterRow.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()}`);
  const afterNextRun = afterRow.match(/<td>([^<]+, 20\d\d[^<]*)<\/td><td><span class="status">active/)[1];
  assert.notEqual(beforeNextRun, afterNextRun, 'next_run_date must advance by one period after execution');

  r = await fetch(base+`/dashboard/transfers/history?access=${u.access}`,{headers:{cookie:u.cookie}});
  html = await r.text();
  assert.ok(html.includes('Internal') && html.includes('150.00'), 'a real transfer request must be auto-submitted, visible in transfer history');
  console.log('Standing order authorized with PIN+OTP, then auto-executes on next dashboard visit and advances its schedule');
}

// 7) Standing order with insufficient funds pauses itself with a clear reason, and can be resumed
{
  const u = await registerCustomer('Standing Order Poor');
  await setPin(u);
  let r = await fetch(base+`/dashboard/standing-orders?access=${u.access}`,{headers:{cookie:u.cookie}});
  let html = await r.text();
  const csrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  const section = html.match(/destination_account_id"[\s\S]*?<\/select>/)[0];
  const destAccountId = [...section.matchAll(/<option value="([0-9a-f-]{36})">([^<]+)</g)].find(m=>m[2].includes('Savings'))[1];
  const startDate = new Date().toISOString().slice(0,10);
  r = await fetch(base+`/dashboard/standing-orders/preview?access=${u.access}`,{method:'POST',headers:{cookie:u.cookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:csrf,_access:u.access,transfer_type:'Internal',destination_account_id:destAccountId,amount:'999999',frequency:'monthly',start_date:startDate,reference:'BIG',purpose:'Too much money'})});
  html = await r.text();
  const devCode = html.match(/your verification code is: <b>(\d{6})<\/b>/)[1];
  const idk = html.match(/name="idempotency_key" value="([^"]+)"/)[1];
  const actCsrf = html.match(/name="_csrf" value="([^"]+)"/)[1];
  r = await fetch(base+`/dashboard/standing-orders/activate?access=${u.access}`,{method:'POST',headers:{cookie:u.cookie,'content-type':'application/x-www-form-urlencoded'},body:form({_csrf:actCsrf,_access:u.access,transfer_type:'Internal',destination_account_id:destAccountId,amount:'999999',frequency:'monthly',start_date:startDate,reference:'BIG',purpose:'Too much money',idempotency_key:idk,pin:'1234',code:devCode,confirm:'YES'}),redirect:'manual'});
  assert.equal(r.status, 302);

  await fetch(base+`/dashboard?access=${u.access}`,{headers:{cookie:u.cookie}});
  r = await fetch(base+`/dashboard/standing-orders?access=${u.access}`,{headers:{cookie:u.cookie}});
  html = await r.text();
  assert.ok(html.includes('paused') && html.includes('Insufficient available balance'), 'a standing order that cannot be funded must pause itself with a clear, visible reason instead of failing silently or retrying forever');
  const resumeMatch = html.match(/action="([^"]*\/resume[^"]*)"/);
  assert.ok(resumeMatch, 'a paused standing order must offer a Resume action');
  console.log('An unfundable standing order pauses itself with a clear reason and offers Resume, never fails silently');
}

console.log('Insights, Preferences, Beneficiaries and Standing Orders tests passed');
