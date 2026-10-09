# Local implementation verification — 2026-10-09

Implemented in `C:\Users\Iam\Projects\Country Dance Judging App\app`, branch `codex/stage-heat-workflow`. The Documents mirror was compared before selected edits/syncs. Earlier uncommitted work was preserved in the explicitly approved/pushed checkpoint `d9ea167`; see [batch closeout](LOCAL_TEST_REPORT.md#batch-closeout-and-git-delivery) for this batch's delivery. No deployment, hosted provisioning, purchase or real results publication occurred.

## Fresh closeout checks — 2026-10-09

The unchanged completed application source passed **17 unit tests, 17 local development D1/API tests and all 8 browser scenarios in one complete run (4.2 minutes)**. ESLint, TypeScript, production build and whitespace checks passed. Synthetic fixtures and isolated browser sessions preserved the owner's event and open preview. The browser run includes local/shared collapsed setup parity, role links and reload persistence, legacy restore, removals, the full multiple-heat/song stage rehearsal and actual head deadlock/finals decision buttons.

The compiled Worker API result below is prior 2026-10-08 evidence; it was not rerun during closeout. Physical phones, venue/network conditions, hosted operations, native printing and real external publishing remain unperformed as detailed below. No next-batch product behavior was implemented during closeout.

## Earlier implementation checks — 2026-10-08

| Check | Result / scope |
| --- | --- |
| `pnpm test` | **17 passed.** Independent legacy values/ranks, CSV behavior, state/history preservation, coverage, equal judge means/counts, rotations, participant overlap/head inclusion and vote deadlock boundaries. |
| `pnpm test:live` on development server | **17 passed.** Actual local HTTP/D1, including both the retained block workflow and new stage workflow; synthetic events only. |
| `pnpm test:browser` | **7 passed.** Four earlier regression tests plus equivalent local/shared setup, the complete stage rehearsal, and stage-specific head deadlock/finals tie controls. Isolated headless Edge contexts; 360/390px and desktop. |
| Focused browser follow-up | **2 passed.** Final setup/review changes, real revoke/replace/open judge-link buttons, persisted own vote selections, correct heat-submission counts, equal-average captions and head-only tie controls. |
| Compiled Worker API on port 3001 | **17 passed against the final production bundle**, including the head-panel guard. Uses a separate synthetic local D1 store. |
| TypeScript / ESLint | **Passed**, with no remaining lint warnings. |
| Production build | **Passed** locally. Vinext’s route-classification notice remains an informational tooling limitation. |
| Local migrations / query plans | `0000`–`0003` append-only migrations current. Three new event queries use their respective event indexes; local `PRAGMA optimize` completed. Applied migrations were not rewritten. |

A first compiled-Worker run failed while sharing SQLite files with the running development server. Running that Worker with a separate ignored synthetic store eliminated the contention; the preview’s database was not reset. Development/browser and compiled tests now have separate local storage. This was an environment isolation issue, not a reason to suppress storage errors or relax judging requirements.

## Complete synthetic rehearsal

API fixture: 44 Strictly couples across both divisions, three heats per division, 2–3 songs per heat; two J&J divisions with six individual entrants and rotating partners; three judges including a separate head and a distinct organizer. The full browser fixture uses 18 Strictly couples plus both J&J divisions to keep real button interaction bounded. Expected numeric/voting outcomes are independently specified.

| Step | Verified behavior / evidence |
| --- | --- |
| Setup and preparation | Equivalent reused setup UI in local/shared modes; add/import entrants, add/remove heats, cancel/confirm removal, unassigned roster recovery, unique heat names, Save setup/reload, remove competition, select a survivor, remove the last competition and re-add. Surviving legacy scores/revisions and removed-history backups remain intact. Ordinary local template edits create no server resources; explicit role-link buttons now create/reopen a local D1 rehearsal. |
| Access and private links | Distinct participant identifiers and attestation required before a stage; overlaps/head exclusion rejected. Organizer cannot score/vote/approve results. Revocation/replacement/open controls act on real synthetic links; cancelled revocation leaves access intact, revoked access fails and replacement works. Event-long links survive advancement/setup changes. |
| Prelim heats and song pages | Every scheduled division/heat/song runs in order. Visited song pages keep separate marks/notes and rotation context. No mid-stage averages/cards are exposed, including through organizer/head API reads. Future songs cannot be selected. |
| Coverage and lineup | Deliberately uncovered bib is identified and blocks submission; note alone does not satisfy coverage. No is scored; individual song blanks remain explicit. A genuine observed mark during lineup resolves coverage. |
| Final heat acknowledgement | Checked-bibs/marks acknowledgement plus a named final confirmation. Cancellation produces no official snapshot and leaves editing available. Editing clears acknowledgement. Server rejects absent acknowledgement or stale reviewed ballot versions; immutable snapshots record acknowledgement time. Acknowledged heat entries disappear and the next assigned heat becomes available. |
| Save recovery and races | Interrupted save, online reload/retry, note focus/scroll during room changes, private-note isolation, duplicate operation/submission retries, competing cell revisions and a save racing heat submission. One race winner commits; late writes to submitted/withdrawn work are rejected. Delayed reads cannot restore finalized forms. |
| Whole-stage review | Every required submission gates room advancement/conclusion. Submitted cards are read only, all blanks remain visible, counts distinguish observations from judge/heat totals, and judge song means are weighted equally. Explicit independent example: means 10, 5, 5 yield 20/3 with counts 1, 2, 2. |
| Genuine mistaken-bib correction | Request identifies wrong/intended cells and reason. Organizer approval alone changes no mark; revised request clears its approvals; an old version is rejected. Both distinct approvals apply an immutable amendment, retaining original/corrected values and timestamps. Numeric expected results are 10 for bib 101 and 4.5 for bib 102 in the full fixture. |
| Advancement votes and renewed review | All panel members vote exactly the remaining places. Organizer cannot vote; partial quorum blocks approval. Majority chooses advancement separately from numeric ranks. Three-way boundary deadlock requires the actual head button; certain higher-vote candidates remain selected. A correction of already-approved prelims invalidates prior votes/head decisions/approval and requires new review. |
| Finals | Exact currently approved finalists required; manual fixed J&J pairs retained through all final songs. All final heats use the same coverage/acknowledgement locks. Ordinary roles cannot decide finals ties. Actual head buttons resolve tied 4.5 averages into places 1/2 while both averages stay 4.5. Full fixture winners retain expected mean 10. |
| Results and exports | Provisional/approved labels, observation counts, current own vote choices and separate head decisions. Actual CSV, scorecard CSV, amendment JSON and backup downloads contain blanks/history and exclude default notes/access codes. Print switches to Results and invokes a test print handler. Optional Sheets request is intercepted locally and validates the existing rectangular row contract; no Google request leaves the test. |
| Withdrawal and restore | Actual request/cancel/approve controls require both distinct roles; all submitted records/earlier approvals survive in history. Withdrawing the current last division leaves a usable remaining-stage conclusion. Shared restore creates new links/preparation state with inert history. Legacy wrapped/plain v2 backups reload without score/revision conversion. |

## Reproducible gaps fixed

- Missing local competition removal and unsafe assumptions about the last competition.
- Rich local setup becoming stale when using retained legacy metadata/roster controls.
- Explicit Save setup reporting completion before its debounced storage write; immediate reload now retains it.
- Navigation clicks being lost during initial hydration/connection.
- Future song selection and completed-heat metadata rolling back on delayed reads.
- Withdrawal of the current last competition stranding the remaining stage.
- Started organizer/attestation identities being editable; excluding head from a required stage panel.
- Result captions calling heat snapshots “judges”, calling approved preliminary equal averages “tie pending”, and hiding the author’s persisted vote choices after reload.

No `send was called before connect` application/dev-client rejection appeared in the passing isolated browser runs. No blanket rejection handler was introduced. Initial test-locator/readiness failures were corrected separately from the reproducible application gaps.

## Remaining decision and unperformed checks

If a genuine correction after Finals has already danced changes who should have advanced, the app invalidates approvals and blocks approval of mismatched Finals. The replacement-finalist/redance policy remains undecided; no automatic replacement or redance is implemented. The rehearsal corrects before advancement and separately tests invalidation of already-approved advancement.

Physical phones, real venue Wi-Fi, extended outages/guaranteed offline reload, hosted D1 allowances/provisioning/migrations/deployment, production logging/capacity and real Google Apps Script delivery remain unperformed. Local rehearsal organizer/judge clipboard contents were verified in isolated Edge. A native printer/dialog was not exercised; print invocation was simulated. Identifier attestation cannot prove which human physically holds a link. Neither mode has a service worker or an offline reload guarantee. Retained legacy backup validation/save recovery limitations remain documented in PROJECT_SPEC.md.

Synthetic screenshot artifacts are ignored under `test-results/`, with preserved copies in workspace `work/`. The existing local preview stays available on `http://127.0.0.1:3000`. Test artifacts and private synthetic link codes are not part of the source change.

## Local links and readability follow-up — 2026-10-08

Enabled local Open/Copy organizer/judge buttons create a persistent rehearsal from saved setup and reuse the same stage desk and judge routes. Organizer distribution access is explicit. A lost creation response is retried idempotently. Origin-local access-link storage is separate from legacy v2 state/backups. Existing rehearsals are edited on their organizer page; selecting another rehearsal confirms preserving the old event. Legacy overview panels are visible again, the local rich editor receives shared fieldset spacing, and head labels appear beside judge names in both setup displays.

The focused two-test local browser run verifies creation-response recovery, actual popup/link destinations, organizer distribution controls, clipboard contents, role isolation, starting the stage through its button, saving a judge mark, reopening/reloading the same event and retained marks, cancellation of another rehearsal, unchanged legacy state, and existing setup/backup regressions. Follow-up unit tests: 17 passed; local D1/API tests: 17 passed; lint, TypeScript and final build passed. The 390px screenshot was inspected and the embedded shell column-width defect fixed; both focused local browser tests passed again with a meaningful panel-width assertion.

The broader follow-up browser run passed all 8 tests, including the complete isolated multi-heat/song competition, acknowledged submissions, stage review, dual corrections, voting, advancement, finals, results and lifecycle controls. Focused local-link/layout tests passed again after the final embedded-layout correction. Final build, lint, TypeScript and whitespace checks passed. No hosted changes or services were purchased.

## Consolidated setup follow-up — 2026-10-08

This supersedes the preceding follow-up’s separate legacy overview: only one setup editor remains in local/shared modes. It retains competition cards and bib badges, labels the head beside their name, and uses native expandable sections collapsed by default, including judge links and nested round settings. Opening/collapsing does not commit drafts; Save setup, frozen assignments, role permissions and existing score/backup formats retain their meaning. The removed root-only controls are replaced by the shared editor through the local data adapter; no legacy state was reset.

Browser tests use actual summary clicks/keyboard activation before operating controls. The equivalent local/shared setup test verifies every section starts collapsed, only one Event name field exists, the duplicate overview is absent, Enter toggles a section, collapsing hides its fields, and the existing edit/save/reload/remove/import/backup sequence still works. Local-link tests continue through the collapsed access section and reopen the same persisted event. The final phone (390px) and desktop (1440px) collapsed-state screenshots were inspected. Section headers, arrows, counts and fields fit without horizontal overflow. Competition-card selection opens the matching round, and expanding/collapsing alone leaves Save setup disabled. Two prior test steps were updated to expand the new sections after a reload/new round; a subsequent connection-refused run was traced to the stopped preview and rerun after restarting it. Full workflow regression completion is recorded below. Unit tests (17), lint, TypeScript and build passed after consolidation.

Final consolidation verification: all 8 distinct browser scenarios passed (7 in the final broad run, then the complete stage rehearsal passed on its targeted rerun after updating the removed-heading assertion). The full mock completed setup, multiple heats/songs, acknowledged submissions, stage review, exact dual correction approvals, panel votes, advancement, fixed-pair finals, final results, exports, withdrawal and backup restore. The final source also passed 17 unit tests, lint, TypeScript, build and whitespace checks. The preview was restarted on 127.0.0.1:3000 without resetting its local D1 or the owner’s browser state. Documentation and affected sources were compared/synced to the preferred checkout. Hosted deployment, physical-phone/venue checks and real publishing remain unperformed.


## Batch closeout and Git delivery

Completed implementation committed and pushed as [`f589b7c6f5a0cde60c29b689019bed2137f19d4d`](https://github.com/WesKof/CountryDanceJudgingSoftware/commit/f589b7c6f5a0cde60c29b689019bed2137f19d4d). The remote branch hash matched local HEAD after push; the preferred working tree was clean. The commit contains the 43 explicitly staged implementation/test/documentation files and detailed notes. The renamed repository was subsequently verified to contain that same branch/commit. Subsequent closeout changes are documentation/specification only.

### Preservation and handoff

All 41 pre-closeout modified/untracked batch files matched the Documents mirror before edits. The index was initially empty. No unrelated dirty tracked file was identified; ignored local D1, credentials, build output, test artifacts and work files remain outside the commit. Commit only the captured batch file list plus closeout documentation, never blanket-stage a parent workspace.

Current implementation deliberately still includes legacy local Score/Results and existing result exports/optional Sheets publishing. The newly requested organizer-only screen, single judge page, view-only organizer Score, reorganized imports and separately controlled public-results service are future specification work. They are not implemented by this closeout.

Read AGENTS.md and PROJECT_SPEC.md first; use the test report and timeline for evidence. The owner answered the next batch's access, withdrawal, public disclosure, revision, service-continuity and branding questions on October 9. See [NEXT_BATCH_SPEC.md](NEXT_BATCH_SPEC.md) for confirmed rules and the remaining review gate. Do not implement that batch or create an implementation chat until the owner finishes specification review and authorizes it. Deployment, public publication and purchases remain separately unauthorized.

### Documentation follow-up — 2026-10-09

Planning documents were pushed as `3401ce0`. The owner then requested consolidation into four working files: AGENTS.md, PROJECT_SPEC.md, LOCAL_TEST_REPORT.md and NEXT_BATCH_SPEC.md. Timeline, closeout evidence, branding research and the future prompt are retained within those files. Application code and historical test evidence are unchanged. Documentation link/anchor, reference, mirror-content and Git whitespace checks apply; runtime tests are not repeated for documentation-only edits.
