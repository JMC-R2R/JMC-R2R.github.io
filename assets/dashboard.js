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

const state = { role:null, realRole:null, view:'admin', tab:'overview', month:null, months:[] };
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
  /* ...and page in primary-key order. Unordered pages can repeat some rows and skip others:
     on 11/10/2026 Polarity's 1,455 map grid squares came back as 1,121 distinct ones and a
     whole scan vanished. */
  const PK = { md_rankings: 'checked_at,keyword,search_engine', md_paid_search_terms: 'month,campaign,ad_group,search_term,match_type',
    md_paid_keywords: 'month,campaign,ad_group,keyword,match_type', md_paid_segments: 'month,dimension,label',
    md_geo_share: 'checked_at,engine,brand', md_negative_requests: 'id', md_seo_queries: 'month,query',
    md_gbp_search_keywords: 'month,keyword', md_gbp_review_list: 'review_id', md_work_log: 'id', md_paid_calls: 'started_at,call_id',
    md_social_posts: 'post_date,platform,url', md_report_history: 'date', md_ai_overview_keywords: 'month,keyword', md_gen_ai_daily: 'date' };
  const ordered = (b, cols) => (cols || '').split(',').filter(Boolean).reduce((x, c) => x.order(c), b);
  const qAll = async (t, dateCol) => { let out = [], i = 0;
    for (;;) { const { data, error } = await ordered(q(t, dateCol), PK[t]).range(i, i + 999);
      if (error || !data) return { data: out, error }; out = out.concat(data);
      if (data.length < 1000) return { data: out }; i += 1000; } };

  const [seo, gbp, rev, geo, paid, social, leads, ranks, scans, refresh,
         pcm, pst, pkw, pseg, pconv, gshare, neg, sq, gkw, grl, wlog, notes, pcalls, sposts] = await Promise.all([
    q('md_seo_daily','date'), q('md_gbp_daily','date'), q('md_gbp_reviews'), q('md_geo_visibility'),
    q('md_paid_daily','date'), q('md_social_daily','date'), q('md_leads_daily','date'),
    qAll('md_rankings'), q('md_mapgrid_scans'), q('md_refresh_log'),
    /* Google Ads detail — monthly tables. A client without them just gets empty arrays. */
    q('md_paid_campaign_month','month'), qAll('md_paid_search_terms','month'), qAll('md_paid_keywords','month'),
    qAll('md_paid_segments','month'), q('md_paid_conversions','month'), qAll('md_geo_share'),
    qAll('md_negative_requests'), qAll('md_seo_queries','month'), qAll('md_gbp_search_keywords','month'), qAll('md_gbp_review_list'), qAll('md_work_log','month'),
    /* Team notes per month: the same table and rpt_add_insight as the Savvas dashboards. */
    q('rpt_social_annotations'),
    /* Google forwarding number call log. Rows only exist for accounts the feed pulls. */
    qAll('md_paid_calls','started_at'),
    /* Organic posts, for the Social tab. */
    qAll('md_social_posts'),
  ]);
  /* Extended reporting: read only for clients it is switched on for. */
  if (RP()){
    const [hist, aio, genai, aiq] = await Promise.all([qAll('md_report_history'), qAll('md_ai_overview_keywords'), qAll('md_gen_ai_daily'), sb.from('md_ai_questions').select('*').eq('client_id', id).order('created_at')]);
    RAW.hist = hist.data || []; RAW.aio = aio.data || []; RAW.genai = genai.data || []; RAW.aiq = aiq.data || [];
  }
  RAW.notes = notes.data || [];
  RAW.calls = pcalls.data || [];
  RAW.sposts = sposts.data || [];
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
      const { data } = await sb.from('md_mapgrid_points').select('*').in('scan_id', ids).order('scan_id').order('idx').range(i, i + 999);
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
  if (RP()) rpBuild();
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
  V.social = RAW.social.filter(r => inM(r,'date'));  V.socialPrev = RAW.social.filter(r => inP(r,'date'));
  V.sposts = (RAW.sposts || []).filter(r => inM(r,'post_date'));
  V.leads  = RAW.leads.filter(r => inM(r,'date'));
  V.geo    = RAW.geo.filter(r => inM(r,'checked_at'));
  V.paidPrev = RAW.paid.filter(r => inP(r,'date'));
  V.pcm  = RAW.pcm.filter(r => inM(r,'month'));   V.pcmPrev = RAW.pcm.filter(r => inP(r,'month'));
  V.pst  = RAW.pst.filter(r => inM(r,'month'));
  V.sq   = RAW.sq.filter(r => inM(r,'month'));
  V.pkw  = RAW.pkw.filter(r => inM(r,'month'));
  V.pseg = RAW.pseg.filter(r => inM(r,'month'));
  V.pconv= RAW.pconv.filter(r => inM(r,'month'));
  V.calls = RAW.calls.filter(r => inM(r,'started_at'));  V.callsPrev = RAW.calls.filter(r => inP(r,'started_at'));
  /* AI visibility is a snapshot: latest check on or before the month. The comparison is
     the LAST check of an earlier month (the month-end reading), never a second check in
     the same month, so the trend reads month on month. */
  const geoDates = [...new Set(RAW.geo.map(r => r.checked_at))].filter(d => monthOf(d) <= m).sort();
  V.geoAsOf = geoDates[geoDates.length - 1] || null;
  V.geoPrevAsOf = V.geoAsOf ? geoDates.filter(d => monthOf(d) < monthOf(V.geoAsOf)).pop() || null : null;
  V.geoSnap = V.geoAsOf ? RAW.geo.filter(r => r.checked_at === V.geoAsOf) : [];
  V.geoPrevSnap = V.geoPrevAsOf ? RAW.geo.filter(r => r.checked_at === V.geoPrevAsOf) : [];
  V.gshare = V.geoAsOf ? RAW.gshare.filter(r => r.checked_at === V.geoAsOf) : [];
  V.gsharePrev = V.geoPrevAsOf ? RAW.gshare.filter(r => r.checked_at === V.geoPrevAsOf) : [];

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
  /* Last month's grid, per keyword: the latest scan of the latest earlier month. Only scans
     at the same zoom compare — the 15z scans before 11/10/2026 measured a street-level view. */
  const prevM2 = V.scanAsOf ? sc.filter(r => monthOf(r.checked_at) < V.scanAsOf).map(r => monthOf(r.checked_at)).pop() : null;
  const zooms = new Set(V.scans.map(s => s.zoom));
  const prevLatest = {};
  (prevM2 ? sc.filter(r => monthOf(r.checked_at) === prevM2 && zooms.has(r.zoom)) : []).forEach(r => {
    const k = r.keyword.toLowerCase(), t = r.scanned_at || r.checked_at;
    if (!prevLatest[k] || String(t) > String(prevLatest[k].scanned_at || prevLatest[k].checked_at)) prevLatest[k] = r; });
  V.scansPrev = prevLatest;
  V.scanPrevMonth = Object.keys(prevLatest).length ? prevM2 : null;
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
const enabled = m => m === 'overview' || m === 'review' || isAdm(m) || !!CFG.modules[modOf(m)]?.enabled;
const visible = () => ORDER.filter(m => m === 'overview' || CFG.modules[modOf(m)])
  .flatMap(m => m === 'paid_ads' && reviewOn() ? [m, 'review'] : [m]).concat(adminOn() ? ADMIN_ORDER : []);

function kpi(label, value, foot){
  return `<div class="kpi"><span class="mlbl">${label}</span>
    <div class="v tnum">${value}</div>${foot ? `<div class="fn">${foot}</div>` : ''}</div>`;
}
function chipFor(cur, prev){
  const d = delta(cur, prev);
  return `<span class="chip ${d.cls}">${d.txt}</span>`;
}
/* Month-on-month change as an absolute number ("+3 vs Sep"). Small counts like "named in 4
   answers" move from 0, where a percentage is meaningless. lowerIsBetter for positions. */
/* True when a's month is the calendar month straight before b's. */
function isPrevMonth(a, b){
  const d = new Date(monthOf(b) + '-01T00:00:00'); d.setMonth(d.getMonth() - 1);
  return monthOf(a) === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function stepChip(cur, prev, label, { dp = 0, lowerIsBetter = false } = {}){
  if (cur == null || prev == null) return '';
  const d = Number(cur) - Number(prev), good = lowerIsBetter ? d < 0 : d > 0;
  const cls = Math.abs(d) < (dp ? 0.05 : 0.5) ? 'flat' : good ? 'up' : 'dn';
  return `<span class="chip ${cls}">${d > 0 ? '+' : ''}${fmt(d, dp)} vs ${label}</span>`;
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
  const btn = m => { const lock = !enabled(m);
    return `<button class="tab${lock ? ' locked' : ''}${isAdm(m) ? ' adm' : ''}" data-tab="${m}" role="tab"
      aria-selected="${state.tab === m}">${LABEL[m]}${m === 'negatives' ? `<span class="tcount">${negOpen() || ''}</span>` : ''}${isAdm(m) ? admCount(m) : ''}</button>`; };
  const v = visible(), client = v.filter(m => !isAdm(m)), adm = v.filter(isAdm);
  /* Admin tabs get their own row (each row scrolls on its own), so none hide off the edge. */
  bar.classList.toggle('stack', adm.length > 0);
  bar.innerHTML = adm.length
    ? `<div class="trow">${client.map(btn).join('')}</div><div class="trow admrow"><span class="tabsep" aria-hidden="true">Admin</span>${adm.map(btn).join('')}</div>`
    : client.map(btn).join('');
  /* The month bar sticks under the tab bar, whose height now depends on the rows. */
  const nav = $('nav.tabs'), mb = $('.monthbar');
  if (!EMBED && nav && mb) mb.style.top = ((parseFloat(getComputedStyle(nav).top) || 0) + nav.offsetHeight) + 'px';
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
    adm_onboarding: viewAdmOnboarding, adm_call: viewAdmCall, adm_discovery: viewAdmDiscovery,
    adm_brief: viewAdmBrief, adm_launch: viewAdmLaunch, adm_plan: viewAdmPlan, review: viewReview,
  }[state.tab] || (() => emptyState('Unknown tab', 'Nothing to render.')))();
  /* The admin tabs are not month-scoped, so the month bar would only mislead there. */
  const mb = $('.monthbar'); if (mb) mb.style.display = isAdm(state.tab) ? 'none' : '';
  $('#monthlabel').textContent = monthName(state.month);
  drawCharts(); wireTables();
  /* The refresh log is admin-only, so a client falls back to the newest dated row. */
  const newest = [...RAW.seo, ...RAW.gbp, ...RAW.paid].map(r => r.date).filter(Boolean).sort().pop();
  $('#stamp').textContent = RAW.refresh?.length
    ? 'Data as at ' + new Date(RAW.refresh.map(r => r.finished_at).filter(Boolean).sort().pop() || Date.now())
        .toLocaleDateString('en-AU')
    : newest ? 'Data to ' + new Date(newest + 'T00:00:00').toLocaleDateString('en-AU') : '';
  tourAfterRender();
}

/* ---------------------------------------------------------------- walkthrough
   Jose 02/11/2026: when a section goes live, walk the client through it. Switched on per
   client with `walkthrough: true` in the shell config, so it can be proved on Hot Chicken
   before anyone else sees it. Runs once per section per browser, for the client view only
   (staff working in Admin view are not interrupted; "Show me around" replays it for anyone).
   A section with no data has no .lede/.kpis, so its empty state never gets a tour: the tour
   appears the first time there is something real to show. Copy is written with no figures,
   so it can never disagree with the numbers on the page. */
const TOUR_INTRO = {
  overview: ['Your overview', 'Everything we are doing for you, on one page. Here is how to read it.'],
  seo: ['Your SEO results', 'How the website is performing in Google, and the work we finished this month.'],
  map_grid: ['Your Google Maps position', 'Where the business shows up on Google Maps across your service area.'],
  gbp: ['Your Google Business Profile', 'How people found your profile and what they did next, including every review.'],
  geo: ['Your AI visibility', 'Whether AI assistants name your business when people ask them for a recommendation.'],
  paid_ads: ['Your Google Ads', 'This section is now live. It shows what was spent, what it bought and what people typed into Google before they clicked.'],
  negatives: ['Your blocked searches', 'Every search or suburb you have asked us to stop paying for, and where each one is up to.'],
  social: ['Your social media', 'How your organic posts performed this month.'],
  leads_crm: ['Your leads', 'The enquiries that came through this month.'],
};
const tourCard = t => $$('#panel .card').find(c => (c.querySelector('h3')?.textContent || '').trim().startsWith(t));
const tourCommon = [
  { el: () => $('#panel .lede'), t: 'The month in a sentence', p: 'Each section opens with a plain-English summary, written from that month\'s real figures.' },
  { el: () => $('#panel .kpis'), t: 'The key numbers', p: 'The figures that matter most, with the change on last month where there is one to compare.' },
  { el: () => $('#panel .callout'), t: 'What it means', p: 'These notes point out what the numbers are telling us, so you do not have to work it out.' },
];
const tourMonth = { el: () => $('.monthbar'), t: 'Pick a month', p: 'Use these buttons to look back at any month. Everything on the page changes with it.' };
const TOUR_EXTRA = {
  overview: [
    { el: () => [...$$('#panel .eyebrow')].find(e => e.textContent.trim() === 'Share of voice'), t: 'Share of voice', p: 'How often you show up compared with your competitors, in the places your customers look.' },
    { el: () => $('#tabs'), t: 'Every section', p: 'Each tab goes deeper on one service, and a padlock marks something not in your package.' },
  ],
  seo: [
    { el: () => tourCard('Accomplished in'), t: 'What we finished', p: 'The work we completed this month. Each item is proven from the website, your profile or the hub.' },
    { el: () => tourCard('Clicks and impressions') || tourCard('Google Search Console Data'), t: 'Google traffic', p: 'How often the website appeared in Google and how often people clicked through.' },
    { el: () => tourCard('Target keywords we track'), t: 'Your keywords', p: 'Where you rank for the searches we are working to win. You can sort, filter or download any table like this.' },
  ],
  map_grid: [
    { el: () => tourCard('By keyword') || tourCard('Latest scan'), t: 'Each search, on the map', p: 'Your position across your service area for each search. Each point is one spot on the map.' },
    { el: () => tourCard('Who is #1'), t: 'Who you are up against', p: 'The businesses ranking first across the grid.' },
  ],
  gbp: [
    { el: () => tourCard('Where the views came from'), t: 'Where people saw you', p: 'Whether they found your profile on Google Search or Maps.' },
    { el: () => tourCard('What people did'), t: 'What they did next', p: 'The calls, website clicks and direction requests that came from your profile.' },
    { el: () => tourCard('Every Google review'), t: 'Your reviews', p: 'Every review, in one list.' },
  ],
  geo: [
    { el: () => tourCard('By assistant'), t: 'Assistant by assistant', p: 'How often each AI assistant named your business.' },
    { el: () => tourCard('Who the assistants recommend'), t: 'Who gets recommended', p: 'The businesses the assistants named when they were asked.' },
    { el: () => tourCard('Every question and answer'), t: 'Read it for yourself', p: 'Every question we asked and the answer it gave.' },
  ],
  paid_ads: [
    { el: () => tourCard('Campaigns'), t: 'Your campaigns', p: 'Each campaign, who manages it, what it cost and the leads it produced.' },
    { el: () => tourCard('What counted as a lead'), t: 'What counts as a lead', p: 'Exactly what Google recorded as a lead. We show this so you can check it against the calls and enquiries you actually got.' },
    { el: () => tourCard('Every search term'), t: 'What people searched', p: 'What people typed into Google before your ad showed. See one that is not your kind of job? Tick Block and we will review it. Nothing changes in your ads until we have looked at it.' },
    { el: () => $('#tabs .tab[data-tab="negatives"]'), t: 'Track what you blocked', p: 'Everything you tick lands here, so you can see where each request is up to.' },
  ],
};
let tourNow = null;
function tourKey(tab){ return `md-tour-${CFG.slug}-${tab}`; }
function tourSeen(tab){ try { return !!localStorage.getItem(tourKey(tab)); } catch (e) { return true; } }   /* no storage: never nag */
function tourMark(tab){ try { localStorage.setItem(tourKey(tab), new Date().toISOString()); } catch (e) {} }
function tourEnd(){ if (!tourNow) return; tourNow.nodes.forEach(n => n.remove());
  document.removeEventListener('keydown', tourNow.key); window.removeEventListener('resize', tourNow.draw); tourNow = null; }
