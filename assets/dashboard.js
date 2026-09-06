/* Marketing Dashboard — shared engine, built to the Cobalt Constructions frame.
   Identical for every client; everything client-specific arrives in
   window.DASHBOARD_CONFIG from the per-client shell.

   Pipeline (Cobalt's, deliberately):
     checkSession() -> boot() -> loadData() -> applyMonth() -> renderAll()

   MONTH ("YYYY-MM") is the ONLY scope control. No rolling windows, no day counts.
   Every render function reads the arrays applyMonth() rebuilds, so each one is
   month-agnostic and nothing renders itself out of band.

   Security: Supabase Auth + RLS scoped to `authenticated`. Never StatiCrypt over a
   page holding a publishable key — the key is fine, the RLS policy is the protection.
*/
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CFG = window.DASHBOARD_CONFIG;
const sb  = createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
const $   = (s, r = document) => r.querySelector(s);
const $$  = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------------------------------------------------------------- modules */
const ORDER  = ['overview','seo','map_grid','gbp','geo','paid_ads','social','leads_crm'];
const LABEL  = { overview:'Overview', seo:'SEO', map_grid:'Map Pack Grid', gbp:'Google Business Profile',
                 geo:'AI Visibility', paid_ads:'Paid Ads', social:'Social', leads_crm:'Leads & CRM' };
/* Plain-English package names for the upsell modal — never a module key. */
const SOLD_AS = { seo:'SEO reporting', map_grid:'Map pack grid tracking', gbp:'Google Business Profile reporting',
                  geo:'AI visibility tracking', paid_ads:'Paid advertising management',
                  social:'Organic social management', leads_crm:'Leads and CRM reporting' };

const state = { role:null, tab:'overview', month:null, months:[] };
let RAW = {}, V = {};

/* ---------------------------------------------------------------- helpers */
const num = n => (n == null || Number.isNaN(n)) ? null : n;
const fmt = (n, d = 0) => n == null ? '—' : Number(n).toLocaleString('en-AU',
  { minimumFractionDigits:d, maximumFractionDigits:d });
const money = n => n == null ? '—' : '$' + fmt(n, 0);
const pct1  = n => n == null ? '—' : fmt(n, 1) + '%';
/* Local date parts, never toISOString() — an early-morning AEST load slips a UTC day. */
const ymd   = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const monthOf = s => String(s).slice(0, 7);
const monthName = m => new Date(m + '-01T00:00:00').toLocaleDateString('en-AU',
  { month:'long', year:'numeric' });
const sum = (a, k) => a.reduce((t, r) => t + (Number(r[k]) || 0), 0);
const avg = (a, k) => { const v = a.map(r => Number(r[k])).filter(n => !Number.isNaN(n) && n !== 0);
  return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };

function delta(cur, prev){
  if (cur == null || prev == null || prev === 0) return { cls:'flat', txt:'—' };
  const p = ((cur - prev) / Math.abs(prev)) * 100;
  return { cls: p > 0.5 ? 'up' : p < -0.5 ? 'dn' : 'flat',
           txt: (p > 0 ? '+' : '') + fmt(p, 1) + '%' };
}
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

/* ---------------------------------------------------------------- charts */
/* Hand-rolled SVG, no library. Must render while the section is visible — SVG needs a
   real measured width — so charts re-run on tab change and on a debounced resize. */
