/* STC Security: Cobalt-style collaboration for Savvas Studio and Ready to Rank (added 10/11/2026, Jhen).
   1. Pins: "✎ Add insight", click any spot on a tab, note or voice message, shown as the author's photo on a
      pin; each tab lists its pins with a Walkthrough. STC's own logins can read pins, not add them (as Cobalt).
   2. An "Updates" tab with "Updates & feedback": notes about the dashboard itself, Savvas and R2R only.
   Lives in its own file so Jose's index.html is untouched apart from the one <script> line that loads it.
   It follows the page's own tabs (tb-* buttons, pn-* panels) and colours, light and dark.
   Database: pa_feedback_* and pa_insights_* functions, slug 'stc-security', access from stc_launch_viewers.
   Mabel posts Savvas comments to #partner-savvas-studio. */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SLUG = 'stc-security';
const sb = createClient('https://tjgrtrazyepvbcmmdhet.supabase.co', 'sb_publishable_FeX9cGqiIHCfAlWA_yTJ9g_u_TM48T8');
const BUCKET = 'pa-feedback';
const SAVVAS_ICON = 'https://update.readytorank.com.au/cobalt/assets/savvas-icon.png';
const R2R_ICON = 'https://update.readytorank.com.au/cobalt/assets/r2r.png';
const ENGINE_TABS = ['overview', 'launch', 'ads', 'next'];
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

let ME = { email: '', team: false };
let PINS = { items: [], can_add: false, me: null, loaded: false };
let FB = [], FB_OK = false, FB_LOADED = false, FB_DRAFT = '';
let OPEN = false, PINMODE = false, WT = null;
let rec = null, blob = null, mime = '', timer = null;

