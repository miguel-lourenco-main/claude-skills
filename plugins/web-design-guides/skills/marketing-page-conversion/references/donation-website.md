---
source: https://lovable.dev/guides/how-to-make-a-donation-website
title: How to Make a Donation Website That Converts
topic: nonprofit donation page conversion
value: 5
keep: yes
---

## Use when
Designing or auditing a donation/giving page, deciding form structure and gift-amount presentation, or planning recurring-giving strategy for a nonprofit site.

## Rules
- Donation pages convert poorly by default: 11% desktop, 8% mobile (per M+R Benchmarks, per guide) — roughly 9 in 10 visitors leave without giving, so treat baseline conversion as low and design against it deliberately.
- Trust and clarity are the two failure modes: in a Nielsen Norman Group study of 60 nonprofit sites, 47% of donor drop-off traced to design issues and 53% to unclear content (per Nielsen Norman Group, per guide) — both are addressable in design/copy, not just marketing.
- Security iconography near payment fields lifts conversion ~20% (per iDonate, per guide). Third-party charity ratings matter: 72% of people say a charity-rating badge increases their likelihood of giving (per Nonprofit Tech for Good, per guide) — display Charity Navigator/GuideStar ratings on the donation page itself.
- Keep the donation form to a single step. Multi-step "Next"-button forms saw a 52% drop in completions vs single-step (per iDonate A/B testing, per guide).
- Strip the site header/nav from the donation flow itself: removing it lifted conversion 195% in one test (per iDonate research, per guide) — every link off the page is an exit during peak intent.
- Frame donation impact in concrete numbers, not vague appeals — numeric impact framing nearly quadrupled donation rates in a large study (per Stanford and PayPal study, per guide).
- Suggested-amount anchoring is powerful and can backfire: raising the top suggested amount from $5 to $400 raised the average gift from $20 to $143, a 615% swing (per Five Maples research, per guide). Order amounts low-to-high — high-to-low ordering cut revenue over 25% (per NextAfter research, per guide).
- Push recurring/monthly giving as a primary option, not an afterthought: recurring gifts are 31% of online nonprofit revenue and growing (per M+R Benchmarks 2025, per guide); monthly donors retain at 80-90% vs ~45% for one-time donors (per Bloomerang research, per guide). Pre-selecting monthly as default is common practice — 86% of Public Media orgs do it (per M+R Benchmarks 2025, per guide).
- Donation form fields: collect only name, email, payment method, billing address at time of gift; defer anything else to post-donation follow-up.
- Payment method coverage matters: 76% of nonprofits offer PayPal, 47% Apple Pay, 40% Google Pay (per M+R Benchmarks 2025, per guide). Mobile is over half of nonprofit traffic (per M+R Benchmarks, per guide), so wallet options materially reduce mobile friction.
- For larger/recurring gifts, offer ACH — lower processing fees than cards, worth offering when average gift exceeds roughly $100.
- Use mobile-appropriate keyboards on donation forms (numeric for zip/phone, email keyboard for email) and keep the donate button visible without scrolling on load.

## Page anatomy / must-have sections
Homepage: above-the-fold CTA + headline stating impact + mission statement answering "why should I care" + at least one impact metric/story → contrasting-color "Donate" button.
Donation page: value-proposition statement (with photo/story) above the form → form with preset low-to-high gift amounts + custom amount field + clearly labeled payment options → no site header/nav visible during the flow.

## Anti-patterns
- Multi-step donation forms.
- Leaving the full site header/navigation present during the donation flow.
- Ordering suggested gift amounts high-to-low.
- Anchoring suggested amounts too low relative to your typical gift size (it drags the average down).
- Asking for more than name/email/payment/billing address before the gift completes.

## Checklist
- [ ] Single-page (not multi-step) donation form
- [ ] Site nav/header removed from the donation flow
- [ ] Third-party charity rating badge visible on the donation page
- [ ] Suggested amounts ordered low-to-high, anchored near your real target gift
- [ ] Monthly/recurring option pre-selected or equally prominent to one-time
- [ ] Mobile keyboards matched to field type; donate CTA visible without scroll
- [ ] PayPal/Apple Pay/Google Pay offered alongside cards