function lineChart(mount, { series, yfmt = fmt, invert = false, area = true }){
  const W = Math.max(mount.clientWidth || 600, 260), H = 190, P = { t:12, r:12, b:24, l:42 };
  const all = series.flatMap(s => s.data).filter(v => v != null);
  if (!all.length) { mount.innerHTML = '<div class="empty">No data for this month yet.</div>'; return; }
  let lo = Math.min(...all), hi = Math.max(...all);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const n = Math.max(...series.map(s => s.data.length));
  const X = i => P.l + (i / Math.max(n - 1, 1)) * (W - P.l - P.r);
  const Y = v => { const t = (v - lo) / (hi - lo); return P.t + (invert ? t : 1 - t) * (H - P.t - P.b); };
  let g = '';
  for (let i = 0; i <= 4; i++){
    const y = P.t + (i / 4) * (H - P.t - P.b), val = invert ? lo + (i/4)*(hi-lo) : hi - (i/4)*(hi-lo);
    g += `<line x1="${P.l}" y1="${y}" x2="${W-P.r}" y2="${y}" stroke="var(--bd)" stroke-width="1"/>
          <text x="${P.l-8}" y="${y+3.5}" text-anchor="end" font-family="Space Mono" font-size="9" fill="var(--ink3)">${yfmt(val)}</text>`;
  }
  let paths = '';
  series.forEach(s => {
    const pts = s.data.map((v, i) => v == null ? null : `${X(i)},${Y(v)}`).filter(Boolean);
    if (!pts.length) return;
    if (area) paths += `<path d="M${pts.join(' L')} L${X(s.data.length-1)},${H-P.b} L${X(0)},${H-P.b} Z" fill="${s.color}" opacity=".10"/>`;
    paths += `<path d="M${pts.join(' L')}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  mount.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${g}${paths}</svg>`;
}

function sparkline(vals, colour){
  const W = 200, H = 40, v = vals.filter(x => x != null);
  if (v.length < 2) return '<svg viewBox="0 0 200 40"></svg>';
  const lo = Math.min(...v), hi = Math.max(...v), r = (hi - lo) || 1;
  const pts = vals.map((x, i) => x == null ? null :
    `${(i/(vals.length-1))*W},${H - ((x-lo)/r)*(H-6) - 3}`).filter(Boolean);
  return `<svg viewBox="0 0 ${W} ${H}"><path d="M${pts.join(' L')}" fill="none" stroke="${colour}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/* ---------------------------------------------------------------- data */
async function loadData(){
  const id = RAW.client.id;
  const since = new Date(); since.setMonth(since.getMonth() - 13);
  const from = ymd(since);
  const q = (t, dateCol) => { let b = sb.from(t).select('*').eq('client_id', id);
    if (dateCol) b = b.gte(dateCol, from); return b; };

  const [seo, gbp, rev, geo, paid, social, leads, ranks, scans, refresh] = await Promise.all([
    q('md_seo_daily','date'), q('md_gbp_daily','date'), q('md_gbp_reviews'), q('md_geo_visibility'),
    q('md_paid_daily','date'), q('md_social_daily','date'), q('md_leads_daily','date'),
    q('md_rankings'), q('md_mapgrid_scans'), q('md_refresh_log'),
  ]);
  RAW.seo = seo.data || []; RAW.gbp = gbp.data || []; RAW.reviews = rev.data || [];
  RAW.geo = geo.data || []; RAW.paid = paid.data || []; RAW.social = social.data || [];
  RAW.leads = leads.data || []; RAW.rankings = ranks.data || [];
  RAW.scans = scans.data || []; RAW.refresh = refresh.data || [];

  if (RAW.scans.length){
    const ids = RAW.scans.map(s => s.id);
    const { data } = await sb.from('md_mapgrid_points').select('*').in('scan_id', ids);
    RAW.points = data || [];
  } else RAW.points = [];

  /* Month list comes from every dated source, so a client with only one live module
     still gets chips. Never derive it from a single table. */
  const set = new Set();
  [['seo','date'],['gbp','date'],['paid','date'],['social','date'],['leads','date'],
   ['rankings','checked_at'],['scans','checked_at'],['geo','checked_at']]
    .forEach(([k, c]) => (RAW[k] || []).forEach(r => r[c] && set.add(monthOf(r[c]))));
  state.months = [...set].sort();
  if (!state.months.length) state.months = [monthOf(ymd(new Date()))];
  state.month = state.months[state.months.length - 1];
}

/* applyMonth() — the heart of it. Rebuild every view array for the selected month.
   Order matters: filter -> arrays -> aggregates. */
function applyMonth(){
  const m = state.month, inM = (r, c) => r[c] && monthOf(r[c]) === m;
  const prevM = state.months[state.months.indexOf(m) - 1] || null;
  const inP = (r, c) => prevM && r[c] && monthOf(r[c]) === prevM;

  V = {};
  V.seo    = RAW.seo.filter(r => inM(r,'date'));
  V.seoPrev= RAW.seo.filter(r => inP(r,'date'));
  V.gbp    = RAW.gbp.filter(r => inM(r,'date'));
  V.gbpPrev= RAW.gbp.filter(r => inP(r,'date'));
  V.paid   = RAW.paid.filter(r => inM(r,'date'));
  V.social = RAW.social.filter(r => inM(r,'date'));
  V.leads  = RAW.leads.filter(r => inM(r,'date'));
  V.geo    = RAW.geo.filter(r => inM(r,'checked_at'));

  /* Rankings and scans are snapshots: take the latest ON OR BEFORE the selected month,
     so a month with no scan shows the standing position rather than going blank. */
  const upto = (arr, c) => arr.filter(r => r[c] && monthOf(r[c]) <= m)
    .sort((a,b) => String(a[c]).localeCompare(String(b[c])));
  const rk = upto(RAW.rankings,'checked_at');
  V.rankAsOf = rk.length ? monthOf(rk[rk.length-1].checked_at) : null;
  V.rankings = V.rankAsOf ? rk.filter(r => monthOf(r.checked_at) === V.rankAsOf) : [];
  const sc = upto(RAW.scans,'checked_at');
  V.scanAsOf = sc.length ? monthOf(sc[sc.length-1].checked_at) : null;
  V.scans = V.scanAsOf ? sc.filter(r => monthOf(r.checked_at) === V.scanAsOf) : [];
  /* Reviews are a running total, not a series — latest reading on or before the month. */
  const rv = upto(RAW.reviews,'as_of');
  V.reviews = rv.length ? rv[rv.length-1] : null;

  const days = [...new Set(V.seo.map(r => r.date))].sort();
  V.dates = days;
  V.clicks      = days.map(d => sum(V.seo.filter(r => r.date === d), 'clicks'));
  V.impressions = days.map(d => sum(V.seo.filter(r => r.date === d), 'impressions'));
  V.sessions    = days.map(d => sum(V.seo.filter(r => r.date === d), 'sessions'));
  V.position    = days.map(d => avg(V.seo.filter(r => r.date === d), 'avg_position'));

  V.agg = {
    clicks: sum(V.seo,'clicks'), impressions: sum(V.seo,'impressions'),
    sessions: sum(V.seo,'sessions'), conversions: sum(V.seo,'conversions'),
    position: avg(V.seo,'avg_position'),
    calls: sum(V.gbp,'calls'), directions: sum(V.gbp,'direction_requests'),
    gbpClicks: sum(V.gbp,'website_clicks'),
    spend: sum(V.paid,'spend'), leads: sum(V.leads,'count'),
  };
  V.aggPrev = {
    clicks: sum(V.seoPrev,'clicks'), impressions: sum(V.seoPrev,'impressions'),
    sessions: sum(V.seoPrev,'sessions'), position: avg(V.seoPrev,'avg_position'),
    calls: sum(V.gbpPrev,'calls'), directions: sum(V.gbpPrev,'direction_requests'),
  };
  V.prevMonth = prevM;
}

/* ---------------------------------------------------------------- render */
const enabled = m => m === 'overview' || !!CFG.modules[m]?.enabled;
const visible = () => ORDER.filter(m => m === 'overview' || CFG.modules[m]);

function kpi(label, value, foot){
  return `<div class="kpi"><span class="mlbl">${label}</span>
    <div class="v tnum">${value}</div>${foot ? `<div class="fn">${foot}</div>` : ''}</div>`;
}
function chipFor(cur, prev){
  const d = delta(cur, prev);
  return `<span class="chip ${d.cls}">${d.txt}</span>`;
}
/* Callouts are derived from live values. Never hardcode one, and never leave a sentence
   sitting beside a number it no longer describes. */
function callout(sev, title, body){
  return `<div class="callout ${sev}"><h4>${title}<span class="sig ${sev}">${
    sev === 'bad' ? 'Action' : sev === 'warn' ? 'Watch' : 'Good'}</span></h4><p>${body}</p></div>`;
}
function emptyState(title, body){
  return `<div class="empty"><b>${title}</b>${body}</div>`;
}

function renderMonthChips(){
  const bar = $('#monthchips');
  bar.innerHTML = state.months.map(m => {
    const label = new Date(m + '-01T00:00:00').toLocaleDateString('en-AU', { month:'short', year:'2-digit' });
    return `<button class="mchip" data-m="${m}" aria-pressed="${m === state.month}">${label}</button>`;
  }).join('');
}

function renderTabs(){
  const bar = $('#tabs');
  bar.innerHTML = visible().map(m => {
    const lock = !enabled(m);
    return `<button class="tab${lock ? ' locked' : ''}" data-tab="${m}" role="tab"
      aria-selected="${state.tab === m}">${LABEL[m]}</button>`;
  }).join('');
}

/* A module the client has not bought stays VISIBLE and explains itself when clicked.
   Jose 06/09/2026 — deliberately different from Cobalt, which deletes unsold sections.
   The point is the upsell. Keyed off `enabled:false` ONLY: an enabled module with no
   data yet gets an empty state instead, so a client never reads "not in your package"
   about something they are paying for. */
function showLock(mod){
  const box = el(`<div class="lockwrap" role="dialog" aria-modal="true">
    <div class="lockbox">
      <div class="ico"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 10V7a6 6 0 1112 0v3h1a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8a2 2 0 012-2h1zm2 0h8V7a4 4 0 10-8 0v3z"/></svg></div>
      <span class="mlbl">Not in your current plan</span>
      <h3>${LABEL[mod]}</h3>
      <p>${SOLD_AS[mod] || LABEL[mod]} isn't part of your current package, so there's no
         data to show here. If you'd like it added, have a word with your account manager.</p>
      <button class="btn primary" data-close>Got it</button>
    </div></div>`);
  box.addEventListener('click', e => { if (e.target === box || e.target.hasAttribute('data-close')) box.remove(); });
  document.addEventListener('keydown', function esc(e){
    if (e.key === 'Escape'){ box.remove(); document.removeEventListener('keydown', esc); } });
  document.body.appendChild(box);
}

function renderAll(){
  renderMonthChips(); renderTabs();
  const host = $('#panel');
  host.innerHTML = ({
    overview: viewOverview, seo: viewSeo, map_grid: viewMapGrid, gbp: viewGbp,
    geo: viewGeo, paid_ads: viewPaid, social: viewSocial, leads_crm: viewLeads,
  }[state.tab] || (() => emptyState('Unknown tab', 'Nothing to render.')))();
  $('#monthlabel').textContent = monthName(state.month);
  drawCharts();
  $('#stamp').textContent = RAW.refresh?.length
    ? 'Data as at ' + new Date(RAW.refresh.map(r => r.finished_at).filter(Boolean).sort().pop() || Date.now())
        .toLocaleDateString('en-AU')
    : 'No refresh recorded yet';
}

/* Charts render after innerHTML so their mounts have a measured width. */
function drawCharts(){
  $$('[data-chart]').forEach(m => {
    const spec = JSON.parse(m.dataset.chart);
    lineChart(m, { series: spec.series, invert: !!spec.invert,
      yfmt: spec.yfmt === 'pos' ? (v => fmt(v,1)) : fmt });
  });
}

/* ---------------------------------------------------------------- views */
function head(eyebrow, h2, sub){
  return `<p class="eyebrow">${eyebrow}</p><h2 class="h2">${h2}</h2><p class="sub">${sub}</p>`;
}

function viewOverview(){
  const a = V.agg, p = V.aggPrev, on = m => enabled(m);
  let out = head('Overview', `${monthName(state.month)}`,
    `Everything ${CFG.name} is being measured on this month. Change the month above to rescope the whole dashboard.`);

  const cards = [];
  if (on('seo')) cards.push(
    kpi('Clicks', fmt(a.clicks), `${chipFor(a.clicks, p.clicks)} vs ${V.prevMonth ? monthName(V.prevMonth) : 'no prior month'}`),
    kpi('Impressions', fmt(a.impressions), chipFor(a.impressions, p.impressions)),
    kpi('Avg position', a.position ? fmt(a.position,1) : '—', 'Lower is better'));
  if (on('gbp')) cards.push(
    kpi('Calls from profile', fmt(a.calls), chipFor(a.calls, p.calls)),
    kpi('Direction requests', fmt(a.directions), chipFor(a.directions, p.directions)));
  if (on('map_grid') && V.scans.length){
    const best = V.scans.reduce((b, s) => (s.avg_rank != null && (b == null || s.avg_rank < b.avg_rank)) ? s : b, null);
    cards.push(kpi('Map pack, best term', best?.avg_rank != null ? fmt(best.avg_rank,1) : 'Not ranking',
      best ? best.keyword : ''));
  }
  if (on('paid_ads')) cards.push(kpi('Ad spend', money(a.spend)));
  if (on('leads_crm')) cards.push(kpi('Leads', fmt(a.leads)));
  out += cards.length ? `<div class="kpis">${cards.join('')}</div>`
                      : emptyState('Nothing to report yet', 'No data has landed for this month.');

  /* Derived commentary — every sentence switches on a live value. */
  const notes = [];
  if (on('seo') && !V.seo.length)
    notes.push(callout('warn','Search data starts at launch',
      `There is no Search Console or Analytics data for ${monthName(state.month)} because the website is not live yet. This fills in from the first day the site is published.`));
  if (on('gbp') && !V.gbp.length)
    notes.push(callout('warn','Google Business Profile not connected',
      'We do not have access to the profile yet, so calls and direction requests cannot be reported. Granting access is the single thing that unblocks this tab.'));
  if (on('map_grid') && V.scans.length){
    const found = sum(V.scans,'found_points'), total = sum(V.scans,'total_points');
    notes.push(found === 0
      ? callout('bad','Not yet visible in the map pack',
          `Across ${fmt(total)} measured points and ${V.scans.length} keyword${V.scans.length>1?'s':''}, the profile does not appear in the top results anywhere. That is the honest starting line and the number this work moves first.`)
      : callout(found/total > .35 ? 'good' : 'warn','Map pack visibility',
          `Ranking at ${fmt(found)} of ${fmt(total)} measured points across ${V.scans.length} keyword${V.scans.length>1?'s':''}.`));
  }
  if (on('gbp') && V.reviews && V.reviews.review_count === 0)
    notes.push(callout('warn','No Google reviews yet',
      'Reviews are the strongest signal for map pack position and the fastest thing to move. Every completed job is an opportunity to ask.'));
  out += notes.join('');

  /* Month on month, off the long series and independent of the selected month. */
  if (on('seo') || on('gbp')){
    const mom = [];
    const series = (rows, dateCol, key, agg) => state.months.slice(-6).map(m => {
      const r = rows.filter(x => x[dateCol] && monthOf(x[dateCol]) === m);
      return r.length ? (agg === 'avg' ? avg(r, key) : sum(r, key)) : null; });
    if (on('seo')) mom.push(momCard('Clicks', a.clicks, p.clicks, series(RAW.seo,'date','clicks')));
    if (on('seo')) mom.push(momCard('Sessions', a.sessions, p.sessions, series(RAW.seo,'date','sessions')));
    if (on('gbp')) mom.push(momCard('Calls', a.calls, p.calls, series(RAW.gbp,'date','calls')));
    if (mom.filter(Boolean).length)
      out += `<p class="eyebrow" style="margin-top:26px">Month on month</p><div class="momgrid">${mom.join('')}</div>`;
  }
  return out;
}

function momCard(label, cur, prev, vals){
  return `<div class="momcard"><span class="mlbl">${label}</span>
    <div class="v tnum">${fmt(cur)} ${chipFor(cur, prev)}</div>
    <div class="cap">vs ${V.prevMonth ? monthName(V.prevMonth) : 'no prior month'}</div>
    ${sparkline(vals, 'var(--accent)')}</div>`;
}

function viewSeo(){
  let out = head('SEO', 'Search performance',
    'Clicks, impressions and average position from Google Search Console, with the keywords we track.');
  if (!V.seo.length && !V.rankings.length)
    return out + emptyState('Nothing to report for this month',
      `${CFG.name}'s website is not live yet, so there is no search data. Tracking starts the day it publishes.`);
  const a = V.agg, p = V.aggPrev;
  out += `<div class="kpis">
    ${kpi('Clicks', fmt(a.clicks), chipFor(a.clicks, p.clicks))}
    ${kpi('Impressions', fmt(a.impressions), chipFor(a.impressions, p.impressions))}
    ${kpi('Sessions', fmt(a.sessions), chipFor(a.sessions, p.sessions))}
    ${kpi('Avg position', a.position ? fmt(a.position,1) : '—', 'Lower is better')}</div>`;
  if (V.dates.length) out += `<div class="card"><div class="cardhead">
      <div><h3>Clicks and impressions</h3><p class="sub">Daily, ${monthName(state.month)}</p></div>
      <div class="legend"><span><i style="background:var(--accent)"></i>Clicks</span>
        <span><i style="background:var(--ink3)"></i>Impressions</span></div></div>
    <div data-chart='${JSON.stringify({series:[
      {data:V.clicks, color:'var(--accent)'},{data:V.impressions, color:'var(--ink3)'}]})}'></div></div>`;
  if (V.rankings.length){
    const rows = V.rankings.slice().sort((x,y) => (x.position ?? 999) - (y.position ?? 999)).slice(0, 25);
    out += `<div class="card"><div class="cardhead"><div><h3>Tracked keywords</h3>
      <p class="sub">Positions as at ${monthName(V.rankAsOf)}</p></div></div>
      <div class="tscroll"><table class="tbl"><thead><tr><th>Keyword</th><th>Position</th><th>Previous</th></tr></thead><tbody>
      ${rows.map(r => { const pos = r.position, cls = pos == null ? 'out' : pos <= 3 ? 'win' : pos <= 10 ? 'mid' : 'out';
        return `<tr><td>${r.keyword}</td><td><span class="rankpill ${cls}">${pos ?? '—'}</span></td>
          <td class="tnum">${r.prev_position ?? '—'}</td></tr>`; }).join('')}
      </tbody></table></div></div>`;
  }
  return out;
}

function viewMapGrid(){
  let out = head('Map Pack Grid', 'Where the profile ranks across the service area',
    'A grid of measurement points around the business. One ranking number hides the truth; the grid shows how far the profile’s pull actually reaches.');
  if (!V.scans.length)
    return out + emptyState('No scan yet',
      'The first grid scan runs once the Google Business Profile is verified and we have access.');

  const scans = V.scans.slice().sort((a,b) => (a.avg_rank ?? 999) - (b.avg_rank ?? 999));
  const total = sum(scans,'total_points'), found = sum(scans,'found_points');
  out += `<div class="kpis">
    ${kpi('Keywords scanned', fmt(scans.length))}
    ${kpi('Points ranking', `${fmt(found)} / ${fmt(total)}`, found === 0 ? 'Not yet in the pack' : '')}
    ${kpi('Best average', scans[0]?.avg_rank != null ? fmt(scans[0].avg_rank,1) : '—', scans[0]?.keyword || '')}
    ${kpi('Grid', scans[0] ? `${scans[0].grid_size}×${scans[0].grid_size}` : '—',
        scans[0] ? `${scans[0].spacing_km} km spacing · ${scans[0].centre_label || ''}` : '')}</div>`;

  out += `<div class="card"><div class="cardhead"><div><h3>By keyword</h3>
    <p class="sub">Scanned ${V.scanAsOf ? monthName(V.scanAsOf) : ''}</p></div></div>
    <div class="tscroll"><table class="tbl"><thead><tr>
      <th>Keyword</th><th>Avg position</th><th>Points ranking</th><th>Share of voice</th></tr></thead><tbody>
    ${scans.map(s => `<tr><td>${s.keyword}</td>
      <td>${s.avg_rank != null ? `<span class="rankpill ${s.avg_rank<=3?'win':s.avg_rank<=10?'mid':'out'}">${fmt(s.avg_rank,1)}</span>` : '<span class="rankpill out">Not ranking</span>'}</td>
      <td class="tnum">${fmt(s.found_points)} / ${fmt(s.total_points)}</td>
      <td class="tnum">${s.solv != null ? pct1(s.solv) : '—'}</td></tr>`).join('')}
    </tbody></table></div></div>`;

  /* The grid itself, drawn from md_mapgrid_points — one cell per measured point. */
  const first = scans[0];
  const pts = (RAW.points || []).filter(p => p.scan_id === first.id);
  if (pts.length){
    const n = first.grid_size;
    const cell = r => r == null ? 'var(--s3)' : r <= 3 ? 'var(--good)' : r <= 10 ? 'var(--warn)' : 'var(--bad)';
    out += `<div class="card"><div class="cardhead"><div><h3>Grid — “${first.keyword}”</h3>
      <p class="sub">Each square is a real search from that point on the map</p></div>
      <div class="legend"><span><i style="background:var(--good)"></i>Top 3</span>
        <span><i style="background:var(--warn)"></i>4–10</span>
        <span><i style="background:var(--bad)"></i>11+</span>
        <span><i style="background:var(--s3)"></i>Not found</span></div></div>
      <div style="display:grid;grid-template-columns:repeat(${n},1fr);gap:5px;max-width:${n*46}px">
      ${Array.from({length:n*n}, (_, i) => { const p = pts.find(x => x.idx === i) || {};
        return `<div title="${p.rank != null ? 'Position ' + p.rank : 'Not in the top results here'}"
          style="aspect-ratio:1;border-radius:6px;background:${cell(p.rank)};opacity:${p.rank==null?.45:1};
          display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:10px;color:#06212e;font-weight:700">${p.rank ?? ''}</div>`;
      }).join('')}</div></div>`;
  }
  return out;
}

function viewGbp(){
  let out = head('Google Business Profile', 'Calls, directions and reviews',
    'What the profile actually produces — and the review position against the businesses holding the map pack.');
  if (!V.gbp.length && !V.reviews)
    return out + emptyState('No profile data yet',
      'We do not have access to the Google Business Profile. Once access is granted this fills in from the first day.');
  const a = V.agg, p = V.aggPrev;
  out += `<div class="kpis">
    ${kpi('Calls', fmt(a.calls), chipFor(a.calls, p.calls))}
    ${kpi('Direction requests', fmt(a.directions), chipFor(a.directions, p.directions))}
    ${kpi('Website clicks', fmt(a.gbpClicks))}
    ${kpi('Reviews', V.reviews ? fmt(V.reviews.review_count) : '—',
        V.reviews?.avg_rating ? fmt(V.reviews.avg_rating,1) + ' average' : '')}</div>`;
  if (V.gbp.length){
    const days = [...new Set(V.gbp.map(r => r.date))].sort();
    out += `<div class="card"><div class="cardhead"><div><h3>Calls and direction requests</h3>
      <p class="sub">Daily, ${monthName(state.month)}</p></div>
      <div class="legend"><span><i style="background:var(--accent)"></i>Calls</span>
        <span><i style="background:var(--ink3)"></i>Directions</span></div></div>
      <div data-chart='${JSON.stringify({series:[
        {data:days.map(d => sum(V.gbp.filter(r=>r.date===d),'calls')), color:'var(--accent)'},
        {data:days.map(d => sum(V.gbp.filter(r=>r.date===d),'direction_requests')), color:'var(--ink3)'}]})}'></div></div>`;
  }
  return out;
}

