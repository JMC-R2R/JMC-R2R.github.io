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
/* One client, one URL: the content hub. The dashboard lives inside it (hub #reporting tab,
   in an iframe). Opened directly, it forwards to the hub, keeping any section deep link
   (e.g. /<slug>/#negatives -> /<slug>-hub/#reporting/negatives). Same origin and same
   Supabase project, so the hub's sign-in session is this page's session too. */
const EMBED = window.self !== window.top;
/* Inside the hub the frame is as tall as the whole dashboard and the HUB scrolls, so
   "fixed" means the middle of a very tall frame. Overlays are pinned to the part of the
   frame that is actually on screen instead. */
function onScreen(){
  try { const r = window.frameElement.getBoundingClientRect();
        return { top: Math.max(0, -r.top), height: window.parent.innerHeight }; }
  catch (e) { return null; }
}
if (!EMBED && CFG.hubUrl && !/[?&]direct=1/.test(location.search)) {
  const sub = (location.hash || '').replace(/^#/, '');
  location.replace(CFG.hubUrl + '#reporting' + (sub ? '/' + sub : ''));
}
const sb  = createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
const $   = (s, r = document) => r.querySelector(s);
const $$  = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------------------------------------------------------------- modules */
const ORDER  = ['overview','seo','map_grid','gbp','geo','paid_ads','negatives','social','leads_crm'];
const LABEL  = { overview:'Overview', seo:'SEO', map_grid:'Map Pack Grid', gbp:'Google Business Profile',
                 geo:'AI Visibility', paid_ads:'Paid Ads', negatives:'Negative Keywords', social:'Social', leads_crm:'Leads & CRM' };
/* Plain-English package names for the upsell modal — never a module key. */
const SOLD_AS = { seo:'SEO reporting', map_grid:'Map pack grid tracking', gbp:'Google Business Profile reporting',
                  geo:'AI visibility tracking', paid_ads:'Paid advertising management', negatives:'Paid advertising management',
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
  /* PostgREST caps a response at 1,000 rows, silently. Page anything that can exceed it
     (a busy account's search terms do) or the table under-reports with no error. */
  const qAll = async (t, dateCol) => { let out = [], i = 0;
    for (;;) { const { data, error } = await q(t, dateCol).range(i, i + 999);
      if (error || !data) return { data: out, error }; out = out.concat(data);
      if (data.length < 1000) return { data: out }; i += 1000; } };

  const [seo, gbp, rev, geo, paid, social, leads, ranks, scans, refresh,
         pcm, pst, pkw, pseg, pconv, gshare, neg, sq, gkw, grl, wlog] = await Promise.all([
    q('md_seo_daily','date'), q('md_gbp_daily','date'), q('md_gbp_reviews'), q('md_geo_visibility'),
    q('md_paid_daily','date'), q('md_social_daily','date'), q('md_leads_daily','date'),
    qAll('md_rankings'), q('md_mapgrid_scans'), q('md_refresh_log'),
    /* Google Ads detail — monthly tables. A client without them just gets empty arrays. */
    q('md_paid_campaign_month','month'), qAll('md_paid_search_terms','month'), qAll('md_paid_keywords','month'),
    qAll('md_paid_segments','month'), q('md_paid_conversions','month'), qAll('md_geo_share'),
    qAll('md_negative_requests'), qAll('md_seo_queries','month'), qAll('md_gbp_search_keywords','month'), qAll('md_gbp_review_list'), qAll('md_work_log','month'),
  ]);
  RAW.seo = seo.data || []; RAW.gbp = gbp.data || []; RAW.reviews = rev.data || [];
  RAW.geo = geo.data || []; RAW.paid = paid.data || []; RAW.social = social.data || [];
  RAW.leads = leads.data || []; RAW.rankings = ranks.data || [];
  RAW.scans = scans.data || []; RAW.refresh = refresh.data || [];
  RAW.pcm = pcm.data || []; RAW.pst = pst.data || []; RAW.pkw = pkw.data || [];
  RAW.pseg = pseg.data || []; RAW.pconv = pconv.data || []; RAW.gshare = gshare.data || []; RAW.neg = neg.data || []; RAW.sq = sq.data || []; RAW.gkw = gkw.data || []; RAW.grl = grl.data || []; RAW.wlog = wlog.data || [];

  if (RAW.scans.length){
    const ids = RAW.scans.map(s => s.id);
    RAW.points = [];
    for (let i = 0; ; i += 1000) {
      const { data } = await sb.from('md_mapgrid_points').select('*').in('scan_id', ids).range(i, i + 999);
      RAW.points = RAW.points.concat(data || []);
      if (!data || data.length < 1000) break;
    }
  } else RAW.points = [];

  /* Month list comes from every dated source, so a client with only one live module
     still gets chips. Never derive it from a single table. */
  const set = new Set();
  [['seo','date'],['gbp','date'],['paid','date'],['social','date'],['leads','date'],
   ['rankings','checked_at'],['scans','checked_at'],['geo','checked_at'],['pcm','month']]
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
  V.paidPrev = RAW.paid.filter(r => inP(r,'date'));
  V.pcm  = RAW.pcm.filter(r => inM(r,'month'));   V.pcmPrev = RAW.pcm.filter(r => inP(r,'month'));
  V.pst  = RAW.pst.filter(r => inM(r,'month'));
  V.sq   = RAW.sq.filter(r => inM(r,'month'));
  V.pkw  = RAW.pkw.filter(r => inM(r,'month'));
  V.pseg = RAW.pseg.filter(r => inM(r,'month'));
  V.pconv= RAW.pconv.filter(r => inM(r,'month'));
  /* AI visibility is a snapshot: latest check on or before the month, plus the one
     before it for the trend. Same rule as rankings. */
  const geoDates = [...new Set(RAW.geo.map(r => r.checked_at))].filter(d => monthOf(d) <= m).sort();
  V.geoAsOf = geoDates[geoDates.length - 1] || null;
  V.geoPrevAsOf = geoDates[geoDates.length - 2] || null;
  V.geoSnap = V.geoAsOf ? RAW.geo.filter(r => r.checked_at === V.geoAsOf) : [];
  V.geoPrevSnap = V.geoPrevAsOf ? RAW.geo.filter(r => r.checked_at === V.geoPrevAsOf) : [];
  V.gshare = V.geoAsOf ? RAW.gshare.filter(r => r.checked_at === V.geoAsOf) : [];

  /* Rankings and scans are snapshots: take the latest ON OR BEFORE the selected month,
     so a month with no scan shows the standing position rather than going blank. */
  const upto = (arr, c) => arr.filter(r => r[c] && monthOf(r[c]) <= m)
    .sort((a,b) => String(a[c]).localeCompare(String(b[c])));
  const rk = upto(RAW.rankings,'checked_at');
  V.rankAsOf = rk.length ? monthOf(rk[rk.length-1].checked_at) : null;
  /* Several checks can land in one month — take the last check date only, or every
     keyword appears once per check. */
  const rkLast = rk.length ? rk[rk.length-1].checked_at : null;
  V.rankings = rkLast ? rk.filter(r => r.checked_at === rkLast) : [];
  const sc = upto(RAW.scans,'checked_at');
  V.scanAsOf = sc.length ? monthOf(sc[sc.length-1].checked_at) : null;
  /* A keyword can be re-scanned within a month (e.g. at a deeper depth) — keep only
     its latest scan so it isn't counted twice. */
  const latest = {};
  (V.scanAsOf ? sc.filter(r => monthOf(r.checked_at) === V.scanAsOf) : []).forEach(r => {
    const k = r.keyword.toLowerCase(), t = r.scanned_at || r.checked_at;
    if (!latest[k] || String(t) > String(latest[k].scanned_at || latest[k].checked_at)) latest[k] = r; });
  V.scans = Object.values(latest);
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
/* `negatives` is part of the paid ads contract, so it shares paid_ads' switch. */
const modOf = m => m === 'negatives' ? 'paid_ads' : m;
const enabled = m => m === 'overview' || !!CFG.modules[modOf(m)]?.enabled;
const visible = () => ORDER.filter(m => m === 'overview' || CFG.modules[modOf(m)]);

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
      aria-selected="${state.tab === m}">${LABEL[m]}${m === 'negatives' ? `<span class="tcount">${negOpen() || ''}</span>` : ''}</button>`;
  }).join('');
}

/* A module the client has not bought stays VISIBLE and explains itself when clicked.
   Jose 06/09/2026 — deliberately different from Cobalt, which deletes unsold sections.
   The point is the upsell. Keyed off `enabled:false` ONLY: an enabled module with no
   data yet gets an empty state instead, so a client never reads "not in your package"
   about something they are paying for. */
function showLock(mod){ showOffer(mod); }

function renderAll(){
  renderMonthChips(); renderTabs();
  const host = $('#panel');
  Object.keys(TABLES).forEach(k => delete TABLES[k]);
  host.innerHTML = ({
    overview: viewOverview, seo: viewSeo, map_grid: viewMapGrid, gbp: viewGbp,
    geo: viewGeo, paid_ads: viewPaid, negatives: viewNegatives, social: viewSocial, leads_crm: viewLeads,
  }[state.tab] || (() => emptyState('Unknown tab', 'Nothing to render.')))();
  $('#monthlabel').textContent = monthName(state.month);
  drawCharts(); wireTables();
  /* The refresh log is admin-only, so a client falls back to the newest dated row. */
  const newest = [...RAW.seo, ...RAW.gbp, ...RAW.paid].map(r => r.date).filter(Boolean).sort().pop();
  $('#stamp').textContent = RAW.refresh?.length
    ? 'Data as at ' + new Date(RAW.refresh.map(r => r.finished_at).filter(Boolean).sort().pop() || Date.now())
        .toLocaleDateString('en-AU')
    : newest ? 'Data to ' + new Date(newest + 'T00:00:00').toLocaleDateString('en-AU') : '';
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
  if (on('paid_ads')){ const l = sum(V.paid,'leads');
    cards.push(kpi('Ad spend', money(a.spend)), kpi('Ad leads', fmt(l), l ? money(a.spend / l) + ' per lead' : '')); }
  if (on('leads_crm')) cards.push(kpi('Leads', fmt(a.leads)));
  out += cards.length ? `<div class="kpis">${cards.join('')}</div>`
                      : emptyState('Nothing to report yet', 'No data has landed for this month.');

  /* Share of voice — one row, three places a customer looks. Each tile only appears
     when its module is on and has a measurement; never a placeholder number. */
  const sovTiles = [];
  if (on('paid_ads')){
    const sc = V.pcm.filter(r => r.search_is != null), w = sum(sc,'impressions');
    if (w) sovTiles.push(kpi('Google Ads', share(sc.reduce((t, r) => t + Number(r.search_is) * r.impressions, 0) / w),
      'Impression share: eligible searches where the ad showed'));
  }
  if (on('map_grid') && V.scans.length){
    const s = V.scans.filter(x => x.solv != null);
    if (s.length) sovTiles.push(kpi('Google Maps', pct1(s.reduce((t, x) => t + Number(x.solv), 0) / s.length),
      `Share of map points ranking top 3, avg of ${s.length} keyword${s.length > 1 ? 's' : ''}`));
  }
  if (on('geo') && V.gshare.length){
    const t = sum(V.gshare,'mentions'), m = sum(V.gshare.filter(r => r.is_client),'mentions');
    if (t) sovTiles.push(kpi('AI assistants', pct1(m / t * 100), `${fmt(m)} of ${fmt(t)} business mentions`));
  }
  if (sovTiles.length) out += `<p class="eyebrow" style="margin-top:26px">Share of voice</p><div class="kpis">${sovTiles.join('')}</div>`;

  /* Derived commentary — every sentence switches on a live value. */
  const notes = [];
  if (on('seo') && !V.seo.length)
    notes.push(callout('warn','Search data starts at launch',
      `There is no Search Console or Analytics data for ${monthName(state.month)} because the website is not live yet. This fills in from the first day the site is published.`));
  if (on('gbp') && !V.gbp.length)
    notes.push(callout('warn','Google Business Profile figures pending',
      `Google has not reported profile activity for ${monthName(state.month)} yet. It usually lands within a few days.`));
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

/* Accomplished tasks: what was delivered in the month, each item linked to the proof
   (the live page, the document). Rows are recorded with their source; never inferred. */
function workDone(module){
  /* Links built have their own section (and only exist on the link-building package). */
  const items = (RAW.wlog || []).filter(r => (r.module || 'seo') === module && monthOf(r.month) === state.month
      && r.category !== 'Links built')
    .sort((a, b) => (a.sort || 0) - (b.sort || 0));
  if (!items.length) return '';
  const ORDERED = ['Blogs published', 'Blogs written', 'Google Business Profile posts', 'LinkedIn articles', 'Social posts'];
  const cats = [...new Set(items.map(r => r.category))]
    .sort((a, b) => (ORDERED.indexOf(a) + 1 || 99) - (ORDERED.indexOf(b) + 1 || 99));
  const d = v => v ? new Date(v + 'T00:00:00').toLocaleDateString('en-AU', { day:'2-digit', month:'2-digit' }) : '';
  const link = u => /^https?:/.test(u || '') ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>` : '';
  return `<div class="card done"><div class="cardhead"><div><h3>Accomplished in ${monthName(state.month)}</h3>
      <p class="sub">${cats.map(c => `${fmt(items.filter(r => r.category === c).length)} ${c.toLowerCase()}`).join(' · ')}</p></div></div>
    <div class="donegrid">${cats.map(c => `<div class="donecol"><span class="mlbl">${esc(c)} · ${fmt(items.filter(r => r.category === c).length)}</span>
      <ul>${items.filter(r => r.category === c).map(r => `<li><span class="tick">✓</span><div><b>${esc(r.title)}</b>
        ${r.url ? `<div class="dlink">${link(r.url)}</div>` : ''}${r.done_on ? `<div class="ddate">${/published|posts|articles/i.test(c) ? 'Live' : 'Done'} ${d(r.done_on)}</div>` : ''}</div></li>`).join('')}</ul></div>`).join('')}</div></div>`;
}

/* Custom links built. Real rows for clients on custom link building (md_clients.modules.links,
   set from so_client_lifecycle.link_building). Everyone else sees a quiet teaser: Jose
   06/10/2026, "something that tries to sell but not sell a higher package". No price, no
   package name, no pressure: it says it is optional and offers an honest answer. */
function linksSection(){
  const on = !!(RAW.client.modules || {}).links;
  if (on){
    const rows = (RAW.wlog || []).filter(r => r.category === 'Links built' && monthOf(r.month) === state.month)
      .map(r => ({ ...r, dr: r.note ? Number(String(r.note).replace(/\D/g, '')) || null : null }));
    const all = (RAW.wlog || []).filter(r => r.category === 'Links built');
    return `<div class="card"><div class="cardhead"><div><h3>Custom links built</h3>
        <p class="sub">${fmt(rows.length)} in ${monthName(state.month)} · ${fmt(all.length)} since we started. Each one is a live page on another website linking to yours</p></div></div>
      ${rows.length ? dataTable('links', [{ k:'title', label:'Website' },
          { k:'dr', label:'Authority', num:1, fmt:v => v == null ? '—' : `<span class="rankpill ${v >= 40 ? 'win' : v >= 20 ? 'mid' : 'out'}">DR ${v}</span>` },
          { k:'url', label:'Live page', fmt:v => v ? `<a href="${esc(v)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(v.replace(/^https?:\/\/(www\.)?/, ''))}</a>` : '—' },
          { k:'done_on', label:'Live since', fmt:v => v ? new Date(v + 'T00:00:00').toLocaleDateString('en-AU', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—' }],
          rows, { sort:{ k:'done_on', dir:-1 }, filter:false, maxH:380 })
        : emptyState('No links live yet this month', 'Links are earned through outreach and go live through the month. Each one appears here once it is live and checked.')}</div>`;
  }
  return `<div class="card linktease" data-linktease><div class="lt-copy">
      <span class="lt-pill">Optional extra</span>
      <h3>Custom links built</h3>
      <p>Links from trusted, relevant Australian websites pointing at yours. They are one of the strongest signals Google and AI assistants use to decide which business to trust and recommend.</p>
      <button class="btn" type="button" data-linkinfo>How this works</button></div>
    <div class="lt-art" aria-hidden="true">
      <svg viewBox="0 0 160 110"><g fill="none" stroke="currentColor" stroke-width="2" opacity=".55">
        <circle cx="80" cy="55" r="16"/><circle cx="24" cy="22" r="9"/><circle cx="136" cy="20" r="9"/><circle cx="20" cy="88" r="9"/><circle cx="140" cy="90" r="9"/>
        <path d="M31 27l35 20M129 25l-35 22M27 84l38-21M133 85l-39-22"/></g></svg></div></div>`;
}
/* One soft pop-up for every service a client does not have (Jose 07/10/2026). Same shape
   each time: optional, their plan works without it, an honest answer if they ask. No price,
   no package name. "Ask us about it" records the request (md_service_interest) and an hourly
   routine tells the account manager in the client's Slack channel. Nothing is emailed from
   the page and nothing is sold here. */
const OFFER = {
  links:     { label:'Custom link building', kicker:'Only if you want to speed things up',
    p:['Your current plan is building the foundations: your Google profile, your content and how you show up in AI search. That is the right order, and it works on its own.',
       'Custom link building is for when you would like the results to come sooner. Each month we earn a handful of links from respected local and industry websites, which helps Google and AI assistants trust your site faster.'] },
  social:    { label:'Organic social management', kicker:'Only if you want more from your socials',
    p:['Your plan already turns every Google post into content your socials can reuse.',
       'If you would like us to plan, write and post across Facebook, Instagram and LinkedIn for you, with reporting here on reach and enquiries, we can take it on alongside what we do now.'] },
  leads_crm: { label:'Leads and CRM reporting', kicker:'Only if you want to see every enquiry in one place',
    p:['Right now this dashboard shows where people find you and what they do next.',
       'Leads reporting connects your enquiry form, calls and CRM, so every lead is counted against the channel that produced it, and you can see what each job actually cost to win.'] },
  paid_ads:  { label:'Google and Meta Ads management', kicker:'Only if you want leads while SEO builds',
    p:['SEO and your Google profile compound over time.',
       'Paid ads put you at the top of Google from the first week, for the exact jobs you want, and every search term and dollar is reported here.'] },
  geo:       { label:'AI visibility tracking', kicker:'Only if you want to know where AI search is going',
    p:['More homeowners now ask ChatGPT, Gemini or Perplexity who to call.',
       'AI visibility tracking checks every month whether those assistants name you, who they name instead and which pages they trust.'] },
  map_grid:  { label:'Map pack grid tracking', kicker:'Only if you want to see your reach on Google Maps',
    p:['A single ranking number hides how far your profile reaches.',
       'The map grid searches from points right across your service area, so you can see suburb by suburb where you show up and who beats you.'] },
  gbp:       { label:'Google Business Profile reporting', kicker:'Only if you want your profile measured',
    p:['Your Google profile is often the first thing a customer sees.',
       'Profile reporting shows views, calls, directions, the searches that found you and every review, month by month.'] },
  seo:       { label:'SEO', kicker:'Only if you want to grow organic traffic',
    p:['SEO reporting shows the searches you are found for, the keywords we target and how they move each month.'] },
};
function showOffer(mod){
  const o = OFFER[mod] || { label: SOLD_AS[mod] || LABEL[mod] || mod, kicker:'Only if it would help', p:[] };
  const box = el(`<div class="lockwrap" role="dialog" aria-modal="true"><div class="lockbox">
      <span class="mlbl">${esc(o.kicker)}</span>
      <h3>${esc(o.label)}</h3>
      ${o.p.map(t => `<p>${esc(t)}</p>`).join('')}
      <p>There is no need to add it. If you are curious whether it would make a real difference for you right now, ask us and we will give you an honest answer.</p>
      <div class="lockbtns"><button class="btn primary" type="button" data-ask>Ask us about it</button>
        <button class="btn" type="button" data-close>Maybe later</button></div>
      <p class="askdone" hidden></p></div></div>`);
  const v = EMBED && onScreen();
  if (v) Object.assign(box.style, { position: 'absolute', top: v.top + 'px', height: v.height + 'px', bottom: 'auto' });
  box.addEventListener('click', async e => {
    if (e.target === box || e.target.hasAttribute('data-close')) return box.remove();
    const ask = e.target.closest('[data-ask]'); if (!ask) return;
    ask.disabled = true; ask.textContent = 'Sending…';
    const { error } = await sb.from('md_service_interest')
      .insert({ client_id: RAW.client.id, service: mod, service_label: o.label });
    const done = box.querySelector('.askdone'); done.hidden = false;
    if (error){ ask.disabled = false; ask.textContent = 'Ask us about it';
      done.textContent = 'That did not send. Please try again, or reply to any of our emails.'; done.classList.add('bad'); return; }
    box.querySelector('.lockbtns').remove();
    done.textContent = `Thanks. We have let your account manager know, and they will be in touch about ${o.label.toLowerCase()} within one business day.`;
  });
  document.addEventListener('keydown', function escK(ev){ if (ev.key === 'Escape'){ box.remove(); document.removeEventListener('keydown', escK); } });
  document.body.appendChild(box);
}

function viewSeo(){
  let out = head('SEO', 'Search performance',
    'Clicks, impressions and average position from Google Search Console, with the keywords we track.');
  out += workDone('seo') + linksSection();
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
  /* Brand searches (the business's own name) are excluded: ranking #1 for your own name
     says nothing about winning new customers. The client name decides what counts. */
  const brandRe = new RegExp(CFG.name.split(/\s+/)[0].replace(/[^a-z0-9]/gi, ''), 'i');
  if (V.rankings.length){
    const rows = V.rankings.filter(r => !brandRe.test(r.keyword)).map(r => ({ ...r,
      move: r.position != null && r.prev_position != null ? r.prev_position - r.position : null }));
    const top10 = rows.filter(r => r.position != null && r.position <= 10).length, ranking = rows.filter(r => r.position != null).length;
    out += `<div class="card"><div class="cardhead"><div><h3>Target keywords we track</h3>
      <p class="sub">${fmt(rows.length)} service and suburb keywords, checked ${monthName(V.rankAsOf)} · ${fmt(top10)} on page one · ${fmt(ranking)} in the top 100. Brand searches are left out</p></div></div>
      ${dataTable('rankings', [{ k:'keyword', label:'Keyword' },
        { k:'position', label:'Position', num:1, fmt:v => `<span class="rankpill ${v == null ? 'out' : v <= 3 ? 'win' : v <= 10 ? 'mid' : 'out'}">${v ?? 'Not in top 100'}</span>` },
        { k:'prev_position', label:'Previous', num:1, fmt:v => v ?? '—' },
        { k:'move', label:'Change', num:1, fmt:v => v == null ? '—' : v > 0 ? `<span class="chip up">▲ ${v}</span>` : v < 0 ? `<span class="chip dn">▼ ${-v}</span>` : '<span class="chip flat">—</span>' }],
        rows, { sort:{ k:'position', dir:1 }, maxH:520 })}</div>`;
  }
  if (V.sq.length){
    const rows = V.sq.filter(r => !r.is_brand && !brandRe.test(r.query)).map(r => ({ ...r, ctr: r.impressions ? r.clicks / r.impressions * 100 : null }));
    const brand = V.sq.filter(r => r.is_brand || brandRe.test(r.query));
    out += `<div class="card"><div class="cardhead"><div><h3>What people searched to find the website</h3>
      <p class="sub">Every search Google Search Console reported for ${monthName(state.month)} — ${fmt(rows.length)} searches, ${fmt(sum(rows,'clicks'))} clicks, ${fmt(sum(rows,'impressions'))} impressions.
      Searches for the business name (${fmt(sum(brand,'clicks'))} clicks) are left out</p></div></div>
      ${dataTable('queries', [{ k:'query', label:'Search' }, { k:'clicks', label:'Clicks', num:1, fmt:v => fmt(v) },
        { k:'impressions', label:'Impressions', num:1, fmt:v => fmt(v) }, { k:'ctr', label:'CTR', num:1, fmt:pct1 },
        { k:'avg_position', label:'Avg position', num:1, fmt:v => v == null ? '—' : fmt(v, 1) }],
        rows, { sort:{ k:'impressions', dir:-1 }, maxH:520,
          note:'Google only reports searches with enough volume to keep searchers anonymous, and Search Console runs two to three days behind.' })}</div>`;
  } else if (V.seo.length) out += `<p class="dtnote">Search Console has not reported individual searches for ${monthName(state.month)} yet — it runs two to three days behind.</p>`;
  return out;
}

function viewMapGrid(){
  let out = head('Map Pack Grid', 'Where the profile ranks across the service area',
    'A grid of measurement points around the business. One ranking number hides the truth; the grid shows how far the profile’s pull actually reaches.');
  if (!V.scans.length)
    return out + emptyState('No scan yet',
      'No map grid scan has been run for this month yet.');

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
  /* One grid per keyword, drawn from md_mapgrid_points. Hover a square for the
     business holding the top spot there. */
  const cell = r => r == null ? 'var(--s3)' : r <= 3 ? 'var(--good)' : r <= 10 ? 'var(--warn)' : r <= 20 ? 'var(--bad)' : '#7a2e2e';
  const grids = scans.map(s => {
    const pts = (RAW.points || []).filter(p => p.scan_id === s.id), n = s.grid_size;
    if (!pts.length) return '';
    return `<div class="card"><div class="cardhead"><div><h3>“${esc(s.keyword)}”</h3>
      <p class="sub">${fmt(s.found_points)} of ${fmt(s.total_points)} points ranking · share of voice ${s.solv != null ? pct1(s.solv) : '—'}</p></div></div>
      <div style="display:grid;grid-template-columns:repeat(${n},1fr);gap:4px;max-width:${n*40}px">
      ${Array.from({length:n*n}, (_, i) => { const p = pts.find(x => x.idx === i) || {};
        /* No top_competitor = Google returned no businesses at this point at all. */
        const none = p.rank == null && !p.top_competitor, d = s.depth || 20;
        const tip = (p.rank != null ? 'Position ' + p.rank : none ? 'Google showed no businesses for this search here' : `Not in the top ${d} here`) + (p.top_competitor ? ' · #1 here: ' + p.top_competitor : '');
        /* Not found = not ranking at that point either way, so every square carries a value. */
        const label = p.rank != null ? p.rank : `${d}+`;
        return `<div title="${esc(tip)}"
          style="aspect-ratio:1;border-radius:5px;background:${cell(p.rank)};opacity:${none ? .7 : 1};
          display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:${String(label).length > 2 ? 8.5 : 10}px;color:${p.rank != null && p.rank <= 10 ? '#06212e' : 'var(--ink2)'};font-weight:700">${label}</div>`;
      }).join('')}</div></div>`; }).filter(Boolean);
  if (grids.length) out += `<div class="legend" style="margin:18px 0 10px"><span><i style="background:var(--good)"></i>Top 3</span>
      <span><i style="background:var(--warn)"></i>4–10</span><span><i style="background:var(--bad)"></i>11–20</span>
      <span><i style="background:#7a2e2e"></i>21+</span><span><i style="background:var(--s3)"></i>${scans[0]?.depth || 20}+ = not in the top ${scans[0]?.depth || 20}</span>
      <span>Hover a square for who is #1 there</span></div><div class="grid2">${grids.join('')}</div>`;

  /* Who holds the map where we don't */
  const comp = {}; (RAW.points || []).filter(p => scans.some(s => s.id === p.scan_id) && p.top_competitor)
    .forEach(p => { comp[p.top_competitor] = (comp[p.top_competitor] || 0) + 1; });
  const crow = Object.entries(comp).map(([name, n]) => ({ name, n }));
  if (crow.length) out += `<div class="card"><div class="cardhead"><div><h3>Who is #1 across the grid</h3>
    <p class="sub">The business in first place at each measured point, across all keywords</p></div></div>
    ${dataTable('mapcomp', [{ k:'name', label:'Business' }, { k:'n', label:'Points at #1', num:1, fmt:v => fmt(v) }], crow,
      { sort:{ k:'n', dir:-1 }, maxH:380 })}</div>`;
  return out;
}

function viewGbp(){
  let out = head('Google Business Profile', 'How the profile is found, and what it produces',
    'Views on Google Search and Maps, the actions people took, the searches that surfaced the profile, and every review.');
  const rv = RAW.grl || [];
  if (!V.gbp.length && !V.reviews && !rv.length)
    return out + emptyState('No profile data for this month yet',
      `Google has not reported profile activity for ${monthName(state.month)} yet. It usually lands within a few days.`);
  const g = V.gbp, gp = V.gbpPrev;
  const views = rows => sum(rows,'impr_search_mobile') + sum(rows,'impr_search_desktop') + sum(rows,'impr_maps_mobile') + sum(rows,'impr_maps_desktop');
  const hasViews = g.some(r => r.impr_search_mobile != null);
  const v = views(g), vp = views(gp);
  const act = rows => sum(rows,'calls') + sum(rows,'website_clicks') + sum(rows,'direction_requests');
  const a = act(g), ap = act(gp);

  /* Reviews: computed from the review list, never a typed-in total */
  const inMonth = r => monthOf(String(r.created_at).slice(0,10)) === state.month;
  const inPrev  = r => V.prevMonth && monthOf(String(r.created_at).slice(0,10)) === V.prevMonth;
  const endOf = m => rv.filter(r => monthOf(String(r.created_at).slice(0,10)) <= m);
  const totNow = endOf(state.month), totPrev = V.prevMonth ? endOf(V.prevMonth) : [];
  const avgR = arr => arr.length ? arr.reduce((t, r) => t + (r.rating || 0), 0) / arr.length : null;
  const newM = rv.filter(inMonth), newP = rv.filter(inPrev);
  const replyRate = totNow.length ? totNow.filter(r => r.replied).length / totNow.length * 100 : null;

  const pm = V.prevMonth ? monthName(V.prevMonth) : null;
  const vs = (c, p) => `${chipFor(c, p)}${pm ? ` vs ${pm}` : ''}`;
  out += `<p class="lede">${hasViews ? `In ${monthName(state.month)} the profile was viewed ${fmt(v)} times on Google Search and Maps${pm && vp ? ` (${vp ? (v >= vp ? 'up' : 'down') + ' from ' + fmt(vp) : ''} in ${pm})` : ''}. ` : ''}
    People took ${fmt(a)} action${a === 1 ? '' : 's'} from it: ${fmt(sum(g,'calls'))} call${sum(g,'calls') === 1 ? '' : 's'}, ${fmt(sum(g,'website_clicks'))} website visit${sum(g,'website_clicks') === 1 ? '' : 's'} and ${fmt(sum(g,'direction_requests'))} direction request${sum(g,'direction_requests') === 1 ? '' : 's'}.
    ${totNow.length ? `The profile holds ${fmt(totNow.length)} Google reviews averaging ${fmt(avgR(totNow), 2)} stars${newM.length ? `, with ${fmt(newM.length)} new this month` : ', with none new this month'}.` : ''}</p>`;

  out += `<div class="kpis">
    ${hasViews ? kpi('Profile views', fmt(v), vs(v, vp)) : ''}
    ${kpi('Actions taken', fmt(a), vs(a, ap))}
    ${kpi('Calls', fmt(sum(g,'calls')), vs(sum(g,'calls'), sum(gp,'calls')))}
    ${kpi('Website clicks', fmt(sum(g,'website_clicks')), vs(sum(g,'website_clicks'), sum(gp,'website_clicks')))}
    ${kpi('Direction requests', fmt(sum(g,'direction_requests')), vs(sum(g,'direction_requests'), sum(gp,'direction_requests')))}
    ${hasViews && v ? kpi('Action rate', pct1(a / v * 100), 'Actions ÷ profile views') : ''}
    ${totNow.length ? kpi('Google reviews', fmt(totNow.length), `${newM.length >= 0 ? `<span class="chip ${newM.length ? 'up' : 'flat'}">+${fmt(newM.length)}</span> this month` : ''}`) : ''}
    ${totNow.length ? kpi('Average rating', fmt(avgR(totNow), 2) + ' ★', totPrev.length ? `${chipFor(avgR(totNow), avgR(totPrev))} vs ${pm}` : '') : ''}
    ${replyRate != null ? kpi('Reviews replied to', pct1(replyRate), `${fmt(totNow.filter(r => r.replied).length)} of ${fmt(totNow.length)}`) : ''}</div>`;

  /* Callouts — every sentence switches on a value */
  const notes = [];
  if (hasViews && vp && v < vp * 0.7) notes.push(callout('bad', 'Profile views fell',
    `Views dropped from ${fmt(vp)} in ${pm} to ${fmt(v)} — ${pct1((1 - v / vp) * 100)} lower. A drop this sharp usually follows a change to the listing (address, category or verification) rather than a change in demand.`));
  else if (hasViews && vp && v > vp * 1.15) notes.push(callout('good', 'More people are seeing the profile',
    `Views rose ${pct1((v / vp - 1) * 100)} on ${pm}.`));
  const unreplied = rv.filter(r => !r.replied).sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
  if (unreplied.length) notes.push(callout('warn', `${fmt(unreplied.length)} review${unreplied.length === 1 ? '' : 's'} without a reply`,
    `Google weighs owner replies, and the next customer reads them. The most recent unanswered one is from ${new Date(unreplied[0].created_at).toLocaleDateString('en-AU', { day:'2-digit', month:'2-digit', year:'numeric' })}.`));
  const low = newM.filter(r => r.rating && r.rating <= 3);
  if (low.length) notes.push(callout('bad', 'Low rating this month', `${fmt(low.length)} review${low.length === 1 ? '' : 's'} of 3 stars or under came in. Reply publicly and promptly.`));
  out += notes.join('');

  /* Views by where they happened */
  if (hasViews){
    const days = [...new Set(g.map(r => r.date))].sort();
    out += `<div class="card"><div class="cardhead"><div><h3>Profile views, day by day</h3><p class="sub">${monthName(state.month)} · Google Search vs Google Maps</p></div>
      <div class="legend"><span><i style="background:var(--accent)"></i>Search</span><span><i style="background:var(--ink3)"></i>Maps</span></div></div>
      <div data-chart='${JSON.stringify({ series: [
        { data: days.map(d => { const r = g.find(x => x.date === d) || {}; return (r.impr_search_mobile || 0) + (r.impr_search_desktop || 0); }), color: 'var(--accent)' },
        { data: days.map(d => { const r = g.find(x => x.date === d) || {}; return (r.impr_maps_mobile || 0) + (r.impr_maps_desktop || 0); }), color: 'var(--ink3)' }] })}'></div></div>`;
    const split = [{ label:'Search · mobile', k:'impr_search_mobile' }, { label:'Search · desktop', k:'impr_search_desktop' },
                   { label:'Maps · mobile', k:'impr_maps_mobile' }, { label:'Maps · desktop', k:'impr_maps_desktop' }]
      .map(x => ({ label: x.label, n: sum(g, x.k), p: sum(gp, x.k) }));
    const acts = [{ label:'Calls', k:'calls' }, { label:'Website clicks', k:'website_clicks' }, { label:'Direction requests', k:'direction_requests' }]
      .map(x => ({ label: x.label, n: sum(g, x.k), p: sum(gp, x.k) }));
    const delta = r => pm ? ` ${chipFor(r.n, r.p)}` : '';
    out += `<div class="grid2">
      <div class="card"><div class="cardhead"><div><h3>Where the views came from</h3><p class="sub">With change on ${pm || 'the previous month'}</p></div></div>
        ${barList(split, { value: r => r.n, valueFmt: x => fmt(x), extra: delta })}</div>
      <div class="card"><div class="cardhead"><div><h3>What people did</h3><p class="sub">With change on ${pm || 'the previous month'}</p></div></div>
        ${barList(acts, { value: r => r.n, valueFmt: x => fmt(x), extra: delta })}</div></div>`;
  }

  /* Searches that surfaced the profile (Google releases these monthly, a few weeks late) */
  const kwM = RAW.gkw.filter(r => monthOf(r.month) <= state.month).map(r => monthOf(r.month)).sort().pop();
  if (kwM){
    const rows = RAW.gkw.filter(r => monthOf(r.month) === kwM).map(r => ({ ...r, sortv: r.users ?? (r.below_threshold ? r.below_threshold - 0.5 : 0),
      brand: new RegExp(CFG.name.split(/\s+/)[0], 'i').test(r.keyword) ? 'Your name' : 'Discovery' }));
    out += `<div class="card"><div class="cardhead"><div><h3>Searches that showed the profile</h3>
      <p class="sub">What people typed on Google Search and Maps before seeing the profile — ${monthName(kwM)}${kwM !== state.month ? ' (Google releases this a few weeks after month end)' : ''}.
      “Discovery” searches are people who didn’t search the business by name</p></div></div>
      ${dataTable('gbpkw', [{ k:'keyword', label:'Search' }, { k:'brand', label:'Type' },
        { k:'sortv', label:'People', num:1, fmt:(v, r) => r.users != null ? fmt(r.users) : `under ${r.below_threshold}` }],
        rows, { sort:{ k:'sortv', dir:-1 }, maxH:380 })}</div>`;
  }

  /* Reviews — every one, newest first */
  if (rv.length){
    const rows = rv.map(r => ({ ...r, d: String(r.created_at).slice(0,10) }));
    const byM = {}; rv.forEach(r => { const m = monthOf(String(r.created_at).slice(0,10)); byM[m] = (byM[m] || 0) + 1; });
    const last6 = Object.keys(byM).sort().slice(-6);
    out += `<div class="card"><div class="cardhead"><div><h3>New reviews by month</h3><p class="sub">Last six months with reviews</p></div></div>
      ${barList(last6.map(m => ({ label: new Date(m + '-01T00:00:00').toLocaleDateString('en-AU', { month:'short', year:'2-digit' }), n: byM[m] })), { value: r => r.n, valueFmt: x => fmt(x) })}</div>
      <div class="card"><div class="cardhead"><div><h3>Every Google review</h3><p class="sub">${fmt(rv.length)} reviews · ${fmt(avgR(rv), 2)} average · newest first</p></div></div>
      ${dataTable('reviews', [{ k:'d', label:'Date', fmt:v => new Date(v + 'T00:00:00').toLocaleDateString('en-AU', { day:'2-digit', month:'2-digit', year:'numeric' }) },
        { k:'rating', label:'Stars', num:1, fmt:v => `<span style="color:var(--warn)">${'★'.repeat(v || 0)}</span>` },
        { k:'reviewer', label:'Reviewer' }, { k:'comment', label:'Review', fmt:v => `<span class="rvtext">${esc(v || '— (rating only)')}</span>` },
        { k:'replied', label:'Replied', fmt:v => v ? '<span class="rankpill win">Yes</span>' : '<span class="rankpill out">No</span>' }],
        rows, { sort:{ k:'d', dir:-1 }, maxH:560 })}</div>`;
  }
  return out;
}

function viewGeo(){
  let out = head('AI Visibility', 'Being named in AI answers',
    'Whether the business gets recommended when someone asks an AI assistant, rather than typing a search.');
  const snap = V.geoSnap;
  if (!snap.length)
    return out + emptyState('Baseline not captured yet',
      'AI visibility tracking starts alongside the first month of content.');
  const isNamed = r => r.result && /^(named|found|yes)/i.test(r.result);
  const named = snap.filter(isNamed).length, prevNamed = V.geoPrevSnap.filter(isNamed).length;
  const engines = [...new Set(snap.map(r => r.engine))].sort();
  const brandTot = sum(V.gshare,'mentions'), mine = sum(V.gshare.filter(r => r.is_client),'mentions');
  const sov = brandTot ? mine / brandTot * 100 : null;
  const asOf = d => new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day:'2-digit', month:'2-digit', year:'numeric' });

  out += `<p class="lede">On ${asOf(V.geoAsOf)} we asked ${engines.length} AI assistant${engines.length === 1 ? '' : 's'} (${engines.join(', ')})
    ${fmt(new Set(snap.map(r => r.prompt)).size)} questions a homeowner might ask. ${CFG.name} was named in ${fmt(named)} of ${fmt(snap.length)} answers${V.geoPrevAsOf
      ? `, against ${fmt(prevNamed)} of ${fmt(V.geoPrevSnap.length)} on ${asOf(V.geoPrevAsOf)}` : ''}.${sov != null
      ? ` Across every business the assistants recommended, ${CFG.name} took ${pct1(sov)} of the mentions.` : ''}</p>`;
  out += `<div class="kpis">
    ${kpi('Named in answers', `${fmt(named)} / ${fmt(snap.length)}`, pct1(named / snap.length * 100) + ' of answers')}
    ${kpi('AI share of voice', sov != null ? pct1(sov) : '—', brandTot ? `${fmt(mine)} of ${fmt(brandTot)} business mentions` : '')}
    ${V.geoPrevAsOf ? kpi('Previous check', `${fmt(prevNamed)} / ${fmt(V.geoPrevSnap.length)}`, asOf(V.geoPrevAsOf)) : ''}
    ${kpi('Assistants checked', fmt(engines.length), engines.join(' · '))}</div>`;

  /* Per engine */
  out += `<div class="card"><div class="cardhead"><div><h3>By assistant</h3><p class="sub">Answers that named the business, and its share of all businesses named</p></div></div>
    ${barList(engines.map(e => { const rs = snap.filter(r => r.engine === e), g = V.gshare.filter(r => r.engine === e);
      const t = sum(g,'mentions'), m = sum(g.filter(r => r.is_client),'mentions');
      return { label: e, n: rs.filter(isNamed).length, of: rs.length, sov: t ? m / t * 100 : null }; }),
      { value: r => r.n, valueFmt: v => fmt(v), extra: r => ` of ${r.of} answers${r.sov != null ? ` · ${pct1(r.sov)} share` : ''}` })}</div>`;

  /* Leaderboard */
  if (V.gshare.length){
    const by = {}; V.gshare.forEach(r => { by[r.brand] ??= { brand: r.brand, mentions: 0, engines: new Set(), me: r.is_client };
      by[r.brand].mentions += r.mentions; by[r.brand].engines.add(r.engine); });
    const rows = Object.values(by).map(r => ({ ...r, engines: [...r.engines].sort().join(', '), sharePct: brandTot ? r.mentions / brandTot * 100 : null }));
    out += `<div class="card"><div class="cardhead"><div><h3>Who the assistants recommend</h3>
      <p class="sub">Every business named across all answers, ranked by mentions</p></div></div>
      ${dataTable('aibrands', [{ k:'brand', label:'Business', fmt:(v, r) => r.me ? `<b style="color:var(--accent)">${esc(v)}</b>` : esc(v) },
        { k:'mentions', label:'Mentions', num:1, fmt:v => fmt(v) }, { k:'sharePct', label:'Share of voice', num:1, fmt:pct1 },
        { k:'engines', label:'Named by' }], rows, { sort:{ k:'mentions', dir:-1 }, maxH:420 })}</div>`;
  }

  /* Where the assistants found the business */
  const cited = {}; snap.forEach(r => (r.sources || []).forEach(u => { cited[u] ??= { url: u, n: 0, engines: new Set(), prompts: new Set() };
    cited[u].n++; cited[u].engines.add(r.engine); cited[u].prompts.add(r.prompt); }));
  const crows = Object.values(cited).map(c => ({ url: c.url, n: c.n, engines: [...c.engines].sort().join(', '), prompts: [...c.prompts].join(' · '),
    kind: /hipages|localsearch|yellowpages|oneflare|airtasker|google\./i.test(c.url) ? 'Directory listing' : 'Your website' }));
  if (crows.length) out += `<div class="card"><div class="cardhead"><div><h3>Where the assistants found ${esc(CFG.name)}</h3>
      <p class="sub">The pages each assistant cited when it named or referenced the business. These are the pages doing the work in AI search</p></div></div>
    ${dataTable('aicited', [{ k:'url', label:'Page cited', fmt:v => /^https?:/.test(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(v.replace(/^https?:\/\/(www\.)?/,''))}</a>` : esc(v) },
      { k:'kind', label:'Type' }, { k:'n', label:'Times cited', num:1, fmt:v => fmt(v) }, { k:'engines', label:'Cited by' }, { k:'prompts', label:'For the question' }],
      crows, { sort:{ k:'n', dir:-1 }, filter:false, maxH:380 })}</div>`;

  /* Every answer */
  out += `<div class="card"><div class="cardhead"><div><h3>Every question and answer</h3><p class="sub">Checked ${asOf(V.geoAsOf)}</p></div></div>
    ${dataTable('aiprompts', [{ k:'prompt', label:'Question asked' }, { k:'engine', label:'Assistant' },
      { k:'result', label:'Result', fmt:v => `<span class="rankpill ${/^named/i.test(v) ? 'win' : /source/i.test(v) ? 'mid' : 'out'}">${esc(v)}</span>` },
      { k:'src', label:'Cited page', fmt:(v, r) => (r.sources || []).map(u => /^https?:/.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(u.replace(/^https?:\/\/(www\.)?/,''))}</a>` : esc(u)).join('<br>') || '—' },
      { k:'notes', label:'Other businesses named' }], snap.map(r => ({ ...r, src: (r.sources || []).join(' ') })), { sort:{ k:'prompt', dir:1 }, maxH:520 })}</div>`;
  return out;
}

/* ---------------------------------------------------------------- data tables
   Spreadsheet-style tables: click a header to sort, type to filter, download as CSV.
   Rows live in TABLES[id]; only the tbody re-renders, so the filter box keeps focus. */
const TABLES = {};
const money2 = n => n == null ? '—' : '$' + fmt(n, 2);
/* Google reports impression share under 10% as 0.0999 — show it the way Google does. */
const share = v => v == null ? '—' : Number(v) <= 0.0999 ? '<10%' : fmt(Number(v) * 100, 0) + '%';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function dataTable(id, cols, rows, { sort, note = '', maxH = 520, filter = true } = {}){
  TABLES[id] = { cols, rows, sort: sort || { k: cols[0].k, dir: -1 }, q: '' };
  return `<div class="dt" data-dt="${id}">
    <div class="dtbar">${filter ? `<input class="dtq" data-tfilter="${id}" type="search" placeholder="Filter ${rows.length.toLocaleString('en-AU')} rows…">` : ''}
      <span class="dtcount" id="dtc-${id}"></span><span class="spacer"></span>
      <button class="btn" data-csv="${id}">Download CSV</button></div>
    <div class="tscroll" style="max-height:${maxH}px"><table class="tbl dtt"><thead><tr>
    ${cols.map(c => `<th data-sort="${id}:${c.k}" class="${c.num ? 'num' : ''}${c.k === 'neg' ? ' tick' : ''}" title="Sort">${c.label}<span class="sarrow"></span></th>`).join('')}
    </tr></thead><tbody id="dtb-${id}"></tbody></table></div>${note ? `<p class="dtnote">${note}</p>` : ''}</div>`;
}
function dtRows(id){
  const t = TABLES[id], q = t.q.trim().toLowerCase();
  let rows = q ? t.rows.filter(r => t.cols.some(c => String(r[c.k] ?? '').toLowerCase().includes(q))) : t.rows.slice();
  const { k, dir } = t.sort;
  rows.sort((a, b) => { const x = a[k], y = b[k];
    if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir; });
  return rows;
}
function dtRender(id){
  const t = TABLES[id], body = document.getElementById('dtb-' + id); if (!t || !body) return;
  const rows = dtRows(id);
  body.innerHTML = rows.length ? rows.map(r => `<tr>${t.cols.map(c =>
    `<td class="${c.num ? 'tnum num' : ''}${c.k === 'neg' ? ' tick' : ''}">${c.fmt ? c.fmt(r[c.k], r) : esc(r[c.k] ?? '—')}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${t.cols.length}" class="dtempty">No rows match.</td></tr>`;
  const n = document.getElementById('dtc-' + id);
  if (n) n.textContent = `${rows.length.toLocaleString('en-AU')} of ${t.rows.length.toLocaleString('en-AU')} rows`;
  document.querySelectorAll(`[data-sort^="${id}:"]`).forEach(th => {
    const on = th.dataset.sort === `${id}:${t.sort.k}`;
    th.classList.toggle('sorted', on); th.querySelector('.sarrow').textContent = on ? (t.sort.dir > 0 ? ' ▲' : ' ▼') : ''; });
}
function dtCsv(id){
  const t = TABLES[id], rows = dtRows(id);
  const cell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [t.cols.map(c => cell(c.label)).join(','), ...rows.map(r => t.cols.map(c => cell(r[c.k])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${CFG.slug}-${id}-${state.month}.csv`; a.click(); URL.revokeObjectURL(a.href);
}
function wireTables(){ Object.keys(TABLES).forEach(dtRender); }

/* Horizontal bar list — for device, day and hour splits. Bars scale to spend. */
function barList(rows, { label = r => r.label, value = r => r.cost, valueFmt = money, extra = () => '' } = {}){
  const max = Math.max(...rows.map(value), 0) || 1;
  return `<div class="bars">${rows.map(r => `<div class="barrow"><span class="blbl">${esc(label(r))}</span>
    <span class="btrack"><i style="width:${Math.max(value(r) / max * 100, value(r) ? 1.5 : 0)}%"></i></span>
    <span class="bval tnum">${valueFmt(value(r))}${extra(r)}</span></div>`).join('')}</div>`;
}

function viewPaid(){
  let out = head('Paid Ads', 'Google Ads — every dollar, accounted for',
    'Exactly what was spent, what it bought, and what people typed into Google before they clicked. Every figure comes straight from the Google Ads account; nothing here is estimated.');
  if (!V.paid.length && !V.pcm.length)
    return out + emptyState('No ad data for this month', 'Nothing has been spent in this period.');

  /* Daily table is the source for spend/clicks/leads — it is refreshed daily, the
     monthly detail tables are refreshed with the full pull. */
  const spend = sum(V.paid,'spend'), clicks = sum(V.paid,'clicks'), impr = sum(V.paid,'impressions'), leads = sum(V.paid,'leads');
  const pSpend = sum(V.paidPrev,'spend'), pClicks = sum(V.paidPrev,'clicks'), pLeads = sum(V.paidPrev,'leads');
  const cpl = leads ? spend / leads : null, pCpl = pLeads ? pSpend / pLeads : null;
  const cpc = clicks ? spend / clicks : null, ctr = impr ? clicks / impr * 100 : null, cvr = clicks ? leads / clicks * 100 : null;
  const searchC = V.pcm.filter(r => r.search_is != null);
  const wIS = (k) => { const w = sum(searchC, 'impressions'); return w ? searchC.reduce((t, r) => t + Number(r[k] || 0) * r.impressions, 0) / w : null; };
  const is = wIS('search_is'), lostB = wIS('budget_lost_is'), lostR = wIS('rank_lost_is');

  /* Paragraph on top — every clause derived from a live value. */
  const camps = [...new Set(V.paid.map(r => r.campaign))];
  const mgd = [...new Set(V.pcm.map(r => r.managed_by).filter(Boolean))];
  out += `<p class="lede">In ${monthName(state.month)}, ${money2(spend)} was spent across ${camps.length} campaign${camps.length === 1 ? '' : 's'}${mgd.length > 1 ? ` (${mgd.join(' and ')})` : mgd.length ? ` managed by ${mgd[0]}` : ''}.
    The ads were shown ${fmt(impr)} times and clicked ${fmt(clicks)} times, producing ${fmt(leads)} lead${leads === 1 ? '' : 's'}${cpl ? ` at ${money2(cpl)} each` : ''}.
    ${is != null ? `On the searches the ads were eligible for, they appeared ${share(is)} of the time${lostB != null ? ` — ${share(lostB)} of searches were missed because the daily budget ran out and ${share(lostR)} because of ad rank` : ''}.` : ''}</p>`;

  out += `<div class="kpis">
    ${kpi('Spend', money2(spend), chipFor(spend, pSpend))}
    ${kpi('Leads', fmt(leads), chipFor(leads, pLeads))}
    ${kpi('Cost per lead', cpl ? money2(cpl) : '—', pCpl ? `${monthName(V.prevMonth)}: ${money2(pCpl)}` : '')}
    ${kpi('Clicks', fmt(clicks), chipFor(clicks, pClicks))}
    ${kpi('Avg cost per click', money2(cpc))}
    ${kpi('Click-through rate', pct1(ctr), 'Clicks ÷ times shown')}
    ${kpi('Click to lead rate', pct1(cvr))}
    ${kpi('Search impression share', share(is), 'Share of eligible searches we appeared on')}</div>`;

  /* Callouts */
  const notes = [];
  if (lostB != null && lostB > 0.2) notes.push(callout('warn', 'Budget is capping visibility',
    `${share(lostB)} of eligible searches were missed because the daily budget was used up. More budget is the only lever that recovers these — bids and ads will not.`));
  if (lostR != null && lostR > 0.3) notes.push(callout('warn', 'Ad rank is costing searches',
    `${share(lostR)} of eligible searches were missed on ad rank (bid × ad quality). This is what keyword, ad copy and landing page work improves.`));
  const stCost = sum(V.pst, 'cost'), cmCost = sum(V.pcm, 'cost');
  if (cmCost && V.pst.length) notes.push(callout('good', 'What people searched',
    `${fmt(V.pst.length)} search terms are listed below, covering ${pct1(stCost / cmCost * 100)} of spend. Google withholds low-volume searches for privacy — the remaining spend went on searches Google does not disclose to any advertiser.`));
  out += notes.join('');

  /* Daily spend chart */
  const days = [...new Set(V.paid.map(r => r.date))].sort();
  if (days.length > 1) out += `<div class="card"><div class="cardhead"><div><h3>Daily spend and clicks</h3>
      <p class="sub">${monthName(state.month)}</p></div>
      <div class="legend"><span><i style="background:var(--accent)"></i>Spend ($)</span><span><i style="background:var(--ink3)"></i>Clicks</span></div></div>
    <div data-chart='${JSON.stringify({ series: [
      { data: days.map(d => sum(V.paid.filter(r => r.date === d), 'spend')), color: 'var(--accent)' },
      { data: days.map(d => sum(V.paid.filter(r => r.date === d), 'clicks')), color: 'var(--ink3)' }] })}'></div></div>`;

  /* Campaigns */
  if (V.pcm.length){
    const rows = V.pcm.map(r => ({ ...r, cost: Number(r.cost), conversions: Number(r.conversions),
      ctr: r.impressions ? r.clicks / r.impressions * 100 : null, cpc: r.clicks ? r.cost / r.clicks : null,
      cpl: Number(r.conversions) ? r.cost / r.conversions : null }));
    out += `<div class="card"><div class="cardhead"><div><h3>Campaigns</h3>
      <p class="sub">Who runs each campaign, what it cost and what it produced</p></div></div>
      ${dataTable('campaigns', [
        { k:'campaign', label:'Campaign' }, { k:'managed_by', label:'Managed by' }, { k:'campaign_type', label:'Type' },
        { k:'status', label:'Status' }, { k:'cost', label:'Spend', num:1, fmt:money2 }, { k:'impressions', label:'Shown', num:1, fmt:v => fmt(v) },
        { k:'clicks', label:'Clicks', num:1, fmt:v => fmt(v) }, { k:'ctr', label:'CTR', num:1, fmt:pct1 }, { k:'cpc', label:'Avg CPC', num:1, fmt:money2 },
        { k:'conversions', label:'Leads', num:1, fmt:v => fmt(v, v % 1 ? 1 : 0) }, { k:'cpl', label:'Cost / lead', num:1, fmt:money2 },
        { k:'search_is', label:'Impr. share', num:1, fmt:share }, { k:'budget_lost_is', label:'Lost: budget', num:1, fmt:share },
        { k:'rank_lost_is', label:'Lost: rank', num:1, fmt:share }], rows, { sort:{ k:'cost', dir:-1 }, filter:false, maxH:400 })}</div>`;
  }

  /* Leads by type */
  if (V.pconv.length){
    const by = {}; V.pconv.forEach(r => { const k = r.action; by[k] ??= { action:k, category:r.category, conversions:0, campaigns:new Set() };
      by[k].conversions += Number(r.conversions || 0); by[k].campaigns.add(r.campaign); });
    const rows = Object.values(by).filter(r => r.conversions > 0).map(r => ({ ...r, campaigns:[...r.campaigns].join(', ') }));
    if (rows.length) out += `<div class="card"><div class="cardhead"><div><h3>What counted as a lead</h3>
      <p class="sub">Each lead by the action Google recorded. A call click is a tap on the call button — the call itself is not confirmed by Google</p></div></div>
      ${dataTable('leadtypes', [{ k:'action', label:'Action' }, { k:'category', label:'Type' },
        { k:'conversions', label:'Leads', num:1, fmt:v => fmt(v, v % 1 ? 1 : 0) }, { k:'campaigns', label:'Campaign' }], rows,
        { sort:{ k:'conversions', dir:-1 }, filter:false, maxH:300 })}</div>`;
  }

  /* Search terms — the spreadsheet */
  if (V.pst.length){
    const rows = V.pst.map(r => ({ ...r, cost: Number(r.cost), conversions: Number(r.conversions),
      ctr: r.impressions ? r.clicks / r.impressions * 100 : null, cpc: r.clicks ? r.cost / r.clicks : null }));
    rows.forEach(r => { r.neg = negFor(r.search_term) ? 1 : 0; });
    out += `<div class="card"><div class="cardhead"><div><h3>Every search term</h3>
      <p class="sub">What people actually typed into Google before seeing the ad — ${fmt(rows.length)} terms, ${fmt(sum(rows,'clicks'))} clicks, ${money2(stCost)}.
      Tick <b>Block</b> on any search that is not a job you want, and it goes to the Negative Keywords list for us to stop the ads showing on it.</p></div></div>
      ${dataTable('searchterms', [
        { k:'neg', label:'Block', fmt:(v, r) => negBox(r) },
        { k:'search_term', label:'Search term' }, { k:'campaign', label:'Campaign' }, { k:'ad_group', label:'Ad group' },
        { k:'match_type', label:'Matched as' }, { k:'impressions', label:'Shown', num:1, fmt:v => fmt(v) },
        { k:'clicks', label:'Clicks', num:1, fmt:v => fmt(v) }, { k:'ctr', label:'CTR', num:1, fmt:pct1 },
        { k:'cost', label:'Spend', num:1, fmt:money2 }, { k:'cpc', label:'Avg CPC', num:1, fmt:money2 },
        { k:'conversions', label:'Leads', num:1, fmt:v => fmt(v, v % 1 ? 1 : 0) }, { k:'status', label:'Keyword status' }],
        rows, { sort:{ k:'cost', dir:-1 },
          note:`Google only discloses search terms that enough people searched; the rest are hidden from every advertiser. Terms listed here account for ${pct1(cmCost ? stCost / cmCost * 100 : null)} of this month’s spend.` })}</div>`;
  }

  /* Keywords */
  if (V.pkw.length){
    const rows = V.pkw.map(r => ({ ...r, cost: Number(r.cost), conversions: Number(r.conversions),
      ctr: r.impressions ? r.clicks / r.impressions * 100 : null, cpc: r.clicks ? r.cost / r.clicks : null }));
    out += `<div class="card"><div class="cardhead"><div><h3>Keywords we bid on</h3>
      <p class="sub">Quality score is Google’s 1–10 rating of the keyword, ad and landing page together</p></div></div>
      ${dataTable('keywords', [
        { k:'keyword', label:'Keyword' }, { k:'match_type', label:'Match' }, { k:'campaign', label:'Campaign' }, { k:'ad_group', label:'Ad group' },
        { k:'quality_score', label:'Quality', num:1, fmt:v => v == null ? '—' : `<span class="rankpill ${v >= 7 ? 'win' : v >= 5 ? 'mid' : 'out'}">${v}/10</span>` },
        { k:'impressions', label:'Shown', num:1, fmt:v => fmt(v) }, { k:'clicks', label:'Clicks', num:1, fmt:v => fmt(v) },
        { k:'ctr', label:'CTR', num:1, fmt:pct1 }, { k:'cost', label:'Spend', num:1, fmt:money2 }, { k:'cpc', label:'Avg CPC', num:1, fmt:money2 },
        { k:'conversions', label:'Leads', num:1, fmt:v => fmt(v, v % 1 ? 1 : 0) }, { k:'search_is', label:'Impr. share', num:1, fmt:share }],
        rows, { sort:{ k:'cost', dir:-1 }, maxH:420 })}</div>`;
  }

  /* Where, when, on what */
  const seg = d => V.pseg.filter(r => r.dimension === d).map(r => ({ ...r, cost: Number(r.cost), conversions: Number(r.conversions) }));
  const leadTag = r => r.conversions ? ` · ${fmt(r.conversions, r.conversions % 1 ? 1 : 0)} lead${r.conversions === 1 ? '' : 's'}` : '';
  const dev = seg('device').sort((a, b) => b.cost - a.cost), dow = seg('day_of_week').sort((a, b) => a.label.localeCompare(b.label)),
        hr = seg('hour').sort((a, b) => a.label.localeCompare(b.label)), loc = seg('location');
  if (dev.length || dow.length) out += `<div class="grid2">
    ${dev.length ? `<div class="card"><div class="cardhead"><div><h3>By device</h3><p class="sub">Spend, with leads</p></div></div>${barList(dev, { extra: leadTag })}</div>` : ''}
    ${dow.length ? `<div class="card"><div class="cardhead"><div><h3>By day of week</h3><p class="sub">Spend, with leads</p></div></div>${barList(dow, { label: r => r.label.slice(2), extra: leadTag })}</div>` : ''}</div>`;
  if (hr.length) out += `<div class="card"><div class="cardhead"><div><h3>By hour of day</h3><p class="sub">Spend by the hour the ad was clicked (account time zone)</p></div></div>
    ${barList(hr, { label: r => `${r.label}:00`, extra: leadTag })}</div>`;
  if (loc.length){
    const rows = loc.map(r => ({ ...r, cpc: r.clicks ? r.cost / r.clicks : null, neg: negFor(r.label, 'location') ? 1 : 0 }));
    out += `<div class="card"><div class="cardhead"><div><h3>Where the people clicking are</h3>
      <p class="sub">The suburb Google placed each searcher in. Smaller suburbs are grouped as “All other locations”.
      Tick <b>Exclude</b> on anywhere you don’t service, and we’ll stop the ads showing there.</p></div></div>
      ${dataTable('locations', [{ k:'neg', label:'Exclude', fmt:(v, r) => r.label === 'All other locations' ? '' : negBox(r, 'location') },
        { k:'label', label:'Location' }, { k:'impressions', label:'Shown', num:1, fmt:v => fmt(v) },
        { k:'clicks', label:'Clicks', num:1, fmt:v => fmt(v) }, { k:'cost', label:'Spend', num:1, fmt:money2 }, { k:'cpc', label:'Avg CPC', num:1, fmt:money2 },
        { k:'conversions', label:'Leads', num:1, fmt:v => fmt(v, v % 1 ? 1 : 0) }], rows, { sort:{ k:'cost', dir:-1 }, filter:false, maxH:420 })}</div>`;
  }

  /* Month on month, every month on record */
  const months = [...new Set(RAW.paid.map(r => monthOf(r.date)))].sort();
  if (months.length > 1){
    const rows = months.map(m => { const r = RAW.paid.filter(x => monthOf(x.date) === m), s = sum(r,'spend'), c = sum(r,'clicks'), l = sum(r,'leads');
      return { month: m, label: monthName(m), spend: s, clicks: c, leads: l, cpc: c ? s / c : null, cpl: l ? s / l : null,
        who: [...new Set(RAW.pcm.filter(x => monthOf(x.month) === m).map(x => x.managed_by))].join(', ') }; });
    out += `<div class="card"><div class="cardhead"><div><h3>Month on month</h3><p class="sub">Every month on record</p></div></div>
      ${dataTable('mom', [{ k:'month', label:'Month', fmt:(v, r) => r.label }, { k:'who', label:'Managed by' }, { k:'spend', label:'Spend', num:1, fmt:money2 },
        { k:'clicks', label:'Clicks', num:1, fmt:v => fmt(v) }, { k:'cpc', label:'Avg CPC', num:1, fmt:money2 },
        { k:'leads', label:'Leads', num:1, fmt:v => fmt(v) }, { k:'cpl', label:'Cost / lead', num:1, fmt:money2 }], rows,
        { sort:{ k:'month', dir:1 }, filter:false, maxH:320 })}</div>`;
  }
  return out;
}

/* ---------------------------------------------------------------- negative keywords
   The client ticks a search term; it lands in md_negative_requests at 'requested'. The
   Ads manager is told (routine posts new rows to Slack, then stamps notified_at), adds the
   negative in Google Ads, and an admin marks it 'added'. Nothing here writes to Google Ads. */
const negFor = (t, kind = 'keyword') => (RAW.neg || []).find(n => (n.kind || 'keyword') === kind && n.search_term.toLowerCase() === String(t).toLowerCase());
function negBox(r, kind = 'keyword'){
  const term = kind === 'location' ? r.label : r.search_term;
  const n = negFor(term, kind), locked = n && n.status !== 'requested';
  const ask = kind === 'location' ? 'Ask us to stop ads showing to people in this location' : 'Ask us to stop ads showing on this search';
  return `<label class="negbox" title="${n ? (locked ? 'Already ' + n.status : 'Requested — untick to cancel') : ask}">
    <input type="checkbox" data-neg="${esc(term)}" data-kind="${kind}" data-camp="${esc(r.campaign || '')}" data-ag="${esc(r.ad_group || '')}"
      ${n ? 'checked' : ''} ${locked ? 'disabled' : ''}></label>`;
}
async function toggleNeg(box){
  const term = box.dataset.neg, kind = box.dataset.kind || 'keyword', have = negFor(term, kind);
  box.disabled = true;
  if (box.checked && !have){
    const { data, error } = await sb.from('md_negative_requests')
      .insert({ client_id: RAW.client.id, kind, search_term: term, campaign: box.dataset.camp || null, ad_group: box.dataset.ag || null })
      .select().single();
    if (error){ box.checked = false; toast('Could not save: ' + error.message, 'bad'); }
    else { RAW.neg.push(data); toast(`“${term}” added to the ${kind === 'location' ? 'excluded locations' : 'negative keywords'} list`); }
  } else if (!box.checked && have){
    const { error } = await sb.from('md_negative_requests').delete().eq('id', have.id);
    if (error){ box.checked = true; toast('Could not remove: ' + error.message, 'bad'); }
    else { RAW.neg = RAW.neg.filter(n => n.id !== have.id); toast(`“${term}” removed from the list`); }
  }
  box.disabled = false;
  const tab = $('#tabs .tab[data-tab="negatives"] .tcount'); if (tab) tab.textContent = negOpen() || '';
}
const negOpen = () => (RAW.neg || []).filter(n => n.status === 'requested').length;
async function setNegStatus(id, status){
  const { data, error } = await sb.from('md_negative_requests')
    .update({ status, actioned_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) return toast('Could not update: ' + error.message, 'bad');
  RAW.neg = RAW.neg.map(n => n.id === id ? data : n); renderAll();
}
function toast(msg, sev = 'good'){
  const t = el(`<div class="toast ${sev}">${esc(msg)}</div>`); document.body.appendChild(t);
  const v = EMBED && onScreen();
  if (v) Object.assign(t.style, { position: 'absolute', top: (v.top + v.height - 70) + 'px', bottom: 'auto' });
  setTimeout(() => t.remove(), 3200);
}

function viewNegatives(){
  let out = head('Negative Keywords', 'Searches and locations we have been asked to block',
    'Every search term ticked “Block” and every location ticked “Exclude” on the Paid Ads tab. Once it is added in Google Ads, the ads stop showing on that search or in that area.');
  const list = (RAW.neg || []).slice();
  if (!list.length)
    return out + emptyState('Nothing requested yet',
      'Open the Paid Ads tab and tick Block on a search that is not a job you want, or Exclude on a location you don’t service. It appears here straight away.');
  /* What each blocked term had cost, across every month on record */
  const src = n => (n.kind || 'keyword') === 'location'
    ? RAW.pseg.filter(r => r.dimension === 'location' && r.label.toLowerCase() === n.search_term.toLowerCase())
    : RAW.pst.filter(r => r.search_term.toLowerCase() === n.search_term.toLowerCase());
  const rows = list.map(n => ({ ...n, type: (n.kind || 'keyword') === 'location' ? 'Location' : 'Search term',
    spent: src(n).reduce((t, r) => t + Number(r.cost || 0), 0), clicks: sum(src(n), 'clicks'),
    when: new Date(n.requested_at).toLocaleDateString('en-AU', { day:'2-digit', month:'2-digit', year:'numeric' }) }));
  const open = rows.filter(r => r.status === 'requested'), done = rows.filter(r => r.status === 'added');
  const nk = rows.filter(r => r.type === 'Search term').length, nl = rows.length - nk;
  out += `<p class="lede">${[nk && `${fmt(nk)} search term${nk === 1 ? '' : 's'}`, nl && `${fmt(nl)} location${nl === 1 ? '' : 's'}`].filter(Boolean).join(' and ')} flagged so far. ${fmt(done.length)} ${done.length === 1 ? 'has' : 'have'} been added as negative keywords in Google Ads${open.length ? ` and ${fmt(open.length)} ${open.length === 1 ? 'is' : 'are'} waiting to be added` : ''}.
    Together they had cost ${money2(sum(rows,'spent'))} across ${fmt(sum(rows,'clicks'))} clicks before being flagged.</p>`;
  out += `<div class="kpis">${kpi('Waiting to be added', fmt(open.length))}${kpi('Added in Google Ads', fmt(done.length))}
    ${kpi('Spend on these searches', money2(sum(rows,'spent')), 'Before they were flagged')}</div>`;
  const isAdmin = state.role === 'admin';
  const statusFmt = (v, r) => {
    const pill = `<span class="rankpill ${v === 'added' ? 'win' : v === 'declined' ? 'out' : 'mid'}">${v === 'added' ? 'Added in Google Ads' : v === 'declined' ? 'Kept running' : 'Waiting'}</span>`;
    return isAdmin && v === 'requested'
      ? `${pill} <button class="btn mini" data-negset="${r.id}:added">Mark added</button> <button class="btn mini" data-negset="${r.id}:declined">Keep running</button>`
      : pill; };
  out += `<div class="card"><div class="cardhead"><div><h3>The list</h3><p class="sub">Newest first</p></div></div>
    ${dataTable('negatives', [{ k:'search_term', label:'Search term / location' }, { k:'type', label:'Type' }, { k:'campaign', label:'Campaign' },
      { k:'requested_by_email', label:'Flagged by' }, { k:'requested_at', label:'Flagged on', fmt:(v, r) => r.when },
      { k:'clicks', label:'Clicks', num:1, fmt:v => fmt(v) }, { k:'spent', label:'Spend', num:1, fmt:money2 },
      { k:'status', label:'Status', fmt:statusFmt }, { k:'status_note', label:'Note' }], rows,
      { sort:{ k:'requested_at', dir:-1 }, maxH:560 })}</div>`;
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
  if (EMBED) document.documentElement.classList.add('embed');
  document.title = `${CFG.name} — Marketing Dashboard`;
  document.body.innerHTML = `
  <header class="top"><div class="wrap topin">
    ${CFG.logo ? `<span class="${CFG.logoChip ? 'logochip' : ''}"><img class="logo" src="${CFG.logo.includes('/') ? CFG.logo : '../../assets/' + CFG.logo}" alt="${CFG.name}"></span>` : ''}
    <span class="name">${CFG.name}</span>
    <span class="spacer"></span>
    <span class="stamp" id="stamp"></span>
    <button class="btn" id="signout">Sign out</button>
  </div></header>
  <div class="team"><div class="wrap teamin">
    <span class="mlbl">Delivered by</span>${CFG.r2rLogo
      ? `<img class="r2rlogo" src="${CFG.r2rLogo}" alt="Ready to Rank">`
      : '<span style="font-weight:700;font-size:13px">Ready to Rank</span>'}
    <span class="spacer"></span><span class="mlbl" id="monthlabel"></span>
  </div></div>
  <nav class="tabs"><div class="wrap tabsin" id="tabs" role="tablist"></div></nav>
  <div class="monthbar"><div class="wrap monthin" id="monthchips"></div></div>
  <main><div class="wrap" id="panel"></div></main>
  <footer class="foot"><div class="wrap footin">
    <span>${CFG.name} · prepared by Ready to Rank</span>
    <span>Sources: ${[enabled('seo') && 'SE Ranking · Google Search Console · GA4', enabled('gbp') && 'Google Business Profile',
      enabled('paid_ads') && 'Google Ads', (enabled('map_grid') || enabled('geo')) && 'DataForSEO'].filter(Boolean).join(' · ')}</span>
  </div></footer>`;

  /* Spreadsheet tables: sort / filter / CSV, delegated so re-renders need no rewiring. */
  const panel = $('#panel');
  panel.addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (th){ const [id, k] = th.dataset.sort.split(':'), t = TABLES[id]; if (!t) return;
      t.sort = { k, dir: t.sort.k === k ? -t.sort.dir : (t.cols.find(c => c.k === k)?.num ? -1 : 1) }; dtRender(id); return; }
    const b = e.target.closest('[data-csv]'); if (b) dtCsv(b.dataset.csv);
    if (e.target.closest('[data-linkinfo]')) { showOffer('links'); return; }
    const ns = e.target.closest('[data-negset]');
    if (ns){ const [id, st] = ns.dataset.negset.split(':'); setNegStatus(id, st); }
  });
  panel.addEventListener('change', e => { const b = e.target.closest('input[data-neg]'); if (b) toggleNeg(b); });
  panel.addEventListener('input', e => {
    const i = e.target.closest('[data-tfilter]'); if (!i) return;
    const t = TABLES[i.dataset.tfilter]; if (t){ t.q = i.value; dtRender(i.dataset.tfilter); }
  });

  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab'); if (!b) return;
    const m = b.dataset.tab;
    if (!enabled(m)) return showLock(m);      /* locked = upsell, not an error */
    state.tab = m; history.replaceState(null, '', '#' + m); renderAll();
    if (EMBED) try { window.parent.postMessage({ r2rDashboardTab: m }, location.origin); } catch (e) {}
  });
  $('#monthchips').addEventListener('click', e => {
    const b = e.target.closest('.mchip'); if (!b) return;
    state.month = b.dataset.m; applyMonth(); renderAll();
  });
  $('#signout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });

  let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(drawCharts, 180); });
}

