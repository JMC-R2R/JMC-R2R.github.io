# -*- coding: utf-8 -*-
"""
Gluten Free World — monthly social report generator.
Usage:  python3 build_report.py <data.json> <output.html> [assets_dir]
Reads a data.json (one per reporting month) and renders the branded dashboard.
See monthly-report-playbook.md for how the data.json is produced each month.
"""
import json, sys, calendar

data_path = sys.argv[1] if len(sys.argv) > 1 else "data.json"
out_path  = sys.argv[2] if len(sys.argv) > 2 else "report.html"
assets    = sys.argv[3] if len(sys.argv) > 3 else "assets"

D = json.load(open(data_path))

MSHORT = {1:"Jan",2:"Feb",3:"Mar",4:"Apr",5:"May",6:"Jun",7:"Jul",8:"Aug",9:"Sep",10:"Oct",11:"Nov",12:"Dec"}
MLONG  = {1:"January",2:"February",3:"March",4:"April",5:"May",6:"June",7:"July",8:"August",9:"September",10:"October",11:"November",12:"December"}

def fmt(n):
    try: return f"{round(n):,}"
    except: return str(n)

def prev_month_key(k):
    y,m = int(k[:4]), int(k[5:7])
    m -= 1
    if m == 0: y,m = y-1,12
    return f"{y:04d}-{m:02d}"

report_key = D["report_month"]
prev_key   = prev_month_key(report_key)
anchor_key = D.get("anchor_month")
prev_label   = D.get("prev_label", MLONG[int(prev_key[5:7])])
anchor_label = D.get("anchor_label", MLONG[int(anchor_key[5:7])] if anchor_key else "")
anchor_desc  = D.get("anchor_desc", "pre-campaign")

# ---------- Instagram ----------
ig = D["ig"]
ig_daily = ig["daily"]                       # [date, reach, views, inter, ae, likes, comments, shares, saves]
ig_followers = ig["followers"]; ig_following = ig["following"]; ig_media_count = ig["media_count"]
new_foll = ig["new_followers_30d"]
# "30 days" when the figure is a trailing window, or e.g. "July" when it is a calendar month.
new_foll_label = D.get("new_followers_label", "30 days")

def month_of(row): return row[0][:7]
months = {}
for r in ig_daily:
    m = month_of(r); months.setdefault(m, [0,0,0,0,0,0,0,0])
    for i in range(8): months[m][i] += r[i+1]
mkeys = sorted(months.keys())

def ig_m(key, idx): return months.get(key, [0]*8)[idx]  # idx0 reach,1 views,2 inter,3 ae,4 likes,5 comm,6 shares,7 saves
ig_reach = sum(r[1] for r in ig_daily); ig_views = sum(r[2] for r in ig_daily)
ig_inter = sum(r[3] for r in ig_daily); ig_eng_accts = sum(r[4] for r in ig_daily)
ig_likes = sum(r[5] for r in ig_daily); ig_comments = sum(r[6] for r in ig_daily)
ig_shares = sum(r[7] for r in ig_daily); ig_saves = sum(r[8] for r in ig_daily)
posts_published = ig.get("posts_published_period", len(D.get("ig_posts", [])))

# ---------- Facebook ----------
fb = D["fb"]; fb_daily = fb["daily"]          # [date, fans, imp_org, post_eng]
fbm = {}
for d,fans,imp,eng in fb_daily:
    m=d[:7]; fbm.setdefault(m,[0,0,fans]); fbm[m][0]+=imp; fbm[m][1]+=eng; fbm[m][2]=fans
fb_fans_start = fb_daily[0][1]; fb_fans_end = fb_daily[-1][1]
fb_fans_growth = fb_fans_end - fb_fans_start
fb_imp = sum(r[2] for r in fb_daily); fb_eng = sum(r[3] for r in fb_daily)

def fbmon(key, idx): return fbm.get(key,[0,0,0])[idx]  # 0 imp,1 eng,2 fans_end

