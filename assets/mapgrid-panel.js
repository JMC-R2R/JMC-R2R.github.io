// mapgrid-panel.js — the map-pack grid panel, shared by two hosts.
//
//   1. the marketing-dashboard tab  -> provider queries Supabase live (RLS-scoped)
//   2. the interim standalone page  -> provider reads data baked in at publish time
//
// Which is why this takes a PROVIDER rather than a Supabase client: the standalone
// page is password-gated, not Supabase-authenticated, so it must not need a
// readable anon policy on the scan tables just to draw a chart.
//
// A provider is an object with:
//   scans()            -> [scanRow, ...]   newest first
//   points(scanId)     -> [pointRow, ...]
//
// Class names deliberately match dashboard.css (kpi, kpi-label, kpi-val, section-h,
// mono, card, line) so the panel inherits the dashboard's styling when embedded and
// only needs its own CSS when standalone.
//
// Never invents a number. A point with rank === null means "not found within the
// scan depth" — it is excluded from averages, never coerced to 0, and the panel
// always states how many points an average covers.

const BANDS = [
  { key: '1-3', label: '1 – 3', colour: '#16A34A', test: r => r !== null && r <= 3 },
  { key: '4-10', label: '4 – 10', colour: '#F0A32B', test: r => r !== null && r > 3 && r <= 10 },
  { key: '11-20', label: '11 – 20', colour: '#EF4444', test: r => r !== null && r > 10 && r <= 20 },
  { key: '21+', label: '21+', colour: '#7F1D1D', test: r => r !== null && r > 20 },
  { key: 'none', label: 'Not found', colour: '#9CA3AF', test: r => r === null },
];

const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const auDate = (iso) => {
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
};

function bandOf(rank) {
  return BANDS.find(b => b.test(rank)) || BANDS[BANDS.length - 1];
}

// ---------------------------------------------------------------------------
// Trend chart — inline SVG, no chart library. Two series on separate scales:
// average rank (lower is better, so the axis is inverted) and SoLV %.
// ---------------------------------------------------------------------------

function trendSvg(series, { w = 640, h = 170, pad = 34 } = {}) {
  const pts = series.filter(s => s.avg !== null && s.avg !== undefined);
  if (pts.length < 2) return '';

  const xs = (i) => pad + (i * (w - pad * 2)) / (series.length - 1);
  const avgs = pts.map(p => p.avg);
  const lo = Math.max(1, Math.floor(Math.min(...avgs) - 1));
  const hi = Math.ceil(Math.max(...avgs) + 1);
  // inverted: rank 1 at the TOP
  const ys = (v) => pad + ((v - lo) / (hi - lo || 1)) * (h - pad * 2);

  let d = '';
  series.forEach((s, i) => {
    if (s.avg === null || s.avg === undefined) return;
    d += `${d ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(s.avg).toFixed(1)}`;
  });

  const dots = series.map((s, i) => (s.avg === null || s.avg === undefined) ? '' :
    `<circle cx="${xs(i).toFixed(1)}" cy="${ys(s.avg).toFixed(1)}" r="4"
       fill="var(--accent,#17B4F0)" stroke="#fff" stroke-width="1.5"></circle>`).join('');

  const labels = series.map((s, i) =>
    `<text x="${xs(i).toFixed(1)}" y="${h - 8}" text-anchor="middle"
       font-size="10" fill="currentColor" opacity=".55">${esc(auDate(s.date).slice(0, 5))}</text>`).join('');

  return `<svg viewBox="0 0 ${w} ${h}" class="mg-trend" role="img"
      aria-label="Average rank over time, lower is better">
    <text x="4" y="${pad - 10}" font-size="10" fill="currentColor" opacity=".55">rank ${lo} (better)</text>
    <text x="4" y="${h - pad + 16}" font-size="10" fill="currentColor" opacity=".55">rank ${hi}</text>
    <line x1="${pad}" y1="${pad}" x2="${w - pad}" y2="${pad}" stroke="currentColor" opacity=".12"></line>
    <line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="currentColor" opacity=".12"></line>
    <path d="${d}" fill="none" stroke="var(--accent,#17B4F0)" stroke-width="2.5"
      stroke-linejoin="round" stroke-linecap="round"></path>
    ${dots}${labels}
  </svg>`;
}

