const body = document.body;

// Some browsers (notably Safari) restore an authenticated page from the
// back/forward cache after logout despite Cache-Control: no-store, showing a
// stale customer menu whose links no longer have a valid session. Force a
// fresh request from the server whenever a page is restored this way.
window.addEventListener('pageshow', e => { if (e.persisted) location.reload(); });

document.querySelectorAll('.menu:not(.customer-menu-button)').forEach(button => {
  button.addEventListener('click', () => {
    body.classList.toggle('open');
    button.setAttribute('aria-expanded', body.classList.contains('open') ? 'true' : 'false');
  });
});

document.querySelectorAll('.customer-menu-button').forEach(button => {
  const drawer = document.getElementById(button.getAttribute('aria-controls'));
  if (drawer) drawer.hidden = true;
  button.addEventListener('click', event => {
    event.stopPropagation();
    const isOpening = drawer ? drawer.hidden : !body.classList.contains('open');
    body.classList.toggle('open', isOpening);
    if (drawer) drawer.hidden = !isOpening;
    button.setAttribute('aria-expanded', isOpening ? 'true' : 'false');
  });
});

document.querySelectorAll('.customer-avatar').forEach(button => {
  const panel = button.parentElement?.querySelector('.customer-profile-panel');
  if (panel) panel.hidden = true;
  button.addEventListener('click', event => {
    event.stopPropagation();
    if (!panel) return;
    const isOpening = panel.hidden;
    document.querySelectorAll('.customer-profile-panel').forEach(p => { if (p !== panel) p.hidden = true; });
    panel.hidden = !isOpening;
    button.setAttribute('aria-expanded', isOpening ? 'true' : 'false');
  });
});

document.querySelectorAll('.nav-trigger').forEach(trigger => {
  trigger.addEventListener('click', () => {
    const group = trigger.closest('.nav-group');
    const isOpen = group.classList.toggle('active');
    trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    document.querySelectorAll('.nav-group').forEach(g => { if (g !== group) { g.classList.remove('active'); g.querySelector('.nav-trigger')?.setAttribute('aria-expanded','false'); } });
  });
});

document.addEventListener('click', e => {
  if (!e.target.closest('.nav-group') && !e.target.closest('.menu')) document.querySelectorAll('.nav-group').forEach(g => g.classList.remove('active'));
  if (!e.target.closest('.customer-mobile-drawer') && !e.target.closest('.customer-menu-button') && !e.target.closest('.customer-menu-details') && !e.target.closest('#bankMobileNav') && !e.target.closest('.bank-mobile-menu')) {
    document.querySelectorAll('.customer-mobile-drawer').forEach(drawer => { if (!drawer.closest('.customer-menu-details')) drawer.hidden = true; });
    document.querySelectorAll('.customer-menu-button').forEach(button => button.setAttribute('aria-expanded', 'false'));
    body.classList.remove('open');
  }
  if (!e.target.closest('.customer-profile')) {
    document.querySelectorAll('.customer-profile-panel').forEach(panel => { panel.hidden = true; });
    document.querySelectorAll('.customer-avatar').forEach(button => button.setAttribute('aria-expanded', 'false'));
  }
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.customer-mobile-drawer').forEach(drawer => { if (!drawer.closest('.customer-menu-details')) drawer.hidden = true; });
  document.querySelectorAll('.customer-profile-panel').forEach(panel => { panel.hidden = true; });
  document.querySelectorAll('.customer-menu-button,.customer-avatar').forEach(button => button.setAttribute('aria-expanded', 'false'));
  body.classList.remove('open');
});

document.querySelectorAll('.toggle-password').forEach(btn => btn.addEventListener('click', () => {
  const input = document.getElementById(btn.dataset.target);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}));

document.querySelectorAll('form:not(#chatForm)').forEach(f=>f.addEventListener('submit',()=>{const b=f.querySelector('button[type="submit"],button:not([type])'); if(b && !b.classList.contains('nav-trigger') && !b.classList.contains('menu')){b.dataset.old=b.textContent; b.textContent='Processing…'; b.disabled=true;}}));