function viewGeo(){
  let out = head('AI Visibility', 'Being named in AI answers',
    'Whether the business gets recommended when someone asks an AI assistant, rather than typing a search.');
  if (!V.geo.length)
    return out + emptyState('Baseline not captured yet',
      'AI visibility tracking starts alongside the first month of content.');
  const named = V.geo.filter(r => r.result && /found|named|cited|yes/i.test(r.result)).length;
  out += `<div class="kpis">
    ${kpi('Prompts checked', fmt(V.geo.length))}
    ${kpi('Named in answer', fmt(named), V.geo.length ? pct1(named / V.geo.length * 100) + ' of prompts' : '')}</div>
    <div class="card"><div class="cardhead"><div><h3>Prompts</h3></div></div>
    <div class="tscroll"><table class="tbl"><thead><tr><th>Prompt</th><th>Engine</th><th>Result</th></tr></thead><tbody>
    ${V.geo.map(r => `<tr><td>${r.prompt || '—'}</td><td>${r.engine || '—'}</td><td>${r.result || '—'}</td></tr>`).join('')}
    </tbody></table></div></div>`;
  return out;
}

function viewPaid(){
  let out = head('Paid Ads', 'Advertising performance', 'Spend, clicks and leads by platform.');
  if (!V.paid.length) return out + emptyState('No ad data for this month', 'Nothing has been spent in this period.');
  out += `<div class="kpis">
    ${kpi('Spend', money(V.agg.spend))}
    ${kpi('Clicks', fmt(sum(V.paid,'clicks')))}
    ${kpi('Leads', fmt(sum(V.paid,'leads')))}
    ${kpi('Cost per lead', sum(V.paid,'leads') ? money(V.agg.spend / sum(V.paid,'leads')) : '—')}</div>`;
  return out;
}