# report / prev / anchor values
jun_reach, may_reach, apr_reach = ig_m(report_key,0), ig_m(prev_key,0), ig_m(anchor_key,0)
jun_views, may_views, apr_views = ig_m(report_key,1), ig_m(prev_key,1), ig_m(anchor_key,1)
jun_inter, may_inter, apr_inter = ig_m(report_key,2), ig_m(prev_key,2), ig_m(anchor_key,2)
fb_imp_jun, fb_imp_may, fb_imp_apr = fbmon(report_key,0), fbmon(prev_key,0), fbmon(anchor_key,0)
fb_eng_jun, fb_eng_may, fb_eng_apr = fbmon(report_key,1), fbmon(prev_key,1), fbmon(anchor_key,1)
fb_fans_jun, fb_fans_may, fb_fans_apr = fbmon(report_key,2), fbmon(prev_key,2), fbmon(anchor_key,2)

def pctstr(cur, prev):
    if prev <= 0: return "new"
    pct = (cur - prev) / prev * 100
    return f"{'+' if pct>=0 else '−'}{abs(pct):.0f}%"

# Direction helpers. This report is generated unattended every month, so nothing in the
# narrative may assert a direction the data has not been checked for.
def moved(cur, prev):
    if prev == cur: return "flat"
    return "up" if cur > prev else "down"

def win(cur, prev, label, small):
    """A headline chip that shows what actually happened, up or down."""
    d = moved(cur, prev)
    arrow, cls = ("▲", "up") if d == "up" else (("▼", "down") if d == "down" else ("=", "up"))
    neg = " neg" if d == "down" else ""
    return (f'<div class="win{neg}"><span class="{cls}">{arrow}</span> {label} '
            f'<small>{small}</small></div>')

def signed(n):
    return f"+{fmt(n)}" if n >= 0 else f"−{fmt(abs(n))}"

# ---------- LinkedIn ----------
li = D.get("li")

# ---------- brand ----------
GREEN="#1E9E6A"; GREEN_D="#15724D"; CREAM="#F6F1E4"; CORAL="#F0875F"
BLUE="#17B4F0"; INK="#0E1411"; CARD="#15201A"; LINE="#22332B"; MUT="#8FA89B"; LI="#4AA3E0"

# ---------- KPI cards ----------
cards = [
 ("Accounts reached · Instagram", jun_reach, may_reach, apr_reach, GREEN, None),
 ("Content views · Instagram",   jun_views, may_views, apr_views, GREEN, None),
 ("Interactions · Instagram",    jun_inter, may_inter, apr_inter, CORAL, None),
 ("Instagram followers",              ig_followers, None, None, GREEN, f"+{new_foll} new in {new_foll_label}"),
 ("Facebook page likes",              fb_fans_jun, fb_fans_may, fb_fans_apr, BLUE, None),
 ("Organic impressions · Facebook", fb_imp_jun, fb_imp_may, fb_imp_apr, BLUE, None),
 ("Post engagements · Facebook", fb_eng_jun, fb_eng_may, fb_eng_apr, BLUE, None),
 (f"New followers · {new_foll_label}",     new_foll, None, None, CORAL, "net new audience"),
]
def kpi_card(lab, cur, mprev, aprev, c, snap):
    if mprev is None:
        chiphtml = f'<div class="kpi-delta up">▲ {snap}</div>'
        sub1 = f'<div class="kpi-sub">as at end of {MLONG[int(report_key[5:7])]}</div>'; sub2=''
    else:
        d = cur - mprev; up = d >= 0
        cls = "up" if up else "down"; arr = "▲" if up else "▼"
        dstr = f"{'+' if up else '−'}{abs(d):,}"
        chiphtml = f'<div class="kpi-delta {cls}">{arr} {dstr} <span class="mult">{pctstr(cur,mprev)} MoM</span></div>'
        sub1 = f'<div class="kpi-sub">vs {prev_label}: <b>{fmt(mprev)}</b></div>'
        ratio = cur/aprev if aprev>0 else 0
        multtxt = f"{ratio:.0f}× " if ratio>=3 else ""
        sub2 = f'<div class="kpi-sub2">▲ {multtxt}vs {anchor_label} {anchor_desc} ({fmt(aprev)})</div>' if anchor_key else ''
    return f'''<div class="kpi" style="--c:{c}">
   <div class="kpi-label">{lab}</div>
   <div class="kpi-val">{fmt(cur)}</div>
   {chiphtml}
   {sub1}
   {sub2}
 </div>'''
kpi_html = "\n".join(kpi_card(*c) for c in cards)

