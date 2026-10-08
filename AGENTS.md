# Country Dance Judging — working instructions

## Read first

This is a public competition desk for Wesley Coffman's local dance community and a portfolio project for employers. It uses React/TypeScript with Vinext/Vite and Sites hosting. The public/local demo retains browser v2 state; deliberately created shared live events now use the logical Sites D1 `DB` binding and private organizer/judge links. The integrated workflow is locally tested; hosted provisioning and deployment remain unverified/unrequested. Google Sheets publishing is optional. The owner prefers no custom accounts and a vertical sidebar at all screen sizes.

The maintained reference is [PROJECT_SPEC.md](PROJECT_SPEC.md). Read its **Quick context** first, then only the sections and source files relevant to the task. For the live judging implementation, read **Live judging implementation target** and **Implementation handoff**. Do not routinely scan the entire repository, dependency folders, build output, lockfile, or base64 social image. Verify affected code before changing it; the reference is a map, not a replacement for evidence.

**Current work boundary, 2026-10-08:** the owner is fleshing out a revised stage/heat workflow and explicitly asked to hold implementation. Update documentation/design only until the owner asks to resume. Read [Stage workflow revision](PROJECT_SPEC.md#stage-workflow-revision--design-only) before using any earlier milestone or default. Current code/tests describe the earlier workflow; do not claim the revision is implemented.

## Task routing

| Task | Reference section | Start with |
| --- | --- | --- |
| UI, navigation, mobile | Product and workflow; Visual design | `app/page.tsx`, `app/globals.css` |
| Scoring, ties, completeness | Scoring contract | `lib/scoring.ts`, `tests/scoring.test.ts` |
| State, backup, import/export | Data and persistence | `lib/domain.ts`, relevant handlers in `app/page.tsx`, `lib/csv.ts` |
| Shared live judging | Live judging implementation target; Implementation handoff | `lib/live/`, `components/live/`, `app/api/live/route.ts`, `db/`, `drizzle/`, `tests/live-*`; relevant configuration |
| Sheets publishing | Optional Google Sheets connector | `google-apps-script/Do_Post.gs`, `publishResults` |
| Build or hosting | Development and release | `package.json`, `vite.config.ts`, `.openai/hosting.json` |
| Social preview | Visual design | `app/layout.tsx`, `app/og/route.ts` |

## Preserve these decisions

- Marks: Yes=10, A1=4.5, A2=4.3, No=0. Blank means no score; No is a valid scored observation. Legacy/current complete-ballot checks differ from the revised at-least-once heat-coverage rule, which permits individual song blanks.
- Current local/demo scoring sums judge marks, ranks only fully scored entries and shares equal-total places (1, 1, 3); Jack & Jill roles rank separately. The shared implementation target instead uses per-song averages, individual J&J prelims, pair finals and head judge tie decisions. Preserve both contracts explicitly; do not silently reinterpret existing data.
- Keep existing event data compatible. Never change storage keys or backup schema without a migration plan.
- Keep publishing credentials out of event backups, source, logs, and examples.
- Keep Google integration optional. A frontend key field does not secure an old deployed script.
- Preserve the numbered vertical sidebar and accessible state labels.
- Make local/demo setup match shared organizer setup in structure, labels, available setup controls and validation, including competition/heat removal. Prefer reused setup components with explicit local/shared persistence adapters. Local demo must remain clearly labeled and isolated; simulate shared-only link/sync controls honestly. Preserve legacy scoring/v2 data with an explicit compatibility/migration plan rather than silently converting old events. Read the setup-parity target in the spec.
- Public access does not mean shared event state. Do not imply cloud sync or guaranteed offline reload.
- Do not introduce accounts, cloud storage, a different scoring system, or a new framework unless the task calls for it.

- The owner authorized starting shared live judging implementation in a new chat on 2026-10-08. Use Sites-managed D1 as the working storage choice, without adding accounts, AWS/R2 or paid services. It is not provisioned yet; verify account allowance before hosted setup.
- Preserve one event-wide head judge, automatically generated event-long private links, per-song marks/notes and explicit result approval. The revised target uses separate song pages with autosave, slight revisions during the heat-end lineup, and one final heat submission. Each judge must score every assigned entrant at least once across that heat; individual song blanks remain explicit and No=0 counts as scored.
- Separation of duties is required: the organizer cannot serve as an ordinary judge or head judge in the same event, score entrants or cast judge tie votes. Organizer and head judge correction approvals must come from distinct people and access roles. Enforce this server-side when implementation resumes; separate links alone cannot establish that their holders are different people.
- Preserve **Remove competition** in shared organizer setup alongside **Remove heat**. The local/demo Set up → Program at `/` currently lacks competition removal; record that gap and add a discoverable control when implementation resumes, preserving legacy/v2 contracts. Shared preparation removal requires confirmation and Save setup; withdrawal after judging starts must retain submitted records/history and explicitly invalidate affected running-order/results references. Do not treat removal as permission to silently delete judged work. Reconcile the existing setup-correction mechanism with the revised locks and approval requirements before changing live setup.
- After acknowledged heat submission, remove that heat's entries from the judge's active form and present the next heat/division, retaining the underlying records for stage-end review. Do not interpret disappearing entries as record deletion.
- Discussions, official averaging and stack ranking occur only when the entire prelims/finals stage finishes across all scheduled heats/divisions. Judges' stage review is read only except voting on advancement tiebreakers. Never change numeric marks to break a tie, copy another judge's marks, or fill missed observations by guessing.
- Submitted-score errors require approval from both organizer and head judge of the exact same versioned correction. Preserve original/corrected values, reason and both approval records; invalidate affected results/vote/advancement approval for renewed review. The current single-role reopen operation does not implement this new dual-approval requirement.
- The partial-song averaging formula, tie-vote mechanics, late/missing coverage handling, note visibility and practical enforcement of distinct role holders remain open in the spec. Role overlap itself is prohibited, not an open choice. Do not invent rules or expand private-note access. Ordinary judge links still cannot approve official results; future voting is a separate permission. No future decision changes legacy v2 scoring automatically.
- Keep saves scoped and versioned, submissions immutable and retry-safe, and approval tied to exact current submission versions. Local pending edits are not shared saves; never promise offline reload without implementing and testing it.
- Keep generated migrations append-only. `scripts/migrate-local.mjs` applies only local migrations after a build and checks hashes in an ignored local ledger. It does not provision hosted D1. Browser tests use isolated headless Edge sessions on Windows and synthetic event data; keep their output ignored.

## Live judging implementation approach

Implementation is currently on hold at the owner's request. Refine the revised workflow and keep confirmed requirements, proposals, current behavior and open choices distinct. When the owner resumes implementation, reconcile the old milestones with the stage/heat revision and carry the integrated workflow through verification; a database binding or mock ballot alone does not complete the feature. Preserve settled decisions and resolve only the documented open rules that affect the change.

Read the installed Sites persistence/SQLite guidance when adding D1 schema, queries or migrations. Use the existing Sites project identity, server-side access checks, prepared statements and versioned migrations. Leave unused storage bindings null. Do not expose private data/access codes through public payloads, backups or logs. A hidden UI field is not an access check.

Work in the preferred uncompressed checkout when permitted; inspect its branch/status and compare affected files against the Documents mirror before edits or sync. Preserve the current uncommitted documentation handoff. Never commit the parent Documents workspace as the app repository. No public deployment or paid-service purchase is requested by this handoff; prepare and test the implementation first.

## Working and maintenance

### Next-chat implementation and test handoff

These are instructions for a later owner-authorized implementation chat; they do not lift the current hold. Read [Next batch of small fixes](PROJECT_SPEC.md#next-batch-of-small-fixes), [Local/demo and shared setup parity](PROJECT_SPEC.md#localdemo-and-shared-setup-parity) and [Mock competition and test acceptance](PROJECT_SPEC.md#mock-competition-and-test-acceptance) for scope and verification.

- **Confirmed gap:** local/demo `/` → Set up → Program has no Remove competition action. Start in `app/page.tsx` and inspect the relevant `lib/domain.ts` state/backup constraints before editing. Add a clear confirmed removal action, safe active-competition fallback and a deliberate last-competition/empty-program policy. Preserve surviving scores, revisions, event judges and legacy v2 backup behavior; never reset the whole event to demo data.
- **Shared removal already exists:** `/live/<organizer-code>` → Set up → Program & discussion blocks, in `components/live/setup.tsx`. Check which surface the owner is using before claiming removal is fixed or missing. Started-event protection is intentional; preserve history and access checks.
- **Setup parity:** align the demo and shared setup using the same interface where practical; do not deliver just one extra removal button and call the broader parity requirement complete. Inventory relevant setup controls and document any genuine mode-specific differences. Existing v2 events must still load/export/restore without losing scores or revisions.
- **Tests and mock competition:** use deterministic synthetic fixtures and expected outcomes. Cover pure scoring/coverage/state transitions with unit tests, persistence/permissions/races with actual local D1/API tests, and button/navigation/confirmation/error behavior with browser tests. Run the complete mock competition in isolated organizer, head and ordinary-judge sessions, with multiple divisions/heats, 2–3 songs and J&J rotations. Maintain a gaps checklist; do not mark the redesigned workflow complete using tests of the old workflow. See the spec for the full rehearsal and evidence requirements.
- **Reported issues to reproduce, not assumed open bugs:** discussion readiness/button behavior and Vite `send was called before connect`. Verify with a running local server; show useful readiness feedback, and diagnose the dev-server/HMR lifecycle if the error recurs. Do not use a dev overlay error as a reason to change judging rules or publish.
- Keep bug fixes separate from the unimplemented stage/heat redesign. Only implement that redesign when the owner requests it and its relevant open rules are settled. Record actual verification and remaining work in the spec, and keep both checkout documentation copies aligned after comparison.

Check `git status` and preserve unrelated changes. Read the reference's known limitations before claiming a feature is complete. Test behavior proportionately: scoring/CSV changes need relevant tests; UI changes need lint/build and focused interaction checks when available. Documentation-only edits need link and factual checks, not a production deployment.

Update the affected sections of PROJECT_SPEC.md in the same change whenever behavior, architecture, schemas, workflow, or operating instructions change. Record the verification date and relevant evidence. Label proposed work and unverified external configuration explicitly. Do not turn the reference into a transcript or duplicate source code.

Before any push or deployment, confirm current authorization, branch, remote, and deployment access. Documentation is not standing authorization for external writes.
