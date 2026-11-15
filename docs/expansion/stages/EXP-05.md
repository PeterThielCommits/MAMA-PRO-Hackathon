# EXP-05 — Demo requests, map, PWA and resilience (F076–F087)

Current: **IN_PROGRESS**. Slice A audit is recorded below. Scope is synthetic
DEMO only; `LIVE_BLOCKED` remains in force. Human parent comprehension, native
Kazakh editorial review, real AT/device/browser-zoom review and the original
Research DOCX remain outside automated completion.

## A. Baseline and dependency

- Branch: `codex/exp-05-demo-pwa-resilience`, created from verified EXP-04
  closure `74a3f09f7b9101783716ee33a461d84465f92b3f`.
- EXP-04 runtime acceptance source: `2711bee46cb37aac64f98dafa14103e2dbe545b4`;
  its containing D commit is `74a3f09`. EXP-04 is `VERIFIED_DONE
  (AUTOMATED_SYNTHETIC_DEMO)`; see `docs/expansion/stages/EXP-04.md` and
  `docs/expansion/evidence/EXP-04.json`.
- No merge of EXP-03/EXP-04 PRs or default branch. EXP-03 base
  `7340dffa1b15e8452bf693f090f6c4085d46b158` is an ancestor of the EXP-04
  branch; the selected base therefore contains the verified matching work.
- Default `phase-0-audit` remains `7f8434a4cfd097b531fa584f5b97ebd1e772ad92`.
  Sibling branches and unmerged PRs are not treated as integrated.
- Working tree was clean before Slice A. The original local copy in
  `MAMA-PRO-Hackathon-completion-audit-2026-11-11` had an unborn `master` and
  untracked files; it was not reset, cleaned or overwritten. Work proceeds in a
  separate Git worktree with the new branch.
- Sources read: `AGENTS.md`; `docs/AI_CONTEXT/PROJECT_MASTER_CONTEXT.md`,
  `FEATURE_STATUS.md`, `PHASE_PROGRESS.md`, `ARCHITECTURE_MEMORY.md`,
  `DECISION_LOG.md`, `SESSION_HANDOFF.md`, `RESEARCH_TRACEABILITY.md`;
  `docs/expansion/{STATE.json,PROGRESS.md,SOURCE_RECONCILIATION.md}`; the
  EXP-04 stage/evidence; `docs/PHASE_10.md`, `docs/DOMAIN_CONTRACTS.md`,
  `docs/PWA_AND_OFFLINE.md`, `docs/STATE_AND_STORAGE.md`,
  `docs/LIVE_READINESS.md`, `docs/QA_RESULTS.md`; `README.md`, `package.json`,
  TypeScript/Vite/Playwright configs and the current request, map and PWA code.
- The original Research DOCX is **SOURCE_UNAVAILABLE** in the checked-out
  repository. The available Markdown extraction and canonical 231-feature CSV
  are used; no claim is made that the DOCX was read.

## B. Baseline execution

| Command | Result |
|---|---|
| `npm ci` | PASS; 106 packages, 0 vulnerabilities |
| `npm run check` | PASS; TypeScript strict, 237/237 unit/integration, phase registry valid |
| `npm run build` | PASS; Vite production build, app entry 380.00 kB / gzip 111.41 kB |
| `npx playwright test --workers=2` (dev) | 120 PASS, 1 intermittent focus failure in existing `intake.spec.ts:235`; reproduced 1 pass / 1 fail on repeat. Treated as a regression/flake to investigate, not hidden. |
| `git status` / `git ls-remote` | Clean; EXP-04 remote SHA confirmed `74a3f09...` |

The initial browser run is diagnostic, not acceptance evidence. It is retained
in `docs/expansion/evidence/EXP-05-A-context.json` and the accompanying logs.

## C. Contract lock and ADRs

### ADR-EXP05-01 — serialize every request mutation and make clear outcomes explicit

The existing `DemoRequestService` installed a synchronous single-flight lock
only for `submit`. `cancel` and `clear` could interleave with a submit or with
each other. `clear` also deleted IndexedDB rows and reset UI state before
removing the session recovery intent; a denied `sessionStorage.removeItem`
therefore produced a partial outcome after a row deletion, while the public
promise still rejected without describing what was durable.

Decision:

1. All mutating/read-recovery operations (`recover`, `submit`, `cancel`,
   `clear`) are serialized through one FIFO tail. `submit` additionally
   coalesces an in-flight duplicate call so a synchronous double click returns
   the same logical operation.
