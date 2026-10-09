# Country Dance Judging — working instructions

## Read first

Read [PROJECT_SPEC.md](PROJECT_SPEC.md) **Quick context**, then the relevant source/sections. For shared judging read **Stage workflow revision**, **Implementation handoff** and [LOCAL_TEST_REPORT.md](LOCAL_TEST_REPORT.md). Do not scan dependencies/build output/lockfiles or the base64 social image by default.

The owner resumed local implementation on 2026-10-08. New shared events use `stage-v1`; earlier shared events retain the block workflow. Local and shared setup use one canonical editor with the original card/bib styling and expandable sections collapsed by default. The duplicate legacy overview is removed; legacy v2 scores/backups remain compatible. Its enabled open/copy role-link controls deliberately create a saved local D1 rehearsal using the same stage routes as shared events. Once created, edit/run it on its organizer page; local template edits never overwrite the rehearsal. Organizer access to judge links for distribution/testing is authorized. The head is labeled beside their name. The completed batch is in closeout; next-batch work is specification only until the owner settles it. No public deployment, hosted provisioning, paid services or real publishing is authorized. The visual template and numbered vertical sidebar remain required.

## Checkout and preservation

Preferred uncompressed checkout: `C:\Users\Iam\Projects\Country Dance Judging App\app`; Documents is a workspace mirror. Inspect current branch/status and compare affected files before editing/syncing. Preserve uncommitted work and user event/browser state. Never commit the parent Documents workspace as the app repository. Writes to the preferred path may need filesystem approval.

Branch at this handoff: `codex/stage-heat-workflow`. Earlier implementation checkpoint `d9ea167` was explicitly authorized and pushed to CountryDanceJudgingSoftware on that branch. The owner explicitly authorized committing/pushing this completed stage/setup batch on 2026-10-09 to the same repository/branch. Verify the current remote and preserve unrelated work. See BATCH_CLOSEOUT.md and PROJECT_TIMELINE.md. This is not website deployment authorization.

## Task routing

| Task | Reference / start with |
| --- | --- |
| Template, navigation, mobile | Product/Visual design; `app/page.tsx`, `app/globals.css`, `components/live/shell.tsx` |
| Legacy scoring/state/backup | Scoring/Data contracts; `lib/scoring.ts`, `lib/domain.ts`, `lib/csv.ts`, existing handlers/tests |
| Local/shared setup parity | Implementation handoff; `components/live/setup.tsx`, `setup-section.tsx`, `local-setup.tsx`, `lib/demo-setup.ts` |
| Stage coverage/averages/votes | Stage workflow revision; `lib/live/stage.ts`, `validation.ts`, `types.ts`, stage fixtures/tests |
| Shared API/permissions/history | `lib/live/server.ts`, `app/api/live/route.ts`, `db/schema.ts`, `drizzle/`, API tests |
| Phone drafts/acknowledgement | `components/live/judge.tsx`, `client.ts`, `lib/live/merge.ts`, browser tests |
| Review/corrections/exports | `components/live/stage-review.tsx`, `stage-desk.tsx`, `results.tsx` |
| Earlier shared compatibility | `components/live/desk.tsx` legacy branch, original live tests |
| Optional Sheets | `google-apps-script/Do_Post.gs`, explicit publisher handlers |
| Build/storage/hosting | Development/release; `package.json`, `vite.config.ts`, `.openai/hosting.json`, local migration helper |

## Settled contracts — do not reask

