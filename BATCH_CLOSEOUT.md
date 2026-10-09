# Stage/heat and consolidated setup batch closeout

Date: 2026-10-09. Preferred app repository: `C:\Users\Iam\Projects\Country Dance Judging App\app`. Branch: `codex/stage-heat-workflow`. Authorized push destination: `github`, `https://github.com/wesleycoffman/CountryDanceJudgingSoftware.git`, same branch. Parent Documents workspace is not the application repository.

## Completed behavior

- One local/shared setup editor with original theme, sidebar, competition cards and bib badges; expandable sections start collapsed. Only explicit Save setup persists edits. Head judge labels are visible beside their name.
- Local setup can create/reopen a local D1 rehearsal through real organizer/judge link controls. Organizer distributes the individual links; bearer roles and assignment checks are server enforced.
- Stage workflow spans heats/divisions and 2–3 songs per heat. Every required judge covers every assigned entrant at least once. Permitted song blanks stay blank; No=0 counts as an observation. Heat advancement waits for all required acknowledged submissions.
- Review plus acknowledgement and named confirmation precede immutable heat submission. Edits invalidate acknowledgement; pending saves and stale versions cannot finalize silently.
- Whole-stage results use equal judge means with observation counts. Panel advancement votes, head vote-boundary deadlocks and finals decisions preserve numeric scores.
- Genuine recording-error amendments and started competition withdrawals require exact-version organizer/head approvals, preserved original snapshots and invalidated dependent approvals. Notes remain author-only.
- Legacy v2 totals, revision meaning and backup/restore compatibility are preserved. Separate shared restore creates a fresh preparation event/links with inert imported history. Empty programs and confirmed competition removal remain usable.

## Verification and operating limits

Fresh closeout verification is recorded in [LOCAL_TEST_REPORT.md](LOCAL_TEST_REPORT.md). The checks include unit tests, actual local D1/API tests, isolated multi-role browser workflows, TypeScript, lint, build and diff checks. No owner event/browser state is reset by synthetic tests.

Earlier compiled Worker API checks are dated prior evidence, not a fresh hosted release test. Physical phones, venue Wi-Fi, extended outages/offline reload, hosted database quotas/provisioning/migrations, public deployment/capacity and real Google publishing remain unperformed. Native printing was not exercised. Private link possession does not establish physical identity. Post-Finals corrections that change finalist membership still need an owner-approved replacement/redance policy; existing approval invalidation remains in force.

## Preservation and concise handoff

All 41 pre-closeout modified/untracked batch files matched the Documents mirror before edits. The index was initially empty. No unrelated dirty tracked file was identified; ignored local D1, credentials, build output, test artifacts and work files remain outside the commit. Commit only the captured batch file list plus closeout documentation, never blanket-stage a parent workspace.

Current implementation deliberately still includes legacy local Score/Results and existing result exports/optional Sheets publishing. The newly requested organizer-only screen, single judge page, view-only organizer Score, reorganized imports and separately controlled public-results service are future specification work. They are not implemented by this closeout.

Read AGENTS.md and PROJECT_SPEC.md first; use the test report and timeline for evidence. The next task is to settle access, correction/withdrawal scope, public disclosure, approved publication/revision behavior, service continuity and branding rights. Do not implement that batch, create an implementation chat, deploy, publish results or purchase services until the owner has settled the specification and authorizes the relevant next step.