function tourSteps(tab){
  const list = [...tourCommon, ...(TOUR_EXTRA[tab] || []), tourMonth];
  return list.map(s => ({ ...s, node: s.el() })).filter(s => s.node && s.node.offsetParent !== null);
}
function tourStart(tab){
  tourEnd();
  const steps = tourSteps(tab), intro = TOUR_INTRO[tab]; if (!steps.length || !intro) return;
  tourMark(tab);
  const ring = el('<div class="tourring" aria-hidden="true"></div>');
  const tip = el(`<div class="tourtip" role="dialog" aria-modal="true" aria-label="Walkthrough"></div>`);
  let i = -1;   /* -1 = the welcome card */
  const draw = () => {
    const pad = 6, W = document.documentElement.clientWidth, w = Math.min(350, W - 32);
    const s = steps[i], view = EMBED && onScreen();
    tip.style.width = w + 'px';
    tip.innerHTML = `<span class="mlbl">${i < 0 ? 'Walkthrough' : `Step ${i + 1} of ${steps.length}`}</span>
      <h4>${esc(i < 0 ? intro[0] : s.t)}</h4><p>${esc(i < 0 ? intro[1] : s.p)}</p>
      <div class="tourbtns"><button class="btn" type="button" data-skip>Skip</button>
        ${i >= 0 ? '<button class="btn" type="button" data-back>Back</button>' : ''}
        <button class="btn primary" type="button" data-next>${i < 0 ? 'Show me around' : i === steps.length - 1 ? 'Finish' : 'Next'}</button></div>`;
    if (i < 0){
      /* Welcome card: dim the page and centre the card in what is actually on screen. */
      ring.style.cssText = `position:absolute;left:-40px;top:${window.scrollY - 40}px;width:0;height:0`;
      tip.style.position = 'absolute';
      const vh = view ? view.height : window.innerHeight, top = (view ? view.top : window.scrollY) + Math.max(16, vh / 2 - 110);
      Object.assign(tip.style, { left: Math.round((W - w) / 2) + 'px', top: Math.round(top) + 'px' });
    } else {
      /* The tab and month bars stay pinned while the page scrolls under them, so a highlight on
         them must be pinned too (a page-positioned one slides away as soon as anything scrolls). */
      const bars = $$('header.top, nav.tabs, .monthbar').filter(b => getComputedStyle(b).position === 'sticky');
      const pinned = bars.some(b => b.contains(s.node));
      const clear = (EMBED ? 72 : bars.reduce((t, b) => t + b.offsetHeight, 0)) + 18;   /* never lit up under a bar */
      /* A tab can sit off the end of the scrolling tab row on a phone: bring it in first. */
      if (s.node.closest('#tabs')) s.node.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'center' });
      /* Scroll FIRST, measure second: measuring before a scroll is what left the box off target. */
      if (!pinned){ s.node.style.scrollMarginTop = clear + 'px'; s.node.scrollIntoView({ behavior: 'instant', block: 'start' }); }
      const r = s.node.getBoundingClientRect(), x = r.left + (pinned ? 0 : window.scrollX), y = r.top + (pinned ? 0 : window.scrollY);
      const vh = view ? view.height : window.innerHeight;
      /* Only a long table is cut short, so its card still sits next to what it describes. */
      const room = Math.max(120, vh - clear - 240);
      const h = (s.node.matches('.card') ? Math.min(r.height, 260, room) : Math.min(r.height, room)) + pad * 2;
      const pos = pinned ? 'fixed' : 'absolute';
      ring.style.cssText = `position:${pos};left:${Math.max(4, x - pad)}px;top:${y - pad}px;width:${Math.min(r.width + pad * 2, W - 8)}px;height:${h}px`;
      Object.assign(tip.style, { position: pos, left: Math.round(Math.max(16, Math.min(x, W - w - 16))) + 'px', top: Math.round(y - pad + h + 12) + 'px' });
      if (!pinned) tip.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    }
    tip.querySelector('[data-next]').focus({ preventScroll: true });
  };
  const go = d => { i += d; if (i >= steps.length) return tourEnd(); if (i < -1) i = -1; draw(); };
  tip.addEventListener('click', e => {
    if (e.target.hasAttribute('data-skip')) return tourEnd();
    if (e.target.hasAttribute('data-back')) return go(-1);
    if (e.target.hasAttribute('data-next')) return go(1);
  });
  const key = e => { if (e.key === 'Escape') tourEnd(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
  document.addEventListener('keydown', key); window.addEventListener('resize', draw);
  document.body.append(ring, tip);
  tourNow = { nodes: [ring, tip], key, draw, tab };
  draw();
}
/* Called at the end of renderAll. The timeout lets the charts draw and the hub resize its frame. */
function tourAfterRender(){
  tourEnd();
  if (!CFG.walkthrough || isAdm(state.tab) || !TOUR_INTRO[state.tab]) return;
  const panel = $('#panel');
  if (!panel.querySelector('.lede, .kpis')) return;   /* not live yet: no tour */
  const sub = panel.querySelector('.sub');
  if (sub) sub.insertAdjacentHTML('afterend', '<button class="btn tourbtn" type="button" data-tour>Show me around</button>');
  const tab = state.tab;
  if (state.role === 'viewer' && !tourSeen(tab)) setTimeout(() => { if (state.tab === tab && !tourNow) tourStart(tab); }, 400);
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

/* CFG.launchDate (YYYY-MM-DD) is the planned ads launch, from the client's YAML. */
function paidLaunchNote(){
  return CFG.launchDate ? 'Campaigns launch ' + new Date(CFG.launchDate + 'T00:00:00').toLocaleDateString('en-AU', { day:'2-digit', month:'2-digit', year:'numeric' })
    : 'Figures start when the campaigns go live';
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
  /* Never a $0 before launch: no ads row ever recorded means the campaigns are not live,
     and a zero there reads as "spent nothing, got nothing" (the Cobalt 0-leads bug). */
  if (on('paid_ads') && !RAW.paid.length) cards.push(kpi('Google Ads', 'Not live yet', paidLaunchNote()));
  else if (on('paid_ads') && !V.paid.length) cards.push(kpi('Ad spend', '—', 'No ad data for this month'));
  else if (on('paid_ads')){ const l = sum(V.paid,'leads');
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

/* Notes from the team for the selected month: what the delivery team's monthly report says
   that the data can't (site health, domain trust, AI answers seen). Never numbers this
   dashboard already measures: the report's date window differs, so they would contradict.
   Stored in rpt_social_annotations, filed by month (ann_date), like the Savvas insights panel.
   A short one-line note ("76, from 73") renders as a tile. A longer one renders as a card:
   blank lines split blocks, a line ending ":" heads a block, "- " lines are items (short
   ones as chips) and a line that is this client's /<slug>/notes/ image path renders as a
   screenshot that opens full size. */
function teamNotes(){
  const notes = (RAW.notes || []).filter(n => n.ann_date && monthOf(n.ann_date) === state.month)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  if (!notes.length) return '';
  const isTile = n => !/\n/.test(n.note || '') && String(n.note || '').length <= 40;
  const tiles = notes.filter(isTile).map(n => {
    const [v, ...rest] = String(n.note).split(', ');
    return kpi(esc(n.label || ''), esc(v), rest.length ? esc(rest.join(', ')) : '');
  });
  const imgRe = new RegExp('^/' + CFG.slug + '/notes/[\\w.-]+\\.(png|jpe?g|webp)$', 'i');
  const block = lines => {
    let out = '', items = [], shots = [];
    const flush = () => {
      if (items.length) {
        const chips = items.every(t => t.length <= 60 && !/\?/.test(t));
        out += chips ? `<div class="nchips">${items.map(t => `<span class="nchip">${esc(t)}</span>`).join('')}</div>`
                     : `<ul class="nlist">${items.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
        items = [];
      }
      if (shots.length) {
        out += `<div class="nshots${shots.length === 1 ? ' one' : ''}">${shots.map(s => `<a href="${esc(s)}" target="_blank" rel="noopener"><img src="${esc(s)}" alt="Screenshot from the team's report" loading="lazy"></a>`).join('')}</div>`;
        shots = [];
      }
    };
    lines.forEach(l => {
      const t = l.trim();
      if (imgRe.test(t)) { shots.push(t); return; }
      if (/^- /.test(t)) { items.push(t.slice(2)); return; }
      flush();
      out += /:$/.test(t) ? `<span class="nsub">${esc(t.slice(0, -1))}</span>` : `<p class="ntext">${esc(t)}</p>`;
    });
    flush();
    return out;
  };
  const cards = notes.filter(n => !isTile(n)).map(n => `<div class="ncard">${n.label ? `<h4>${esc(n.label)}</h4>` : ''}
    ${String(n.note || '').split(/\n\s*\n/).map(b => block(b.split('\n').filter(x => x.trim()))).join('')}</div>`);
  return `<div class="card notes"><div class="cardhead"><div><h3>Notes from the team, ${monthName(state.month)}</h3>
      <p class="sub">From the team's report for the month: what the numbers below don't show.</p></div></div>
    ${tiles.length ? `<div class="kpis">${tiles.join('')}</div>` : ''}${cards.join('')}</div>`;
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

/* ---------------------------------------------------------------- extended reporting
   Jose 04/11/2026, on Unleash, from the Manor build. Off unless the shell sets
   reportPlus: true, so every other client renders exactly as before. The range buttons are a
   deliberate exception to "the calendar month is the only scope control": they apply to the
   Search Console and GA4 graphs and their own tiles, and each states its dates. */
const RP = () => !!CFG.reportPlus;
/* What counts as a search for the business's own name. A first word like "Your" would catch
   ordinary searches, so a client can set brand_pattern in its YAML (Your Body Hub, 06/11/2026). */
function brandPattern(){ return CFG.brandPattern || CFG.name.split(/\s+/)[0].replace(/[^a-z0-9]/gi, ''); }
const RP_RANGES = [{ d:7, l:'7 days' }, { d:30, l:'1 month' }, { d:91, l:'3 months' }, { d:182, l:'6 months' }, { d:487, l:'16 months' }];
const RP_AI_RANGES = [{ m:3, l:'3 months' }, { m:6, l:'6 months' }, { m:16, l:'16 months' }];
const rp = { gsc:91, ga:91, aiRange:6, aiOn:{ aio:true, vis:false, impr:false, clicks:false, gen:false, e_ChatGPT:true, e_Gemini:true, e_Perplexity:true, e_Claude:true }, kw:null, view:'rank' };
const rpDay = s => new Date(s + 'T00:00:00');
const rpYmd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const rpAdd = (s, n) => { const d = rpDay(s); d.setDate(d.getDate() + n); return rpYmd(d); };
const rpAu = s => rpDay(s).toLocaleDateString('en-AU', { day:'2-digit', month:'2-digit', year:'numeric' });
const rpMon = m => rpDay(m + '-01').toLocaleDateString('en-AU', { month:'short', year:'numeric' });
const rpMonthAdd = (m, n) => { const d = rpDay(m + '-01'); d.setMonth(d.getMonth() + n); return rpYmd(d).slice(0, 7); };
const rpHas = (r, k) => r[k] != null;
const rpSum = (a, k) => a.reduce((t, r) => t + (Number(r[k]) || 0), 0);
const rpBtn = (group, val, on, label) => `<button type="button" class="rp-btn${on ? ' on' : ''}" data-rp="${group}" data-v="${esc(String(val))}">${esc(label)}</button>`;

/* One row per day: the long history, with the daily feed's newer figures laid over it. */
function rpBuild(){
  const m = {}; const at = d => (m[d] = m[d] || { date: d });
  (RAW.hist || []).forEach(r => Object.assign(at(r.date), r));
  (RAW.seo || []).forEach(r => { const x = at(r.date);
    if (r.source === 'gsc'){ if (r.clicks != null) x.gsc_clicks = r.clicks; if (r.impressions != null) x.gsc_impressions = r.impressions; if (r.avg_position != null) x.gsc_position = r.avg_position; }
    if (r.source === 'ga4' && r.sessions != null) x.sessions = r.sessions; });
  (RAW.gbp || []).forEach(r => { const x = at(r.date);
    if (r.impr_search_mobile != null || r.impr_search_desktop != null) x.gbp_search = (Number(r.impr_search_mobile) || 0) + (Number(r.impr_search_desktop) || 0);
    if (r.impr_maps_mobile != null || r.impr_maps_desktop != null) x.gbp_maps = (Number(r.impr_maps_mobile) || 0) + (Number(r.impr_maps_desktop) || 0); });
  (RAW.genai || []).forEach(r => { at(r.date).gen_ai = r.impressions; });
  RAW.daily = Object.values(m).sort((a, b) => a.date.localeCompare(b.date));
}
function rpWindow(key, days){
  const rows = (RAW.daily || []).filter(r => rpHas(r, key));
  if (!rows.length) return null;
  const end = rows[rows.length - 1].date, start = rpAdd(end, -(days - 1)), prevEnd = rpAdd(start, -1), prevStart = rpAdd(prevEnd, -(days - 1));
  const inR = (a, b) => (RAW.daily || []).filter(r => r.date >= a && r.date <= b);
  return { end, start, first: rows[0].date, cur: inR(start, end), prev: inR(prevStart, prevEnd), prevStart, prevEnd };
}
/* Daily up to three months; weekly beyond that, so 16 months stays readable. */
function rpBuckets(rows, days, keys, avgKeys = []){
  if (days <= 91) return rows.map(r => ({ label: r.date, ...r }));
  const out = []; let cur = null;
  rows.forEach((r, i) => { if (!cur || i % 7 === 0){ cur = { label: r.date, n: {} }; out.push(cur); }
    keys.forEach(k => { if (r[k] != null){ if (avgKeys.includes(k)){ cur.n[k] = (cur.n[k] || 0) + 1; } cur[k] = (cur[k] || 0) + Number(r[k]); } }); });
  out.forEach(b => avgKeys.forEach(k => { if (b.n[k]) b[k] = b[k] / b.n[k]; }));
  return out;
}
/* Line chart: each axis scales to its own series. Missing days are gaps, never zero. */
function rpLines(rows, series, { yL = '', yR = '', labelFmt } = {}){
  const W = 1000, H = 280, L = 58, R = 58, T = 14, B = 30, n = rows.length;
  if (!n) return '<p class="sub">No data for this period.</p>';
  const x = i => L + (n === 1 ? (W - L - R) / 2 : i * (W - L - R) / (n - 1));
  const nice = v => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
  const maxOf = s => nice(Math.max(0, ...rows.map(r => Number(r[s.k]) || 0)));
  const mL = Math.max(1, ...series.filter(s => s.axis !== 'r').map(maxOf)), mR = series.some(s => s.axis === 'r' && s.pct) ? 100 : Math.max(1, ...series.filter(s => s.axis === 'r').map(maxOf));
  const y = (v, s) => T + (H - T - B) * (1 - v / (s.axis === 'r' ? mR : mL));
  const hasR = series.some(s => s.axis === 'r');
  let g = '';
  [0, .25, .5, .75, 1].forEach(f => { const yy = T + (H - T - B) * (1 - f);
    g += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="var(--bd)"/><text x="${L - 8}" y="${yy + 4}" text-anchor="end" class="rp-ax">${fmt(mL * f, (mL * f) % 1 ? 1 : 0)}${yL}</text>`;
    if (hasR) g += `<text x="${W - R + 8}" y="${yy + 4}" class="rp-ax">${fmt(mR * f, (mR * f) % 1 ? 1 : 0)}${yR}</text>`; });
  const step = Math.max(1, Math.ceil(n / 7));
  rows.forEach((r, i) => { if (i % step === 0) g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="rp-ax">${esc((labelFmt || (v => rpDay(v).toLocaleDateString('en-AU', { day:'2-digit', month:'2-digit' })))(r.label))}</text>`; });
  const lines = series.map(s => { let d = '', pen = false, dots = '';
    rows.forEach((r, i) => { const v = r[s.k]; if (v == null){ if (!s.connect) pen = false; return; }
      const c = `${x(i).toFixed(1)} ${y(Number(v), s).toFixed(1)}`; d += (pen ? 'L' : 'M') + c; pen = true;
      if (n <= 20) dots += `<circle cx="${x(i).toFixed(1)}" cy="${y(Number(v), s).toFixed(1)}" r="3.5" fill="${s.color}"/>`; });
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>${dots}`; }).join('');
  const hit = rows.map((r, i) => { const w = (W - L - R) / Math.max(1, n - 1);
    const lab = (labelFmt || rpAu)(r.label), tip = [lab].concat(series.map(s => `${s.name}: ${r[s.k] == null ? 'not reported' : fmt(r[s.k], s.dp || 0)}${s.unit || ''}`)).join('\n');
    return `<rect x="${(x(i) - w / 2).toFixed(1)}" y="${T}" width="${w.toFixed(1)}" height="${H - T - B}" fill="transparent"><title>${esc(tip)}</title></rect>`; }).join('');
  return `<svg class="rp-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map(s => s.name).join(' and '))} over time">${g}${lines}${hit}</svg>`;
}
const rpLegend = series => `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
function rpNote(w, days, what){
  return `${rpAu(w.start < w.first ? w.first : w.start)} to ${rpAu(w.end)}${w.start < w.first ? `. ${what} history starts ${rpAu(w.first)}, so this period is shorter than selected` : ''}. ${days > 91 ? 'Plotted weekly. ' : ''}`;
}
function rpGscHtml(){
  const w = rpWindow('gsc_impressions', rp.gsc);
  const btns = RP_RANGES.map(r => rpBtn('gsc', r.d, r.d === rp.gsc, r.l)).join('');
  if (!w) return emptyState('No Search Console data yet', 'Google has not reported search data for this website yet.');
  const c = rpSum(w.cur,'gsc_clicks'), i = rpSum(w.cur,'gsc_impressions'), pc = rpSum(w.prev,'gsc_clicks'), pi = rpSum(w.prev,'gsc_impressions');
  const posOf = a => { const x = a.filter(r => r.gsc_position != null && r.gsc_impressions); const t = rpSum(x,'gsc_impressions'); return t ? x.reduce((s, r) => s + Number(r.gsc_position) * Number(r.gsc_impressions), 0) / t : null; };
  const pos = posOf(w.cur), pp = posOf(w.prev), hasPrev = w.prev.some(r => r.gsc_impressions != null);
  const gen = w.cur.filter(r => r.gen_ai != null), genP = w.prev.filter(r => r.gen_ai != null);
  const foot = (a, b) => hasPrev ? chipFor(a, b) + ' vs previous period' : 'No earlier period to compare';
  const series = [{ k:'gsc_impressions', name:'Impressions', color:'var(--ink3)' }, { k:'gsc_clicks', name:'Clicks', color:'var(--accent)', axis:'r' }];
  if (gen.length) series.push({ k:'gen_ai', name:'AI impressions', color:'var(--warn)' });
  const rows = rpBuckets(w.cur, rp.gsc, ['gsc_clicks','gsc_impressions','gen_ai']);
  return `<div class="cardhead"><div><h3>Google Search Console Data</h3><p class="sub">${rpNote(w, rp.gsc, 'Search Console')}Google reports this about two days behind.</p></div>
      <div class="rp-range" role="group" aria-label="Search Console period">${btns}</div></div>
    <div class="kpis">${kpi('Clicks', fmt(c), foot(c, pc))}${kpi('Impressions', fmt(i), foot(i, pi))}
      ${gen.length ? kpi('AI impressions', fmt(rpSum(gen,'gen_ai')), genP.length ? chipFor(rpSum(gen,'gen_ai'), rpSum(genP,'gen_ai')) + ' vs previous period' : 'AI Overviews and AI Mode') : ''}
      ${kpi('Click rate', i ? pct1(c / i * 100) : '—', 'Clicks ÷ impressions')}
      ${kpi('Avg position', pos != null ? fmt(pos, 1) : '—', pp != null && pos != null ? stepChip(pos, pp, 'previous', { dp:1, lowerIsBetter:true }) : 'Lower is better')}</div>
    ${rpLegend(series)}${rpLines(rows, series)}
    ${gen.length ? '<p class="sub">Google counts AI impressions as part of total impressions, so the AI line is not extra on top.</p>' : ''}`;
}
function rpGaHtml(){
  const w = rpWindow('sessions', rp.ga);
  if (!w) return emptyState('No Google Analytics data yet', 'Google Analytics has not reported any visits for this website yet.');
  const btns = RP_RANGES.map(r => rpBtn('ga', r.d, r.d === rp.ga, r.l)).join('');
  const S = a => rpSum(a,'sessions'), hasPrev = w.prev.some(r => r.sessions != null);
  const adu = a => { const x = a.filter(r => r.users != null); return x.length ? rpSum(x,'users') / x.length : null; };
  const er = a => { const x = a.filter(r => r.engaged_sessions != null && r.sessions != null), t = rpSum(x,'sessions'); return t ? rpSum(x,'engaged_sessions') / t * 100 : null; };
  const foot = (a, b) => hasPrev && a != null && b != null ? chipFor(a, b) + ' vs previous period' : 'No earlier period to compare';
  const ke = rpSum(w.cur,'key_events');
  const series = [{ k:'sessions', name:'Sessions', color:'var(--accent)' }, { k:'users', name:'Users', color:'var(--ink3)' }];
  const rows = rpBuckets(w.cur, rp.ga, ['sessions','users']);
  return `<div class="cardhead"><div><h3>Google Analytics 4 Data</h3><p class="sub">${rpNote(w, rp.ga, 'Analytics')}</p></div>
      <div class="rp-range" role="group" aria-label="Analytics period">${btns}</div></div>
    <div class="kpis">${kpi('Sessions', fmt(S(w.cur)), foot(S(w.cur), S(w.prev)))}
      ${kpi('Average daily users', adu(w.cur) != null ? fmt(adu(w.cur), 1) : '—', foot(adu(w.cur), adu(w.prev)))}
      ${kpi('Engagement rate', er(w.cur) != null ? pct1(er(w.cur)) : '—', 'Share of sessions that were engaged')}
      ${kpi('Page views', fmt(rpSum(w.cur,'pageviews')), foot(rpSum(w.cur,'pageviews'), rpSum(w.prev,'pageviews')))}
      ${kpi('Key events', fmt(ke), ke ? foot(ke, rpSum(w.prev,'key_events')) : 'None recorded in this period')}</div>
    ${rpLegend(series)}${rpLines(rows, series)}`;
}

/* AI tracker. AI Overview and assistant readings are monthly, so this chart is monthly. */
const rpNamed = r => r.result && /^(named|found|yes)/i.test(r.result);
const RP_ENGINES = [{ n:'ChatGPT', c:'#19C37D', dash:'' }, { n:'Gemini', c:'#A78BFA', dash:'10 5' }, { n:'Perplexity', c:'#EC4899', dash:'3 5' }, { n:'Claude', c:'#E8703A', dash:'16 6 3 6' }];
function rpAiMonths(){
  const m = {}; const at = k => (m[k] = m[k] || { label:k, month:k });
  (RAW.aio || []).forEach(r => { const x = at(monthOf(r.month)); x.aio = (x.aio || 0) + 1; });
  /* Last reading in each month: two checks in one month never add together. */
  const geoC = rpCoreOnly(RAW.geo || []), last = {}; geoC.forEach(r => { const k = monthOf(r.checked_at); if (!last[k] || r.checked_at > last[k]) last[k] = r.checked_at; });
  Object.entries(last).forEach(([k, d]) => { const s = geoC.filter(r => r.checked_at === d); const x = at(k); x.vis = s.length ? s.filter(rpNamed).length / s.length * 100 : null; x.qs = new Set(s.map(r => r.prompt)).size;
    RP_ENGINES.forEach(e => { const a = s.filter(r => String(r.engine).toLowerCase() === e.n.toLowerCase()); if (a.length) x['e_' + e.n] = a.filter(rpNamed).length / a.length * 100; }); });
  (RAW.daily || []).forEach(r => { if (r.gsc_impressions != null){ const x = at(monthOf(r.date)); x.impr = (x.impr || 0) + Number(r.gsc_impressions); x.clicks = (x.clicks || 0) + Number(r.gsc_clicks || 0); }
    if (r.gen_ai != null){ const x = at(monthOf(r.date)); x.gen = (x.gen || 0) + Number(r.gen_ai); } });
  return Object.values(m).sort((a, b) => a.month.localeCompare(b.month));
}
function rpAiHtml(){
  const all = rpAiMonths().filter(r => r.month <= state.month);
  if (!all.length) return '';
  const end = all[all.length - 1].month, start = rpMonthAdd(end, -(rp.aiRange - 1));
  const prevEnd = rpMonthAdd(start, -1), prevStart = rpMonthAdd(prevEnd, -(rp.aiRange - 1));
  const cur = all.filter(r => r.month >= start), prev = all.filter(r => r.month >= prevStart && r.month <= prevEnd);
  const lastOf = (a, k) => { const x = a.filter(r => r[k] != null); return x.length ? x[x.length - 1][k] : null; };
  const tot = (a, k) => { const x = a.filter(r => r[k] != null); return x.length ? rpSum(x, k) : null; };
  const defs = [
    { k:'aio', label:'AI Overview keywords', tag:'Google', v:lastOf(cur,'aio'), p:lastOf(prev,'aio'), f:x => fmt(x), c:'#1E93C8', note:'Searches where Google’s AI Overview cites your website' },
    { k:'vis', label:'AI assistant visibility', tag:'AI', v:lastOf(cur,'vis'), p:lastOf(prev,'vis'), f:x => pct1(x), c:'var(--good)', axis:'r', note:'Share of ChatGPT, Claude, Gemini and Perplexity answers naming you', unit:'%', dp:1 },
    { k:'impr', label:'Impressions', tag:'Google', v:tot(cur,'impr'), p:tot(prev,'impr'), f:x => fmt(x), c:'var(--ink3)', note:'From Google Search Console' },
    { k:'clicks', label:'Clicks', tag:'Google', v:tot(cur,'clicks'), p:tot(prev,'clicks'), f:x => fmt(x), c:'var(--warn)', note:'From Google Search Console' },
  ];
  if (cur.some(r => r.gen != null)) defs.splice(2, 0, { k:'gen', label:'AI impressions', tag:'Google', v:tot(cur,'gen'), p:tot(prev,'gen'), f:x => fmt(x), c:'#22D3EE', note:'Search Console generative AI report' });
  RP_ENGINES.forEach(e => { if (cur.some(r => r['e_' + e.n] != null) || prev.some(r => r['e_' + e.n] != null)) defs.push({ k:'e_' + e.n, label:e.n, tag:'AI', v:lastOf(cur, 'e_' + e.n), p:lastOf(prev, 'e_' + e.n), f:x => pct1(x), c:e.c, dash:e.dash, unit:'%', dp:1 }); });
  /* Readings at a point in time: with nothing in the previous period, compare with the first one shown. */
  defs.forEach(d => { if (d.p != null || !(d.k === 'aio' || d.k === 'vis' || d.k.startsWith('e_'))) return;
    const x = cur.filter(r => r[d.k] != null); if (x.length > 1) d.first = { v:x[0][d.k], m:x[0].month }; });
  const tiles = defs.map(d => `<button type="button" class="rp-ai-tile${rp.aiOn[d.k] ? ' on' : ''}" data-rp="ai" data-v="${d.k}" aria-pressed="${!!rp.aiOn[d.k]}" style="--c:${d.c}">
      <span class="mlbl">${esc(d.label)} <em>${d.tag}</em></span>
      <b class="tnum">${d.v != null ? d.f(d.v) : '—'}</b><small>This period</small>
      <span class="rp-prev tnum">${d.p != null ? d.f(d.p) : (d.first ? d.f(d.first.v) : '—')}</span><small>${d.p != null ? 'Previous period' : (d.first ? 'First reading, ' + rpMon(d.first.m) : 'No earlier reading')}</small></button>`).join('');
  const series = defs.filter(d => rp.aiOn[d.k]).map(d => {
    const big = d.k === 'impr' || d.k === 'gen', pct = d.k === 'vis' || d.k.startsWith('e_');
    return { k:d.k, name:d.label, color:d.c, axis: pct || big ? 'r' : undefined, unit:d.unit, dp:d.dp, dash:d.dash, pct, connect:d.k !== 'impr' && d.k !== 'clicks' && d.k !== 'gen' }; });
  /* A percentage and a count share the right axis only if they share a unit. */
  const mixed = series.some(s => s.pct) && series.some(s => s.k === 'impr' || s.k === 'gen');
  if (mixed) series.forEach(s => { if (s.k === 'impr' || s.k === 'gen') s.axis = undefined; });
  const curRange = all.filter(r => r.month >= start);
  const partial = (() => { const t = rpYmd(new Date()).slice(0, 7); return end === t; })();
  return `<div class="cardhead"><div><h3>AI visibility tracker</h3>
      <p class="sub">${rpMon(curRange[0].month)} to ${rpMon(end)}${partial ? ' (month in progress)' : ''}, monthly readings. Tap a tile to show or hide it on the graph.</p></div>
      <div class="rp-range" role="group" aria-label="AI tracker period">${RP_AI_RANGES.map(r => rpBtn('airange', r.m, r.m === rp.aiRange, r.l)).join('')}</div></div>
    <div class="rp-ai-tiles">${tiles}</div>
    ${series.length ? rpLegend(series) + rpLines(curRange, series, { labelFmt:rpMon, yR: series.some(s => s.axis === 'r' && s.pct) ? '%' : '' }) : '<p class="sub">Pick a tile to plot it.</p>'}
    <p class="sub">AI Overview keywords are the ones found in the Australian keyword database we track, so they are a strong sample rather than every search Google answers. Each assistant line is the share of our questions where that assistant named ${esc(CFG.name)}, with a dot for each reading; months between readings are joined up.${(() => { const q = curRange.filter(r => r.qs); return new Set(q.map(r => r.qs)).size > 1 ? ' Questions asked: ' + q.map(r => `${r.qs} in ${rpMon(r.month)}`).join(', ') + '.' : ''; })()}</p>`;
}
/* Every AI Overview citation, month against month. */
function rpAioTable(){
  const rows = (RAW.aio || []).filter(r => monthOf(r.month) <= state.month);
  if (!rows.length) return '';
  const months = [...new Set(rows.map(r => monthOf(r.month)))].sort();
  const cur = months[months.length - 1], prv = months[months.length - 2] || null;
  const by = {};
  rows.forEach(r => { const x = by[r.keyword] = by[r.keyword] || { keyword:r.keyword, months:{} }; const m = monthOf(r.month); x.months[m] = true; if (m === cur || !x.page) x.page = r.page; });
  const list = Object.values(by).map(x => { const on = !!x.months[cur], was = prv && x.months[prv];
    const o = { keyword:x.keyword, page:x.page ? '/' + x.page : '—', status: on ? (prv && !was ? 'New' : 'Kept') : (was ? 'Dropped' : 'Earlier'), sort: on ? (prv && !was ? 0 : 1) : (was ? 2 : 3) };
    months.forEach(m => { o['m' + m] = x.months[m] ? 1 : 0; }); return o; });
  const n = k => list.filter(r => r.status === k).length, nCur = list.filter(r => r.sort < 2).length;
  const pill = v => `<span class="rankpill ${v === 'New' ? 'win' : v === 'Kept' ? 'mid' : 'out'}">${v}</span>`;
  const cols = [{ k:'keyword', label:'Search' }, { k:'page', label:'Page cited', fmt:v => `<span class="rvtext">${esc(v)}</span>` }, { k:'sort', label:'Status', fmt:(v, r) => pill(r.status) }]
    .concat(months.map(m => ({ k:'m' + m, label:rpDay(m + '-01').toLocaleDateString('en-AU', { month:'short' }), num:1, fmt:v => v ? '✓' : '—' })));
  return `<div class="card"><div class="cardhead"><div><h3>AI Overviews you are featured in</h3>
    <p class="sub">${fmt(nCur)} searches in ${monthName(cur)}${prv ? `, against ${fmt(months.length > 1 ? list.filter(r => r['m' + prv]).length : 0)} in ${monthName(prv)}: ${fmt(n('New'))} new, ${fmt(n('Dropped'))} dropped` : ''}. Google’s AI answer linked to your website for each of these.</p></div></div>
    ${dataTable('aio', cols, list, { sort:{ k:'sort', dir:1 }, maxH:560 })}</div>`;
}

/* Map pack on a real map. One base image per client (CFG.mapBase), pins placed by coordinates. */
const rpMapOn = () => RP() && !!CFG.mapBase;
const mgX = (lng, z) => 256 * (lng + 180) / 360 * Math.pow(2, z);
const mgY = (lat, z) => { const t = Math.sin(lat * Math.PI / 180); return 256 * (0.5 - Math.log((1 + t) / (1 - t)) / (4 * Math.PI)) * Math.pow(2, z); };
const rpPts = s => (RAW.points || []).filter(p => p.scan_id === s.id);
function rpStats(s){ const f = rpPts(s).filter(p => p.rank != null), r = f.map(p => +p.rank);
  return { found:f.length, total:rpPts(s).length, top3:r.filter(v => v <= 3).length, first:r.filter(v => v === 1).length, avg:r.length ? r.reduce((a, b) => a + b, 0) / r.length : null }; }
function rpSeries(){
  /* One scan per keyword per day, latest wins: a re-scan must not read as a second reading. */
  const best = {};
  (RAW.scans || []).filter(s => monthOf(s.checked_at) <= state.month && rpPts(s).length).forEach(s => {
    const k = s.keyword.toLowerCase() + '|' + s.checked_at, t = s.scanned_at || s.checked_at;
    if (!best[k] || String(t) > String(best[k].scanned_at || best[k].checked_at)) best[k] = s; });
  return Object.values(best).sort((a, b) => String(a.checked_at).localeCompare(String(b.checked_at)));
}
const rpSame = (a, b) => a.grid_size === b.grid_size && +a.spacing_km === +b.spacing_km && a.zoom === b.zoom;
function rpMapSvg(s, prev, movement){
  const B = CFG.mapBase, km = (lat, lng) => 111.32 * Math.sqrt(Math.pow(lat - B.lat, 2) + Math.pow((lng - B.lng) * Math.cos(B.lat * Math.PI / 180), 2));
  const px = (lat, lng) => [320 + mgX(lng, B.z) - mgX(B.lng, B.z), 320 + mgY(lat, B.z) - mgY(B.lat, B.z)];
  const prior = {}; if (prev) rpPts(prev).forEach(p => { prior[p.idx] = p; });
  const metres = 156543.03392 * Math.cos(B.lat * Math.PI / 180) / Math.pow(2, B.z);
  const rings = (B.rings || [5, 10]).map(k => { const r = k * 1000 / metres;
    return `<circle cx="320" cy="320" r="${r.toFixed(1)}" fill="none" stroke="rgba(255,255,255,.3)" stroke-dasharray="4 5"/><text x="320" y="${(320 - r + 13).toFixed(1)}" text-anchor="middle" class="rp-ring">${k} km</text>`; }).join('');
  const colour = r => r <= 3 ? ['#2E9E5B', '#fff'] : r <= 10 ? ['#E2B934', '#17171C'] : r <= 20 ? ['#E8703A', '#17171C'] : ['#C94A4A', '#fff'];
  const size = B.pin || 15;
  const pins = rpPts(s).map(p => { const [x, y] = px(+p.lat, +p.lng), r = p.rank == null ? null : +p.rank, o = prior[p.idx], was = o && o.rank != null ? +o.rank : null;
    const tip = `${r == null ? 'Not found here' : 'Rank #' + r} · ${km(+p.lat, +p.lng).toFixed(1)} km from the business${o ? ` · Last scan: ${was == null ? 'not found' : '#' + was}` : ''}${p.top_competitor ? ` · #1 here: ${p.top_competitor}` : ''}`;
    let fill, ink, label;
    if (movement){
      if (r == null && was == null) return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="rgba(255,255,255,.25)"><title>${esc(tip)}</title></circle>`;
      const d = r == null ? -1 : was == null ? 1 : was - r; fill = d > 0 ? '#2E9E5B' : d < 0 ? '#C94A4A' : '#6E6E7A'; ink = '#fff';
      label = r == null ? '✕' : was == null ? 'new' : d === 0 ? '=' : (d > 0 ? '+' : '') + d;
    } else { if (r == null) return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="rgba(255,255,255,.25)"><title>${esc(tip)}</title></circle>`; [fill, ink] = colour(r); label = String(r); }
    const fs = String(label).length > 2 ? size * .62 : size * .8;
    return `<g><title>${esc(tip)}</title><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size}" fill="${fill}" stroke="#17171C" stroke-width="1.5"/><text x="${x.toFixed(1)}" y="${(y + fs * .36).toFixed(1)}" text-anchor="middle" font-size="${fs.toFixed(1)}" font-family="var(--mono)" font-weight="700" fill="${ink}">${esc(label)}</text></g>`; }).join('');
  const [sx, sy] = s.centre_lat != null ? px(+s.centre_lat, +s.centre_lng) : [320, 320];
  const star = [...Array(10)].map((_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? size * .42 : size * .95; return `${(sx + r * Math.cos(a)).toFixed(1)},${(sy + r * Math.sin(a)).toFixed(1)}`; }).join(' ');
  return `<div class="rp-map"><img src="${esc(B.src)}" alt="Map of the area around ${esc(s.centre_label || CFG.name)}" loading="lazy"><svg viewBox="0 0 640 640" role="img" aria-label="${esc(s.keyword)} map pack positions">${rings}${pins}<polygon points="${star}" fill="#fff" stroke="#17171C" stroke-width="1.5"><title>${esc(CFG.name)}</title></polygon></svg></div>`;
}
function rpMapHtml(){
  const all = rpSeries();
  if (!all.length) return emptyState('No scan yet', 'No map grid scan has been run for this month yet.');
  const kws = [...new Set(all.map(s => s.keyword))].sort((a, b) => a.localeCompare(b));
  if (!rp.kw || !kws.includes(rp.kw)) rp.kw = kws[0];
  const ser = k => all.filter(s => s.keyword === k);
  const pair = k => { const l = ser(k), c = l[l.length - 1], ps = l.slice(0, -1).filter(s => rpSame(s, c)); return [c, ps[ps.length - 1] || null]; };
  const [cur, prev] = pair(rp.kw);
  if (!prev && rp.view === 'move') rp.view = 'rank';
  const A = rpStats(cur), P = prev ? rpStats(prev) : null, who = CFG.shortName || CFG.name.split(/\s+/)[0];
  const foot = (a, b, low) => { if (!P) return 'Baseline scan'; if (a == null || b == null) return 'Not comparable'; const d = a - b;
    if (Math.abs(d) < .05) return 'No change since ' + rpAu(prev.checked_at); const good = low ? d < 0 : d > 0;
    return `<span class="chip ${good ? 'up' : 'dn'}">${d > 0 ? '+' : ''}${fmt(d, Number.isInteger(d) ? 0 : 1)}</span> since ${rpAu(prev.checked_at)}`; };
  const tiles = `<div class="kpis">${kpi(`Points where ${esc(who)} appears`, `${fmt(A.found)} of ${fmt(A.total)}`, foot(A.found, P && P.found))}
    ${kpi('Top 3 points', fmt(A.top3), foot(A.top3, P && P.top3))}${kpi('#1 points', fmt(A.first), foot(A.first, P && P.first))}
    ${kpi('Average rank where found', A.avg != null ? fmt(A.avg, 1) : '—', foot(A.avg, P && P.avg, true))}</div>`;
  const switcher = `<div class="rp-range rp-kw" role="group" aria-label="Keyword">${kws.map(k => rpBtn('kw', k, k === rp.kw, k)).join('')}</div>
    ${prev ? `<div class="rp-range" role="group" aria-label="Map view">${rpBtn('view', 'rank', rp.view === 'rank', 'Ranks')}${rpBtn('view', 'move', rp.view === 'move', 'What moved')}</div>` : ''}`;
  const mapA = `<div class="card"><div class="cardhead"><div><h3>${rp.view === 'move' ? 'What moved since ' + rpAu(prev.checked_at) : 'Latest scan'}</h3><p class="sub">${esc(rp.kw)} · ${rpAu(cur.checked_at)}</p></div></div>${rpMapSvg(cur, prev, rp.view === 'move')}</div>`;
  const mapB = prev ? `<div class="card"><div class="cardhead"><div><h3>Month on month</h3><p class="sub">Previous scan · ${esc(rp.kw)} · ${rpAu(prev.checked_at)}</p></div></div>${rpMapSvg(prev, null, false)}</div>`
    : `<div class="card"><div class="cardhead"><div><h3>Month on month</h3></div></div><p>Growth appears here after the next scan, with both maps side by side.</p><p class="sub">${rpAu(cur.checked_at)} is the starting point. Google doesn’t keep past map rankings, so nothing earlier can be measured.</p></div>`;
  const key = rp.view === 'move'
    ? '<span><i style="background:#2E9E5B"></i>Improved</span><span><i style="background:#C94A4A"></i>Dropped or lost (✕)</span><span><i style="background:#6E6E7A"></i>No change</span><span><i style="background:rgba(255,255,255,.3)"></i>Not found in either scan</span>'
    : '<span><i style="background:#2E9E5B"></i>Top 3</span><span><i style="background:#E2B934"></i>4 to 10</span><span><i style="background:#E8703A"></i>11 to 20</span><span><i style="background:#C94A4A"></i>21+</span><span><i style="background:rgba(255,255,255,.3)"></i>Not found</span>';
  const rowsT = kws.map(k => { const [c, p] = pair(k), a = rpStats(c), b = p ? rpStats(p) : null;
    const dl = (x, y, low) => { if (!b || x == null || y == null) return '—'; const d = x - y; if (Math.abs(d) < .05) return '0'; const good = low ? d < 0 : d > 0; return `<span class="chip ${good ? 'up' : 'dn'}">${d > 0 ? '+' : ''}${fmt(d, Number.isInteger(d) ? 0 : 1)}</span>`; };
    return `<tr class="${k === rp.kw ? 'rp-me' : ''}"><td>${esc(k)}</td><td class="tnum">${fmt(a.found)}</td><td>${dl(a.found, b && b.found)}</td><td class="tnum">${fmt(a.top3)}</td><td>${dl(a.top3, b && b.top3)}</td><td class="tnum">${fmt(a.first)}</td><td>${dl(a.first, b && b.first)}</td><td class="tnum">${a.avg != null ? fmt(a.avg, 1) : '—'}</td><td>${dl(a.avg, b && b.avg, true)}</td></tr>`; }).join('');
  const founds = kws.map(k => rpStats(pair(k)[0]).found), spread = Math.max(...founds) - Math.min(...founds);
  const boxed = A.total && Math.max(...founds) / A.total < .6 && spread <= A.total * .1;
  const reach = +cur.spacing_km * (cur.grid_size - 1) / 2;
  const note = `Each pin is one search from that spot on the map: ${cur.grid_size} × ${cur.grid_size} points, ${+cur.spacing_km} km apart, reaching ${fmt(reach, reach % 1 ? 1 : 0)} km from the business. Average rank only counts points where ${esc(who)} was found. `
    + (boxed ? `Google returned ${esc(who)} within about the same area on every keyword, which looks like the edge of its search view at this zoom rather than true reach, so a grey point doesn’t prove ${esc(who)} wouldn’t show for someone there. Compare ranks and top 3 points for growth. ` : '')
    + `Comparisons are scan against scan, by the dates shown. Google’s results change day to day, so read small moves with care. These scans run each month end.`;
  return `${tiles}<div class="rp-switch">${switcher}</div><div class="grid2 rp-maps">${mapA}${mapB}</div><div class="legend rp-key">${key}</div>
    <div class="card"><div class="cardhead"><div><h3>Every keyword, scan against scan</h3></div></div><div class="tscroll"><table class="tbl"><thead><tr><th>Keyword</th><th>Points found</th><th>Change</th><th>Top 3</th><th>Change</th><th>#1</th><th>Change</th><th>Avg rank</th><th>Change</th></tr></thead><tbody>${rowsT}</tbody></table></div><p class="sub rp-note">${note}</p></div>`;
}
/* GBP: monthly views, reviews total, where people see you, and search chips. */
function rpGbpExtras(){
  const byM = {};
  (RAW.daily || []).forEach(r => { if (r.gbp_search == null && r.gbp_maps == null) return; const m = monthOf(r.date); if (m > state.month) return;
    const x = byM[m] = byM[m] || { m, s:0, g:0 }; x.s += Number(r.gbp_search) || 0; x.g += Number(r.gbp_maps) || 0; });
  const months = Object.values(byM).sort((a, b) => a.m.localeCompare(b.m)).slice(-12);
  let out = '';
  if (months.length){
    const max = Math.max(...months.map(r => r.s + r.g), 1), W = 1000, H = 290, L = 58, T = 12, B = 30, bw = Math.min(70, (W - L - 20) / months.length * .55);
    const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))), f = max / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; })();
    const y = v => T + (H - T - B) * (1 - v / nice);
    let g = ''; [0, .25, .5, .75, 1].forEach(f => { g += `<line x1="${L}" x2="${W}" y1="${y(nice * f)}" y2="${y(nice * f)}" stroke="var(--bd)"/><text x="${L - 8}" y="${y(nice * f) + 4}" text-anchor="end" class="rp-ax">${fmt(nice * f)}</text>`; });
    months.forEach((r, i) => { const cx = L + (W - L - 20) * (i + .5) / months.length, x = cx - bw / 2;
      g += `<g><title>${esc(rpMon(r.m))}: ${fmt(r.s)} on Google Search, ${fmt(r.g)} on Google Maps</title><rect x="${x}" y="${y(r.g)}" width="${bw}" height="${Math.max(0, y(0) - y(r.g))}" rx="3" fill="var(--warn)"/><rect x="${x}" y="${y(r.g + r.s)}" width="${bw}" height="${Math.max(0, y(r.g) - y(r.g + r.s))}" rx="3" fill="var(--accent)"/></g>
        <text x="${cx}" y="${H - 8}" text-anchor="middle" class="rp-ax">${esc(rpMon(r.m))}</text>`; });
    out += `<div class="card"><div class="cardhead"><div><h3>Profile views over time</h3><p class="sub">Monthly, from Google Business Profile</p></div>
      <div class="legend"><span><i style="background:var(--accent)"></i>Google Search</span><span><i style="background:var(--warn)"></i>Google Maps</span></div></div>
      <svg class="rp-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Profile views by month, Search and Maps">${g}</svg></div>`;
  }
  const last = months[months.length - 1], tot = last ? last.s + last.g : 0;
  const rvCard = V.reviews && V.reviews.review_count != null ? `<div class="card"><span class="mlbl">Reviews</span><div class="rp-big tnum">${V.reviews.avg_rating != null ? fmt(V.reviews.avg_rating, 1) + ' ★' : '—'}</div><p class="sub">${fmt(V.reviews.review_count)} Google reviews, as at ${rpAu(String(V.reviews.as_of).slice(0, 10))}</p></div>` : '';
  const whereCard = tot ? `<div class="card"><span class="mlbl">Where people see you</span><div class="rp-split"><span style="width:${(last.s / tot * 100).toFixed(1)}%;background:var(--accent)">${Math.round(last.s / tot * 100)}% Search</span><span style="width:${(last.g / tot * 100).toFixed(1)}%;background:var(--warn)">${Math.round(last.g / tot * 100)}% Maps</span></div><p class="sub">${esc(rpMon(last.m))}: ${fmt(last.s)} views on Google Search, ${fmt(last.g)} on Google Maps.</p></div>` : '';
  if (rvCard || whereCard) out += `<div class="grid2">${rvCard}${whereCard}</div>`;
  /* Latest reviews to read at a glance. The full list with sort and download stays below. */
  const latest = (RAW.grl || []).filter(r => r.comment && String(r.created_at).slice(0, 7) <= state.month).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 6);
  if (latest.length) out += `<div class="card"><div class="cardhead"><div><h3>Latest reviews</h3><p class="sub">The six most recent with written comments. Every review is in the full list further down.</p></div></div>
    <div class="rp-rvs">${latest.map(r => `<article class="rp-rv"><div class="rp-stars" aria-label="${fmt(r.rating)} stars">${'★'.repeat(r.rating || 0)}</div><p>${esc(r.comment)}</p><footer><b>${esc(r.reviewer || 'Google reviewer')}</b> · ${rpAu(String(r.created_at).slice(0, 10))}${r.replied ? ' · Replied' : ''}</footer></article>`).join('')}</div></div>`;
  const kwM = (RAW.gkw || []).filter(r => monthOf(r.month) <= state.month).map(r => monthOf(r.month)).sort().pop();
  if (kwM){
    const brand = new RegExp(brandPattern(), 'i');
    const rows = RAW.gkw.filter(r => monthOf(r.month) === kwM).map(r => ({ ...r, val:r.users != null ? Number(r.users) : (r.below_threshold ? Number(r.below_threshold) - .5 : 0), b:brand.test(r.keyword) }))
      .sort((a, b) => b.val - a.val).slice(0, 24);
    const dis = rpSum(rows.filter(r => !r.b && r.users != null), 'users'), bra = rpSum(rows.filter(r => r.b && r.users != null), 'users');
    out += `<div class="card"><div class="cardhead"><div><h3>What people search to find you</h3></div></div><div class="rp-chips">${rows.map(r => `<span class="rp-chip${r.b ? ' brand' : ''}">${esc(r.keyword)} <b class="tnum">${r.users != null ? fmt(r.users) : 'under ' + fmt(r.below_threshold)}</b></span>`).join('')}</div>
      <p class="sub rp-note">${esc(rpMon(kwM))}: the phrases people typed into Google before landing on the profile. Faded terms are branded (someone already looking for ${esc(CFG.name)}); solid terms are people discovering you. ${fmt(dis)} discovery searches vs ${fmt(bra)} branded across the terms shown.</p></div>`;
  }
  return out;
}
/* Buttons in these sections redraw only their own section, so the page never jumps. */
document.addEventListener('click', ev => {
  const b = ev.target.closest && ev.target.closest('[data-rp]'); if (!b || !RP()) return;
  const g = b.dataset.rp, v = b.dataset.v;
  const redraw = (id, fn) => { const el = document.getElementById(id); if (el) el.innerHTML = fn(); };
  if (g === 'gsc'){ rp.gsc = +v; redraw('rpGsc', rpGscHtml); }
  if (g === 'ga'){ rp.ga = +v; redraw('rpGa', rpGaHtml); }
  if (g === 'airange'){ rp.aiRange = +v; redraw('rpAi', rpAiHtml); }
  if (g === 'ai'){ rp.aiOn[v] = !rp.aiOn[v]; redraw('rpAi', rpAiHtml); }
  if (g === 'kw'){ rp.kw = v; redraw('rpMap', rpMapHtml); }
  if (g === 'view'){ rp.view = v; redraw('rpMap', rpMapHtml); }
});