document.head.insertAdjacentHTML('beforeend', `<style id="collab-css">
#cb-layer{position:absolute;top:0;left:0;width:0;height:0;z-index:4}
.cb-pin{position:absolute;width:0;height:0}
.cb-pin .ring{position:absolute;left:-7px;top:-7px;width:14px;height:14px;border-radius:50%;background:#E4572E;animation:cbpulse 2s infinite;cursor:pointer}
.cb-pin .arm{position:absolute;left:0;top:0;width:34px;height:2px;background:#E4572E;transform-origin:0 50%}
.cb-pin .av{position:absolute;width:38px;height:38px;border-radius:50%;border:2px solid #E4572E;overflow:hidden;background:var(--panel-2,#1B1B21);cursor:pointer;display:grid;place-items:center;font-size:12px;font-weight:800;color:var(--ink-2,#B9B9C4)}
.cb-pin .av img{width:100%;height:100%;object-fit:cover}
.cb-pin.ul .arm{transform:rotate(-135deg)}.cb-pin.ul .av{left:-53px;top:-53px}
.cb-pin.ur .arm{transform:rotate(-45deg)}.cb-pin.ur .av{left:15px;top:-53px}
.cb-pin.dl .arm{transform:rotate(135deg)}.cb-pin.dl .av{left:-53px;top:15px}
.cb-pin.dr .arm{transform:rotate(45deg)}.cb-pin.dr .av{left:15px;top:15px}
@keyframes cbpulse{0%{box-shadow:0 0 0 0 rgba(228,87,46,.55)}70%{box-shadow:0 0 0 12px rgba(228,87,46,0)}100%{box-shadow:0 0 0 0 rgba(228,87,46,0)}}
#cb-add{position:fixed;left:20px;bottom:20px;z-index:40;display:none;align-items:center;gap:6px;border:0;border-radius:40px;padding:10px 16px;font:800 13px var(--sans,system-ui);background:#E4572E;color:#fff;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.3)}
#cb-add.on{background:var(--ink,#fff);color:var(--ground,#111)}
body.cb-pinmode main{cursor:crosshair}
#cb-hint{display:none;position:fixed;left:50%;transform:translateX(-50%);top:14px;z-index:41;background:#E4572E;color:#fff;font:700 12.5px var(--sans,system-ui);padding:8px 14px;border-radius:20px}
body.cb-pinmode #cb-hint{display:block}
#cb-pop{position:fixed;z-index:70;width:300px;max-width:calc(100vw - 20px);background:var(--panel,#16161B);border:1px solid var(--line,#2A2A32);border-radius:14px;padding:14px;box-shadow:0 18px 50px rgba(0,0,0,.4);display:none;color:var(--ink,#fff);font-family:var(--sans,system-ui)}
#cb-pop.show{display:block}
.cb-head{display:flex;gap:10px;align-items:center;margin-bottom:8px;padding-right:18px}
.cb-av{width:34px;height:34px;border-radius:50%;object-fit:cover;flex:0 0 34px;background:var(--panel-2,#1B1B21);display:grid;place-items:center;font-size:12px;font-weight:800;color:var(--ink-2,#B9B9C4)}
.cb-who{font-size:13px;font-weight:700}.cb-role{font-size:11px;color:var(--ink-3,#7E7E8C)}
.cb-x{position:absolute;right:8px;top:6px;background:none;border:none;color:var(--ink-3,#7E7E8C);font-size:20px;padding:2px 6px;cursor:pointer}
.cb-body{font-size:13.5px;color:var(--ink-2,#B9B9C4);line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
#cb-pop audio,.cb-audio audio,#cb-prev audio,#cbf-prev audio{width:100%;max-width:320px;height:34px;margin-top:8px}
.cb-row{display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap}
.cb-row button,.cbf-row button{border-radius:8px;padding:8px 12px;font:700 12px var(--sans,system-ui);cursor:pointer}
.cb-ghost{background:transparent;border:1px solid var(--line,#2A2A32);color:var(--ink-2,#B9B9C4)}
.cb-del{background:transparent;border:1px solid rgba(239,68,68,.5);color:#EF4444}
.cb-save{margin-left:auto;background:#E4572E;color:#fff;border:0}
.cb-save:disabled{opacity:.6}
.cb-time{font-family:var(--mono,monospace);font-size:11px;color:var(--ink-3,#7E7E8C)}
#cb-pop textarea,#cbf-text{width:100%;min-height:70px;resize:vertical;background:var(--panel-2,#1B1B21);border:1px solid var(--line,#2A2A32);border-radius:8px;color:var(--ink,#fff);font:14px var(--sans,system-ui);padding:9px;outline:none;box-sizing:border-box}
.cb-panel{background:var(--panel,#16161B);border:1px solid var(--line,#2A2A32);border-left:3px solid #E4572E;border-radius:12px;padding:16px;margin:26px 0 8px}
.cb-panel h3{display:flex;align-items:center;gap:8px;font-size:14.5px;margin:0}
.cb-panel h3 img{width:20px;height:20px;border-radius:50%}
.cb-panel .wt{margin-left:auto;border:0;border-radius:20px;padding:6px 12px;font:700 12px var(--sans,system-ui);background:#E4572E;color:#fff;cursor:pointer}
.cb-ps{color:var(--ink-3,#7E7E8C);font-size:12.5px;margin:4px 0 6px}
.cb-item{display:flex;gap:12px;padding:12px 0;border-top:1px solid var(--line-soft,#22222A)}
.cb-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.cb-name{font-size:13px;font-weight:700}
.cb-where{font-family:var(--mono,monospace);font-size:10px;color:#E4572E;background:rgba(228,87,46,.12);padding:2px 7px;border-radius:5px}
.cb-when{margin-left:auto;font-family:var(--mono,monospace);font-size:10px;color:var(--ink-3,#7E7E8C)}
.cb-empty{color:var(--ink-3,#7E7E8C);font-size:13px;padding:8px 0}
.cbf-eyebrow{font-family:var(--mono,monospace);font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-3,#7E7E8C);margin:26px 0 8px}
.cbf-h2{font-size:20px;font-weight:800;margin:0 0 4px}
.cbf-sub{color:var(--ink-3,#7E7E8C);font-size:13px;max-width:70ch;margin:0 0 14px}
.cbf-compose{display:flex;gap:12px;background:var(--panel,#16161B);border:1px solid var(--line,#2A2A32);border-radius:12px;padding:15px 16px;margin-bottom:18px}
.cbf-main{flex:1;min-width:0}
.cbf-row{display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap}
@media (max-width:520px){#cb-add{left:14px;bottom:14px}}

/* Cobalt look (10/11/2026): orange ring on photos, small caps role, pill buttons, tinted panel */
.cb-av{border:2px solid #E4572E;width:36px;height:36px;flex:0 0 36px;box-sizing:border-box}
.cb-item .cb-av{width:40px;height:40px;flex-basis:40px}
.cb-role{font-family:var(--mono,monospace);font-size:9.5px;letter-spacing:.04em;text-transform:uppercase}
.cb-pin .av{width:40px;height:40px;border:2px solid #E4572E;box-shadow:0 4px 14px rgba(0,0,0,.55)}
#cb-pop{padding:15px}
#cb-pop textarea,#cbf-text{font-size:13px}
#cb-pop textarea:focus,#cbf-text:focus{border-color:#E4572E}
#cb-rec,#cbf-rec{font-family:var(--mono,monospace);font-size:11px;font-weight:700;border-radius:20px;padding:7px 12px}
#cb-cancel{font-family:var(--mono,monospace);font-size:11px;font-weight:400;background:none;border:none}
.cb-save{border-radius:20px;padding:8px 16px}
.cb-del{font-family:var(--mono,monospace);font-size:10px;border:none;background:none;padding:0}
.cb-panel{border:1px solid rgba(228,87,46,.28);border-left:3px solid #E4572E;background:linear-gradient(100deg,rgba(228,87,46,.13),transparent 70%)}
.cb-where{border-radius:20px}
</style>`);

