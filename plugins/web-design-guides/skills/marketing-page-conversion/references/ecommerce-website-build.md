---
source: https://lovable.dev/guides/how-to-make-an-ecommerce-website
title: How to Make an Ecommerce Website That Sells
topic: ecommerce site build + launch
value: 4
keep: yes
---

## Use when
Scoping a new ecommerce build: choosing a platform tier, designing product pages, picking a payment gateway, and running a launch checklist.

## Rules
- Baseline requirements before picking a platform: storefront (homepage/nav/brand), product catalog (images/desc/price/inventory), payment processing, checkout flow, and a trust layer (SSL, reviews, visible return policy, contact info) — security concerns drive part of cart abandonment (19% cited, unsourced in guide).
- Product photography: show real-world scale references and multiple angles; Baymard found 28% of ecommerce sites fail to show products "in scale" while 42% of shoppers actively try to judge size (per Baymard Institute, per guide). Make images enlargeable to at least 2x displayed size.
- Reviews carry outsized weight: up to 95% of shoppers rely on reviews before buying (per Baymard Institute, per guide), and sites showing both positive and negative reviews convert better than positive-only displays.
- Shipping-cost transparency: reveal costs early — unexpected shipping costs are a top cause of abandonment, cited at 39% (per Baymard Institute, per guide).
- Return-policy visibility drives repeat purchase: 92% of customers say they're more likely to buy again from retailers with easy, transparent returns (per Signifyd research, per guide). Link the return policy from product pages, not just a buried legal page.
- Guest checkout should be the visually primary option, not merely available — forced account creation is a top abandonment cause (24% cited, unsourced in guide).
- Payment gateway trade-offs: Stripe suits international sales but total fees can reach ~5.4% abroad; PayPal has the easiest setup and highest consumer recognition but higher international fees (~7.5-8.5%); Square suits blended online/in-person inventory. On Shopify, using a non-Shopify-Payments processor adds a 2% penalty fee. (Fee figures as stated by guide, not independently verified — treat as directional.)
- Mobile checkout must load under 3 seconds on cellular; use 44×44px touch targets; test on real devices, never emulators only.
- Average cart abandonment sits around 70% (unsourced in guide) — treat any single-digit drop as meaningful.

## Patterns (name — when to use — when to avoid)
- **Soft launch before public launch** — invite 10-20 trusted contacts, offer a discount for feedback, collect it via post-purchase survey. Use for any first-time store launch; skip only if the catalog and checkout have already been proven on another channel.
- **Objection-preempting product page** — pair authentic (non-stock) photography with scannable, benefit-led copy answering dimensions/materials/care upfront. Use for considered purchases; less necessary for single-SKU impulse products.

## Page anatomy / must-have sections
Storefront (home/nav/brand) → Product catalog (photos, descriptions, price, inventory) → Cart → Checkout (guest-first, minimal fields, wallet options) → Confirmation → Trust layer present throughout (SSL, reviews, visible returns/contact).

## Anti-patterns
- Requiring login before checkout is even visible.
- Publishing product photos without a scale reference or zoom.
- Choosing a payment processor based on domestic rate alone when a meaningful share of sales are international.

## Checklist
- [ ] Full test transaction from cart to confirmation email, including a declined-card case and a refund
- [ ] Guest checkout tested with quantity changes and discount codes
- [ ] Tax and shipping calculate correctly
- [ ] Checkout tested on real iOS and Android devices, not just browser resize
- [ ] Every nav link/menu item clicked in Chrome, Safari, Firefox
- [ ] Page load under 3 seconds
- [ ] Legal pages present: privacy, terms, return policy, shipping policy
- [ ] Unique page title + meta description per product page
