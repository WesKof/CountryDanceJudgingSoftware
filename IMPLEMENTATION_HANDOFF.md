# Fresh implementation chat prompt — held for owner review

Prepared 2026-10-09 for **GPT-6.1 Sol, High**. Do not create/start that chat automatically. Use this prompt only after the owner confirms the assembled next-batch specification and authorizes local implementation. Prior implementation is `f589b7c`; these planning documents do not implement its successor.

Copy the following after approval:

---

Implement the approved next batch locally. Start in `C:\Users\Iam\Projects\Country Dance Judging App\app`. Read `AGENTS.md`, `PROJECT_SPEC.md` (Quick context, Stage workflow revision, Implementation handoff), `NEXT_BATCH_SPEC.md`, `BRANDING_RESEARCH.md`, `BATCH_CLOSEOUT.md`, `LOCAL_TEST_REPORT.md` and `PROJECT_TIMELINE.md`. Confirm the owner has approved the assembled specification before coding; do not reask its answered policy questions.

Inspect branch/status/remotes and compare affected files with `C:\Users\Iam\Documents\ChatGPT\Country Dance Judging App\app` before editing/syncing. The authorized repo is `https://github.com/WesKof/CountryDanceJudgingSoftware.git`, branch `codex/stage-heat-workflow`; prior implementation closeout is `f589b7c`. Preserve later commits, unrelated/uncommitted work, existing browser/event state, legacy scoring/revisions and v2 backups. Never commit the parent workspace. Read relevant Sites persistence guidance before schema/query work; keep migrations append-only and hosted resources untouched.

Follow the implementation order and acceptance criteria in NEXT_BATCH_SPEC.md. Preserve the judging template/theme/layout and collapsed expandable Set-Up sections. Keep Set-Up → Score → Results → Publish. Organizer alone accesses organizer routes/data; judges use one assigned-work page including necessary head duties. Organizer can distribute/open individual judge links but its credential cannot score/vote/act as head. Make organizer Score entirely view-only; move room controls/imports/recovery to Set-Up. Preserve local/shared parity without silent legacy conversion or an unguarded legacy scoring bypass.

Keep exact-version heat acknowledgement and named confirmation, edit-reset, all-required-judge submissions, active coverage, blanks versus No, equal judge means/counts, stage-end review, full-panel cutoff voting and head deadlock/finals decisions. Organizer alone initiates new corrections and withdrawals after discussion; both organizer and head approve the exact request. Preserve author-only notes, original records/audit and invalidated dependent approvals.

Add confirmed contestant/couple withdrawal: retain marks, label Withdrawn, exclude current-stage placement/advancement/future work and waive only its remaining coverage after dual approval. All assigned judges still acknowledge/submit. Fixed couples withdraw together; J&J prelim individual withdrawal requires an approved exact plan for undanced pairings, preserves prior observations and blocks invalid remaining pairings. No automatic substitute, reinstatement, replacement finalist or redance; changed-membership post-Finals cases remain blocked pending the deferred policy.

Build local-only public winners, leaderboard and contestant/judge scorecards from approved immutable snapshots. Judge names are public; notes, internal reasons/identifiers and credentials are not. Include actual stages/heats/songs/marks/blanks/counts/calculation explanations. Publish each completed competition independently with applicable stages: current head result approval, organizer approval of the exact public snapshot, then separate service-owner approval/release. Use isolated owner administration and a local fake publisher. No organizer/judge receives administrative or publishing credentials.

Approved corrections leave the last public revision visible Under review until renewed head/organizer/owner approvals release a numbered revision atomically. Show revision times/supersession; retain history; reject stale/duplicate/out-of-order delivery. Publication failure/suspension must not impair competition operation. Existing results remain read-only while hosted. Owner maintains the judging tool; no organizer self-hosting/handoff solution is required. Public-site shutdown has 30 days' notice where practicable, no indefinite availability promise, and retained operational records/recovery.

Remove organizer/public result CSV/Excel/PDF/scorecard downloads, result print buttons and direct Sheets publishing controls. Preserve distinctly labeled internal JSON backup/restore and v2/shared compatibility. Explain that visible public results can still be copied/printed/captured.

Use the intended Interskate/Lewisville Kickin' It Country community: `https://www.instagram.com/kickinitcountrydance/` and `https://www.facebook.com/groups/984536000183510/`. Owner confirms logo/photo/branding permission. Exclude the mistakenly supplied UK business. Inspect original asset quality and use BRANDING_RESEARCH.md without changing the judging application's appearance.

Use synthetic fixtures, isolated role sessions and separate local D1 stores. Run meaningful unit, real local D1/API, compiled Worker, browser, persistence and permission checks, plus lint, TypeScript, build and whitespace checks. Execute the complete mock in NEXT_BATCH_SPEC.md: setup/imports/links, multiple heats/songs, missing coverage/acknowledgement, individual/couple withdrawal and pairings, review/corrections, ties/advancement/finals, publication preparation and local release simulation, corrected revisions, outages/suspension and internal restore. Verify actual buttons and independent numeric expectations. Never reset or submit the owner's event or expose private role links in logs/reports.

Fix reproducible gaps within scope. Update actual implemented behavior, timeline and verification evidence, keeping proposals and unperformed checks separate. No deployment, hosted provisioning, public publication, purchases or new external services without separate authorization. Keep local preview available and finish with a concise reviewable handoff.

---
