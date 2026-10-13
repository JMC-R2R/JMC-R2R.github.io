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
const ORDER  = ['overview','seo','map_grid','gbp','geo','paid_ads','social','leads_crm'];
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
  /* ...and page in primary-key order. Unordered pages can repeat some rows and skip others:
     on 11/10/2026 Polarity's 1,455 map grid squares came back as 1,121 distinct ones and a
     whole scan vanished. */
  const PK = { md_rankings: 'checked_at,keyword,search_engine', md_paid_search_terms: 'month,campaign,ad_group,search_term,match_type',
    md_paid_keywords: 'month,campaign,ad_group,keyword,match_type', md_paid_segments: 'month,dimension,label',
    md_geo_share: 'checked_at,engine,brand', md_negative_requests: 'id', md_seo_queries: 'month,query',
    md_gbp_search_keywords: 'month,keyword', md_gbp_review_list: 'review_id', md_work_log: 'id' };
  const ordered = (b, cols) => (cols || '').split(',').filter(Boolean).reduce((x, c) => x.order(c), b);
  const qAll = async (t, dateCol) => { let out = [], i = 0;
    for (;;) { const { data, error } = await ordered(q(t, dateCol), PK[t]).range(i, i + 999);
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
    geo: viewGeo, paid_ads: viewPaid, negatives: viewNegatives, social: viewSocialManor, leads_crm: viewLeads,
  }[state.tab] || (() => emptyState('Unknown tab', 'Nothing to render.')))();
  document.documentElement.classList.toggle('theme-social', state.tab === 'social');
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
    lineChart(m, { series: spec.series, invert: !!spec.invert, area: spec.area !== false,
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
  if (on('paid_ads')){ const l = sum(V.paid,'leads'), pl = sum(V.paidPrev,'leads'), ps = sum(V.paidPrev,'spend'), ck = sum(V.paid,'clicks');
    cards.push(kpi('Ad spend', money(a.spend), chipFor(a.spend, ps)), kpi('Ad leads', fmt(l), chipFor(l, pl)),
      kpi('Cost per lead', l ? money2(a.spend / l) : '—', pl ? `${monthName(V.prevMonth)}: ${money2(ps / pl)}` : ''),
      kpi('Ad clicks', fmt(ck), chipFor(ck, sum(V.paidPrev,'clicks')))); }
  if (on('social')){ const sm = (m, k) => { const r = ((RAW.so || {}).monthly || []).filter(x => monthOf(x.period_date) === m); return r.length ? sum(r, k) : null; };
    cards.push(kpi('Followers', fmt(sm(state.month,'followers')), chipFor(sm(state.month,'followers'), sm(V.prevMonth,'followers'))),
      kpi('Social reach', fmt(sm(state.month,'reach')), chipFor(sm(state.month,'reach'), sm(V.prevMonth,'reach'))),
      kpi('Social engagement', fmt(sm(state.month,'engagement')), chipFor(sm(state.month,'engagement'), sm(V.prevMonth,'engagement')))); }
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
  if (on('paid_ads') || on('social')){
    const so = (RAW.so || {}).monthly || [], last6 = state.months.slice(-6);
    const sm = (m, k) => { const r = so.filter(x => monthOf(x.period_date) === m); return r.length ? sum(r, k) : null; };
    const pm = (m, k) => { const r = RAW.paid.filter(x => monthOf(x.date) === m); return r.length ? sum(r, k) : null; };
    const bn = [];
    if (state.month === monthOf(ymd(new Date())))
      bn.push(callout('warn', 'Month still running',
        `${monthName(state.month)} is not over yet, so its totals are compared with a full ${V.prevMonth ? monthName(V.prevMonth) : 'month'} and will read low until the month ends. Pick ${V.prevMonth ? monthName(V.prevMonth) : 'last month'} above for a full month.`));
    if (on('paid_ads')){
      const lc = V.pcm.filter(r => Number(r.conversions) > 0).sort((x, y) => x.cost / x.conversions - y.cost / y.conversions)[0];
      if (lc) bn.push(callout('good', 'Best performing ad campaign',
        `${lc.campaign} brought ${fmt(lc.conversions)} of the month's ${fmt(sum(V.paid,'leads'))} leads at ${money2(lc.cost / lc.conversions)} each.`));
    }
    if (on('social')){ const r = sm(state.month,'reach'), pr = sm(V.prevMonth,'reach'), e = sm(state.month,'engagement');
      if (r != null) bn.push(callout('good', 'Social this month',
        `Instagram and Facebook posts reached ${fmt(r)} accounts and earned ${fmt(e)} engagements${pr ? `, against ${fmt(pr)} accounts reached in ${monthName(V.prevMonth)}` : ''}. The Social tab breaks this down by post, format and time of day.`));
    }
    out += bn.join('');
    const mc = (label, cur, prev, vals, f) => `<div class="momcard"><span class="mlbl">${label}</span>
      <div class="v tnum">${f(cur)} ${chipFor(cur, prev)}</div>
      <div class="cap">vs ${V.prevMonth ? monthName(V.prevMonth) : 'no prior month'}</div>
      ${sparkline(vals, 'var(--accent)')}</div>`;
    const mom = [];
    if (on('paid_ads')) mom.push(
      mc('Ad leads', pm(state.month,'leads'), pm(V.prevMonth,'leads'), last6.map(m => pm(m,'leads')), v => fmt(v)),
      mc('Ad spend', pm(state.month,'spend'), pm(V.prevMonth,'spend'), last6.map(m => pm(m,'spend')), v => money(v)));
    if (on('social')) mom.push(
      mc('Social reach', sm(state.month,'reach'), sm(V.prevMonth,'reach'), last6.map(m => sm(m,'reach')), v => fmt(v)),
      mc('Engagement', sm(state.month,'engagement'), sm(V.prevMonth,'engagement'), last6.map(m => sm(m,'engagement')), v => fmt(v)),
      mc('Followers', sm(state.month,'followers'), sm(V.prevMonth,'followers'), last6.map(m => sm(m,'followers')), v => fmt(v)));
    if (mom.length) out += `<p class="eyebrow" style="margin-top:26px">Month on month</p><div class="momgrid">${mom.join('')}</div>`;
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
  /* Month on month: last month's final check. Compare rates, not raw counts, because the
     question set can grow between months. */
  const pm = V.geoPrevAsOf ? monthName(monthOf(V.geoPrevAsOf)).split(' ')[0] : null;
  const rate = named / snap.length * 100, prevRate = V.geoPrevSnap.length ? prevNamed / V.geoPrevSnap.length * 100 : null;
  const pTot = sum(V.gsharePrev,'mentions'), pMine = sum(V.gsharePrev.filter(r => r.is_client),'mentions');
  const prevSov = pTot ? pMine / pTot * 100 : null;

  out += `<p class="lede">On ${asOf(V.geoAsOf)} we asked ${engines.length} AI assistant${engines.length === 1 ? '' : 's'} (${engines.join(', ')})
    ${fmt(new Set(snap.map(r => r.prompt)).size)} questions a homeowner might ask. ${CFG.name} was named in ${fmt(named)} of ${fmt(snap.length)} answers${V.geoPrevAsOf
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
  let out = head('Paid Ads', 'Meta Ads: every dollar, accounted for',
    'Exactly what was spent on Facebook and Instagram ads and what it bought. Every figure comes straight from the Meta ad account; nothing here is estimated.');
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
    ${kpi('Click to lead rate', pct1(cvr))}</div>`;

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
        ], rows, { sort:{ k:'cost', dir:-1 }, filter:false, maxH:400 })}</div>`;
  }

  /* Leads by type */
  if (V.pconv.length){
    const by = {}; V.pconv.forEach(r => { const k = r.action; by[k] ??= { action:k, category:r.category, conversions:0, campaigns:new Set() };
      by[k].conversions += Number(r.conversions || 0); by[k].campaigns.add(r.campaign); });
    const rows = Object.values(by).filter(r => r.conversions > 0).map(r => ({ ...r, campaigns:[...r.campaigns].join(', ') }));
    if (rows.length) out += `<div class="card"><div class="cardhead"><div><h3>What counted as a lead</h3>
      <p class="sub">Each lead by the action Meta recorded. A call click is a tap on the call button; Meta does not confirm the call itself</p></div></div>
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
      <p class="sub">The suburb Meta placed each person in. Smaller suburbs are grouped as “All other locations”.</p></div></div>
      ${dataTable('locations', [{ k:'label', label:'Location' }, { k:'impressions', label:'Shown', num:1, fmt:v => fmt(v) },
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

function viewSocialBasic(){
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
  const logoSrc = CFG.logo && (CFG.logo.includes('/') ? CFG.logo : '../../assets/' + CFG.logo);
  document.body.innerHTML = `
  <header class="top"><div class="wrap topin">
    ${logoSrc ? `<span class="${CFG.logoChip ? 'logochip' : ''}"><img class="logo" src="${logoSrc}" alt="${CFG.name}"></span>` : ''}
    <span class="name">${CFG.name}</span>
    <span class="spacer"></span>
    <span class="stamp" id="stamp"></span>
    <button class="btn" id="signout">Sign out</button>
  </div></header>
  <div class="team"><div class="wrap teamin">
    <span class="mlbl">Delivered by</span>${CFG.r2rLogo
      ? `<img class="r2rlogo" src="${CFG.r2rLogo}" alt="Ready to Rank">`
      : '<span style="font-weight:700;font-size:13px">Ready to Rank</span>'}
    ${CFG.partner ? `<span class="mlbl">with</span>${CFG.partner.wordmark ? `<img class="partnerlogo" src="${CFG.partner.wordmark}" alt="${CFG.partner.name}">` : CFG.partner.name}` : ''}<span class="spacer"></span><span class="mlbl" id="monthlabel"></span>
  </div></div>
  <nav class="tabs"><div class="wrap navrow"><div class="tabsin" id="tabs" role="tablist"></div>
    ${logoSrc ? `<span class="navlogo${CFG.logoChip ? ' logochip' : ''}"><img class="logo" src="${logoSrc}" alt="${CFG.name}"></span>` : ''}</div></nav>
  <div class="monthbar"><div class="wrap monthin" id="monthchips"></div></div>
  ${CFG.preview ? `<div class="wrap"><div class="previewbar"><b>Preview.</b> Every figure on this page is made up. It shows how Buff &amp; Brew's dashboard will look and work once it is live. None of these are Buff &amp; Brew's real figures, and nothing can be saved.</div></div>` : ''}<main><div class="wrap" id="panel"></div></main>
  <footer class="foot"><div class="wrap footin">
    <span>${CFG.name} · prepared by Ready to Rank</span>
    <span>Sources: ${[enabled('seo') && 'SE Ranking · Google Search Console · GA4', enabled('gbp') && 'Google Business Profile',
      enabled('paid_ads') && 'Meta Ads', enabled('social') && 'Instagram and Facebook via Windsor.ai', (enabled('map_grid') || enabled('geo')) && 'DataForSEO'].filter(Boolean).join(' · ')}</span>
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
  const card = (inner) => { document.body.innerHTML = `<div class="bb-login"><form class="bb-loginbox" id="gf">
    <div class="bb-lockup"><img class="cl" src="${CFG.logo}" alt="${CFG.name}"><span class="rule"></span><img class="r2r" src="${CFG.r2rLogo}" alt="Ready to Rank"></div>
    <h1>${CFG.name} Marketing Dashboard</h1>${inner}<div class="gate-err">${msg || ''}</div></form></div>`; msg = ''; };
  const err = t => $('.gate-err').textContent = t;

  const askEmail = () => {
    card(`<p>This is a private dashboard. Enter your email and we’ll send you a sign-in code.</p>
      <label for="email">Email</label>
      <input type="email" id="email" autocomplete="username" required>
      <button type="submit">Email me a code</button>`);
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

/* ---------------------------------------------------------------- social
   Manor on High's Social view (manor-roi), rebuilt inside the Marketing Dashboard with Manor's
   own layout and styles (social.css). Same sections in the same order, and the same rules:
   - followers are a standing total, so change is shown in whole followers, never a percentage
   - engagement rate, saves and shares are measured on the posts PUBLISHED that month
   - a posting slot with fewer than three posts is greyed out, never guessed
   - competitors' reach and engagement are private, so only public figures are compared
   The tab wears Savvas colours (Savvas runs social), like Manor's. Reads RAW.so and follows
   the month chips like every other tab. */
const SO_MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const soMon = d => SO_MON[+String(d).slice(5,7) - 1] + ' ' + String(d).slice(0,4);
const soAU = d => new Date(String(d).slice(0,10) + 'T00:00:00').toLocaleDateString('en-AU', { day:'2-digit', month:'2-digit', year:'numeric' });
const soOrd = n => { const s = ['th','st','nd','rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const soEnd = p => { const d = new Date(+p.slice(0,4), +p.slice(5,7), 0); return ymd(d); };
const soPct = v => v == null ? '—' : (v * 100).toFixed(1) + '%';
const soAvg = a => a.length ? a.reduce((t, v) => t + v, 0) / a.length : null;
const soMedian = a => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m-1] + b[m]) / 2; };
const SO_MEL = new Intl.DateTimeFormat('en-AU', { timeZone:'Australia/Melbourne', weekday:'short', hour:'numeric', hourCycle:'h23' });
const soSlot = iso => { const p = SO_MEL.formatToParts(new Date(iso)), g = t => (p.find(x => x.type === t) || {}).value; return { day: g('weekday'), hour: +g('hour') }; };
const soSafeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : '#'; } catch (e) { return '#'; } };
const soSec = t => `<div class="so-sec">${t}</div>`;
/* Manor's delta pill: ▲ 12% vs prev month. Followers use whole numbers instead (see above). */
const soDelta = (cur, prev) => { if (prev == null || prev === 0 || cur == null) return '';
  const p = (cur - prev) / Math.abs(prev) * 100, f = Math.abs(p) < 0.5;
  return `<div class="so-delta ${f ? 'flat' : p > 0 ? 'up' : 'down'}">${f ? '→' : p > 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}% vs prev month</div>`; };
const soHero = (lbl, big, small, delta = '', accent = false, edit = '') =>
  `<div class="so-card so-hero${accent ? ' accent' : ''}">${edit}<span class="so-lbl">${lbl}</span><div class="so-big">${big}</div><div class="so-small">${small}</div>${delta}</div>`;

function soGroup(rows){
  const blank = () => ({ followers:0, reach:0, engagement:0 });
  const by = {};
  rows.forEach(r => {
    const k = r.period_date;
    by[k] ??= { periodDate:k, month:r.period_label, ig:blank(), fb:blank() };
    by[k][r.platform === 'facebook' ? 'fb' : 'ig'] = { followers:+r.followers || 0, reach:+r.reach || 0, engagement:+r.engagement || 0 };
  });
  return Object.values(by).sort((a, b) => a.periodDate < b.periodDate ? -1 : 1).map(m => {
    m.t = { followers: m.ig.followers + m.fb.followers, reach: m.ig.reach + m.fb.reach, engagement: m.ig.engagement + m.fb.engagement };
    return m; });
}
function soStats(ps){
  const reels = ps.filter(p => p.format === 'REEL'), reach = sum(ps,'reach'), eng = sum(ps,'engagement');
  return { n: ps.length, reach, eng, er: reach ? eng / reach : null, saves: sum(ps,'saves'), shares: sum(ps,'shares'),
    visits: ps.some(p => p.profile_visits != null) ? sum(ps,'profile_visits') : null,
    watch: soAvg(reels.filter(r => r.reel_avg_watch_ms != null).map(r => r.reel_avg_watch_ms / 1000)),
    hold: soAvg(reels.filter(r => r.reel_skip_rate != null).map(r => 1 - +r.reel_skip_rate)) };
}

/* Partner credit: Savvas runs social on these accounts, so the tab says so. */
function soBanner(){
  const p = CFG.partner; if (!p) return '';
  return `<div class="so-banner">${p.mark ? `<img class="m" src="${esc(p.mark)}" alt="">` : ''}<div>
    <div class="t">Social managed by ${p.wordmark ? `<img src="${esc(p.wordmark)}" alt="${esc(p.name)}">` : esc(p.name)}</div>
    <div class="s">${esc(p.blurb || '')} ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}&nbsp;↗</a>` : ''}</div></div></div>`;
}

function viewSocialManor(){
  const SO = RAW.so || {}, name = esc(CFG.name);
  let out = `<div class="so" style="--client:${esc(CFG.accent || '#17B4F0')}">` + soBanner();
  let groups = soGroup(SO.monthly || []);
  const P = state.month + '-01', i = groups.findIndex(g => g.periodDate === P);
  if (i < 0) return out + emptyState(`Social wasn’t tracked in ${monthName(state.month)}`,
    'Instagram and Facebook reporting starts from the month the accounts were connected. Earlier months hold no social data, which is not the same as zero reach.') + '</div>';
  groups = groups.slice(0, i + 1);
  const last = groups[groups.length - 1], prev = groups.length > 1 ? groups[groups.length - 2] : null;
  const partial = state.month === monthOf(ymd(new Date()));

  /* Website clicks: summed from the daily rows. DMs: entered by the team each month. */
  const clicksFor = mk => { let ig = 0, fb = 0; (SO.daily || []).forEach(r => { if (monthOf(r.metric_date) !== mk) return;
    if (r.platform === 'facebook') fb += +r.website_clicks || 0; else ig += +r.website_clicks || 0; }); return { ig, fb, t: ig + fb }; };
  const dmsFor = mk => { const r = (SO.meta || []).find(x => monthOf(x.period_date) === mk); return r && r.dms != null ? +r.dms : null; };
  const clk = clicksFor(state.month), clkP = prev ? clicksFor(monthOf(prev.periodDate)) : null;
  const dms = dmsFor(state.month), dmsP = prev ? dmsFor(monthOf(prev.periodDate)) : null;
  const split = (ig, fb) => `IG ${fmt(ig)} · FB ${fmt(fb)}`;

  /* Summary: current standing, this month's figures, and month on month only between two
     complete months, so a part month is never compared against a full one. */
  const done = groups.filter(g => monthOf(g.periodDate) !== monthOf(ymd(new Date())));
  let s = `Across Instagram and Facebook, ${name} has <b>${fmt(last.t.followers)} combined followers</b> (${split(last.ig.followers, last.fb.followers)}).`;
  s += partial ? ` So far in ${last.month}, content has reached <b>${fmt(last.t.reach)}</b> accounts and driven <b>${fmt(last.t.engagement)}</b> engagements (month still in progress).`
               : ` In ${last.month}, content reached <b>${fmt(last.t.reach)}</b> accounts and drove <b>${fmt(last.t.engagement)}</b> engagements.`;
  if (done.length >= 2){ const a = done[done.length - 2], b = done[done.length - 1], ch = (x, y) => x ? Math.round((y - x) / x * 100) : 0, w = p => p >= 0 ? `up ${p}%` : `down ${Math.abs(p)}%`;
    s += ` Month on month (${a.month} → ${b.month}), reach is <b>${w(ch(a.t.reach, b.t.reach))}</b> and engagement <b>${w(ch(a.t.engagement, b.t.engagement))}</b>.`; }
  out += soSec('Summary') + `<div class="so-card so-summary">${s}</div>`;

  /* Followers: the net change in whole followers, with the split by platform underneath */
  let fDelta = '';
  if (prev && prev.ig.followers && last.ig.followers){
    const d = last.t.followers - prev.t.followers, dIg = last.ig.followers - prev.ig.followers, dFb = last.fb.followers - prev.fb.followers;
    fDelta = `<div class="so-delta ${d > 0 ? 'up' : d < 0 ? 'down' : 'flat'}">${d > 0 ? '▲' : d < 0 ? '▼' : '→'} ${d > 0 ? '+' : ''}${fmt(d)} vs prev month</div>
      <div class="so-small" style="margin-top:6px">IG ${dIg >= 0 ? '+' : ''}${fmt(dIg)} · FB ${dFb >= 0 ? '+' : ''}${fmt(dFb)}</div>`;
  }
  out += soSec('Organic performance · this month') + `<div class="so-grid so-g3">
    ${soHero('Organic engagement', fmt(last.t.engagement), split(last.ig.engagement, last.fb.engagement), prev ? soDelta(last.t.engagement, prev.t.engagement) : '', true)}
    ${soHero('DMs', dms != null ? fmt(dms) : '—', dms != null ? 'this month' : 'add via ✎ Edit', dms != null && dmsP != null ? soDelta(dms, dmsP) : '', false, '<button class="so-edit" id="so-dms-edit" type="button" ' + (state.role === 'admin' ? 'title="Enter this month’s DM count"' : 'disabled title="Ready to Rank enters DMs each month"') + '>✎ Edit</button>')}
    ${soHero('Followers', fmt(last.t.followers), split(last.ig.followers, last.fb.followers), fDelta)}</div>`;

  out += soMoM(groups, SO.posts || [], partial);
  out += soDaily(SO.daily || []);
  out += soFormats(SO.posts || []);
  out += soBestTimes(SO.posts || [], name);
  out += soAudience(SO.aud || [], name);
  out += soCompetitors(SO.comp || [], SO.comps || [], name);
  out += soTopPosts(SO.top || []);
  out += soInsights();
  return out + '</div>';
}

function soMoM(groups, posts, partial){
  const ms = groups.slice(-6);
  const cols = ms.map((g, i) => { const prev = i > 0 ? ms[i - 1] : null;
    return { g, st: soStats(posts.filter(p => p.period_date === g.periodDate)), followers: g.t.followers,
      net: prev ? g.t.followers - prev.t.followers : null }; });
  const nf = n => n == null ? '—' : fmt(Math.round(n));
  const rows = [
    ['Followers (IG + FB)', c => c.followers, nf, 'abs'],
    ['Net new followers', c => c.net, n => n == null ? '—' : (n > 0 ? '+' : '') + nf(n), 'abs'],
    ['Instagram posts published', c => c.st.n, nf, 'pct'],
    ['Reach (IG + FB)', c => c.g.t.reach, nf, 'pct'],
    ['Engagement (IG + FB)', c => c.g.t.engagement, nf, 'pct'],
    ['Engagement rate · IG posts', c => c.st.er, soPct, 'pts'],
    ['Saves · IG posts', c => c.st.saves, nf, 'pct'],
    ['Shares · IG posts', c => c.st.shares, nf, 'pct'],
    ['Profile visits from posts', c => c.st.visits, nf, 'pct'],
    ['Reel avg watch time', c => c.st.watch, v => v == null ? '—' : v.toFixed(1) + 's', 'pct'],
    ['Reel hold rate (past 3s)', c => c.st.hold, v => v == null ? '—' : Math.round(v * 100) + '%', 'pts']];
  const L = cols.length - 1, last = cols[L], prev = cols[L - 1];
  const chg = (a, b, kind) => {
    if (a == null || b == null || !prev || partial) return '<span class="flat">—</span>';
    let d, t;
    if (kind === 'pts'){ d = (a - b) * 100; t = Math.abs(d) < 0.05 ? 'no change' : (d > 0 ? '+' : '') + d.toFixed(1) + ' pts'; }
    else if (kind === 'abs'){ d = a - b; t = (d >= 0 ? '+' : '') + fmt(Math.round(d)); }
    else { if (!b) return '<span class="flat">—</span>'; d = (a - b) / Math.abs(b) * 100; t = (d >= 0 ? '▲ ' : '▼ ') + Math.abs(d).toFixed(0) + '%'; }
    return `<span class="${Math.abs(d) < 0.05 ? 'flat' : d > 0 ? 'up' : 'down'}">${t}</span>`; };
  return soSec('Month on month · is the account growing?') + `<div class="so-card"><div class="so-tblwrap"><table class="so-kw">
    <thead><tr><th>Metric</th>${cols.map((c, i) => `<th class="num${i === L ? ' cur' : ''}">${esc(c.g.month)}${i === L && partial ? ' *' : ''}</th>`).join('')}<th class="num">vs ${prev ? esc(prev.g.month.split(' ')[0]) : 'prev'}</th></tr></thead>
    <tbody>${rows.map(([lbl, get, f, kind]) => `<tr><td>${lbl}</td>${cols.map((c, i) => `<td class="num${i === L ? ' cur' : ''}">${f(get(c))}</td>`).join('')}<td class="num chg">${chg(get(last), prev ? get(prev) : null, kind)}</td></tr>`).join('')}</tbody></table></div>
    <p class="so-note">${partial ? '<b>* Month still running</b> — no change is shown against a full month. ' : ''}Engagement rate = engagement ÷ reach on that month’s Instagram posts, so a month with fewer posts doesn’t read as a fall. Saves and shares are counted on the posts published that month. Hold rate is the share of Reel plays that didn’t skip in the first three seconds.</p></div>`;
}

function soDaily(daily){
  const end = soEnd(state.month + '-01');
  const rows = daily.filter(r => r.platform === 'instagram' && r.metric_date <= end).sort((a, b) => a.metric_date < b.metric_date ? -1 : 1);
  return soSec('Reach &amp; Views over time — Instagram') + `<div class="so-card">
    <div class="so-legend"><span><i style="background:var(--accent)"></i>Views</span><span><i style="background:var(--good)"></i>Reach</span></div>
    ${rows.length ? soDailySvg(rows) : '<div class="so-empty">No daily data yet.</div>'}</div>`;
}

function soFormats(posts){
  const endP = state.month + '-01';
  const start = (() => { const d = new Date(+endP.slice(0,4), +endP.slice(5,7) - 3, 1); return ymd(d); })();
  const win = posts.filter(p => p.period_date >= start && p.period_date <= endP);
  const NAME = { REEL:'Reels', CAROUSEL:'Carousels', IMAGE:'Single images', VIDEO:'Videos' };
  const rows = Object.keys(NAME).map(f => ({ f, st: soStats(win.filter(p => p.format === f)) })).filter(r => r.st.n);
  const ok = rows.filter(r => r.st.n >= 3);
  const best = ok.length ? ok.reduce((a, b) => (b.st.er || 0) > (a.st.er || 0) ? b : a) : null;
  const byReach = rows.slice().sort((a, b) => b.st.reach / b.st.n - a.st.reach / a.st.n)[0];
  const table = rows.length ? `<div class="so-tblwrap"><table class="so-kw"><thead><tr><th>Format</th><th class="num">Posts</th><th class="num">Avg reach</th><th class="num">Eng. rate</th><th class="num">Saves / post</th><th class="num">Shares / post</th><th class="num">Profile visits / post</th></tr></thead><tbody>
    ${rows.map(r => `<tr class="${best && r.f === best.f ? 'best' : ''}"><td>${NAME[r.f]}${best && r.f === best.f ? '<span class="so-badge">best</span>' : ''}</td>
      <td class="num">${r.st.n}</td><td class="num">${fmt(r.st.reach / r.st.n)}</td><td class="num">${soPct(r.st.er)}</td>
      <td class="num">${(r.st.saves / r.st.n).toFixed(1)}</td><td class="num">${(r.st.shares / r.st.n).toFixed(1)}</td><td class="num">${r.st.visits == null ? '<span class="muted">—</span>' : (r.st.visits / r.st.n).toFixed(1)}</td></tr>`).join('')}</tbody></table></div>
    <p class="so-note">${soMon(start)} – ${soMon(endP)} (three months, so each format has enough posts to compare). ${best ? `<b>${NAME[best.f]}</b> earn the highest engagement rate (${soPct(best.st.er)})` : ''}${byReach && best && byReach.f !== best.f ? `, while <b>${NAME[byReach.f]}</b> reach the most people per post (${fmt(byReach.st.reach / byReach.st.n)})` : ''}. Saves and shares are the strongest planning signals — people keeping a post to come back to, or sending it to someone.</p>`
    : '<div class="so-empty">No Instagram posts in these months yet.</div>';

  /* Reels: the selected month against the months before it */
  const months = [...new Set(posts.map(p => p.period_date))].filter(m => m <= endP).sort().slice(-6);
  const per = months.map(m => ({ m, st: soStats(posts.filter(p => p.period_date === m && p.format === 'REEL')) }));
  const cur = per[per.length - 1] || { st:{} }, maxW = Math.max(1, ...per.map(x => x.st.watch || 0));
  const reel = `<span class="so-lbl">Reels · watch-through</span>
    <div class="so-reel"><div><div class="so-big">${cur.st.watch != null ? cur.st.watch.toFixed(1) + 's' : '—'}</div><div class="so-small">avg watch time per play · ${esc(soMon(cur.m || endP))}</div></div>
      <div><div class="so-big">${cur.st.hold != null ? Math.round(cur.st.hold * 100) + '%' : '—'}</div><div class="so-small">hold rate — didn’t skip in the first 3s</div></div></div>
    <div class="so-rbars">${per.map(x => `<div><div title="${x.st.watch != null ? x.st.watch.toFixed(1) + 's' : 'no Reels'}" style="height:${x.st.watch ? Math.max(4, x.st.watch / maxW * 56) : 2}px;background:${x.m === cur.m ? 'var(--accent)' : 'rgba(255,255,255,.18)'};border-radius:4px 4px 0 0"></div>${SO_MON[+x.m.slice(5,7) - 1]}</div>`).join('')}</div>
    <p class="so-note">${per.filter(x => x.st.n).length} months · ${cur.st.n || 0} Reels in ${esc(soMon(cur.m || endP))}. Instagram doesn’t report Reel length, so watch-through is shown as watch time and hold rate rather than a percentage watched.</p>`;
  return soSec('What content works · Instagram by format') + `<div class="so-g2x"><div class="so-card">${table}</div><div class="so-card">${reel}</div></div>`;
}

function soBestTimes(posts, name){
  const endP = soEnd(state.month + '-01');
  const ps = posts.filter(p => p.reach > 0 && String(p.posted_at).slice(0,10) <= endP).sort((a, b) => String(a.posted_at) < String(b.posted_at) ? -1 : 1);
  let body;
  if (ps.length < 20) body = '<div class="so-empty">Not enough posts yet to read posting times reliably.</div>';
  else {
    const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const BANDS = [['Morning','6–11am',6,11],['Midday','11am–2pm',11,14],['Afternoon','2–5pm',14,17],['Evening','5–9pm',17,21],['Late','9pm–6am',21,30]];
    const bandOf = h => { const hh = h < 6 ? h + 24 : h; return BANDS.findIndex(b => hh >= b[2] && hh < b[3]); };
    const cell = {}, used = {};
    ps.forEach(p => { const s = soSlot(p.posted_at), d = DAYS.indexOf(s.day), b = bandOf(s.hour); if (d < 0 || b < 0) return;
      const k = d + ':' + b; (cell[k] ??= []).push(p.engagement / p.reach); used[k] = (used[k] || 0) + 1; });
    const med = {}; Object.keys(cell).forEach(k => med[k] = soMedian(cell[k]));
    const solid = Object.keys(med).filter(k => cell[k].length >= 3);
    const vals = solid.map(k => med[k]), lo = Math.min(...vals), hi = Math.max(...vals);
    const top = solid.slice().sort((a, b) => med[b] - med[a]).slice(0, 3);
    const colour = v => `rgba(63,208,127,${(0.18 + (hi > lo ? (v - lo) / (hi - lo) : .5) * 0.82).toFixed(2)})`;
    let h = `<div class="so-heat"><div></div>${DAYS.map(d => `<div class="hh">${d}</div>`).join('')}`;
    BANDS.forEach((b, bi) => { h += `<div class="hl">${b[0]}<br>${b[1]}</div>`;
      DAYS.forEach((d, di) => { const k = di + ':' + bi, n = (cell[k] || []).length;
        h += n >= 3 ? `<div class="hc${top.includes(k) ? ' top' : ''}" style="background:${colour(med[k])}" title="${n} posts · median engagement rate ${(med[k] * 100).toFixed(1)}%"><b>${(med[k] * 100).toFixed(1)}%</b><small>${n} posts</small></div>`
                    : `<div class="hc few" title="${n} post${n === 1 ? '' : 's'} — too few to judge">${n ? `<small>${n} post${n === 1 ? '' : 's'}</small>` : ''}</div>`; }); });
    const label = k => { const [d, b] = k.split(':').map(Number); return `${DAYS[d]} ${BANDS[b][0].toLowerCase()} (${BANDS[b][1]})`; };
    const busiest = Object.keys(used).sort((a, b) => used[b] - used[a])[0];
    body = `<div class="so-tblwrap">${h}</div></div>
      <p class="so-note"><b>Best slots: ${top.map(label).join(' · ')}.</b> Based on ${ps.length} Instagram posts since ${soAU(ps[0].posted_at)}, Melbourne time. Each cell is the median engagement rate (engagement ÷ reach) of posts published in that slot, so one viral post can’t skew it; cells with fewer than three posts are greyed out rather than guessed. ${busiest ? `Most posts currently go out on ${label(busiest)} (${used[busiest]} posts)${top.includes(busiest) ? ', which is already one of the strongest slots.' : ' — worth testing the stronger slots above.'}` : ''}</p>`;
  }
  return soSec(`Best times to post · when ${name}’s posts earn the most engagement`) + `<div class="so-card">${body}</div>`;
}

function soAudience(aud, name){
  const sec = soSec(`Who follows ${name} · Instagram audience`);
  const dates = [...new Set(aud.map(a => a.snapshot_date))].sort();
  if (!dates.length) return sec + '<div class="so-card"><div class="so-empty">No audience data yet.</div></div>';
  const endP = soEnd(state.month + '-01');
  const S = dates.filter(d => d <= endP).pop() || dates[dates.length - 1];
  const of = dim => aud.filter(a => a.snapshot_date === S && a.dimension === dim).sort((a, b) => b.followers - a.followers);
  const bars = (rows, label) => { const max = Math.max(1, ...rows.map(r => r.followers));
    return `<div class="so-bench">${rows.map((r, i) => `<div class="brow ${i === 0 ? 'me' : ''}"><span class="bname" title="${esc(label(r.name))}">${esc(label(r.name))}</span><div class="btrack"><div class="bfill" style="width:${Math.max(2, Math.round(r.followers / max * 100))}%"></div></div><span class="bval">${fmt(r.followers)}</span></div>`).join('')}</div>`; };
  let rn; try { rn = new Intl.DisplayNames(['en-AU'], { type:'region' }); } catch (e) { rn = null; }
  const city = of('city'), ctry = of('country');
  const ga = of('gender_age'), ages = [...new Set(ga.map(r => r.name.split('.')[1]))].sort();
  const by = (g, a) => (ga.find(r => r.name === g + '.' + a) || {}).followers || 0;
  const mx = Math.max(1, ...ages.map(a => by('F', a) + by('M', a) + by('U', a)));
  const age = ages.map(a => { const f = by('F', a), m = by('M', a), u = by('U', a), t = f + m + u;
    return `<div class="so-age"><span>${a}</span><div class="stack" style="width:${Math.max(6, t / mx * 100)}%"><span style="width:${f / t * 100}%;background:var(--client)"></span><span style="width:${m / t * 100}%;background:var(--accent)"></span><span style="width:${u / t * 100}%;background:rgba(255,255,255,.25)"></span></div><span style="text-align:right">${fmt(t)}</span></div>`; }).join('')
    + `<div class="so-key"><span><i style="background:var(--client)"></i>Women</span><span><i style="background:var(--accent)"></i>Men</span><span><i style="background:rgba(255,255,255,.25)"></i>Not stated</span></div>`;
  const home = ctry[0], totC = ctry.reduce((t, c) => t + c.followers, 0);
  const topAge = ga.slice().sort((a, b) => b.followers - a.followers)[0];
  const gName = { F:'Women', M:'Men', U:'People' };
  return sec + `<div class="so-grid so-g3">
      <div class="so-card"><span class="so-lbl">Top cities</span>${bars(city.slice(0, 8), n => n.replace(/, (Victoria|New South Wales|Queensland)$/, m => m === ', Victoria' ? ', VIC' : m === ', New South Wales' ? ', NSW' : ', QLD'))}</div>
      <div class="so-card"><span class="so-lbl">Countries</span>${bars(ctry.slice(0, 8), c => (rn && rn.of(c)) || c)}</div>
      <div class="so-card"><span class="so-lbl">Age &amp; gender</span><div style="margin-top:12px">${age}</div></div></div>
    <p class="so-note">Instagram followers as at ${soAU(S)}. ${home ? `<b>${totC ? Math.round(home.followers / totC * 100) : 0}% are in ${esc((rn && rn.of(home.name)) || home.name)}</b>${city[0] ? `, with ${fmt(city[0].followers)} in ${esc(city[0].name.split(',')[0])}` : ''}. ` : ''}${topAge ? `${gName[topAge.name.split('.')[0]] || 'People'} aged ${topAge.name.split('.')[1]} are the biggest single group (${fmt(topAge.followers)}). ` : ''}Instagram reports these as running totals, so change over time appears as each new snapshot is added.</p>`;
}

function soCompetitors(snaps, comps, name){
  const sec = soSec(`Competitor social presence · how ${name} stacks up`);
  const nameOf = {}, colourOf = {};
  comps.forEach(c => { nameOf[c.domain] = c.label; colourOf[c.domain] = c.colour; });
  const all = [...new Set(snaps.map(r => r.snapshot_date))].sort();
  if (!all.length) return sec + '<div class="so-card"><div class="so-empty">No competitor snapshot yet.</div></div>';
  const me = (comps.find(c => c.is_client) || {}).domain;
  const inScope = all.filter(d => d <= soEnd(state.month + '-01'));
  const S = inScope.length ? inScope[inScope.length - 1] : all[all.length - 1], after = !inScope.length;
  const dates = all.filter(d => d <= S), base = dates[0];
  const prevM = dates.filter(d => d.slice(0,7) < S.slice(0,7)).pop() || null;
  const at = (d, dom, pl) => snaps.find(r => r.snapshot_date === d && r.domain === dom && r.platform === pl) || {};
  const doms = [...new Set(snaps.filter(r => r.snapshot_date === S).map(r => r.domain))];
  const span = Math.round((new Date(S) - new Date(base)) / 864e5);
  const dlt = (x, y) => x != null && y != null ? x - y : null;
  const rows = doms.map(d => { const ig = at(S, d, 'instagram'), fb = at(S, d, 'facebook'), b0 = at(base, d, 'instagram'), f0 = at(base, d, 'facebook');
    const pi = prevM ? at(prevM, d, 'instagram') : {}, pf = prevM ? at(prevM, d, 'facebook') : {};
    return { d, me: d === me, name: nameOf[d] || d, igH: ig.handle, igF: ig.followers ?? null, igP: ig.posts ?? null, fbF: fb.followers ?? null, fbT: fb.talking_about ?? null,
      igGrow: base !== S ? dlt(ig.followers, b0.followers) : null, igGrowPct: base !== S && b0.followers ? (ig.followers - b0.followers) / b0.followers : null,
      fbGrow: base !== S ? dlt(fb.followers, f0.followers) : null, postsSince: base !== S ? dlt(ig.posts, b0.posts) : null,
      pace: span >= 14 && ig.posts != null && b0.posts != null ? (ig.posts - b0.posts) / span * 7 : null,
      igMoM: prevM ? dlt(ig.followers, pi.followers) : null, fbMoM: prevM ? dlt(fb.followers, pf.followers) : null, postsMoM: prevM ? dlt(ig.posts, pi.posts) : null }; });
  const mine = rows.find(r => r.me) || {};
  const rankBy = k => { const v = rows.filter(r => r[k] != null).sort((a, b) => b[k] - a[k]); const i = v.findIndex(r => r.me); return { rank: i < 0 ? null : i + 1, of: v.length, top: v[0] }; };
  const rIg = rankBy('igF'), rFb = rankBy('fbF'), rP = rankBy('igP'), rG = rankBy('igGrow');
  const rk = r => r.rank ? `${soOrd(r.rank)}<span class="unit">of ${r.of}</span>` : '—';
  const lead = (r, k) => r.top && !r.top.me ? `leader: ${esc(r.top.name)} (${fmt(r.top[k])})` : 'leading the set';
  const totIg = rows.reduce((t, r) => t + (r.igF || 0), 0);
  let out = sec + `<div class="so-grid so-g4">
    ${soHero('Instagram audience', rk(rIg), `${fmt(mine.igF)} followers · ${lead(rIg, 'igF')}`, '', true)}
    ${soHero('Facebook audience', rk(rFb), `${fmt(mine.fbF)} followers · ${lead(rFb, 'fbF')}`)}
    ${soHero('Share of Instagram audience', totIg ? (mine.igF / totIg * 100).toFixed(1) + '%' : '—', `of ${fmt(totIg)} followers across all ${rows.length} accounts`)}
    ${rG.rank ? soHero('Instagram growth', rk(rG), `${mine.igGrow >= 0 ? '+' : ''}${fmt(mine.igGrow)} since ${soAU(base)} · fastest: ${esc(rG.top.name)} (${rG.top.igGrow >= 0 ? '+' : ''}${fmt(rG.top.igGrow)})`)
              : soHero('Instagram posts published', rk(rP), `${fmt(mine.igP)} all-time · ${lead(rP, 'igP')}`)}</div>`;
  const bars = k => { const v = rows.slice().sort((a, b) => (b[k] ?? -1) - (a[k] ?? -1)), max = Math.max(1, ...v.map(r => +r[k] || 0));
    return `<div class="so-bench">${v.map(r => `<div class="brow ${r.me ? 'me' : ''}"><span class="bname">${esc(r.name)}</span>`
      + (r[k] == null ? '<div class="btrack"></div><span class="bval">not public</span>'
        : `<div class="btrack"><div class="bfill" style="width:${Math.max(2, Math.round(r[k] / max * 100))}%${r.me ? '' : ';background:' + (colourOf[r.d] || '#8C8C99')}"></div></div><span class="bval">${fmt(r[k])}</span>`) + '</div>').join('')}</div>`; };
  out += `<div class="so-grid so-g2" style="margin-top:14px"><div class="so-card"><span class="so-lbl">Instagram followers</span>${bars('igF')}</div>
    <div class="so-card"><span class="so-lbl">Facebook followers</span>${bars('fbF')}</div></div>`;
  /* Follower trend, one line per account */
  const colourFor = d => d === me ? 'var(--client)' : (colourOf[d] || '#777');
  out += `<div class="so-card" style="margin-top:14px"><span class="so-lbl" style="margin-bottom:8px">Instagram followers over time</span>
    <div class="so-legend">${doms.map(d => `<span><i style="background:${colourFor(d)}"></i>${esc(nameOf[d] || d)}</span>`).join('')}</div>
    ${dates.length < 2 ? '<div class="so-empty">The trend line starts with the second weekly capture.</div>'
      : soCompSvg(doms, dates, at, me, nameOf, colourFor)}</div>`;
  const cellN = v => v == null ? '<span class="muted">not public</span>' : fmt(v);
  const sg = v => v == null ? '—' : `<span class="${v > 0 ? 'up' : v < 0 ? 'down' : ''}">${v > 0 ? '+' : ''}${fmt(v)}</span>`;
  const showGrow = base !== S, showMoM = !!prevM, b = `${base.slice(8,10)}/${base.slice(5,7)}`;
  out += `<div class="so-card" style="margin-top:14px"><div class="so-tblwrap"><table class="so-kw"><thead><tr><th>Account</th><th class="num">IG followers</th>${showMoM ? '<th class="num">IG vs last month</th>' : ''}${showGrow ? `<th class="num">IG since ${b}</th>` : ''}
      <th class="num">IG posts</th>${showMoM ? '<th class="num">Posts this month</th>' : ''}${showGrow && !showMoM ? `<th class="num">Posts since ${b}</th>` : ''}<th class="num">Posts / week</th>
      <th class="num">FB followers</th>${showMoM ? '<th class="num">FB vs last month</th>' : showGrow ? `<th class="num">FB since ${b}</th>` : ''}<th class="num">FB talking about</th></tr></thead><tbody>
    ${rows.slice().sort((a, c) => (c.igF || 0) - (a.igF || 0)).map(r => `<tr class="${r.me ? 'me' : ''}"><td>${esc(r.name)}${r.igH ? `<a class="handle" href="https://www.instagram.com/${esc(r.igH)}/" target="_blank" rel="noopener">@${esc(r.igH)}</a>` : ''}</td>
      <td class="num">${cellN(r.igF)}</td>${showMoM ? `<td class="num">${sg(r.igMoM)}</td>` : ''}${showGrow ? `<td class="num">${sg(r.igGrow)}${r.igGrowPct != null ? ` <span class="muted">(${(r.igGrowPct * 100).toFixed(1)}%)</span>` : ''}</td>` : ''}
      <td class="num">${cellN(r.igP)}</td>${showMoM ? `<td class="num">${sg(r.postsMoM)}</td>` : ''}${showGrow && !showMoM ? `<td class="num">${sg(r.postsSince)}</td>` : ''}<td class="num">${r.pace != null ? r.pace.toFixed(1) : '—'}</td>
      <td class="num">${cellN(r.fbF)}</td>${showMoM ? `<td class="num">${sg(r.fbMoM)}</td>` : showGrow ? `<td class="num">${sg(r.fbGrow)}</td>` : ''}<td class="num">${cellN(r.fbT)}</td></tr>`).join('')}</tbody></table></div>
    <p class="so-note">Public profile figures captured weekly; this table is as at <b>${soAU(S)}</b>${after ? ` — competitor captures began after ${monthName(state.month)}, so this is the latest standing rather than that month’s` : ''}. ${showMoM ? `“Vs last month” compares with the last capture in ${soMon(prevM)}. ` : 'Month-on-month columns appear once captures exist in two different months. '}Posts per week needs at least two weeks of captures. Instagram and Facebook only show followers and post counts publicly — other accounts’ reach and engagement are private, so they are not compared. “Talking about” is Facebook’s own count of people interacting with the page over the last week. “Not public” means the page hides the figure, which is never shown as zero.</p></div>`;
  return out;
}

function soTopPosts(all){
  const P = state.month + '-01';
  const pick = pl => all.filter(p => p.period_date === P && (pl === 'facebook' ? p.platform === 'facebook' : p.platform !== 'facebook'))
    .sort((a, b) => pl === 'facebook' ? (+b.reach || 0) - (+a.reach || 0) : (+b.engagement || 0) - (+a.engagement || 0)).slice(0, 3);
  const icon = t => /REEL/i.test(t) ? '▶' : /CAROUSEL/i.test(t) ? '▦' : '◳';
  const type = t => /REEL/i.test(t) ? 'Reel' : /CAROUSEL/i.test(t) ? 'Carousel' : /VIDEO/i.test(t) ? 'Video' : 'Post';
  const cards = ps => ps.length ? `<div class="so-posts">${ps.map(p => {
      const ph = `<div class="ph">${icon(p.media_type)}<small>No cover</small></div>`, tag = `<span class="badge">${icon(p.media_type)} ${type(p.media_type)}</span>`;
      const img = p.image_path && /^https?:\/\//i.test(p.image_path) ? `<img src="${esc(p.image_path)}" alt="" loading="lazy" onerror="this.remove()">` : '';
      return `<a class="so-post" href="${soSafeUrl(p.permalink)}" target="_blank" rel="noopener"><div class="thumb">${ph}${img}${tag}</div>
        <div class="body"><div class="cap">${esc((p.caption || '').slice(0, 90))}</div>
        <div class="stats"><span>Reach <b>${fmt(+p.reach || 0)}</b></span><span>Eng <b>${fmt(+p.engagement || 0)}</b></span></div></div></a>`; }).join('')}</div>`
    : '<div class="so-empty">No posts for this month yet.</div>';
  return soSec('Top Instagram posts this month') + cards(pick('instagram')) + soSec('Top Facebook posts this month') + cards(pick('facebook'));
}

/* Manor's insights panel. On a live page Savvas pins notes to charts; the preview has no
   database to save them in, so it shows the panel as a client would see it with none yet. */
function soInsights(){
  const p = CFG.partner || { name:'Savvas Studio' };
  return `<div class="so-ins"><h3>${p.mark ? `<img src="${esc(p.mark)}" alt="">` : ''}${esc(p.name)} — insights</h3>
    <p>Notes from ${esc(p.name)} on what’s moving the numbers — pinned to any point on a chart or anywhere on the page.</p>
    <div class="empty">No insights yet.</div></div>`;
}

/* Manor's daily Instagram chart (drawDailyChart): views and reach, month names underneath. */
function soDailySvg(rows){
  const W=1120,H=320,padL=52,padR=20,padT=28,padB=34, plotW=W-padL-padR, plotH=H-padT-padB, accent='#D0531E', green='#3FD07F';
  const kfmt=v=>Math.abs(v)>=1000?(v/1000).toFixed(v%1000?1:0)+'k':Math.round(v), n=rows.length;
  const maxV=Math.max(1,...rows.map(r=>Math.max(+r.views||0,+r.reach||0)));
  const X=i=>padL+(n<=1?plotW/2:plotW*i/(n-1)), Y=v=>padT+plotH-(Math.max(0,v)/maxV)*plotH;
  let grid='',yl='';
  for(let g=0;g<=4;g++){ const yy=padT+plotH-(g/4)*plotH; grid+=`<line x1="${padL}" y1="${yy}" x2="${W-padR}" y2="${yy}" stroke="#3A3236"/>`; yl+=`<text x="${padL-8}" y="${yy+4}" fill="#8C8C99" font-size="10" font-family="Space Mono, monospace" text-anchor="end">${kfmt(maxV*g/4)}</text>`; }
  const line=k=>rows.map((r,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(+r[k]||0).toFixed(1)).join(' ');
  const area=k=>`M${X(0).toFixed(1)} ${(padT+plotH).toFixed(1)} `+rows.map((r,i)=>'L'+X(i).toFixed(1)+' '+Y(+r[k]||0).toFixed(1)).join(' ')+` L${X(n-1).toFixed(1)} ${(padT+plotH).toFixed(1)} Z`;
  let xl='',lastM='';
  rows.forEach((r,i)=>{ const m=String(r.metric_date).slice(0,7); if(m!==lastM){ lastM=m; xl+=`<text x="${X(i).toFixed(1)}" y="${H-padB+18}" fill="#8C8C99" font-size="10" font-family="Space Mono, monospace" text-anchor="middle">${SO_MON[+m.slice(5,7)-1]}</text>`; } });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Instagram daily reach and views over time">${grid}${yl}`
    +`<path d="${area('views')}" fill="${accent}" opacity="0.13"/><path d="${area('reach')}" fill="${green}" opacity="0.10"/>`
    +`<path d="${line('views')}" fill="none" stroke="${accent}" stroke-width="2"/><path d="${line('reach')}" fill="none" stroke="${green}" stroke-width="2"/>${xl}</svg>`;
}
/* Manor's competitor follower trend: one line per account, the client's thicker. */
function soCompSvg(doms, dates, at, me, nameOf, colourFor){
  const W=1120,H=260,PL=56,PR=18,PT=14,PB=30, pw=W-PL-PR, ph=H-PT-PB;
  const vals=[]; doms.forEach(d=>dates.forEach(t=>{ const v=at(t,d,'instagram').followers; if(v!=null) vals.push(v); }));
  const lo=Math.min(...vals), hi=Math.max(...vals), pad=Math.max(50,(hi-lo)*.08), y0=lo-pad, y1=hi+pad;
  const X=i=>PL+pw*i/(dates.length-1), Y=v=>PT+ph-(v-y0)/(y1-y0)*ph;
  let g='';
  for(let k=0;k<=4;k++){ const v=y0+(y1-y0)*k/4; g+=`<line x1="${PL}" y1="${Y(v)}" x2="${W-PR}" y2="${Y(v)}" stroke="rgba(255,255,255,.07)"/><text x="${PL-8}" y="${Y(v)+4}" text-anchor="end" font-family="Space Mono,monospace" font-size="10" fill="#8A8A93">${(v/1000).toFixed(1)}k</text>`; }
  let ln='';
  doms.forEach(d=>{ const isMe=d===me, col=colourFor(d);
    const pts=dates.map((t,i)=>{ const v=at(t,d,'instagram').followers; return v==null?null:[X(i),Y(v),v,t]; }).filter(Boolean);
    if(pts.length>1) ln+=`<polyline points="${pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ')}" fill="none" stroke="${col}" stroke-width="${isMe?3:1.8}" opacity="${isMe?1:.8}"/>`;
    ln+=pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${isMe?4:2.6}" fill="${col}"><title>${esc(nameOf[d]||d)} · ${soAU(p[3])}: ${fmt(p[2])}</title></circle>`).join(''); });
  const xl=dates.map((t,i)=>(i===0||i===dates.length-1||dates.length<=8)?`<text x="${X(i)}" y="${H-PB+18}" text-anchor="${i===0?'start':i===dates.length-1?'end':'middle'}" font-family="Space Mono,monospace" font-size="10" fill="#8C8C99">${t.slice(8,10)}/${t.slice(5,7)}</text>`:'').join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Instagram followers by account over time">${g}${ln}${xl}</svg>`;
}

/* ---------------------------------------------------------------- social, live page
   Manor on High's Social tab reads RAW.so. Manor fills it from its own manor_social_* tables;
   Buff & Brew's comes from the shared rpt_social_* tables, which hold one set of rows per
   client and are readable only by someone with access to that client (same rule as md_*). */
async function loadSocialRpt(){
  const id = RAW.client.id;
  const t = async (name, order) => {
    const { data, error } = await sb.from(name).select('*').eq('client_id', id).order(order).range(0, 4999);
    if (error) console.warn(name, error.message);
    return data || []; };
  const [monthly, daily, meta, posts, top, aud, comp] = await Promise.all([
    t('rpt_social_monthly', 'period_date'), t('rpt_social_daily', 'metric_date'), t('rpt_social_meta', 'period_date'),
    t('rpt_social_posts', 'posted_at'), t('rpt_social_top_posts', 'period_date'), t('rpt_social_audience', 'snapshot_date'),
    t('rpt_social_competitor_snapshots', 'snapshot_date')]);
  const comps = [...new Set(comp.map(r => r.domain))].map(d => ({ domain: d, label: d, colour: null, is_client: false }));
  RAW.so = { monthly, daily, meta, posts, top, aud, comp, comps };
  /* Social months join the month chips, so a month with social but no ads still shows. */
  const set = new Set(state.months);
  monthly.forEach(r => r.period_date && set.add(monthOf(r.period_date)));
  state.months = [...set].sort();
  state.month = state.months[state.months.length - 1];
}

/* DMs card: an admin types the month's count, saved through rpt_save_dms (which checks the
   caller is an admin on this client), then the page redraws with it. */
document.addEventListener('click', async e => {
  if (!e.target.closest('#so-dms-edit') || state.role !== 'admin') return;
  const cur = ((RAW.so.meta || []).find(r => monthOf(r.period_date) === state.month) || {}).dms;
  const v = prompt(`DMs received in ${monthName(state.month)}`, cur ?? '');
  if (v == null || v.trim() === '') return;
  const n = Number(v.trim());
  if (!Number.isInteger(n) || n < 0) return alert('Enter a whole number of DMs, for example 24.');
  const { error } = await sb.rpc('rpt_save_dms', { p_client: RAW.client.id, p_period: state.month + '-01', p_dms: n });
  if (error) return alert('Could not save: ' + error.message);
  RAW.so.meta = (RAW.so.meta || []).filter(r => monthOf(r.period_date) !== state.month).concat([{ period_date: state.month + '-01', dms: n }]);
  renderAll();
});

async function start(){
  const { data: client } = await sb.from('md_clients').select('*').eq('slug', CFG.slug).single();
  if (!client) return renderGate('This account cannot see this dashboard.');
  RAW.client = client;
  const { data: access } = await sb.from('md_client_access').select('role, modules')
    .eq('client_id', client.id).maybeSingle();
  state.role = access?.role || 'viewer';

  await loadData();
  await loadSocialRpt();
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