/* AI Questions. Jose 04/11/2026: the client approves or adds questions, the team reviews, and only
   then does a question join the month-end run. 'added' questions never move the trend figures. */
const RP_Q_CAP = 30;
const rpAdded = () => new Set((RAW.aiq || []).filter(q => q.question_set === 'added').map(q => q.question));
const rpCoreOnly = rows => { const a = rpAdded(); return a.size ? rows.filter(r => !a.has(r.prompt)) : rows; };
function rpQHtml(){
  const all = RAW.aiq || [], by = (...s) => all.filter(q => s.includes(q.status));
  const team = ['admin', 'editor'].includes(state.role);
  const used = by('tracking', 'client_approved', 'client_added').length, full = used >= RP_Q_CAP;
  const chips = q => (q.competitors || []).length ? `<div class="rp-q-comp"><span class="mlbl">Named on your closest question</span> ${q.competitors.map(c => `<span class="rp-chip">${esc(c)}</span>`).join('')}</div>` : '';
  const sug = by('suggested').map(q => `<article class="rp-q"><label class="mlbl" for="q-${q.id}">Suggested question</label>
      <textarea id="q-${q.id}" rows="2" maxlength="200">${esc(q.question)}</textarea>
      ${q.reason ? `<p class="sub">${esc(q.reason)}</p>` : ''}${chips(q)}
      <div class="rp-q-act"><button type="button" class="rp-btn on" data-rpq="approve" data-id="${q.id}"${full ? ' disabled' : ''}>Approve</button><button type="button" class="rp-btn" data-rpq="decline" data-id="${q.id}">Decline</button></div></article>`).join('');
  const wait = by('client_approved', 'client_added').map(q => `<article class="rp-q"><p class="rp-q-text">${esc(q.question)}</p>
      <p class="sub">${q.status === 'client_added' ? 'Added by you' : 'Approved by you'}${q.client_note ? ': ' + esc(q.client_note) : ''}. Our team checks it before tracking starts.</p>
      ${team ? `<input type="text" id="n-${q.id}" maxlength="200" placeholder="Note to the client (optional)" aria-label="Note to the client"><div class="rp-q-act"><button type="button" class="rp-btn on" data-rpq="review-approve" data-id="${q.id}">Start tracking</button><button type="button" class="rp-btn" data-rpq="review-reject" data-id="${q.id}">Don’t track</button></div>` : ''}</article>`).join('');
  const snap = V.geoSnapAll || V.geoSnap || [];
  const rows = by('tracking').map(q => { const a = snap.filter(r => r.prompt === q.question), named = a.filter(rpNamed).map(r => r.engine);
    const others = [...new Set(a.flatMap(r => r.mentioned || []))].filter(n => n.toLowerCase() !== CFG.name.toLowerCase());
    return { question:q.question, set:q.question_set === 'core' ? 'Core' : 'Added', named:a.length ? (named.length ? named.join(', ') : 'Not named') : 'First reading at the next month end', others:others.slice(0, 5).join(', ') || '—', sort:a.length && !named.length ? 0 : 1 }; });
  const closed = by('declined', 'rejected').map(q => `<li>${esc(q.question)} <span class="sub">${q.status === 'declined' ? 'Declined' : 'Not tracked' + (q.review_note ? ': ' + esc(q.review_note) : '')}</span></li>`).join('');
  return `<div class="cardhead"><div><h3>AI Questions</h3><p class="sub">The questions we ask ChatGPT, Claude, Gemini and Perplexity each month, aiming to get ${esc(CFG.name)} named ahead of competitors. Assistants don’t rank businesses like Google does and their answers vary, so results can’t be guaranteed.</p></div>
      <div class="rp-q-count tnum"><b>${fmt(used)}</b> of ${RP_Q_CAP} in use</div></div>
    <p class="rp-q-msg" id="rpqMsg" role="status"></p>
    ${sug ? `<h4 class="rp-q-h">Waiting for your approval</h4><p class="sub">Change the wording if it isn’t how your customers would ask.</p><div class="rp-q-grid">${sug}</div>` : ''}
    <h4 class="rp-q-h">Add your own question</h4>
    ${full ? '<p class="sub">You’ve reached the limit of 30 questions. Talk to your account manager about swapping one.</p>' : `<div class="rp-q-add"><label class="mlbl" for="rpqNew">Your question</label><textarea id="rpqNew" rows="2" maxlength="200" placeholder="How would a customer ask an AI assistant for what you do?"></textarea><label class="mlbl" for="rpqNote">Anything we should know (optional)</label><input type="text" id="rpqNote" maxlength="200"><div class="rp-q-act"><button type="button" class="rp-btn on" data-rpq="add">Send for review</button></div></div>`}
    ${wait ? `<h4 class="rp-q-h">With our team</h4><div class="rp-q-grid">${wait}</div>` : ''}
    <h4 class="rp-q-h">Being tracked</h4>
    <p class="sub">“Core” questions drive the trend figures above. “Added” questions are measured here so new ones never change that trend.</p>
    ${dataTable('aiq', [{ k:'question', label:'Question' }, { k:'set', label:'Set' }, { k:'named', label:'Named you' }, { k:'others', label:'Also named' }], rows, { sort:{ k:'sort', dir:1 }, maxH:460 })}
    ${closed ? `<details class="rp-q-closed"><summary>Declined or not tracked</summary><ul>${closed}</ul></details>` : ''}`;
}
document.addEventListener('click', async ev => {
  const b = ev.target.closest && ev.target.closest('[data-rpq]'); if (!b || !RP()) return;
  const a = b.dataset.rpq, id = b.dataset.id, msg = t => { const m = document.getElementById('rpqMsg'); if (m) m.textContent = t; };
  const val = i => (document.getElementById(i)?.value || '').trim();
  let call;
  if (a === 'approve') call = ['md_ai_question_respond', { p_id:id, p_action:'approve', p_question:val('q-' + id), p_note:null }];
  if (a === 'decline') call = ['md_ai_question_respond', { p_id:id, p_action:'decline', p_question:null, p_note:null }];
  if (a === 'add'){ const t = val('rpqNew'); if (t.length < 10){ msg('Please type the full question first.'); return; } call = ['md_ai_question_add', { p_slug:CFG.slug, p_question:t, p_note:val('rpqNote') || null }]; }
  if (a === 'review-approve') call = ['md_ai_question_review', { p_id:id, p_action:'approve', p_note:val('n-' + id) || null }];
  if (a === 'review-reject') call = ['md_ai_question_review', { p_id:id, p_action:'reject', p_note:val('n-' + id) || null }];
  if (!call) return;
  b.disabled = true; msg('Saving…');
  const { error } = await sb.rpc(call[0], call[1]);
  if (error){ b.disabled = false; msg('That didn’t save: ' + error.message); return; }
  const { data } = await sb.from('md_ai_questions').select('*').eq('client_id', RAW.client.id).order('created_at');
  RAW.aiq = data || [];
  const el = document.getElementById('rpQ'); if (el){ el.innerHTML = rpQHtml(); wireTables(); }
  msg('Saved.');
});

