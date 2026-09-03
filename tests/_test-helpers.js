import 'dotenv/config';
const form = o => new URLSearchParams(o);

async function adminLogin(base) {
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('adminLogin: set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD in your .env before running tests that need admin approval (e.g. registerAndActivate)');
  const r = await fetch(base + '/admin/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ email, password }), redirect: 'manual' });
  const cookieMatch = (r.headers.get('set-cookie') || '').match(/admin_sid=([^;]+)/);
  const access = (r.headers.get('location') || '').split('admin_access=')[1];
  if (!cookieMatch || !access) throw new Error('adminLogin failed: ' + r.status);
  return { cookie: cookieMatch[1], access };
}

async function approveKycForUser(base, admin, userId) {
  let r = await fetch(base + `/admin/kyc/${userId}?admin_access=${admin.access}`, { headers: { cookie: `admin_sid=${admin.cookie}` } });
  const html = await r.text();
  const csrfMatch = html.match(/name="_csrf" value="([^"]+)/);
  if (!csrfMatch) throw new Error('approveKycForUser: could not find csrf on review page');
  r = await fetch(base + `/admin/kyc/${userId}/action?admin_access=${admin.access}`, { method: 'POST', headers: { cookie: `admin_sid=${admin.cookie}`, 'content-type': 'application/x-www-form-urlencoded' }, body: form({ _csrf: csrfMatch[1], admin_access: admin.access, action: 'approve', confirm: 'YES' }), redirect: 'manual' });
  if (r.status !== 302) throw new Error('approveKycForUser: approve action failed ' + r.status);
}

/**
 * Registers a customer and completes the required 6-digit email code step
 * only. Returns { cookie, access } for a real session whose kyc_status is
 * still 'not_submitted' -- use this when a test wants to drive its own KYC
 * submission/approval, or only needs the allowlisted pre-approval routes
 * (dashboard root, accounts, transactions, notifications, refer, kyc,
 * profile, security, settings).
 */
async function registerAndVerify(base, { name, email, phone, password, ref, accountType = 'Checking' }) {
  const spaceIdx = name.indexOf(' ');
  const firstName = spaceIdx === -1 ? name : name.slice(0, spaceIdx);
  const lastName = spaceIdx === -1 ? 'Test' : name.slice(spaceIdx + 1);

  let r = await fetch(base + '/register', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ firstName, lastName, email, phone, accountType, password, confirmPassword: password, ...(ref ? { ref } : {}) }), redirect: 'manual' });
  if (r.status !== 302 || !/\/register\/verify/.test(r.headers.get('location') || '')) throw new Error('registerAndVerify: register step failed ' + r.status + ' ' + r.headers.get('location'));
  const rvMatch = (r.headers.get('set-cookie') || '').match(/register_verify=([^;]+)/);
  if (!rvMatch) throw new Error('registerAndVerify: missing register_verify cookie');
  const rvCookie = rvMatch[1];

  r = await fetch(base + '/register/verify', { headers: { cookie: `register_verify=${rvCookie}` } });
  const verifyHtml = await r.text();
  const codeMatch = verifyHtml.match(/your code is: <b>(\d{6})<\/b>/);
  if (!codeMatch) throw new Error('registerAndVerify: could not find dev verification code on page: ' + verifyHtml.slice(0, 400));
  const code = codeMatch[1];

  r = await fetch(base + '/register/verify', { method: 'POST', headers: { cookie: `register_verify=${rvCookie}`, 'content-type': 'application/x-www-form-urlencoded' }, body: form({ code }), redirect: 'manual' });
  const sidMatch = (r.headers.get('set-cookie') || '').match(/sid=([^;]+)/);
  if (!sidMatch) throw new Error('registerAndVerify: code verification did not produce a session, status ' + r.status);
  const cookie = `sid=${sidMatch[1]}`;
  const access = (r.headers.get('location') || '').split('access=')[1];
  if (!access) throw new Error('registerAndVerify: missing access token after verification');
  return { cookie, access };
}

/**
 * Registers a customer through the full email-code + KYC-approval gate and
 * returns { cookie, access } for an immediately-usable, fully-activated session
 * -- matching the pre-gate behavior existing tests were written against.
 */
async function registerAndActivate(base, { name, email, phone, password, ref, accountType = 'Checking' }) {
  const { cookie, access } = await registerAndVerify(base, { name, email, phone, password, ref, accountType });

  const kycPage = await fetch(base + `/dashboard/kyc?access=${access}`, { headers: { cookie } });
  const kycHtml = await kycPage.text();
  const kycCsrfMatch = kycHtml.match(/name="_csrf" value="([^"]+)/);
  if (!kycCsrfMatch) throw new Error('registerAndActivate: could not find csrf on kyc page');

  const fd = new FormData();
  fd.append('_csrf', kycCsrfMatch[1]);
  fd.append('access', access);
  fd.append('fullLegalName', name);
  fd.append('dateOfBirth', '1990-01-01');
  fd.append('idType', 'Passport');
  fd.append('idNumber', 'TEST-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));
  fd.append('address', '1 Test Street');
  fd.append('termsAccepted', 'yes');
  const tinyPng = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), c => c.charCodeAt(0));
  fd.append('idFrontImage', new Blob([tinyPng], { type: 'image/png' }), 'front.png');
  fd.append('selfieImage', new Blob([tinyPng], { type: 'image/png' }), 'selfie.png');
  const kycSubmitRes = await fetch(base + `/dashboard/kyc?access=${access}`, { method: 'POST', headers: { cookie }, body: fd, redirect: 'manual' });
  if (kycSubmitRes.status !== 302) throw new Error('registerAndActivate: kyc submission failed ' + kycSubmitRes.status);

  const admin = await adminLogin(base);
  const adminListRes = await fetch(base + `/admin/kyc?admin_access=${admin.access}&status=pending`, { headers: { cookie: `admin_sid=${admin.cookie}` } });
  const adminListHtml = await adminListRes.text();
  const emailIdx = adminListHtml.indexOf(email);
  if (emailIdx === -1) throw new Error('registerAndActivate: could not find this user in the pending KYC queue');
  const linkMatch = adminListHtml.slice(emailIdx).match(/\/admin\/kyc\/([0-9a-f-]{36})/);
  if (!linkMatch) throw new Error('registerAndActivate: could not find kyc review link for this user');
  await approveKycForUser(base, admin, linkMatch[1]);

  return { cookie, access, userId: linkMatch[1] };
}

export { registerAndActivate, registerAndVerify, adminLogin, approveKycForUser };