/* ---------------------------------------------------------------- helpers */
const curTab = () => OPEN ? 'updates' : (ENGINE_TABS.find(k => $('#tb-' + k)?.getAttribute('aria-selected') === 'true') || 'overview');
const tabName = k => $('#tb-' + k)?.textContent?.trim() || k;
function avatar(o, cls){
  const url = o && o.avatar_url, nm = (o && (o.author_name || o.name || o.author_email)) || '';
  if (url) return `<img class="${cls}" src="${esc(url)}" alt="">`;
  return `<span class="${cls}">${esc(nm.split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '?')}</span>`;
}
async function audioInto(el, path){ if (!el || !path) return;
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (data && data.signedUrl) el.innerHTML = `<audio controls src="${data.signedUrl}"></audio>`; }
function popAt(x, y){ const p = $('#cb-pop'), w = p.offsetWidth || 300, h = p.offsetHeight || 170;
  let L = Math.min(Math.max(x - w / 2, 10), innerWidth - w - 10), T = y + 16; if (T + h > innerHeight - 10) T = Math.max(10, y - h - 16);
  p.style.left = L + 'px'; p.style.top = T + 'px'; }
function popClose(){ const p = $('#cb-pop'); if (p){ p.classList.remove('show'); p.innerHTML = ''; } WT = null; }
function stopRec(){ if (timer){ clearInterval(timer); timer = null; } if (rec && rec.state === 'recording') rec.stop(); }
async function startRec(btn, timeEl, prevEl){
  if (rec && rec.state === 'recording'){ stopRec(); btn.textContent = '● Record'; return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mime = ['audio/webm', 'audio/mp4', 'audio/ogg'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); mime = rec.mimeType || mime || 'audio/webm';
    const parts = []; rec.ondataavailable = e => { if (e.data && e.data.size) parts.push(e.data); };
    rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); if (parts.length){ blob = new Blob(parts, { type: mime });
      const pv = $(prevEl); if (pv) pv.innerHTML = `<audio controls src="${URL.createObjectURL(blob)}"></audio>`; } };
    rec.start(); const st = Date.now(); btn.textContent = '■ Stop';
    timer = setInterval(() => { const s = Math.round((Date.now() - st) / 1000); const t = $(timeEl); if (t) t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500);
  } catch (err) { const t = $(timeEl); if (t) t.textContent = 'Microphone access was blocked'; }
}
async function uploadBlob(sub){
  if (!blob) return null;
  const ext = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm';
  const path = `${SLUG}/${sub}${crypto.randomUUID()}.${ext}`;
  const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: mime.split(';')[0] || 'audio/webm' });
  if (up.error) throw up.error; return path;
}

/* ---------------------------------------------------------------- data */
async function loadPins(){
  const { data, error } = await sb.rpc('pa_insights_list', { p_slug: SLUG });
  if (error){ console.warn('collab pins', error.message); return; }
  PINS = { items: data.items || [], can_add: !!data.can_add, me: data.me || null, loaded: true };
  FB_OK = PINS.can_add;
  ensureTab(); paintPanels(); paintPins(); addBtn();
}
async function loadFeedback(){
  const { data, error } = await sb.rpc('pa_feedback_list', { p_slug: SLUG });
  if (error){ console.warn('collab feedback', error.message); FB = []; } else FB = Array.isArray(data) ? data : [];
  FB_LOADED = true; renderUpdates();
}