function viewSeo(){
  let out = head('SEO', 'Search performance',
    'Clicks, impressions and average position from Google Search Console, with the keywords we track.');
  out += workDone('seo') + teamNotes() + linksSection();
  if (!V.seo.length && !V.rankings.length)
    return out + emptyState('Nothing to report for this month',
      `${CFG.name}'s website is not live yet, so there is no search data. Tracking starts the day it publishes.`);
  const a = V.agg, p = V.aggPrev;
  if (RP()) out += `<div class="card" id="rpGsc">${rpGscHtml()}</div><div class="card" id="rpGa">${rpGaHtml()}</div>`;
  else out += `<div class="kpis">
    ${kpi('Clicks', fmt(a.clicks), chipFor(a.clicks, p.clicks))}
    ${kpi('Impressions', fmt(a.impressions), chipFor(a.impressions, p.impressions))}
    ${kpi('Sessions', fmt(a.sessions), chipFor(a.sessions, p.sessions))}
    ${kpi('Avg position', a.position ? fmt(a.position,1) : '—', 'Lower is better')}</div>`;
  if (!RP() && V.dates.length) out += `<div class="card"><div class="cardhead">
      <div><h3>Clicks and impressions</h3><p class="sub">Daily, ${monthName(state.month)}</p></div>
      <div class="legend"><span><i style="background:var(--accent)"></i>Clicks</span>
        <span><i style="background:var(--ink3)"></i>Impressions</span></div></div>
    <div data-chart='${JSON.stringify({series:[
      {data:V.clicks, color:'var(--accent)'},{data:V.impressions, color:'var(--ink3)'}]})}'></div></div>`;
  /* Brand searches (the business's own name) are excluded: ranking #1 for your own name
     says nothing about winning new customers. The client name decides what counts. */
  const brandRe = new RegExp(brandPattern(), 'i');
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
  if (rpMapOn()){
    out += `<div id="rpMap">${rpMapHtml()}</div>`;
    const cmp = {}; (RAW.points || []).filter(p => V.scans.some(s => s.id === p.scan_id) && p.top_competitor).forEach(p => { cmp[p.top_competitor] = (cmp[p.top_competitor] || 0) + 1; });
    const crows = Object.entries(cmp).map(([name, n]) => ({ name, n }));
    if (crows.length) out += `<div class="card"><div class="cardhead"><div><h3>Who is #1 across the grid</h3><p class="sub">The business in first place at each measured point, across all keywords</p></div></div>${dataTable('mapcomp', [{ k:'name', label:'Business' }, { k:'n', label:'Points at #1', num:1, fmt:v => fmt(v) }], crows, { sort:{ k:'n', dir:-1 }, maxH:380 })}</div>`;
    return out;
  }

  const scans = V.scans.slice().sort((a,b) => (a.avg_rank ?? 999) - (b.avg_rank ?? 999));
  const total = sum(scans,'total_points'), found = sum(scans,'found_points');
  /* Points in the top 3 = share of voice x points. Month on month only over keywords
     scanned in both months, so adding a keyword never reads as growth. */
  const top3 = s => s.solv != null ? Math.round(Number(s.solv) * s.total_points / 100) : 0;
  const prevOf = s => V.scansPrev[s.keyword.toLowerCase()];
  const both = scans.filter(prevOf);
  const pm = V.scanPrevMonth ? monthName(V.scanPrevMonth).split(' ')[0] : null;
  const t3 = scans.reduce((t, s) => t + top3(s), 0);
  const t3Both = both.reduce((t, s) => t + top3(s), 0), t3Prev = both.reduce((t, s) => t + top3(prevOf(s)), 0);
  const fBoth = sum(both,'found_points'), fPrev = both.reduce((t, s) => t + prevOf(s).found_points, 0);
  out += `<div class="kpis">
    ${kpi('Points in the top 3', `${fmt(t3)} / ${fmt(total)}`, both.length ? stepChip(t3Both, t3Prev, pm) : 'First month measured')}
    ${kpi('Points ranking', `${fmt(found)} / ${fmt(total)}`, (found === 0 ? 'Not yet in the pack ' : '') + (both.length ? stepChip(fBoth, fPrev, pm) : ''))}
    ${kpi('Best average', scans[0]?.avg_rank != null ? fmt(scans[0].avg_rank,1) : '—', scans[0]?.keyword || '')}
    ${kpi('Grid', scans[0] ? `${scans[0].grid_size}×${scans[0].grid_size}` : '—',
        scans[0] ? `${scans[0].spacing_km} km spacing · ${scans[0].centre_label || ''}` : '')}</div>`;

  const vs = s => { const p = prevOf(s); if (!p) return '<span class="sub">New this month</span>';
    return [p.avg_rank != null && s.avg_rank != null ? stepChip(s.avg_rank, p.avg_rank, 'avg', { dp: 1, lowerIsBetter: true }).replace(' vs avg', ' avg') : '',
      stepChip(top3(s), top3(p), 'top 3').replace(' vs top 3', ' top 3')].filter(Boolean).join(' '); };
  out += `<div class="card"><div class="cardhead"><div><h3>By keyword</h3>
    <p class="sub">Scanned ${V.scanAsOf ? monthName(V.scanAsOf) : ''}${pm ? `, compared with the end of ${monthName(V.scanPrevMonth)}` : ''}</p></div></div>
    <div class="tscroll"><table class="tbl"><thead><tr>
      <th>Keyword</th><th>Avg position</th><th>Points ranking</th><th>Share of voice</th>${pm ? `<th>vs ${pm}</th>` : ''}</tr></thead><tbody>
    ${scans.map(s => `<tr><td>${s.keyword}</td>
      <td>${s.avg_rank != null ? `<span class="rankpill ${s.avg_rank<=3?'win':s.avg_rank<=10?'mid':'out'}">${fmt(s.avg_rank,1)}</span>` : '<span class="rankpill out">Not ranking</span>'}</td>
      <td class="tnum">${fmt(s.found_points)} / ${fmt(s.total_points)}</td>
      <td class="tnum">${s.solv != null ? pct1(s.solv) : '—'}</td>${pm ? `<td>${vs(s)}</td>` : ''}</tr>`).join('')}
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
  /* The list only holds what Google's feed returns. Where Google states its own total, quote that. */
  const rvN = RP() && V.reviews?.review_count != null ? Number(V.reviews.review_count) : totNow.length;
  const rvA = RP() && V.reviews?.avg_rating != null ? Number(V.reviews.avg_rating) : avgR(totNow);
  const replyRate = totNow.length ? totNow.filter(r => r.replied).length / totNow.length * 100 : null;

  const noYet = RP() && !g.length;
  const pm = V.prevMonth ? monthName(V.prevMonth) : null;
  const vs = (c, p) => `${chipFor(c, p)}${pm ? ` vs ${pm}` : ''}`;
  out += `<p class="lede">${hasViews ? `In ${monthName(state.month)} the profile was viewed ${fmt(v)} times on Google Search and Maps${pm && vp ? ` (${vp ? (v >= vp ? 'up' : 'down') + ' from ' + fmt(vp) : ''} in ${pm})` : ''}. ` : ''}
    ${noYet ? `Google has not reported profile activity for ${monthName(state.month)} yet. It usually lands within a few days. ` : `People took ${fmt(a)} action${a === 1 ? '' : 's'} from it: ${fmt(sum(g,'calls'))} call${sum(g,'calls') === 1 ? '' : 's'}, ${fmt(sum(g,'website_clicks'))} website visit${sum(g,'website_clicks') === 1 ? '' : 's'} and ${fmt(sum(g,'direction_requests'))} direction request${sum(g,'direction_requests') === 1 ? '' : 's'}.`}
    ${totNow.length ? `The profile holds ${fmt(rvN)} Google reviews averaging ${fmt(rvA, 2)} stars${newM.length ? `, with ${fmt(newM.length)} new this month` : ', with none new this month'}.` : ''}</p>`;

  out += `<div class="kpis">
    ${hasViews ? kpi('Profile views', fmt(v), vs(v, vp)) : ''}
    ${noYet ? '' : kpi('Actions taken', fmt(a), vs(a, ap))}
    ${noYet ? '' : kpi('Calls', fmt(sum(g,'calls')), vs(sum(g,'calls'), sum(gp,'calls')))}
    ${noYet ? '' : kpi('Website clicks', fmt(sum(g,'website_clicks')), vs(sum(g,'website_clicks'), sum(gp,'website_clicks')))}
    ${noYet ? '' : kpi('Direction requests', fmt(sum(g,'direction_requests')), vs(sum(g,'direction_requests'), sum(gp,'direction_requests')))}
    ${hasViews && v ? kpi('Action rate', pct1(a / v * 100), 'Actions ÷ profile views') : ''}
    ${totNow.length ? kpi('Google reviews', fmt(rvN), `${newM.length >= 0 ? `<span class="chip ${newM.length ? 'up' : 'flat'}">+${fmt(newM.length)}</span> this month` : ''}`) : ''}
    ${totNow.length ? kpi('Average rating', fmt(rvA, 2) + ' ★', totPrev.length ? `${chipFor(avgR(totNow), avgR(totPrev))} vs ${pm}` : '') : ''}
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

  if (RP()) out += rpGbpExtras();
  /* Searches that surfaced the profile (Google releases these monthly, a few weeks late) */
  const kwM = RAW.gkw.filter(r => monthOf(r.month) <= state.month).map(r => monthOf(r.month)).sort().pop();
  if (kwM){
    const rows = RAW.gkw.filter(r => monthOf(r.month) === kwM).map(r => ({ ...r, sortv: r.users ?? (r.below_threshold ? r.below_threshold - 0.5 : 0),
      brand: new RegExp(brandPattern(), 'i').test(r.keyword) ? 'Your name' : 'Discovery' }));
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
      <div class="card"><div class="cardhead"><div><h3>Every Google review</h3><p class="sub">${RP() && rvN > rv.length ? `The ${fmt(rv.length)} most recent of ${fmt(rvN)} that Google makes available` : `${fmt(rv.length)} reviews`} · ${fmt(avgR(rv), 2)} average · newest first</p></div></div>
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
  /* Added questions are shown on their own and never move the trend figures. */
  if (RP()){ V.geoSnapAll = V.geoSnapAll || V.geoSnap; V.geoSnap = rpCoreOnly(V.geoSnap); V.geoPrevSnap = rpCoreOnly(V.geoPrevSnap); }
  if (RP()) out += `<div class="card" id="rpAi">${rpAiHtml()}</div>` + rpAioTable() + `<div class="card" id="rpQ">${rpQHtml()}</div>`;
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
  /* Month on month: last month's final check. Compare rates, not raw counts, because the
     question set can grow between months. */
  const pm = V.geoPrevAsOf ? monthName(monthOf(V.geoPrevAsOf)).split(' ')[0] : null;
  const rate = named / snap.length * 100, prevRate = V.geoPrevSnap.length ? prevNamed / V.geoPrevSnap.length * 100 : null;
  const pTot = sum(V.gsharePrev,'mentions'), pMine = sum(V.gsharePrev.filter(r => r.is_client),'mentions');
  const prevSov = pTot ? pMine / pTot * 100 : null;

  out += `<p class="lede">On ${asOf(V.geoAsOf)} we asked ${engines.length} AI assistant${engines.length === 1 ? '' : 's'} (${engines.join(', ')})
    ${fmt(new Set(snap.map(r => r.prompt)).size)} questions ${esc(CFG.asker || 'a homeowner')} might ask. ${CFG.name} was named in ${fmt(named)} of ${fmt(snap.length)} answers${V.geoPrevAsOf
      ? `, against ${fmt(prevNamed)} of ${fmt(V.geoPrevSnap.length)} on ${asOf(V.geoPrevAsOf)}, the ${isPrevMonth(V.geoPrevAsOf, V.geoAsOf) ? 'end of last month' : 'last earlier check'}` : ''}.${sov != null
      ? ` Across every business the assistants recommended, ${CFG.name} took ${pct1(sov)} of the mentions${prevSov != null ? `, from ${pct1(prevSov)} the month before` : ''}.` : ''}</p>`;
  out += `<div class="kpis">
    ${kpi('Named in answers', `${fmt(named)} / ${fmt(snap.length)}`, pct1(rate) + ' of answers' +
        (prevRate != null ? ` ${stepChip(rate, prevRate, pm, { dp: 1 }).replace(/vs/, 'pts vs')}` : ''))}
    ${kpi('AI share of voice', sov != null ? pct1(sov) : '—', (brandTot ? `${fmt(mine)} of ${fmt(brandTot)} business mentions` : '') +
        (sov != null && prevSov != null ? ` ${stepChip(sov, prevSov, pm, { dp: 1 }).replace(/vs/, 'pts vs')}` : ''))}
    ${V.geoPrevAsOf ? kpi(`${isPrevMonth(V.geoPrevAsOf, V.geoAsOf) ? 'Last month' : 'Earlier check'} (${pm})`, `${fmt(prevNamed)} / ${fmt(V.geoPrevSnap.length)}`,
        `${prevRate != null ? pct1(prevRate) + ' of answers' : ''}${prevSov != null ? ` · ${pct1(prevSov)} share` : ''} · ${asOf(V.geoPrevAsOf)}`)
      : kpi('Last month', '—', 'First month measured: next month shows the change')}
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
      { k:'notes', label:'Other businesses named' }], (V.geoSnapAll || snap).map(r => ({ ...r, src: (r.sources || []).join(' ') })), { sort:{ k:'prompt', dir:1 }, maxH:520 })}</div>`;
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
    return out + (RAW.paid.length ? emptyState('No ad data for this month', 'Nothing has been spent in this period.')
      : emptyState('The campaigns are not live yet', `${paidLaunchNote()}. Spend, clicks, leads and every search term appear here from the first day the ads run. Nothing is estimated before then.`));

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

  out += paidCallsCard();

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

/* Calls through Google forwarding numbers, one row per call from md_paid_calls.
   No rows on record means the account has never recorded one, or it tracks calls with a
   third party tool, so the card stays away rather than showing a false 0. Once there
   is a record, a month with no calls is a real 0. Times stay in the ad account's time zone. */
function paidCallsCard(){
  if (!RAW.calls.length) return '';
  const secs = r => Number(r.duration_seconds) || 0;
  const mmss = v => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
  const when = v => { const [, y, m, d, h, mi] = String(v).match(/(\d+)-(\d+)-(\d+)[T ](\d+):(\d+)/) || [];
    return y ? `${d}/${m}/${y} ${(+h % 12) || 12}:${mi}${+h < 12 ? 'am' : 'pm'}` : esc(v); };
  const zone = String((RAW.calls.find(r => r.account_time_zone) || {}).account_time_zone || '').split('/').pop().replace(/_/g, ' ');
  const answered = r => r.status !== 'MISSED';
  const count = a => ({ all: a.length, long: a.filter(r => answered(r) && secs(r) >= 30).length, missed: a.filter(r => !answered(r)).length });
  const c = count(V.calls), p = V.callsPrev.length ? count(V.callsPrev) : null;
  const talked = V.calls.filter(r => answered(r) && secs(r) > 0);
  const avgLen = talked.length ? Math.round(talked.reduce((t, r) => t + secs(r), 0) / talked.length) : null;
  const was = n => p ? `${monthName(V.prevMonth)}: ${fmt(n)}` : '';
  let out = `<div class="card"><div class="cardhead"><div><h3>Phone calls from the ads</h3>
    <p class="sub">Every call Google recorded through its forwarding number: people who tapped call on an ad, or clicked an ad and then rang the number on the website.</p></div></div>
    <div class="kpis">
    ${kpi('Calls', fmt(c.all), was(p && p.all))}
    ${kpi('30 seconds or longer', fmt(c.long), was(p && p.long))}
    ${kpi('Missed', fmt(c.missed), was(p && p.missed))}
    ${kpi('Average call', avgLen == null ? '—' : mmss(avgLen), 'Answered calls, minutes:seconds')}</div>`;
  const note = 'Google only tracks calls that come from an ad, so calls from Google Maps, organic search or a saved number are not here. It shares the area code or mobile prefix, never the full number. Some of these calls may already be counted in Leads above, so do not add the two together.';
  if (!V.calls.length) return out + `<p class="sub">No calls came through from the ads in ${monthName(state.month)}.</p><p class="dtnote">${note}</p></div>`;
  const dates = [...V.paid.map(r => String(r.date).slice(0, 10)), ...V.calls.map(r => String(r.started_at).slice(0, 10))].sort();
  const days = [];
  for (let d = new Date(dates[0] + 'T00:00:00'), end = dates[dates.length - 1]; ymd(d) <= end; d.setDate(d.getDate() + 1)) days.push(ymd(d));
  /* Bars, not the line chart: its axis pads small counts into "1, 1, 1, 0, -0". */
  const perDay = days.map(d => V.calls.filter(r => String(r.started_at).startsWith(d)).length), peak = Math.max(...perDay);
  const dmy = d => d.split('-').reverse().join('/');
  if (days.length > 1) out += `<p class="sub" style="margin-top:18px">Calls per day, ${dmy(days[0])} to ${dmy(days[days.length - 1])}. The busiest day had ${fmt(peak)}.</p>
    <div style="display:flex;align-items:flex-end;gap:2px;height:72px;margin:8px 0 18px">${perDay.map((n, i) =>
      `<span title="${dmy(days[i])}: ${n} call${n === 1 ? '' : 's'}" style="flex:1;min-width:0;border-radius:2px 2px 0 0;height:${n ? Math.max(n / peak * 100, 8) : 3}%;background:${n ? 'var(--accent)' : 'var(--bd)'}"></span>`).join('')}</div>`;
  const rows = V.calls.map(r => ({ started_at: r.started_at, duration: secs(r), outcome: answered(r) ? 'Answered' : 'Missed',
    source: r.source === 'LANDING_PAGE' ? 'Website, after clicking an ad' : r.source === 'AD' ? 'The ad' : null,
    how: r.call_type === 'MANUALLY_DIALED' ? 'Dialled' : r.call_type === 'HIGH_END_MOBILE_SEARCH' ? 'Tapped to call' : null,
    campaign: r.campaign, area: r.caller_area_code }));
  return out + dataTable('calls', [{ k:'started_at', label:'When', fmt:when }, { k:'duration', label:'Length', num:1, fmt:mmss },
    { k:'outcome', label:'Outcome' }, { k:'source', label:'Came from' }, { k:'how', label:'How' }, { k:'campaign', label:'Campaign' }, { k:'area', label:'Caller area' }],
    rows, { sort:{ k:'started_at', dir:-1 }, maxH:360, note: `Times are in the ad account's time zone${zone ? ` (${esc(zone)})` : ''}. ${note}` }) + '</div>';
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
  if (previewOnly()) { box.checked = !box.checked; return toast('Client view is a preview. Switch to Admin view to change anything.', 'bad'); }
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
  let out = head('Social', 'Organic social', 'Reach, engagement and follower growth by platform, and how every post performed.');
  if (!V.social.length && !V.sposts.length) return out + emptyState('No social data for this month', CFG.emptyNotes?.social || 'Nothing recorded in this period.');
  /* A month still running is not compared with a whole month: a few days against thirty only ever looks like a collapse. */
  const nowD = new Date(), running = state.month === `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}`;
  const pm = V.prevMonth && !running ? monthName(V.prevMonth) : null, vs = (c, p) => running ? 'Month in progress' : `${chipFor(c, p)}${pm ? ` vs ${pm}` : ''}`;
  /* A metric a platform does not report stays blank: it is never added in as a zero. */
  const total = (rows, k) => { const v = rows.filter(r => r[k] != null); return v.length ? sum(v, k) : null; };
  const plats = [...new Set(V.social.map(r => r.platform))].sort();
  const reach = total(V.social,'reach'), views = total(V.social,'views'), eng = total(V.social,'engagement');
  const reachP = total(V.socialPrev,'reach'), viewsP = total(V.socialPrev,'views'), engP = total(V.socialPrev,'engagement');
  /* Followers are a running total, not a series: read the latest count on or before this month. */
  const end = state.month, followersAt = (p, m) => { const r = RAW.social.filter(x => x.platform === p && x.followers != null && monthOf(x.date) <= m)
    .sort((a, b) => String(a.date).localeCompare(String(b.date))).pop(); return r ? Number(r.followers) : null; };
  const rows = plats.map(p => { const c = V.social.filter(r => r.platform === p), q = V.socialPrev.filter(r => r.platform === p);
    return { platform:p, followers:followersAt(p, end), followersPrev:V.prevMonth ? followersAt(p, V.prevMonth) : null,
      reach:total(c,'reach'), views:total(c,'views'), engagement:total(c,'engagement'),
      posts:V.sposts.filter(r => r.platform === p).length, reachPrev:total(q,'reach'), engPrev:total(q,'engagement') }; });
  const followers = rows.filter(r => r.followers != null).reduce((t, r) => t + r.followers, 0);
  const lead = rows.filter(r => r.reach != null).sort((a, b) => b.reach - a.reach)[0];
  const parts = [];
  if (reach != null) parts.push(`total daily reach was ${fmt(reach)}${pm && reachP ? ` (${reach >= reachP ? 'up' : 'down'} from ${fmt(reachP)} in ${pm})` : ''}`);
  if (eng != null) parts.push(`the accounts earned ${fmt(eng)} engagement${eng === 1 ? '' : 's'}`);
  out += `<p class="lede">In ${monthName(state.month)} ${parts.join(' and ') || 'no reach or engagement was reported'}.${V.sposts.length ? ` ${fmt(V.sposts.length)} post${V.sposts.length === 1 ? ' is' : 's are'} listed below.` : ''}${followers ? ` Together they have ${fmt(followers)} followers.` : ''}</p>`;
  out += `<div class="kpis">
    ${reach != null ? kpi('Reach', fmt(reach), vs(reach, reachP)) : ''}
    ${views != null ? kpi('Views', fmt(views), vs(views, viewsP)) : ''}
    ${eng != null ? kpi('Engagement', fmt(eng), vs(eng, engP)) : ''}
    ${V.sposts.length ? kpi('Posts', fmt(V.sposts.length), monthName(state.month)) : ''}
    ${rows.filter(r => r.followers != null).map(r => kpi(`${esc(r.platform)} followers`, fmt(r.followers), r.followersPrev != null && pm ? `${stepChip(r.followers, r.followersPrev, pm)}` : 'current')).join('')}</div>`;
  const notes = [];
  if (lead && reach && rows.filter(r => r.reach != null).length > 1) notes.push(callout('good', `${esc(lead.platform)} had the most reach`, `${fmt(lead.reach)} of the ${fmt(reach)} total daily reach in ${monthName(state.month)} came from ${esc(lead.platform)}.`));
  out += notes.join('');
  const days = [...new Set(V.social.map(r => r.date))].sort();
  const daily = k => days.map(d => total(V.social.filter(r => r.date === d), k));
  if (days.length > 1 && reach != null) out += `<div class="card"><div class="cardhead"><div><h3>Daily reach and engagement</h3><p class="sub">${monthName(state.month)}, all platforms that report them. Reach is counted per day, so one person can count on more than one day</p></div>
      <div class="legend"><span><i style="background:var(--accent)"></i>Reach</span><span><i style="background:var(--ink3)"></i>Engagement</span></div></div>
    <div data-chart='${JSON.stringify({ series: [{ data: daily('reach'), color:'var(--accent)' }, { data: daily('engagement'), color:'var(--ink3)' }] })}'></div></div>`;
  if (rows.length) out += `<div class="card"><div class="cardhead"><div><h3>By platform</h3><p class="sub">A dash means the platform does not report that figure</p></div></div>
    ${dataTable('socplat', [{ k:'platform', label:'Platform' }, { k:'followers', label:'Followers', num:1, fmt:v => fmt(v) },
      { k:'reach', label:'Reach', num:1, fmt:v => fmt(v) }, { k:'views', label:'Views', num:1, fmt:v => fmt(v) },
      { k:'engagement', label:'Engagement', num:1, fmt:v => fmt(v) }, { k:'posts', label:'Posts', num:1, fmt:v => fmt(v) }], rows, { sort:{ k:'reach', dir:-1 }, filter:false })}</div>`;
  if (V.sposts.length){
    const P = V.sposts.map(r => { const parts = [r.likes, r.comments, r.shares].filter(v => v != null);
      return { ...r, eng: r.engagement != null ? Number(r.engagement) : parts.length ? parts.reduce((t, v) => t + Number(v), 0) : null, text:(r.caption || '').replace(/\s+/g, ' ').slice(0, 140) }; });
    out += `<div class="card"><div class="cardhead"><div><h3>Every post</h3><p class="sub">${fmt(P.length)} posts in ${monthName(state.month)}. A dash means the platform does not report that figure</p></div></div>
      ${dataTable('socposts', [{ k:'post_date', label:'Date', fmt:v => v ? rpAu(v) : '—' }, { k:'platform', label:'Platform' },
        { k:'text', label:'Post', fmt:(v, r) => r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(v || 'View post')}</a>` : esc(v) },
        { k:'reach', label:'Reach', num:1, fmt:v => fmt(v) }, { k:'eng', label:'Engagement', num:1, fmt:v => fmt(v) }], P, { sort:{ k:'post_date', dir:-1 }, maxH:520 })}</div>`;
  }
  return out;
}

function viewLeads(){
  let out = head('Leads & CRM', 'Enquiries', 'Where enquiries came from this month.');
  if (!V.leads.length) return out + emptyState(CFG.emptyNotes?.leads_crm ? 'Not connected yet' : 'No leads recorded', CFG.emptyNotes?.leads_crm || 'Nothing has come through in this period.');
  const bySrc = {}; V.leads.forEach(r => bySrc[r.source || 'Unknown'] = (bySrc[r.source||'Unknown']||0) + Number(r.count||0));
  out += `<div class="kpis">${Object.entries(bySrc).map(([s,n]) => kpi(s, fmt(n))).join('')}</div>`;
  return out;
}

/* ---------------------------------------------------------------- admin view
   One dashboard per client (Jose 19/10/2026): the client view above, and an admin view on
   the SAME URL for the team and the client's partners: onboarding, call brief, discovery
   call, ads brief, launch checklist and the campaign plan imported from the partner's Excel.
   Switched on per client by CFG.adminView. Shown only to an md_client_access admin/editor,
   and every byte of it comes from ONE security-definer function, md_admin_pack(), which
   refuses everyone else: a viewer (the client) never receives the data, not just the tab.
   Ticks and budgets stay with the register writers (Jose, Jhen, Janice), as on /clients/. */
const ADMIN_ORDER = ['adm_onboarding','adm_call','adm_discovery','adm_brief','adm_launch','adm_plan'];
Object.assign(LABEL, { adm_onboarding:'Onboarding', adm_call:'Call brief', adm_discovery:'Discovery call',
  adm_brief:'Ads brief', adm_launch:'Launch checklist', adm_plan:'Campaign plan', review:'Review your ads' });
let ADM = null;
function isAdm(m){ return String(m).startsWith('adm_'); }
function adminOn(){ return !!(CFG.adminView && ADM) && state.view !== 'client'; }
async function loadAdmin(){
  ADM = null;
  if (!CFG.adminView || !['admin','editor'].includes(state.role)) return;
  const { data, error } = await sb.rpc('md_admin_pack', { p_slug: CFG.slug });
  if (error) console.warn('admin view:', error.message); else ADM = data;
}
function admCount(m){
  if (!ADM) return '';
  if (m === 'adm_launch'){ const n = (ADM.items || []).length, d = (ADM.items || []).filter(i => i.done).length;
    return n ? `<span class="acount">${d}/${n}</span>` : ''; }
  if (m === 'adm_onboarding'){ const o = (ADM.onboarding || [])[0]; return o ? `<span class="acount">${o.met}/${o.applicable}</span>` : ''; }
  return '';
}
const dmy = d => d ? new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-AU') : '';
const tbcV = v => !v || /^to confirm/i.test(String(v).trim());
const openQ = a => tbcV(a) || /not covered|ask on friday|to confirm/i.test(a || '');
function admHead(eyebrow, h2, sub){
  return head(eyebrow, h2, sub) + `<p class="admflag">Admin view: the Ready to Rank team and ${esc(CFG.partnerName || 'partners')} only. ${esc(CFG.name)} never sees this tab.</p>`;
}
function kvRows(rows){
  return `<table class="tbl kvt"><tbody>${rows.map(([label, value]) => {
    const empty = value == null || value === '' || (Array.isArray(value) && !value.length);
    const v = empty ? 'To confirm' : Array.isArray(value) ? value.map(x => `<span class="pill">${esc(x)}</span>`).join('') : esc(value);
    return `<tr><th>${esc(label)}</th><td class="${empty || openQ(String(value)) && !Array.isArray(value) ? 'tbc' : ''}">${v}</td></tr>`; }).join('')}</tbody></table>`;
}

function viewAdmOnboarding(){
  let out = admHead('Onboarding', 'Where onboarding stands', 'Computed from the records, never ticked by hand.');
  const o = ADM.onboarding || [];
  if (!o.length) return out + emptyState('No onboarding record yet', 'Run onboard for this client first.');
  out += o.map(x => { const pct = x.applicable ? Math.round(x.met / x.applicable * 100) : 0;
    return `<div class="card"><div class="cardhead"><div><h3>${esc((x.chain || '').toUpperCase())} engagement</h3>
      <p class="sub">${x.onboarding_complete_at ? 'Onboarding complete ' + dmy(x.onboarding_complete_at) : `${x.met} of ${x.applicable} done`}${x.start_date ? ' · started ' + dmy(x.start_date) : ''}</p></div>
      <span class="chip ${pct === 100 ? 'up' : 'warnc'}">${pct}%</span></div>
      <div class="pbar"><i style="width:${pct}%"></i></div>
      <ul class="checks">${(x.conditions || []).map(c => `<li class="${c.done ? 'ok' : 'no'}"><span>${c.done ? '✓' : '✗'}</span>${esc(c.label)}</li>`).join('')}</ul></div>`; }).join('');
  const jobs = ADM.jobs || [];
  if (jobs.length){
    const L = { zoom_review:'Review the Zoom onboarding call', connections:'Add to Pipeboard and Windsor', folder:'Client folder', drive:'Google Drive folder',
      memory:'Client memory notes', repo:'GitHub repo', xero_check:'Check the invoice in Xero', slack_channel:'Private Slack channel', brief_post:'Post the brief, pin the checklist', custom:'Extra job' };
    out += `<div class="card"><div class="cardhead"><div><h3>Set-up jobs</h3><p class="sub">Created when the client was set up</p></div></div>
      <table class="tbl"><thead><tr><th>Job</th><th>Status</th><th></th></tr></thead><tbody>${jobs.map(j => `<tr>
        <td><b>${esc(L[j.job] || j.job)}</b>${j.result ? `<div class="dtnote">${esc(j.result)}</div>` : ''}</td>
        <td>${j.status === 'done' ? '✓' : '✗'} ${esc(j.status)}</td>
        <td>${ADM.can_write && j.status !== 'done' ? `<button class="btn mini" data-admjob="${j.id}">Mark done</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
  }
  return out;
}

