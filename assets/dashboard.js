// Marketing Dashboard — shared client-side engine.
// One bundle for every client. Per-client differences come ONLY from
// window.DASHBOARD_CONFIG, injected inline by provision_client.py into each client's
// thin HTML shell. Never fork this file per client — fix it here and every client
// inherits the fix, which is the whole point of the shared-table design.
//
// v1 scope: Overview + per-module KPI/trend/insights tabs, month archive picker,
// Feedback tab, admin-only refresh button. Deliberately NOT built: Cobalt's
// pin-anywhere chart beacons (kept to a simpler per-tab insights list instead) and
// a supplier "workspace" (manual metrics / content plan) — add per-client only where
// a partner actually co-owns a channel.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CFG = window.DASHBOARD_CONFIG;
if (!CFG) throw new Error('DASHBOARD_CONFIG missing — shell was not built correctly');

const supabase = createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);

const MODULE_ORDER = ['overview', 'seo', 'map_grid', 'paid_ads', 'social', 'leads_crm', 'gbp', 'geo'];
const MODULE_LABEL = {
  overview: 'Overview', seo: 'SEO', map_grid: 'Map Pack Grid', paid_ads: 'Paid Ads',
  social: 'Social', leads_crm: 'Leads & CRM', gbp: 'Google Business Profile',
  geo: 'AI Visibility',
};

const state = {
  user: null,
  clientRow: null,
  role: null,        // 'admin' | 'editor' | 'viewer'
  moduleScope: null, // string[] or ['all']
  activeTab: 'overview',
  period: 'current',       // 'current' | an mbr_archive.period_key
  archivePeriods: [],
  charts: {},
};

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
const fmt = (n) => { const v = Math.round(Number(n) || 0); return v.toLocaleString('en-AU'); };
const pct = (cur, prev) => {
  if (!prev) return cur ? 'new' : '—';
  const p = ((cur - prev) / prev) * 100;
  return `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(0)}%`;
};
const monthBounds = (offset = 0) => {
  const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + offset);
  const from = d.toISOString().slice(0, 10);
  const end = new Date(d); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
  const to = end.toISOString().slice(0, 10);
  return { from, to, label: d.toLocaleString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
};

// ---------------------------------------------------------------------------
// Auth gate
// ---------------------------------------------------------------------------

async function boot() {
  document.title = `${CFG.name} — Marketing Dashboard`;
  document.documentElement.style.setProperty('--accent', CFG.accent || '#1E9E6A');
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return afterLogin(session);
  renderGate();
}

function renderGate(err) {
  document.body.innerHTML = `
    <div class="gate"><div class="gate-card">
      <img src="../assets/r2r-logo.png" alt="Ready to Rank">
      <h1>${CFG.name} — sign in</h1>
      <form id="login-form">
        <input type="email" id="email" placeholder="Email" required>
        <input type="password" id="password" placeholder="Password" required>
        <button type="submit">Sign in</button>
      </form>
      ${err ? `<div class="gate-err">${err}</div>` : ''}
    </div></div>`;
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#email').value.trim(), password = $('#password').value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return renderGate(error.message);
    afterLogin(data.session);
  });
}

async function afterLogin(session) {
  state.user = session.user;
  const { data: clientRow, error: cErr } = await supabase
    .from('md_clients').select('*').eq('slug', CFG.slug).single();
  if (cErr || !clientRow) return renderGate('Could not load this client.');
  state.clientRow = clientRow;

  const { data: access, error: aErr } = await supabase
    .from('md_client_access').select('role, modules')
    .eq('client_id', clientRow.id).eq('user_id', state.user.id).maybeSingle();
  if (aErr || !access) return renderGate('You do not have access to this dashboard.');
  state.role = access.role;
  state.moduleScope = access.modules || ['all'];

  const { data: archive } = await supabase
    .from('md_mbr_archive').select('period_key').eq('client_id', clientRow.id)
    .order('period_key', { ascending: false });
  state.archivePeriods = (archive || []).map(r => r.period_key);

  renderShell();
}