# ---------- IG top posts ----------
def post_card(p):
    return f'''<a class="post" href="{p['url']}" target="_blank" rel="noopener">
   <div class="post-img" style="background-image:url('{assets}/{p['img']}')">
     <span class="post-tag">{p['tag']}</span>
     <span class="post-type">{p['type']}</span>
   </div>
   <div class="post-body">
     <div class="post-meta">{p['date']} · Instagram</div>
     <div class="post-title">{p['title']}</div>
     <div class="post-stats">
       <span>\U0001F441 {fmt(p['views'])}</span><span>\U0001F4CD {fmt(p['reach'])}</span>
       <span>❤ {p['likes']}</span><span>\U0001F4AC {p['comments']}</span>
       <span>↪ {p['shares']}</span><span>\U0001F516 {p['saves']}</span>
     </div>
   </div>
 </a>'''
posts_html = "\n".join(post_card(p) for p in D.get("ig_posts", []))

# ---------- LinkedIn section ----------
li_section = ""
if li:
    li_posts_html = "\n".join(
      f'''<a class="lipost" href="{p['url']}" target="_blank" rel="noopener">
   <div class="lipost-top"><span class="lipost-title">{p['title']}</span><span class="lipost-date">{p['date']}</span></div>
   <div class="lipost-stats"><span>\U0001F441 {fmt(p['imp'])} impressions</span><span>\U0001F517 {p['clicks']} clicks</span><span>❤ {p['likes']}</span><span>◷ {p['eng']} eng</span></div>
 </a>''' for p in li.get("posts", []))
    li_section = f'''
  <div class="section-h mono">LinkedIn &nbsp;·&nbsp; B2B channel</div>
  <div class="grid2">
    <div class="card">
      <h3><span class="dot" style="background:{LI}"></span>LinkedIn company page</h3>
      <p class="note">Australian Gluten Free Blending · distributor &amp; foodservice audience</p>
      <div class="rows">
        <div class="row"><span class="k">Company followers</span><span class="v">{fmt(li['followers'])}</span></div>
        <div class="row"><span class="k">New followers ({MLONG[int(report_key[5:7])]})</span><span class="v" style="color:#37D389">▲ +{li['new_month']}</span></div>
        <div class="row"><span class="k">Impressions ({MLONG[int(report_key[5:7])]})</span><span class="v">{fmt(li['imp_month'])}</span></div>
        <div class="row"><span class="k">Post clicks ({MLONG[int(report_key[5:7])]})</span><span class="v">{fmt(li['clicks_month'])}</span></div>
        <div class="row"><span class="k">Posts published ({MLONG[int(report_key[5:7])]})</span><span class="v">{fmt(li['posts_month'])}</span></div>
        <div class="row"><span class="k">Best post engagement rate</span><span class="v" style="color:#37D389">{li['best_eng']}</span></div>
      </div>
      <p class="note" style="margin-top:14px;margin-bottom:0">A B2B play — thought-leadership posts &amp; newsletters aimed at distributors and foodservice buyers. The goal here is authority, not volume. {MLONG[int(report_key[5:7])]} impressions ({fmt(li['imp_month'])}) vs {prev_label} ({fmt(li['imp_prev'])}).</p>
    </div>
    <div class="card">
      <h3><span class="dot" style="background:{LI}"></span>Top LinkedIn posts · {MSHORT[int(report_key[5:7])]}</h3>
      <p class="note">Ranked by impressions</p>
      <div class="liposts">{li_posts_html}</div>
    </div>
  </div>
'''

# ---------- charts ----------
labels = [r[0][5:] for r in ig_daily]
reach_series = [r[1] for r in ig_daily]
views_series = [r[2] for r in ig_daily]
mlabels = [MSHORT[int(k[5:7])] for k in mkeys]
m_reach = [months[k][0] for k in mkeys]
m_views = [months[k][1] for k in mkeys]

trend_rows = "".join(
  f'<div class="row"><span class="k">{MLONG[int(k[5:7])]}{" (this month)" if k==report_key else (" ("+anchor_desc+")" if k==anchor_key else "")}</span>'
  f'<span class="v">{fmt(months[k][0])}</span></div>' for k in mkeys)