/* ---------------------------------------------------------------- the Updates tab */
function ensureTab(){
  const list = $('.tablist'), last = $('#pn-next'); if (!list || !last || !FB_OK) return;
  if (!$('#tb-updates')){
    const b = document.createElement('button'); b.className = 'tab'; b.type = 'button'; b.id = 'tb-updates';
    b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', 'pn-updates'); b.setAttribute('aria-selected', 'false'); b.tabIndex = -1;
    b.textContent = 'Updates'; list.appendChild(b);
    b.addEventListener('click', openUpdates);
    const p = document.createElement('div'); p.id = 'pn-updates'; p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', 'tb-updates'); p.hidden = true;
    last.after(p);
  }
}
function openUpdates(){
  OPEN = true; popClose(); setPinMode(false);
  ENGINE_TABS.forEach(k => { const b = $('#tb-' + k), p = $('#pn-' + k); if (b){ b.setAttribute('aria-selected', 'false'); b.tabIndex = -1; } if (p) p.hidden = true; });
  const b = $('#tb-updates'); b.setAttribute('aria-selected', 'true'); b.tabIndex = 0; $('#pn-updates').hidden = false;
  renderUpdates(); paintPins(); addBtn();
  if (!FB_LOADED) loadFeedback();
}
function closeUpdates(){
  if (!OPEN) return; OPEN = false;
  const b = $('#tb-updates'), p = $('#pn-updates'); if (b){ b.setAttribute('aria-selected', 'false'); b.tabIndex = -1; } if (p) p.hidden = true;
  paintPins(); addBtn();
}
function renderUpdates(){
  const panel = $('#pn-updates'); if (!panel) return;
  const me = ME.email.toLowerCase();
  panel.innerHTML = `<div class="cbf-eyebrow">Dashboard updates · Savvas Studio and Ready to Rank</div>
    <h2 class="cbf-h2">Updates &amp; feedback</h2>
    <p class="cbf-sub">Spot something to fix or improve on this dashboard? Leave a note or a voice message. Only Savvas Studio and the Ready to Rank team can see this, and the Ready to Rank team reviews and actions every one.</p>
    <div class="cbf-compose">${avatar(PINS.me || { name: ME.email }, 'cb-av')}<div class="cbf-main">
      <textarea id="cbf-text" maxlength="4000" placeholder="Share an update, edit request or idea about this dashboard…">${esc(FB_DRAFT)}</textarea>
      <div class="cbf-row"><button type="button" class="cb-ghost" id="cbf-rec">● Record</button><span class="cb-time" id="cbf-time"></span><span id="cbf-prev"></span>
        <button type="button" class="cb-save" id="cbf-post">Post</button></div></div></div>
    <div>${!FB_LOADED ? '<div class="cb-empty">Loading…</div>' : FB.length ? FB.map(o => `<div class="cb-item">${avatar(o, 'cb-av')}
      <div style="flex:1;min-width:0"><div class="cb-top"><span class="cb-name">${esc(o.author_name || o.author_email)}</span><span class="cb-when">${esc(new Date(o.created_at).toLocaleString('en-AU'))}</span>
      ${(ME.team || String(o.author_email).toLowerCase() === me) ? `<button type="button" class="cb-ghost" data-fbdel="${esc(o.id)}" title="Delete">✕</button>` : ''}</div>
      ${o.body ? `<div class="cb-body">${esc(o.body)}</div>` : ''}<div class="cb-audio" data-audio="${esc(o.audio_path || '')}"></div></div></div>`).join('')
      : '<div class="cb-empty">No updates yet. Be the first to post.</div>'}</div>`;
  $('#cbf-text').addEventListener('input', e => { FB_DRAFT = e.target.value; });
  $('#cbf-rec').onclick = e => startRec(e.currentTarget, '#cbf-time', '#cbf-prev');
  $('#cbf-post').onclick = postFeedback;
  panel.querySelectorAll('.cb-audio[data-audio]').forEach(el => audioInto(el, el.dataset.audio));
  panel.querySelectorAll('[data-fbdel]').forEach(b => b.onclick = () => deleteFeedback(b.dataset.fbdel));
}
async function postFeedback(){
  const btn = $('#cbf-post'), t = $('#cbf-time'); btn.disabled = true; btn.textContent = 'Posting…';
  stopRec(); await new Promise(r => setTimeout(r, 250));
  const body = ($('#cbf-text').value || '').trim();
  if (!body && !blob){ btn.disabled = false; btn.textContent = 'Post'; t.textContent = 'Type or record something first'; return; }
  let path = null;
  try {
    path = await uploadBlob('');
    const { error } = await sb.rpc('pa_feedback_add', { p_slug: SLUG, p_body: body || null, p_audio_path: path }); if (error) throw error;
    FB_DRAFT = ''; blob = null; await loadFeedback();
  } catch (err) { console.warn('collab post', err && err.message); if (path) await sb.storage.from(BUCKET).remove([path]);
    btn.disabled = false; btn.textContent = 'Post'; t.textContent = 'Could not post, please try again'; }
}
async function deleteFeedback(id){
  if (!confirm('Delete this update?')) return;
  const { data, error } = await sb.rpc('pa_feedback_delete', { p_id: id });
  if (error){ alert('Could not delete: ' + error.message); return; }
  if (data) await sb.storage.from(BUCKET).remove([data]);
  await loadFeedback();
}