fetch('/api/rates').then(r=>r.json()).then(d=>{const el=document.getElementById('homeRate'); const x=d.rates?.find(r=>r.base_currency==='USD'&&r.quote_currency==='RWF'); if(el&&x) el.textContent=`Buy ${Number(x.buy_rate).toLocaleString()} · Sell ${Number(x.sell_rate).toLocaleString()}`}).catch(()=>{});

const fab=document.getElementById('chatFab'), panel=document.getElementById('chatPanel'), close=document.getElementById('chatClose'), form=document.getElementById('chatForm'), input=document.getElementById('chatInput'), msgs=document.getElementById('chatMessages');
function addMsg(text,cls){ if(!msgs) return; const p=document.createElement('p'); p.className=cls; p.textContent=text; msgs.appendChild(p); msgs.scrollTop=msgs.scrollHeight; }
if(fab&&panel){ fab.addEventListener('click',()=>{panel.hidden=false; input?.focus();}); close?.addEventListener('click',()=>{panel.hidden=true;}); }
form?.addEventListener('submit', async e=>{ e.preventDefault(); const message=input.value.trim(); if(!message) return; addMsg(message,'me'); input.value=''; addMsg('Thinking…','bot loading'); const endpoint=location.pathname.startsWith('/dashboard')||location.pathname.startsWith('/support')?'/support/chat':'/api/chat'; try{ const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message})}); const data=await r.json(); msgs.querySelector('.loading')?.remove(); addMsg(data.reply || 'I can help with Vespera Bank services.','bot'); if(data.escalation){ const p=document.createElement('p'); p.className='bot'; p.innerHTML='<a class="btn small" href="/contact">Contact Support</a>'; msgs.appendChild(p); } } catch { msgs.querySelector('.loading')?.remove(); addMsg('The assistant is temporarily unavailable.','bot'); } });

const heroSlider = document.getElementById('heroSlider');
if (heroSlider) {
  const slides = [...heroSlider.querySelectorAll('.hero-slide')];
  const dots = [...heroSlider.querySelectorAll('.hero-dot')];
  let heroIndex = Math.max(0, slides.findIndex(s => s.classList.contains('active')));
  let heroTimer;
  const showHero = i => {
    heroIndex = (i + slides.length) % slides.length;
    slides.forEach((s, n) => s.classList.toggle('active', n === heroIndex));
    dots.forEach((d, n) => d.classList.toggle('active', n === heroIndex));
  };
  const stopHero = () => clearInterval(heroTimer);
  const startHero = () => { stopHero(); if (slides.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) heroTimer = setInterval(() => showHero(heroIndex + 1), 6000); };
  heroSlider.querySelector('.hero-arrow.next')?.addEventListener('click', () => { showHero(heroIndex + 1); startHero(); });
  heroSlider.querySelector('.hero-arrow.prev')?.addEventListener('click', () => { showHero(heroIndex - 1); startHero(); });
  dots.forEach((d, n) => d.addEventListener('click', () => { showHero(n); startHero(); }));
  heroSlider.addEventListener('mouseenter', stopHero);
  heroSlider.addEventListener('mouseleave', startHero);
  startHero();
}

document.getElementById('supportChatLink')?.addEventListener('click', e => { e.preventDefault(); document.getElementById('chatFab')?.click(); });

document.querySelectorAll('.google-oauth-link').forEach(link => {
  link.addEventListener('click', () => {
    link.textContent = 'Connecting to Google...';
    link.setAttribute('aria-busy', 'true');
  });
});

document.querySelectorAll('.lang-select').forEach(sel => sel.addEventListener('change', () => sel.form.submit()));

