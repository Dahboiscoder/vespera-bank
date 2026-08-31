import assert from 'node:assert/strict';
const base = process.env.TEST_BASE || 'http://127.0.0.1:3000';
const form = o => new URLSearchParams(o);

const email = `supportcust${Date.now()}@example.test`;
let r = await fetch(base + '/register', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({name:'Chat Requester',email,phone:'+15550008888',password:'Password#2026',confirmPassword:'Password#2026'}), redirect:'manual' });
const cookie = r.headers.get('set-cookie');
const access = r.headers.get('location').split('access=')[1];

r = await fetch(base + `/support/chat?access=${access}`, { headers:{cookie} });
let html = await r.text();
assert.equal(r.status, 200);
assert.ok(html.includes('AI Assistant') && html.includes('Talk to a Human') && html.includes('AI + Human'), 'all three support modes should be selectable');
assert.ok(html.includes('id="supportHandoffBtn"'), 'a Talk to a human button should be present');
assert.ok(html.includes('support-mode-btn active" data-mode="ai"'), 'AI Assistant should be the default mode');
console.log('Help & Support page renders with all three modes, defaulting to AI Assistant');

r = await fetch(base + '/support/chat', { method:'POST', headers:{cookie,'content-type':'application/json'}, body:JSON.stringify({ message:'What is my transfer status?' }) });
assert.equal(r.status, 200);
let data = await r.json();
assert.ok(data.reply && data.reply.length > 0, 'the assistant should reply even without a Claude API key configured (rule-based fallback)');
const conversationId = data.conversationId;
console.log('Customer message gets a real reply via the graceful rule-based fallback (no ANTHROPIC_API_KEY in this environment)');

r = await fetch(base + `/support/chat/poll?conversationId=${conversationId}&since=${encodeURIComponent(new Date(0).toISOString())}`, { headers:{cookie} });
data = await r.json();
assert.ok(data.messages.length >= 2, 'poll should return the user message and the reply');
console.log('Polling endpoint returns the conversation history');

// Cross-customer isolation: another customer cannot poll this conversation
const other = await (async () => {
  const otherEmail = `supportother${Date.now()}@example.test`;
  const rr = await fetch(base + '/register', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({name:'Other',email:otherEmail,phone:'+15550001112',password:'Password#2026',confirmPassword:'Password#2026'}), redirect:'manual' });
  return { cookie:rr.headers.get('set-cookie'), access:rr.headers.get('location').split('access=')[1] };
})();
r = await fetch(base + `/support/chat/poll?conversationId=${conversationId}&since=${encodeURIComponent(new Date(0).toISOString())}`, { headers:{cookie:other.cookie} });
assert.equal(r.status, 404, 'a different customer must not be able to poll someone else\'s conversation');
console.log('Conversation polling is isolated per customer');

// Talk to a human handoff
r = await fetch(base + '/support/handoff', { method:'POST', headers:{cookie} });
assert.equal(r.status, 200);
data = await r.json();
assert.equal(data.mode, 'ai_human');
r = await fetch(base + `/support/chat/poll?conversationId=${conversationId}&since=${encodeURIComponent(new Date(0).toISOString())}`, { headers:{cookie} });
data = await r.json();
assert.ok(data.messages.some(m => m.message.includes('support queue')), 'a system message should announce the queue');
assert.equal(data.mode, 'ai_human');
assert.equal(data.status, 'waiting');
console.log('Talk to a human switches to AI + Human mode and queues the conversation, preserving all history');

r = await fetch(base+'/admin/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({email:'admin@novacapital.test',password:'Admin#2026!'}),redirect:'manual'});
const aCookie = r.headers.get('set-cookie'); const aAccess = r.headers.get('location').split('admin_access=')[1];

r = await fetch(base + `/admin/live-support?admin_access=${aAccess}&status=waiting`, { headers:{cookie:aCookie} });
html = await r.text();
assert.ok(html.includes('Chat Requester'), 'the waiting conversation should appear in the admin Live Support queue');
const linkMatch = html.match(/href="([^"]*\/admin\/live-support\/[0-9a-f-]{36}[^"]*)"/);
assert.ok(linkMatch, 'the conversation row should link to its detail view');
console.log('Waiting conversation is visible in the admin Live Support queue');

r = await fetch(base + `/admin/live-support/${conversationId}?admin_access=${aAccess}`, { headers:{cookie:aCookie} });
html = await r.text();
assert.ok(html.includes('Chat Requester') && html.includes(email));
assert.ok(html.includes('What is my transfer status?'), 'the full prior conversation history must be visible to the agent');
assert.ok(html.includes('Join Conversation'));
const joinCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
console.log('Agent conversation view shows customer info and the full history without asking the customer to repeat anything');

r = await fetch(base + `/admin/live-support/${conversationId}/join`, { method:'POST', headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:joinCsrf,_admin_access:aAccess}), redirect:'manual' });
assert.equal(r.status, 302);
r = await fetch(base + `/support/chat/poll?conversationId=${conversationId}&since=${encodeURIComponent(new Date(0).toISOString())}`, { headers:{cookie} });
data = await r.json();
assert.ok(data.messages.some(m => m.message.includes('joined the conversation')), 'the customer should see the agent-joined system message in the same conversation');
console.log('Agent joins the conversation; the customer sees it in the same thread without starting a new one');