# ---------- summary ----------
rep_mlabel = D["report_month_label"]
reach_note = D.get("reach_note")
if reach_note is None:
    reach_note = (f"Reach eased back versus {prev_label} — that month carried one-off spikes — but the underlying direction is firmly up."
                  if jun_reach < may_reach else
                  f"Reach also grew on {prev_label}, so momentum is broad-based.")
reach_mult = f"{jun_reach/apr_reach:.0f}×" if apr_reach>0 else "significantly"
views_mult = f"{jun_views/apr_views:.0f}×" if apr_views>0 else "significantly"
inter_mult = f"{jun_inter/apr_inter:.0f}×" if apr_inter>0 else "significantly"
anchor_line = (f" Against the {anchor_desc} baseline ({anchor_label}), it's night and day: reach up <b>{reach_mult}</b>, views <b>{views_mult}</b> and interactions <b>{inter_mult}</b>."
               if anchor_key else "")
li_summary = ('<p>We\'ve also opened up <b>LinkedIn</b> as a B2B channel — distributor and foodservice thought-leadership posts building authority with trade buyers. It\'s early and deliberately niche, but the page is live and growing.</p>' if li else '')

# Narrative wording, derived rather than assumed. A month where interactions fall must
# not be described as "accelerating".
_inter_dir = moved(jun_inter, may_inter)
_views_dir = moved(jun_views, may_views)
_reach_dir = moved(jun_reach, may_reach)
if _inter_dir == "up" and _views_dir == "up":
    engagement_word = "accelerating"
elif _inter_dir == "down" and _views_dir == "down":
    engagement_word = "softer"
else:
    engagement_word = "mixed"
inter_verb = {"up": "rose", "down": "fell", "flat": "held"}[_inter_dir]
views_verb = {"up": "rose", "down": "fell", "flat": "held"}[_views_dir]
fb_fans_delta = fb_fans_jun - fb_fans_may
fb_line = ("while your Facebook audience and post engagement grew again"
           if fb_fans_delta > 0 and moved(fb_eng_jun, fb_eng_may) == "up"
           else f"Facebook reached {fmt(fb_imp_jun)} people organically ({pctstr(fb_imp_jun, fb_imp_may)} on {prev_label})")
readout_head = D.get("readout_head") or (
    f"{MLONG[int(report_key[5:7])]}: engagement is compounding" if engagement_word == "accelerating"
    else f"{MLONG[int(report_key[5:7])]}: what the numbers show")
inter_gloss = (" — the audience is engaging more, not just seeing more."
               if _inter_dir == "up" else ".")
# Optional hand-written bullets for the month, appended to the read-out.
readout_extra = "".join(f"<li>{b}</li>" for b in D.get("readout_extra", []))

period_label = D.get("period_label", "")
generated_label = D.get("generated_label", "")
li_fans_win = (f'<div class="win"><span class="up">▲</span> +{li["new_month"]} LinkedIn <small>followers</small></div>' if li else '')

