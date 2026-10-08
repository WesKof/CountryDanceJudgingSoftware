# Country Dance Judging — master design, specification, and operating reference

Document version: 1.10. Earlier shared live judging implemented and locally verified: 2026-10-08. The latest stage/heat workflow, setup parity, separation of duties and dual-approval correction requirements are design only; implementation is on hold. The implementation remains uncommitted on the preferred checkout's `main` branch. Baseline release commit: `4416e2fe92c0a1db9820bb6f2b68bd1acb2533b6` (Prepare public competition release); documentation baseline `e70bc46`. No new deployment or paid service was requested or performed.

This describes the inspected implementation and the owner's decisions. It is intended for people and coding assistants. Source links are relative to the application repository. External hosting and Google configuration are dated observations, not live guarantees. If code and this document disagree, investigate and update the document; do not silently change behavior to fit stale prose.

## Quick context

- **Purpose:** run friendly, relatively low-stakes country dance competitions and showcase a useful community project to potential employers through LinkedIn.
- **Owner:** Wesley Coffman. Users include event organizers, friends in the dance community, and visitors exploring the demo.
- **Product:** one competition desk with multiple competitions inside one locally saved event; Strictly couples and Jack & Jill individuals are supported.
- **Experience:** numbered vertical navigation: Set up → Score → Results → Publish. The initial screen is Score with seeded example data. Publish also contains imports and backups.
- **Architecture:** React 19 + TypeScript, Next-compatible App Router on Vinext/Vite; Cloudflare-compatible Sites deployment. Most application behavior is in `app/page.tsx`; scoring is separated into `lib/scoring.ts`.
- **Storage:** the public/demo page retains browser localStorage and legacy v2 state. Deliberately created shared events use server API routes and a logical Sites D1 `DB` binding. This is implemented and tested with local D1; hosted provisioning, allowance and production migration checks remain pending. No custom accounts were added.
- **Shared judging:** organizer setup, event-long private judge links, per-song phone marks/notes, pending-edit recovery, discussion blocks, immutable submissions, equal-weight averages, head tie decisions/approval, explicit reopening, finalist pairs, shared exports/backups and archive/delete are implemented locally. Read Live judging implementation target and Implementation handoff for contracts and verification.
- **Latest design / work boundary:** the owner revised the workflow to song pages with one heat-end submission, at-least-once coverage of every entrant by every judge in that heat, stage-end read-only review and advancement tie voting, and error corrections requiring separate organizer plus head judge approval. The organizer cannot judge or score; competition removal remains required. This revision is documentation/design only; implementation is on hold while the remaining rules are fleshed out. Read [Stage workflow revision](#stage-workflow-revision--design-only).
- **Legacy/demo scoring:** Yes=10, A1=4.5, A2=4.3, No=0; incomplete entries excluded; ties share place with skipped ranks; Jack & Jill roles ranked separately. These legacy completeness rules do not define the revised heat-coverage/blank-song policy.
- **Next-chat priorities:** make local/demo setup match shared organizer setup, fix the confirmed local competition-removal gap, and verify with synthetic fixtures, unit/API/browser tests and a complete isolated mock competition. Setup parity and the latest mock rehearsal are not implemented/performed yet; read the corresponding sections in Implementation handoff.
- **Google:** optional outgoing results publisher only. No automatic contestant fetch, no configured default endpoint. The secured script is a repository template; updating it here does not update Google.
- **Sharing:** public access was enabled and Sites version 3 deployed on 2026-08-21. The current public URL and GitHub branch are listed below; live access was not rechecked for this documentation pass.
- **Important limits:** local/demo saves and legacy backup validation retain their earlier limitations. Shared pending edits recover on an online reload, but neither mode has a service worker or guaranteed offline first load/reload. Physical-phone, venue-connectivity, hosted D1/quota and real Google delivery checks remain unperformed.
- **How to work:** read `AGENTS.md`, find the relevant section below and inspect just the affected files. Implementation is currently on hold; refine the design and documentation. Resume code changes only when requested, then verify and update this reference. Do not reread the full repository for every small task.

## Reference index

- [Product and workflow](#product-and-workflow)
- [Scoring contract](#scoring-contract)
- [Data and persistence](#data-and-persistence)
- [Optional Google Sheets connector](#optional-google-sheets-connector)
- [Visual design](#visual-design)
- [Architecture and file map](#architecture-and-file-map)
- [Development and release](#development-and-release)
- [Known limitations and proposed improvements](#known-limitations-and-proposed-improvements)
- [Live judging implementation target](#live-judging-implementation-target)
- [Implementation handoff](#implementation-handoff)
- [Maintenance and handoff](#maintenance-and-handoff)

## Product and workflow

### Established owner decisions

The site should be usable by friends running community competitions and presentable as a public portfolio project. The owner accepted public access and the current URL, declined custom in-app authentication, and explicitly preferred sidebar navigation because it communicates competition flow. Preserve these choices unless a new request changes them. Low stakes justify simplicity, but scores and saved work should remain predictable.

### Implemented local/demo surfaces

| Step / internal view | Implemented behavior |
| --- | --- |
| 01 Set up / `event` | Edit event name, venue, date; add Strictly or Jack & Jill competitions; edit competition details; add/remove judges and entries. Judges are shared across the event. |
| 02 Score / `scoring` | Select active competition, mark each entry per judge, show progress, reset an entry or clear the ballot, review missing marks. Clicking a selected mark clears it. |
| 03 Results / `results` | Show completed-entry standings and ties; export CSV; print; save a result revision after the entire ballot is complete. Ballot remains editable. |
| 04 Publish / `data` | Import entrant/judge CSVs, download templates, download/restore JSON event backups, optionally send completed results to Google Sheets. |

Navigation is not a gated wizard. Users may move between views. The review dialog reports missing judges for each incomplete entry and links to Results when the ballot is complete.

The default event is “Bluebonnet Country Dance Classic,” Fort Worth, with seeded judges, entrants, and some marks. This is application sample content, not evidence of a real event or current contestant list. No dedicated “start blank event” or “reset demo” action exists yet.

### Changes with destructive effects

- Clearing a ballot removes its current scores, after confirmation; saved revisions remain.
- Removing an entry removes that entry and its current scores from the active competition.
- Removing a judge removes their marks across competitions; existing revisions remain snapshots.
- Importing entrants replaces the active roster and clears its scores. Importing judges replaces the event judge list and clears scores across competitions. Confirmation is requested when replacing existing records.
- Restoring a backup replaces the local event after confirmation. It preserves this device's current publishing URL and separately stored key.
- Adding a new judge can make previously complete ballots incomplete. Revisions remain unchanged.

## Scoring contract

Authoritative implementation: [lib/scoring.ts](lib/scoring.ts). Examples: [tests/scoring.test.ts](tests/scoring.test.ts).

| Mark | Numeric value | Counts as filled? |
| --- | ---: | --- |
| `Yes` | 10 | Yes |
| `A1` | 4.5 | Yes |
| `A2` | 4.3 | Yes |
| `No` | 0 | Yes |
| empty string | contributes 0 to helper total | No |

Scores are sums, not averages or ordinal judge rankings. An entry is eligible for standings only when at least one judge exists and every current judge has a nonempty mark. The ballot is complete only when `entries × judges > 0` and all required marks are selected.

Sort completed entries by descending total. Totals differing by less than 0.0001 share place. Use competition ranking: totals 30, 30, 28 produce places 1, 1, 3. Entry ID orders rows with exactly equal totals for display; it must not award one tied entry a better place. Strictly has one Couples group. Jack & Jill has separate Leads and Follows groups (with a defensive Unassigneds group).

Saving a revision requires the whole ballot to be complete. It appends an ID, ISO timestamp, sequential label, and calculated result rows. It does not lock marks, advance a round, or create an authenticated audit record. The current UI lists revision timestamps/counts; it does not provide full historical-row browsing. CSV/print use current results, including completed entries in a still-provisional ballot.

No callbacks, automatic advancement, skating/relative-placement algorithm, judge quotas, or official sanctioning-body compliance is implemented. Confirm competition rules before changing the established mark values or ranking semantics.

## Data and persistence

Authoritative types and seeded event: [lib/domain.ts](lib/domain.ts). Browser handlers: [app/page.tsx](app/page.tsx).

| Object | Fields / ownership |
| --- | --- |
| `AppState` | `version: 2`, `event`, `judges[]`, `competitions[]`, `activeCompetitionId`, `publisherUrl` |
| Event details | `name`, `venue`, `date` |
| Judge | `id`, `name`; event-wide |
| Competition | `id`, `name`, `format`, `division`, `round`, `entries[]`, `scores`, `revisions[]` |
| Entry | `id`, numeric `number`; Strictly uses `lead`/`follow`; Jack & Jill uses `name`/`role` |
| Scores | Nested lookup `scores[entryId][judgeId] = Mark` |
| Result row | Entry ID/number, primary/secondary names, group, place, tied flag, total, complete flag |
| Revision | ID, creation time, label, snapshot of result rows |

The browser loads `country-dance-judging:v2` on startup, then debounces event saves by 250 ms. The publishing key uses a separate key, `country-dance-judging:publisher-key`. The URL is inside the stored event but is cleared in new backup exports. Both URL and key start empty for a fresh visitor. Storage is per browser profile and origin, not per signed-in user.

In local/demo mode there is no server copy of the event. Other visitors get their own browser state. Opening a different browser/device or changing the site's hostname does not transfer legacy saved work. Legacy tabs have no coordinated merge/conflict handling. Keys in localStorage are accessible to someone using that browser; they are not encrypted by the app. Shared mode is a separate, deliberate workflow with server authority and scoped revisions; local v2 events are not automatically migrated.

### JSON backup contract

Current exports wrap the event as follows:

```json
{
  "format": "country-dance-judging-backup",
  "backupVersion": 1,
  "exportedAt": "ISO timestamp",
  "event": { "version": 2, "publisherUrl": "", "...": "remaining AppState fields" }
}
```

The example is a shape illustration, not an importable backup. Full ballots, event details, judges, competitions, and revisions are exported. The publishing key is separate and not exported. Restore accepts the wrapped format and older raw v2 state objects; it preserves this device's publisher URL/key. New fields must not accidentally introduce credentials into exports.

`isAppState` only checks a few top-level properties and the presence of the active competition. It is not deep schema validation. Restore currently does not enforce `backupVersion`, inspect all nested fields, or cap file size. Do not describe it as fully validated input.

### CSV contract

| Import | Canonical header |
| --- | --- |
| Strictly roster | `Number,Lead,Follow` |
| Jack & Jill roster | `Number,Name,Role` |
| Judges | `Name` (a one-column list without a header also works) |

Header matching ignores case and punctuation and supports aliases in `importEntrants`. Jack & Jill roles are interpreted from initial `l`/`f`. Invalid entrant rows are skipped; duplicates are not consistently rejected during CSV import. Manual entry rejects duplicate numbers in the active competition. Parsing handles quoted commas, escaped quotes and embedded line breaks, trims fields, and skips empty rows.

Results CSV columns: Event, Competition, Division, Round, Group, Place, Tie, Number, Primary, Secondary, Total Score. CSV serialization quotes delimiters but does not neutralize spreadsheet formulas. Only import data from known sources until stronger validation is implemented.

### Event-day usage

Use one primary browser/device for the event. Back up before replacing rosters, after important rounds, and before switching devices. Restore the JSON file on a new device; sharing the website link alone does not share the event. Save CSV/print results for distribution. Existing loaded scoring operations are local, but first load/reload and publishing require connectivity; no service worker or guaranteed offline installation exists.

## Optional Google Sheets connector

Files: [Do_Post.gs](google-apps-script/Do_Post.gs), [setup instructions](google-apps-script/README.md), and `publishResults` in the page.

Google is not part of normal startup or scoring. There is no contestant read/sync API. An organizer must set a URL and publishing key, complete the ballot, then explicitly send results. No endpoint, publishing key, or destination Sheet ID is bundled as an active default.

The client POSTs form-encoded `results` (JSON array of arrays with a header row) and `publishingKey`. Rows contain event/competition/division/round, place/tie, bib, participant fields, total, and each judge's mark. Current URL validation requires HTTPS, hostname `script.google.com`, and a `/macros/s/` path prefix. The intended deployment suffix is `/exec`; the code does not enforce that suffix.

The supplied script reads `SHEET_ID` and `PUBLISHING_KEY` from Script Properties, compares the key via SHA-256 digests, validates rectangular primitive-valued rows, and obtains a script lock. Limits are 5,000 rows, 50 columns and 2,000 characters per cell; there is no explicit total HTTP body limit before parsing. It appends a timestamped copy to **Published Results Archive**, then clears/writes **Published Private Results** as the latest snapshot. These are sequential writes, not a transaction. `doGet` is a basic service response. The response is JSON with `success` and either publication details or an error.

**External status:** the template was committed, but installation, script properties, redeployment, authorization and browser-to-Google delivery were not verified. The owner's historical project contained `DoPost_old.gs`, `testDoPost.gs`, and `Do_Post.gs`. Ensure there is exactly one active global `doPost` when replacing it; a file named “old” is still executable Apps Script. The old handler had no key enforcement. A new key field in the frontend does not fix that deployed handler.

Use a disposable spreadsheet for connector tests. Verify invalid keys make no writes, valid requests archive and update as expected, and browser responses are readable. Never publish test results into a live competition sheet without explicit intent. Do not put real publishing keys, access tokens, Sheet IDs tied to private operations, or raw contestant backups in this reference.

## Visual design

Authoritative styles: [app/globals.css](app/globals.css). Direction: warm paper panels, deep forest navigation, copper/gold accents, serif headings and practical sans-serif controls. Preserve the competition workflow as the primary surface.

| Token | Value / role |
| --- | --- |
| `--paper`, `--panel` | `#f5f1e8`, `#fffdf8`; backgrounds |
| `--forest`, `--forest-dark` | `#234c3b`, `#183429`; actions and sidebar |
| `--copper`, `--gold` | `#b45f3a`, `#d6a449`; accents and active step |
| `--ink`, `--muted` | `#17221d`, `#69746e`; text |
| `--line`, `--sage`, `--danger` | `#ddd6c8`, `#dfe8df`, `#a84e3d`; borders, positive state, destructive state |

Desktop sidebar is 218 px and sticky. At 720 px or narrower it becomes an 88 px vertical rail; at 420 px it is 74 px. Do not revert it to horizontal top navigation. At 1,100 px panels stack and the supplementary standings panel hides. At 760 px forms/data panels stack. Score tables retain an 880 px minimum width inside a horizontal scroll container; scoring controls are currently about 31 px tall, so phone usability still needs attention.

Preserve `aria-current="step"`, `aria-pressed` marks, associated labels, visible focus, status messages, and reduced-motion styles. A dialog role exists but comprehensive focus trapping/Escape handling has not been verified. Print rules hide navigation/control surfaces and emphasize the result sheet.

Social preview metadata is in `app/layout.tsx`. `/og` serves a JPEG encoded in `lib/social-image.ts`; avoid loading that base64 blob during normal code searches. The preview currently says “Offline-ready scoring,” which overstates offline reload support. The image has a long immutable cache lifetime at a stable path, so image changes may need cache/version treatment.

## Architecture and file map

```text
Browser page / (React state)
  ├─ domain.ts: types, defaults, shallow state check
  ├─ scoring.ts: derived progress and rankings
  ├─ csv.ts: parsing and serialization
  ├─ localStorage: event and separate publisher key
  ├─ file download/import: CSV and JSON
  └─ explicit POST: organizer's optional Apps Script → Google Sheet

Shared organizer /live/<private-code> and judge /judge/<stable-slug>/<private-code>
  ├─ /api/live: server-enforced access, scoped saves and atomic lifecycle operations
  ├─ D1: event setup/context, access records, frozen round generations, ballots,
  │      immutable submissions, tie decisions, approvals and retry receipts
  └─ browser pending-edit cache: temporary, author-scoped, never authoritative

Sites worker: serves application, /og and the D1-backed /api/live route
```

| File | Responsibility |
| --- | --- |
| `app/page.tsx` | All four views, state lifecycle, mutations, imports/exports, publishing |
| `app/globals.css` | Design tokens, layouts, responsive and print rules |
| `app/layout.tsx`, `app/og/route.ts` | HTML wrapper and social metadata/image response |
| `lib/domain.ts`, `lib/scoring.ts`, `lib/csv.ts` | Data contracts, scoring rules, CSV helpers |
| `tests/scoring.test.ts`, `tests/csv.test.ts` | Five scoring tests and two CSV tests |
| `google-apps-script/` | Optional externally deployed publisher and setup notes |
| `package.json`, `pnpm-lock.yaml` | Commands and pinned dependency resolution |
| `vite.config.ts` | Vinext, Sites, Tailwind/PostCSS, Cloudflare integration |
| `.openai/hosting.json` | Existing Sites project identity; logical D1 `DB`, unused R2 null; hosted resource not provisioned |
| `components/live/`, `app/live/`, `app/judge/` | Shared four-view desk, blank creation, private phone ballots and head review |
| `lib/live/types.ts`, `lib/live/validation.ts`, `lib/live/scoring.ts`, `lib/live/merge.ts` | Separate shared contracts, bounded setup validation, exact-input averages and monotonic client reads |
| `lib/live/server.ts`, `app/api/live/route.ts`, `db/index.ts` | Access-checked prepared D1 operations; no runtime schema creation |
| `db/schema.ts`, `drizzle/`, `scripts/migrate-local.mjs` | Versioned generated schema migrations and local-only migration ledger |
| `tests/live-*.ts`, `tests/live-api.test.mts`, `playwright.config.ts` | Unit/legacy checks, actual HTTP/D1 rehearsal and isolated browser sessions |

Inspected pins: React 19.2.6, Next 16.2.6, Vinext 1.0.0-beta.3, Vite 8.0.13, TypeScript 5.9.3, Tailwind 4.2.1. Check `package.json` when working on dependencies; these are a snapshot, not a recommendation to upgrade.

## Development and release

### Repository and local working copies

- Repository: [wesleycoffman/CountryDanceJudgingSoftware](https://github.com/wesleycoffman/CountryDanceJudgingSoftware).
- Current app branch: [`codex/country-dance-judging-app`](https://github.com/wesleycoffman/CountryDanceJudgingSoftware/tree/codex/country-dance-judging-app).
- Local app branch is named `main` but tracks `github/codex/country-dance-judging-app`. Do not confuse it with GitHub's historical `main` branch. `StrictlyMaster` is another legacy branch.
- Preferred development checkout: `C:\Users\Iam\Projects\Country Dance Judging App\app` (uncompressed, separate app Git repository).
- This task's workspace mirror: `C:\Users\Iam\Documents\ChatGPT\Country Dance Judging App\app`. Its parent Git repository is not the app repository. Check paths before commits or copies.
- Original legacy source location supplied by owner: `C:\Users\Iam\Desktop\Desktop\Personal Projects\Country Dance Cheats`; not the current app checkout.

There are two current local copies because Windows compression/permissions interfered with development in Documents. Prefer the uncompressed checkout. If the active sandbox only allows mirror edits, compare affected files before copying explicitly selected changes into the real checkout with the required filesystem approval. Do not silently overwrite divergence or copy node_modules/Git metadata between them.

### Commands and checks

From the app root, use Node >=22.13 and pnpm:

```sh
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

The package scripts invoke Vinext, not the standard Next CLI. Respect the lockfile and dependency security policy. `pnpm-workspace.yaml` now uses explicit boolean `allowBuilds` for the four existing native build dependencies. The earlier unresolved strings emitted ignored-build warnings. Inspect policy deliberately if install is blocked. A historical successful direct build does not prove a clean install is reproducible.

The August release had seven scoring/CSV tests. Current shared work also has focused unit, actual local D1/API and browser suites. Lint, explicit typecheck and production build are required alongside them. Tests do not confirm physical-phone/venue behavior, hosted resources or real Apps Script delivery.

For future changes: preserve scoring cases; add focused tests for new data-handling behavior; run lint/typecheck/build as appropriate for application changes. Test connector mutations against a disposable sheet. Documentation-only work needs factual/link/diff checks. Do not claim a successful TypeScript check based solely on a Vite build.

### Hosting and public sharing

For shared local development, run `pnpm install`, `pnpm build`, `pnpm db:local`, then `pnpm dev`. `pnpm db:generate` appends Drizzle SQL after schema changes. The migration helper records local applied file hashes under ignored `.wrangler/`; do not edit already applied SQL/meta or replay migrations blindly. Use `.wrangler/state` for both preview and local migrations.

With the local server running, `pnpm test:live` runs the actual HTTP/D1 suite and `pnpm test:browser` uses four isolated headless Microsoft Edge contexts (Windows default). Set `LIVE_TEST_URL` when using a URL other than `http://127.0.0.1:3000` for browser tests or `http://localhost:3000` for the Node API suite. Set Playwright's browser channel to an installed supported browser on other hosts. Outputs in `test-results/` and the local D1/cache folders remain ignored; they contain synthetic rehearsal data and are not source artifacts.

Public URL: [country-dance-judging.wes6969.chatgpt.site](https://country-dance-judging.wes6969.chatgpt.site/).

The project ID is in `.openai/hosting.json`; reuse it. Last confirmed public release was Sites version 3, baseline commit above, on 2026-08-21. No custom domain was attached at that check. Verify live access/version when a deployment task needs current information.

GitHub and Sites source hosting are separate destinations. Pushing GitHub alone does not publish the website. Follow the currently installed Sites hosting guidance: validate, push exact source to the site's repository, package that build, save/deploy the version, and verify completion/access. Never persist the temporary source token in a remote URL or this document. A documentation update alone does not require redeployment.

## Known limitations and proposed improvements

The table below primarily describes retained local/demo limitations. Shared mode has deep setup validation, scoped saves and phone ballots, but still needs the external readiness checks listed in the shared implementation status. Suggested improvements are not additional authorization.

| Area | Current gap / useful next action |
| --- | --- |
| Backup integrity | Deep validation, schema migration, file limits, and malformed/round-trip tests are missing. Unknown properties accepted by shallow validation may survive restore/export. |
| Save recovery | Invalid/failed stored-state loads may lead to starter data being saved over the old value; retain a recoverable copy before improving this flow. |
| Sheets publishing | Template not verified live. Browser success currently accepts some non-JSON or empty successful responses; require explicit `success: true`. CORS/redirect behavior needs real testing. |
| Spreadsheet data | CSV export and script cell normalization do not neutralize formula-leading strings. Add appropriate formula handling for the target consumer before claiming safe arbitrary imports. |
| Connector durability | Archive/latest writes are not atomic; retries may append duplicates. Consider explicit publication IDs, idempotency and sheet capacity handling. |
| Privacy | Local keys and event data remain accessible on shared devices. Backup files contain participant data. A public URL does not add shared storage or access roles. |
| Offline operation | No service worker or verified offline reload. Align README/preview copy with this limit or implement/test offline support. |
| Mobile/accessibility | Horizontal score scrolling, small scoring buttons, form width and dialog keyboard handling need focused usability checks. |
| Imports | Duplicate bibs and invalid rows need clearer feedback; number/role validation differs between manual entry and CSV. |
| Metadata | Host syntax is checked, but forwarded host is not pinned to a trusted deployment origin. Review before treating social URLs as trusted. |
| Portfolio polish | Clear demo identity, a safe start-blank flow, and a concise project story/GitHub link would help visitors; these are not yet implemented. |


## Live judging implementation target

**Status: the earlier shared workflow is implemented and tested locally, 2026-10-08; the revised stage/heat workflow below is design only.** The latest owner decisions override conflicting earlier requirements and implementation defaults. Implementation of this revision is on hold until the design is fleshed out and the owner asks to resume. Sites-managed D1 remains logically `DB`; the existing project identity is unchanged and R2 remains null. Both generated migrations were applied only to local D1. No hosted database, production migration, public release or paid plan was created.

### Stage workflow revision — design only

This is the authoritative owner direction from the latest 2026-10-08 clarification. It has not been implemented or tested. The final clarification supersedes the earlier suggestion of submitting each song separately: use separate song pages, autosave drafts, and one final submission at heat end.

The organizer starts **Prelims** or **Finals** as a stage. A stage spans all its scheduled divisions/competitions and heats, which normally run back to back. Each heat is one group of contestants on the floor and has its own 2–3 song performances. Discussion, official score combination and stack ranking occur only after the entire stage: prelims → review/advancement → finals → review → winners announced. There is no discussion break between songs, heats or divisions. Starting a stage does not remove the need to retain the exact division, heat and song context for every score.

**Separation of duties:** the organizer manages setup, running order and the stage review room, but cannot be an ordinary judge or the head judge in the same event, enter judging scores or cast judge tiebreak votes. The head judge is a separate person on the judging panel. Both roles can approve a genuine error correction in their respective capacities; neither may supply both required approvals. Distinct roles must be checked server-side for assignment, scoring, voting and correction approval. The current private-link model does not prove human identity: how the event establishes distinct role holders without adding custom accounts still needs design. This requirement is confirmed; organizer/head role overlap is no longer an open choice. Existing code has not been verified to enforce it.

**Competition removal:** retain the organizer's **Remove competition** action and the separate **Remove heat** action. Competition removal is already implemented in the earlier shared workflow described below, at `/live/<organizer-code>` → Set up → Program & discussion blocks. The local/demo Set up → Program at `/` currently has add/select/edit controls but no competition-removal button; do not claim that the control exists on that surface. The removal requirement includes making the control discoverable in the setup/program UI the owner uses; adding local/demo removal remains unimplemented and must preserve legacy scoring and v2 backup compatibility. Before shared judging starts, confirmation removes the competition's rounds, rosters, heats, songs and running-order references from the setup draft; Save setup applies the change. After judging starts, withdrawal must retain frozen definitions, scores, submissions, approvals and amendment history, with a reason and explicit invalidation of affected running-order/results references. It must not silently discard judged work or bypass the new score-correction approvals. The existing whole-event setup correction resets opened rounds, so its fit with the revised stage/heat locks must be reconciled before implementation resumes. Competition withdrawal approval details are not yet settled.

| Step | Intended behavior |
| --- | --- |
| Start stage | Organizer starts the stage once; the running order supplies each heat and division. Judges keep their event-long private links. |
| Song pages | One heat form has separate pages for Song 1, Song 2 and Song 3 where scheduled. Judges navigate between that heat's song pages, score each competitor and enter optional per-song notes. Autosave remains draft saving, not final submission. J&J partner context changes with the song; individual identity does not. |
| Missing-coverage reminder | Show each judge which entrants have no mark from them in the current song and which have not been scored by them anywhere in this heat. Show counts and conspicuous blank/needs-attention states while preserving stable bib order and focus. A valid No=0 counts as scored. |
| Heat-end lineup | Contestants line up so judges can confirm bib/identity, finish scoring everyone from their own observations and make slight revisions before submission. Judges can revisit the heat's song pages during this check; other judges' scores must not be used to fill blanks or influence marks. |
| Submit heat | One final heat submission captures all of that judge's song pages, notes and explicit blanks. Each assigned entrant must have at least one valid mark from that judge across the heat's songs. Every assigned judge must meet this coverage requirement. It does not require a mark for every entrant on every song. |
| Next heat | Only after server acknowledgement of final heat submission, remove that completed heat's entries from the judge's active scoring form and present the next scheduled heat with its stage, division/format and heat information. This is a view transition, not deletion of scores. Align entry with the room's running order; if the room has not reached the next heat, show a waiting state. Completed heat entries return for read-only review at stage conclusion, rather than remaining editable in the active form. |
| Stage conclusion | After every scheduled heat/division finishes, assemble the submitted heat scorecards, show coverage/blanks, calculate averages and stack-rank within the existing division and lead/follow/couple groups under the agreed formula. The organizer room hosts comparison and review of submitted records. Judges' stage review is read only; their normal score-affecting interaction is voting on advancement tiebreakers, not editing marks or filling missed song cells. |
| Approval and onward flow | Keep computed numeric scores separate from tie-vote outcomes. Retain the event-wide head judge and final result approval; advancement decisions precede finals, and winners are announced after final-stage review/approval. Publication remains a separate explicit action. Voting mechanics and the scope of finals-placement tie voting still need agreement. |

**Coverage and blanks:** the required unit is each judge × assigned entrant × heat, covered by at least one mark across that heat's songs. A blank individual-song cell means no score was submitted for that judge/entrant/song; keep it blank, rather than making it No, zero, a copied score or a guessed observation. A note without a mark does not satisfy coverage. For Strictly and J&J finals the scoring subject remains the fixed couple; J&J prelims retain individual Lead/Follow subjects. Heat-complete status must check the agreed coverage rule. Handling a heat that reaches the end with coverage still missing needs an explicit exception/escalation policy; do not silently relax the rule or manufacture scores to continue.

**Submission and visibility:** song pages remain revisable until that judge's final heat submission, including the lineup check. After submission, all those song cells are locked. Unacknowledged or failed submissions must retain the heat form and pending edits, with truthful sync status. A room-context change or delayed retry must never attach a previous heat's edit to the next heat. Keep other judges' marks hidden while scoring/lineup checks are in progress; stage-end comparison uses already submitted records. The earlier author-only note policy remains implemented; who may see private notes in the organizer review room or on published scorecards is still an open design choice, not an authorization to expand access now.

**Tie voting:** judges may vote on the tied entrants competing for advancement after the stage closes. Votes affect advancement/placement decisions, not the numeric marks or averages. Preserve the tied candidates, eligible voters, ballots, vote outcome and review versions separately. The voting method, quorum, abstentions, tied-vote resolution, cutoff membership and any finals/winner tie-voting extension are not yet settled. Earlier head-only tie-order controls are the current implementation, not proof that panel voting exists.

**Error corrections:** scores can change after final submission only for an actual error, with approval from **both the organizer and the event head judge, as distinct people**. Both must approve the same exact correction against the same source version; a changed request requires fresh approvals. Preserve the original and corrected values, affected judge/entrant/song identities, reason, requester, timestamps and both approval records. A mistaken-contestant correction must identify both the wrong and intended entries explicitly. Apply corrections as recorded amendments, never as hidden replacement or routine stage-end editing. Recompute affected results and require renewed review/approval of affected tie votes, advancement and published outcomes; retain prior scorecard/result versions. Error correction must not become a route to guess or copy a missing observation. Requester permissions and operational handling after advancement/publication remain to be settled.

**Transparency:** the owner reports that their competitions already publish judge scorecards separately after each competition; this is competition practice, not a claim that the app currently exports those cards. The revised target is scorecards showing every scheduled judge/entrant/song slot, including explicit blanks, valid No marks, coverage counts and disclosed approved amendments. Do not hide missing observations or overwrite the evidence of a recording error. Ordinary note privacy and access-code exclusion remain separate from score transparency.

Remaining design decisions before implementation:

| Decision | What is settled / still open |
| --- | --- |
| Averaging with song blanks | Every assigned judge must cover every entrant at least once in the heat. The exact formula is open: averaging all recorded cells weights judges with more observations more heavily; averaging each judge's observed songs first and then the judge means preserves equal judge weight. The latter is a proposal, not a confirmed rule. Show the observation counts either way. |
| Heat and room transitions | Heat-end submission, disappearing completed entries and next-heat context are confirmed. Define observation/submission deadlines, late acknowledgements, room advancement when a judge is still pending, and the response to genuinely missing heat coverage. |
| Tie-vote rules | Advancement voting is confirmed. Define eligible panel, ballot method for multiple tied candidates/remaining places, quorum/abstentions, vote deadlines, deadlock resolution, and whether finals-placement ties use the same process. |
| Review and disclosure | Read-only stage review and transparent song blanks are confirmed. Define note visibility, when judges see one another's submitted scorecards, and which correction details appear in public scorecards. |
| Correction approvals and distinct roles | Organizer plus head judge approval of genuine errors is confirmed, from distinct people; the organizer cannot judge, score or cast judge tie votes. Define practical enforcement without custom accounts, requester permissions and handling after finalists advance or results are published. |
| Competition withdrawal | Keep Remove competition, with confirmation and preserved judging history. Define withdrawal approvals and its effect on the remaining stage/running order without reopening submitted scores or circumventing correction approval. |

Future acceptance checks must cover navigating separate song pages during the lineup check; partial song rows with complete per-judge heat coverage; missing-coverage reminders; atomic/retry-safe heat submission; acknowledged disappearance and correct next-division context; no mid-stage discussion/ranking; read-only stage review; voting restricted to valid ties; rejected organizer scoring/voting and overlapping judge assignments; dual approval of an exact correction by distinct role holders; competition removal/withdrawal with preserved history and valid remaining stage context; disclosed blanks/amendments; and preserved legacy/local backups. Existing test results below verify the earlier workflow, not this revision.

### Current implemented behavior and operating details (before this revision)

| Milestone | Implemented behavior / source |
| --- | --- |
| Shared foundations | Separate shared types and ten D1 tables; frozen round generations; 256-bit server-generated organizer/judge codes, hash lookup, revocation and role/assignment checks. [Schema](db/schema.ts), [server](lib/live/server.ts), [migrations](drizzle/meta/_journal.json). |
| Organizer setup | Blank creation from local Set up; event panel/head; both formats/divisions; manual rosters/CSV, heats, 2-song initial lists with add/remove controls, private song metadata, optional rotation maps, ordered discussion blocks, explicit finalist counts/selection and entered fixed J&J pairs. [Desk](components/live/desk.tsx), [editor](components/live/setup.tsx). |
| Phone ballots | Compact 64px vertical rail, stable bib rows, four 44px marks, no re-tap clearing, explicit clear, collapsed per-song notes, current/past-song selection and an explicit context-change button that retains the old edit target. [Ballot](components/live/judge.tsx). |
| Save recovery | About 500ms debounce; one cell per save, expected cell revision and operation ID. Committed acknowledgement includes revision/time. Author-scoped pending cache survives an online reload, retries transient failures with bounded backoff and requires visible comparison for conflicts. Delayed status reads cannot roll back acknowledged cells. No offline reload promise. |
| Discussion/results | Discussion after the entire visited block; one atomic finalized submission across the judge's assigned rounds; immutable per-round snapshots and locks. Only submitted marks feed equal-weight averages, with exact sum-in-tenths/denominator and per-song detail. Ordinary links cannot decide ties or approve. [Results](components/live/results.tsx). |
| Head review/corrections | Explicit ordered or shared-place tie decisions; exact submission fingerprint, round version and current head required for approval. Reopening creates a new generation, carries compatible saved cells, preserves history and invalidates dependent finals. Setup correction explicitly resets the whole event's opened rounds to preparation and retains historical versions; it requires a reason/confirmation. |
| Exports/lifecycle | Clearly labeled provisional/approved average CSV and print, optional explicit Sheets send, backups without codes and without judge notes by default, explicit note inclusion, restore into a fresh event with regenerated IDs/links and inert historical records, read-only archive and confirmed permanent delete. No automatic expiration. |

The main desk receives acknowledged completion counts and finalized submission progress, without draft mark values or author notes. Four-second status reads update other devices. Future song titles/artists and selection notes stay organizer-only; head review includes submitted marks and their context but only the head's own private notes. Private routes request no indexing/referral; API payloads are no-store. The application does not log access codes, request bodies or raw D1 failures. Provider-level production logging has not been checked.

Heat controls include **Remove heat** during preparation (or an explicit versioned correction). Removing a heat removes its scheduled songs/partner maps from the setup draft, keeps its contestants in the roster and leaves them unassigned for reassignment. Configured/occupied heat removal asks for confirmation, the last heat is retained, and changes require Save setup. Adding a heat uses an unused name rather than duplicating a surviving heat name.

**Remove competition** is available beside each format/division in Program & discussion blocks. Confirmation removes that competition's prelims/finals, rosters, heats, songs and references from both running-order blocks in the setup draft; Save setup applies it. The selected round falls back to a surviving round. Removing all competitions leaves an editable empty program, and adding another reuses the discussion blocks with fresh identities. Event judges and private links remain unchanged.

Once judging has started, competition removal uses the explicit versioned setup correction and a reason. The existing whole-event correction resets opened rounds to preparation and clears room context. Withdrawn rounds disappear from active scoring/results, while their frozen definitions, ballots, submissions, tie decisions and approvals remain in database history/backups. Late saves or approvals cannot act on withdrawn rounds. Default backups still omit private judge notes; explicit note inclusion also preserves notes for withdrawn rounds.

The Score desk distinguishes **Start prelims/finals judging** from **Start discussion after all songs**. Per-block readiness lists name the format, division, empty heat or unassigned bibs; the same opening validation runs on the server. Unsaved setup edits and missing prelim approval are explained. The operator advances through every division/heat/song in block order, with a visible song count; discussion becomes available at the final scheduled song after all occurrences have been visited. Each heat is the group of contestants on the floor, with its own songs. J&J prelim partner maps are optional and independent for each song, reflecting rotation between songs while marks stay anchored to each dancer.

Shared backup format is `country-dance-live-backup`, `backupVersion: 1`; it is distinct from legacy v2 backups. It preserves setup, context, draft mark history, frozen definitions, submissions, decisions/approvals and restored archives; private judge notes require the explicit checkbox. A restore starts new active rounds in preparation and keeps imported results historical. It does not impersonate original access holders or overwrite the current event. Keep the organizer link separately: it is intentionally absent from backups.

Setup is bounded to 15 judges, 8 competitions, 16 rounds, 8 discussion blocks, 200 subjects per round, 6 heats and 6 songs per heat; notes are at most 2,000 characters and request/restore bodies at most 1.5 MB. D1 also imposes row/storage limits; larger-than-rehearsed events need capacity testing. A lost organizer link currently requires restoring a backup into a new event; account-based recovery is not implemented.

Verification: 12 unit/legacy tests, 8 actual local HTTP/D1 checks and 4 browser tests passed, alongside lint, explicit TypeScript checking and a production build. The original 7-check HTTP/D1 rehearsal also passed against the compiled Worker running locally on port 3001. These cover isolation, revoked roles, stale and competing cell saves, duplicate retries, atomic block submission/approval races, locked late writes, setup corrections, pair finals and archive/delete; browser checks use isolated organizer, two ordinary judge and head judge contexts at 360/390px. Rehearsal data included 44 Strictly couples across both divisions, multiple heats and 2–3 songs, plus individual J&J prelims and fixed-pair finals. Browser checks exercised an interrupted save, online reload/retry, note focus/scroll during room changes, finalized block submissions, head tie/approval, manual finalist pairing, reopening, CSV and legacy wrapped backup restore. A focused regression also verifies occupied-heat removal cancellation/confirmation, preserved rosters and reassignment, unique heat names, explicit per-division readiness and discussion gating across the whole block. Competition-removal checks cover cancellation, both round/block references, persistence, empty-program recovery, correction permissions, retained judging history and rejection of late withdrawn-round writes. Physical phones, venue Wi-Fi, production quotas/provisioning, production migration/deployment and real Sheets sends remain unverified.

### Confirmed owner requirements

- One head judge is designated for the whole event and identified on the main desk.
- Generate private judge links with random codes automatically from the event's judge list. Send each judge their own link separately. Judges and the organizer should not need accounts, manual codes, database setup or technical instructions.
- Judges enter and save separate marks and notes on phones during the music. Each song has its own marks and notes; do not replace several songs with one evolving round score.
- Judges use separate song pages and finalize their heat after the lineup check and slight revisions. Every judge must score every assigned entrant at least once across that heat; individual song blanks can remain. Stage-end discussion follows all heats/divisions and does not reopen ordinary score editing.
- Judges vote on advancement tiebreakers during read-only stage review. Retain the event-wide head judge and final approval; voting mechanics remain open. Numeric averages must remain distinct from voting/placement decisions.
- Submitted scores may change for genuine errors only with both organizer and head judge approval, with original values and disclosed correction history retained.
- Anyone holding a judge's URL may read that judge's notes. Other judges' ballots should remain relatively hidden; public official publication occurs elsewhere after the competition.
- Typical nights run either Jack & Jill or Strictly; support both in one event if scheduled. Each format has Beginner/Intermediate and Advanced divisions. Prelims typically have 1–3 heats and finals one heat, with 2–3 songs per heat.
- Jack & Jill prelims score lead and follow separately for each song, with rotating partners. Finals use an assigned random pair that stays together across its songs, receives couple marks and wins/loses together. Strictly couples enter together and remain together.
- Preserve the existing site's visual template and practical competition desk.

### Fit with the existing template

Keep the warm paper panels, forest vertical navigation, copper/gold accents, bib badges, familiar Yes/A1/A2/No controls and organizer desk layout. Extend the existing views instead of replacing the product with a different dashboard.

| Existing surface | Implemented shared-event extension |
| --- | --- |
| Set up | Create the shared event; choose format(s)/divisions; enter judges and head judge, rosters, rounds, heat assignments and private song lists; copy judge links. |
| Score | Organizer sees the current section/heat/song, save and submission progress, and submitted scores. Judge links open a compact single-judge phone ballot using the same design language. |
| Results | Show per-song detail, submitted-score averages, provisional rankings, head judge tie decisions and approval; select finalists explicitly. |
| Publish | Retain backups, CSV/print and optional Sheets publishing. Shared exports use explicit average/approval fields and omit private notes/access codes by default. |

The existing score table is an organizer-style matrix with an 880 px minimum width and 31 px controls. Reuse its visual vocabulary, not that table geometry, for phones. Current results sum one mark per judge, show shared places for ties and save revisions without locking marks. Shared per-song averages, pair finals, tie decisions and approval locks use separate types and server operations; they do not reinterpret existing local data.

### Event structure and judging blocks

Use distinct records with stable IDs:

    Event (one head judge)
      Competition = format + division
        Round = prelims or finals
          Heat = scheduled group of dancers/couples
            Song performance = one specific song in this heat
              Judge marks and notes for each scoring subject

A song performance is an occurrence, not just a title: the same track in two heats must not merge their scores. Keep round ballots independent so prelim marks cannot leak into finals.

A stage groups the matching prelims or finals rounds across scheduled competitions/divisions. The existing code calls its scheduling group a block; the revised user flow starts stages. The intended Jack & Jill schedule is:

1. All Beginner/Intermediate prelim heats, then all Advanced prelim heats. Each heat has song pages, a lineup check and each judge's final heat submission; there is no discussion break between heats/divisions.
2. Stage-end read-only review, official averages/stack ranking, judge voting on advancement ties, head approval and finalist selection for both divisions.
3. Beginner/Intermediate finals heats, then Advanced finals heats, with the same song-page/lineup/heat-submission process.
4. Stage-end read-only review, official averages/stack ranking and result approval. The final-placement tie-voting scope remains open.
5. Announce winners separately.

Apply the same stage structure to Strictly and allow the organizer to order enabled sections when running both formats. Song boundaries preserve drafts within the heat form; heat-end final submission locks that heat and removes its entries from active judging. Neither boundary opens discussion or official ranking/publication. Stage conclusion is the review break.

Assign entrants and required judges before a round opens. Freeze those assignments and the scheduled scoring occurrences. An entrant is assessed on the songs in their assigned heat, not every song across every heat. Corrections to rosters, assignments or head judge designation require explicit versioned changes that invalidate affected submissions/approvals. Never silently delete live work through the current import/remove/reset handlers.

Prelim approval and explicit finalist selection precede opening the affected finals. Record Jack & Jill finalist pairings against the existing individual IDs. Initial implementation supports organizer selection of finalists and entry of the randomly assigned finals pairs; it need not generate the random draw. Validate that each selected finalist appears once and each pair has the required roles. Finalist counts are event configuration, not hardcoded assumptions. No automatic advancement or sanctioning-body rules are implied.

### Private song setup and linked review context

Provide a private song list within organizer setup: title, artist, performance order and optional tempo/style/selection notes, linked to format, division, round and heat. Metadata entry is sufficient for this scope. Use stable song-performance IDs rather than title strings as score keys.

The operator manages the stage's running order once for the room. The revised judge form has separate song pages within the current heat; pages retain their original song/partner context through the lineup check. Final heat submission locks those pages and replaces the active roster with next-heat context. Completed heats return for read-only stage-end review. The current implementation instead offers visited-song selection across opened rounds; that behavior has not yet been revised. Future song metadata remains organizer-only and must not appear on the public/demo page.

Each mark and note belongs to judge + round + song performance + subject (dancer or couple). During review, selecting an entrant reveals the song title/artist, the judge's mark and note, and available partner context. This supports recalling why a dancer received a particular mark on a fast or slow song.

Jack & Jill prelim rotations should support a prepared partner map where known, controlled by the organizer. Do not require a judge to log partner changes while also scoring. Individual scores remain anchored to the dancer's ID/bib when their partner changes. Initial implementation makes a per-song prelim partner map optional and labels missing context honestly; finals pair identity is required.

### Per-song marks, averages and head judge tiebreaks

Retain mark values: Yes=10, A1=4.5, A2=4.3, No=0. No is completed; blank is missing, never silently converted to No. Notes are optional.

| Format / round | Mark and note ownership per song | Ranked result |
| --- | --- | --- |
| Strictly prelims and finals | One mark per fixed couple per judge per song. | Couple average; separate results per division and round. |
| Jack & Jill prelims | Separate marks for each lead and follow per judge per song, independent of changing partner. | Individual averages; rank leads and follows separately within each division. |
| Jack & Jill finals | One mark per assigned couple per judge per song; pair remains fixed for all finals songs. | Couple average; the two members share the pair's placement. |

Equal weighting of all required judges and songs is the current implemented shared default, before the stage/heat revision. For a complete ballot:

    Round average = sum of submitted numeric marks / number of required marks

For example, three judges scoring three songs produce nine equally weighted marks for one dancer/couple. Do not average heat totals or count songs from another heat. With a complete fixed judge panel, averaging each song across judges and then averaging those song means produces the same result. Weighting or judging assignments must be explicit if changed.

**Current implementation:** the main desk receives finalized block submissions, calculates provisional standings only from complete required marks and requires the full panel/ballot for approval. It excludes incomplete subjects rather than using a smaller denominator. **Revised target:** accept individual song blanks when each judge has covered every assigned entrant at least once in the heat; combine and officially rank submitted heat records only after the whole stage ends. The partial-song averaging formula remains open in [Stage workflow revision](#stage-workflow-revision--design-only). Do not silently apply the old completeness rule or silently choose available-cell averaging for the new flow.

Sort by unrounded average, descending, within the appropriate division and role/pair group. Formatting must not create apparent ties that are used for decisions. Record exact numeric inputs/denominators and preserve the existing numerical tolerance where applicable.

Equal averages are flagged separately from numeric scores. Current code lets the head judge set tied order/shared places. The revised target lets judges vote on advancement ties during read-only stage conclusion, with final head approval; voting mechanics and final-placement tie handling remain open. Preserve averages and separately record tie candidates, votes/outcome, timestamps, eligibility and approving role. Never fabricate a score, reorder unequal averages through a tie vote, or use entry IDs/names as an automatic sporting tiebreak.

Current local/demo sum scoring and shared-place ranking (1, 1, 3) remain the implemented baseline until an explicit migration/change. Shared-mode exports label Average Score and head-approved Place clearly instead of silently replacing a legacy Total field with an average.

### Phone workflow during the music

This target incorporates the design-only stage/heat revision. The entry screen prioritizes looking up a bib and tapping a mark on the current heat's song page, with no per-entry save or confirmation step. Final submission is once per heat after the lineup check.

- One link per judge works for the entire event, including every category, heat and song. Open directly to the current ballot; confirm judge identity prominently without login/setup.
- Show only the active heat roster in stable bib order. Jack & Jill prelims provide Leads/Follows filtering. Clearly flag own unscored song entries and entrants never scored by this judge across the heat; filters must not hide unmet heat coverage from submission review.
- Use compact rows, recognizable bibs and comfortable touch targets, aiming for at least 44 px controls without horizontal scrolling. Keep names/partner information available without oversized cards. Retain a compact vertical rail.
- One tap selects Yes/A1/A2/No; tapping a different mark changes it. Re-tapping the selected mark does not accidentally clear it in live mode; clearing is an explicit action.
- Keep notes collapsed behind an entry note control. Typing is optional during music; judges can revisit song pages during the heat-end lineup before submission. Submitted notes are locked with the heat; stage review is read only. Phone keyboard dictation may be used as ordinary text entry. Notes remain linked to the song.
- Autosave without stealing focus, reordering rows or jumping scroll position. Brief save feedback should not cover the ballot. Marking a row must not make it disappear.
- Room transitions must not replace a form while a judge is typing or midway through a touch. Preserve the original heat/song edit target until pending changes and final heat submission are acknowledged. Previous song pages in that heat remain available for the lineup check; completed heat entries leave active judging and return for stage-end read-only review.
- Submit heat checks at-least-once coverage of every assigned entrant by this judge, synchronization and current revisions, then commits all song pages and their blanks together. A successful acknowledged submission hides that heat's entries and presents the next heat/division, or a waiting/stage-complete state. Do not make a separate per-song submission mandatory under the latest clarification.
- At stage conclusion, judges review submitted cards without editing numeric marks and vote on eligible advancement ties. The head judge retains approval; organizer plus head approvals are required for any genuine score-error amendment. These new voting/correction controls are not implemented yet.

The operator handles the running order centrally. Judges should spend their attention on the dancers, not managing rounds, finding links, entering codes or repeatedly selecting metadata.

### Shared storage and automatically generated links

Recommended implementation: a Sites-managed Cloudflare D1 database behind server API routes in the existing Vinext application. The current .openai/hosting.json declares d1: DB; vite.config.ts retains conditional D1 binding wiring. Installed Sites persistence guidance supports a logical DB binding and platform-managed resource provisioning. This verifies the supported design path, not a provisioned/live database.

When implementation resumes, retain the D1 binding, version schema changes and add access-checked save/read/submit/approve operations. Hosted wiring and deployment through the existing Sites project require a separate deployment request. Sites handles the hosted database wiring; judges and the organizer use ordinary website controls. Keep data access server-side; no database credentials go to phones. See [Cloudflare D1](https://developers.cloudflare.com/d1/) and [Workers database access](https://developers.cloudflare.com/d1/worker-api/).

The flow is phone → website server → shared event database; the main desk reads that same database. A phone keeps a temporary pending-edit cache for connectivity loss, but the server copy is authoritative. Small debounced scoped saves and lightweight status refresh are sufficient starting points; a realtime messaging framework is not required to make saved submissions appear automatically.

Adding a judge automatically creates an event-scoped access code using a cryptographically secure random source, with at least 128 bits of randomness. Never reuse the ordinary domain ID helper's Math.random fallback for access secrets. Generation happens once server-side; do not create a new link on every render, save or song change. See [secure random generation](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues).

Show Copy judge link and optional QR code next to each judge in organizer setup. The organizer sends links individually through their usual messaging app; this specification does not send messages. Suggested path: /judge/FirstNameLastName/<random-code>. Judges tap the message and never type the code. Preserve links across name changes, handle duplicate names through stable IDs and allow explicit replacement/revocation. Anyone holding a full link can use that judge's page.

A separate organizer access link controls shared setup. The event head judge's link grants the additional approval/tie role. Server access checks scope ordinary judge links to their own marks/notes; other judges' private payloads are not sent merely to be hidden by CSS. Notes are visible to whoever holds the authoring judge's link, and are excluded from the main desk/head review and general result exports by default.

Public visitors continue to see the existing demo/local experience. Do not publicly list live judge links, playlists, ballots or internal results. Request no indexing on live pages and keep access codes separately managed, out of event backups, result exports, source and routine logs. Link-sharing is intentionally the access model; no account system is proposed.

### Storage options and cost constraints

**Owner preference, 2026-10-08:** avoid significant recurring monthly expense and prefer a simple solution. Sites-managed D1 is the implementation starting point; no paid plan or spending limit has been selected. The alternatives below preserve the evaluated options, not extra implementation scope. Hosting the current frontend alone does not create shared event persistence. Shared durable storage can be a database, private object files or a spreadsheet behind an API; all options still need server-side access checks, safe concurrent saves and the submission/approval workflow.

Recommended first choice remains D1 on the existing Sites project. Sites manages its database provisioning and binding; this route does not require a separate owner Cloudflare account. Direct Cloudflare deployment does require that account. Judges and the organizer need neither database accounts nor database setup. [Official OpenAI pricing](https://learn.chatgpt.com/docs/pricing) states Sites is included with eligible ChatGPT plans during public beta. [Sites documentation](https://learn.chatgpt.com/docs/sites) confirms D1/R2 support, a 10 GB D1 storage limit per Site and plan-specific usage limits across Sites; high usage can restrict storage/public availability. Account-specific remaining capacity has not been verified. Do not promise indefinite free hosting, unlimited traffic or apply direct Cloudflare free-tier quotas to Sites-managed resources.

| Option | Cost evidence checked 2026-10-08 | Fit / tradeoff |
| --- | --- | --- |
| Existing Sites + D1 | Sites included in eligible ChatGPT plans during public beta, subject to plan limits. | Fewest additional services; preferred starting point. Verify the account's storage/usage allowance before provisioning. |
| Direct Cloudflare Workers + D1 | Free Workers: 100,000 requests/day, 10 ms CPU per invocation. Free D1: 5 million rows read/day, 100,000 rows written/day, 5 GB total storage. Paid Workers minimum is $5/month plus usage beyond allowances. | A low-cost alternative under the owner's own Cloudflare account, either hosting the app or just its save/read API. Needs separate deployment setup and free-tier CPU/request testing. |
| Private JSON ballots in Amazon S3 / Cloudflare R2 | S3 has no minimum charge and meters storage, requests and applicable transfer. Direct R2 Standard free allowance: 10 GB-month storage, 1 million Class A and 10 million Class B requests/month, with free direct egress. | Viable without a relational database. Server code must load/aggregate ballots and coordinate conflicts, immutable submissions and approval across objects. Existing Sites supports R2; adding AWS adds another service/account configuration. |
| Google Sheets + Apps Script | Consumer accounts are supported with execution/service quotas; no separate database service is required. Exact account/billing conditions not checked. | Familiar administrative view, but requires a new read/write backend and measured autosave/concurrency behavior. The existing publisher is outgoing results only, not this backend. |
| Self-hosted server + SQLite or private files | No managed database subscription on existing hardware; compute, power and public connectivity remain the owner's responsibility. | SQLite is a compact database file suitable behind a small website server. Event-day uptime, network access and backups need operator setup; less convenient for a nontechnical organizer. |
| Supabase | Free: 500 MB database and project pause after one week inactive. Pro starts at $25/month. | Capable, but another service and pause/resume upkeep for occasional events. Not the preferred fit for this small workflow. |

Primary sources: [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [S3 pricing](https://aws.amazon.com/s3/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas), [SQLite website use](https://www.sqlite.org/whentouse.html) and [Supabase pricing](https://supabase.com/pricing). These are dated provider terms, not a bill estimate or a promise of availability.

If object storage is selected, keep the bucket private and access it through the website server. Use separate draft objects per event/judge/round/song, stable IDs and conditional version checks, not one event JSON file overwritten by every phone. Preserve immutable submitted objects and approval references to their exact versions; coordinate round changes and approvals explicitly because a set of object writes is not a database transaction. [S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html) support detecting stale overwrites. Test equivalent R2 operations before claiming the design works there. S3 static website hosting alone does not supply this save/approval API.

Illustrative sizing, not a confirmed event roster: 100 individual prelim entrants plus 20 finals couples, three songs each and four judges yield 1,440 mark cells across the event. This is small structured text data. Billable operations are higher than mark count because notes, revisions, indexes, retries and status refreshes also consume operations. Coalesce note saves, query only needed indexed records and refresh status sensibly; do not write every keystroke or repeatedly fetch the whole event. Validate quotas, CPU use and recovery with a representative competition rehearsal before relying on any free tier.

D1 is recommended for active structured judging; object storage is an alternative, not an extra required service. Add R2/S3 for archives/files only when that capability is actually needed.


### D1 design sketch

Architecture for the requested implementation; the logical records below are implemented through db/schema.ts and the generated local migrations. Use one database for the Site, with stable event IDs separating competitions and event history. Each judge's private link controls server access to their records; D1 alone does not supply judge permissions.

| Logical records | Purpose |
| --- | --- |
| Events, judges and private access records | Event-wide head judge, organizer role, judge links and revocation; access secrets managed separately from exportable event data. |
| Competitions, rounds and discussion blocks | Format/division, prelims/finals, assigned judges and the point when discussion/submission opens. |
| People, round entries and pair membership | Stable individual IDs for J&J prelims; fixed pairs for Strictly and J&J finals, linked to their members. |
| Heats, song catalogue and performance occurrences | Private song metadata and a unique heat/song occurrence, even when the same track plays twice. |
| Mark cells and ballot versions | One mark and optional note per judge, performance occurrence and scored subject; save time and revision. |
| Submitted snapshots | Exact finalized marks, notes and song/roster context, retained separately from editable drafts. |
| Tie decisions and approved result snapshots | Source submission versions, computed averages, head judge decisions and correction history. |

Example: a J&J prelim mark belongs to judge A + heat 2/song 1 occurrence + dancer 42. Changing partners in song 2 produces another mark for dancer 42. In finals, the scored subject is the assigned pair instead. Never use a dancer name, song title or current screen selection as the record identity.

An autosave sends only changed cells, an operation ID and expected revisions. The server validates link ownership, assignments and round/ballot state, rejects stale edits and acknowledges committed revisions. The phone displays Saved to event only after that acknowledgement. Keep pending edits on the phone for safe retry; do not overwrite the entire shared event on each save.

The current backend verifies complete required marks and captures immutable per-round snapshots at block submission. The revision will need immutable heat submissions containing all song pages/explicit blanks, heat-coverage validation, stage review/voting records and correction requests with two approval records. Schema/endpoint details have not been chosen or implemented. Official results must reference exact submitted/amended versions and vote outcomes. Keep these operations atomic and retry-safe. D1 supports transactional prepared-statement batches, but a conditional update matching zero rows is not an SQL failure: guard related writes and handle version conflicts. See [D1 batch operations](https://developers.cloudflare.com/d1/worker-api/d1-database/).

Keep the organizer's existing four-view desk. Setup adds Copy judge link, head judge selection and heat/song setup; Score shows submission progress; Results shows averages, ties and approval. Judges only see their mobile ballot. Schema definitions and generated migrations now exist; only D1 is enabled logically, with R2 unused. Before release, verify remaining Sites allowance, concurrent saves and submission locking in a representative event rehearsal.

### Save, submission and approval reliability

Distinguish Saving, Saved to event with time, Saved on this phone / waiting to sync, and Save failed. Only server acknowledgement means shared storage received an edit. Retain available local drafts and retry pending changes after connectivity returns; a second phone cannot recover edits that never left the first. Offline first load/reload needs deliberate application caching and testing before it can be promised.

Version individual ballots/observations and update only their own records. Different judges cannot overwrite one another by sending a full event object. Same-judge conflicts across tabs/devices require visible resolution. Edits retain their original song/entry context during operator transitions and delayed retries.

Revised target lifecycle: preparation → start stage → song-page drafts → heat-end lineup/revisions → final heat submission → next heat/division → whole-stage read-only review and official averages/stack ranking → advancement tie votes and head approval → next stage / winners announced. Current code instead submits complete round snapshots during discussion after an entire block; do not label it as the revised lifecycle.

The revised heat submission requires at least one valid mark per assigned entrant by that judge across the heat, successful synchronization and current revisions; individual song blanks are permitted. Snapshot the entire heat's song pages/notes/roster context and lock them. Only acknowledgement permits removal from active judging. Stage approval checks all required heat submissions, the agreed averaging formula and current tie-vote results. Save/submit/vote/approve operations must resist duplicates and stale versions.

Submitted-score correction requires a genuine error and explicit approvals from both organizer and head judge for the exact amendment. Preserve original snapshots, reasons and approvals; invalidate affected results/votes/advancement approval for renewed review. Current code's single-role Reopen is insufficient for this target. Delayed phone edits cannot alter locked snapshots. Export/publication remains a separate explicit action after approval.

### Data compatibility, open choices and verification

Conceptual schema additions: shared event and event-wide head judge; competitions/divisions; stable rounds; judging blocks; heat assignments; song catalogue/performance occurrences; individuals and pair membership; optional prelim rotation maps; required judge/subject/song assignments; per-song observations and notes; versions/save times; finalized submissions; averages and source counts; tie decisions; approvals/correction history; separately managed access credentials. The concrete shared schema is defined in db/schema.ts; these conceptual records are stored as explicit tables and versioned setup/round documents.

Preserve existing local events, storage keys and v2 backups. A migration must explicitly distinguish current round-level marks from per-song data; never invent a song history or approved status for legacy marks. Import into shared mode is deliberate. Shared backups preserve ballots/history/context, exclude access codes, and clearly disclose private-note inclusion. Restore/import cannot silently replace an active shared event. Define event archiving and retention before release.

Compatible existing defaults remain: organizer sees draft completion/sync progress rather than other judges' draft values; notes lock with submission; manual heat assignment and finalist configuration; manual entry of randomly drawn J&J finals pairs; optional prelim partner maps; upcoming songs organizer-only. Finalist counts remain configurable. The stage/heat revision supersedes all-cells-required block submission, stage-end mark refinement and head-only advancement tiebreaks. Equal weighting with partial song observations, review-note visibility and voting mechanics are open choices, not settled defaults; see the revision above before resuming implementation.

Create an explicit archive action that retains an event/history, and an explicit confirmed delete action; do not automatically expire events. Exports remain available before deletion. A precise long-term retention policy, automatic pairing, weighted scoring, playlist media uploads and guaranteed offline reload are future work, not requirements for the first complete shared workflow.

Acceptance checks for the earlier implemented baseline (new revision checks are listed above):

- Two phones use one event with separate drafts and recover acknowledged saves on reload; links persist across songs/heats/divisions.
- Every per-song score/note survives transitions and references the right title, heat, entrant and pair context, including repeat track titles and Jack & Jill rotations.
- A rehearsal with 20+ couples, 2–3 songs, multiple heats and both divisions demonstrates practical bib lookup, one-tap marks, note entry and no forced loss of focus.
- Jack & Jill prelims retain individual marks across partner changes; finals score fixed pairs and produce shared pair placements.
- All songs/judges contribute equally to complete averages; missing marks cannot improve ranks through a reduced denominator. No is valid; notes are optional.
- Main standings use submitted marks only and distinguish provisional averages from approved results. Ordinary judge links cannot approve or decide ties.
- The head judge resolves tied averages without changing numeric scores. Stale submissions/tie decisions cannot be approved.
- Private discussion starts after the configured whole block; finishing one heat/song does not submit or approve.
- Concurrent/retried saves do not lose edits or duplicate submissions; offline recovery is truthful; locked scores resist delayed writes.
- Current demo/local scoring and backups remain compatible; public/demo access does not disclose live data; exports omit notes/codes by default.

The initial handoff verified documentation only. Current local implementation and verification are recorded above; hosted and physical-phone checks remain pending.

## Implementation handoff

### Starting state and scope

**Current continuation state, 2026-10-08: implementation on hold at the owner's request.** The five earlier local milestones were implemented and verified, but the latest stage/heat revision is documentation/design only. Flesh out its remaining rules before the owner resumes code work. Preserve the existing implementation, uncommitted handoff and current browser/event data; do not retrofit new semantics silently or treat prior implementation authorization as a request to proceed now. Before any eventual event-day release, hosted provisioning/migrations and physical-phone connectivity still need verification and separate deployment authorization.

The original handoff authorized source/local implementation using the current template and Sites-managed D1. The latest request limits current work to updating the spec/AGENTS and fleshing out the revised workflow. No runtime, schema/migration, deployment or paid-service change is requested now. The existing public site should continue serving its current version until deployment is separately requested.

At the original documentation handoff, the preferred app checkout was `C:\Users\Iam\Projects\Country Dance Judging App\app`; local branch `main` tracked `github/codex/country-dance-judging-app`. Only AGENTS.md and PROJECT_SPEC.md were modified there, containing the uncommitted documentation. The Documents mirror had matching copies. The implemented source and verification updates are now also uncommitted in that checkout and mirrored in Documents. Recheck status and affected-file equality before continuing; the parent Documents Git repository is not the application repository.

Reuse the Sites project identity in `.openai/hosting.json`; D1 is now logically `DB` and R2 remains null. Conditional D1 wiring in `vite.config.ts` now connects the implemented backend to local D1; it does not provision a hosted database. Read installed Sites persistence and SQLite guidance before schema/query work. Keep generated versioned migrations, server-only prepared queries and the small database helper. Leave R2 unused; do not add another provider, framework or realtime service by default. Hosted provisioning, remaining account allowance and production migrations must be verified when deployment is requested.

### Next batch of small fixes

The owner plans a separate chat for the next batch. This queue records concrete starting points; current work remains documentation only. An explicit request in that chat can authorize these isolated fixes without implicitly authorizing the entire stage/heat redesign, deployment or paid services.

| Item | Evidence, scope and starting point | Completion evidence |
| --- | --- | --- |
| Local/demo competition removal — confirmed missing | At `/` → Set up → Program, [app/page.tsx](app/page.tsx) renders add/select/edit controls but no removal action. Add a discoverable Remove competition action with confirmation. Inspect [lib/domain.ts](lib/domain.ts) for active-selection and v2 backup assumptions; choose and document safe behavior for the last competition instead of breaking views that assume an active competition. Preserve every surviving competition's scores/revisions and event judges; do not reset the event to demo data. Shared removal already exists and is a different surface. | Verify cancellation makes no changes; removal selects a valid survivor; reload preserves the result; last-competition handling stays usable; unrelated scores/revisions survive; legacy backup export/restore remains compatible. Run applicable existing tests, lint/typecheck/build and a focused browser check. |
| Shared removal discoverability — verify before changing | Shared `/live/<organizer-code>` → Set up → Program & discussion blocks has Remove competition in [components/live/setup.tsx](components/live/setup.tsx). If reported missing there, reproduce with the owner’s surface/setup state before changing it. Started-event controls are protected and require the current versioned setup correction; do not bypass that safeguard or silently erase judging records. | Verify visibility, protected-state explanation and confirmation/Save setup behavior on the reproduced surface. Keep existing removal/history checks passing if shared code changes. |
| Discussion button — prior report, current readiness behavior | Earlier local work added per-division readiness and whole-block discussion gating. A new event with no opened/complete scoring rounds should not silently proceed to discussion. Reproduce any remaining no-response report in [components/live/desk.tsx](components/live/desk.tsx) and relevant live API; determine whether it is a failed action or an unexplained readiness requirement. | Show useful unmet-requirement or error feedback; a ready block transitions successfully. Preserve the current baseline until stage controls are separately authorized. Do not require score entry merely to change setup. |
| Vite promise rejection — recurrence unverified | The prior `send was called before connect` stack came from `/@vite/client`, and the local server was restarted. Check whether it recurs with `pnpm dev` running, then inspect dev-server/HMR connectivity and the actual underlying error. Do not treat that stack alone as evidence of a D1/save failure or add a blanket rejection suppressor. | Record reproduction and recovery, confirm the preview reconnects, and verify no application save errors are hidden. No production change is justified unless a reproducible app defect is found. |

For UI fixes, preserve the existing visual template and user data. Use the package scripts already present (`pnpm test`, `pnpm lint`, `pnpm build`) and explicit TypeScript checking as appropriate; shared save/schema/permission changes also need the relevant local D1/API checks. Keep the local preview available after verification. Do not claim the revised heat/stage workflow, panel voting or dual correction approvals are implemented as a side effect of these fixes.

### Local/demo and shared setup parity

**Confirmed next-chat target, not implemented:** make the local/demo setup interface identical to shared organizer setup wherever the setup task is the same: layout, section order, labels, add/edit/remove controls, confirmation behavior, validation and useful feedback. Cover event details, judge/head configuration, format/division program, prelims/finals, rosters, heat assignments, 2–3-song setup, optional J&J rotation context and finalist/pair setup. Competition and heat removal must be visible and usable in the corresponding program/heat sections. Preserve the numbered vertical sidebar and existing visual template at desktop and phone widths. Align stage terminology with the revised design when those stage controls are implemented; do not copy obsolete discussion-block semantics as the final target.

Prefer shared presentational/setup components over two divergent copies, with explicit local/shared storage adapters. Start with [app/page.tsx](app/page.tsx), [components/live/setup.tsx](components/live/setup.tsx), the relevant [lib/domain.ts](lib/domain.ts) legacy contract and shared types; inspect only affected files. The existing local v2 model lacks parts of the shared heat/song structure. Define a compatible representation and explicit migration/restore plan before persisting new structure; never silently reinterpret old totals, erase revisions or overwrite a user's event with seeded data. Existing legacy score/result views keep their documented scoring contract. UI parity does not authorize converting legacy scoring to shared averages.

The demo remains local and visibly labeled. It must not create a real D1 event, public judge link or cloud save merely because its setup resembles shared setup. Shared-only link, permission and synchronization surfaces need honest local demonstration/disabled explanations and identical placement where useful. Document these unavoidable mode differences explicitly; never label a local write as acknowledged shared persistence. Use synthetic role sessions for a richer local rehearsal if needed, with no custom accounts or hosted provisioning implied.

Setup-parity acceptance: the same equivalent fixture produces matching fields, choices, validation, add/remove controls and confirmations in both modes; edits persist through their respective storage paths; cancellation is harmless; active selection remains valid; an empty/last-competition state stays usable; rosters, unrelated marks and historical revisions survive intended changes; legacy wrapped/plain backups still restore. Exercise primary setup buttons through the UI rather than only invoking internal handlers. Any remaining mismatch must be named in the gaps report.

### Mock competition and test acceptance

**Owner requirement:** act as if running a mock competition to verify the whole experience and find gaps. This is required for the next implemented batch, not a claim that the revised workflow has already passed a rehearsal. Use only synthetic test data and isolated browser sessions/test events; do not reset or submit the owner's open event, change existing tabs' forms, send messages or publish results externally.

Extend the existing [tests/live-fixture.ts](tests/live-fixture.ts) and test suites where useful. Use deterministic bibs, identities, marks and explicit expected results, not assertions derived solely from the implementation's own result function. Include one event-wide head judge, at least two ordinary judges and a distinct organizer; both formats/divisions; at least one prelim division with three heats; heats containing two and three songs; rotating J&J prelim partners; fixed-couple finals; a genuine tie near an advancement cutoff; No=0 observations, permitted individual-song blanks, one deliberately uncovered entrant and a wrong-contestant recording error. Preserve a separate fixture of legacy v2 data and saved revisions. Only assert the chosen partial-song average and voting outcome after those rules are agreed.

| Layer | Required meaningful checks |
| --- | --- |
| Unit tests | Mark values; blank versus No; notes alone not satisfying coverage; per-judge/per-entrant heat coverage; frozen song/entrant identities through rotations; agreed averages and source counts; deterministic ranking groups/ties; setup add/remove and selection integrity; submission/correction/voting state transitions; legacy scoring/backup compatibility. Test failures and boundaries, not just happy paths. |
| Local D1/API integration | Own-ballot access and note privacy; organizer cannot score/vote or occupy judge roles; exact-version heat submission; retry idempotency and concurrent/stale saves; locked delayed writes; stage approval gates; genuine-error amendments requiring both distinct approval roles; renewed review after amendment; withdrawal history; revoked links and backup/export exclusions. UI mocks alone cannot verify these. |
| Browser and button behavior | Use accessible controls to add/remove competitions/heats, cancel/accept confirmations, save setup, navigate song pages, finish lineup checks, submit heats, move to the next heat/division, conclude stages, vote on eligible ties and approve results. Assert resulting state, visible feedback and persistence after reload, not merely that a button can be clicked. Check disabled controls explain unmet conditions; preserve note focus/scroll during context changes; verify 360/390px phone and desktop layouts. |
| Setup parity / legacy regressions | Exercise equivalent setup actions in local and shared modes. Reload, export/restore, check surviving scores/revisions, safely handle last-competition removal and confirm local actions cannot create shared resources. Run the existing scoring/CSV/legacy checks. |

Mock competition sequence:

1. Create isolated local and shared test events through their setup UI. Exercise add/edit/remove, cancellation, re-addition, roster/heat/song assignment, head designation and separate judge access; verify setup parity and persistence. Record mode-specific differences.
2. Start prelims and run its entire division/heat schedule back to back. Judges navigate each heat's song pages, leave some song cells blank, enter marks/notes and follow changing J&J partners. Intentionally miss an entrant, verify the heat-coverage reminder and blocked final submission, then add an observed mark during the lineup check. Submit each heat once; verify acknowledgement locks/hides the completed heat and presents the correct next heat/division. Other judges' drafts remain private and there is no mid-stage discussion/ranking.
3. Interrupt a save and retry/reload online; issue duplicate and stale submissions/late writes. Verify truthful pending/saved status, no lost notes/marks, no cross-heat misattribution, no duplicate official submissions and no premature hiding of unacknowledged forms. This does not establish guaranteed offline reload.
4. Conclude the whole prelim stage. Verify read-only submitted cards, explicit per-song blanks and agreed averages/ranks; vote on the planned advancement tie and require valid current approval. The organizer cannot score or vote. Test the recording-error amendment: neither approval alone applies it, a changed request invalidates prior approvals, and both distinct approvals preserve/disclose the original and invalidate affected review/results.
5. Select finalists and enter J&J fixed pairings. Run finals with the same heat/song/lineup/submission protections; complete stage review and permitted tie handling under the agreed finals policy. Approve the exact results and verify local preview/export scorecards, blanks, amendment history and backup/restore. Do not send to Sheets or publicly publish. Separately test withdrawing a competition without erasing judged history under the agreed withdrawal policy.
6. Report every rehearsal step as passed, failed, blocked by a named unsettled rule, or unperformed, with test/scenario evidence. Fix reproducible defects within authorized scope, rerun affected checks, then complete applicable suites, lint, explicit TypeScript checking and production build. Preserve the running local preview and report remaining gaps. A passing build or old block-submission test is not evidence that the revised rehearsal works.

Use `pnpm test` for existing unit checks, `pnpm test:live` for local D1/API checks and `pnpm test:browser` for browser checks. Inspect [playwright.config.ts](playwright.config.ts) before adding suites: it currently matches only `live-browser.spec.ts`, so include new local/parity suites in the actual test command/configuration. Keep tests self-contained and outputs ignored. Required fixtures and rehearsal tests may be added even for small UI changes because the owner explicitly requested them. Physical-phone, venue Wi-Fi and hosted D1 checks remain separately unverified.

The remaining averaging, vote mechanics, deadline/missing-coverage, note visibility, distinct-role enforcement and withdrawal details above are still open. Continue independent setup parity/small-fix work when authorized; resolve only the rules that block the next workflow change with the owner. Do not reask confirmed heat coverage, heat-end submission, role separation or stage-review requirements, and do not silently pick a policy solely to make tests pass.

### Original order of implementation (implemented baseline)

These original milestones are retained as context, not as instructions to resume. Reconcile them with the design-only revision and agreed open rules when implementation is requested again.

1. **Shared foundations:** stable event/round/heat/performance/subject identities; D1 schema/migrations; separate shared-mode types; event/judge access records with secure server-generated links; access checks; deliberate shared-event creation. Existing local events remain usable without import or automatic migration.
2. **Organizer setup and running order:** extend the four existing views with judges/head designation, divisions, discussion blocks, rosters, heat assignments, private songs, current-performance controls and Copy judge link. Freeze scoring assignments when a round opens and version explicit corrections. Empty/new-event setup must not seed real events with demo judges or scores.
3. **Phone ballots and saves:** compact bib-first single-judge entry; per-song notes; debounced scoped saves, truthful acknowledgement states, pending-edit recovery, version conflicts and focus-safe performance transitions. Implement reload/retry behavior before relying on it at an event.
4. **Discussion, submission and results:** review completeness across the block, submit immutable per-round snapshots, lock ballots, derive submitted-score averages/role or pair rankings, resolve ties through the head link and approve exact versions. Support explicit reopening with preserved history and invalidated approval. Prelim approval and finalist/pair setup gate finals.
5. **Exports and readiness:** shared-mode backup/restore rules, archive/delete controls, clearly labeled approved average/place exports and optional existing Sheets publishing. A shared restore must not overwrite an active live event implicitly. Public/demo payloads must not reveal live events, notes, playlists or access secrets. Complete the checks below and update this reference with actual implementation and remaining external setup.

When implementation resumes, milestones must lead to an integrated, verified workflow rather than only a binding, mockup or draft autosave. For now, maintain the design-only boundary. Record actual behavior and remaining work; never label local success as a live production deployment.

### Required verification and completion evidence

- Run focused tests for shared scoring, required assignments, role/pair handling, exact averages, missing marks, tie decisions and legacy compatibility. Run the existing scoring/CSV suite plus lint, explicit typecheck and production build for application changes.
- Exercise the actual local database/API path: judge isolation, organizer/head permissions, revoked links, stale revisions, competing saves, duplicate retries, atomic submission/approval and late writes to locked ballots. UI-only mocks do not verify these guarantees.
- Use separate browser sessions for two judges, organizer and head judge against one local event. Reload acknowledged marks/notes, simulate a failed save/retry, transition songs during note entry, complete discussion/submission/approval and reopen a correction.
- Rehearse 20+ couples with 2–3 songs, multiple heats and both divisions; include J&J individual prelims and fixed-pair finals. Verify phone-width entry without horizontal scrolling, practical touch targets, stable focus/scroll and retained song/partner context.
- Check legacy v2 data and backups remain usable, shared backups exclude access codes and clearly disclose private-note inclusion, exports distinguish provisional/approved results and include averages/approved places correctly.
- Mark unperformed physical-phone, venue-connectivity, production-quota and hosted checks explicitly. Do not claim an event rehearsal or live D1 provisioning based on a build alone.


## Maintenance and handoff

Keep this document as the concise map of stable behavior. Update relevant sections with the code change, including the review date, affected contract, test evidence and external configuration status. Do not append raw logs, secrets, long transcripts, or every dependency to it. Update AGENTS.md only when working rules or navigation to this reference change.

If a task is interrupted, add a short temporary handoff containing objective, actual checkout/branch, files changed, checks completed, and the next concrete step. Remove obsolete handoff notes after completion. Proposed work must stay separate from shipped behavior.

A useful prompt for a later authorized implementation task:

> Read AGENTS.md and the relevant sections of PROJECT_SPEC.md. Implement [specific change], preserving the documented scoring and local-data contracts. Inspect only the affected source, verify the change, and update the reference where behavior changes.

### Decision record

| Date / evidence | Decision |
| --- | --- |
| August 2026 owner requests | Support the local dance community and an employer-facing portfolio; prefer a vertical sidebar. |
| August 2026 owner requests | Avoid custom in-app authentication; accept public access and current site name. |
| 2026-08-21 release record | Public version 3; backup credentials omitted; key-based publishing template added, external Google deployment pending. |
| 2026-10-06 source review | Establish this reference and compact AGENTS.md; document limitations without changing runtime behavior. |
| 2026-10-08 owner clarification | Proposed shared judging: event-wide head judge, automatically generated random judge links, heats/songs and private discussion blocks; retain the existing visual template. |
| 2026-10-08 owner scoring decisions | Proposed per-song marks averaged on the main desk; individual Jack & Jill prelims, fixed-pair finals; head judge resolves ties and approves results. Current local scoring remains unchanged. |
| 2026-10-08 owner storage preference | Prefer simple persistence with free or very low recurring costs; compare D1 and object storage (S3/R2) before selecting a provider. No paid service or database provisioned. |
| 2026-10-08 owner implementation request | Begin live judging implementation in a new project chat; hand off confirmed workflow, implementation defaults and verification plan. Sites-managed D1 is the working starting point. The initial handoff conversation updated documentation only; no deployment or paid plan was selected. |
| 2026-10-08 local implementation | Integrated D1-backed source and local/browser rehearsals completed; shared and legacy contracts remain separate. No commit, push, hosted provisioning or publishing was performed. |
| 2026-10-08 latest owner workflow revision | Hold implementation while fleshing out stage starts, back-to-back heats/divisions, separate song pages, lineup revisions and one final heat submission. Every judge scores every assigned entrant at least once across the heat; individual song blanks remain. Acknowledged heat submission removes entries from active judging and presents the next heat/division. Whole-stage review is read only except advancement tie voting; genuine score errors require separate organizer and head judge approval with disclosed history. Organizer cannot judge, score or cast judge tie votes. Retain competition removal with preserved judging history. |
| 2026-10-08 next-chat setup/test request | Make local/demo setup match shared setup, preserving legacy scoring/data and honest storage distinctions. Require synthetic test fixtures, meaningful unit/D1/browser checks and a full isolated mock competition rehearsal with a gaps report. Finalize the handoff here; implementation/rehearsal of the new target remains for the next authorized chat. |