function viewAdmCall(){
  let out = admHead('Call brief', 'What the onboarding call settled', 'Taken from the call recording. The call is the evidence.');
  const c = ADM.call;
  if (!c) return out + emptyState('No call brief yet', `Ask Claude: “review the onboarding call for ${esc(CFG.slug)}”.`);
  const d = c.discrepancies || [];
  if (d.length) out += callout('bad', `${d.length} difference${d.length > 1 ? 's' : ''} between the call and the form`,
    d.map(x => `<b>${esc(x.field || '')}</b>: form says “${esc(x.form || '')}”, the call said “${esc(x.call || '')}”`).join('<br>'));
  out += `<p class="lede">${[c.meeting_on && `Call on <b>${dmy(c.meeting_on)}</b>`, c.attendees && esc(c.attendees), c.created_by && `written by ${esc(c.created_by)}`].filter(Boolean).join(' · ')}</p>`;
  out += `<div class="card"><div class="cardhead"><div><h3>What we covered</h3></div></div><p class="prose">${c.covered ? esc(c.covered) : '<span class="tbc">Not written yet.</span>'}</p></div>`;
  out += `<div class="card"><div class="cardhead"><div><h3>Confirmed on the call</h3></div></div>${kvRows([
    ['Services bought', c.services_confirmed], ['Services, in their words', c.services_list], ['Locations', c.locations],
    ['Priority locations', c.priority_locations], ['Target keywords', c.keywords], ['Competitors', c.competitors], ['Promised on the call', c.promised]])}</div>`;
  const acc = Object.entries(c.access_confirmed || {});
  out += `<div class="card"><div class="cardhead"><div><h3>Access, as agreed on the call</h3></div></div>${acc.length
    ? kvRows(acc.map(([k, v]) => [k.toUpperCase(), v])) : '<p class="sub">Nothing recorded from the call.</p>'}</div>`;
  return out;
}