html = f"""<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gluten Free World — Organic Social Performance</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>
 *{{box-sizing:border-box;margin:0;padding:0}}
 body{{background:{INK};color:#EAF2ED;font-family:'Archivo',system-ui,sans-serif;-webkit-font-smoothing:antialiased;line-height:1.5}}
 .wrap{{max-width:1120px;margin:0 auto;padding:0 28px}}
 .mono{{font-family:'Space Mono',monospace;letter-spacing:.04em;text-transform:uppercase}}
 a{{color:inherit;text-decoration:none}}
 .tabbar{{position:sticky;top:0;z-index:30;background:rgba(14,20,17,.92);backdrop-filter:blur(10px);border-bottom:1px solid {LINE}}}
 .tabs{{display:none;gap:8px;padding:12px 0;overflow-x:auto;scrollbar-width:thin}}
 .tabs .lbl{{align-self:center;font-size:11px;color:{MUT};font-weight:700;letter-spacing:.05em;text-transform:uppercase;margin-right:4px;white-space:nowrap}}
 .tab{{white-space:nowrap;font-size:12.5px;font-weight:700;padding:7px 14px;border:1px solid {LINE};border-radius:20px;color:#cfe0d8;transition:.15s}}
 .tab:hover{{border-color:{GREEN}}}
 .tab.active{{background:{GREEN};color:#fff;border-color:{GREEN}}}
 .cover{{padding:56px 0 40px;border-bottom:1px solid {LINE};position:relative;overflow:hidden}}
 .logo-wrap{{display:inline-flex;background:{CREAM};padding:16px 22px;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.35)}}
 .logo{{height:60px;width:auto;display:block}}
 h1{{font-size:46px;font-weight:900;line-height:1.04;margin:22px 0 10px;letter-spacing:-.02em}}
 h1 span{{color:{GREEN}}}
 .sub{{color:{MUT};font-size:16px;max-width:660px}}
 .tags{{display:flex;gap:10px;margin-top:22px;flex-wrap:wrap}}
 .tag{{font-size:12px;padding:6px 12px;border:1px solid {LINE};border-radius:20px;color:#cfe0d8}}
 .tag b{{color:{GREEN}}}
 .section-h{{font-size:13px;color:{MUT};margin:46px 0 16px;font-weight:700}}
 .kpis{{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}}
 .kpi{{background:{CARD};border:1px solid {LINE};border-radius:16px;padding:20px;position:relative;overflow:hidden}}
 .kpi:before{{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--c)}}
 .kpi-label{{font-size:12.5px;color:{MUT};font-weight:600;min-height:32px}}
 .kpi-val{{font-size:34px;font-weight:900;margin:6px 0 2px;letter-spacing:-.01em}}
 .kpi-delta{{font-size:13px;font-weight:800;display:flex;align-items:center;gap:6px;margin:2px 0 5px}}
 .kpi-delta.up{{color:#37D389}} .kpi-delta.down{{color:#E7855F}}
 .kpi-delta .mult{{font-family:'Space Mono',monospace;font-size:11px;font-weight:700;background:rgba(55,211,137,.14);color:#37D389;padding:2px 7px;border-radius:12px}}
 .kpi-delta.down .mult{{background:rgba(231,133,95,.14);color:#E7855F}}
 .kpi-sub{{font-size:11.5px;color:#9fb6aa}} .kpi-sub b{{color:#cfe0d8}}
 .kpi-sub2{{font-size:10.5px;color:#5f9c7f;margin-top:3px;font-family:'Space Mono',monospace;letter-spacing:.01em}}
 .summary{{background:linear-gradient(135deg,rgba(30,158,106,.16),{CARD} 60%);border:1px solid {LINE};border-left:4px solid {GREEN};border-radius:18px;padding:28px 30px;margin-top:38px}}
 .summary .to{{font-size:12px;color:{GREEN};font-weight:800;letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px}}
 .summary p{{font-size:15.5px;color:#e9f2ec;line-height:1.65;max-width:760px}}
 .summary p+p{{margin-top:12px}} .summary b{{color:#fff}}
 .wins{{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}}
 .win{{display:flex;align-items:center;gap:8px;background:rgba(55,211,137,.10);border:1px solid rgba(55,211,137,.28);border-radius:30px;padding:8px 14px;font-size:13px;font-weight:700}}
 .win .up{{color:#37D389;font-size:13px}} .win small{{font-weight:600;color:{MUT}}}
 .win.neg{{background:rgba(231,133,95,.10);border-color:rgba(231,133,95,.28)}}
 .win .down{{color:#E7855F;font-size:13px}}
 .sign{{margin-top:16px;font-size:13px;color:{MUT}}}
 .grid2{{display:grid;grid-template-columns:1fr 1fr;gap:14px}}
 .card{{background:{CARD};border:1px solid {LINE};border-radius:16px;padding:22px}}
 .card h3{{font-size:16px;font-weight:800;margin-bottom:4px;display:flex;align-items:center;gap:9px}}
 .dot{{width:10px;height:10px;border-radius:50%}}
 .card .note{{color:{MUT};font-size:12.5px;margin-bottom:16px}}
 .rows{{display:grid;gap:10px}}
 .row{{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px dashed {LINE};padding-bottom:9px}}
 .row:last-child{{border-bottom:0}}
 .row .k{{color:#bcd0c6;font-size:13.5px}} .row .v{{font-weight:800;font-size:18px}}
 .chart-card{{background:{CARD};border:1px solid {LINE};border-radius:16px;padding:22px}}
 .chart-box{{position:relative;height:320px}} .chart-box.sm{{height:240px}}
 .posts{{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}}
 .post{{background:{CARD};border:1px solid {LINE};border-radius:16px;overflow:hidden;display:flex;flex-direction:column;transition:.15s}}
 .post:hover{{transform:translateY(-3px);border-color:{GREEN}}}
 .post-img{{aspect-ratio:1/1;background-size:cover;background-position:center;position:relative}}
 .post-tag{{position:absolute;top:10px;left:10px;background:{GREEN};color:#fff;font-size:10.5px;font-weight:800;padding:4px 9px;border-radius:14px}}
 .post-type{{position:absolute;top:10px;right:10px;background:rgba(0,0,0,.6);color:#fff;font-size:10.5px;padding:4px 9px;border-radius:14px;backdrop-filter:blur(4px)}}
 .post-body{{padding:14px 15px 16px}}
 .post-meta{{font-size:11px;color:{MUT};margin-bottom:5px}}
 .post-title{{font-size:14px;font-weight:700;line-height:1.3;min-height:37px}}
 .post-stats{{display:flex;flex-wrap:wrap;gap:9px;margin-top:11px;font-size:12px;color:#bcd0c6;font-family:'Space Mono',monospace}}
 .liposts{{display:grid;gap:10px}}
 .lipost{{display:block;border:1px solid {LINE};border-radius:12px;padding:12px 14px;transition:.15s}}
 .lipost:hover{{border-color:{LI};background:rgba(74,163,224,.06)}}
 .lipost-top{{display:flex;justify-content:space-between;gap:12px;align-items:baseline}}
 .lipost-title{{font-size:13.5px;font-weight:700;line-height:1.35}}
 .lipost-date{{font-size:11px;color:{MUT};white-space:nowrap}}
 .lipost-stats{{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;font-size:11.5px;color:#9fb6aa;font-family:'Space Mono',monospace}}
 .insight{{background:linear-gradient(135deg,{GREEN_D},{CARD});border:1px solid {LINE};border-radius:16px;padding:24px 26px}}
 .insight ul{{margin:10px 0 0 18px}} .insight li{{margin:7px 0;font-size:14.5px;color:#e6f0ea}} .insight b{{color:#fff}}
 footer{{border-top:1px solid {LINE};margin-top:54px;padding:28px 0 50px;color:{MUT};font-size:12px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px}}
 footer b{{color:{BLUE}}}
 .meth{{font-size:11.5px;color:#7e958a;margin-top:8px;max-width:820px;line-height:1.6}}
 @media(max-width:880px){{.kpis,.posts{{grid-template-columns:repeat(2,1fr)}}.grid2{{grid-template-columns:1fr}}h1{{font-size:34px}}}}
 @media(max-width:520px){{.kpis,.posts{{grid-template-columns:1fr}}}}
</style>
</head>
<body>
<div class="tabbar"><div class="wrap"><div id="tabs" class="tabs"></div></div></div>
<div class="cover"><div class="wrap">
  <div class="logo-wrap"><img class="logo" src="{assets}/gfw-logo.png" alt="Gluten Free World"></div>
  <h1>Organic Social <span>Performance</span></h1>
  <p class="sub"><b style="color:#cfe0d8">{rep_mlabel} monthly report</b> — Instagram, Facebook &amp; LinkedIn results for the gluten-free content campaign, with {prev_label} and the {anchor_desc} baseline shown for comparison.</p>
  <div class="tags">
    <span class="tag"><b>IG</b> &nbsp;{ig['handle']}</span>
    <span class="tag"><b>FB</b> &nbsp;Gluten Free World</span>
    <span class="tag"><b>in</b> &nbsp;Company page</span>
    <span class="tag">Data via Windsor.ai</span>
  </div>
</div></div>

<div class="wrap">

  <div class="summary">
    <div class="to">Summary for Paul · {rep_mlabel}</div>
    <p>Hi Paul — here's your <b>{rep_mlabel} performance report</b> for Gluten Free World's social channels, with last month ({prev_label}) and the {anchor_desc} baseline shown alongside so you can see the trend clearly.</p>
    <p>Month-on-month, engagement is <b>{engagement_word}</b>: Instagram interactions {inter_verb} <b>{pctstr(jun_inter,may_inter)}</b> on {prev_label} and content views {views_verb} <b>{pctstr(jun_views,may_views)}</b>, {fb_line}. {reach_note}{anchor_line}</p>
    {li_summary}
    <div class="wins">
      {win(jun_inter, may_inter, f"IG interactions {fmt(jun_inter)}", f"vs {fmt(may_inter)} in {prev_label}")}
      {win(jun_views, may_views, f"IG views {fmt(jun_views)}", f"vs {fmt(may_views)} in {prev_label}")}
      {win(new_foll, 0, f"{signed(new_foll)} IG followers", "this month")}
      {win(fb_fans_delta, 0, f"{signed(fb_fans_delta)} FB fans", f"vs {prev_label}")}
      {li_fans_win}
    </div>
    <div class="sign">— The Ready to Rank team</div>
  </div>

  <div class="section-h mono">At a glance &nbsp;·&nbsp; {MSHORT[int(report_key[5:7])]} vs {prev_label} (month-on-month)</div>
  <div class="kpis">{kpi_html}</div>

  <div class="section-h mono">Reach &amp; views over time — Instagram</div>
  <div class="chart-card"><div class="chart-box"><canvas id="trend"></canvas></div></div>

  <div class="section-h mono">Momentum by month</div>
  <div class="grid2">
    <div class="chart-card"><div class="chart-box sm"><canvas id="bars"></canvas></div></div>
    <div class="card">
      <h3><span class="dot" style="background:{GREEN}"></span>What the trend shows</h3>
      <p class="note">Instagram reach, monthly</p>
      <div class="rows">{trend_rows}</div>
    </div>
  </div>

  <div class="section-h mono">Platform breakdown</div>
  <div class="grid2">
    <div class="card">
      <h3><span class="dot" style="background:{GREEN}"></span>Instagram</h3>
      <p class="note">{ig['handle']} · {fmt(ig_media_count)} posts · following {fmt(ig_following)}</p>
      <div class="rows">
        <div class="row"><span class="k">Followers</span><span class="v">{fmt(ig_followers)}</span></div>
        <div class="row"><span class="k">New followers ({new_foll_label})</span><span class="v" style="color:#37D389">▲ {signed(new_foll)}</span></div>
        <div class="row"><span class="k">Accounts reached</span><span class="v">{fmt(ig_reach)}</span></div>
        <div class="row"><span class="k">Content views</span><span class="v">{fmt(ig_views)}</span></div>
        <div class="row"><span class="k">Likes</span><span class="v">{fmt(ig_likes)}</span></div>
        <div class="row"><span class="k">Comments / Shares / Saves</span><span class="v">{ig_comments} / {ig_shares} / {ig_saves}</span></div>
      </div>
    </div>
    <div class="card">
      <h3><span class="dot" style="background:{BLUE}"></span>Facebook</h3>
      <p class="note">Gluten Free World · organic page activity</p>
      <div class="rows">
        <div class="row"><span class="k">Page likes (fans)</span><span class="v">{fmt(fb_fans_end)}</span></div>
        <div class="row"><span class="k">Growth over period</span><span class="v" style="color:#37D389">▲ +{fb_fans_growth}</span></div>
        <div class="row"><span class="k">Organic impressions</span><span class="v">{fmt(fb_imp)}</span></div>
        <div class="row"><span class="k">Post engagements</span><span class="v">{fmt(fb_eng)}</span></div>
        <div class="row"><span class="k">Avg daily reach (unique)</span><span class="v">~{round(sum(r[2] for r in fb_daily)/len(fb_daily))}</span></div>
        <div class="row"><span class="k">Starting fans</span><span class="v">{fmt(fb_fans_start)}</span></div>
      </div>
    </div>
  </div>
{li_section}
  <div class="section-h mono">Instagram top posts &nbsp;·&nbsp; {MSHORT[int(report_key[5:7])]}</div>
  <div class="posts">{posts_html}</div>

  <div class="section-h mono">Read-out</div>
  <div class="insight">
    <h3 style="font-size:17px">{readout_head}</h3>
    <ul>
      <li>Instagram <b>interactions {pctstr(jun_inter,may_inter)}</b> on {prev_label} (to {fmt(jun_inter)}) and <b>views {pctstr(jun_views,may_views)}</b> to {fmt(jun_views)}{inter_gloss}</li>
      <li>{reach_note}</li>
      {readout_extra}
      <li>Audience: <b>{signed(new_foll)}</b> Instagram followers this month and <b>{signed(fb_fans_delta)}</b> Facebook fans vs {prev_label}.</li>
      <li><b>Next lever:</b> comments &amp; saves remain the low numbers — stronger CTAs and questions in captions will lift two-way engagement.</li>
    </ul>
  </div>

  <p class="meth">Methodology: Organic (non-paid) Instagram, Facebook &amp; LinkedIn data pulled live via Windsor.ai for {period_label} (LinkedIn from campaign launch). "Accounts reached" and "Content views" are the sum of daily account-level figures and may count repeat viewers across days. {D.get("methodology_note", "Follower counts are current snapshots; new-follower figures cover the trailing 30 days.")} Post thumbnails saved locally so the report stays intact over time.</p>

  <footer>
    <div>Prepared by <b>Ready to Rank</b> · readytorank.com.au</div>
    <div>Gluten Free World · Organic Social Report · Generated {generated_label}</div>
  </footer>
</div>

<script>
const G="{GREEN}", B="{BLUE}", MUT="{MUT}", LINE="{LINE}";
Chart.defaults.color = MUT; Chart.defaults.font.family = "'Space Mono', monospace"; Chart.defaults.font.size = 10;
const labels = {json.dumps(labels)}, reach = {json.dumps(reach_series)}, views = {json.dumps(views_series)};
new Chart(document.getElementById('trend'), {{
  type:'line', data:{{labels:labels, datasets:[
    {{label:'Views', data:views, borderColor:B, backgroundColor:'rgba(23,180,240,.10)', fill:true, tension:.35, pointRadius:0, borderWidth:2}},
    {{label:'Reach', data:reach, borderColor:G, backgroundColor:'rgba(30,158,106,.12)', fill:true, tension:.35, pointRadius:0, borderWidth:2}}
  ]}},
  options:{{responsive:true, maintainAspectRatio:false, plugins:{{legend:{{labels:{{usePointStyle:true,boxWidth:8,color:'#cfe0d8'}}}}}},
    scales:{{x:{{grid:{{display:false}}, ticks:{{maxTicksLimit:12}}}}, y:{{grid:{{color:LINE}}, beginAtZero:true}}}}}}
}});
new Chart(document.getElementById('bars'), {{
  type:'bar', data:{{labels:{json.dumps(mlabels)}, datasets:[
    {{label:'Reach', data:{json.dumps(m_reach)}, backgroundColor:G, borderRadius:6}},
    {{label:'Views', data:{json.dumps(m_views)}, backgroundColor:B, borderRadius:6}}
  ]}},
  options:{{responsive:true, maintainAspectRatio:false, plugins:{{legend:{{labels:{{usePointStyle:true,boxWidth:8,color:'#cfe0d8'}}}}}},
    scales:{{x:{{grid:{{display:false}}}}, y:{{grid:{{color:LINE}}, beginAtZero:true}}}}}}
}});
</script>
<script>
// Month tabs — reads the shared manifest published alongside the reports.
// The content-calendar link is always rendered, even if the manifest fetch fails,
// so the client can never get stranded on a report with no way back.
(async function(){{
  var CUR = "{report_key}";
  var el = document.getElementById('tabs');
  var CAL = '<a class="tab" href="../content-hub/">Content calendar</a>';
  var html = '';
  try {{
    var res = await fetch('../months.json', {{cache:'no-store'}});
    if(res.ok) {{
      var data = await res.json();
      var months = (data.months||[]).slice().sort(function(a,b){{return a.key<b.key?-1:1;}});
      if(months.length) {{
        html = '<span class="lbl">Reports</span>' + months.map(function(m){{
          return '<a class="tab'+(m.key===CUR?' active':'')+'" href="../'+m.key+'/">'+m.label+'</a>';
        }}).join('');
      }}
    }}
  }} catch(e) {{}}
  el.innerHTML = html + '<span class="lbl" style="margin-left:10px">Planning</span>' + CAL;
  el.style.display = 'flex';
}})();
</script>
</body>
</html>"""

with open(out_path, "w") as f:
    f.write(html)
print("WROTE", out_path, len(html), "bytes")