function viewSocial(){
  let out = head('Social', 'Organic social', 'Reach, engagement and follower growth by platform.');
  if (!V.social.length) return out + emptyState('No social data for this month', 'Nothing recorded in this period.');
  const plats = [...new Set(V.social.map(r => r.platform))];
  out += `<div class="kpis">${plats.map(p => { const rows = V.social.filter(r => r.platform === p);
    const latest = rows.slice().sort((a,b) => String(a.date).localeCompare(String(b.date))).pop();
    return kpi(p, fmt(latest?.followers), 'followers, current'); }).join('')}</div>`;
  return out;
}

function viewLeads(){
  let out = head('Leads & CRM', 'Enquiries', 'Where enquiries came from this month.');
  if (!V.leads.length) return out + emptyState('No leads recorded', 'Nothing has come through in this period.');
  const bySrc = {}; V.leads.forEach(r => bySrc[r.source || 'Unknown'] = (bySrc[r.source||'Unknown']||0) + Number(r.count||0));
  out += `<div class="kpis">${Object.entries(bySrc).map(([s,n]) => kpi(s, fmt(n))).join('')}</div>`;
  return out;
}

/* ---------------------------------------------------------------- shell + boot */
function renderShell(){
  document.documentElement.style.setProperty('--accent', CFG.accent || '#17B4F0');
  document.title = `${CFG.name} — Marketing Dashboard`;
  document.body.innerHTML = `
  <header class="top"><div class="wrap topin">
    ${CFG.logo ? `<img class="logo" src="../../assets/${CFG.logo}" alt="${CFG.name}">` : ''}
    <span class="name">${CFG.name}</span>
    <span class="spacer"></span>
    <span class="stamp" id="stamp"></span>
    <button class="btn" id="signout">Sign out</button>
  </div></header>
  <div class="team"><div class="wrap teamin">
    <span class="mlbl">Delivered by</span><span style="font-weight:700;font-size:13px">Ready to Rank</span>
    <span class="spacer"></span><span class="mlbl" id="monthlabel"></span>
  </div></div>
  <nav class="tabs"><div class="wrap tabsin" id="tabs" role="tablist"></div></nav>
  <div class="monthbar"><div class="wrap monthin" id="monthchips"></div></div>
  <main><div class="wrap" id="panel"></div></main>
  <footer class="foot"><div class="wrap footin">
    <span>${CFG.name} · prepared by Ready to Rank</span>
    <span>Sources: SE Ranking · Google Search Console · GA4 · Google Business Profile</span>
  </div></footer>`;

  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab'); if (!b) return;
    const m = b.dataset.tab;
    if (!enabled(m)) return showLock(m);      /* locked = upsell, not an error */
    state.tab = m; history.replaceState(null, '', '#' + m); renderAll();
  });
  $('#monthchips').addEventListener('click', e => {
    const b = e.target.closest('.mchip'); if (!b) return;
    state.month = b.dataset.m; applyMonth(); renderAll();
  });
  $('#signout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });

  let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(drawCharts, 180); });
}

