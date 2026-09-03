import assert from 'node:assert/strict';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);

let r = await fetch(base+'/robots.txt');
assert.equal(r.status, 200);
assert.ok((r.headers.get('content-type')||'').includes('text/plain'));
let t = await r.text();
assert.ok(t.includes('Disallow: /admin'));
assert.ok(t.includes('Disallow: /dashboard'));
assert.ok(t.includes('Sitemap:'));

r = await fetch(base+'/sitemap.xml');
assert.equal(r.status, 200);
assert.ok((r.headers.get('content-type')||'').includes('xml'));
t = await r.text();
assert.ok(t.includes('<urlset'));
assert.ok(t.includes('<loc>https://vesperabank.com/</loc>'));
assert.ok(t.includes('/personal'));

r = await fetch(base+'/llms.txt');
assert.equal(r.status, 200);
t = await r.text();
assert.ok(t.includes('Vespera Bank'));
assert.ok(t.includes('simulated'));

r = await fetch(base+'/this-page-does-not-exist-'+Date.now(), { redirect:'manual' });
assert.equal(r.status, 404);
t = await r.text();
assert.ok(t.includes("can't find that page") || t.includes('Page not found'));
assert.ok(!t.includes('Cannot GET'));

r = await fetch(base+'/help');
t = await r.text();
assert.ok(t.includes('faq-section') || t.includes('Frequently asked questions'));
assert.ok(t.includes('<details'));

r = await fetch(base+'/about');
t = await r.text();
assert.ok(t.includes('team-section') || t.includes('Leadership'));

r = await fetch(base+'/');
t = await r.text();
assert.ok(t.includes('case-studies-section') || t.includes('Customer stories'));

r = await fetch(base+'/contact');
t = await r.text();
assert.ok(t.includes('locations-section') || t.includes('Get directions'));
assert.ok(t.includes('class="contact-form"'));

for (const p of ['/login', '/register']) {
  r = await fetch(base+p);
  t = await r.text();
  assert.ok(t.includes('noindex'), `${p} should be noindex`);
}

const uniqueEmail = `seotest${Date.now()}@example.com`;
r = await fetch(base+'/contact', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body: form({ name:'SEO Test', email: uniqueEmail, message:'Automated test message from seo-marketing-test.js' }), redirect:'manual' });
assert.equal(r.status, 302);
assert.equal(r.headers.get('location'), '/thank-you');

r = await fetch(base+'/thank-you');
assert.equal(r.status, 200);
t = await r.text();
assert.ok(t.includes('Thanks for reaching out') || t.includes('Message sent'));
assert.ok(t.includes('noindex'));

console.log('SEO/marketing tests passed');