/* Sign-in: an emailed one-time code by default, the same as the content hub, so a
   client has one email address and no password for both. Staff with a password can
   still use it. shouldCreateUser:false — a code is only ever sent to an existing login. */
function renderGate(msg){
  document.documentElement.style.setProperty('--accent', CFG.accent || '#17B4F0');
  const card = (inner) => { document.body.innerHTML = `<div class="gate"><form class="gate-card" id="gf">
    <h1>${CFG.name}</h1>${inner}<div class="gate-err">${msg || ''}</div></form></div>`; msg = ''; };
  const err = t => $('.gate-err').textContent = t;

  const askEmail = () => {
    card(`<p>Marketing dashboard. Enter your email and we’ll send you a sign-in code.</p>
      <input type="email" id="email" placeholder="Email" autocomplete="username" required>
      <button type="submit">Email me a code</button>
      <p class="gate-alt"><a href="#" id="usepw">Sign in with a password instead</a></p>`);
    $('#usepw').addEventListener('click', e => { e.preventDefault(); askPassword(); });
    $('#gf').addEventListener('submit', async e => {
      e.preventDefault();
      const email = $('#email').value.trim(), b = $('#gf button'); b.disabled = true; b.textContent = 'Sending…';
      const { error } = await sb.auth.signInWithOtp({ email,
        options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
      if (error){ b.disabled = false; b.textContent = 'Email me a code';
        return err(/not.*found|signups not allowed/i.test(error.message)
          ? 'That email doesn’t have access to this dashboard. Check the address, or ask your account manager.' : error.message); }
      askCode(email);
    });
  };

  const askCode = (email) => {
    card(`<p>We’ve emailed a sign-in code to <b>${esc(email)}</b>. Enter it below.</p>
      <input type="text" id="code" inputmode="numeric" autocomplete="one-time-code" placeholder="Sign-in code" required>
      <button type="submit">Sign in</button>
      <p class="gate-alt"><a href="#" id="back">Use a different email</a></p>`);
    $('#back').addEventListener('click', e => { e.preventDefault(); askEmail(); });
    $('#gf').addEventListener('submit', async e => {
      e.preventDefault();
      const { error } = await sb.auth.verifyOtp({ email, token: $('#code').value.replace(/\s/g, ''), type: 'email' });
      if (error) return err('That code didn’t work. It may have expired — go back and request a new one.');
      start();
    });
  };

  const askPassword = () => {
    card(`<p>Marketing dashboard. Sign in with your password.</p>
      <input type="email" id="email" placeholder="Email" autocomplete="username" required>
      <input type="password" id="password" placeholder="Password" autocomplete="current-password" required>
      <button type="submit">Sign in</button>
      <p class="gate-alt"><a href="#" id="usecode">Email me a code instead</a></p>`);
    $('#usecode').addEventListener('click', e => { e.preventDefault(); askEmail(); });
    $('#gf').addEventListener('submit', async e => {
      e.preventDefault();
      const { error } = await sb.auth.signInWithPassword({
        email: $('#email').value.trim(), password: $('#password').value });
      if (error) return err(error.message);
      start();
    });
  };
  askEmail();
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