function canSee(moduleKey) {
  if (state.role === 'admin') return true;
  return state.moduleScope.includes('all') || state.moduleScope.includes(moduleKey);
}

// ---------------------------------------------------------------------------
// Shell + tabs
// ---------------------------------------------------------------------------

function renderShell() {
  const enabledModules = MODULE_ORDER.filter(m =>
    m === 'overview' || (CFG.modules[m]?.enabled && canSee(m)));

  document.body.innerHTML = `
    <div class="tabbar"><div class="wrap" style="display:flex;align-items:center">
      <div id="tabs" class="tabs"></div>
      <div class="periodbar">
        <select id="period-select"></select>
        ${state.role === 'admin' ? '<button id="refresh-btn" class="admin-refresh">Refresh data</button>' : ''}
      </div>
    </div></div>
    <div class="cover"><div class="wrap">
      <div class="logo-wrap"><img class="logo" src="../assets/${CFG.logo}" alt="${CFG.name}"></div>
      <h1>${CFG.name} <span>Performance</span></h1>
      <p class="sub">Live marketing dashboard — ${state.role === 'admin' ? 'admin view' : 'client view'}.</p>
    </div></div>
    <div class="wrap"><div id="tabpanel"></div>
      <footer><div>Prepared by <b>Ready to Rank</b> · readytorank.com.au</div>
        <div>${CFG.name} · Generated ${new Date().toLocaleDateString('en-AU', { timeZone: 'Australia/Melbourne' })}</div></footer>
    </div>`;

  document.documentElement.style.setProperty('--accent', CFG.accent || '#1E9E6A');

  const tabsEl = $('#tabs');
  tabsEl.innerHTML = enabledModules.map(m =>
    `<div class="tab${m === state.activeTab ? ' active' : ''}" data-tab="${m}">${MODULE_LABEL[m]}</div>`
  ).join('') + `<div class="tab" data-tab="feedback">Feedback</div>`;
  tabsEl.addEventListener('click', (e) => {
    const t = e.target.closest('.tab'); if (!t) return;
    state.activeTab = t.dataset.tab;
    // keep the tab deep-linkable so a Slack message can point straight at the SEO tab
    history.replaceState(null, '', '#' + state.activeTab);
    $$('.tab', tabsEl).forEach(x => x.classList.toggle('active', x === t));
    renderTab();
  });

  const periodSel = $('#period-select');
  periodSel.innerHTML = `<option value="current">Current</option>` +
    state.archivePeriods.map(p => `<option value="${p}">${p}</option>`).join('');
  periodSel.addEventListener('change', () => { state.period = periodSel.value; renderTab(); });

  const refreshBtn = $('#refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', onAdminRefresh);

  const hashTab = (location.hash || '').replace('#', '');
  if (hashTab && (enabledModules.includes(hashTab) || hashTab === 'feedback')) {
    state.activeTab = hashTab;
    $$('.tab', tabsEl).forEach(x => x.classList.toggle('active', x.dataset.tab === hashTab));
  }
  if (state.activeTab !== 'feedback' && !enabledModules.includes(state.activeTab)) state.activeTab = 'overview';
  renderTab();
}

async function onAdminRefresh() {
  const btn = $('#refresh-btn');
  btn.disabled = true; btn.textContent = 'Refreshing…';
  const { error } = await supabase.functions.invoke('dashboard-refresh', {
    body: { client_id: state.clientRow.id },
  });
  btn.disabled = false;
  btn.textContent = error ? 'Refresh failed — retry' : 'Refreshed ✓';
  setTimeout(() => { if (btn) btn.textContent = 'Refresh data'; }, 4000);
  if (!error) renderTab();
}

