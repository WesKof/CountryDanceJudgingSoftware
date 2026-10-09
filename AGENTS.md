# Country Dance Judging — working instructions

## Read first

- [PROJECT_SPEC.md](PROJECT_SPEC.md): authoritative current behavior, settled contracts, source routing and project timeline. Start with Quick context; shared judging also needs Stage workflow revision and Implementation handoff.
- [LOCAL_TEST_REPORT.md](LOCAL_TEST_REPORT.md): dated verification, batch delivery and unperformed checks. Local success is not evidence of hosted readiness.
- [NEXT_BATCH_SPEC.md](NEXT_BATCH_SPEC.md): temporary future requirements, answered policy questions, branding, acceptance criteria and next-chat prompt. It is not implemented. Do not start implementation or a fresh chat until the owner finishes spec review and authorizes it. Do not reask settled questions.

Keep these four working documents. After implementation, merge the temporary spec into the master reference/test report and remove it; Git preserves history. Do not create separate timeline, closeout, branding or handoff files. Update each fact in its canonical home and link to it elsewhere.

## Checkout and preservation

Preferred checkout: `C:\Users\Iam\Projects\Country Dance Judging App\app`; `C:\Users\Iam\Documents\ChatGPT\Country Dance Judging App\app` is the mirror. Inspect branch/status and compare affected files before edits/sync. Preserve unrelated/uncommitted work, event/browser state, legacy scoring/revisions and v2 backups. Never commit the parent workspace. Preferred-checkout writes may need filesystem approval.

Authorized repository: `https://github.com/WesKof/CountryDanceJudgingSoftware.git`; branch `codex/stage-heat-workflow`. Verify current state before Git writes. Completed stage/setup code is `f589b7c`; subsequent planning is documentation only. Git push authorization does not authorize deployment, hosted provisioning, real publication or purchases.

## Implementation boundaries

Preserve the visual template/layout/theme, numbered sidebar, cards/bibs and collapsed expandable setup sections. Local/shared setup and deliberately created local D1 rehearsals reuse shared components/routes; retain legacy v2 meaning rather than converting totals into stage averages. Organizer access to individual judge links for distribution/testing is authorized.

Use PROJECT_SPEC.md for implemented scoring, submission, role, note privacy, approval/history and restore contracts. NEXT_BATCH_SPEC.md explicitly describes future requester/withdrawal/publication changes; do not apply them merely because they are documented. Post-Finals changed-membership replacement/redance remains undefined: invalidate/block rather than invent a policy. Resolve only material unsettled decisions that block the active task.

Read task-relevant source only; avoid dependency/build output/lockfiles and the base64 social image by default. Keep credentials/private links out of source, logs and backups. No accounts, new framework/provider/realtime service or real Google sends without applicable task authorization.

Use existing Sites-managed D1 logical `DB` and project identity; R2 is unused. Read installed Sites persistence/SQLite guidance before schema/query work. Use prepared statements, server permissions and atomic version guards. Keep migrations append-only. `scripts/migrate-local.mjs` applies local migrations after build using ignored ledger hashes; it does not provision hosted D1.

## Verification and reporting

Use synthetic fixtures and isolated role/browser/API sessions. Never reset or submit the owner's event. Verify independent numeric expectations, actual controls, persistence, permissions and races. Required workflow coverage and the next full mock are in the master and next-batch specs; preserve legacy regressions.

Run `pnpm test`, `pnpm test:live`, `pnpm test:browser`, `pnpm lint`, `pnpm exec tsc --noEmit` and `pnpm build` as applicable. Focus browser files with `pnpm exec playwright test ...`. Keep synthetic artifacts/D1 stores ignored; compiled Worker tests use a separate store. Keep the preview available and use only local migration commands.

The earlier Vite connection warning was not reproduced; investigate a recurrence without blanket error suppression. Online pending recovery is not guaranteed offline reload. Physical phones/venue connectivity, hosted operations and real external publishing require their own checks.

Report implemented/proposed behavior and passed/failed/unperformed checks separately. Update current behavior/timeline in PROJECT_SPEC.md and dated evidence in LOCAL_TEST_REPORT.md.