2. `clear` first commits the IndexedDB store clear, then resets in-memory state
   and invokes `onCommitted`, then attempts to remove the owned recovery intent.
   It returns `{ recordsCleared: true, intentCleared: boolean }`. A denied
   intent removal is surfaced as a visible partial outcome with a retry path,
   never as unqualified success. A failed IndexedDB clear throws and leaves
   confirmed records in place.
3. Cancel remains a committed status transition; repeated cancellation returns
   the terminal row without changing `updatedAt`.
4. No new persistence store, no fallback to memory, no second request service.

### ADR-EXP05-02 — versioned saved public cards, bounded eviction, split dates

The explicit saved-card namespace keeps `qoldau.saved-demo.v1`, a strict Zod
snapshot allowlist and `isSynthetic: true`. The storage key carries version 1;
the row schema is hardened to ISO timestamps and canonical price kinds. At the
20-card bound a new distinct card evicts the oldest `savedAt` card; saving the
same `offerId` replaces the existing row deterministically. `savedAt` is a
runtime-clock instant and never replaces `priceConfirmedAt`. The UI labels the
copy as a historical offline snapshot and does not claim the current price.

Date policy:

- Request runtime timestamps continue to use `Asia/Qyzylorda` (existing
  `PHASE_10` contract).
- Catalog-derived fact/price dates continue to use `Asia/Almaty` (EXP-04
  contract).
- Raw ISO instants and their offsets are unchanged. Only display is
  timezone-explicit.
- A future `createdAt` is a valid absolute instant; the 7-day retention window
  starts at that instant, so it is not expired early. Invalid stored timestamps
  fail schema validation and are surfaced as a controlled read error, not a
  silent success. Clear remains available for recovery.

### ADR-EXP05-03 — map is a projection of the current search result

`mapSearchResult` continues to read only `SearchResult.items[].matchingOfferIds`.
No independent catalog matching. A location is accepted only when `offerId` is
non-empty, latitude/longitude are finite and in range, `source` is non-empty and
`checkedAt` is a valid ISO instant. Invalid or duplicate locations are counted
honestly and never produce an invented pin. The text list is complete for every
mapped offer, and a separate missing list exposes offers without a valid
synthetic coordinate. The map is optional; geolocation is requested only by an
explicit button and denial never changes search results.

## D. Gap matrix before implementation (F076–F087)