async function renderTab() {
  const panel = $('#tabpanel');
  panel.innerHTML = `<div class="empty-tab">Loading…</div>`;
  try {
    if (state.activeTab === 'overview') return panel.replaceChildren(await renderOverview());
    if (state.activeTab === 'feedback') return panel.replaceChildren(await renderFeedback());
    if (state.period !== 'current') return panel.replaceChildren(await renderArchivedModule(state.activeTab));
    const renderer = { seo: renderSeo, map_grid: renderMapGrid, paid_ads: renderPaid,
      social: renderSocial, leads_crm: renderLeads, gbp: renderGbp, geo: renderGeo }[state.activeTab];
    panel.replaceChildren(renderer ? await renderer() : emptyEl('Unknown tab.'));
  } catch (e) {
    console.error(e);
    panel.replaceChildren(emptyEl('Could not load this tab — check the console.'));
  }
}

function emptyEl(msg) { const d = document.createElement('div'); d.className = 'empty-tab'; d.textContent = msg; return d; }
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }

function kpiCard(label, cur, prev) {
  const up = cur >= (prev || 0);
  return `<div class="kpi"><div class="kpi-label">${label}</div>
    <div class="kpi-val">${fmt(cur)}</div>
    <div class="kpi-delta ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${pct(cur, prev)} <span style="color:var(--mut);font-weight:600">vs last month</span></div>
  </div>`;
}

function lineChart(canvas, labels, series) {
  return new Chart(canvas, {
    type: 'line',
    data: { labels, datasets: series.map((s, i) => ({
      label: s.label, data: s.data, borderColor: i === 0 ? CFG.accent : 'var(--blue)'.replace('var(--blue)', '#17B4F0'),
      backgroundColor: 'transparent', tension: .35, pointRadius: 0, borderWidth: 2,
    })) },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#cfe0d8' } } },
      scales: { x: { grid: { display: false } }, y: { grid: { color: '#22332B' }, beginAtZero: true } } },
  });
}