function viewAdmDiscovery(){
  let out = admHead('Discovery call', 'Every question asked, and the answer given', 'Answers as given on the call. Amber still needs confirming.');
  const rows = (ADM.call && Array.isArray(ADM.call.discovery)) ? ADM.call.discovery : [];
  if (!rows.length) return out + emptyState('No discovery answers yet', `Ask Claude: “load the discovery call for ${esc(CFG.slug)}”.`);
  const open = rows.filter(r => openQ(r.a)).length, groups = [];
  rows.forEach(r => { const s = r.section || 'Questions'; let g = groups.find(x => x.s === s); if (!g) groups.push(g = { s, rows: [] }); g.rows.push(r); });
  out += `<div class="kpis">${kpi('Questions', fmt(rows.length))}${kpi('Answered', fmt(rows.length - open))}${kpi('Still to confirm', fmt(open), open ? 'Shown in amber' : 'All answered')}</div>`;
  out += groups.map(g => `<div class="card"><div class="cardhead"><div><h3>${esc(g.s)}</h3></div></div>${kvRows(g.rows.map(r => [r.q, r.a]))}</div>`).join('');
  return out;
}

function viewAdmBrief(){
  const b = ADM.brief;
  let out = admHead('Ads brief', 'What we are building, campaign by campaign', 'The brief the team builds from.');
  if (!b) return out + emptyState('No ads brief yet', 'The launch checklist has not been seeded for this client.');
  const camps = b.campaigns || [];
  out += `<p class="lede">${b.summary ? esc(b.summary) : '<span class="tbc">No summary yet.</span>'}</p>`;
  if (ADM.can_write){
    const get = n => (ADM.budgets || []).find(x => x.campaign_no === n) || {};
    const rows = [[0, 'Total, all campaigns'], ...camps.map((x, k) => [k + 1, `Campaign ${k + 1}: ${x.name}`])];
    out += `<div class="card moneycard"><div class="cardhead"><div><h3>Ad budget</h3><p class="sub">Only Jose, Jhen and Janice see this card</p></div></div>
      <table class="tbl kvt"><tbody>${rows.map(([n, l]) => { const x = get(n);
        return `<tr><th>${esc(l)}</th><td class="${x.monthly_amount == null ? 'tbc' : ''}">${x.monthly_amount == null ? 'Not confirmed' : `<b>${money(x.monthly_amount)}</b> a month`}${x.note ? `<div class="dtnote">${esc(x.note)}</div>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
  }
  const F = [['goal','Goal'],['sends_to','Sends to'],['locations','Locations'],['age','Age'],['gender','Gender'],['interests','Interests'],
             ['placements','Placements'],['offer','Offer'],['creative','Creative'],['conversion_event','Conversion event'],['notes','Notes']];
  out += camps.map((x, k) => `<div class="card"><div class="cardhead"><div><h3>Campaign ${k + 1}: ${esc(x.name)}</h3><p class="sub">${esc(x.platform || b.platform || '')}</p></div></div>
    ${kvRows(F.map(([f, l]) => [l, x[f]]))}</div>`).join('') || emptyState('No campaigns in the brief yet', '');
  return out;
}

function viewAdmLaunch(){
  const b = ADM.brief || {}, items = ADM.items || [];
  let out = admHead('Launch checklist', 'Nothing launches until every row is ticked', 'Tick a row only when you have seen it working yourself, not when someone says it is done.');
  if (!items.length) return out + emptyState('No checklist yet', 'Seed it with pa_seed_launch during onboarding.');
  const done = items.filter(i => i.done).length, pct = Math.round(done / items.length * 100);
  out += `<div class="kpis">${kpi('Launch date', b.launch_date ? new Date(b.launch_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday:'short', day:'2-digit', month:'2-digit' }) : 'Not set')}
    ${kpi('Done', `${done} of ${items.length}`, pct + '%')}${kpi('Checklist owner', esc(b.brief_owner || 'Not set'))}</div>
    <div class="pbar"><i style="width:${pct}%"></i></div>
    <p class="dtnote">${ADM.can_write ? (b.slack_ts ? 'Every tick updates the pinned checklist in Slack.' : 'Ticks save here. The checklist is not pinned in Slack yet.') : 'View only. Jose, Jhen or Janice tick the rows.'}</p>`;
  const ST = [['day0','Day 0 · onboarding call'],['brief','Day 7 · brief'],['copy','Day 14 · copy approved'],['build','Day 21 · build ready'],['campaign','Campaigns'],['launch','Day 28 · launch']];
  out += `<div class="card"><table class="tbl launch"><thead><tr><th class="tick"></th><th>Item</th><th>Owner</th><th>Note</th></tr></thead><tbody>${ST.map(([s, l]) => {
    const rows = items.filter(i => (i.stage || 'campaign') === s); if (!rows.length) return '';
    return `<tr class="stage"><td colspan="4">${esc(l)} · ${rows.filter(r => r.done).length}/${rows.length}</td></tr>` + rows.map(i => `<tr class="${i.done ? 'done' : ''}">
      <td class="tick"><input type="checkbox" data-admtick="${i.id}" ${i.done ? 'checked' : ''} ${ADM.can_write ? '' : 'disabled'} aria-label="${esc(i.item)}"></td>
      <td>${esc(i.item)}${i.owner_name ? `<span class="osm">${esc(i.owner_name)}</span>` : ''}</td><td class="nowrap">${esc(i.owner_name || '')}</td><td class="dtnote">${esc(i.note || '')}</td></tr>`).join(''); }).join('')}</tbody></table></div>`;
  return out;
}

/* Campaign plan: whatever the partner's spreadsheet holds, sheet by sheet, as spreadsheet
   tables. Imported in the browser (SheetJS), stored by md_campaign_plan_import(). Every
   figure is a cell from their file: totals are summed from it, never typed. */
const PLAN_TEMPLATE = {
  'Campaigns': ['Campaign', 'Type', 'Goal', 'Locations', 'Daily budget (AUD)', 'Monthly budget (AUD)', 'Bid strategy', 'Landing page', 'Notes'],
  'Keywords': ['Campaign', 'Ad group', 'Keyword', 'Match type', 'Monthly searches (local)', 'CPC low (AUD)', 'CPC high (AUD)', 'Landing page', 'Notes'],
  'Ads': ['Campaign', 'Ad group', ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`), ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`), 'Final URL', 'Path 1', 'Path 2'],
  'Negative keywords': ['Campaign', 'Negative keyword', 'Match type', 'Why'],
  'Assets': ['Campaign', 'Type (sitelink, callout, call, snippet)', 'Text', 'Description line 1', 'Description line 2', 'URL'],
};
let XLSX_P = null;
function loadXlsx(){
  return XLSX_P || (XLSX_P = new Promise((ok, no) => { const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => ok(window.XLSX); s.onerror = () => { XLSX_P = null; no(new Error('Could not load the spreadsheet reader.')); };
    document.head.appendChild(s); }));
}
async function admTemplate(){
  const X = await loadXlsx(), wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([
    [`${CFG.name}: Google Ads campaign plan`], [],
    ['Fill in one row per line on each tab. Keep the column headings as they are; add columns at the end if you need more.'],
    ['Monthly searches are LOCAL to the client\'s area, never Australia-wide.'],
    ['Leave a cell empty if it is not decided yet. Do not guess a number.'],
    ['Health advertising rules apply: no testimonials, no “best” or guaranteed results, nothing that pushes people into treatment.'],
    ['When it is ready: open the dashboard, Campaign plan tab, Import spreadsheet. Importing again replaces the plan.'],
  ]), 'How to fill this in');
  Object.entries(PLAN_TEMPLATE).forEach(([n, cols]) => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([cols]), n));
  X.writeFile(wb, `${CFG.slug}-campaign-plan-template.xlsx`);
}
function sheetOf(X, name, ws){
  const cell = v => v instanceof Date ? ymd(v).split('-').reverse().join('/') : typeof v === 'string' ? (v.trim() || null) : v;
  const grid = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false })
    .map(r => r.map(cell)).filter(r => r.some(v => v != null));
  if (grid.length < 2) return null;
  const head = grid[0].map((h, i) => h == null ? `Column ${i + 1}` : String(h));
  const width = Math.max(...grid.map(r => r.length));
  while (head.length < width) head.push(`Column ${head.length + 1}`);
  const body = grid.slice(1).map(r => head.map((_, i) => r[i] ?? null));
  const keep = head.map((h, i) => !/^Column \d+$/.test(h) || body.some(r => r[i] != null));
  return { name, columns: head.filter((_, i) => keep[i]), rows: body.map(r => r.filter((_, i) => keep[i])) };
}
/* Local QA only: lets the headless check drive the real parser (never exposed on the live site). */
if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) window.__mdAdm = { sheetOf, loadXlsx, PLAN_TEMPLATE };
async function admImport(input){
  const f = input.files && input.files[0]; input.value = ''; if (!f) return;
  if (!/\.(xlsx|xlsm|xls|csv)$/i.test(f.name)) return toast('That is not a spreadsheet. Save it as .xlsx and try again.', 'bad');
  try {
    const X = await loadXlsx(), wb = X.read(await f.arrayBuffer(), { cellDates: true });
    const sheets = wb.SheetNames.filter(n => !/^(how to|read ?me|instructions)/i.test(n)).map(n => sheetOf(X, n, wb.Sheets[n])).filter(Boolean);
    if (!sheets.length) return toast('No rows found in that file. The first row of each tab should be the headings.', 'bad');
    const n = sheets.reduce((t, s) => t + s.rows.length, 0);
    if (ADM.plan && !confirm(`Replace the current campaign plan with “${f.name}” (${sheets.length} tab${sheets.length > 1 ? 's' : ''}, ${n} rows)?`)) return;
    const { error } = await sb.rpc('md_campaign_plan_import', { p_slug: CFG.slug, p_file_name: f.name, p_sheets: sheets });
    if (error) return toast('Not imported: ' + error.message, 'bad');
    await loadAdmin(); renderAll(); toast(`Imported ${n} rows from ${sheets.length} tab${sheets.length > 1 ? 's' : ''}.`);
  } catch (e) { toast('Could not read that file: ' + e.message, 'bad'); }
}
function viewAdmPlan(){
  const p = ADM.plan;
  let out = admHead('Campaign plan', 'The Google Ads campaign plan', 'Imported from the planning spreadsheet. Every figure here is a cell from that file.');
  out += `<div class="planbar"><label class="btn primary">Import spreadsheet<input type="file" id="planfile" accept=".xlsx,.xlsm,.xls,.csv" hidden></label>
    <button class="btn" data-admtemplate="1">Download the template</button>
    ${p ? `<span class="dtnote">From <b>${esc(p.file_name || 'spreadsheet')}</b>, imported by ${esc(p.imported_by_name || 'unknown')} on ${dmy(p.imported_at)}</span>` : ''}</div>`;
  if (reviewOn()) out += reviewSummary();
  if (!p || !(p.sheets || []).length) return out + emptyState('No campaign plan imported yet',
    'Download the template, fill it in (or use your own sheet with headings in the first row), then Import spreadsheet. Each tab of the file becomes a table here.');
  const sheets = p.sheets, col = (s, re) => s.columns.findIndex(c => re.test(c));
  const numCol = (s, i) => i >= 0 && s.rows.some(r => r[i] != null) && s.rows.every(r => r[i] == null || typeof r[i] === 'number');
  const total = (re, sheetRe) => { let t = null; sheets.filter(s => !sheetRe || sheetRe.test(s.name)).forEach(s => { const i = col(s, re);
    if (numCol(s, i)) t = (t || 0) + s.rows.reduce((a, r) => a + (Number(r[i]) || 0), 0); }); return t; };
  const camps = new Set(); sheets.forEach(s => { const i = col(s, /^campaign( name)?$/i); if (i >= 0) s.rows.forEach(r => r[i] && camps.add(String(r[i]))); });
  const kwS = sheets.find(s => /keyword/i.test(s.name) && !/negative/i.test(s.name)), kwI = kwS ? col(kwS, /^keyword/i) : -1;
  const kws = kwI >= 0 ? kwS.rows.filter(r => r[kwI]).length : null;
  const budget = total(/monthly budget/i), searches = total(/monthly searches|search volume|^volume/i, /keyword/i);
  out += `<div class="kpis">${camps.size ? kpi('Campaigns', fmt(camps.size)) : ''}${kws != null ? kpi('Keywords', fmt(kws)) : ''}
    ${searches != null ? kpi('Monthly searches', fmt(searches), 'Summed from the plan') : ''}${budget != null ? kpi('Monthly budget', money(budget), 'Summed from the plan') : ''}
    ${kpi('Tabs imported', fmt(sheets.length))}</div>`;
  out += sheets.map((s, si) => {
    const cols = s.columns.map((c, i) => { const n = numCol(s, i);
      return { k: 'c' + i, label: esc(c), num: n, fmt: n ? (/cpc|cost per/i.test(c) ? money2 : /budget|cost|aud|\$/i.test(c) ? money : (v => fmt(v))) : null }; });
    const rows = s.rows.map((r, ri) => Object.assign({ _i: ri }, ...r.map((v, i) => ({ ['c' + i]: v }))));
    return `<div class="card"><div class="cardhead"><div><h3>${esc(s.name)}</h3><p class="sub">${fmt(s.rows.length)} row${s.rows.length === 1 ? '' : 's'}</p></div></div>
      ${dataTable('plan' + si, cols, rows, { sort: { k: '_i', dir: 1 }, maxH: 560, filter: s.rows.length > 8 })}</div>`; }).join('');
  return out;
}
async function admTick(box){
  const want = box.checked; box.disabled = true;
  try {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch(CFG.supabaseUrl + '/functions/v1/paid-ads-launch', { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token, apikey: CFG.supabaseAnonKey },
      body: JSON.stringify({ action: 'tick', item_id: box.dataset.admtick, done: want }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'request failed (' + r.status + ')');
    await loadAdmin(); renderAll();
    toast(j.slack === 'updated' ? 'Saved. Slack checklist updated.' : j.slack === 'failed' ? 'Saved here, but Slack did not update. Tell Jose.' : 'Saved.');
  } catch (e) { box.checked = !want; box.disabled = false; toast('Not saved: ' + e.message, 'bad'); }
}
async function admJobDone(id){
  const { error } = await sb.rpc('so_job_update', { p_id: Number(id), p_status: 'done', p_result: 'Marked done on the dashboard' });
  if (error) return toast('Not saved: ' + error.message, 'bad');
  await loadAdmin(); renderAll(); toast('Job marked done.');
}

/* ---------------------------------------------------------------- shell + boot */
/* Introducing partner (CFG.introducer, opt-in): the agency that brought us the client, shown
   beside Ready to Rank in the delivered-by strip, the footer and the sign-in card.
   S Dental Care / Savvas Studio first, 23/10/2026. */
function introHtml(){
  const p = CFG.introducer; if (!p) return '';
  return `<span class="mlbl introsep">${esc(p.label || 'In partnership with')}</span>` + (p.logo
    ? `<img class="intrologo" src="${esc(p.logo)}" alt="${esc(p.name)}">` : `<span class="introname">${esc(p.name)}</span>`);
}
function gateBrand(){
  const logoSrc = CFG.logo && (CFG.logo.includes('/') ? CFG.logo : '../../assets/' + CFG.logo);
  return `<div class="gatebrand">${logoSrc ? `<img class="gclient" src="${logoSrc}" alt="${esc(CFG.name)}">` : ''}</div>`;
}
function gateBy(){
  return `<div class="gateby"><span class="mlbl">Delivered by</span>${CFG.r2rLogo ? `<img class="r2rlogo" src="${CFG.r2rLogo}" alt="Ready to Rank">` : 'Ready to Rank'}${introHtml()}</div>`;
}
function renderShell(){
  document.documentElement.style.setProperty('--accent', CFG.accent || '#17B4F0');
  if (EMBED) document.documentElement.classList.add('embed');
  document.title = `${CFG.name} — Marketing Dashboard`;
  const logoSrc = CFG.logo && (CFG.logo.includes('/') ? CFG.logo : '../../assets/' + CFG.logo);
  document.body.innerHTML = `
  <header class="top"><div class="wrap topin">
    ${logoSrc ? `<span class="${CFG.logoChip ? 'logochip' : ''}"><img class="logo" src="${logoSrc}" alt="${CFG.name}"></span>` : ''}
    <span class="name">${CFG.name}</span>
    <span class="spacer"></span>
    <span class="stamp" id="stamp"></span>
    ${isStaff() ? `<span class="viewsw" role="group" aria-label="Preview as"><button class="vsbtn" data-view="admin" aria-pressed="${state.view !== 'client'}">Admin view</button><button class="vsbtn" data-view="client" aria-pressed="${state.view === 'client'}">Client view</button></span>` : ''}
    <button class="btn" id="signout">Sign out</button>
  </div></header>
  <div class="team"><div class="wrap teamin">
    <span class="mlbl">Delivered by</span>${CFG.r2rLogo
      ? `<img class="r2rlogo" src="${CFG.r2rLogo}" alt="Ready to Rank">`
      : '<span style="font-weight:700;font-size:13px">Ready to Rank</span>'}${introHtml()}
    <span class="spacer"></span><span class="mlbl" id="monthlabel"></span>
  </div></div>
  <nav class="tabs"><div class="wrap navrow"><div class="tabsin" id="tabs" role="tablist"></div>
    ${logoSrc ? `<span class="navlogo${CFG.logoChip ? ' logochip' : ''}"><img class="logo" src="${logoSrc}" alt="${CFG.name}"></span>` : ''}</div></nav>
  <div class="monthbar"><div class="wrap monthin" id="monthchips"></div></div>
  <main><div class="wrap" id="panel"></div></main>
  <footer class="foot"><div class="wrap footin">
    <span>${CFG.name} · prepared by Ready to Rank${CFG.introducer ? ` in partnership with ${esc(CFG.introducer.name)}` : ''}</span>
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
    if (e.target.closest('[data-admtemplate]')) admTemplate().catch(err => toast(err.message, 'bad'));
    const jb = e.target.closest('[data-admjob]'); if (jb){ jb.disabled = true; admJobDone(jb.dataset.admjob); }
  });
  panel.addEventListener('change', e => { const b = e.target.closest('input[data-neg]'); if (b) toggleNeg(b);
    const t = e.target.closest('input[data-admtick]'); if (t) admTick(t);
    if (e.target.id === 'planfile') admImport(e.target); });
  panel.addEventListener('click', e => { if (e.target.closest('[data-tour]')) tourStart(state.tab); });
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
  /* Admin / Client view: staff see the dashboard exactly as the client does (no Admin row,
     client role, nothing writable). Remembered per browser. */
  $$('.vsbtn').forEach(b => b.addEventListener('click', () => {
    state.view = b.dataset.view; try { localStorage.setItem('md-view-' + CFG.slug, state.view); } catch (e) {}
    state.role = state.view === 'client' ? 'viewer' : state.realRole;
    $$('.vsbtn').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.view === state.view)));
    document.documentElement.classList.toggle('clientview', state.view === 'client');
    if (!visible().includes(state.tab)) state.tab = 'overview';
    renderAll();
  }));

  let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(drawCharts, 180); });
}

