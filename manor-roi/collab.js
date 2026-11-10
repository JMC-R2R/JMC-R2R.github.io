/* Manor on High: "Updates" tab with "Updates & feedback" for Savvas Studio and Ready to Rank (added 10/11/2026, Jhen).
   Same as the Cobalt dashboard's Updates tab: notes and voice messages about the dashboard itself.
   Manor already has its own pins, so this file adds only the Updates tab. Mario (client) never sees it,
   and the database refuses him too. Lives in its own file so Jose's index.html is untouched apart from the
   one <script> line that loads it. Manor signs in with its own magic link (localStorage "manorAuth", or the
   hub's session when embedded), so this talks to Supabase with that same token over plain fetch.
   Database: pa_feedback_* functions, slug 'manor-on-high'. Mabel posts Savvas feedback to #partner-savvas-studio. */
(() => {
  const URL_ = 'https://tjgrtrazyepvbcmmdhet.supabase.co';
  const KEY = 'sb_publishable_FeX9cGqiIHCfAlWA_yTJ9g_u_TM48T8';
  const SLUG = 'manor-on-high', BUCKET = 'pa-feedback';
  const ENGINE_VIEWS = ['search', 'bench', 'reels', 'paid', 'ai', 'social', 'roi'];
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  let FB = [], LOADED = false, DRAFT = '', OPEN = false, PREV_LABEL = '';
  let rec = null, blob = null, mime = '', timer = null;

  function token(){
    try { const embed = window.self !== window.top;
      const k = embed ? 'sb-tjgrtrazyepvbcmmdhet-auth-token' : 'manorAuth';
      const s = JSON.parse(localStorage.getItem(k) || 'null') || JSON.parse(localStorage.getItem('manorAuth') || 'null');
      return s && s.access_token ? s.access_token : null; } catch (e) { return null; }
  }
  function email(){ try { const t = token(); return t ? (JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || '') : ''; } catch (e) { return ''; } }
  async function rpc(fn, args){
    const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + token() }, body: JSON.stringify(args) });
    const out = await r.json().catch(() => null);
    if (!r.ok) throw new Error((out && (out.message || out.msg)) || ('HTTP ' + r.status));
    return out;
  }
  async function signed(path){
    const r = await fetch(`${URL_}/storage/v1/object/sign/${BUCKET}/${path}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + token() }, body: JSON.stringify({ expiresIn: 3600 }) });
    const out = await r.json().catch(() => null);
    return r.ok && out && out.signedURL ? URL_ + '/storage/v1' + out.signedURL : null;
  }
  async function upload(path, b){
    const r = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${path}`, { method: 'POST',
      headers: { apikey: KEY, Authorization: 'Bearer ' + token(), 'Content-Type': (mime.split(';')[0] || 'audio/webm') }, body: b });
    if (!r.ok) throw new Error('upload ' + r.status);
  }
  async function removeFile(path){
    await fetch(`${URL_}/storage/v1/object/${BUCKET}`, { method: 'DELETE',
      headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + token() }, body: JSON.stringify({ prefixes: [path] }) }).catch(() => {});
  }

  document.head.insertAdjacentHTML('beforeend', `<style id="collab-css">
  #viewUpdates .cbf-eyebrow{font-family:var(--mono,monospace);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted,#9a9a9a);margin:6px 0 8px}
  #viewUpdates .cbf-h2{font-family:var(--sans);font-size:22px;font-weight:800;margin:0 0 4px}
  #viewUpdates .cbf-sub{color:var(--muted,#9a9a9a);font-size:13.5px;max-width:70ch;margin:0 0 16px}
  #viewUpdates .cbf-compose{display:flex;gap:12px;background:var(--panel,#241F21);border:1px solid var(--line,#3A3236);border-radius:14px;padding:16px;margin-bottom:18px}
  #viewUpdates .cbf-main{flex:1;min-width:0}
  #viewUpdates textarea{width:100%;min-height:70px;resize:vertical;background:var(--panel-2,#2C2629);border:1px solid var(--line,#3A3236);border-radius:8px;color:var(--white,#fff);font:14px var(--sans);padding:10px;outline:none;box-sizing:border-box}
  #viewUpdates .cbf-row{display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap}
  #viewUpdates .cbf-row button{border-radius:8px;padding:8px 14px;font:700 12.5px var(--sans);cursor:pointer}
  #viewUpdates .cb-ghost{background:transparent;border:1px solid var(--line,#3A3236);color:var(--muted,#bbb)}
  #viewUpdates .cb-save{margin-left:auto;background:#E4572E;color:#fff;border:0}
  #viewUpdates .cb-save:disabled{opacity:.6}
  #viewUpdates .cb-time{font-family:var(--mono,monospace);font-size:11px;color:var(--muted,#9a9a9a)}
  #viewUpdates .cb-av{width:34px;height:34px;flex:0 0 34px;border-radius:50%;object-fit:cover;background:var(--panel-2,#2C2629);display:grid;place-items:center;font:800 12px var(--sans);color:var(--muted,#bbb)}
  #viewUpdates .cb-item{display:flex;gap:12px;padding:14px 4px;border-top:1px solid var(--line,#3A3236)}
  #viewUpdates .cb-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
  #viewUpdates .cb-name{font-size:13.5px;font-weight:700}
  #viewUpdates .cb-when{font-family:var(--mono,monospace);font-size:10.5px;color:var(--muted,#9a9a9a)}
  #viewUpdates .cb-del{margin-left:auto;background:none;border:0;color:var(--muted,#9a9a9a);font-size:14px;cursor:pointer}
  #viewUpdates .cb-body{font-size:14px;line-height:1.55;margin-top:4px;white-space:pre-wrap;overflow-wrap:anywhere;opacity:.9}
  #viewUpdates audio{width:100%;max-width:340px;height:34px;margin-top:8px}
  #viewUpdates .cb-empty{color:var(--muted,#9a9a9a);font-size:13.5px;padding:10px 4px}

  /* Cobalt look (10/11/2026): orange ring on photos, pill buttons */
  #viewUpdates .cb-av{border:2px solid #E4572E;box-sizing:border-box}
  #viewUpdates .cb-item .cb-av{width:40px;height:40px;flex-basis:40px}
  #viewUpdates #cbf-rec{font-family:var(--mono,monospace);font-size:11px;border-radius:20px;padding:7px 12px}
  #viewUpdates .cb-save{border-radius:20px;padding:8px 16px}
  #viewUpdates textarea:focus{border-color:#E4572E}
  </style>`);

  const AUTHORS = {};   /* email -> photo, from the same author list the pins use */
  function avatar(o){
    const a = AUTHORS[String(o.author_email || '').toLowerCase()];
    if (a && a.avatar_url) return `<img class="cb-av" src="${esc(a.avatar_url)}" alt="">`;
    const nm = o.author_name || o.author_email || '?';
    return `<span class="cb-av">${esc(nm.split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase())}</span>`;
  }
  function ensureTab(){
    const strip = document.querySelector('nav.navbar .tabs'), last = $('viewAi');
    if (!strip || !last || $('tabUpdates')) return;
    const b = document.createElement('button'); b.className = 'tab'; b.id = 'tabUpdates'; b.type = 'button'; b.setAttribute('role', 'tab');
    b.innerHTML = '<span class="ti">✎</span>Updates'; b.addEventListener('click', open); strip.appendChild(b);
    const v = document.createElement('div'); v.className = 'view'; v.id = 'viewUpdates'; last.after(v);
  }
  function open(){
    OPEN = true;
    ENGINE_VIEWS.forEach(k => { const cap = k.charAt(0).toUpperCase() + k.slice(1); const v = $('view' + cap), t = $('tab' + cap);
      if (v) v.classList.remove('active'); if (t) t.classList.remove('active'); });
    $('viewUpdates').classList.add('active'); $('tabUpdates').classList.add('active');
    const lab = $('viewLabel'); if (lab){ PREV_LABEL = lab.textContent; lab.textContent = 'Updates'; }
    render(); if (!LOADED) load();
  }
  function close(){ if (!OPEN) return; OPEN = false; const v = $('viewUpdates'), t = $('tabUpdates'); if (v) v.classList.remove('active'); if (t) t.classList.remove('active'); }
  async function load(){
    try { FB = await rpc('pa_feedback_list', { p_slug: SLUG }) || []; } catch (e) { console.warn('updates', e.message); FB = []; }
    LOADED = true; if (OPEN) render();
  }
  function render(){
    const v = $('viewUpdates'); if (!v) return;
    const me = email().toLowerCase(), team = /@readytorank\.com\.au$/i.test(me);
    v.innerHTML = `<div class="cbf-eyebrow">Dashboard updates · Savvas Studio and Ready to Rank</div>
      <h2 class="cbf-h2">Updates &amp; feedback</h2>
      <p class="cbf-sub">Spot something to fix or improve on this dashboard? Leave a note or a voice message. Only Savvas Studio and the Ready to Rank team can see this, and the Ready to Rank team reviews and actions every one.</p>
      <div class="cbf-compose">${avatar({ author_email: me })}<div class="cbf-main">
        <textarea id="cbf-text" maxlength="4000" placeholder="Share an update, edit request or idea about this dashboard…">${esc(DRAFT)}</textarea>
        <div class="cbf-row"><button type="button" class="cb-ghost" id="cbf-rec">● Record</button><span class="cb-time" id="cbf-time"></span><span id="cbf-prev"></span>
          <button type="button" class="cb-save" id="cbf-post">Post</button></div></div></div>
      <div>${!LOADED ? '<div class="cb-empty">Loading…</div>' : FB.length ? FB.map(o => `<div class="cb-item">${avatar(o)}<div style="flex:1;min-width:0">
        <div class="cb-top"><span class="cb-name">${esc(o.author_name || o.author_email)}</span><span class="cb-when">${esc(new Date(o.created_at).toLocaleString('en-AU'))}</span>
        ${(team || String(o.author_email).toLowerCase() === me) ? `<button type="button" class="cb-del" data-del="${esc(o.id)}" title="Delete">✕</button>` : ''}</div>
        ${o.body ? `<div class="cb-body">${esc(o.body)}</div>` : ''}<div data-audio="${esc(o.audio_path || '')}"></div></div></div>`).join('')
        : '<div class="cb-empty">No updates yet. Be the first to post.</div>'}</div>`;
    $('cbf-text').addEventListener('input', e => { DRAFT = e.target.value; });
    $('cbf-rec').onclick = toggleRec; $('cbf-post').onclick = post;
    v.querySelectorAll('[data-audio]').forEach(async el => { const p = el.dataset.audio; if (!p) return; const u = await signed(p); if (u) el.innerHTML = `<audio controls src="${u}"></audio>`; });
    v.querySelectorAll('[data-del]').forEach(b => b.onclick = () => del(b.dataset.del));
  }
  async function toggleRec(){
    const btn = $('cbf-rec');
    if (rec && rec.state === 'recording'){ stopRec(); btn.textContent = '● Record'; return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mime = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); mime = rec.mimeType || mime || 'audio/webm';
      const parts = []; rec.ondataavailable = e => { if (e.data && e.data.size) parts.push(e.data); };
      rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); if (parts.length){ blob = new Blob(parts, { type: mime });
        const pv = $('cbf-prev'); if (pv) pv.innerHTML = `<audio controls src="${URL.createObjectURL(blob)}"></audio>`; } };
      rec.start(); const st = Date.now(); btn.textContent = '■ Stop';
      timer = setInterval(() => { const s = Math.round((Date.now() - st) / 1000); const t = $('cbf-time'); if (t) t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500);
    } catch (e) { const t = $('cbf-time'); if (t) t.textContent = 'Microphone access was blocked'; }
  }
  function stopRec(){ if (timer){ clearInterval(timer); timer = null; } if (rec && rec.state === 'recording') rec.stop(); }
  async function post(){
    const btn = $('cbf-post'), t = $('cbf-time'); btn.disabled = true; btn.textContent = 'Posting…';
    stopRec(); await new Promise(r => setTimeout(r, 250));
    const body = ($('cbf-text').value || '').trim();
    if (!body && !blob){ btn.disabled = false; btn.textContent = 'Post'; t.textContent = 'Type or record something first'; return; }
    let path = null;
    try {
      if (blob){ const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm';
        path = `${SLUG}/${crypto.randomUUID()}.${ext}`; await upload(path, blob); }
      await rpc('pa_feedback_add', { p_slug: SLUG, p_body: body || null, p_audio_path: path });
      DRAFT = ''; blob = null; await load();
    } catch (e) { console.warn('updates post', e.message); if (path) await removeFile(path);
      btn.disabled = false; btn.textContent = 'Post'; t.textContent = 'Could not post, please try again'; }
  }
  async function del(id){
    if (!confirm('Delete this update?')) return;
    try { const p = await rpc('pa_feedback_delete', { p_id: id }); if (p) await removeFile(p); await load(); }
    catch (e) { alert('Could not delete: ' + e.message); }
  }

  /* Manor's own tabs switch views through showView(); when one of its views becomes active, close ours. */
  function watch(){
    const mo = new MutationObserver(() => { if (OPEN && ENGINE_VIEWS.some(k => $('view' + k.charAt(0).toUpperCase() + k.slice(1))?.classList.contains('active'))) close(); });
    ENGINE_VIEWS.forEach(k => { const v = $('view' + k.charAt(0).toUpperCase() + k.slice(1)); if (v) mo.observe(v, { attributes: true, attributeFilter: ['class'] }); });
  }
  let started = false, checkedFor = '';
  async function start(){
    const t = token();
    if (started || !t || checkedFor === t) return;
    checkedFor = t;                    /* ask once per sign-in, never on a loop */
    let ok = false;
    try { await rpc('pa_feedback_list', { p_slug: SLUG }); ok = true; } catch (e) { ok = false; }   /* Savvas and R2R only */
    if (!ok) return;
    started = true;
    try { const r = await fetch(`${URL_}/rest/v1/rpc/pa_feedback_authors`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + token() }, body: '{}' });
      if (r.ok) (await r.json() || []).forEach(a => { AUTHORS[String(a.email).toLowerCase()] = a; }); } catch (e) {}
    ensureTab(); watch();
    if ((location.hash || '').replace('#', '').split(/[/&]/)[0] === 'updates') open();
  }
  /* Manor shows the page once its sign-in succeeds; try now and again whenever the session appears. */
  let ticks = 0;
  const tick = setInterval(() => { if (started || ++ticks > 400) return clearInterval(tick); if (token() && document.querySelector('nav.navbar .tabs') && $('viewAi')) start(); }, 1500);
  addEventListener('storage', () => start());
})();