r = await fetch(base + `/admin/live-support/${conversationId}?admin_access=${aAccess}`, { headers:{cookie:aCookie} });
html = await r.text();
const replyCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
r = await fetch(base + `/admin/live-support/${conversationId}/message`, { method:'POST', headers:{cookie:aCookie,'content-type':'application/json'}, body:JSON.stringify({ message:"Hi, I've reviewed this and I'll help you.", _csrf:replyCsrf, _admin_access:aAccess }) });
assert.equal(r.status, 200);
r = await fetch(base + `/support/chat/poll?conversationId=${conversationId}&since=${encodeURIComponent(new Date(0).toISOString())}`, { headers:{cookie} });
data = await r.json();
assert.ok(data.messages.some(m => m.sender === 'agent' && m.message.includes("I'll help you")), 'the agent reply should be visible to the customer in the same conversation');
console.log('Human agent reply appears in the same AI + Human conversation');

// VIEWER role cannot join/reply/close
r = await fetch(base + `/admin/admin-users?admin_access=${aAccess}`, { headers:{cookie:aCookie} });
html = await r.text();
const auCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
const viewerEmail = `viewer${Date.now()}@example.test`;
r = await fetch(base + '/admin/admin-users', { method:'POST', headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:auCsrf,_admin_access:aAccess,name:'Viewer',email:viewerEmail,password:'ViewerPass#1',role:'VIEWER',confirm:'YES'}), redirect:'manual' });
assert.equal(r.status, 302);
r = await fetch(base + '/admin/login', { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:form({email:viewerEmail,password:'ViewerPass#1'}), redirect:'manual' });
const vCookie = r.headers.get('set-cookie'); const vAccess = r.headers.get('location').split('admin_access=')[1];
r = await fetch(base + `/admin/live-support/${conversationId}?admin_access=${vAccess}`, { headers:{cookie:vCookie} });
assert.equal(r.status, 200, 'a VIEWER admin should still be able to view the conversation (support.view)');
html = await r.text();
assert.ok(!html.includes('Join Conversation'), 'a VIEWER admin should not see manage controls');
r = await fetch(base + `/admin/live-support/${conversationId}/close`, { method:'POST', headers:{cookie:vCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_admin_access:vAccess}), redirect:'manual' });
assert.equal(r.status, 403, 'a VIEWER admin must be denied conversation management actions');
console.log('VIEWER role can view Live Support but is denied manage actions (join/reply/close)');

r = await fetch(base + `/admin/live-support/${conversationId}?admin_access=${aAccess}`, { headers:{cookie:aCookie} });
html = await r.text();
const closeCsrf = html.match(/name="_csrf" value="([^"]+)/)[1];
r = await fetch(base + `/admin/live-support/${conversationId}/close`, { method:'POST', headers:{cookie:aCookie,'content-type':'application/x-www-form-urlencoded'}, body:form({_csrf:closeCsrf,_admin_access:aAccess}), redirect:'manual' });
assert.equal(r.status, 302);
r = await fetch(base + `/admin/live-support?admin_access=${aAccess}&status=closed`, { headers:{cookie:aCookie} });
html = await r.text();
assert.ok(html.includes('Chat Requester'), 'the closed conversation should appear under the closed filter');
console.log('Closing a conversation works and it moves to the closed filter');

// A new message after closing starts a fresh conversation instead of reopening the closed one
r = await fetch(base + '/support/chat', { method:'POST', headers:{cookie,'content-type':'application/json'}, body:JSON.stringify({ message:'Hello again' }) });
data = await r.json();
assert.notEqual(data.conversationId, conversationId, 'a message after closing should start a new conversation, not reuse the closed one');
console.log('A new message after closing correctly starts a fresh conversation');

console.log('Live support tests passed');
