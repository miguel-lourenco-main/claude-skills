# App gap list — what a first teardown pass misses

Read this before pass H (write and lint). It is the application-behaviour counterpart of
`extraction-method.md` §4, which covers the visual and motion layer. Every item below has been
missed by a first pass on some product; for each one, either produce a row with evidence or an
explicit `U` row. Silence is not an answer.

## States you only see once or by accident

- **First-run / empty state.** What a brand-new account sees before any data exists (no favorites,
  no notes). Capture it before you create test data; it cannot be recovered afterwards without a
  second account.
- **Onboarding.** Tours, coach marks, welcome modals, cookie banner, consent prompts. Note what
  dismisses them and whether the dismissal persists (storage key).
- **Loading and skeletons.** What shows while audio or data loads; whether controls are disabled
  until ready.
- **Error states.** Offline (toggle network if the tooling allows, else `U`), failed save, expired
  session, 404 route, blocked autoplay (first click before any gesture).
- **Limit-reached and upsell.** The exact moment a free limit bites (the 6th favorite, the daily
  streaming cap): what is shown, whether the action is blocked or silently dropped, and the copy's
  claim about the limit. Record the limit as a number.
- **Logged-out vs logged-in.** Which surfaces exist in both; what a logged-out visitor can do.

## Things that live outside the main viewport

- **Document title and favicon changes** (timers, play state, unread badges). Sample the title over
  time; look for favicon swaps.
- **Browser notifications** and their permission flow; the end-of-timer sound. Hook, never grant.
- **Media session / OS media keys** (`navigator.mediaSession` metadata and handlers).
- **Background-tab behaviour.** Does audio keep playing? Does the timer keep ticking? Does the app
  throttle or pause on `visibilitychange`? Wake lock use.
- **Keyboard shortcuts** including a `?` help overlay; which ones work while focus is in an input.
- **Right-click, long-press, drag** on controls (reordering favorites, dragging sliders with keys).

## Data that is easy to describe wrongly

- **Share-link format.** Does the URL encode the current mix (query, hash, short id)? Decode one.
- **Deep links and routes.** Which state survives a reload of the URL alone?
- **Persistence matrix.** Separate: reload, new tab, logout/login, other device (the last two are
  `U` unless the scope allows a logout test).
- **Identity of a "thing".** Is a favorite a reference to sounds plus volumes, or a copy? What happens
  to a favorite when the underlying sound set changes? (Usually `U`; say so.)
- **Units and ranges.** Slider value range (0–1 vs 0–100), step, default volume, timer minimum and
  maximum, text counters (does "words" split on whitespace or Unicode word boundaries?).
- **Locale and time.** Date formats in statistics, 12/24-hour clocks, week start, translations.
- **Emails sent** (welcome, receipts, reminders) — always `U` with "verify from the user's inbox".

## Commercial and legal layer

- **Tier matrix as numbers**, cross-checked between the pricing page (D) and in-app gates (O/M).
  Where they disagree, record both and flag.
- **Platforms** beyond the web app (extension, mobile) — store listings only (D); note the features
  the listing claims are missing on the web.
- **Licence signals** on assets: footer credits, terms of service wording on content, font licences,
  attribution strings in the DOM or network responses.
- **Third parties** seen in network traffic: analytics, payments, error tracking, CDNs, auth
  providers. For each, the substitute-or-drop decision belongs in `api-map.md`.

## Audio-specific (ambient mixers, players, synths)

- Max simultaneous sounds (keep adding until a cap or upsell).
- Volume curve: slider position → actual gain at 0/25/50/75/100.
- Fade-in and fade-out durations on play, pause, stop and timer end.
- Loop seam: native loop vs crossfade; buffer or file duration per sound.
- Oscillation: period, floor, waveform (sine/cosine/random), whether per sound or global.
- Shuffle: interval, what pool it draws from, whether it fades between combos.
- Master volume vs per-sound volume; mute behaviour; state on reload (resumes or silent?).
- Audio delivery: file format, bitrate, CDN, streamed vs preloaded, procedural noise (no file).