// ---------------------------------------------------------------------------

function kpi(label, value, sub, cls = '') {
  return `<div class="kpi">
    <div class="kpi-label mono">${esc(label)}</div>
    <div class="kpi-val ${cls}">${value}</div>
    ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
  </div>`;
}

function distribution(points) {
  const total = points.length || 1;
  return BANDS.map(b => {
    const n = points.filter(p => b.test(p.rank)).length;
    if (!n) return '';
    return `<div class="mg-drow">
      <span class="mg-dot" style="background:${b.colour}"></span>
      <span class="mg-dlabel">${b.label}</span>
      <span class="mg-dbar"><i style="width:${(n / total) * 100}%;background:${b.colour}"></i></span>
      <span class="mg-dnum mono">${n} · ${Math.round((n / total) * 100)}%</span>
    </div>`;
  }).join('');
}

function competitors(points) {
  const counts = {};
  points.forEach(p => {
    if (!p.top_competitor) return;
    counts[p.top_competitor] = (counts[p.top_competitor] || 0) + 1;
  });
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!rows.length) return '';
  const total = points.length || 1;
  return `<div class="section-h mono">Who holds position 1 in your area</div>
    <table class="mg-table"><tbody>${rows.map(([name, n]) => `<tr>
      <td>${esc(name)}</td>
      <td class="mono" style="width:34%">
        <span class="mg-dbar" style="display:inline-block;width:60%;vertical-align:middle">
          <i style="width:${(n / total) * 100}%;background:var(--accent,#17B4F0)"></i></span>
        ${n} of ${total}
      </td></tr>`).join('')}</tbody></table>`;
}

function movement(cur, prev, curPts, prevPts) {
  if (!prev) {
    return `<div class="mg-note">First scan for this keyword — movement will appear here
      from the next one.</div>`;
  }
  const pmap = {};
  prevPts.forEach(p => { pmap[`${p.row_i},${p.col_j}`] = p.rank; });
  let up = 0, down = 0, entered = 0, lost = 0;
  curPts.forEach(p => {
    const old = pmap[`${p.row_i},${p.col_j}`];
    if (old === undefined) return;
    if (old === null && p.rank !== null) entered++;
    else if (old !== null && p.rank === null) lost++;
    else if (old !== null && p.rank !== null) { if (p.rank < old) up++; else if (p.rank > old) down++; }
  });
  const dAvg = (cur.avg_rank !== null && prev.avg_rank !== null)
    ? +(prev.avg_rank - cur.avg_rank).toFixed(2) : null;
  const arrow = dAvg === null ? '–' : dAvg > 0 ? '▲' : dAvg < 0 ? '▼' : '–';
  const cls = dAvg > 0 ? 'up' : dAvg < 0 ? 'down' : '';
  return `<div class="section-h mono">Movement since ${auDate(prev.checked_at)}</div>
    <div class="kpis">
      ${kpi('Average rank', `${arrow} ${dAvg === null ? '—' : Math.abs(dAvg)}`,
    `${prev.avg_rank ?? '—'} → ${cur.avg_rank ?? '—'}`, cls)}
      ${kpi('Points improved', up, `${down} declined`, up ? 'up' : '')}
      ${kpi('Newly ranking', entered, `${lost} dropped out`, entered ? 'up' : '')}
      ${kpi('Top 3 points', `${prevPts.filter(p => p.rank !== null && p.rank <= 3).length} → ${curPts.filter(p => p.rank !== null && p.rank <= 3).length}`,
      `SoLV ${prev.solv ?? 0}% → ${cur.solv ?? 0}%`)}
    </div>`;
}

// ---------------------------------------------------------------------------