const printReceiptBtn = document.getElementById('printReceiptBtn');
printReceiptBtn?.addEventListener('click', () => {
  const printTitle = printReceiptBtn.getAttribute('data-print-title');
  if (!printTitle) return window.print();
  const originalTitle = document.title;
  document.title = printTitle;
  window.print();
  setTimeout(() => { document.title = originalTitle; }, 1000);
});
const shareReceiptBtn = document.getElementById('shareReceiptBtn');
if (shareReceiptBtn && navigator.share) {
  shareReceiptBtn.hidden = false;
  shareReceiptBtn.addEventListener('click', () => {
    navigator.share({ title: 'Vespera Bank Receipt', url: location.href }).catch(() => {});
  });
}

// ---- Support chat: customer full page (/support/chat) ----
(() => {
  const messagesEl = document.getElementById('supportMessages');
  const chatForm = document.getElementById('supportChatForm');
  if (!messagesEl || !chatForm) return;
  const conversationId = messagesEl.dataset.conversationId;
  const input = document.getElementById('supportChatInput');
  const typing = document.getElementById('supportTyping');
  const handoffBtn = document.getElementById('supportHandoffBtn');
  let since = new Date(0).toISOString();
  function scrollDown() { messagesEl.scrollTop = messagesEl.scrollHeight; }
  function appendMessages(list) {
    const empty = messagesEl.querySelector('.support-empty');
    if (empty && list.length) empty.remove();
    for (const m of list) { messagesEl.insertAdjacentHTML('beforeend', m.html); since = m.created_at; }
    if (list.length) scrollDown();
  }
  async function poll() {
    try {
      const r = await fetch(`/support/chat/poll?conversationId=${encodeURIComponent(conversationId)}&since=${encodeURIComponent(since)}`);
      if (!r.ok) return;
      const data = await r.json();
      appendMessages(data.messages || []);
    } catch { /* transient network error, retry next tick */ }
  }
  poll();
  const pollTimer = setInterval(poll, 4000);
  window.addEventListener('beforeunload', () => clearInterval(pollTimer));
  chatForm.addEventListener('submit', async e => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    input.value = ''; input.disabled = true;
    if (typing) typing.hidden = false;
    try {
      await fetch('/support/chat', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ message }) });
      await poll();
    } catch {
      messagesEl.insertAdjacentHTML('beforeend', '<div class="support-msg support-msg-system"><div class="support-msg-bubble">Message failed to send. Please check your connection and try again.</div></div>');
      scrollDown();
    } finally { input.disabled = false; input.focus(); if (typing) typing.hidden = true; }
  });
  document.querySelectorAll('.support-mode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.support-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      try { await fetch('/support/mode', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ mode: btn.dataset.mode }) }); await poll(); } catch { /* ignore */ }
    });
  });
  handoffBtn?.addEventListener('click', async () => {
    handoffBtn.disabled = true; handoffBtn.textContent = 'Requesting…';
    try { await fetch('/support/handoff', { method:'POST' }); await poll(); handoffBtn.textContent = 'Support requested'; }
    catch { handoffBtn.disabled = false; handoffBtn.textContent = 'Talk to a human'; }
  });
})();