async function insightsPanel(moduleKey) {
  const { data: rows } = await supabase.from('md_insights').select('*')
    .eq('client_id', state.clientRow.id).eq('module', moduleKey)
    .order('created_at', { ascending: false }).limit(10);
  const list = (rows || []).map(r => `<div class="insight-item">
      <div class="meta">${new Date(r.created_at).toLocaleDateString('en-AU')}</div>${r.body || ''}</div>`).join('')
    || `<div class="insight-item" style="color:var(--mut)">No insights pinned yet.</div>`;
  const canWrite = state.role === 'admin' || state.role === 'editor';
  return `<div class="section-h mono">Insights</div><div class="insights">${list}</div>
    ${canWrite ? `<div class="insight-form"><textarea id="insight-body" placeholder="Add a note for whoever looks at this next…"></textarea>
      <button id="insight-submit">Post</button></div>` : ''}`;
}
function wireInsightsForm(moduleKey, panel) {
  const btn = $('#insight-submit', panel); if (!btn) return;
  btn.addEventListener('click', async () => {
    const body = $('#insight-body', panel).value.trim(); if (!body) return;
    await supabase.from('md_insights').insert({ client_id: state.clientRow.id, module: moduleKey, author_id: state.user.id, body });
    renderTab();
  });
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

async function renderOverview() {
  const cur = monthBounds(0), prev = monthBounds(-1);
  const tiles = [];
  const mods = MODULE_ORDER.filter(m => m !== 'overview' && CFG.modules[m]?.enabled && canSee(m));
  for (const m of mods) {
    if (m === 'seo') { const r = await overviewRankings(); if (r) tiles.push(r); }
    const headline = { seo: overviewSeo, paid_ads: overviewPaid, social: overviewSocial,
      leads_crm: overviewLeads, gbp: overviewGbp, geo: overviewGeo }[m];
    if (headline) tiles.push(await headline(cur, prev));
  }
  const wrap = el(`<div>
    <div class="section-h mono">This month vs last — ${cur.label}</div>
    <div class="kpis">${tiles.join('')}</div>
  </div>`);
  return wrap;
}
// Every overview tile must distinguish "we measured zero" from "nothing is connected".
// A tile that shows 0 for an unconnected source is a lie the client can't detect.
async function hasRows(table) {
  const { count } = await supabase.from(table).select('*', { count: 'exact', head: true })
    .eq('client_id', state.clientRow.id);
  return (count || 0) > 0;
}
function pendingTile(label) {
  return `<div class="kpi" style="--c:var(--mut)"><div class="kpi-label">${label}</div>
    <div class="kpi-val" style="font-size:19px;color:var(--mut)">Not connected</div>
    <div class="kpi-sub">no data source linked yet</div></div>`;
}
async function overviewSeo(cur, prev) {
  if (!(await hasRows('md_seo_daily'))) return pendingTile('Organic sessions');
  const c = await sumSeo(cur), p = await sumSeo(prev);
  return kpiCard('Organic sessions', c.sessions, p.sessions);
}
async function overviewPaid(cur, prev) {
  if (!(await hasRows('md_paid_daily'))) return pendingTile('Ad leads');
  const c = await sumPaid(cur), p = await sumPaid(prev);
  return kpiCard('Ad leads', c.leads, p.leads);
}
async function overviewSocial(cur, prev) {
  if (!(await hasRows('md_social_daily'))) return pendingTile('Social reach');
  const c = await sumSocial(cur), p = await sumSocial(prev);
  return kpiCard('Social reach', c.reach, p.reach);
}
async function overviewLeads(cur, prev) {
  if (!(await hasRows('md_leads_daily'))) return pendingTile('Total leads');
  const c = await sumLeads(cur), p = await sumLeads(prev);
  return kpiCard('Total leads', c.count, p.count);
}
async function overviewGbp(cur, prev) {
  if (!(await hasRows('md_gbp_daily'))) return pendingTile('GBP calls');
  const c = await sumGbp(cur), p = await sumGbp(prev);
  return kpiCard('GBP calls', c.calls, p.calls);
}
async function overviewGeo() {
  const { data } = await supabase.from('md_geo_visibility').select('result')
    .eq('client_id', state.clientRow.id).order('checked_at', { ascending: false }).limit(25);
  if (!data || !data.length) return pendingTile('AI visibility');
  const yes = data.filter(r => r.result === 'yes').length;
  return `<div class="kpi"><div class="kpi-label">AI visibility (latest check)</div>
    <div class="kpi-val">${yes}/${data.length}</div>
    <div class="kpi-sub">checks returning a clear brand mention</div></div>`;
}
// SEO is the one module that can be half-live: rankings present, traffic not. Surface
// the rankings headline on the overview even when GSC/GA4 aren't connected.
async function overviewRankings() {
  const { data: latest } = await supabase.from('md_rankings').select('checked_at')
    .eq('client_id', state.clientRow.id).order('checked_at', { ascending: false }).limit(1);
  if (!latest || !latest.length) return '';
  const { data } = await supabase.from('md_rankings').select('position')
    .eq('client_id', state.clientRow.id).eq('checked_at', latest[0].checked_at);
  const ranked = (data || []).filter(r => r.position != null);
  const top10 = ranked.filter(r => r.position <= 10).length;
  return `<div class="kpi"><div class="kpi-label">Keywords in top 10</div>
    <div class="kpi-val">${top10}</div>
    <div class="kpi-sub">of ${ranked.length} ranking · ${(data || []).length} tracked · ${latest[0].checked_at}</div></div>`;
}

// ---------------------------------------------------------------------------
// Per-module fetch + render
// ---------------------------------------------------------------------------

async function sumSeo(range) {
  const { data } = await supabase.from('md_seo_daily').select('sessions,clicks,impressions')
    .eq('client_id', state.clientRow.id).gte('date', range.from).lte('date', range.to);
  return (data || []).reduce((a, r) => ({ sessions: a.sessions + (r.sessions || 0),
    clicks: a.clicks + (r.clicks || 0), impressions: a.impressions + (r.impressions || 0) }),
    { sessions: 0, clicks: 0, impressions: 0 });
}
async function renderSeo() {
  const cur = monthBounds(0), prev = monthBounds(-1);
  const c = await sumSeo(cur), p = await sumSeo(prev);
  const { data: daily } = await supabase.from('md_seo_daily').select('date,sessions,clicks')
    .eq('client_id', state.clientRow.id).gte('date', cur.from).lte('date', cur.to).order('date');

  // A source that isn't connected must NOT render as "0" — a fabricated zero reads as
  // real bad news and nobody thinks to question it. This is the exact failure mode that
  // had Cobalt reporting 0 leads against live spend for two weeks. No rows = say so.
  const hasSeoTraffic = (daily || []).length > 0;
  const kpis = hasSeoTraffic
    ? `${kpiCard('Organic sessions', c.sessions, p.sessions)}
       ${kpiCard('Clicks (GSC)', c.clicks, p.clicks)}
       ${kpiCard('Impressions (GSC)', c.impressions, p.impressions)}`
    : notConnectedCard('Organic traffic', 'Search Console / GA4 are not yet connected for this client — no traffic data is being collected. This is a missing connection, not a result of zero.');

  // Rankings: take the LATEST check date only, then sort by position. Ordering by
  // checked_at and slicing would silently return an arbitrary subset of one day's rows.
  const { data: latest } = await supabase.from('md_rankings').select('checked_at')
    .eq('client_id', state.clientRow.id).order('checked_at', { ascending: false }).limit(1);
  let rankings = [];
  if (latest && latest.length) {
    const { data } = await supabase.from('md_rankings').select('*')
      .eq('client_id', state.clientRow.id).eq('checked_at', latest[0].checked_at)
      .order('position', { ascending: true, nullsFirst: false });
    rankings = data || [];
  }
  const ranked = rankings.filter(r => r.position != null);
  const top10 = ranked.filter(r => r.position <= 10).length;

  const wrap = el(`<div>
    <div class="section-h mono">SEO — ${cur.label}</div>
    <div class="kpis">${kpis}</div>
    ${hasSeoTraffic ? `<div class="section-h mono">Sessions trend</div>
      <div class="chart-card"><div class="chart-box"><canvas id="seo-trend"></canvas></div></div>` : ''}
    <div class="section-h mono">Rankings${latest && latest.length ? ` — checked ${latest[0].checked_at}` : ''}</div>
    <div class="kpis" style="margin-bottom:14px">
      <div class="kpi"><div class="kpi-label">Keywords tracked</div><div class="kpi-val">${rankings.length}</div></div>
      <div class="kpi"><div class="kpi-label">Ranking in top 100</div><div class="kpi-val">${ranked.length}</div></div>
      <div class="kpi"><div class="kpi-label">In top 10</div><div class="kpi-val">${top10}</div></div>
    </div>
    <div class="card">${rankingsTable(rankings)}</div>
    ${await insightsPanel('seo')}
  </div>`);
  queueMicrotask(() => {
    if (hasSeoTraffic) {
      lineChart($('#seo-trend', wrap), (daily || []).map(r => r.date.slice(5)),
        [{ label: 'Sessions', data: (daily || []).map(r => r.sessions) }]);
    }
    wireInsightsForm('seo', wrap);
  });
  return wrap;
}

function notConnectedCard(label, why) {
  return `<div class="kpi" style="grid-column:1/-1;--c:var(--coral)">
    <div class="kpi-label">${label}</div>
    <div class="kpi-val" style="font-size:20px;color:var(--mut)">Not connected</div>
    <div class="kpi-sub">${why}</div></div>`;
}

function rankingsTable(rows) {
  if (!rows || !rows.length) return `<p class="note">No ranking checks recorded yet.</p>`;
  return rows.map(r => {
    const moved = r.position != null && r.prev_position != null ? r.prev_position - r.position : null;
    const chip = moved === null ? ''
      : moved > 0 ? `<span style="color:var(--green);font-weight:800">▲ ${moved}</span>`
      : moved < 0 ? `<span style="color:var(--coral);font-weight:800">▼ ${Math.abs(moved)}</span>`
      : `<span style="color:var(--mut)">—</span>`;
    // position null = not in the top 100. Never render this as 0 or as a rank.
    const pos = r.position == null
      ? `<span style="color:var(--mut)">not in top 100</span>`
      : `<b>#${r.position}</b>`;
    return `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;
      border-bottom:1px dashed var(--line);padding:9px 0;font-size:13.5px">
      <span>${r.keyword}</span><span style="display:flex;gap:10px;align-items:baseline">${pos}${chip}</span></div>`;
  }).join('');
}

async function sumPaid(range) {
  const { data } = await supabase.from('md_paid_daily').select('spend,leads,clicks')
    .eq('client_id', state.clientRow.id).gte('date', range.from).lte('date', range.to);
  return (data || []).reduce((a, r) => ({ spend: a.spend + Number(r.spend || 0),
    leads: a.leads + (r.leads || 0), clicks: a.clicks + (r.clicks || 0) }), { spend: 0, leads: 0, clicks: 0 });
}
async function renderPaid() {
  const cur = monthBounds(0), prev = monthBounds(-1);
  const c = await sumPaid(cur), p = await sumPaid(prev);
  const { data: daily } = await supabase.from('md_paid_daily').select('date,spend,leads')
    .eq('client_id', state.clientRow.id).gte('date', cur.from).lte('date', cur.to).order('date');
  const byDate = {};
  (daily || []).forEach(r => { byDate[r.date] = byDate[r.date] || { spend: 0, leads: 0 };
    byDate[r.date].spend += Number(r.spend || 0); byDate[r.date].leads += r.leads || 0; });
  const dates = Object.keys(byDate).sort();
  const wrap = el(`<div>
    <div class="section-h mono">Paid Ads — ${cur.label}</div>
    <div class="kpis">
      ${kpiCard('Spend', c.spend, p.spend)}
      ${kpiCard('Leads', c.leads, p.leads)}
      ${kpiCard('Cost per lead', c.leads ? c.spend / c.leads : 0, p.leads ? p.spend / p.leads : 0)}
    </div>
    <div class="section-h mono">Spend vs leads</div>
    <div class="chart-card"><div class="chart-box"><canvas id="paid-trend"></canvas></div></div>
    ${await insightsPanel('paid_ads')}
  </div>`);
  queueMicrotask(() => {
    lineChart($('#paid-trend', wrap), dates.map(d => d.slice(5)),
      [{ label: 'Spend', data: dates.map(d => byDate[d].spend) }, { label: 'Leads', data: dates.map(d => byDate[d].leads) }]);
    wireInsightsForm('paid_ads', wrap);
  });
  return wrap;
}

async function sumSocial(range) {
  const { data } = await supabase.from('md_social_daily').select('reach,engagement')
    .eq('client_id', state.clientRow.id).gte('date', range.from).lte('date', range.to);
  return (data || []).reduce((a, r) => ({ reach: a.reach + (r.reach || 0), engagement: a.engagement + (r.engagement || 0) }),
    { reach: 0, engagement: 0 });
}
async function renderSocial() {
  const cur = monthBounds(0), prev = monthBounds(-1);
  const c = await sumSocial(cur), p = await sumSocial(prev);
  const { data: posts } = await supabase.from('md_social_posts').select('*')
    .eq('client_id', state.clientRow.id).order('reach', { ascending: false }).limit(6);
  const postsHtml = (posts || []).map(p => `<div class="card">
    <div class="note">${p.platform} · ${p.post_date}</div>
    <div style="font-weight:700;font-size:13.5px;margin:6px 0">${(p.caption || '').slice(0, 90)}</div>
    <div class="note">Reach ${fmt(p.reach)} · ${fmt(p.likes)} likes · ${fmt(p.comments)} comments</div></div>`).join('');
  const wrap = el(`<div>
    <div class="section-h mono">Social — ${cur.label}</div>
    <div class="kpis">${kpiCard('Reach', c.reach, p.reach)}${kpiCard('Engagement', c.engagement, p.engagement)}</div>
    <div class="section-h mono">Top posts</div>
    <div class="grid2" style="grid-template-columns:repeat(3,1fr)">${postsHtml || '<p class="note">No posts recorded yet.</p>'}</div>
    ${await insightsPanel('social')}
  </div>`);
  queueMicrotask(() => wireInsightsForm('social', wrap));
  return wrap;
}

async function sumLeads(range) {
  const { data } = await supabase.from('md_leads_daily').select('count')
    .eq('client_id', state.clientRow.id).gte('date', range.from).lte('date', range.to);
  return { count: (data || []).reduce((a, r) => a + (r.count || 0), 0) };
}
async function renderLeads() {
  const cur = monthBounds(0), prev = monthBounds(-1);
  const c = await sumLeads(cur), p = await sumLeads(prev);
  const { data: bySource } = await supabase.from('md_leads_daily').select('source,count')
    .eq('client_id', state.clientRow.id).gte('date', cur.from).lte('date', cur.to);
  const bySrc = {}; (bySource || []).forEach(r => { bySrc[r.source] = (bySrc[r.source] || 0) + r.count; });
  const rows = Object.entries(bySrc).map(([s, n]) => `<div class="row" style="display:flex;justify-content:space-between;border-bottom:1px dashed var(--line);padding:8px 0"><span>${s}</span><span>${fmt(n)}</span></div>`).join('');
  const wrap = el(`<div>
    <div class="section-h mono">Leads & CRM — ${cur.label}</div>
    <div class="kpis">${kpiCard('Total leads', c.count, p.count)}</div>
    <div class="section-h mono">By source</div><div class="card">${rows || '<p class="note">No leads recorded yet.</p>'}</div>
    ${await insightsPanel('leads_crm')}
  </div>`);
  queueMicrotask(() => wireInsightsForm('leads_crm', wrap));
  return wrap;
}

async function sumGbp(range) {
  const { data } = await supabase.from('md_gbp_daily').select('calls,direction_requests,website_clicks')
    .eq('client_id', state.clientRow.id).gte('date', range.from).lte('date', range.to);
  return (data || []).reduce((a, r) => ({ calls: a.calls + (r.calls || 0),
    direction_requests: a.direction_requests + (r.direction_requests || 0),
    website_clicks: a.website_clicks + (r.website_clicks || 0) }), { calls: 0, direction_requests: 0, website_clicks: 0 });
}
async function renderGbp() {
  const cur = monthBounds(0), prev = monthBounds(-1);
  const c = await sumGbp(cur), p = await sumGbp(prev);
  const { data: rev } = await supabase.from('md_gbp_reviews').select('*')
    .eq('client_id', state.clientRow.id).order('as_of', { ascending: false }).limit(1);
  const r = (rev || [])[0];
  const wrap = el(`<div>
    <div class="section-h mono">Google Business Profile — ${cur.label}</div>
    <div class="kpis">
      ${kpiCard('Calls', c.calls, p.calls)}
      ${kpiCard('Direction requests', c.direction_requests, p.direction_requests)}
      ${kpiCard('Website clicks', c.website_clicks, p.website_clicks)}
      ${r ? `<div class="kpi"><div class="kpi-label">Reviews</div><div class="kpi-val">${r.review_count}</div><div class="kpi-sub">avg rating ${r.avg_rating ?? '—'}</div></div>` : ''}
    </div>
    ${await insightsPanel('gbp')}
  </div>`);
  queueMicrotask(() => wireInsightsForm('gbp', wrap));
  return wrap;
}

// Map Pack Grid. The panel itself lives in mapgrid-panel.js and is shared with the
// standalone gated page the map-grid skill publishes — same renderer, two hosts, so
// a fix here reaches both. Imported lazily: clients without the module never fetch it.
async function renderMapGrid() {
  const { renderMapGridPanel, supabaseProvider } = await import('./mapgrid-panel.js');
  const panel = await renderMapGridPanel(supabaseProvider(supabase, state.clientRow.id));
  const wrap = el(`<div><div class="section-h mono">Map Pack Grid</div></div>`);
  wrap.append(panel);
  const ins = el(`<div></div>`);
  ins.innerHTML = await insightsPanel('map_grid');
  wrap.append(ins);
  queueMicrotask(() => wireInsightsForm('map_grid', wrap));
  return wrap;
}

async function renderGeo() {
  const { data } = await supabase.from('md_geo_visibility').select('*')
    .eq('client_id', state.clientRow.id).order('checked_at', { ascending: false }).limit(50);
  const engines = ['chatgpt', 'perplexity', 'gemini', 'claude', 'grok'];
  const latestByEngine = {};
  (data || []).forEach(r => { if (!latestByEngine[r.engine]) latestByEngine[r.engine] = []; latestByEngine[r.engine].push(r); });
  const grid = engines.map(en => {
    const rows = latestByEngine[en] || [];
    const yes = rows.filter(r => r.result === 'yes').length;
    return `<div class="kpi"><div class="kpi-label">${en}</div><div class="kpi-val">${yes}/${rows.length || 0}</div></div>`;
  }).join('');
  const wrap = el(`<div>
    <div class="section-h mono">AI Visibility (GEO)</div>
    <div class="kpis">${grid}</div>
    ${await insightsPanel('geo')}
  </div>`);
  queueMicrotask(() => wireInsightsForm('geo', wrap));
  return wrap;
}

// ---------------------------------------------------------------------------
// Archived (frozen) months
// ---------------------------------------------------------------------------

async function renderArchivedModule(moduleKey) {
  const { data } = await supabase.from('md_mbr_archive').select('snapshot,pdf_path')
    .eq('client_id', state.clientRow.id).eq('period_key', state.period).maybeSingle();
  if (!data) return emptyEl('No archived snapshot for this period.');
  const snap = data.snapshot?.[moduleKey];
  if (!snap) return emptyEl('This module was not tracked in that period.');
  return el(`<div>
    <div class="section-h mono">${MODULE_LABEL[moduleKey]} — ${state.period} (archived)</div>
    <pre style="white-space:pre-wrap;font-size:12.5px;color:#cfe0d8;background:var(--card);
      border:1px solid var(--line);border-radius:12px;padding:16px">${JSON.stringify(snap, null, 2)}</pre>
    ${data.pdf_path ? `<p style="margin-top:12px"><a href="${data.pdf_path}" style="color:var(--blue)">Download the ${state.period} PDF</a></p>` : ''}
  </div>`);
}

// ---------------------------------------------------------------------------
// Feedback tab
// ---------------------------------------------------------------------------

async function renderFeedback() {
  const { data: rows } = await supabase.from('md_feedback').select('*')
    .eq('client_id', state.clientRow.id).order('created_at', { ascending: false }).limit(30);
  const list = (rows || []).map(r => `<div class="feedback-item">
    <div class="meta">${new Date(r.created_at).toLocaleString('en-AU')}</div>${r.body || ''}</div>`).join('')
    || `<div class="feedback-item" style="color:var(--mut)">Nothing posted yet.</div>`;
  const wrap = el(`<div>
    <div class="section-h mono">Feedback & Updates</div>
    <p class="note" style="margin-bottom:14px">Anyone with access to this dashboard can leave a note here between check-ins.</p>
    <div class="insight-form"><textarea id="fb-body" placeholder="Leave a note…"></textarea><button id="fb-submit">Post</button></div>
    <div class="feedback-list" style="margin-top:18px">${list}</div>
  </div>`);
  queueMicrotask(() => {
    $('#fb-submit', wrap).addEventListener('click', async () => {
      const body = $('#fb-body', wrap).value.trim(); if (!body) return;
      await supabase.from('md_feedback').insert({ client_id: state.clientRow.id, author_id: state.user.id, body });
      renderTab();
    });
  });
  return wrap;
}

boot();
