## HOW TO WRITE EVERY PAGE (Jhen 12/11/2026, overrides any fixed heading or opener below)
The design is fixed. The words are written fresh for this page's keyword, never one page with the suburb or service name swapped.
1. Target the keyword: it goes in the H1, one H2, the meta title and meta description, and early in the opening paragraph in a form that reads naturally. Never bend a sentence to force the exact phrase in. Don't stuff it.
2. Write for the reader: answer what someone searching that keyword actually needs to know, in plain language, so it feels relatable.
3. Let the expertise show through the information, not by talking about it. Explain the service or the local situation clearly and directly (what usually goes wrong, why, what the fix or the visit involves, what to expect). Don't list or boast about licences, years of experience, reviews or credentials in the copy; fixed blocks already show those. No sales talk. Only facts from the facts list.
4. Unique: headings, opening, lists and FAQs are written for this page. Don't reuse wording from the client's other pages (read them first: select html from ch_item_articles where client_id = this client), and avoid stock openers like "Need a [service] in [Suburb]?".
5. Never invent local facts, streets, distances, prices or stories. If you're not sure, leave it out.
6. Direct and plain: short sentences, the useful information first.

# Aquasonic Plumbing & Gas: page writer notes

Captured 27/11/2026 from the live site, aquasonicpg.com.au (custom WordPress theme, Flynt). Jhen: the template comes from their live site. Two layouts:

| Layout | Use for | Source URL | Skeleton |
|---|---|---|---|
| Service | New service pages: "24/7 Emergency Plumber Mandurah", "Plumbing for Property Managers in Mandurah" and any later service page | https://aquasonicpg.com.au/services/hot-water-installations/ (same design on every /services/ page) | skeleton_service.html |
| Location | Suburb and town pages: "Plumber Mandurah", "Plumber Halls Head", "Plumber Bunbury" and the rest of the plan | https://aquasonicpg.com.au/areas-we-service/halls-head-city-of-mandurah/ (design only) | skeleton_location.html |

**The location design is copied, the words never are.** The site's 129 /areas-we-service/ pages are one page with the suburb name swapped, and some say false things ("our Armadale-based crew"). That is the problem the website audit flags (27/11/2026). Do not copy, paraphrase or reuse their body text. The location skeleton adds sections the live pages do not have (intro, common jobs, local and FAQs) so each page carries real, page-specific writing.

Rendering: the body goes inside `.pgframe` after page_css, between page_header.html and page_footer.html. The hero is `<section class="pg-hero aq-sec ...">`. All classes use the `aq-` prefix, every section carries `aq-sec`. No inline styles. Exactly one `<h1>`, in the hero. Everything outside `{{ }}` is fixed and must be kept as is. Headings display in capitals through CSS: write them in normal sentence or title case.

## Voice and rules
- Australian English. No em or en dashes anywhere (use commas, full stops or "to"). No Oxford comma.
- "We" and "Aquasonic" (as the live pages do). Brett (owner, plumber and gas fitter) and Lauren (business manager) run it as a family business. You may say "family owned". Do not invent staff, crews, vans or team sizes.
- Plain, friendly and direct. Short paragraphs (1 to 3 sentences).
- **No prices or dollar figures anywhere**, including "$0 callout" or "from $". Lauren will confirm price ranges with Brett later; until then, none. "Free quotes" is fine.
- **Never the street address.** Postal is PO Box 2213 Mandurah DC WA 6210, and pages do not need it.
- **Service area: Mandurah and the Peel region first, up to Rockingham, then south to Bunbury. Never north of Rockingham.** Do not mention, link or list Perth suburbs north of Rockingham (Kwinana, Armadale, Canning, Gosnells, Fremantle and similar) or say "Perth homes". Bunbury is the southern limit.
- **24/7 emergency:** the site advertises 24/7 emergency service, mainly around Mandurah. Do not promise a response time, arrival time or "minutes away". "Same-day where possible" is the strongest wording allowed.
- Every page is approved by Lauren before it goes live. They left their last agency because it published incorrect information, so when unsure, leave it out.

## Service layout, section by section (target 900 to 1,300 words of body copy)
1. **Hero** (`aq-hero split`, copy left on grey, photo right): kicker in capitals (service and area), H1 is the service keyword, intro paragraph 50 to 80 words, fixed Send Enquiry button, five ticks (concrete things included in this service, not boasts), fixed Google chip and pay later strip. Photo from the photo library for this service.
2. **Overview and blocks** (`aq-two`, sticky copy left, bordered blocks right): H2 and two paragraphs on what the service covers; four blocks, each a short kicker, an H3 and 45 to 75 words (the problem, the options, what the visit involves, aftercare or servicing). Then the FAQs (4 to 5 questions, answers 30 to 60 words, the first one open) and the fixed callback card.
3. **Why choose** (`aq-why`, grey): H2 "Why choose Aquasonic Plumbing & Gas for [service]?" pattern, 4 to 5 bullets with a bold lead, each from the facts list; fixed Contact us button and map.
4. **Why choose us** (dark cards), **reviews** and trust ticks: fixed.