// ---- Support chat: admin Live Support conversation view ----
(() => {
  const messagesEl = document.getElementById('supportMessages');
  const replyForm = document.getElementById('agentReplyForm');
  if (!messagesEl || !replyForm) return;
  const conversationId = messagesEl.dataset.conversationId;
  const input = document.getElementById('agentReplyInput');
  let since = new Date(0).toISOString();
  function scrollDown() { messagesEl.scrollTop = messagesEl.scrollHeight; }
  async function poll() {
    try {
      const r = await fetch(`/admin/live-support/${conversationId}/poll?since=${encodeURIComponent(since)}&admin_access=${encodeURIComponent(new URLSearchParams(location.search).get('admin_access')||'')}`);
      if (!r.ok) return;
      const data = await r.json();
      const empty = messagesEl.querySelector('.support-empty');
      if (empty && data.messages.length) empty.remove();
      for (const m of data.messages) { messagesEl.insertAdjacentHTML('beforeend', m.html); since = m.created_at; }
      if (data.messages.length) scrollDown();
    } catch { /* transient network error, retry next tick */ }
  }
  const pollTimer = setInterval(poll, 4000);
  window.addEventListener('beforeunload', () => clearInterval(pollTimer));
  replyForm.addEventListener('submit', async e => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;
    const csrf = replyForm.querySelector('input[name="_csrf"]')?.value;
    const adminAccess = replyForm.querySelector('input[name="_admin_access"]')?.value;
    input.value = ''; input.disabled = true;
    try {
      await fetch(`/admin/live-support/${conversationId}/message`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ message, _csrf:csrf, _admin_access:adminAccess }) });
      await poll();
    } finally { input.disabled = false; input.focus(); }
  });
  const assistResult = document.getElementById('aiAssistResult');
  document.querySelectorAll('[data-ai-assist]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.aiAssist;
      const csrf = replyForm.querySelector('input[name="_csrf"]')?.value;
      const adminAccess = replyForm.querySelector('input[name="_admin_access"]')?.value;
      btn.disabled = true;
      if (assistResult) { assistResult.hidden = false; assistResult.innerHTML = '<p class="notice">Thinking…</p>'; }
      try {
        const r = await fetch(`/admin/live-support/${conversationId}/ai-assist`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ action, _csrf:csrf, _admin_access:adminAccess }) });
        const data = await r.json();
        if (!r.ok) { assistResult.innerHTML = `<p class="error-text">${data.error || 'AI Assist failed.'}</p>`; return; }
        const useBtn = action === 'suggest_reply' ? '<button type="button" class="btn small" id="useAiSuggestion">Use this reply</button>' : '';
        assistResult.innerHTML = `<p class="ai-assist-label">AI Suggestion</p><p class="ai-assist-text"></p>${useBtn}`;
        assistResult.querySelector('.ai-assist-text').textContent = data.text;
        document.getElementById('useAiSuggestion')?.addEventListener('click', () => { input.value = data.text; input.focus(); });
      } catch { if (assistResult) assistResult.innerHTML = '<p class="error-text">AI Assist failed.</p>'; }
      finally { btn.disabled = false; }
    });
  });
})();

// ---- Admin: transaction history generation progress ----
(() => {
  const progressEl = document.getElementById('genProgress');
  const chunkForm = document.getElementById('genChunkForm');
  if (!progressEl || !chunkForm) return;
  if (progressEl.dataset.status === 'completed') return;
  const url = chunkForm.getAttribute('action');
  const csrf = chunkForm.querySelector('input[name="_csrf"]')?.value;
  const adminAccess = chunkForm.querySelector('input[name="_admin_access"]')?.value;
  const textEl = document.getElementById('genProgressText');
  const fillEl = document.getElementById('genProgressFill');
  const countEl = document.getElementById('genProgressCount');
  const failEl = document.getElementById('genProgressFailures');
  const listEl = document.getElementById('genFailureList');
  async function processNextChunk() {
    try {
      const r = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ _csrf:csrf, _admin_access:adminAccess }) });
      const data = await r.json();
      if (!r.ok) { textEl.textContent = data.error || 'Generation failed.'; return; }
      const pct = data.total ? Math.round((data.createdCount + data.failedCount) / data.total * 100) : 100;
      fillEl.style.width = pct + '%';
      countEl.textContent = `${(data.createdCount + data.failedCount).toLocaleString()} / ${data.total.toLocaleString()}`;
      if (data.failedCount) failEl.textContent = `${data.failedCount} record(s) failed.`;
      for (const f of (data.recentFailures || []).slice(0,20)) { const li = document.createElement('li'); li.textContent = `Record #${f.seq}: ${f.reason}`; listEl.appendChild(li); }
      if (data.status === 'completed') { textEl.textContent = 'Generation complete.'; return; }
      setTimeout(processNextChunk, 150);
    } catch { setTimeout(processNextChunk, 2000); }
  }
  processNextChunk();
})();