| ID | Requirement | Existing implementation | Confirmed gap / risk | Planned change | Test proof |
|---|---|---|---|---|---|
| F076 | Create a DEMO request only for a concrete published offer pair | `DemoRequestEntry`, `DemoRequestService.submit`, strict snapshot | Service trusted the component's offer object identity; a foreign/tampered object with the same ID could reach snapshot construction; error for unavailable offer was mapped to a storage error | Resolve the canonical public offer from the supplied catalog by ID + specialist + publication status; explicit `requestInvalidOffer` error | UT-001/002/021, E2E-001/010 |
| F077 | Explicit DEMO acknowledgement | Unchecked checkbox, disabled submit, keyed form per offer | No current negative test that offer change resets acknowledgement | Preserve keyed reset; add browser proof | UT-003, E2E-002/010 |
| F078 | Durable local save through IndexedDB | `IndexedDbRequestRepository`, `oncomplete` boundary | Generic `StorageFailure` did not distinguish denied/blocked/quota/abort/invalid record/timeout; corrupt record threw raw Zod error | Typed failure codes, mapped open/transaction errors, controlled invalid-record error; no memory fallback | UT-005..008, 042; E2E-003/006/008/009 |
| F079 | Duplicate protection and same-key recovery | Unique index, intent, single-flight submit | Cancel/clear not serialized with submit; no explicit conflict message; no test for different payload under same key at service boundary | FIFO mutation queue, explicit `requestConflict`, same-key tests, collision tests | UT-009..021; E2E-004/007 |
| F080 | Read committed status and historical snapshot | `DemoRequestStatus` by ID | Format string rendered raw English; no test that a changed catalog cannot replace the saved snapshot | Shared localized format/date helpers; historical-snapshot test | UT-023/024/046; E2E-005/018 |
| F081 | Confirmed cancellation | Confirmation modal, transaction put, uncertain re-read | No serialization with clear/submit; repeated-cancel `updatedAt` stability not asserted | Queue serialization; terminal timestamp test; honest abort path | UT-025..029; E2E-011..013 |
| F082 | Scoped, confirmed cleanup | Own store + own intent key; modal | Race with submit/cancel; intent removal denial gave an unqualified rejection after row deletion and no partial outcome | Serialize clear; return explicit partial outcome; retry path; scoped-key proof | UT-030..036; E2E-014..016 |
| F083 | Honest recovery | Corrupt session intent handling, read errors, uncertain results | Persisted corrupt record produced a generic error without a documented recovery policy; typed storage reasons absent | Controlled `invalid_record`, clear recovery path, storage-code tests | UT-017/020/042; E2E-008/009 |
| F084 | 7-day retention from `createdAt` | Startup delete, read expiry, `>` boundary | No tests for cancelled TTL, malformed/future instants, DST/absolute instants; `deleteExpired` sampled clock per row | Capture one clock instant; document future policy; boundary/clock tests | UT-037..044 |
| F085 | Public PWA and explicit offline cards | `sw.js`, manifest, app-shell build, inline `SavedDemo` | Saved-card logic was untestable inline; at 20 cards a new save failed instead of a deterministic eviction; dates mixed UTC/local; no cache/API/manifest E2E in this phase | Extract `src/domain/savedDemo.ts`; bounded eviction; strict schema; explicit stale copy; production worker tests | UT-054..060; E2E-019..028 |
| F086 | Synthetic map from the shared search projection | `map.ts`, `ResultMap` | No coordinate/source validation; missing/invalid offers not listed as a complete alternative; aria-label only index + ID; unknown catalog offer could produce a wrong link | Validate locations; add invalid/missing counts and links; improve keyboard/aria labels; guard unknown offers | UT-047..053; E2E-029..034 |
| F087 | RU/KK, Intl dates, accessibility | Shared dictionaries, native dialogs, focus return, responsive CSS, reduced motion | Request status used an ad-hoc date formatter; format/unit values partly raw English; existing intake keyboard test is intermittently flaky | Shared date helpers and localized format labels; investigate focus flake without weakening assertions; 320–1280/text200%/keyboard proof | UT-044/046; E2E-035..037/040 |

## E. Test plan

Unit/integration (`vitest`, `fake-indexeddb` for repository unit tests only):

- F076/F077: canonical offer binding, foreign/hidden/withdrawn rejection,
  acknowledgement gate, snapshot exactness and PII rejection.
- F078/F079: `oncomplete` vs abort, open denial/blocked/quota/invalid record,
  double submit, concurrent repository instances, unique key, same-key replay,
  different-payload conflict, catalog-version mismatch, expired attempt,
  corrupted intent, uncertain commit, read failure without new key.
- F080/F081/F082: reload read, historical snapshot, cancel commit/abort/uncertain/
  repeated, clear confirmation/commit/abort/partial intent, scoped storage,
  concurrent submit vs clear, repeated clear.
- F084: exact 7-day boundary, +1 ms, cancelled TTL, startup cleanup, read expiry,
  corrupt/future/backward clock, DST-equivalent absolute instants.
- F085: saved-card schema, explicit save, `savedAt` vs `priceConfirmedAt`,
  denial/corrupt read, max 20 eviction, dedupe, no private fields.
- F086: projection-only IDs, excluded/incomplete separation, dedupe, missing/
  invalid coordinates, filter changes, optional geolocation, malformed source.

Browser E2E:

- Existing `tests/e2e/requests.spec.ts` request lifecycle plus new EXP-05 cases
  for canonical binding, conflict, ack reset, clear partial and keyboard.
- `tests/e2e/exp05-map.spec.ts`: search/map list consistency, missing counts,
  denied/unavailable geolocation, keyboard marker→list, 320/390/1280, no
  external requests.
- `tests/pilot-e2e/exp05-pwa.spec.ts`: production build + real service worker,
  manifest/assets, shell cache, offline public reload, `/pilot` warning,
  `/api/*` bypass, non-GET bypass, saved-card offline/stale labels, foreign
  cache preservation.
- Existing `tests/e2e/exp02..04`, `p0*`, `profile`, `search`, `intake` and
  `tests/pilot-e2e/*` remain regression gates. `release.spec.ts` runs against
  the production build.

## F. Rollback

Revert only EXP-05 commits in reverse order. No IndexedDB schema migration, no
saved-card key migration, no service-worker cache rename, no reset/clean, no
force-push, no merge. `LIVE_BLOCKED` is not changed by this phase.
