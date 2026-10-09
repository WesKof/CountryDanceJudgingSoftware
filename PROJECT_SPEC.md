# Country Dance Judging — master design, specification, and operating reference

Document version: 1.16. Stage/heat implementation resumed at the owner's request and built/tested locally on 2026-10-08. Earlier work was preserved in checkpoint `d9ea167`; the completed stage/setup batch was verified and pushed as `f589b7c` on 2026-10-09 to `github/codex/stage-heat-workflow`. The owner renamed the GitHub account to `WesKof`; the authorized repository is now `https://github.com/WesKof/CountryDanceJudgingSoftware.git`. See [batch closeout](LOCAL_TEST_REPORT.md#batch-closeout-and-git-delivery) and [project timeline](PROJECT_SPEC.md#project-timeline). Baseline release: `4416e2fe92c0a1db9820bb6f2b68bd1acb2533b6`; documentation baseline: `e70bc46`. No deployment, hosted provisioning or paid service was performed.

This describes the inspected implementation and the owner's decisions. It is intended for people and coding assistants. Source links are relative to the application repository. External hosting and Google configuration are dated observations, not live guarantees. If code and this document disagree, investigate and update the document; do not silently change behavior to fit stale prose.

## Quick context

- **Purpose:** run friendly, relatively low-stakes country dance competitions and showcase a useful community project to potential employers through LinkedIn.
- **Owner:** Wesley Coffman. Users include event organizers, friends in the dance community, and visitors exploring the demo.
- **Product:** one competition desk with multiple competitions inside one locally saved event; Strictly couples and Jack & Jill individuals are supported.
- **Experience:** numbered vertical navigation: Set up → Score → Results → Publish. The initial screen is Score with seeded example data. Publish also contains imports and backups.
- **Architecture:** React 19 + TypeScript, Next-compatible App Router on Vinext/Vite; Cloudflare-compatible Sites deployment. Most application behavior is in `app/page.tsx`; scoring is separated into `lib/scoring.ts`.
- **Storage:** the public/demo page retains browser localStorage and legacy v2 state. Deliberately created shared events use server API routes and a logical Sites D1 `DB` binding. This is implemented and tested with local D1; hosted provisioning, allowance and production migration checks remain pending. No custom accounts were added.
- **Shared judging:** new events use `stage-v1`: separate song drafts, acknowledged heat snapshots, whole-stage read-only review, equal judge means, panel advancement voting, head deadlock/finals decisions and exact result approval. Corrections and started withdrawals require both distinct organizer and head approvals. Older shared events retain their block workflow. See [Stage workflow revision](#stage-workflow-revision--implemented-locally).
- **Current work boundary (2026-10-09):** the completed batch and next-batch planning documents are pushed; current work is documentation consolidation only. Next-batch implementation is on hold until the owner settles the spec. Preserve legacy scoring, v2 data, the visual template and existing work. Do not publish or purchase services. The settled averaging, voting, missing-coverage, identity, note and correction/withdrawal rules below must not be reasked.
- **Legacy/demo scoring:** Yes=10, A1=4.5, A2=4.3, No=0; incomplete entries excluded; ties share place with skipped ranks; Jack & Jill roles ranked separately. These legacy completeness rules do not define the revised heat-coverage/blank-song policy.
- **Setup parity:** local `/` and shared organizer setup reuse `SetupEditor`, including competition/heat removal and an editable empty program. The local richer setup is an optional v2 extension; local score/result views still use legacy totals. Its enabled organizer/judge link buttons explicitly open a persistent local D1 rehearsal using the same stage routes as shared events. See [Local/demo and shared setup parity](#localdemo-and-shared-setup-parity).
- **Google:** optional outgoing results publisher only. No automatic contestant fetch, no configured default endpoint. The secured script is a repository template; updating it here does not update Google.
- **Sharing:** public access was enabled and Sites version 3 deployed on 2026-08-21. The current public URL and GitHub branch are listed below; live access was not rechecked for this documentation pass.
- **Important limits:** local/demo saves and legacy backup validation retain their earlier limitations. Shared pending edits recover on an online reload, but neither mode has a service worker or guaranteed offline first load/reload. Physical-phone, venue-connectivity, hosted D1/quota and real Google delivery checks remain unperformed.
- **How to work:** read `AGENTS.md`, this Quick context and the affected section/source. Inspect preferred-checkout branch/status and compare mirror files before edits/sync. Keep implemented behavior, remaining decisions and external checks distinct.
- **Next batch (specification only):** [NEXT_BATCH_SPEC.md](NEXT_BATCH_SPEC.md) records the owner's October 9 answers about private access, view-only organizer Score, organizer-only requests, individual/couple withdrawal, named-judge/no-note snapshots, owner-only publication, revisions, service suspension and corrected branding. See [branding direction](NEXT_BATCH_SPEC.md#branding-direction) and [future chat prompt](NEXT_BATCH_SPEC.md#fresh-implementation-chat-prompt). These future rules do not claim current source has changed. Owner review/start authorization remains pending.

## Reference index

- [Project timeline](#project-timeline)

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

## Project timeline

Updated 2026-10-09. Status distinguishes code verification, Git delivery and public deployment.

| Date | Milestone | Evidence / status |
| --- | --- | --- |
| 2026-08-21 | Public competition release | Git `4416e2f`; recorded Sites version 3. Hosted availability was not reverified during closeout. |
| 2026-10-07 | Master specification and agent routing | Git `e70bc46`; PROJECT_SPEC.md and AGENTS.md became the durable project references. |
| 2026-10-08 | Earlier shared judging checkpoint | Git `d9ea167`, pushed to `github/codex/stage-heat-workflow` with explicit authorization. |
| 2026-10-08 | Stage/heat implementation | Equal judge means, acknowledged heat submissions, whole-stage review, panel votes, head decisions, dual corrections/withdrawals and retained history; local D1/API/mock competition verification. |
| 2026-10-08 | Local/shared setup and judge links | Reused setup editor; competition removal; persistent local D1 rehearsal links; head labels; v2 score/history preservation. |
| 2026-10-08–09 | Consolidated setup presentation | One editor with original cards/bibs/theme and native expandable sections collapsed by default; duplicate legacy overview removed. |
| 2026-10-09 | Completed-batch closeout | Pushed `f589b7c`; local/remote hashes match. Fresh 17 unit + 17 D1/API + 8 browser scenarios, lint, TypeScript and build passed. See [batch closeout](LOCAL_TEST_REPORT.md#batch-closeout-and-git-delivery). |
| 2026-10-09 | Next-batch policy and branding research | Confirmed organizer-only requests, individual/couple withdrawal, public judge names/no notes, owner-approved snapshots/revisions, continued operation without publishing, archive/shutdown policy and corrected community branding. Saved in [NEXT_BATCH_SPEC.md](NEXT_BATCH_SPEC.md) and [branding direction](NEXT_BATCH_SPEC.md#branding-direction). No implementation. |
| 2026-10-09 | Repository account rename | Owner supplied `WesKof/CountryDanceJudgingSoftware`; verified its branch contains `f589b7c`. Same authorized branch and project. |
| 2026-10-09 | Documentation consolidation | Four working documents: short agent instructions, master spec/timeline, verification/closeout report and temporary next-batch spec/branding/prompt. No application changes. |
| Next, after owner spec review | Fresh GPT-6.1 Sol High local implementation | [Prepared prompt](NEXT_BATCH_SPEC.md#fresh-implementation-chat-prompt). Access/UI → requests/withdrawals → snapshots → local public pages → revisions/suspension → complete mock verification. Not started. |
| Later, separately authorized | Hosted preparation and public release | Real domain/provider/auth setup, hosted migrations, venue/physical-device/capacity checks, deployment and publication. No date, purchase or deployment commitment. |

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

Legacy mode has no callbacks or automatic advancement. No skating/relative-placement algorithm, judge quotas or official sanctioning-body compliance is implemented. Confirm competition rules before changing the established mark values or ranking semantics.

## Data and persistence

Authoritative types and seeded event: [lib/domain.ts](lib/domain.ts). Browser handlers: [app/page.tsx](app/page.tsx).

| Object | Fields / ownership |
| --- | --- |
| `AppState` | `version: 2`, `event`, `judges[]`, `competitions[]`, `activeCompetitionId`, `publisherUrl`; optional `demoSetup`, `removedCompetitions` |
| Event details | `name`, `venue`, `date` |
| Judge | `id`, `name`; event-wide |
| Competition | `id`, `name`, `format`, `division`, `round`, `entries[]`, `scores`, `revisions[]` |
| Entry | `id`, numeric `number`; Strictly uses `lead`/`follow`; Jack & Jill uses `name`/`role` |
| Scores | Nested lookup `scores[entryId][judgeId] = Mark` |
| Result row | Entry ID/number, primary/secondary names, group, place, tied flag, total, complete flag |
| Revision | ID, creation time, label, snapshot of result rows |

The browser loads `country-dance-judging:v2` on startup, then debounces ordinary legacy edits by 250 ms. Explicit richer Save setup writes immediately before reporting completion. The publishing key uses a separate key, `country-dance-judging:publisher-key`. The URL is inside the stored event but is cleared in new backup exports. Both URL and key start empty for a fresh visitor. Storage is per browser profile and origin, not per signed-in user.

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

`isAppState` only checks a few top-level properties and the presence of the active competition (or empty competitions with an empty active ID). It is not deep schema validation. Restore currently does not enforce `backupVersion`, inspect all nested fields, or cap file size. Do not describe it as fully validated input.

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

- Repository: [WesKof/CountryDanceJudgingSoftware](https://github.com/WesKof/CountryDanceJudgingSoftware), renamed by the owner on 2026-10-09.
- Current app branch: [`codex/stage-heat-workflow`](https://github.com/WesKof/CountryDanceJudgingSoftware/tree/codex/stage-heat-workflow); checkpoint `d9ea167` and completed stage/setup batch `f589b7c` are pushed. Next-batch documents are specification only.
- Local branch tracks `github/codex/stage-heat-workflow`. The prior local `main` tracked `github/codex/country-dance-judging-app`; GitHub historical `main` and `StrictlyMaster` are separate legacy branches.
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

**Implemented locally, 2026-10-08:** new shared events use the confirmed stage workflow. The logical Sites D1 binding remains `DB`, R2 is null and the Sites identity is unchanged. Migrations `0000` through `0003` were applied only to local D1; no hosted database or public release was created. [LOCAL_TEST_REPORT.md](LOCAL_TEST_REPORT.md) records verification and operating limits.

### Stage workflow revision — implemented locally

**Setup and roles.** One distinct organizer manages the event; every stage judging panel includes the single event-wide head. The organizer cannot score, vote, or occupy a panel assignment. Setup stores unique, normalized participant identifiers and an organizer attestation. The server rejects overlapping identifiers and requires the attestation, organizer identity and every judge identifier before starting. Opened assignments, panel/head and organizer identity are frozen. Possession of separate private links cannot prove who physically holds them; the attestation remains an organizer responsibility. No accounts were added.

**Stages and room timing.** Start Prelims or Finals across all scheduled divisions/competitions and heats. Each heat has 2–3 songs, run back to back. Next song changes room context without moving an in-progress note edit to another song. After the last song, the organizer opens the heat-end lineup. Every assigned judge must submit an acknowledged snapshot before Next heat / division or Conclude stage becomes available. There is no deadline, guessed mark or automatic missing-coverage exception. Readiness messages name unmet setup/submission requirements. Official averages, stack ranking and comparison cards appear only when the entire stage closes.

**Coverage and final submission.** Every judge must record at least one mark for each assigned entrant across that heat’s songs. No=0 is a valid observation; blank and note-only cells do not satisfy coverage. Individual song blanks remain explicit. Song drafts autosave with cell revisions, operation IDs and author-scoped recovery. The lineup allows slight revisions on the judge’s own visited song pages. Judges must check “I checked the bibs and song marks…” and then confirm the named stage/division/heat. Any mark/note edit clears the acknowledgement; refresh verifies the reviewed snapshot and the server checks the exact ballot version plus acknowledgement. The immutable snapshot records `acknowledgedAt`. Cancelled/failed submissions leave the form available. Acknowledged entries disappear from active forms, remain in history and become read-only stage cards. All required judges submit independently; concurrent submissions do not conflict merely because another judge submits first.

**Scoring.** Values remain Yes=10, A1=4.5, A2=4.3, No=0. For each entrant, average each assigned judge’s recorded songs, then average those judge means equally. Blanks contribute no observation; they never become zero. Display each judge mean/observation count, per-song means/counts and every submitted mark/blank. Count heat acknowledgements separately from judges; preliminary equal-average ranks remain visibly equal after the separate advancement vote is decided. For example, judge means 10, 5 and 5 produce 20/3 even if observation counts are 1, 2 and 2. J&J prelims rank Leads and Follows independently with stable dancer identities across partner rotations. Finals score fixed pairs/couples together. Legacy v2 totals/completeness/ranks are unchanged.

**Advancement votes.** The saved final round’s finalist count defines the cutoff (per role for J&J). A tie crossing that cutoff creates a separate panel vote. Every assigned judge, including the head, chooses exactly the remaining number of places from the tied group. All must vote; highest vote counts advance. A full-panel vote tie at the remaining boundary requires an explicit head decision; candidates above that vote boundary cannot be displaced. Votes and decisions are scoped to current source fingerprints and retained in history. Finalized own choices remain visible after reload. Numeric marks and averages never change for a tiebreak. The head approves the exact resulting advancement. Saved finalists must match that approved selection before Finals can start.

**Finals review.** Finals ties require an explicit head placement decision, ordered or explicitly shared; ordinary judges and organizer cannot decide or approve them. Head approval requires current source submissions, current round version, every required acknowledgement, resolved ties and current matching preliminary advancement. Provisional and approved results are labeled separately.

**Genuine recording-error corrections.** The affected judge or organizer may request a change to an exact submitted heat version, with cells, recorded/intended marks and reason. A mistaken-bib transfer explicitly identifies both entries. Proposed changes cannot leave an entrant uncovered. Each revision creates a new request version and clears prior request approvals. Organizer and head must review/approve that same exact version from distinct participant identifiers/roles; either approval alone leaves marks intact. Applying both adds an immutable amended heat snapshot linked to the original. Original/corrected values, requester, reason, both approval timestamps and prior result/vote snapshots remain in history. Affected result/advancement/dependent final approval becomes stale and requires renewed review. This is not routine rejudging, filling an unobserved blank, or copying another judge.

**Competition removal and withdrawal.** Preparation Remove competition asks for confirmation, removes both rounds and running-order references from the draft, and requires Save setup. Remove heat retains the roster, leaves its entrants unassigned for reassignment and protects the last heat. Empty programs remain editable. A started competition instead requires an organizer withdrawal request with reason and both organizer/head approvals. The active program/context is repaired, affected reviews are invalidated, and all judging records remain in database/backups. Withdrawing the active last division leaves the remaining stage able to conclude. Late writes to removed rounds are rejected.

**Notes, transparency and exports.** Private notes remain author-only in ordinary API/read/review payloads. Stage cards expose finalized marks and explicit blanks to assigned judges and organizer, never another author’s notes. Standings CSV includes means/counts/status/source fingerprint; scorecards CSV includes every song slot and submission version; amendment history JSON discloses exact changes/approvals. Default shared backups omit access codes and notes, including withdrawn history. Explicit note inclusion warns that file holders can read them. Print uses the Results view. Optional Apps Script publishing remains an explicit organizer action using the existing 2D row contract and credentials excluded from backups. No actual Google request/publication was made during verification.

**Settled decisions.** Equal judge means; complete required heat submissions; full-panel exact-count votes; head deadlock/finals decisions; unique participant identifiers plus attestation; affected-judge/organizer correction requests; dual exact-version correction/withdrawal approval; author-only notes. No automatic deadlines, abstentions, copied scores or ordinary stage-end editing were introduced.

**Remaining operating decision.** If a genuine correction after Finals has already danced changes which people should have advanced, the app invalidates approval and blocks mismatched Finals approval. The owner has not defined a replacement-finalist/redance policy. No automatic redance or replacement is inferred. Corrections before advancement and corrections that retain finalist membership are supported with renewed review. This decision did not block the isolated rehearsal.

### Current implementation and compatibility

| Area | Source / behavior |
| --- | --- |
| Local setup adapter | [lib/demo-setup.ts](lib/demo-setup.ts), [components/live/local-setup.tsx](components/live/local-setup.tsx): optional v2 setup extension, retained legacy scores/revisions, archived removed competitions, empty-program fallback and immediate explicit setup persistence. Retained legacy editor changes reconcile without duplicating rounds or losing rich setup. |
| Shared stage desk | [components/live/stage-desk.tsx](components/live/stage-desk.tsx), reused [setup.tsx](components/live/setup.tsx): setup, links/revocation, stage readiness/running order, withdrawals, exports/backups/lifecycle. |
| Phone and review | [judge.tsx](components/live/judge.tsx), [stage-review.tsx](components/live/stage-review.tsx), [results.tsx](components/live/results.tsx): own visited songs, recovery/conflict comparison, acknowledgement/confirmation, read-only cards, votes and exact approvals. |
| Pure stage rules | [lib/live/stage.ts](lib/live/stage.ts): heat coverage/snapshot/signature, latest immutable version, equal judge means and cutoff vote calculation. [validation.ts](lib/live/validation.ts): identities, stage setup and fixed finalist/pair validation. |
| Server and persistence | [server.ts](lib/live/server.ts), [db/schema.ts](db/schema.ts), [drizzle/](drizzle/): server access checks, prepared statements, atomic D1 guards, request receipts, immutable heat submissions, votes and versioned review requests. Approval uniqueness includes source fingerprint to retain earlier approvals. |
| Tests | [tests/stage-fixture.ts](tests/stage-fixture.ts), unit `stage.test.ts`/`demo-setup.test.ts`, local D1 `stage-api.test.mts`/`stage-edge-api.test.mts`, browser `stage-browser.spec.ts`/`local-browser.spec.ts`; earlier legacy suites remain. |

New shared events default to `workflow: 'stage-v1'`. Existing shared events lacking that property retain the earlier full-song/block submission workflow, head-only ties and explicit single-role reopen/setup correction. Their [desk.tsx](components/live/desk.tsx) branch and tests remain. An opened event cannot switch workflow through setup. Earlier block tests are compatibility evidence, not evidence for stage rules.

The demo still uses `country-dance-judging:v2`, AppState `version: 2`, legacy scoring and existing wrapped/plain JSON restore. `demoSetup` and `removedCompetitions` are optional additions, not score conversion. Removed local competitions retain their scores/revisions in JSON history; survivors retain marks and revisions. This does not turn the public demo into a shared competition or migrate existing data to D1.

Shared backup remains `country-dance-live-backup`, `backupVersion: 1`, with additive heat/vote/amendment history. Restore creates a separate preparation event with new IDs/links and inert imported history. Current snapshots/approval never import as active. Keep the organizer link separately; it is deliberately omitted. Archived links become read-only; permanent deletion remains confirmed and organizer-only.

Limits remain 15 judges, 8 competitions, 16 rounds, 200 subjects per round, 6 heats, notes 2,000 characters and request/restore size 1.5MB. New stage heat songs are 2–3; older block mode permits its previous 1–6 songs. Larger-than-rehearsed events, provider storage/query capacity and long-running history need additional capacity testing. Four-second polling is retained; no realtime service or service worker was introduced.

### Save, submission and approval reliability

Cell saves use expected cell revisions and unique operation IDs, acknowledge saved revision/time, and reject locked/out-of-assignment/future-song writes. Author-scoped pending edits retry transient failures with bounded backoff, survive an online reload, and show conflicts requiring comparison. Delayed status reads cannot roll back acknowledged cell revisions or heat-submission metadata. A context change never changes an edit’s performance ID.

Heat submission atomically checks ballot version and absence of an earlier submission, then persists the immutable heat snapshot. Cell CAS prevents a racing late edit from being silently included after review. Duplicate request receipts and repeated acknowledged submissions do not create duplicates. Votes, head decisions, result approval and dual amendment approval use current round/event versions and exact source fingerprints. Histories are preserved; invalidation makes prior approvals inactive without deleting them.

Neither local mode nor shared mode guarantees an offline first load/reload. Device recovery storage can fail; the UI reports that limitation. A successful local rehearsal does not establish venue connectivity or production availability.

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


## Implementation handoff

### Starting state and scope

The owner resumed implementation on 2026-10-08 and settled the rules above. Preferred checkout: `C:\Users\Iam\Projects\Country Dance Judging App\app`; Documents is a mirror. Branch: `codex/stage-heat-workflow`, tracking `github/codex/stage-heat-workflow`. Earlier uncommitted work was committed and explicitly pushed as `d9ea167`; the completed stage/setup batch is documented in [batch closeout](LOCAL_TEST_REPORT.md#batch-closeout-and-git-delivery). Fresh 2026-10-09 checks passed 17 unit, 17 local D1/API and all 8 browser scenarios plus lint, TypeScript and build. Next-batch work is specification only until the owner settles it. Inspect branch/status and compare affected files before any further sync. Never commit the parent Documents workspace as the app repository.

No public deployment, hosted D1 provisioning/migration, service purchase or real results publication is authorized. Generated migrations are append-only. `pnpm db:local` applies local-only migrations through an ignored hash ledger after a build; it does not provision a database. Keep the local preview available and user data/open browser sessions intact.

### Completed batch of small fixes

| Item | Implemented behavior / verification |
| --- | --- |
| Missing local competition removal | Reused program controls with confirmation, Save setup, valid active survivor, archived scores/revisions and editable empty-program/re-add state; legacy compact editor also has removal. Unit and equivalent local/shared browser fixtures cover these. |
| Heat removal / naming | Cancel/confirm occupied heat removal, retain roster/unassign affected entries, reassign, protect last heat and use an unused heat name. |
| Setup persistence / compatibility | Explicit local Save setup writes immediately before reporting completion; legacy metadata/roster edits reconcile with richer setup. Old scores/revisions and wrapped/plain backup restore remain compatible. |
| Discussion readiness | New stages show explicit missing setup/submission feedback and require whole-stage completion. Earlier shared block controls remain covered by regression tests. |
| Vite `send was called before connect` | Previously reported dev-client lifecycle error; not reproduced in the completed isolated browser runs. No blanket error suppression was added. This is not evidence about hosted or physical-phone behavior. |
| Audit regressions | Future songs cannot be selected before opening; acknowledged heat forms stay absent on delayed reads; participant identities stay frozen; withdrawal of the current last division preserves a usable remaining-stage context. |

### Local/demo and shared setup parity

Both surfaces reuse `SetupEditor` in the same section order: Event & judges, Program & stages, round selection, required judges, finalist/pair setup, roster/heat assignment and song/rotation setup. Equivalent names, choices, validation and preparation confirmation controls are used. Competition removal and heat removal are visible. Save setup persists through each mode’s storage path, cancellation leaves data intact and an empty program supports re-addition.

Local and shared pages use one canonical setup editor. The duplicate legacy overview and its editing controls are removed; this does not migrate or delete legacy scores. The editor retains the original competition cards, numbered bib badges, panel styling and head label beside the judge name. Event details, Judges, Program & stages, Round setup and Event-long private judge links are expandable native sections, collapsed on initial load/reload. Round setup contains separately collapsed Required judges, Finalists & pairings (Finals only), Roster & heat assignments and Heats, songs & partner rotations. Summaries show useful counts/context while collapsed, support mouse/touch/keyboard, and opening/collapsing does not save edits. Multiple sections may stay open. Selecting a competition card selects its prelims and opens Round setup; choosing another round retains the current expanded sections. Legacy Score/Results tabs, historical marks/revisions and v2 backups retain their single-ballot meaning through the same local adapter.

**Local rehearsal links (2026-10-08 follow-up).** Open organizer page, Open judge page and both Copy link buttons deliberately create a stage event from the saved setup on the current server. At localhost this uses local D1 and the exact same organizer/judge routes and stage engine used by shared events. The organizer can open, copy and distribute every judge link. The role used to score is determined by the judge link; an organizer credential still cannot score or vote. Links work before judging starts; readiness requirements still gate starting a stage.

The browser remembers the rehearsal organizer path and idempotent creation nonce in a separate origin-local storage key, excluded from v2 event backups. Retries after a lost creation response reuse the same event. Reload/reopening links retain the event, marks and role assignments. Once created, edit and run that rehearsal on its organizer page. Later edits to the retained local template do not overwrite an existing rehearsal or started assignments. Create another rehearsal explicitly confirms selecting a fresh copy; it preserves the earlier event and its link. Keep the earlier organizer link before switching. Ordinary local setup edits still create no server resources. Access controls wait for browser link storage to load; unavailable storage/API is reported. This is a local development rehearsal, not hosted deployment or an offline guarantee.

### Mock competition and test acceptance

Use deterministic synthetic fixtures and independent expected outcomes. Never reset, submit or export the owner’s open event. Full source evidence and pass counts are in [LOCAL_TEST_REPORT.md](LOCAL_TEST_REPORT.md).

The fixture includes 44 Strictly couples across Beginner/Intermediate and Advanced, three heats per Strictly division, 2–3 songs, both J&J individual-role divisions with rotations, three distinct judges including the head and a distinct organizer. Browser rehearsal uses a bounded 18-couple equivalent plus both J&J divisions in four isolated sessions at desktop and 360/390px. Equivalent local/shared setup has a retained v2 history fixture.

Required sequence: setup/add/remove/cancel/save/reload; all prelim heats/song pages; an uncovered entrant and explicit No/blank observations; interrupted save plus online retry/reload/focus preservation; acknowledgement cancellation/reset/final submission; whole-stage read-only cards; genuine mistaken-bib correction with both roles; panel cutoff voting and exact approval; explicit matching finalists/J&J pairs; all finals heats/acknowledgements; finals review/results; CSV/cards/amendment/backup/print/restore; separate withdrawal and head deadlock/finals tie scenarios.

Commands: `pnpm test`, `pnpm test:live`, `pnpm test:browser`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`. Browser match is `tests/**/*browser.spec.ts`; focused runs use `pnpm exec playwright test tests/local-browser.spec.ts tests/stage-browser.spec.ts` (passing filenames through the pnpm fallback script can insert `--` and run all matches). Synthetic outputs/local D1 files remain ignored. No extra tests of production or real services are implied.

### Required verification and completion evidence

Report passed/failed/unperformed checks separately. Unit tests cover independent mean/counts/coverage/ranking and legacy invariants. Actual local D1/API tests cover role/identity access, notes, revisions, duplicate/stale requests, racing saves/submissions, vote quorum/deadlock, corrected approval invalidation, immutable history, finalist gates, withdrawal context, backups and revoked links. Browser tests verify the actual controls, confirmations, focus, acknowledgement/hiding, persistence and exports.

Physical phones, real venue Wi-Fi, extended outage/offline reload, hosted quota/provisioning/migration/deployment, live Google delivery and post-announcement replacement-finalist/redance operations remain unperformed or undecided. A real event-day release needs those applicable checks and separate deployment authorization. Builds and local synthetic sessions cannot establish them.

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
| 2026-10-08 owner resume and rule answers | Resume local implementation; equal judge means, full-panel exact-count cutoff votes/head deadlocks, every required heat submission, unique participant identifiers plus attestation, author-only notes, affected-judge/organizer correction requests and dual approval of corrections/started withdrawals. No deployment or purchase. |
| 2026-10-08 owner finalization request | Each heat requires explicit judge acknowledgement plus named final confirmation; edits clear acknowledgement and immutable submission retains its timestamp. |
| 2026-10-08 checkpoint approval | Push earlier code with detailed notes to CountryDanceJudgingSoftware on codex/stage-heat-workflow; checkpoint d9ea167 pushed. New update remains local. |

### 2026-10-08 setup presentation follow-up

The owner confirmed replacing the separate legacy overview with one readable setup interface in local/shared modes and prefers expandable sections collapsed by default. This is implemented in [components/live/setup.tsx](components/live/setup.tsx) and the common [setup-section.tsx](components/live/setup-section.tsx); local setup and both organizer desks reuse it. Detailed link and layout evidence is in LOCAL_TEST_REPORT.md. No new stage or scoring rule was introduced.
