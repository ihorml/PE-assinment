# ANIMATIONS.md — Motion & Transition Spec

**Status:** For review (nothing implemented yet) · **Scope:** the single-page
evidence-submission flow (`form → submitting → result`).

Goal: make the app feel **smooth, calm, and reassuring** — this is a stressed
user looking at stuck money. Motion should guide attention and soften state
changes, never feel busy or slow. Mobile-first: every animation must run at
60fps on a mid-range phone (transform + opacity only — never animate layout
properties like `width`/`top`/`margin`).

---

## 1. Motion tokens

Defined once in `index.css`, reused everywhere so timing stays consistent.

| Token | Value | Used for |
|-------|-------|----------|
| `--dur-fast` | **120ms** | Micro-feedback: hover, press, focus ring |
| `--dur-base` | **200ms** | Most transitions: errors, popover, list items |
| `--dur-moderate` | **300ms** | Phase swaps, result reveal |
| `--dur-slow` | **450ms** | First-load entrance, celebratory pop |

| Easing | Curve | Feel / used for |
|--------|-------|-----------------|
| `--ease-out-soft` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entrances — fast in, gentle settle |
| `--ease-in-soft` | `cubic-bezier(0.4, 0, 1, 1)` | Exits — accelerate away |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Playful overshoot (emoji pop, result card) |
| `--ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | Neutral color/position tweens |

---

## 2. Reduced-motion policy (required)

Respect `prefers-reduced-motion: reduce`. Under it:

- **Keep** opacity fades (≤120ms) — they're calm and non-vestibular.
- **Drop** all transform-based motion (slide, scale, pop, shake, spinner→pulse).
- The spinner becomes a static/pulsing dot rather than spinning.

Implement via Tailwind's `motion-reduce:` variant and a global CSS guard.

---

## 3. Animation inventory

Priority legend: **P0** = core smoothness (do first) · **P1** = polish · **P2** = delight.

### A. First-load entrance — `App` card

| # | Element | Trigger | Effect | Timing | Pri |
|---|---------|---------|--------|--------|-----|
| A1 | Card container | mount | fade + rise: `opacity 0→1`, `translateY 8px→0`, `scale 0.98→1` | slow / out-soft | P1 |
| A2 | Header + fields | mount | staggered fade+rise, **+40ms** each | base / out-soft | P2 |

### B. Phase transitions — `form ↔ submitting ↔ result` (the big one)

This is where "smooth" is won or lost. The card swaps content **and** changes
height between phases (form is tall, submitting is short).

| # | Element | Trigger | Effect | Timing | Pri |
|---|---------|---------|--------|--------|-----|
| B1 | Outgoing phase | phase change | fade + `translateY 0→-6px` + `scale 1→0.99`, then unmount | base / in-soft | **P0** |
| B2 | Incoming phase | phase change | fade + `translateY 8px→0` in | moderate / out-soft | **P0** |
| B3 | Card height | phase change | animate height between old/new content (no snap) | moderate / standard | **P0** |

> B3 (animated container height) is the single biggest "feels premium" win and
> the trickiest — see §4 implementation note.

### C. Form fields — `Field` / inputs

| # | Element | Trigger | Effect | Timing | Pri |
|---|---------|---------|--------|--------|-----|
| C1 | Input border/ring | focus / blur | `transition` border-color + box-shadow ring | fast / standard | **P0** |
| C2 | Input → invalid | error appears | border color tween to red (not instant) | fast / standard | **P0** |
| C3 | Error message | appear / clear | fade + height `0→auto` collapse-in; reverse on clear | base / out-soft | **P0** |
| C4 | Field (on submit-with-errors) | failed submit | one subtle horizontal **shake** (`±4px`, 1 cycle) | base / standard | P1 |

### D. Hint popover — `HintBadge`

| # | Element | Trigger | Effect | Timing | Pri |
|---|---------|---------|--------|--------|-----|
| D1 | (?) badge | hover/focus | color transition | fast | P1 |
| D2 | Popover open | tap/click | fade + `scale 0.95→1` + `translateY 4px→0`, origin bottom-left | base / out-soft | P1 |
| D3 | Popover close | outside-tap / Esc | fade + `scale 1→0.97` out (needs exit handling) | fast / in-soft | P1 |

### E. File upload — `FileField`

| # | Element | Trigger | Effect | Timing | Pri |
|---|---------|---------|--------|--------|-----|
| E1 | List item | file added | fade + height/`translateY` enter | base / out-soft | P1 |
| E2 | List item | file removed | fade + height collapse out (exit handling) | base / in-soft | P1 |
| E3 | ✕ remove button | hover / press | color + `rotate 90°` on hover, `scale 0.9` press | fast | P2 |
| E4 | File input zone | drag-over* | border + bg highlight, subtle `scale 1.01` | fast | P2 |

\* E4 only if we add drag-and-drop; the current control is a native picker.

### F. Submit button

| # | Element | Trigger | Effect | Timing | Pri |
|---|---------|---------|--------|--------|-----|
| F1 | Button | hover | bg (have it) + lift `translateY -1px` / shadow | fast / standard | **P0** |
| F2 | Button | press | `scale 0.97` | fast | **P0** |
| F3 | Button label | submit start | cross-fade label → inline spinner | base | P1 |

### G. Submitting screen — `Submitting`

| # | Element | Trigger | Effect | Timing | Pri |
|---|---------|---------|--------|--------|-----|
| G1 | Spinner | while processing | keep `animate-spin`; add soft glow/pulse ring | loop | **P0** (have base) |
| G2 | "Checking your payment…" | while processing | gentle opacity **breathing** loop (1→0.6→1) | ~2s loop | P1 |
| G3 | Animated ellipsis | while processing | "…" dots cycle | ~1.2s loop | P2 |
| G4 | "Please don't close" | mount | fade-in after ~400ms beat | base / out-soft | P1 |

### H. Result screens — `Result`

| # | Element | Trigger | Effect | Timing | Pri |
|---|---------|---------|--------|--------|-----|
| H1 | Result card | result shown | pop-in `scale 0.95→1` + fade, slight overshoot | moderate / spring | **P0** |
| H2 | 🎉 (approved) | result shown | emoji pop `scale 0→1.15→1` + small rotate | slow / spring | P1 |
| H3 | Approved confetti | result shown | one-shot confetti burst | ~1.2s one-shot | P2 |
| H4 | needs_evidence icon | result shown | attention pulse (1 cycle) | base | P2 |
| H5 | Ticket reference id | result shown | brief highlight sweep on the `ZD-xxxxx` chip | base | P2 |
| H6 | Body text / buttons | result shown | fade+rise, +60ms after card | base / out-soft | P1 |

### I. Global micro-interactions

| # | Element | Effect | Pri |
|---|---------|--------|-----|
| I1 | All interactive elements | standardized `transition-colors`/ring on hover/focus | **P0** |
| I2 | Network error banner | fade + height collapse-in (same as C3) | P1 |
| I3 | Focus-visible rings | animate in (opacity/scale), don't snap | P1 |

---

## 4. Implementation approach

**Decision needed from you → pick one (drives the rest):**

- **Option A — CSS/Tailwind only (recommended).** Define keyframes + tokens in
  `index.css`, use utility classes + `motion-reduce:`. For the few **exit**
  animations (phase swap B1, popover D3, file remove E2) add a tiny
  `usePresence` hook (~15 lines: keep the node mounted one cycle while it plays
  its `-out` class). Auto-height (B3, C3) via the
  `grid-template-rows: 0fr → 1fr` trick (or measured height for the card).
  **Pros:** zero deps, smallest bundle (matters on mobile), full control.
  **Cons:** we hand-write the exit/height helpers.

- **Option B — add `framer-motion` (`motion`).** `AnimatePresence` handles
  enter/exit for free; `layout` animates the card height (B3) automatically;
  list reordering "just works."
  **Pros:** least code for the trickiest parts (B, E).
  **Cons:** ~30–40kb gzipped added to a tiny app; another dependency.

> Recommendation: **Option A.** The app is small and mobile-first, and only ~3
> spots need exit handling — not worth a 40kb dep. I'll add one small shared
> helper and we keep the bundle lean. (Happy to go B if you'd rather trade bytes
> for less code.)

**Where things live:**
- Tokens + `@keyframes` (shake, pop, breathe, confetti) → `index.css`.
- Per-component classes → inline Tailwind utilities on existing elements.
- `usedPresence`/auto-height helper (Option A) → `src/lib/`.

---

## 5. Suggested rollout order

1. **P0 batch** — tokens + reduced-motion guard, phase transitions (B1–B3),
   input focus/error (C1–C3), button hover/press (F1–F2), result pop (H1),
   global transitions (I1). *This alone makes it feel finished.*
2. **P1 batch** — entrance (A1), shake (C4), popover (D2–D3), file list (E1–E2),
   submitting polish (G2, G4), emoji pop (H2), result text stagger (H6).
3. **P2 batch (delight)** — confetti (H3), ellipsis (G3), reference highlight
   (H5), drag-drop zone (E4), remove-button flair (E3).

---

## 6. Out of scope / non-goals

- No route/page-level transitions (single page).
- No scroll-triggered or parallax effects.
- No animated illustrations or Lottie.
- Nothing that delays the user from acting (animations never block input).