/* ---------------------------------------------------------------- pins */
function paintPanels(){
  if (!PINS.loaded) return;
  ENGINE_TABS.forEach(k => {
    const pn = $('#pn-' + k); if (!pn) return;
    let box = pn.querySelector(':scope > .cb-panel');
    if (!box){ box = document.createElement('div'); box.className = 'cb-panel'; pn.appendChild(box); }
    const items = PINS.items.filter(o => o.tab === k), savvas = k === 'ads';
    box.innerHTML = `<h3><img src="${savvas ? SAVVAS_ICON : R2R_ICON}" alt="">${savvas ? 'Savvas Studio and Ready to Rank — insights' : 'Team insights'}${items.length ? '<button type="button" class="wt">▶ Walkthrough</button>' : ''}</h3>
      <p class="cb-ps">Notes pinned on this tab.${PINS.can_add ? ' Click ✎ Add insight, then any spot on this tab.' : ''}</p>` +
      (items.length ? items.map(o => `<div class="cb-item">${avatar(o, 'cb-av')}<div style="flex:1;min-width:0"><div class="cb-top"><span class="cb-name">${esc(o.author_name || o.author_email)}</span><span class="cb-where">On this page</span><span class="cb-when">${esc(new Date(o.created_at).toLocaleDateString('en-AU'))}</span></div>
        ${o.body ? `<div class="cb-body">${esc(o.body)}</div>` : ''}<div class="cb-audio" data-audio="${esc(o.audio_path || '')}"></div></div></div>`).join('') : '<div class="cb-empty">No insights pinned yet.</div>');
    box.querySelectorAll('.cb-audio[data-audio]').forEach(el => audioInto(el, el.dataset.audio));
    const wt = box.querySelector('.wt'); if (wt) wt.onclick = () => walk(k);
  });
}
function paintPins(){
  let layer = $('#cb-layer'); if (!layer){ layer = document.createElement('div'); layer.id = 'cb-layer'; document.body.appendChild(layer); }
  layer.innerHTML = '';
  if (OPEN) return;
  const tab = curTab(), pn = $('#pn-' + tab); if (!pn || pn.hidden) return;
  const r = pn.getBoundingClientRect(); if (!r.width || !r.height) return;
  PINS.items.filter(o => o.tab === tab && o.target_id).forEach(o => {
    const xf = o.x_frac == null ? .5 : o.x_frac, yf = o.y_frac == null ? .2 : o.y_frac;
    const px = r.left + xf * r.width, py = r.top + yf * r.height;
    const b = document.createElement('div'); b.className = 'cb-pin ' + (py > 160 ? 'u' : 'd') + (px > 120 ? 'l' : 'r'); b.dataset.id = o.id;
    b.style.left = (px + scrollX) + 'px'; b.style.top = (py + scrollY) + 'px';
    b.innerHTML = `<div class="arm"></div><div class="av">${o.avatar_url ? `<img src="${esc(o.avatar_url)}" alt="">` : esc((o.author_name || '?')[0])}</div><span class="ring"></span>`;
    const open = ev => { ev.stopPropagation(); ev.preventDefault(); show(o, ev.clientX, ev.clientY); };
    b.querySelector('.av').addEventListener('click', open); b.querySelector('.ring').addEventListener('click', open);
    layer.appendChild(b);
  });
}
function addBtn(){ const b = $('#cb-add'); if (!b) return; const ok = PINS.can_add && !OPEN;
  b.style.display = ok ? 'inline-flex' : 'none'; if (!ok && PINMODE) setPinMode(false); }