- Yes=10, A1=4.5, A2=4.3, No=0. A blank has no observation; No is a valid score. Notes alone do not satisfy coverage.
- Legacy v2 scores sum judges, exclude incomplete entries, share equal-total places (`1, 1, 3`) and rank J&J roles separately. Keep keys, backup version and revision meaning unchanged. Rich demo setup is an optional extension, not conversion to shared averages.
- New stages span all scheduled divisions/heats with 2–3 songs each. One final submission per heat follows the lineup check. Every required judge covers each entrant at least once; all required acknowledged submissions gate room advancement. No deadlines, guessed scores or automatic missing-coverage exception.
- Judges review bibs/marks, check the acknowledgement and confirm the named heat before submission. Edits clear it; exact ballot version and acknowledgement are checked server-side. Acknowledged heat entries disappear from active forms while immutable history stays available for stage review.
- Official averages/ranks and discussion appear at whole-stage conclusion. Each judge’s observed song mean is averaged equally across judges; expose observation counts/blanks. Stage scorecards are read only.
- Cutoff tie votes require every assigned judge including head to choose exactly the remaining places. All vote; highest counts advance; head resolves a remaining vote boundary deadlock. Finals placement ties require an explicit head decision. Never change numeric marks for ties.
- Organizer cannot score, vote or be a judge/head. Use unique normalized participant identifiers and organizer attestation; enforce overlap, frozen identities and permissions server-side. Private links cannot establish physical identity.
- Affected judge or organizer may request a genuine correction. Organizer and head must approve the same exact request version from distinct identities/roles. Preserve original/corrected values, reason and both approvals; invalidate affected vote/result/advancement/dependent final approval. No single-role reopening in stage mode.
- Preparation competition/heat removal requires confirmation and Save setup. Started competition withdrawal requires reason plus both roles’ approval and retains history. Empty programs remain editable; surviving scores/revisions/judges remain intact.
- Notes stay author-only in API/review payloads. Scorecards expose submitted marks/blanks without others’ notes. Backups exclude access codes and notes by default; explicit note inclusion discloses file visibility.
- Shared restore creates new preparation state/links with inert imported history. Old active approvals/submissions never become active in the restored event.
- Keep Google integration optional and explicit; no sends during ordinary judging. Credentials stay out of source/logs/backups. No accounts/new framework/provider/realtime service without task authorization.

## Implementation and verification

Use Sites-managed D1’s existing logical `DB` binding and project identity; R2 remains unused. Read the installed Sites persistence/SQLite guidance before schema/query work. Use server access checks, prepared statements and atomic version guards. Keep generated migrations append-only; `scripts/migrate-local.mjs` applies only local migrations after a build and verifies ignored ledger hashes. It does not provision hosted D1.

Use synthetic fixtures and isolated browser/API role sessions. Never reset or submit the owner’s open event. Tests must verify independent expected scores/counts, permissions/persistence/races and actual controls. Required coverage includes multiple heats/songs/divisions, J&J rotations/fixed pairs, missing coverage, No/blanks, acknowledgement cancellation/reset, save interruption/online recovery, stage review, cutoff votes/deadlocks, versioned dual corrections, advancement, finals ties/results, withdrawal/history and backups. Preserve existing legacy regressions.

Run `pnpm test`, `pnpm test:live`, `pnpm test:browser`, `pnpm lint`, `pnpm exec tsc --noEmit`, and `pnpm build` as applicable. Browser config includes all `*browser.spec.ts`; focused filenames go through `pnpm exec playwright test ...`. Browser/local D1 artifacts stay ignored. Use the local migration helper, not hosted migration commands. Keep the preview available after checks.

The old Vite `send was called before connect` report was not reproduced in isolated runs. Investigate a recurrence as a dev-client lifecycle issue; do not suppress arbitrary errors. Shared pending recovery supports online reload, not guaranteed offline reload. Physical phones, venue Wi-Fi, hosted allowances/provisioning/migration/deployment and real Sheets delivery remain separately unverified.

If a post-Finals correction changes finalist membership, approval is invalidated and mismatched Finals approval is blocked. The owner has not set a replacement/redance policy; do not invent one. Resolve only documented unsettled rules that block the active task.

Update affected PROJECT_SPEC.md sections with actual behavior and dated evidence. Keep proposals, remaining operating decisions and unperformed checks distinct. Use concise handoffs; do not claim local success is a hosted release.