export async function renderMapGridPanel(provider) {
  const scans = await provider.scans();
  if (!scans.length) {
    return el(`<div class="mg"><div class="mg-note">No grid scans yet for this client.</div></div>`);
  }

  const keywords = [...new Set(scans.map(s => s.keyword))].sort();
  const wrap = el(`<div class="mg"></div>`);
  const bar = el(`<div class="mg-kw"></div>`);
  const body = el(`<div class="mg-body"></div>`);
  wrap.append(bar, body);

  let active = keywords[0];

  async function draw() {
    const mine = scans.filter(s => s.keyword === active)
      .sort((a, b) => (a.checked_at < b.checked_at ? 1 : -1));
    const cur = mine[0];
    const prev = mine[1] || null;
    const curPts = await provider.points(cur.id);
    const prevPts = prev ? await provider.points(prev.id) : [];

    const found = cur.found_points, total = cur.total_points;
    const ranks = curPts.filter(p => p.rank !== null).map(p => p.rank);
    const best = ranks.length ? Math.min(...ranks) : null;
    const worst = ranks.length ? Math.max(...ranks) : null;

    const series = mine.slice().reverse().map(s => ({ date: s.checked_at, avg: s.avg_rank }));
    const chart = trendSvg(series);

    body.innerHTML = `
      <div class="mg-head">
        <div>
          <div class="section-h mono" style="margin:0">Map pack grid — “${esc(active)}”</div>
          <div class="mg-sub">${esc(cur.centre_label)} · ${cur.grid_size}×${cur.grid_size} grid
            at ${cur.spacing_km} km · scanned ${auDate(cur.checked_at)}</div>
        </div>
      </div>

      <div class="mg-split">
        <div class="mg-mapwrap">
          ${cur.map_url
        // NOT loading="lazy" - this is the primary above-the-fold image, and lazy
        // images do not resolve when the page is printed or screenshotted headless,
        // which is exactly how the monthly MBR PDF is produced.
        ? `<img src="${esc(cur.map_url)}" alt="Rank grid for ${esc(active)}">`
        : `<div class="mg-note">Map image not available for this scan.</div>`}
        </div>
        <div class="mg-side">
          <div class="kpis">
            ${kpi('Average rank', cur.avg_rank ?? '—', `across ${found} of ${total} points`)}
            ${kpi('Top 3 visibility', `${cur.solv ?? 0}%`,
          `${curPts.filter(p => p.rank !== null && p.rank <= 3).length} points in the top 3`)}
            ${kpi('Best / worst', `${best ?? '—'} / ${worst ?? '—'}`, 'strongest and weakest point')}
          </div>
          <div class="section-h mono">Ranking distribution</div>
          ${distribution(curPts)}
        </div>
      </div>

      ${found < total ? `<div class="mg-note"><b>${total - found} of ${total} points</b> did not return
        ${esc(cur.business_name)} anywhere in the top ${cur.depth}. Those points are excluded from the
        average rather than scored, so the average reflects only where the business genuinely appears.</div>` : ''}

      ${movement(cur, prev, curPts, prevPts)}

      ${chart ? `<div class="section-h mono">Average rank over time</div>
        <div class="mg-chart">${chart}</div>
        <div class="mg-sub">Lower is better — the line rising means you are moving up.</div>` : ''}

      ${competitors(curPts)}
    `;
  }

  bar.innerHTML = keywords.map(k =>
    `<button class="mg-kwbtn" data-kw="${esc(k)}">${esc(k)}</button>`).join('');
  bar.addEventListener('click', async (e) => {
    const b = e.target.closest('.mg-kwbtn');
    if (!b) return;
    active = b.dataset.kw;
    bar.querySelectorAll('.mg-kwbtn').forEach(x => x.classList.toggle('on', x.dataset.kw === active));
    await draw();
  });
  bar.querySelector('.mg-kwbtn')?.classList.add('on');

  await draw();
  return wrap;
}

// Provider that reads live from Supabase — used by the dashboard tab, where RLS
// scopes rows to the signed-in user's client.
export function supabaseProvider(supabase, clientId) {
  const cache = {};
  return {
    async scans() {
      const { data, error } = await supabase.from('md_mapgrid_scans')
        .select('*').eq('client_id', clientId).order('checked_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    async points(scanId) {
      if (cache[scanId]) return cache[scanId];
      const { data, error } = await supabase.from('md_mapgrid_points')
        .select('*').eq('scan_id', scanId).order('idx');
      if (error) throw error;
      return (cache[scanId] = data || []);
    },
  };
}

// Provider that reads data baked into the page at publish time — used by the
// standalone gated page, so it needs no database access at all.
export function staticProvider(payload) {
  return {
    async scans() { return payload.scans; },
    async points(scanId) { return payload.points[scanId] || []; },
  };
}