function setPinMode(on){ PINMODE = on; document.body.classList.toggle('cb-pinmode', on);
  const b = $('#cb-add'); if (b){ b.classList.toggle('on', on); b.innerHTML = on ? '✕ Cancel' : '✎ Add insight'; } }
function show(o, x, y, nav){
  const p = $('#cb-pop'), me = ME.email.toLowerCase();
  const mine = ME.team || String(o.author_email || '').toLowerCase() === me;
  p.innerHTML = `<button type="button" class="cb-x" aria-label="Close">&times;</button>
    <div class="cb-head">${avatar(o, 'cb-av')}<div><div class="cb-who">${esc(o.author_name || o.author_email)}</div><div class="cb-role">${esc(o.role_title || '')}</div></div></div>
    ${o.body ? `<div class="cb-body">${esc(o.body)}</div>` : ''}<div id="cb-paudio"></div>
    <div class="cb-row">${mine ? '<button type="button" class="cb-del">Delete</button>' : ''}${nav ? `<span class="cb-time">${nav.i + 1} of ${nav.n}</span>${nav.i > 0 ? '<button type="button" class="cb-ghost" data-go="-1">Back</button>' : ''}<button type="button" class="cb-save" data-go="1">${nav.i < nav.n - 1 ? 'Next' : 'Done'}</button>` : ''}</div>`;
  p.classList.add('show'); popAt(x, y);
  p.querySelector('.cb-x').onclick = popClose;
  const d = p.querySelector('.cb-del'); if (d) d.onclick = () => deletePin(o);
  p.querySelectorAll('[data-go]').forEach(b => b.onclick = e => { e.stopPropagation(); step(Number(b.dataset.go)); });
  audioInto($('#cb-paudio'), o.audio_path);
}
function compose(tab, xf, yf, x, y){
  blob = null; const p = $('#cb-pop'), me = PINS.me || { name: ME.email };
  p.innerHTML = `<button type="button" class="cb-x" aria-label="Close">&times;</button>
    <div class="cb-head">${avatar(me, 'cb-av')}<div><div class="cb-who">${esc(me.name || 'You')}</div><div class="cb-role">${esc(tabName(tab))} tab</div></div></div>
    <textarea id="cb-text" maxlength="4000" placeholder="What's happening here? Explain the spike, dip or campaign moment…"></textarea>
    <div class="cb-row"><button type="button" class="cb-ghost" id="cb-rec">● Record</button><span class="cb-time" id="cb-time"></span>
      <button type="button" class="cb-ghost" id="cb-cancel">Cancel</button><button type="button" class="cb-save" id="cb-save">Pin insight</button></div><div id="cb-prev"></div>`;
  p.classList.add('show'); popAt(x, y); $('#cb-text').focus();
  const cancel = () => { stopRec(); blob = null; popClose(); };
  p.querySelector('.cb-x').onclick = cancel; $('#cb-cancel').onclick = cancel;
  $('#cb-rec').onclick = e => startRec(e.currentTarget, '#cb-time', '#cb-prev');
  $('#cb-save').onclick = () => savePin(tab, xf, yf);
}
async function savePin(tab, xf, yf){
  const btn = $('#cb-save'), t = $('#cb-time'); btn.disabled = true; btn.textContent = 'Saving…';
  stopRec(); await new Promise(r => setTimeout(r, 250));
  const body = ($('#cb-text').value || '').trim();
  if (!body && !blob){ btn.disabled = false; btn.textContent = 'Pin insight'; t.textContent = 'Add a note or a recording'; return; }
  let path = null;
  try {
    path = await uploadBlob('ins/');
    const { error } = await sb.rpc('pa_insights_add', { p_slug: SLUG, p_tab: tab, p_target_id: 'pn-' + tab, p_x: xf, p_y: yf, p_body: body || null, p_audio_path: path });
    if (error) throw error;
    blob = null; setPinMode(false); popClose(); await loadPins();
  } catch (err) { console.warn('collab pin', err && err.message); if (path) await sb.storage.from(BUCKET).remove([path]);
    btn.disabled = false; btn.textContent = 'Pin insight'; t.textContent = 'Could not save, please try again'; }
}
async function deletePin(o){
  if (!confirm('Delete this insight?')) return;
  const { data, error } = await sb.rpc('pa_insights_delete', { p_id: o.id });
  if (error){ alert('Could not delete: ' + error.message); return; }
  if (data) await sb.storage.from(BUCKET).remove([data]);
  popClose(); await loadPins();
}
function walk(tab){ if (curTab() !== tab) return; const list = PINS.items.filter(o => o.tab === tab); if (!list.length) return; WT = { list, i: 0 }; step(0); }
function step(d){
  if (!WT) return; const n = WT.list.length, i = WT.i + d;
  if (i >= n || i < 0){ popClose(); return; }
  WT.i = i; const o = WT.list[i], b = document.querySelector(`.cb-pin[data-id="${o.id}"]`);
  if (b) b.scrollIntoView({ block: 'center', behavior: 'smooth' });
  setTimeout(() => { const r = b ? b.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2 }; const keep = WT; show(o, r.left, r.top, { i, n }); WT = keep; }, b ? 450 : 0);
}

