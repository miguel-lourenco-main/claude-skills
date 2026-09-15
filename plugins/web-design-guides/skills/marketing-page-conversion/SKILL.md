---
name: marketing-page-conversion
description: Plan, write the structure of, or audit a marketing page so it converts — landing page vs homepage routing, section order, CTA and form rules, copy level, social proof and trust placement, SaaS marketing-site structure, FAQ and one-page sites, page-level SEO and performance floors (title tags, Core Web Vitals, schema), vertical must-haves (ecommerce, donation, B2B/industrial, local service/salon, church/multi-audience, multilingual) and portfolio sites — from distilled, source-tagged rules (Lovable's public web-design guides, which cite Unbounce, Baymard, NN/g, Google). Use when the user says "plan a landing page", "why isn't my landing page converting", "what sections should my homepage have", "SaaS website structure", "review my pricing/signup page", "design a donation page", "ecommerce checkout best practices", "portfolio site that gets clients", or "write title tags". NOT for award-style scroll storytelling and visual craft (use marketing-presentations), NOT for navigation/IA (use site-architecture-navigation), NOT for logos and brand marks (use brand-identity-basics).
---

# Marketing page conversion

A marketing page earns its keep by moving one kind of visitor to one action. This skill is an
**index**. The rules below settle most decisions. §8 points to one distilled note per guide in
`references/` beside this file, to read only when a decision needs more than the rule.

## 1 · Route the page type by where the traffic comes from

- Paid ads, launches, single offers and email campaigns get a **dedicated landing page**. Organic
  brand search, direct and discovery traffic get the **homepage**.
- A landing page removes standard navigation. In one cited case, removing nav doubled conversion
  from 3% to 6% (VWO/Yuppiechef). A homepage serves parallel paths (new, returning, researcher).
- Measure landing pages on conversion rate, homepages on engagement. A/B test on landing pages,
  never on the homepage.
- Give each traffic source or campaign its own page. On a SaaS site every page type (home,
  feature, pricing, blog) needs its own conversion logic, because most visitors never land on
  the homepage.
- Benchmark: landing-page median conversion is about 6.6%, and top performers exceed 10%
  (Unbounce, cited by three guides).

## 2 · Lay out the page in the default order, then deviate on purpose

Hero → Problem → Solution → Benefits → Social proof → Features → Pricing/process → FAQ → Contact.

- **SaaS**: lead with the visitor's problem before naming the product. Show the product before any
  signup wall. Publish pricing, because a gated price loses a buyer-intent signal. Put
  trial/demo/pricing in the primary nav.
- The hero states the value within ~10 s. It must also work for someone already scrolling, since
  the most-viewed strip sits ~550 px down.
- **One-page site**: give every section an anchor id, use a sticky nav with smooth scroll, and put
  the lead form above the fold with ≤3 fields.
- **FAQ**: an accordion with `aria-expanded`/`aria-controls`, full keyboard use, and FAQPage
  JSON-LD validated in Rich Results Test. Rich display is not guaranteed.

## 3 · Fix in impact order: form → headline → mobile → speed → proof

- **Form**: name and email at the point of conversion; everything else after it. Cutting 11 fields
  to 4 gave +120% (Imagescape). Mobile forms are single column with correct input types.
- **Headline**: passes a 5-second "what's in it for me" test. If a stranger can't restate the
  offer, rewrite it before touching visuals.
- **Mobile**: touch targets ≥48×48 CSS px (Google) or ≥44 pt (Apple); body text ≥16 px.
- **Speed**: compress images, use a CDN, enable caching. Server tuning only matters past a 3 s load.
- **Proof**: see §4.
- Under ~1,000 weekly visitors to a page, don't A/B test; apply this order instead. With enough
  traffic, test one element for 2–4 weeks.

## 4 · CTA, copy and proof rules

- **CTA count**: one primary CTA, repeated at hero, mid-page and end. Every alternative is visibly
  secondary. Keep the wording identical site-wide.
- **CTA phrasing**: first person ("Start my free trial") beat second person by 90% (ContentVerve).
  Put the objection-killer next to the button: "No credit card required".
- **CTA friction**: match it (trial vs demo vs contact sales) to the real go-to-market motion.
  The mismatch costs conversions, not the friction level itself.
- **Reading level**: 8th grade in general, 5th–7th grade for SaaS. Sentences under 20 words,
  active voice.
- **Testimonials**: named, with photo, role and a quantified outcome. Place each one against the
  objection active at that point of the page. Generic praise gets cut.
- **Where proof goes**: spread it near CTAs, pricing and feature pages instead of one testimonials
  block. Moving proof alone lifted trial signups 22% (VWO/Buildium).
- **Two trust layers**: credibility (logos, named customers) early on the page; reassurance
  (security, privacy) right at the form.
- **Loss framing**: only when anchored to a real, specific cost. Never fabricate urgency.

## 5 · Hold the technical floor

- Core Web Vitals at the 75th percentile of real users: LCP <2.5 s, INP <200 ms, CLS <0.1. Lab
  scores alone don't prove it.
- Never lazy-load above-the-fold images. The mobile version must have full content parity, because
  indexing is mobile-only.
- Title tags are 40–60 characters with the primary keyword in the first 3–5 words. The brand goes
  last, except on brand-search pages. No duplicate titles, no stuffing, no stale years. Meta
  descriptions stay under 160 characters.
- Structured data is JSON-LD matching the real content (FAQ, Product, BreadcrumbList).
- Word count is not a ranking factor. Size a blog post at ±20% of the top 5–10 ranking pages;
  conversion pages stay short.

## 6 · Add the vertical's must-haves

- **All transactional verticals**: no account before the core action; trust signals at the exact
  decision point; real photography over stock when buyers judge quality; soft-launch to 10–20
  people first.
- **Ecommerce**: guest checkout by default, zoomable product images at true scale, shipping cost
  before checkout, a visible return policy, checkout under 3 s on cellular.
- **Donation**: a single-step form with site nav stripped, suggested amounts from low to high
  anchored near the real target gift, recurring giving pre-selected or equal, impact stated in
  numbers.
- **B2B/industrial**: desktop-first research, spec-first scannable type, certifications matched to
  the buyer's industry and placed near the RFQ, vertical landing pages, configurators for
  configurable products, case studies with metrics.
- **Local service/salon**: in-site booking with live availability (no redirect), published prices,
  staff profiles linking to booking, visual register matched to price point.
- **Church/multi-audience**: design separately for visitor, member and staff. The visitor block
  (times, directions, kids, values) is non-negotiable.
- **Multilingual**: `/es/` subdirectories, hreflang with self, reciprocal and x-default entries,
  server-rendered translations, conversion-critical pages translated first, and keyword research
  per language.
- **Conflicts to resolve per case**: mobile-first vs a desktop B2B buyer; embedding a flow vs a
  low-fee external giving platform; few steps once someone has decided vs deep self-service
  content while they evaluate.

## 7 · Portfolio sites

Reviewers filter in stages: presentation in seconds, relevance in under a few minutes, then a
deep read of process. Design for all three in that order.

- Curate 2–5 projects (20–30 images for photography), strongest first, grouped by capability
  rather than by date.
- Each case study runs context → approach → implementation → results (+ learnings), with process
  shown and outcomes written as outcomes.
- State the specialisation early. Show a visible email address, not only a form.
- Load under 3 s on mobile. Refresh every 3–6 months.

## 8 · Index — read one note when §1–7 are not enough

| Question | Read |
|---|---|
| Conversion fix order, forms, testing thresholds | `references/landing-page-best-practices-convert.md` |
| Landing page vs homepage, nav removal, CTA wording | `references/landing-page-vs-homepage-difference.md` |
| SaaS marketing site by growth stage, pricing, trust layers | `references/saas-website-best-practices.md` |
| One-page site order and anchors · FAQ section/page | `references/how-to-create-one-page-website-guide.md` · `references/how-to-create-an-faq-page.md` |
| Title tags · CWV/mobile/schema thresholds · blog length | `references/how-to-write-website-titles-that-rank-and-convert.md` · `references/master-ux-seo-7-steps.md` · `references/how-long-should-blog-post-be-data-backed-guide.md` |
| Ecommerce conversion · ecommerce build | `references/ecommerce-optimization-tips.md` · `references/ecommerce-website-build.md` |
| Donation · church/multi-audience · salon/local service | `references/donation-website.md` · `references/church-website.md` · `references/hair-salon-websites.md` |
| B2B/industrial · multilingual | `references/industrial-website-examples.md` · `references/multilingual-website.md` |
| Portfolio: review psychology · photography · marketing/client · student · UX case studies · artists selling · fast-scan (model) | `references/how-to-make-an-art-portfolio.md` · `references/avoid-common-photography-portfolio-mistakes.md` · `references/how-to-build-marketing-portfolio-gets-clients.md` · `references/student-portfolio-examples.md` · `references/11-ux-portfolio-examples.md` · `references/how-to-build-website-for-artists.md` · `references/model-portfolio-examples-that-book-jobs.md` |

## Provenance

Distilled on 2026-09-13 from the public guides at lovable.dev/guides, paraphrased, never copied.
Named sources are as cited by the guide (second-hand), so verify a number before quoting it.
Vendor listicles were excluded; the triage is in the plugin's `sources.tsv`.
