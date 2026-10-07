# Country Dance Judging — master design, specification, and operating reference

Document version: 1.0. Code reviewed: 2026-10-06. Baseline commit: `4416e2fe92c0a1db9820bb6f2b68bd1acb2533b6` (Prepare public competition release).

This describes the inspected implementation and the owner's decisions. It is intended for people and coding assistants. Source links are relative to the application repository. External hosting and Google configuration are dated observations, not live guarantees. If code and this document disagree, investigate and update the document; do not silently change behavior to fit stale prose.

## Quick context

- **Purpose:** run friendly, relatively low-stakes country dance competitions and showcase a useful community project to potential employers through LinkedIn.
- **Owner:** Wesley Coffman. Users include event organizers, friends in the dance community, and visitors exploring the demo.
- **Product:** one competition desk with multiple competitions inside one locally saved event; Strictly couples and Jack & Jill individuals are supported.
- **Experience:** numbered vertical navigation: Set up → Score → Results → Publish. The initial screen is Score with seeded example data. Publish also contains imports and backups.
- **Architecture:** React 19 + TypeScript, Next-compatible App Router on Vinext/Vite; Cloudflare-compatible Sites deployment. Most application behavior is in `app/page.tsx`; scoring is separated into `lib/scoring.ts`.
- **Storage:** browser localStorage, no event database, no shared live event, no multi-device synchronization, no custom in-app authentication.
- **Scoring:** Yes=10, A1=4.5, A2=4.3, No=0; incomplete entries excluded; ties share place with skipped ranks; Jack & Jill roles ranked separately.
- **Google:** optional outgoing results publisher only. No automatic contestant fetch, no configured default endpoint. The secured script is a repository template; updating it here does not update Google.
- **Sharing:** public access was enabled and Sites version 3 deployed on 2026-08-21. The current public URL and GitHub branch are listed below; live access was not rechecked for this documentation pass.
- **Important limits:** local saves can be lost, offline reload is not implemented, validation is shallow, and connector delivery/security require more verification. See Known limitations.
- **How to work:** read `AGENTS.md`, find the relevant section below, inspect just the affected files, implement, verify, and update this reference. Do not reread the full repository for every small task.

## Reference index

- [Product and workflow](#product-and-workflow)
- [Scoring contract](#scoring-contract)
- [Data and persistence](#data-and-persistence)
- [Optional Google Sheets connector](#optional-google-sheets-connector)
- [Visual design](#visual-design)
- [Architecture and file map](#architecture-and-file-map)
- [Development and release](#development-and-release)
- [Known limitations and proposed improvements](#known-limitations-and-proposed-improvements)
- [Maintenance and handoff](#maintenance-and-handoff)

## Product and workflow

### Established owner decisions

The site should be usable by friends running community competitions and presentable as a public portfolio project. The owner accepted public access and the current URL, declined custom in-app authentication, and explicitly preferred sidebar navigation because it communicates competition flow. Preserve these choices unless a new request changes them. Low stakes justify simplicity, but scores and saved work should remain predictable.

### Implemented surfaces

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

There is no server copy of an event. Other visitors get their own browser state. Opening a different browser/device or changing the site's hostname does not transfer saved work. Multiple tabs have no coordinated merge/conflict handling. Keys in localStorage are accessible to someone using that browser; they are not encrypted by the app.

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

Sites worker: serves application and /og; no event persistence API
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
| `.openai/hosting.json` | Existing Sites project identity; D1/R2 bindings currently null |

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

The package scripts invoke Vinext, not the standard Next CLI. Respect the lockfile and dependency security policy. `pnpm-workspace.yaml` currently has unresolved string values in `allowBuilds` alongside `onlyBuiltDependencies`; previous installs emitted ignored-build warnings. Inspect policy deliberately if install is blocked. A historical successful direct build does not prove a clean install is reproducible.

Seven scoring/CSV tests, lint and the production build passed for the August public release. They do not cover backup validation, the browser publishing flow, real Apps Script execution, mobile interactions, or offline behavior. The October documentation pass inspected source; it did not rerun application tests or deploy.

For future changes: preserve scoring cases; add focused tests for new data-handling behavior; run lint/typecheck/build as appropriate for application changes. Test connector mutations against a disposable sheet. Documentation-only work needs factual/link/diff checks. Do not claim a successful TypeScript check based solely on a Vite build.

### Hosting and public sharing

Public URL: [country-dance-judging.wes6969.chatgpt.site](https://country-dance-judging.wes6969.chatgpt.site/).

The project ID is in `.openai/hosting.json`; reuse it. Last confirmed public release was Sites version 3, baseline commit above, on 2026-08-21. No custom domain was attached at that check. Verify live access/version when a deployment task needs current information.

GitHub and Sites source hosting are separate destinations. Pushing GitHub alone does not publish the website. Follow the currently installed Sites hosting guidance: validate, push exact source to the site's repository, package that build, save/deploy the version, and verify completion/access. Never persist the temporary source token in a remote URL or this document. A documentation update alone does not require redeployment.

## Known limitations and proposed improvements

These are observed gaps and suggested future work, **not implemented features or authorization to implement them**.

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

## Maintenance and handoff

Keep this document as the concise map of stable behavior. Update relevant sections with the code change, including the review date, affected contract, test evidence and external configuration status. Do not append raw logs, secrets, long transcripts, or every dependency to it. Update AGENTS.md only when working rules or navigation to this reference change.

If a task is interrupted, add a short temporary handoff containing objective, actual checkout/branch, files changed, checks completed, and the next concrete step. Remove obsolete handoff notes after completion. Proposed work must stay separate from shipped behavior.

A useful prompt for the next task:

> Read AGENTS.md and the relevant sections of PROJECT_SPEC.md. Implement [specific change], preserving the documented scoring and local-data contracts. Inspect only the affected source, verify the change, and update the reference where behavior changes.

### Decision record

| Date / evidence | Decision |
| --- | --- |
| August 2026 owner requests | Support the local dance community and an employer-facing portfolio; prefer a vertical sidebar. |
| August 2026 owner requests | Avoid custom in-app authentication; accept public access and current site name. |
| 2026-08-21 release record | Public version 3; backup credentials omitted; key-based publishing template added, external Google deployment pending. |
| 2026-10-06 source review | Establish this reference and compact AGENTS.md; document limitations without changing runtime behavior. |