/* ---------------------------------------------------------------- wiring */
function chrome(){
  if (!$('#cb-pop')){ const p = document.createElement('div'); p.id = 'cb-pop'; document.body.appendChild(p); }
  if (!$('#cb-hint')){ const h = document.createElement('div'); h.id = 'cb-hint'; h.textContent = 'Click anywhere on this tab to pin an insight. Esc to cancel.'; document.body.appendChild(h); }
  if (!$('#cb-add')){ const b = document.createElement('button'); b.id = 'cb-add'; b.type = 'button'; b.innerHTML = '✎ Add insight';
    b.onclick = e => { e.stopPropagation(); setPinMode(!PINMODE); }; document.body.appendChild(b); }
}
document.addEventListener('click', e => {
  if (!PINMODE) return;
  const pn = $('#pn-' + curTab()); if (!pn || !pn.contains(e.target)) return;
  if (e.target.closest('#cb-pop,#cb-add,.cb-pin,.cb-panel,button,a,input,textarea,select,label')) return;
  e.preventDefault(); e.stopPropagation();
  const r = pn.getBoundingClientRect();
  compose(curTab(), Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1), Math.min(Math.max((e.clientY - r.top) / r.height, 0), 1), e.clientX, e.clientY);
}, true);
document.addEventListener('click', e => { const p = $('#cb-pop'); if (p && p.classList.contains('show') && !PINMODE && !WT && !p.contains(e.target) && !e.target.closest('.cb-pin')) popClose(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape'){ if (PINMODE) setPinMode(false); popClose(); } });
addEventListener('resize', () => { clearTimeout(window._cbRz); window._cbRz = setTimeout(paintPins, 200); });

let started = false;
function start(){
  if (started) return; started = true;
  /* The page's own tab buttons (and its "go to" links) switch tabs through showTab(). When one of its tabs
     becomes selected, close ours and move the pins to that tab. */
  const mo = new MutationObserver(() => {
    if (OPEN && ENGINE_TABS.some(k => $('#tb-' + k)?.getAttribute('aria-selected') === 'true')) closeUpdates();
    popClose(); setPinMode(false);
    clearTimeout(window._cbT); window._cbT = setTimeout(paintPins, 60);
  });
  ENGINE_TABS.forEach(k => { const b = $('#tb-' + k); if (b) mo.observe(b, { attributes: true, attributeFilter: ['aria-selected'] }); });
  /* Charts and tables fill in after load, so a panel's height changes; keep the pins on their spots. */
  if (window.ResizeObserver){ const ro = new ResizeObserver(() => { clearTimeout(window._cbR); window._cbR = setTimeout(paintPins, 120); });
    ENGINE_TABS.forEach(k => { const p = $('#pn-' + k); if (p) ro.observe(p); }); }
  chrome(); loadPins();
}
(async () => {
  const go = s => { if (!s) return; ME.email = s.user.email || ''; ME.team = /@readytorank\.com\.au$/i.test(ME.email);
    /* wait until the page has signed in and shown the app */
    const app = $('#app');
    if (app && !app.hidden) return start();
    const w = new MutationObserver(() => { if (app && !app.hidden){ w.disconnect(); start(); } });
    if (app) w.observe(app, { attributes: true, attributeFilter: ['hidden'] });
  };
  const { data } = await sb.auth.getSession();
  if (data && data.session) go(data.session);
  else sb.auth.onAuthStateChange((ev, s) => { if (s) go(s); });
})();
