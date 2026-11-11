# CNS Locksmiths page writer notes

Captured 11/11/2026 from the live site (WordPress, Themeco Pro / Cornerstone). Two layouts:

| Layout | Use for | Source URL | Skeleton |
|---|---|---|---|
| Location | "Locksmith Croydon", "Locksmith Ringwood", "Locksmith Bayswater" and other suburb rebuilds | https://cnslocksmiths.com/locksmith-ringwood/ (same template on /locksmith-croydon/) | skeleton_location.html |
| Service | "Commercial Door Lock Repair", "House Door Lock Repair" and other new service pages | https://cnslocksmiths.com/locksmith-change-locks/ (same template on /commercial-locksmith/) | skeleton_service.html |

The location pages were written by a previous agency and are being rebuilt at the same URL. Do not copy their body text. Copy only the design and the fixed blocks. The Ringwood and Croydon body copy is shown here only for structure.

Rendering: the body goes inside `.pgframe` after page_css, between page_header.html and page_footer.html. The hero is `<section class="pg-hero cn-hero">`. All classes use the `cn-` prefix. No inline styles. Exactly one `<h1>`, in the hero. Everything outside `{{ }}` in a skeleton is fixed and must be kept as is.

## Voice and rules
- Australian English. No em or en dashes anywhere (use commas, full stops or "to"). No Oxford comma.
- First person plural or "Scott" in third person, as the live pages do ("Call Scott", "Scott will talk you through it"). Scott is the owner and the only locksmith. Never say "our team" or "our technicians".
- Plain, friendly and direct. Short paragraphs (1 to 3 sentences). Bold one key phrase in some intro paragraphs with `<strong>`, as live.
- Only use facts from the list below. Do not invent response times, prices, years, brands, warranties, job stories, reviews or reviewer names.

## Location layout, section by section (target 1,100 to 1,500 words of body copy)
1. **Hero** (`cn-hero`): H1 is exactly the keyword, "Locksmith [Suburb]". Lead line 12 to 25 words; the live line is "Your Local Mobile Locksmith – 20 min Fast Response Service! Servicing all Eastern Suburb areas within Melbourne VIC". Reuse it with the dash swapped for a comma (as in sample.html), or adapt it. Button "Call Scott Now - 0414 226 515" is fixed.
2. **Reviews strip** (`cn-revs`): fixed.
3. **Service button grid** (`cn-svcbtns`, desktop only): fixed, 15 live service URLs.
4. **Split 1** (`cn-split`, photo left, copy right, grey to white gradient):
   - H2 "Locksmith [Suburb] | Local 24/7 Locksmith" pattern.
   - Intro hook starting "Need a locksmith in [Suburb]?" (35 to 50 words), who Scott helps (25 to 40), owner-operated line (25 to 40), fixed call line, fixed six-point checklist (only the second point changes: "Based locally in Croydon" for Croydon, "Based in nearby Croydon" elsewhere).
   - H2 "A locksmith who regularly works in [Suburb]" plus 3 short paragraphs (100 to 150 words), linking 1 to 2 neighbouring suburb pages.
   - H2 "Emergency Locksmith [Suburb]", H4 short call line, lead-in, list of 6 to 9 emergency situations, mobile van line, fixed "If you're locked out in [Suburb], call 0414 226 515" line.
5. **Contact Us 24/7 card** (`cn-contact`): fixed.
6. **Split 2** (`cn-split cn-tint`, copy left, photo right, pale blue): H2 services with 5 H3 sub-services (30 to 60 words each); optional "Real [Suburb] jobs" block only if the client has supplied real jobs or quotes; H2 "Why [Suburb] customers choose CNS Locksmiths" with 6 H3 reasons; H2 "Common reasons [Suburb] customers call a locksmith" with an 8 to 11 item list; H2 "Locksmith [Suburb] and surrounding suburbs" with 8 to 13 linked suburbs; H2 "Frequently Asked Questions" with 4 to 6 H3 questions and P answers (25 to 50 words each); closing H2 "Need a locksmith in [Suburb]?" with 2 paragraphs and the fixed call line.
7. **Mobile service list** (`cn-svclist`, phone view only), **Certified card** (`cn-cert`), **Why choose testimonials** (`cn-why`): fixed. The three testimonials are real reviews quoted verbatim from the live page; do not edit their spelling.
8. **Map and photos** (`cn-local`): map iframe query "[Suburb]+Victoria+Australia". Blurb is 1 to 2 sentences of plain geography (20 to 35 words). Only state a distance if the client's own page states it (Croydon: "around 28km east of the CBD"; Ringwood: "approximately 29 km east of Melbourne's Central Business District"). Otherwise describe it without a number, e.g. "a suburb in Melbourne's outer east".
9. **CTA band** (`cn-band`): fixed.