/* Sign-in: an emailed one-time code by default, the same as the content hub, so a
   client has one email address and no password for both. Staff with a password can
   still use it. shouldCreateUser:false — a code is only ever sent to an existing login. */
function renderGate(msg){
  document.documentElement.style.setProperty('--accent', CFG.accent || '#17B4F0');
  const card = (inner) => { document.body.innerHTML = `<div class="gate"><form class="gate-card${CFG.gateLogos ? ' branded' : ''}" id="gf">
    ${CFG.gateLogos ? gateBrand() : ''}<h1>${CFG.name}</h1>${inner}<div class="gate-err">${msg || ''}</div>${CFG.gateLogos ? gateBy() : ''}</form></div>`; msg = ''; };
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
  /* Filter on the signed-in user too: an admin's RLS shows EVERY access row for the client,
     and maybeSingle() on several rows errors, which silently demoted admins to viewer. */
  const { data: { session } } = await sb.auth.getSession();
  const { data: access } = await sb.from('md_client_access').select('role, modules')
    .eq('client_id', client.id).eq('user_id', session?.user?.id).maybeSingle();
  state.role = state.realRole = access?.role || 'viewer';

  await Promise.all([loadData(), loadAdmin(), loadReview()]);
  if (isStaff()) { try { state.view = localStorage.getItem('md-view-' + CFG.slug) === 'client' ? 'client' : 'admin'; } catch (e) {}
    if (state.view === 'client') { state.role = 'viewer'; document.documentElement.classList.add('clientview'); } }
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


/* ================================================================ ad review (client)
   The client reads and approves the keywords and ad copy from the imported campaign plan
   (Jose 23/10/2026, S Dental Care). md_ad_review_pack() hands over ONLY the keyword and ad
   sheets, with every budget / bid / CPC column removed server-side, so the browser never
   holds a number the client should not see. Opt-in per client: CFG.adReview. */
let REV = null;
function isStaff(){ return !!CFG.adminView && ['admin','editor'].includes(state.realRole); }
function previewOnly(){ return isStaff() && state.view === 'client'; }
function reviewOn(){ return !!(CFG.adReview && REV && REV.plan && reviewUnits().length); }
async function loadReview(){
  REV = null; if (!CFG.adReview) return;
  const { data, error } = await sb.rpc('md_ad_review_pack', { p_slug: CFG.slug });
  if (error) console.warn('ad review:', error.message); else REV = data;
}
const normKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/* {KeyWord:Default text} is Google's keyword insertion: the preview shows the default text. */
const dki = s => String(s ?? '').replace(/\{\s*keyword\s*:\s*([^}]*)\}/gi, '$1').trim();
function reviewUnits(){
  if (REV?._units) return REV._units;
  const sheets = REV?.plan?.sheets || [], at = (s, re) => s.columns.findIndex(c => re.test(String(c)));
  const cell = (r, i) => i >= 0 && r[i] != null && String(r[i]).trim() !== '' ? String(r[i]).trim() : null;
  const units = new Map(), unit = (key, campaign, group) => {
    if (!units.has(key)) units.set(key, { key, campaign, group, ads: [], keywords: [] }); return units.get(key); };
  let lastCamp = null;
  sheets.filter(s => s.kind === 'ads').forEach(s => {
    const iC = at(s, /campaign/i), iG = at(s, /ad.?group/i), iU = at(s, /final url|^url$|landing/i),
          iP1 = at(s, /path\s*1/i), iP2 = at(s, /path\s*2/i);
    const hs = s.columns.map((c, i) => /headline/i.test(c) ? i : -1).filter(i => i >= 0);
    const ds = s.columns.map((c, i) => /description/i.test(c) ? i : -1).filter(i => i >= 0);
    s.rows.forEach(r => {
      const H = hs.map(i => cell(r, i)).filter(Boolean), D = ds.map(i => cell(r, i)).filter(Boolean);
      if (!H.length && !D.length) return;
      const camp = cell(r, iC) || lastCamp || 'Campaign'; lastCamp = camp;
      const grp = cell(r, iG) || camp;
      unit(camp + ' › ' + grp, camp, grp).ads.push({ H, D, url: cell(r, iU), p1: cell(r, iP1), p2: cell(r, iP2) });
    });
  });
  const byGroup = new Map([...units.values()].map(u => [normKey(u.group), u]));
  sheets.filter(s => s.kind === 'keywords').forEach(s => {
    const iK = at(s, /keyword/i), iG = at(s, /ad.?group/i), iV = at(s, /search|volume/i);
    let section = null;
    s.rows.forEach(r => {
      const k = cell(r, iK); if (!k) return;
      const rest = r.some((v, i) => i !== iK && v != null && String(v).trim() !== '');
      if (iG < 0 && !rest) { section = k; return; }          /* a heading row: "Dentist Near Me" */
      const g = cell(r, iG) || section || 'Keywords';
      const u = byGroup.get(normKey(g)) || unit('Keywords › ' + g, null, g);
      byGroup.set(normKey(g), u);
      u.keywords.push({ k, vol: iV >= 0 ? r[iV] : null });
    });
  });
  REV._units = [...units.values()];
  return REV._units;
}
function reviewFor(key){ return (REV?.reviews || []).find(r => r.group_key === key); }
function reviewCounts(){
  const u = reviewUnits(), r = u.map(x => reviewFor(x.key));
  return { total: u.length, approved: r.filter(x => x?.status === 'approved').length, changes: r.filter(x => x?.status === 'changes').length };
}
function reviewSummary(){
  const c = reviewCounts(), u = reviewUnits();
  const line = c.approved === c.total ? `<b>All ${c.total} approved</b> by the client.`
    : `${c.approved} of ${c.total} approved${c.changes ? `, <b>${c.changes} with changes requested</b>` : ''}.`;
  return `<div class="card rvsum"><div class="cardhead"><div><h3>Client review of keywords and ads</h3>
      <p class="sub">${line} The client sees keywords and ad copy only, never budgets or bids. Re-importing the plan starts a fresh review.</p></div>
      <button class="btn primary" data-rvopen="1">Open the preview</button></div>
    ${u.filter(x => reviewFor(x.key)?.status === 'changes').map(x => { const r = reviewFor(x.key);
      return `<div class="callout warn"><h4>${esc(x.group)}</h4><p>${esc(r.comment || '')} <span class="dtnote">${esc(r.reviewer_name || '')}, ${dmy(r.reviewed_at)}</span></p></div>`; }).join('')}</div>`;
}
function viewReview(){
  const c = reviewCounts(), done = c.total && c.approved === c.total;
  let out = head('Your ads', 'Review your keywords and ads',
    'Before anything goes live, check the searches your ads will show for and exactly what the ads say. Approve each group, or tell us what to change.');
  out += `<div class="kpis">${kpi('Ad groups to review', fmt(c.total))}${kpi('Approved', fmt(c.approved))}${kpi('Changes requested', fmt(c.changes))}</div>`;
  out += `<div class="card rvcta"><div><h3>${done ? 'Everything is approved. Thank you.' : 'Open the preview to review'}</h3>
      <p class="sub">${done ? 'We will build the campaigns exactly as you approved them. You can still open the preview to look again.' : 'Each group shows the keywords and how the ad will look on Google.'}</p></div>
    <button class="btn primary" data-rvopen="1">${done ? 'Look again' : 'Open the preview'}</button></div>`;
  return out;
}
function siteHost(){ try { return new URL(REV.plan.site_url || CFG.siteUrl || location.href).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
function adPreview(a){
  const host = (() => { try { return new URL(a.url).hostname.replace(/^www\./, ''); } catch (e) { return siteHost(); } })();
  const path = [a.p1, a.p2].filter(Boolean).map(x => dki(x).replace(/\s+/g, '-').toLowerCase()).join('/');
  return `<div class="gad"><div class="gad-top"><span class="gad-sp">Sponsored</span></div>
    <div class="gad-site"><span class="gad-fav">${esc(CFG.name.slice(0, 1))}</span><div><b>${esc(CFG.name)}</b><span>${esc(host)}${path ? ' › ' + esc(path) : ''}</span></div></div>
    <div class="gad-h">${a.H.slice(0, 3).map(h => esc(dki(h))).join(' | ')}</div>
    <div class="gad-d">${a.D.slice(0, 2).map(d => esc(dki(d))).join(' ')}</div></div>`;
}
function rvUnitHtml(u, i){
  const r = reviewFor(u.key), staff = isStaff(), ro = staff;   /* staff look, the client approves */
  const lim = (t, n) => staff && dki(t).length > n ? ` <span class="rvover" title="Google allows ${n} characters">${dki(t).length}/${n}</span>` : '';
  const ads = u.ads.map((a, ai) => `
    <div class="rvad">${adPreview(a)}
      <p class="rvnote">Google mixes these headlines and descriptions, so people may see any combination of them.</p>
      <div class="rvlists"><div><span class="mlbl">Headlines (${a.H.length})</span><ol>${a.H.map(h => `<li>${esc(dki(h))}${lim(h, 30)}</li>`).join('')}</ol></div>
      <div><span class="mlbl">Descriptions (${a.D.length})</span><ol>${a.D.map(d => `<li>${esc(dki(d))}${lim(d, 90)}</li>`).join('')}</ol></div></div></div>`).join('');
  const kws = u.keywords.length ? `<div class="rvkw"><span class="mlbl">Searches this ad shows for (${u.keywords.length})</span>
      <div>${u.keywords.map(k => `<span class="pill">${esc(k.k)}${staff && typeof k.vol === 'number' ? ` <small>${fmt(k.vol)}/mo</small>` : ''}</span>`).join('')}</div>
      ${staff && u.keywords.some(k => typeof k.vol === 'number') ? '<p class="rvnote">Staff only: monthly searches as given in the plan. The client does not see these numbers.</p>' : ''}</div>` : '';
  const status = r ? `<span class="rvstat ${r.status}">${r.status === 'approved' ? 'Approved' : 'Changes requested'} by ${esc(r.reviewer_name || '')} on ${dmy(r.reviewed_at)}</span>
      ${r.comment ? `<p class="rvcomment">“${esc(r.comment)}”</p>` : ''}` : '<span class="rvstat open">Waiting for your review</span>';
  const act = ro ? `<p class="rvnote">${previewOnly() ? 'Client view preview: the client approves from their own login.' : 'Staff can look here; the client approves from their own login.'}</p>`
    : `<div class="rvact" data-rvunit="${i}">
        <button class="btn primary" data-rvdo="approved">Approve</button>
        <button class="btn" data-rvdo="changes">Request changes</button>
        <div class="rvask" hidden><textarea rows="3" placeholder="What would you like changed?"></textarea>
          <button class="btn primary" data-rvdo="send">Send to the team</button></div></div>`;
  return `<section class="rvunit" id="rvu${i}"><div class="rvhead"><div><span class="mlbl">${staff && u.campaign ? esc(u.campaign) : u.ads.length ? 'Ad group' : 'Keywords'}</span><h3>${esc(u.group)}</h3></div>${status}</div>
    ${kws}${ads || '<p class="rvnote">No ads in the plan for this group yet.</p>'}${act}</section>`;
}
function openReview(from){
  closeReview();
  const u = reviewUnits(), c = reviewCounts();
  const wrap = document.createElement('div'); wrap.className = 'rvwrap'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true');
  wrap.innerHTML = `<div class="rvbox"><div class="rvtop"><div><span class="mlbl">Preview</span><h2>Your keywords and ads</h2>
      <p class="sub">${c.approved} of ${c.total} approved</p></div><button class="btn" data-rvclose="1" aria-label="Close">Close</button></div>
    <nav class="rvnav">${u.map((x, i) => { const r = reviewFor(x.key);
      return `<a href="#rvu${i}" data-rvjump="${i}" class="${r ? r.status : ''}">${esc(x.group)}</a>`; }).join('')}</nav>
    <div class="rvbody">${u.map(rvUnitHtml).join('')}</div></div>`;
  document.body.appendChild(wrap); document.documentElement.classList.add('rvopen');
  /* Inside the hub the dashboard is an iframe sized to its content, so a fixed overlay would sit
     at the top of a very tall frame. Pin it beside the button instead and scroll to it. */
  if (EMBED && from) { wrap.classList.add('inline'); wrap.style.top = Math.max(0, from.getBoundingClientRect().top + scrollY - 40) + 'px'; wrap.scrollIntoView({ block: 'start' }); }
  wrap.querySelector('[data-rvclose]').focus();
}
function closeReview(){ $('.rvwrap')?.remove(); document.documentElement.classList.remove('rvopen'); }
async function sendReview(box, status){
  if (previewOnly() || isStaff()) return toast('The client approves from their own login.', 'bad');
  const u = reviewUnits()[Number(box.dataset.rvunit)], ta = box.querySelector('textarea');
  if (status === 'changes' && !ta.value.trim()) { ta.focus(); return toast('Say what you would like changed.', 'bad'); }
  box.querySelectorAll('button').forEach(b => b.disabled = true);
  const { data, error } = await sb.rpc('md_ad_review_submit', { p_slug: CFG.slug, p_group: u.key, p_status: status,
    p_comment: status === 'changes' ? ta.value : null, p_all_groups: reviewUnits().map(x => x.key) });
  if (error) { box.querySelectorAll('button').forEach(b => b.disabled = false); return toast('Not saved: ' + error.message, 'bad'); }
  const at = u.key; await loadReview(); renderAll();
  const i = reviewUnits().findIndex(x => x.key === at); openReview(); $('#rvu' + i)?.scrollIntoView({ block: 'start' });
  toast(data?.all_approved ? 'Everything is approved. Thank you, we will build it exactly like this.' : status === 'approved' ? 'Approved.' : 'Sent. The team will make the changes and come back to you.');
}
document.addEventListener('click', e => {
  const o = e.target.closest('[data-rvopen]'); if (o) return openReview(o);
  if (e.target.closest('[data-rvclose]') || e.target.classList.contains('rvwrap')) return closeReview();
  const j = e.target.closest('[data-rvjump]'); if (j) { e.preventDefault(); return $('#rvu' + j.dataset.rvjump)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  const d = e.target.closest('[data-rvdo]'); if (!d) return;
  const box = d.closest('.rvact');
  if (d.dataset.rvdo === 'changes') { const a = box.querySelector('.rvask'); a.hidden = false; return a.querySelector('textarea').focus(); }
  sendReview(box, d.dataset.rvdo === 'send' ? 'changes' : 'approved');
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeReview(); });
