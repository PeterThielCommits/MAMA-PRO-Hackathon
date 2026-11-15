# Design delivery — 2026-11-14 (final pass)

Status: **delivered and verified**. All numbers below are from the final green run on this machine.
Scope: completion of the 2026-11-14 redesign (3D atlas, living sort deck, enriched cards and home,
trust sort) plus a verification-and-fix pass over everything the E2E and in-browser checks exposed.

## What shipped today

### 1. 3D specialist atlas (`src/features/search/ResultMap.tsx`, `src/domain/map.ts`)
- CSS/SVG-only pseudo-3D scene: draggable/tiltable/zoomable camera, 7 keyboard-operable camera
  controls, pulsing pins with 44×44 hit targets, category colors, decorative synthetic "Almaty"
  ground (districts, river, roads, blocks, grid).
- Selected-point panel with district/format/price and straight-line distance after local
  geolocation; online offers listed separately; accessible list fallback; legend with counts.
- No network, no tiles, no WebGL; geolocation stays in memory. Disclaimers intact (RU/KK).

### 2. Living sort deck (4 modes: relevant · price · trust · district)
- Sliding gradient glider on the segmented control; per-mode icon color and explanation deck;
  live insight line computed from the same result snapshot (can never contradict the count).
- `trust` is a new sort mode with precomputed per-specialist keys in `SearchService`
  (same O(n) discipline as the F-02 district fix). RU/KK help texts explicitly frame it as
  *documented evidence*, not quality.
- E2E contract preserved: radio values `relevant|price|district` unchanged; `trust` added.

### 3. Honest result cards (`src/features/search/OfferCard.tsx`)
- **No numeric ratings**: the percentage match band was replaced with categorical tiers —
  `Полное / Высокое / Частичное / Базовое совпадение` and coverage levels
  `Полная / Частичная / Ограниченная / Неизвестна` (RU) with full KK parity.
  Rationale: a number next to a person reads as a quality score even when it only measures
  condition coverage. The bar stays visual; people and screen readers get words.
- Rank badges, "best match" ribbon, chips (category/format/availability), verification count,
  stale-price and mismatch sections preserved.

### 4. Home redesign (`src/features/Home.tsx`)
- Rich hero with stats, animated decorative 3D atlas preview (orbits, scan, bobbing pins),
  trust strip ("Доверие без обещаний"), three calm steps, demo explanation.

### 5. Content enrichment
- 20 offer titles and 12 specialist bios enriched in RU/KK via the reproducible
  `scripts/enrich-demo-content-2026-11-14.mjs`. Everything remains synthetic, labeled «Демо».

## Bugs found by verification and fixed today

| # | Symptom | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | `intake.spec.ts:32` — intro text not found | RU copy had been reworded (`Любой вопрос можно пропустить` vs test's `Можно пропустить любой вопрос`) | Reverted `noRegistration` to the tested wording |
| 2 | Sort radio unclickable in 3 tests (`<span> intercepts pointer events`) | Decorative label text over the transparent radio intercepted clicks | `pointer-events: none` on segment text and glider; the radio remains the hit target |
| 3 | "no numeric ratings" E2E failed (RU/KK) | Cards rendered raw `100%`/`85%` percentages | Replaced with tier labels + worded coverage (see §3) |
| 4 | `search.spec.ts:295` timeout — compare-tray button unreachable | `.catalog-page` entrance animation kept a **filled transform**, making it the containing block for the fixed tray; the tray rendered mid-document over card actions | Page-level entrances now animate **opacity only** (`page-fade`); transform removed from the container |
| 5 | Map pins: 0×0 buttons, not clickable, invisible to AT | Pin buttons were zero-sized points | Real 44×44 hit target; stem/head/label offsets re-anchored |
| 6 | Pin click swallowed by map drag | Stage's `setPointerCapture` intercepted the gesture | Drag start ignores events originating on a pin |
| 7 | Coverage shown as fraction (audit follow-up, earlier today) | `coverage` is 0..1 | (already fixed) display uses categorical wording now |

## Final verification evidence (all green, this machine)

- `npm run typecheck` — pass
- `npx vitest run` — **158/158 tests, 10 files**
- `npm run build` — pass (index 416.49 kB / gzip 120.92 kB, CSS 55.09 kB)
- `npx playwright test` — **79/79 E2E passed** (incl. 320px/200% reflow RU+KK, keyboard-only
  journeys, focus traps, reduced motion, no-runtime-error sweeps)
- Live dev-server spot checks (Chromium, RU and KK):
  - Scenario A order `O01,O03,O02,O11,O10`, count `Специалистов: 5. Услуг: 5.`
  - Trust sort reorders to `O01,O02,O03,O11,O10`, insight "С подтверждённым документом: 2"
  - No `100%`/`85%`/`★` strings anywhere in cards (both locales)
  - Map: 6 pins, pin click selects, panel fills, `aria-pressed` toggles, Enter on focused pin
    selects and exposes `/specialists/S01?offer=O01` link, camera buttons mutate
    `--atlas-rotate/--atlas-zoom`
  - 0 px horizontal overflow on `/`, `/specialists`, `/specialists/S01?offer=O01`, `/compare`
    in both locales
  - Zero console errors

## Honest gaps (unchanged, by design)

- Kazakh copy needs a native-speaker editorial review (NOT RUN — no reviewer available).
- `PILOT_LIVE`/production remain **NO-GO**; `LIVE_BLOCKED` untouched; no real family data.
- 39 historical phases stay `TEAM_ATTESTED_EVIDENCE_PENDING`; Phase 68 blocked on real
  human appointments.
- Workspace is not a git repo; all changes are uncommitted working-tree files.