## Service layout, section by section (target 700 to 1,000 words of body copy)
1. **Hero**: H1 is the service keyword (e.g. "Commercial Door Lock Repair"). Lead one line, 6 to 12 words (live: "24/7 Residential Locksmiths – Fast, Reliable, Local"; write it without the dash).
2. **Split 1** (photo left): H2 "[Service] Melbourne | Fast & Reliable Service" pattern, bold hook question, 2 paragraphs, fixed call line, tick list (`ul.cn-ticks`) of 4 to 5 proof points from the facts list, H2 service overview with a short list of property or door types.
3. **Contact Us 24/7 card**: fixed.
4. **Split 2** (photo right, pale blue): H2 signs or causes + list; H2 what Scott repairs or installs + "This includes:" list; H2 comparison (e.g. repair versus replace) with two bold terms; H2 emergency section with the fixed call line; H2 "Why Choose CNS Locksmiths?" with a 5 point list; H2 "Areas We Service" with 8 linked suburbs; closing H2 with the fixed call and quote lines.
5. **Certified card**, **reviews strip**, **Why choose testimonials**, **map and lock photos**, **Melbourne's Best Rated Locksmith** (static copy of the live Google review widget): fixed.
6. **FAQs** (`cn-faq`): 4 to 5 `<details><summary>` questions about this service, answers 25 to 50 words. First one has `open`. "View All" button is fixed. (Live service pages show a generic global FAQ block here; on new pages it carries page-specific questions.)
7. **CTA band**: fixed.

Eastern Melbourne focus: the new service pages should speak to Melbourne's eastern suburbs and link suburbs from the list below. For "Commercial Door Lock Repair" link https://cnslocksmiths.com/commercial-locksmith/ ; for "House Door Lock Repair" link https://cnslocksmiths.com/residential-locksmith/ .

## Internal link pattern
- Service pages: https://cnslocksmiths.com/[slug]/ (residential-locksmith, commercial-locksmith, automotive-locksmith, emergency-locksmith, 24-hour-locksmith, after-hours-locksmith, mobile-locksmith, locksmith-change-locks, locked-out-of-house, unlock-my-door, local-locksmith, locksmith-near-me).
- Hub page: https://cnslocksmiths.com/eastern-suburbs-locksmith/ (anchor "eastern suburbs" or "Eastern Suburbs").
- Contact: https://cnslocksmiths.com/contact-us/ (anchor "request a quote"). FAQs: https://cnslocksmiths.com/faqs/
- Suburb pages: https://cnslocksmiths.com/locksmith-[suburb]/ . Confirmed live slugs near Croydon: croydon, croydon-north, croydon-hills, ringwood, ringwood-east, ringwood-north, heathmont, bayswater, bayswater-north, boronia, kilsyth, kilsyth-south, mooroolbark, montrose, warranwood, chirnside-park, lilydale, mitcham, donvale, wantirna, wantirna-south, ferntree-gully, upper-ferntree-gully, rowville, knoxfield, scoresby, the-basin, vermont, vermont-south, nunawading, wonga-park, park-orchards. Only link slugs in this list (the full list is in https://cnslocksmiths.com/locations-sitemap.xml).
- Phone always as `<a href="tel:0414226515">0414 226 515</a>`.

## Facts on the client's own site (reuse only these, verbatim where quoted)
| Fact | Where it appears |
|---|---|
| Phone "0414 226 515" | Header, every page; https://cnslocksmiths.com/locksmith-ringwood/ |
| Email "cnslocksmiths@gmail.com" | Footer, every page |
| "Croydon, Victoria, Australia"; "based in Croydon 3136" | Footer; https://cnslocksmiths.com/locksmith-croydon/ |
| "ABN: 77 652 749 881" | Footer |
| "24 hr emergency service" | Header button |
| "Private Security Individual Registration Victoria: 927-166-61S" | Certified card, /locksmith-ringwood/ and /locksmith-change-locks/ |
| "Working with Children Check: 1007969A-01" | Certified card, same pages |
| "20 Million Public Liability Insurance Cover" | Certified card, same pages |
| "Security licensed and insured"; "Scott holds the required Victorian security licence" | /locksmith-ringwood/ |
| "Licensed by Vic Police"; "RACV approved contractor • Security licensed • Available 24/7" | https://cnslocksmiths.com/ |
| "more than 15 years of experience"; "15+ YEARS" | https://cnslocksmiths.com/ |
| "family-run mobile locksmith" | /locksmith-ringwood/, /locksmith-croydon/ |
| Owner Scott Linnell (page /scott-linnell/); "Owner-operated", "no call centre and no subcontractor" | /locksmith-ringwood/, nav |
| "260+ genuine 5-star Google reviews"; footer "5.0, 260+ Google Reviews"; home "5.0★ FROM 260+ GOOGLE REVIEWS" | /locksmith-ringwood/, footer, home |
| "300+ 5 star reviews across" Google 210, True Local 6, Facebook 26, Yellow Pages 6, hipages 12 | Reviews strip, every page |
| "Your Local Mobile Locksmith – 20 min Fast Response Service!" | Location hero, /locksmith-ringwood/ |
| "Fast response times (often same day or 20–30 mins for urgent jobs)"; "In many cases, we can attend within 20–30 minutes, depending on your location" | /locksmith-change-locks/ |
| "fully equipped mobile locksmith vehicle"; "master key systems" | /locksmith-ringwood/ |
| "Residential, Commercial & Automotive Locksmith | 24/7 Emergency" | CTA band, every page |
| Croydon "around 28km east of the CBD"; Ringwood "approximately 29 km east of Melbourne's Central Business District" | /locksmith-croydon/, /locksmith-ringwood/ |

When reusing a dashed phrase, rewrite it without the dash (e.g. "20 to 30 minutes").

## Avoid
- Copying the previous agency's body text from the location pages.
- Review counts other than the ones above, and mixing them in one sentence. Prefer "260+ genuine 5-star Google reviews".
- Promising a fixed arrival time. Say response depends on where Scott is, or use the 20 to 30 minutes wording with "in many cases".
- Prices, brands, warranties, "cheapest", "guaranteed", and invented testimonials or local job stories.
- Inline styles, extra `<h1>`s, and new classes not in page_css.css.
