# Country Dance Judging — working instructions

## Start here

Read relevant [PROJECT_SPEC.md](PROJECT_SPEC.md) contracts and [LOCAL_TEST_REPORT.md](LOCAL_TEST_REPORT.md) evidence. Refresh these and Git/status/parity after compaction. Keep these three references; no competing timeline/branding/closeout/handoff files. Dated branches/limits/holds/no-push statements are history; current owner direction governs.

| Task | Read in PROJECT_SPEC.md |
| --- | --- |
| Ownership, priorities, schedules | [Current coordination](PROJECT_SPEC.md#current-coordination-cadence-and-queue--october-24) |
| Completed work and latest evidence | [Delivery index](PROJECT_SPEC.md#completed-local-deliveries), [evidence-index audit](LOCAL_TEST_REPORT.md#october-24--current-queue-and-evidence-index-pass) |
| Instruction audit | [Map](PROJECT_SPEC.md#operative-instructions-and-retention-map--october-24) |
| Stage flow | [Automatic stages](PROJECT_SPEC.md#automatic-scoring-stages-and-judge-led-submission--october-21-local) |
| Scores/votes/Finals | [Stage](PROJECT_SPEC.md#stage-workflow-revision--implemented-locally), [legacy](PROJECT_SPEC.md#scoring-contract), [draw recovery](PROJECT_SPEC.md#finals-draw-blocker-guidance--october-24) |
| Privacy/withdrawal/publication/recovery | [Access/release](PROJECT_SPEC.md#access-withdrawals-and-owner-publication--implemented-locally), [saves](PROJECT_SPEC.md#save-submission-and-approval-reliability), [recovery tasks](PROJECT_SPEC.md#backup-and-restore-task-recovery--october-24) |
| Released-version comparison | [Public changes](PROJECT_SPEC.md#released-results-comparison--october-24) |
| Storage, restore, CSV, compatibility | [Data](PROJECT_SPEC.md#data-and-persistence), [compatibility](PROJECT_SPEC.md#current-implementation-and-compatibility) |
| Presentation/source | [Attention](PROJECT_SPEC.md#action-first-presentation-and-attention-budget--october-21-local), [keyboard tasks](PROJECT_SPEC.md#keyboard-task-continuity--october-24), [result labels](PROJECT_SPEC.md#mobile-result-place-readability--october-24), [files](PROJECT_SPEC.md#architecture-and-file-map) |
| Checks, rollback, handoff | [Verification cadence](PROJECT_SPEC.md#verification-cadence), [checkpoints](PROJECT_SPEC.md#github-checkpoints-and-rollback-map), [handoff](PROJECT_SPEC.md#maintenance-and-handoff) |
| Dependency findings and current limits | [October 24 review](PROJECT_SPEC.md#dependency-health-and-compatible-security-cohort--october-24), [verification](LOCAL_TEST_REPORT.md#october-24--isolated-dependency-security-cohort) |

## Coordination and authority

Master Country Dancer `01a1568c-2c3b-7160-9978-d5ec5748d38f` is the owner-designated coordinator/contact. Maintenance `01a1609a-64aa-7920-b691-7626cbbcf118` and execution chats return verified evidence/dependencies/released claims there. Check active work; coordinate fresh file/runtime claims and one source/Git/docs/mirror writer. Preserve model/reasoning. Both have distinct daily **9 AM and 6 PM America/Chicago** schedules; serialize wakes on one queue, avoid duplicates/use supported tools. After reviewing a completed batch, the master automatically sends one bounded follow-up prompt into its own chat; workers report delivery/release claims there and do not create continuation loops or duplicate prompts.

Complete authorized work without minor/major approval stops. For substantial work communicate scope, benefit, tradeoffs, dependencies, staging, verification/rollback, then proceed within owner/system/tool boundaries. Incorporate owner steering; ask only for real dependencies. Improve purposefully; no invented limits, manufactured changes or prolonged finished work.

MASTER MASTER CHATTER `01a16f4a-d0f4-71b1-a3bf-9d4832b2b717` owns global guidance coordination. Send global claims/findings there, project claims here; follow global edit/notice rules. Existing chats may need to reload guidance.

## Checkout, owner data and runtime boundaries

Preferred Git root: `C:\Users\Iam\Projects\Country Dance Judging App\app`. Mirror: `C:\Users\Iam\Documents\ChatGPT\Country Dance Judging App\app`; never commit its parent as the app. Verify root/status/remote and affected byte parity before edits/sync. Preserve divergence/unrelated work; sync only compared task files with destination-hash guards, then verify tracked parity. Never copy Git/dependencies or reset/stash another writer's work.

Preserve ignored private/configuration/runtime/stores, browser storage/links, legacy scores/revisions/v2 backups, history and checkpoints. No blanket clean/reset/destructive cleanup. **Owner walkthrough `p-7b1be816cc40c13049433b04`, original/corrected publications and services 3000/3100 are excluded from independent work.** Keep previews, ignored `work/public-receiver.json` and process manifest available under the master/assigned operator. Never archive/reset/submit/approve/republish owner events as tests.

Regressions use isolated fictional events/stores/roles on **3001/3110**. Test mutations and browser launch require explicit `LIVE_TEST_URL=http://127.0.0.1:3001` and `LOCAL_TEST_RECEIVER_URL=http://127.0.0.1:3110`; use shared `tests/test-endpoints.ts`, never owner-port fallbacks or unguarded test writes. URL validation does not prove process/store ownership: check manifests/configuration first. Retain stores; stop only proved task-owned processes. `public-site/render.ts`/`admin.ts` changes require owned receiver restart plus Worker rebuild/restart; Node does not reload imports. Maintenance cannot restart owner services. Vinext uses `--hostname`, not `--host`.

Enhancement scope is **local only**. Git publication does not authorize hosted sync/deployment/provisioning, real publication, purchases or unrelated messaging. October 19 v4 is historical evidence; its separate hosted results publisher was unconfigured at that check. Local receiver success is not hosted readiness. Exclude keys/private links from source/logs/responses/bundles/backups; never expose the receiver/localhost keys publicly. Inspect permission discrepancies read-only; never remove denials or bypass a browser gate via another surface/API.

## Contracts every change must preserve

- **Roles/privacy:** organizer cannot score/vote/join the panel. Preserve identities/attestation, author-only notes, role-scoped payloads and independent head/organizer/website-admin powers. Organizer live marks exclude notes/ranks. Link distribution/testing is intentional; possession cannot prove physical identity.
- **Scores/coverage:** Yes=10, A1=4.5, A2=4.3, No=0. Stage results equally average assigned judges' recorded-song means; blanks and notes are not observations, No is. Preserve precision, shared numeric places, per-role J&J prelim identity, fixed Finals pairs and separate cutoff votes/head decisions. Legacy v2 sums/completeness remain distinct. Every required judge submits, even when withdrawals leave zero active entrants.
- **Stages/approvals:** complete saved setup automatically opens/freezes Prelims; Finals requires exact current Prelims head approval and actual saved J&J draws. Incomplete preparation stays editable. No routine Start stage/Open review gates. Judge-led acknowledged submission retains coverage, pending-save blocks, atomic immutable snapshots/locks, version guards/receipts. Whole-stage discussion waits for all submissions. GETs never activate stages. Preserve manual/heat/block compatibility.
- **Finalists/history:** eligible capacity limits counts (J&J per role). Each saved count change gets server-owned advancementRevision/renewed approval, including returning to an old value. Auto-fill only unopened Finals from approved advancement. Never invent draws/rewrite started Finals. Preserve pairs, performed/submitted-song protection and old approvals/submissions. Changed started-Finals membership blocks dependent approval/publication; no invented replacement/redance/reinstatement/substitutes.
- **Recovery/amendments:** retain marks/notes/pending edits when ineligible/withdrawn/locked; explain read-only actions. No silent discard/retarget/rebase. Require exact save acknowledgement before clearing pending mutations; malformed HTTP 200 is not success. Organizer initiates exact-version corrections/withdrawals; separate explicit organizer/head approvals are required, cleared by content changes. Preserve current-version selection drafts, immutable originals, supersedes links and renewed dependent approvals.
- **Publication/recovery:** complete-event exact snapshots require separate website-admin release/revision approval. Preserve prior released values/history, append corrections, release atomically/retry idempotently. Queued requests/notices are not delivery. Public names/marks exclude private notes/internal reasons/identifiers. Keep JSON recovery, default credential/note exclusion and explicit note-inclusive warning; restore fresh preparation without active imported approvals. No product result/scorecard CSV/Excel/PDF/print exports or Google sends. Preparation CSV remains draft + explicit Save setup. Archive is reversible/read-only, preserving records/links.

Use prepared statements/permissions/atomic guards, existing Sites D1 `DB`/identity; R2 is unused. Read Sites persistence/SQLite guidance for schema/query work. Append-only migrations use `scripts/migrate-local.mjs`/ignored ledger after build. No new framework/provider/realtime/accounts/Google sends without authority. Read relevant source; skip generated/dependency/lockfile/base64 output.

## Usability, verification and handoff

Preserve cream/forest/gold, accepted head review, numbered sidebar/cards/bibs, organizer Set up / Score / Results / Publish and private named judge Score page. Reuse shared preparation; retain drafts and large phone controls. Show current state, responsible person and next action; collapse supporting calculations/program/history/diagnostics. Keep names/bibs/places/approvals; avoid duplication/empty containers/jargon. Shortcuts reveal/focus exact targets; disabled actions explain recovery. Check phone/desktop, keyboard, state contrast/non-color cues and transitions without reload. Reduce attention/clicks while preserving data/rules.

Small fixes use relevant fast unit/type/lint and necessary focused API/browser checks. Verify affected scoring/permissions/persistence/history/races promptly; reserve broad regression/build/full rehearsal for stable major/coherent delivery. Rerun only for changes/failures/unresolved concerns. Docs need factual/obligation/link/anchor/diff/size checks, not app suites/build. Use linked cadence/commands; TypeScript needs its own check. Ignore synthetic artifacts. Offline reload/phones/venue/hosted/external operations need separate evidence.

Use `codex/` branches/verified commits. Preserve annotated checkpoints before major experiments/branch cleanup; push when authorized. Fetch; integrate normally respecting protection/CI/review/PR process. Never force-push/rewrite main/checkpoints. Verify remote main/peeled tags; delete only expected completed tips contained in main. Source rollback cannot restore data/reverse external effects.

At handoff/stopping points update behavior/scope in PROJECT_SPEC, fresh evidence/limits/unfinished work/next action in LOCAL_TEST_REPORT, AGENTS for rule/routing changes only. Report branch/commit/checkpoint, preferred/mirror status/released claims; distinguish implemented/proposed, local/hosted, passed/failed/unperformed. Close interrupted documentation gaps next opportunity.