function renderGate(msg){
  document.documentElement.style.setProperty('--accent', CFG.accent || '#17B4F0');
  document.body.innerHTML = `<div class="gate"><form class="gate-card" id="gf">
    <h1>${CFG.name}</h1><p>Marketing dashboard — sign in to continue.</p>
    <input type="email" id="email" placeholder="Email" autocomplete="username" required>
    <input type="password" id="password" placeholder="Password" autocomplete="current-password" required>
    <button type="submit">Sign in</button>
    <div class="gate-err">${msg || ''}</div></form></div>`;
  $('#gf').addEventListener('submit', async e => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword({
      email: $('#email').value.trim(), password: $('#password').value });
    if (error) return $('.gate-err').textContent = error.message;
    start();
  });
}

async function start(){
  const { data: client } = await sb.from('md_clients').select('*').eq('slug', CFG.slug).single();
  if (!client) return renderGate('This account cannot see this dashboard.');
  RAW.client = client;
  const { data: access } = await sb.from('md_client_access').select('role, modules')
    .eq('client_id', client.id).maybeSingle();
  state.role = access?.role || 'viewer';

  await loadData();
  applyMonth();
  renderShell();
  const h = (location.hash || '').replace('#','');
  if (h && visible().includes(h) && enabled(h)) state.tab = h;
  renderAll();
}

(async function main(){
  const { data } = await sb.auth.getSession();
  if (data?.session) { try { await start(); } catch (e) { console.error(e); renderGate('Could not load this dashboard — check the console.'); } }
  else renderGate();
})();