## Location layout, section by section (target 800 to 1,100 words of body copy)
1. **Hero** (`aq-hero full`): kicker is fixed "Plumbing & Gas · [SUBURB]", H1 is exactly the keyword ("Plumber Halls Head"), lead 20 to 35 words written for this suburb. Buttons, ticks, Google chip and pay later strip are fixed.
2. **Intro** (`aq-intro`): H2 written for the suburb (never "Trusted plumbers in [Suburb]", that is the copied heading), two paragraphs: who Aquasonic is for people here and where the suburb sits in relation to Mandurah; the kinds of homes and what that means for plumbing and gas work (only what is generally true).
3. **Common jobs** (`aq-two`): kicker, H2 and lead-in on the work people in this suburb call about, then four blocks, each about one service. Choose services that suit the area (water filtration is Aquasonic's lead service, then hot water, blocked drains and burst pipes, soakwells and leach drains, gas, leak detection, renovations, emergency). Link each block to its live service page.
4. **Services grid** (8 cards), **Local, licensed & reliable** tiles: fixed, only the suburb name in the kicker changes.
5. **Local and FAQs** (`aq-local`): H2 and 30 to 60 words of plain geography (where the suburb is, the suburbs around it), then 3 to 4 FAQs (30 to 60 words each), map on the right with the suburb in the link and label.
6. **Also servicing nearby**: 4 to 6 neighbouring suburbs inside the service area as plain `<span>` chips. Link a chip only if that suburb's page is in the live pages list below. Fixed "View all areas we service" button.
7. **Callback card**: fixed.

## Live pages you may link (27/11/2026)
- Service pages: https://aquasonicpg.com.au/services/[slug]/ with slug hot-water-installations, water-filtration, plumbing-services, gas-services, blocks-bursts, soakwells-leach-drains, plumbing-for-renovations, leak-detection. Services hub: https://aquasonicpg.com.au/services/
- Contact: https://aquasonicpg.com.au/contact/ (anchor "send an enquiry" or "request a callback"). Areas: https://aquasonicpg.com.au/areas-we-service/
- New pages from the content plan (/plumber-[suburb]/, /services/emergency-plumbing/, /services/property-management-plumbing/) are NOT live yet. Do not link them until they are added to this list.
- Do not link the existing /areas-we-service/[suburb]-[council]/ pages; they are the copied pages being replaced.
- Phone always as `<a href="tel:+61433442643">+61 433 442 643</a>`.

## Facts on the client's own site or from the client (reuse only these)
| Fact | Source |
|---|---|
| Phone "+61 433 442 643"; email "admin@aquasonicpg.com.au" | Header and footer, every page |
| Licences "PL 8835", "GF 014609", "BF 2645"; ABN 76 286 836 097 | Header and footer |
| "Our team holds a current Working with Children Check and National Police Clearance." | Footer |
| "Plumbing & gas for Mandurah and Peel region. Open Monday to Friday, 7am to 5pm." | Footer |
| "24/7 Emergency Service" | Header |
| Family owned and operated; Brett Murphy (owner) and Lauren Talbot (business manager) | Site trust strip; reviews name Brett and Lauren; onboarding call 24/11 |
| Trading since 2011 ("15+ years on the books, continuous trade in WA") | Google Business Profile, service page stats |
| Free quotes, no obligation | Site cards and tiles |
| Pay later: Humm, Zip Pay, Zip Money, Zip Plus, Afterpay | Every page |
| Hot water: gas, electric, solar, heat pump and continuous flow; supply, install, repair and servicing | /services/hot-water-installations/ |
| Water filtration: whole house, under-sink, reverse osmosis, rainwater UV and benchtop hydration | Services grid |
| Leak detection without breaking concrete, reported in writing | Services grid |
| Renovation plumbing: they project manage and work with tilers | Onboarding call 24/11 |
| Hot water installs include valve kits, insulation and parts (not unit only) | Onboarding call 24/11 |
| 5.0 stars on Google | Google Business Profile |

Do not quote a review count (it changes). Do not use "20+ years" (conflicts with 2011; Lauren to confirm).

## Photos (Jhen 27/11/2026)
No client photos yet: the Drive Client Uploads folders are empty. Pages are written now without them, like the blogs. The service hero is a fixed "Photo to come" placeholder; keep it as is. The location layout has no photo slots (the 8 service cards are fixed and already on the live site). Do not add any other image. The team swaps in a real Aquasonic job photo before a page goes live.

## Banner photo (Jhen 12/11/2026)
A banner photo may have a little writing in it, as long as no writing sits behind the page heading, lead line or button. Never use a flyer or graphic that is mostly text. Product cut-outs on a white background must not go in a tall photo slot; use real photos there. Prefer Aquasonic's own job photos from the photo library over the site's stock images.

## Avoid
- Copying or paraphrasing the /areas-we-service/ page text, and their stock lines ("minutes away", "first visit", "upfront fixed pricing and a workmanship guarantee").
- Prices, "$0 callout", "cheapest", "guaranteed", response times, invented reviews, jobs, staff or local stories.
- Anything north of Rockingham, and "Perth" as the service area.
- Inline styles, extra `<h1>`s, and new classes not in page_css.css.
