# Gluten Free World — Monthly Social Report Playbook

Run automatically each month by the scheduled Routine
**"GFW — monthly organic social report"**. This file is the single source of truth for how
the report is produced. Follow it top to bottom.

Everything the run needs lives in this repo (`JMC-R2R.github.io`), because the Routine gets a
cloud checkout of the repo and nothing else. Do not move these scripts back to Dropbox.

## When it runs
Fires on the **1st of each month** (cron `7 1 1 * *` UTC, which is 11:07am Melbourne in AEST
and 12:07pm in AEDT — both land on the 1st). The report covers the **month that just closed**,
so `report_month` = the *previous* calendar month.

This used to run on the last day of the month, which meant the final day of data was still
settling. That was not theoretical: the June 2026 report published 660 LinkedIn impressions
when the true June figure was 697, because 30 June had not landed yet. Running on the 1st
fixes it. Do not move it back.

## What we produce
A branded HTML dashboard covering **organic** Instagram, Facebook and LinkedIn for the closed
month, compared month-on-month against the month before, with April 2026 (pre-campaign) kept
as a baseline anchor. Client contact is **Paul**.

- Working output: `_automation/gluten-free-world/build/<YYYY-MM>/index.html` + `assets/`
- Published to: `gluten-free-world/<YYYY-MM>/` (served at update.readytorank.com.au)
- **Never send to the client.** Publishing plus the Slack post is the internal handoff.
  Jose decides when to share the link with Paul.

## Windsor.ai sources (connector → account id)
- Instagram: `instagram` → `17841455937062934` (glutenfreeworld_au)
- Facebook organic: `facebook_organic` → `110423245195288` (Gluten Free World)
- LinkedIn organic: `linkedin_organic` → `107516022` (Australian Gluten Free Blending)

If Windsor.ai is not available in the run, **STOP**. Post to Slack that the report needs to be
run manually and exit. Never fabricate, estimate or carry forward a number.

## Step 1 — Determine the reporting window
- `report_month` = the month **before** today (run on 01/09 → report_month = 2026-08).
- `prev_month` = the month before that.
- `anchor_month` = `2026-04` fixed, label "April", desc "pre-campaign".
- Pull daily data from **2026-03-01 to the last day of report_month** so the trend chart keeps
  its full history. `date_preset` "last_Xm" returns whole months only, so always use explicit
  `date_from` / `date_to`.

## Step 2 — Pull the data (Windsor `get_data`)
Instagram daily: `date, reach, views, accounts_engaged, likes, comments, shares, saves, total_interactions`
  → store as `[date, reach, views, total_interactions, accounts_engaged, likes, comments, shares, saves]`
Instagram posts (report month): `timestamp, media_caption, media_permalink, media_type, media_product_type, media_reach, media_engagement, media_like_count, media_comments_count, media_saved, media_shares, media_views, media_url, media_thumbnail_url`
Facebook daily: `date, page_fans, page_impressions_organic, page_post_engagements`
LinkedIn daily: `date, account_analytics_impression_count, account_analytics_click_count, account_analytics_like_count, account_analytics_comment_count, followers_gain_organic, organization_follower_count`
LinkedIn posts (report month): `share_published_time, share_text, share_url, share_impression_count, share_like_count, share_comment_count, share_clicks_count, share_engagement_rate`

**Pull the full daily history fresh every month. Do not splice the new month onto the previous
month's data file.** Windsor restates: in August 2026 the whole `page_fans` series had moved
down by 1 against what the June file recorded, and splicing would have put a false step in the
Facebook chart.

### Instagram follower counts — read this before filling the snapshot
- `followers_count` / `follows_count` / `media_count` only ever return **today's** snapshot.
  There is no history.
- `follower_count` (daily gains) is only served for the **trailing 30 days, excluding today**.

Running on the 1st means today's snapshot *is* the end-of-month figure, so just use it and set
`new_followers_label` to the month name. Only if the run is late (as the July 2026 catch-up
was, on 10 August) do you have to reconstruct: take today's total, subtract the daily gains
since the month ended, and record exactly how you did it in `methodology_note`.

## Step 3 — Top posts and images
- **Instagram:** pick the 6 best report-month posts by reach, keeping a mix of formats
  (do not ship six reels). Download each into the month's `assets/` with
  `curl -A "Mozilla/5.0"`. Use `media_url` for IMAGE and CAROUSEL, `media_thumbnail_url` for
  REELS. Instagram sometimes blocks reel thumbnails and returns a ~22 byte file: **verify each
  download is a real JPEG** (>1KB and starts with `FF D8 FF`) and swap in the next best post if
  not. Copy `gfw-logo.png` across from the previous month's assets.
- Posts often have a null or hashtag-only caption, and several are reshares of stockist or
  creator content. **Look at the downloaded image before titling it.** Do not invent a title
  from the filename.
- **LinkedIn:** top 3 to 4 posts by impressions. They render as text rows, no thumbnails. Give
  each a short human title taken from the first line of `share_text`.

## Step 4 — Build the data file
Copy the previous month's `data-<YYYY-MM>.json` as a shape reference and fill it for the new
month. Save as `_automation/gluten-free-world/data-<report_month>.json`.

Fields worth knowing:
- `reach_note` — one honest line on the reach movement, up or down.
- `readout_extra` — a list of extra read-out bullets. This is where the month's real story
  goes. Explain anomalies rather than hiding them.
- `readout_head` — optional override for the read-out heading.
- `new_followers_label` — "August", or "30 days" if the figure really is a trailing window.
- `methodology_note` — overrides the default follower-methodology sentence.

## Step 5 — Render
```
cd _automation/gluten-free-world
python3 build_report.py data-<report_month>.json build/<report_month>/index.html assets
```
The generator computes every comparison, card, arrow, chart and the narrative. It is
direction-aware: a month where interactions fall is described as "softer" or "mixed", never as
"accelerating". **Do not hand-edit the HTML** and do not reintroduce fixed upward wording.

## Step 6 — Publish
```
cd _automation/gluten-free-world
python3 publish.py <report_month> "<Month YYYY>" \
  build/<report_month>/index.html build/<report_month>/assets
```
This copies the page into `gluten-free-world/<report_month>/`, updates the shared `months.json`
manifest and the root redirect so `/gluten-free-world/` always shows the latest month, then
commits and pushes.

`publish.py` stages **only the files the run produced** and its commit is path-scoped, so work
another session left staged in this repo cannot ride along. It prints anything it deliberately
left alone. Never widen it back to `git add gluten-free-world`.

- Live month: `https://update.readytorank.com.au/gluten-free-world/<report_month>/`
- Latest (what the client opens): `https://update.readytorank.com.au/gluten-free-world/`

Poll the live URL afterwards. GitHub Pages takes roughly 45 to 60 seconds to rebuild.

## Step 7 — Notify (internal only)
Post to Slack **#social-gluten-free-world** (`C0BCT2EPTB3`), tagging Jose (`<@U045BFTTTM4>`)
and Jen (`<@U06REHXMYJD>`):

- one line on what the month did, with the two or three numbers that matter
- anything that needs a human decision
- the live URL

**Never message or email Paul or anyone else at the client.** The Slack post is the handoff.

## House rules
- Australian English. DD/MM dates. AUD.
- Brand: Ready to Rank house style (Archivo + Space Mono, near-black, green #1E9E6A /
  blue #17B4F0), GFW logo on a cream plate. All handled by `build_report.py`.
- Never invent a figure. If a source is empty or down, say so in Slack and stop.
