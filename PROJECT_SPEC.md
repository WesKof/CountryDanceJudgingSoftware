# Country Dance Judging — master design, specification, and operating reference

Document version: 1.30 (local organizer usability redesign implemented). Current local implementation retains Set up → Run → Results → Publish and private Score pages, adding descriptive navigation, retained view-only competition/round context, truthful collapsed setup summaries, current Run actions/progress, focused Results and publication before recovery. Exact approved advancement, actual J&J draws, frozen Finals, scoring, permissions, history and complete-event independent publication approvals are preserved. Implementation/tests are committed locally as `240dcc3` on `codex/organizer-usability-redesign`, based on checkpoint `714d2be`. Earlier stage/access functionality remains pushed as `b0b3368`, with documentation checkpoint `5732336`; cleanup/checkpoint branches remain intact. No push, hosted source sync, deployment, provisioning, real publication or purchase occurred. See [LOCAL_TEST_REPORT.md](LOCAL_TEST_REPORT.md) for new October 11 evidence and limitations.

This describes the inspected implementation and the owner's decisions. It is intended for people and coding assistants. Source links are relative to the application repository. External hosting and Google configuration are dated observations, not live guarantees. If code and this document disagree, investigate and update the document; do not silently change behavior to fit stale prose.

## October 11 local checkpoint and next handoff

Specification revision **1.29** adds the next-batch plan below; current application behavior remains the 1.28 implementation described above. The owner explicitly requested a checkpoint of everything completed **locally**, followed by a new implementation chat. The local checkpoint is the documentation commit tagged `checkpoint/local-before-usability-redesign-2026-10-11` on `codex/cleanup-workflow-polish`; its application baseline is `122cd23`, including cleanup commits `5fa4960` and `d31faff`. It is local and unpushed. Preserve it and branch forward for the redesign.

The internet site at `https://country-dance-judging.wes6969.chatgpt.site/` is a **separate older checkpoint and design reference**, not the base for the next implementation. October 11 Sites inspection confirmed public/active hosting, latest saved version 3, source `4416e2fe92c0a1db9820bb6f2b68bd1acb2533b6`, and August 21 hosting update; the live page still shows the older combined scoring workflow. The owner explicitly requires leaving the remote site as is for now. No deploy, hosted source sync, access change, hosted migration, provisioning or real publication is authorized. Local Git commits do not update the internet site.

Read [Next batch: local organizer usability redesign](#next-batch-local-organizer-usability-redesign) for the approved work direction, scope, acceptance criteria and new-chat prompt. At the preserved checkpoint this batch was specified, not implemented. The redesign branch has now implemented and locally verified it; see current behavior and evidence below. October 11 evidence is recorded in LOCAL_TEST_REPORT.md; the prior implementation suites remain dated October 9.

## Quick context

- Owner: Wesley Coffman. The tool conducts Strictly couples and Jack & Jill competitions for the local community.
- Organizer navigation remains Set up → Run → Results → Publish, with the original theme, cards, bibs and collapsed setup sections. Set up is the initial organizer screen. Run contains room controls and submission/coverage progress; Results contains review, amendments and withdrawals. Judge score entry stays on private links. Imports remain in Set up; private judge access is in Run and Data & recovery is in Publish.
- Each private judge/head route has one Score page with assigned ballots, own notes and relevant review duties inline. Server role gates and explicit payload allowlists prevent organizer-page access or organizer configuration disclosure through judge links. Organizer distribution/testing access to judge links remains intentional.
- Configure the finalist count from either Prelims or Finals setup. Exact head-approved advancement automatically populates unopened Finals: Strictly couples copy directly; J&J advancing leads/follows require the actual draw pairs before judging. Cutoff votes and frozen Finals protections remain.
- New events use stage-v1: acknowledged heat snapshots, all-required-judge coverage/quorum, whole-stage review, equal judge means, full-panel advancement votes, head deadlock/finals placement decisions and exact head approvals. Organizer alone initiates/revises/cancels versioned corrections and withdrawals; distinct organizer and head explicitly approve the same exact version.
- `/` is the working organizer desk, with real Set up → Run → Results → Publish tabs. It reopens the saved D1 event directly; new visitors get a fictional ready-to-start sample. Judges use separate private links. Legacy v2 bytes/scores/revisions remain untouched on startup; only preparation may be copied, with fresh IDs and no score conversion. Legacy backup/history/restore is nested in Data & recovery.
- React 19 + TypeScript, Vinext/Vite App Router and logical D1 `DB`; four-second polling and revision/CAS guards remain. Operational data, local fake publisher storage and owner administration are separate. Publication is optional and never a scoring dependency.
- Only completed competitions with current matching head-approved advancement/Finals can prepare an immutable public snapshot. Organizer reviews the exact complete-event preview and sends it for approval; the separate results website’s authenticated admin approves and publishes the event with one top action. Public judge names, marks, blanks and counts are included; private notes, participant IDs, access credentials, setup notes and internal reasons are excluded.
- The separate local public site has Winners, Leaderboard, contestant/pair and named judge cards, Under review notices, immutable numbered revisions, stable current URLs and Superseded history. A durable outbox retries authorized local deliveries; the receiver validates current source, scope, ordering and independent numeric expectations before its atomic current-pointer change.
- Publication suspension/shutdown retain operational judging and recovery. Post-Finals changed-membership replacement/redance, reinstatement/substitutes and legacy-only publication remain deferred; invalidate/block rather than invent policy.
- Branding is the authorized Interskate/Lewisville community. A verified original 150×150 profile emblem is used only at a small size; cream/forest/copper public styling is an interpretation, with system/Georgia fonts and two credited original community photos. The judging template is preserved.
- Physical devices, venue Wi-Fi, hosted D1/auth/domain/provisioning/migrations/deployment, production capacity/uptime and real publication remain unperformed. There is no service worker or guaranteed offline reload.
- Read AGENTS.md and task-specific sections; inspect branch/status and compare mirror before edits/sync. Preserve existing/uncommitted data/work. Local success does not authorize public release or purchases.

## Reference index

- [Next batch: local organizer usability redesign](#next-batch-local-organizer-usability-redesign)

- [Project timeline](#project-timeline)

- [Product and workflow](#product-and-workflow)
- [Scoring contract](#scoring-contract)
- [Data and persistence](#data-and-persistence)
- [Inert Google compatibility source](#inert-google-compatibility-source)
- [Visual design](#visual-design)
- [Architecture and file map](#architecture-and-file-map)
- [Development and release](#development-and-release)
- [Known limitations and proposed improvements](#known-limitations-and-proposed-improvements)
- [Live judging implementation target](#live-judging-implementation-target)
- [Implementation handoff](#implementation-handoff)
- [Access, withdrawals and owner publication](#access-withdrawals-and-owner-publication--implemented-locally)
- [Maintenance and handoff](#maintenance-and-handoff)

## Project timeline

Updated 2026-10-11. Status distinguishes code verification, Git delivery and public deployment.

| Date | Milestone | Evidence / status |
| --- | --- | --- |
| 2026-10-11 | Local checkpoint and next usability batch | Preserve the complete local implementation at `122cd23` plus this documentation handoff under `checkpoint/local-before-usability-redesign-2026-10-11`. Next implementation uses a separate local branch and the detailed specification below. The older remote version 3 is a read-only design reference and must remain as is. No application change, push or deployment in this checkpoint. |
| 2026-10-09 | Local cleanup and review polish | Separate local `codex/cleanup-workflow-polish` from `5732336`: cancelled/pending correction approval controls aligned with the server; archived votes and request/withdrawal controls read only; head decisions and panel votes grouped with their competition; named request cards and collapsed approval records; responsive judging/public/admin tables and indexed scorecard lookups. No scoring, permission, storage or publication policy changes. Evidence is in the cleanup section of LOCAL_TEST_REPORT.md. |
| 2026-08-21 | Public competition release | Git `4416e2f`; recorded Sites version 3. Hosted availability was not reverified during closeout. |
| 2026-10-07 | Master specification and agent routing | Git `e70bc46`; PROJECT_SPEC.md and AGENTS.md became the durable project references. |
| 2026-10-08 | Earlier shared judging checkpoint | Git `d9ea167`, pushed to `github/codex/stage-heat-workflow` with explicit authorization. |
| 2026-10-08 | Stage/heat implementation | Equal judge means, acknowledged heat submissions, whole-stage review, panel votes, head decisions, dual corrections/withdrawals and retained history; local D1/API/mock competition verification. |
| 2026-10-08 | Local/shared setup and judge links | Reused setup editor; competition removal; persistent local D1 rehearsal links; head labels; v2 score/history preservation. |
| 2026-10-08–09 | Consolidated setup presentation | One editor with original cards/bibs/theme and native expandable sections collapsed by default; duplicate legacy overview removed. |
| 2026-10-11 | Local organizer usability redesign | Local `240dcc3`: descriptive navigation, view-only round selection, truthful collapsed summaries, current Run progress/actions, focused Results and exact blocker routes, publication before recovery. 33 units / 37 serial compiled API checks / 25 full browser scenarios / final nine-scenario recheck passed, with static/build, visual, restart/integrity/privacy evidence. Checkpoint and older hosted site preserved; local only. |
| 2026-10-09 | Completed-batch closeout | Pushed `f589b7c`; local/remote hashes match. Fresh 17 unit + 17 D1/API + 8 browser scenarios, lint, TypeScript and build passed. See [batch closeout](LOCAL_TEST_REPORT.md#batch-closeout-and-git-delivery). |
| 2026-10-09 | Next-batch policy and branding research | Confirmed organizer-only requests, individual/couple withdrawal, public judge names/no notes, owner-approved snapshots/revisions, continued operation without publishing, archive/shutdown policy and corrected community branding. Initially saved in the temporary specification; now folded into the implemented contract below. |
| 2026-10-09 | Repository account rename | Owner supplied `WesKof/CountryDanceJudgingSoftware`; verified its branch contains `f589b7c`. Same authorized branch and project. |
| 2026-10-09 | Documentation consolidation | Four working documents: short agent instructions, master spec/timeline, verification/closeout report and temporary next-batch spec/branding/prompt. No application changes. |
| 2026-10-09 | Owner-authorized local next-batch implementation | Access separation, view-only Score, setup imports, organizer requests, dual-approved entrant/couple withdrawal, separate local owner/fake-publication workflow, revisions and suspension implemented. See current verification report. No commit/push/deployment or real publication. |
| 2026-10-09 | Organizer-home and setup cleanup | Main page is the working desk; ready fictional sample, saved event reopening, fresh sample/blank event controls, fresh copy identities and more organized collapsed setup. Old organizer URLs remain compatible. See current test report. No hosted work. |
| 2026-10-09 | Organizer Run / Results clarification | Renamed organizer Score to Run; room controls are directly accessible there; stage completion opens Results. Corrections, withdrawals and review are in Results. Private judge Score and all permission/history rules remain. |
| 2026-10-09 | Data placement and result cleanup | Judge access moved to Run, recovery to Publish; combined collapsed amendment/withdrawal management; observation counts removed from main standings only. Publication prerequisites and owner-release status are explained, preserving approval gates. |
| 2026-10-09 | Public-site design and automatic Finals | Separate photo-led public pages, latest winner cards, event-filtered leaderboards and unchanged immutable scorecards/revisions; approved advancement fills unopened Strictly/J&J finalist rosters using Setup counts. Actual J&J draw remains organizer-entered; frozen Finals and deferred replacement policy protected. Local tests only; no hosted site registration/deployment or real publication. |
| 2026-10-09 | Finals roster clarity and named judge pages | Approved J&J people are visible immediately in Run; the actual draw remains organizer-entered via a shortcut to the selected Finals pairing setup. Readiness names the unpaired dancers instead of reporting an empty roster. Each judge link identifies its assigned judge in the page heading and tab title. Owner sample inspected without mutation; synthetic development/compiled controls verified. |
| 2026-10-09 | Finalist count capacity and renewed review | Setup/review explain J&J count per role and eligible capacity; invalid counts disable approval and server errors name the actual count/limit. Server-owned advancementRevision scopes each saved count change to a fresh source, retaining earlier approvals/votes and allowing explicit renewed approval after returning to an earlier count. No sample-event mutation or migration. |
| 2026-10-09 | Eligible-roster limits and actionable Run | Strictly maximum equals eligible couples; J&J maximum is the smaller eligible lead/follow count, excluding applied withdrawals. Input max and disabled Save prevent over-limit drafts; server independently rejects them without writes. Direct Fix finalist count/Review results/Set Finals pairings controls reveal the appropriate section. Review banner replaces stale dancing status, earlier selections are labeled pending renewed approval, and detail lists collapse by default. Owner saved count/draw untouched; synthetic development/compiled checks recorded in test report. |
| 2026-10-09 | Actual Finals draw directly in Run | Approved J&J leads receive follow dropdowns below Start Finals, retaining saved pairs and disabling used follows. Save Finals pairings uses the existing organizer setup/CAS route. Drafts survive navigation, block premature start, and stale event edits require discard/review. Saved pairs collapse after completion and disappear on frozen stage start. Shared pure pair edits retain pair IDs, heat assignments, songs, current advancement and count; no actual draw is invented. |
| 2026-10-09 | Results-website approval and usability | Complete-event review/send at the top of organizer Publish; separate `/admin` one-click event approval; durable atomic release sets and revisions; `/owner` compatibility redirect; plain-language/progressive-disclosure requirements in master/agent guidance. Local-only verification below. |
| 2026-10-09 | Git closeout and cleanup handoff | Completed implementation pushed as `b0b3368` to `github/codex/stage-heat-workflow`; 73 changed/new/deleted app paths matched the mirror before committing. Canonical documentation accompanies the checkpoint. Owner authorizes a separate task for up to three hours of optimization, refactoring, verified unused-code removal, UI polish and reproducible bug fixes, preserving intended functionality. Use a separate cleanup branch; no new features, deployment, provisioning, real publication or purchases. |
| Later, separately authorized | Hosted preparation and public release | Real domain/provider/auth setup, hosted migrations, venue/physical-device/capacity checks, deployment and publication. No date, purchase or deployment commitment. |

## Next batch: local organizer usability redesign

Status: **implemented and verified locally on `codex/organizer-usability-redesign`, October 11**. Implementation/test commit `240dcc3` starts from verified checkpoint `714d2be88261adf2b34e0afa2b93e8975147b0c3`; the checkpoint branch/tag remain preserved. Initial parity covered all 120 tracked files. The final 17 affected source/test/doc files are guarded and byte-matched with the mirror. Fresh verification passed 33 units, 37 serialized compiled API checks, all 25 browser scenarios and a final nine-scenario recheck after small wording changes, lint, TypeScript, production build and whitespace checks. Phone/desktop inspection, restart preservation, three SQLite integrity checks and absence of both server keys from 24 client artifacts also passed. See the test report for exact commands, failures corrected and limits.

The implemented view selector is event-scoped session state: changing it does not start a stage, alter setup or widen approval scope; polling does not move the selected review. Manual setup selection carries into Run/Results, while unsaved drafts retain their existing explicit Save/discard and stale-source rules. Run distinguishes event-wide room order from selected view, counts only the heat's assigned panel, labels disconnected data as last connected status and keeps completed stages compact. Organizer Results shows one round while named pending duties and the collapsed full overview preserve access to other rounds. Head/judge action permissions remain unchanged. Blocker shortcuts reveal and focus the exact setup or request section. Judge ballots now identify their format as well as division/round.

Publish leads with readiness and every competition's exact snapshot, then status/history and recovery. Sent-for-approval and confirmed released states remain distinct. No validated public results URL exists in the current LiveView contract, so no View published results link is invented. The older remote site informed visual hierarchy only and was not changed. No API/schema/scoring/approval/dependency change was needed.

The next concrete step is owner review at `http://127.0.0.1:3000/`, using the preserved local event. Address reproducible findings in a fresh focused review chat if requested. This batch has a clean handoff; compaction alone did not trigger completion or a new chat. Hosted deployment, physical phones/venue networks, capacity and guaranteed offline reload remain unperformed; post-Finals changed-membership replacement/redance remains undefined and blocked.

### Checkpoint, working copies and delivery

1. Read AGENTS.md, this section, relevant implemented contracts, and the latest LOCAL_TEST_REPORT.md. Inspect Git status and confirm the local checkpoint tag resolves before branching. Preferred repository: `C:\Users\Iam\Projects\Country Dance Judging App\app`; Documents is a source mirror inside a different parent repository. Compare affected files before every sync. Do not commit the parent workspace.
2. Start `codex/organizer-usability-redesign` from `checkpoint/local-before-usability-redesign-2026-10-11`. If a branch with that name already exists, inspect it before reuse; never reset unrelated work. Preserve the checkpoint tag/branch. The previous application-only baseline is `122cd23`; the new tag also includes this handoff documentation.
3. Make reviewable local commits for the coherent redesign and its meaningful regression coverage, followed by updated canonical documentation. Do not push, merge the checkpoint branch, deploy, synchronize hosted source, register a site, provision storage, purchase anything or publish real results. The remote site must remain exactly as is.
4. Use the running previews where available: organizer `http://127.0.0.1:3000/`, separate results `http://127.0.0.1:3100/`, website admin `http://127.0.0.1:3100/admin`. These are local services; separate public/admin hosting does not exist. Avoid restarting the receiver unnecessarily because its admin sessions are held in memory. Isolate all fixtures from the owner's browser and local stores.

### Observed friction to address

- Remote navigation explains each step with subtitles; local navigation has only Set up / Run / Results / Publish. Run gives little indication of its purpose.
- Local setup is compact but its collapsed sections require opening to assess readiness. Preserve collapsed defaults while adding useful, truthful summaries.
- In the inspected completed sample, Run shows Finals review alongside disabled Start prelims stage / Start finals stage controls and approved labels. Earlier completed actions distract from current work, and the review message needs a direct route to the relevant results.
- Results stacks Prelims and Finals for every competition into one long page. The currently relevant competition/round and outstanding tasks are difficult to locate.
- Publish places Data & recovery above the publication task. Maintenance and historical detail should follow the current task.
- Extra approval steps reflect real role boundaries. Explain the responsible person and next action in plain language rather than implying the organizer can complete another role's decision.

### Experience and layout requirements

| Surface | Required next-batch behavior | Preserved constraints |
| --- | --- | --- |
| Shared organizer shell | Retain the numbered forest sidebar/phone rail, cream cards and bib treatment. Restore concise subtitles: Set up — Event & entries; Run — Judges & rounds; Results — Review & advance; Publish — Send approved results. Maintain an unmistakable active tab and comfortable spacing. Use one consistent event/competition/round/status header where relevant. | No second navigation system, basic/advanced mode, new dashboard or duplicate workflow. Keep text usable at phone widths; accessible names remain descriptive even when subtitles are visually reduced. |
| Competition and round context | Make the selected competition and round visible in Run/Results; provide a compact selector or overview using existing program data. Preserve deliberate selection between tabs where meaningful. Pending work elsewhere remains visible through named status/actions. | Display selection must never change the actual running heat/stage, eligibility, saved setup or approval scope. If the active stage is event-wide, clearly distinguish its scope from the selected competition view. Whole-event Publish always covers the entire event. Do not silently jump while someone reviews or edits. |
| Set up | Keep sections initially collapsed. Show concise summaries drawn from actual setup, such as assigned judge count, entrant count and finalist count. Separate configured counts from validated readiness. A blocker shortcut opens/focuses the relevant section. Keep explicit Save and clear saved/unsaved feedback. Move lengthy sample instructions into short contextual help. | Preserve common local/shared editor, imports, keyboard access, drafts across navigation, cancel/discard behavior and server version guards. Initial organizer entry remains Set up; no forced wizard. Do not auto-save, create events or change counts/pairings as a side effect of navigation. |
| Run | Lead with the current stage/heat, truthful submission progress and one primary actionable next step. Completed stages become compact statuses with a review link instead of prominent disabled start buttons. Judge access is easy to reach below the main action. Show Finals draw controls when needed, keeping the existing Save pairings flow. | Progress denominators must come from the relevant assigned judges/heat/stage, not an assumed panel of three. Distinguish submitted, acknowledged, missing coverage and disconnected/unknown states. Keep required detail reachable. Never enable Start when drafts, count, pairing or approval rules block it. |
| Results | Default to the relevant competition/round, with a compact overview that makes other competitions and pending duties discoverable. Lead with placement table and review status/actions; keep the exact subject of any approval immediately visible. Provide a direct route back to the next round or Publish when eligible. | Retain all results, both J&J roles, ties, withdrawn/archived labels, submitted marks, scorecards, requests and history. Organizer sees status/routes; only authorized judges/head see their existing vote/decision/approval controls. No cross-competition stale-selection approvals. |
| Publish | Put readiness and the exact complete-event preview before Data & recovery. Use the existing review/send flow with a clear Send results for approval action and explanation of website-admin approval. After confirmed release, make View published results prominent when an existing validated results URL is available. Keep maintenance and publication history below the main task. | Preserve explicit exact-version review, all-competition scope, independent website-admin release and failure/retry semantics. Do not infer Published from delivery alone, invent a public URL, add an organizer admin credential screen or bypass re-review after source changes. |
| Private judge/head pages | Keep assigned name, current ballot and existing Score flow central. Bring a required review/correction duty forward when relevant; preserve submitted ballot access and existing head duties. Limit changes to coherence with the organizer redesign and verified usability needs. | Organizer/judge separation, note privacy, named confirmation, immutable submitted ballots and exact permission gates remain. Do not rebuild the judging engine or expand this into an unrelated public-site redesign. |

The main action area should state where the user is, what needs attention, who is responsible and the next available action. Example copy is illustrative, not hard-coded logic: "2 of 3 judges submitted — waiting for Robin's ballot" with Open judge links; after all applicable submissions, "Prelims ready for review — head judge approval needed before Finals" with Review prelims. Handle pluralization, actual assignments, multi-heat stages and unavailable data accurately. Required pending requests must remain visible even when historical details are collapsed.

### State and navigation acceptance matrix

| Scenario | What the user should see and be able to do |
| --- | --- |
| Blank/incomplete setup | A concise explanation of the actual missing requirement and a shortcut to its field/section; no misleading Ready state. Empty program remains usable. |
| Valid preparation | A clear Start action for the eligible stage; configured competition and actual stage scope are apparent. |
| Active judging with missing coverage/submissions | Correct scoped progress and relevant judge links; no premature official placements or stage transition. |
| Stage awaiting review | Review action leads to the exact competition/stage and pending duties. Organizer cannot perform head-only work. |
| Pending correction / cutoff tie / head decision | Named blocker and correct-role route remain visible; cancelled/applied requests do not incorrectly block approval. |
| Prelims approved / Finals not ready | Approved status plus the actual count or pairing requirement. Shortcuts preserve selection and drafts; unsaved/stale pairing guards remain. |
| Finals active | The active round is obvious; completed Prelims controls are quiet; frozen rosters/pairings are not editable. |
| Finals approved / another competition incomplete | Results are easy to locate; Publish names the unfinished competition and routes to it without offering partial publication. |
| Event ready / awaiting website admin / released / invalidated | Each state has accurate copy, one useful primary action where available, exact preview and accessible history. Changed sources require renewed review. |
| Archived event | Clear read-only status; prior ballots/results/history accessible; no active mutation controls. |
| Navigation, reload and concurrent edit | User can return to the intended competition/round; no cross-event selection leak, dropped drafts, silently changed action target or bypass of stale-version checks. |

### Implementation sequence and source routing

1. Inspect current desktop and 360/390px layouts with isolated synthetic sessions. Compare the preserved remote interface read-only. Capture focused baseline evidence; never use owner event data for test mutations.
2. Implement shell hierarchy, descriptive navigation and display selection/context first. Likely entry points: `components/live/shell.tsx`, `organizer-home.tsx`, `desk.tsx`, `stage-desk.tsx` and `app/globals.css`. Verify actual responsibilities before editing.
3. Add truthful collapsed summaries in `setup.tsx` / `setup-section.tsx` and state-specific Run presentation in the existing desk components. Reuse `finals-pairings.tsx`; preserve setup/CAS handlers and underlying domain rules.
4. Focus Results using `results.tsx` / `stage-review.tsx`, then reorder/clarify `publication.tsx` using the existing readiness helper. Keep current role-aware shared rendering; avoid parallel implementations or a speculative abstraction layer.
5. Complete browser walkthrough and regression checks, inspect final phone/desktop visuals, and correct observed issues. Update these three canonical Markdown documents with implemented behavior, exact evidence, local commits and remaining limitations. Sync only affected source/test/doc files after guarded comparisons. Keep the new local preview available for owner review.

No scoring, API, schema, approval or authorization changes are planned. If a presentation defect requires a small underlying fix, reproduce it, preserve the contract, add appropriate regression coverage and document it. Material policy ambiguity stays deferred; in particular do not invent post-Finals replacement/redance rules. Do not add dependencies, services or hosted work to solve layout concerns.

### Verification and definition of done

- Add behavior-focused browser coverage for truthful state/action transitions, retained selection, direct blocker navigation, keyboard/focus, phone layout and access to hidden details. Use semantic controls; do not weaken existing assertions just because labels moved. Avoid tests that merely mirror component structure or exact styling.
- Walk one complete isolated fictional event through setup, Prelims, separate judge submissions, head review/advancement, actual J&J draw, Finals and complete-event publication using the local fake receiver and separate website-admin/public contexts. Include missing submission, pending correction, tie, unfinished competition and archived-state cases, plus existing count-cycle/stale-draft regressions as applicable. Assert independent numerical outcomes and role gates.
- Run applicable existing unit, live API and browser suites plus lint, TypeScript, production build and `git diff --check`. Use an isolated compiled Worker/D1 store and receiver for publication state changes. Report exact passed/failed/unperformed checks and distinguish existing October 9 evidence from new verification. No real external sends.
- At 360, 390 and desktop widths, primary context/action is readable, labels/focus work, controls do not overlap, main placement columns fit, and intentional detailed scorecard scrolling remains understandable. Confirm collapsed setup defaults and reachable historical detail.
- The task is complete when existing supported behavior is retained and every matrix state communicates current context, responsibility and a useful next action without requiring the organizer to interpret internal mechanics. Keep unresolved visual or workflow issues explicit; automated checks do not establish ease of use or venue/hosted readiness on their own.

### Clean-handoff continuation prompt

Review the locally implemented organizer usability redesign on `codex/organizer-usability-redesign` (`240dcc3`, followed by its documentation commit). Read AGENTS.md, PROJECT_SPEC.md revision 1.30 and the October 11 LOCAL_TEST_REPORT.md first. Verify current branch/status and preferred/mirror parity before changes. Inspect the updated local preview on 3000, preserving owner data and the 3100 admin session. Address only reproducible review findings with focused verification and canonical documentation. Preserve scoring/role/approval/privacy/history/frozen-Finals contracts and checkpoint `714d2be`. No push, hosted source sync, deployment, provisioning, real publication or purchase. Do not redo the completed redesign or mark new unfinished work complete to reach a handoff.

## Product and workflow

### Established owner decisions

The site should be usable by friends running community competitions and presentable as a public portfolio project. The owner accepted public access and the current URL, declined custom in-app authentication, and explicitly preferred sidebar navigation because it communicates competition flow. Preserve these choices unless a new request changes them. Low stakes justify simplicity, but scores and saved work should remain predictable.

### Implemented local/demo surfaces

| Surface | Current behavior |
| --- | --- |
| Set up | One common editor; collapsed sections, event/judges, program, required panels, finalists/pairs, roster/heats and rotations. Inline CSV examples/imports; explicit Save persists drafts. Imports stay here; judge access/room controls live in Run and Data & recovery lives in Publish. |
| Organizer Run | Start stage, next song/heat, lineup and conclude/open review, plus room/submission/coverage progress and collapsed private judge access (Copy/Open and link management). No judge mark entry, judge submission, panel votes or head approval actions. Concluding a stage opens Results. |
| Results | Main standings show place, entrant and average; observation counts and explicit blanks remain in detailed scorecards. Organizer recording-error requests, competition/entrant withdrawals and exact approval/history are combined in one collapsed Amendments & withdrawals section. Head approvals/decisions remain on the private judge page. |
| Publish | Collapsed Data & recovery (operational/v2 backups, restores, retained history and archive controls), plus exact public snapshot preview and organizer approval request. Disabled preparation explains missing stages/submissions/head approvals or changed finalists and offers navigation to the next step. One top action reviews all competitions, followed by Send results for approval above their final placements. Status explains website-admin approval, sending pending or Published. Detailed scorecards and prior versions are collapsed; the judging app has no admin credential or approval screen. No result export or Google publishing controls. |
| Organizer home / legacy recovery | Browser remembers private D1 access separately from backups. Fresh visitor gets sample preparation; existing event reopens. Read-only v2 archive and wrapped/plain restore sit in Data & recovery. Restore opens a separate setup copy without importing legacy scores as stage marks. |

Preparation removal edits the current D1 event; the separately retained legacy archive, including earlier removed-competition history, is unchanged. Started event assignments stay frozen; use documented review requests rather than deleting score history. Restoring device data replaces that device event after confirmation. Shared restore creates a fresh preparation event with new links and inert imported history. Link codes remain separate from backups. There is no automatic migration of v2 scores into stage averages.

## Scoring contract

This section describes retained legacy v2 semantics, used for recovery/history rather than new organizer score entry. Authoritative implementation: [lib/scoring.ts](lib/scoring.ts). Examples: [tests/scoring.test.ts](tests/scoring.test.ts).

| Mark | Numeric value | Counts as filled? |
| --- | ---: | --- |
| `Yes` | 10 | Yes |
| `A1` | 4.5 | Yes |
| `A2` | 4.3 | Yes |
| `No` | 0 | Yes |
| empty string | contributes 0 to helper total | No |

Scores are sums, not averages or ordinal judge rankings. An entry is eligible for standings only when at least one judge exists and every current judge has a nonempty mark. The ballot is complete only when `entries × judges > 0` and all required marks are selected.

Sort completed entries by descending total. Totals differing by less than 0.0001 share place. Use competition ranking: totals 30, 30, 28 produce places 1, 1, 3. Entry ID orders rows with exactly equal totals for display; it must not award one tied entry a better place. Strictly has one Couples group. Jack & Jill has separate Leads and Follows groups (with a defensive Unassigneds group).

Historically, saving a v2 revision required the whole ballot to be complete; the current interface only reads those retained revisions. It appends an ID, ISO timestamp, sequential label, and calculated result rows. It does not lock marks, advance a round, or create an authenticated audit record. The current UI lists revision timestamps/counts; it does not provide full historical-row browsing. CSV/print use current results, including completed entries in a still-provisional ballot.

Legacy mode has no callbacks or automatic advancement. No skating/relative-placement algorithm, judge quotas or official sanctioning-body compliance is implemented. Confirm competition rules before changing the established mark values or ranking semantics.

## Data and persistence

Legacy types/history fixture: [lib/domain.ts](lib/domain.ts). Organizer home: [organizer-home.tsx](components/live/organizer-home.tsx); fictional stage preparation and fresh identity copies: [sample-setup.ts](lib/sample-setup.ts).

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

The organizer home reads `country-dance-judging:v2` without rewriting it. Invalid legacy data stays untouched; when no saved D1 event exists it blocks automatic setup copying until recovery. Save setup edits the current D1 event with an explicit version guard and does not rewrite the legacy archive. Historical publisher URL/key fields are inert and no key control or outgoing publisher remains in the UI. New backups clear publisherUrl; the separate historical publisher-key is not exported. Storage is per browser profile and origin, not per signed-in user.

The main organizer workspace uses the same authoritative D1 engine as private event URLs. A new browser gets its own sample event and private organizer binding; an explicit organizer URL can reopen an existing event. `country-dance-judging:rehearsal` stores the current access/creation nonce; `country-dance-judging:organizer-history` stores earlier private event links, separately from backups. Legacy scores stay in their original origin-local archive; a setup-only copy does not migrate marks, revisions or approvals. Changing browser/device/hostname does not transfer those device records. Browser access keys are not encrypted; keep organizer URLs private.

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

The example is a shape illustration, not an importable backup. Full ballots, event details, judges, competitions, and revisions are exported. The publishing key is separate and not exported. Restore accepts the wrapped format and older raw v2 state objects; the inert historical publisher URL is excluded from new backups and no publisher key is exported. New fields must not accidentally introduce credentials into exports.

`isAppState` only checks a few top-level properties and the presence of the active competition (or empty competitions with an empty active ID). It is not deep schema validation. Restore currently does not enforce `backupVersion`, inspect all nested fields, or deeply validate nested values. Device and shared restore now cap input at 1.5 MB. Do not describe it as fully validated input.

### CSV contract

Setup imports are confined to preparation and use inline examples rather than downloadable templates. Strictly: `Number,Lead,Follow`; J&J: `Number,Name,Role`; judges: `Name,ParticipantId`. Judge imports validate distinct participant identities and cannot replace a panel after a round starts. Validated imports change the editor draft only; Save setup is explicit. Roster imports use existing deep setup checks and respect frozen started rounds. The parser supports quoted commas, line breaks and escaped quotes. Result CSV/Excel/PDF/scorecard/history-download/print features are removed; JSON recovery remains separately labeled.

### Event-day usage

Run deliberately created private organizer/judge routes, keep organizer and distribution links separately, and make operational JSON backups before recovery operations. Judge pending edits remain attached to their original song and retry online. A checked heat submission becomes immutable after named confirmation; every active entrant needs an observation from each assigned judge. Explicit No is coverage and zero; a blank is not observed. Publication service availability has no bearing on operational judging. First load/reload still requires the operational service; no guaranteed offline installation exists.

## Inert Google compatibility source

[Do_Post.gs](google-apps-script/Do_Post.gs) and its historical setup README remain as compatibility source/history only. No organizer/public route, key/URL editor, send control or result export invokes them. Editing this source does not deploy Apps Script. No Google request was made. New publication is the separately owner-controlled, local-only workflow described below; real external publishing requires separate authorization.

## Usability contract

The intended audience includes nontechnical organizers, dancers and judges who may not know the judging process. Every screen must make the next step, responsible person and outcome clear in ordinary language. Keep a single useful primary action near the top, with the information being approved immediately below it. State actionable blockers next to disabled controls and offer a shortcut to the relevant section. Show names/bibs, placements, required approvals and concise status; collapse full marks/calculations, technical metadata, history and uncommon maintenance. Group related corrections/withdrawals and event-wide publication tasks. Do not remove evidence, privacy or exact approval checks to simplify the display. Assess new features for control placement, understandable wording, keyboard access and narrow-screen fit. AGENTS.md makes this a standing implementation requirement; no external documentation upload is required or authorized by these local changes.

The local cleanup applies this to stage review: each competition shows its head approval action, reason for any blocker, panel vote and head tie decision before its placements. Pending recording-error corrections block both Prelims and Finals approval; cancelled/applied requests no longer block the button, matching the existing server gate. A Review pending corrections shortcut scrolls to and focuses the exact request. Pending request cards precede resolved cards, retain entrant/couple names, bibs, original/intended marks and approval status, and collapse requester identities, version/timestamps and detailed pairing records. Private submitted notes remain author-only. Archived event votes and correction/withdrawal management are read only in the UI as well as on the server. Completed-stage judge review hides an empty song selector and explains that the submitted scores are locked. Phone result tables retain place, entrant/bib and average together without horizontal scrolling; full calculations remain expandable. Public/admin styling shares the same readable hierarchy without changing approval actions or receiver sessions.

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

| Area | Source |
| --- | --- |
| Organizer home / legacy recovery | `app/page.tsx`, `components/live/organizer-home.tsx`, `lib/sample-setup.ts`, `lib/domain.ts`, `lib/demo-setup.ts`; main D1 desk, isolated fictional preparation and v2 retained without score conversion |
| Organizer role gates / desks | `app/live/[code]/page.tsx`, `components/live/desk.tsx` (older block events), `stage-desk.tsx` (stage-v1), `finals-pairings.tsx` (approved actual-draw controls in Run) |
| Common setup / judge access | `components/live/setup.tsx`, `setup-section.tsx`, `desk.tsx`, `stage-desk.tsx`; one ordered editor; organizer home no longer uses a separate preparation wrapper |
| Judge/head page | `app/judge/[slug]/[code]/page.tsx`, `components/live/judge.tsx`, `stage-review.tsx`, `results.tsx`, `client.ts`, `lib/live/merge.ts` |
| Server authority / scoring / eligibility | `lib/live/server.ts`, `types.ts`, `validation.ts`, `stage.ts`, `eligibility.ts`, `finalists.ts`; atomic prepared D1 batches, receipts, frozen rounds and immutable submissions |
| Public snapshots / preview | `lib/live/publication.ts`, `components/live/publication.tsx`; allowlist and independent numeric validation |
| Website admin / receiver-only source checks | `public-site/admin.ts` is served on the separate results origin; `app/owner/page.tsx` redirects old links there. `/api/publication-owner`, `/api/publication-source`, `lib/live/local-publisher.ts` retain server authority; server-only synthetic `.dev.vars` |
| Separate local public site / dispatcher | `public-site/render.ts`, `public-site/styles.css`, `public-site/assets/`, `scripts/fake-publisher.mts`, `scripts/publication-outbox.mts`; separate origin/store, local static asset allowlist/CSP, durable retries, no automatic approvals |
| Storage | `db/schema.ts`, append-only `drizzle/0004_late_epoch.sql` (snapshots/outbox), `0005_friendly_living_mummy.sql` (service state), prior migrations retained unchanged |
| Publication readiness guidance | `lib/live/publication-readiness.ts`; client explanations of existing server prerequisites, with navigation to Setup/Run/Results; server remains authoritative |
| Branding | `public/kickinit-community-logo.jpg`; original verified 150×150 profile image, small-display use only |
| Tests | Existing legacy/stage suites plus `eligibility.test.ts`, `publication.test.ts`, `publication-api.test.mts`, `withdrawal-api.test.mts`, access/owner/withdrawal browser scenarios and the extended full stage mock |

The server supplies explicit role-scoped data; hidden navigation is not the permission boundary. A judge response omits organizer metadata/identity, participant identifiers in both setup and frozen panels, link distribution, publication state and other authors’ notes. Relevant request audit displays role labels; original identities remain in the operational immutable history. Owner credentials confer no operational organizer/head/judge powers. Anonymous public readers see released snapshots only.

## Development and release

### Repository and local working copies

- Repository: [WesKof/CountryDanceJudgingSoftware](https://github.com/WesKof/CountryDanceJudgingSoftware), renamed by the owner on 2026-10-09.
- Pushed feature branch: [`codex/stage-heat-workflow`](https://github.com/WesKof/CountryDanceJudgingSoftware/tree/codex/stage-heat-workflow); checkpoint `d9ea167` and completed stage/setup batch `f589b7c` are pushed. The owner-authorized next batch and subsequent workflow/site-admin changes are committed and pushed as `b0b3368`.
- Current cleanup checkout: local-only `codex/cleanup-workflow-polish`, based on pushed checkpoint `573233657968bb59a564602081aca638b48130fb`. `codex/stage-heat-workflow` remains at that checkpoint. Focused cleanup commits and verification are recorded in LOCAL_TEST_REPORT.md; do not merge or push them without a later request.
- The stage-workflow branch tracks `github/codex/stage-heat-workflow`. The prior local `main` tracked `github/codex/country-dance-judging-app`; GitHub historical `main` and `StrictlyMaster` are separate legacy branches.
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

For future changes: preserve scoring cases; add focused tests for new data-handling behavior; run lint/typecheck/build as appropriate for application changes. Test publication against the local synthetic receiver only. Documentation-only work needs factual/link/diff checks. Do not claim a successful TypeScript check based solely on a Vite build.

### Hosting and public sharing

For shared local development, run `pnpm install`, `pnpm build`, `pnpm db:local`, then `pnpm dev`. `pnpm db:generate` appends Drizzle SQL after schema changes. The migration helper records local applied file hashes under ignored `.wrangler/`; do not edit already applied SQL/meta or replay migrations blindly. Use `.wrangler/state` for both preview and local migrations.

With the local server running, `pnpm test:live` runs the actual HTTP/D1 suite and `pnpm test:browser` uses four isolated headless Microsoft Edge contexts (Windows default). Set `LIVE_TEST_URL` when using a URL other than `http://127.0.0.1:3000` for browser tests or `http://localhost:3000` for the Node API suite. Set Playwright's browser channel to an installed supported browser on other hosts. Outputs in `test-results/` and the local D1/cache folders remain ignored; they contain synthetic rehearsal data and are not source artifacts.

Public URL: [country-dance-judging.wes6969.chatgpt.site](https://country-dance-judging.wes6969.chatgpt.site/).

The project ID is in `.openai/hosting.json`; reuse it. Last confirmed public release was Sites version 3, baseline commit above, on 2026-08-21. No custom domain was attached at that check. Verify live access/version when a deployment task needs current information.

GitHub and Sites source hosting are separate destinations. Pushing GitHub alone does not publish the website. Follow the currently installed Sites hosting guidance: validate, push exact source to the site's repository, package that build, save/deploy the version, and verify completion/access. Never persist the temporary source token in a remote URL or this document. A documentation update alone does not require redeployment.

## Known limitations and proposed improvements

| Area | Current limit |
| --- | --- |
| Legacy restore | v2 top-level validation remains shallow; unknown nested properties may survive. Input is capped and malformed startup data is preserved, but this is not complete schema validation. |
| Recovery/privacy | Device data and explicit note-inclusive backups are accessible to file/device holders. Ordinary operational notes remain author-only. Backup inclusion has its existing warning and is separate from public disclosure. |
| Offline operation | Online retry/pending cache works; no service worker, guaranteed offline first load/reload or measured extended venue outage. |
| Hosted services | Owner controls/auth, provider/domain choices, hosted D1 quotas/migrations/capacity and real receiver provisioning are unperformed and unauthorized here. Local synthetic credentials are not a production authentication design. |
| Publication | Local fake receiver/store only. Last synchronized time exposes delayed status propagation; public outage may delay Under review. No real release, real external publication or uptime promise. |
| Post-Finals policy | Changed advancement/finalist membership blocks approval/publication; no invented substitute/replacement/redance/reinstatement policy. Legacy-only publication is deferred. |
| Assets | Verified small profile emblem is suitable at its small display size; no high-resolution/vector source or large-print asset is claimed. Two original public community photos (640×449 and 640×480) are selected for modest web display; no high-resolution/print suitability or paid font license is claimed. |
| Capacity/devices | Synthetic Edge contexts and local Worker/D1 checks do not establish physical-phone, venue-Wi-Fi, long-history or production load behavior. |

## Live judging implementation target

**Implemented locally, 2026-10-08:** new shared events use the confirmed stage workflow. The logical Sites D1 binding remains `DB`, R2 is null and the Sites identity is unchanged. Migrations `0000` through `0003` were applied only to local D1; no hosted database or public release was created. [LOCAL_TEST_REPORT.md](LOCAL_TEST_REPORT.md) records verification and operating limits.

### Stage workflow revision — implemented locally

**Setup and roles.** One distinct organizer manages the event; every stage judging panel includes the single event-wide head. The organizer cannot score, vote, or occupy a panel assignment. Setup stores unique, normalized participant identifiers and an organizer attestation. The server rejects overlapping identifiers and requires the attestation, organizer identity and every judge identifier before starting. Opened assignments, panel/head and organizer identity are frozen. Possession of separate private links cannot prove who physically holds them; the attestation remains an organizer responsibility. No accounts were added.

**Stages and room timing.** Start Prelims or Finals across all scheduled divisions/competitions and heats. Each heat has 2–3 songs, run back to back. Next song changes room context without moving an in-progress note edit to another song. After the last song, the organizer opens the heat-end lineup. Every assigned judge must submit an acknowledged snapshot before Next heat / division or Conclude stage becomes available. There is no deadline, guessed mark or automatic missing-coverage exception. Readiness messages name unmet setup/submission requirements. Official averages, stack ranking and comparison cards appear only when the entire stage closes.

**Coverage and final submission.** Every judge must record at least one mark for each assigned entrant across that heat’s songs. No=0 is a valid observation; blank and note-only cells do not satisfy coverage. Individual song blanks remain explicit. Song drafts autosave with cell revisions, operation IDs and author-scoped recovery. The lineup allows slight revisions on the judge’s own visited song pages. Judges must check “I checked the bibs and song marks…” and then confirm the named stage/division/heat. Any mark/note edit clears the acknowledgement; refresh verifies the reviewed snapshot and the server checks the exact ballot version plus acknowledgement. The immutable snapshot records `acknowledgedAt`. Cancelled/failed submissions leave the form available. Acknowledged entries disappear from active forms, remain in history and become read-only stage cards. All required judges submit independently; concurrent submissions do not conflict merely because another judge submits first.

**Scoring.** Values remain Yes=10, A1=4.5, A2=4.3, No=0. For each entrant, average each assigned judge’s recorded songs, then average those judge means equally. Blanks contribute no observation; they never become zero. Display each judge mean/observation count, per-song means/counts and every submitted mark/blank. Count heat acknowledgements separately from judges; preliminary equal-average ranks remain visibly equal after the separate advancement vote is decided. For example, judge means 10, 5 and 5 produce 20/3 even if observation counts are 1, 2 and 2. J&J prelims rank Leads and Follows independently with stable dancer identities across partner rotations. Finals score fixed pairs/couples together. Legacy v2 totals/completeness/ranks are unchanged.

**Advancement votes.** The saved final round’s finalist count, editable from either Prelims or Finals setup, defines the cutoff (per role for J&J). A tie crossing that cutoff creates a separate panel vote. Every assigned judge, including the head, chooses exactly the remaining number of places from the tied group. All must vote; highest vote counts advance. A full-panel vote tie at the remaining boundary requires an explicit head decision; candidates above that vote boundary cannot be displaced. Votes and decisions are scoped to current source fingerprints and retained in history. Finalized own choices remain visible after reload. Numeric marks and averages never change for a tiebreak. The head approves the exact resulting advancement. Head approval atomically persists that exact advancing selection into matching unopened Finals. Strictly copies the approved couples with their identities/bibs/names; J&J selects the approved leads and follows but requires the organizer to enter the actual random draw in Run or Finals setup. Existing eligible pairs and heat assignments are retained, new Strictly subjects enter the first heat, and songs/panel/heat identities remain unchanged. The stage UI shows a read-only advancing roster instead of selection checkboxes. For J&J, Run presents one approved lead/follow dropdown row per couple directly below Start Finals, with existing saved pairs prefilled and assigned follows disabled for other leads. Save Finals pairings persists the exact organizer-entered draw through the existing setup API/version guard while retaining Prelims approval. Both Setup and Run reuse setFinalsPair, preserving existing pair identities/bibs, other heat assignments and songs; new pairs enter the first heat. No pair is inferred. The selected-roster list stays collapsed. Pending draws open automatically, completed saved draws collapse but remain editable until the stage starts. Shared unsaved drafts survive organizer tab navigation and block starting a stage; concurrent event changes disable stale edits/Save and require discard/review. Started Finals hide this editor and retain server frozen-stage protection. The round count represents advancing people; a separate count reports completed pairs. Server opening readiness names unpaired dancers and directs the organizer to enter the actual draw; Run instead gives a short instruction to use the adjacent dropdowns and Save Finals pairings, replacing misleading Add entrants/empty-heat messages while the entire draw is pending. Existing heat/song checks and the requirement to pair every finalist remain enforced. No pair is invented, even when only one lead/follow advance. Count changes invalidate Prelims review; renewed approval refills unopened Finals. The J&J count is per role and therefore also the number of Finals couples: 1 selects one lead and one follow, not one total dancer. Setup and provisional review show eligible capacity and specific count/limit guidance; head approval is disabled when a required role/couple group cannot supply that many finalists. Server validation independently rejects invalid counts with the same explanation. Eligible capacity excludes applied withdrawals. The count input's maximum is the eligible couple total for Strictly or the smaller Lead/Follow total for J&J (within the existing 100-count schema bound). An over-limit typed draft cannot be saved; the server separately rejects over-limit stage setup without changing event version, advancement revision, scores, submissions or approvals. Empty/incomplete preparation rosters remain savable, but their count control is disabled until eligible groups exist; opening/head approval still requires a valid positive count. Existing saved invalid values are displayed for explicit correction rather than silently changed. Run prioritizes Fix finalist count while that is the blocker, then names the head approval required and offers Review prelims results. Shortcuts expand the matching Finals setup and scroll to Finalists & pairings. Once current approval exists, the inline actual-draw controls appear while the selected-dancer roster stays collapsed. Previously selected people/draws are labeled as previous pending renewed approval, not current approved advancement. Heat-submission and judge-coverage details also collapse by default; current waiting/submission actions stay visible. The post-stage banner describes review instead of stale song/lineup activity. J&J freeze errors distinguish the configured pair-count mismatch from wrong selected identities. No count is silently capped or changed. Each saved count change increments server-owned advancementRevision on the matching Finals setup and includes it in the Prelims source fingerprint. This revision stays stable through approval and ordinary setup saves, ignores client-supplied values, and distinguishes a later return to a previously approved count. Fresh explicit approval is then possible without uniqueness conflicts or overwriting earlier approvals/votes/snapshots. Existing events without this additive JSON field retain their current fingerprints until a count changes; no schema migration is needed. Older approved events with empty unopened Finals derive the exact approved roster for display and persist it on Save/opening; reads do not write. Started Finals are never replaced by this helper. Saved/frozen finalists must still match currently approved advancement before Finals start or approval/publication can proceed. Legacy block finalist selection remains manual.

**Finals review.** Finals ties require an explicit head placement decision, ordered or explicitly shared; ordinary judges and organizer cannot decide or approve them. Head approval requires current source submissions, current round version, every required acknowledgement, resolved ties and current matching preliminary advancement. Provisional and approved results are labeled separately.

**Genuine recording-error corrections.** Only the organizer may request a change to an exact submitted heat version after discussion with the affected judge, with cells, recorded/intended marks and reason. A mistaken-bib transfer explicitly identifies both entries. Proposed changes cannot leave an entrant uncovered. Each revision creates a new request version and clears prior request approvals. Organizer and head must review/approve that same exact version from distinct participant identifiers/roles; either approval alone leaves marks intact. Applying both adds an immutable amended heat snapshot linked to the original. Original/corrected values, requester, reason, both approval timestamps and prior result/vote snapshots remain in history. Affected result/advancement/dependent final approval becomes stale and requires renewed review. This is not routine rejudging, filling an unobserved blank, or copying another judge.

**Competition removal and withdrawal.** Preparation Remove competition asks for confirmation, removes both rounds and running-order references from the draft, and requires Save setup. Remove heat retains the roster, leaves its entrants unassigned for reassignment and protects the last heat. Empty programs remain editable. A started competition instead requires an organizer withdrawal request with reason and both organizer/head approvals. The active program/context is repaired, affected reviews are invalidated, and all judging records remain in database/backups. Withdrawing the active last division leaves the remaining stage able to conclude. Late writes to removed rounds are rejected.

**Notes, transparency and recovery.** Private notes stay author-only in ordinary API/read/review data. Finalized stage cards reveal marks, explicit blanks and counts to appropriate roles. Public snapshots exclude all notes, access/participant identities and internal reasons. No CSV/Excel/PDF/scorecard/result-print or Sheets publishing path remains. Default operational backups exclude credentials and notes; explicit note inclusion retains its existing warning. Recovery contains immutable requests, submissions and publication history as inert imported records.

**Settled decisions.** Equal judge means; complete required heat submissions; full-panel exact-count votes; head deadlock/finals decisions; unique participant identifiers plus attestation; affected-judge/organizer correction requests; dual exact-version correction/withdrawal approval; author-only notes. No automatic deadlines, abstentions, copied scores or ordinary stage-end editing were introduced.

**Remaining operating decision.** If a genuine correction after Finals has already danced changes which people should have advanced, the app invalidates approval and blocks mismatched Finals approval. The owner has not defined a replacement-finalist/redance policy. No automatic redance or replacement is inferred. Corrections before advancement and corrections that retain finalist membership are supported with renewed review. This decision did not block the isolated rehearsal.

### Current implementation and compatibility

| Area | Source / behavior |
| --- | --- |
| Organizer home / compatibility adapter | [organizer-home.tsx](components/live/organizer-home.tsx), [sample-setup.ts](lib/sample-setup.ts), [lib/demo-setup.ts](lib/demo-setup.ts): saved D1 access, fictional preparation, fresh identity graph, v2 setup-only copying and explicit legacy restore. Original v2 marks/revisions/removed history stay separate; the unused local-setup wrapper is removed. |
| Shared stage desk | [components/live/stage-desk.tsx](components/live/stage-desk.tsx), reused [setup.tsx](components/live/setup.tsx): setup, links/revocation, stage readiness/running order, withdrawals, publication preparation and backups/lifecycle. |
| Phone and review | [judge.tsx](components/live/judge.tsx), [stage-review.tsx](components/live/stage-review.tsx), [results.tsx](components/live/results.tsx): own visited songs, recovery/conflict comparison, acknowledgement/confirmation, read-only cards, votes and exact approvals. |
| Automatic Finals | [finalists.ts](lib/live/finalists.ts): exact approved roster preparation; `server.ts` uses the existing atomic approval/version batch and freezes only exact approved membership; unit/API/browser tests verify counts, identity, pairs, persistence and protection. |
| Pure stage rules | [lib/live/stage.ts](lib/live/stage.ts): heat coverage/snapshot/signature, latest immutable version, equal judge means and cutoff vote calculation. [validation.ts](lib/live/validation.ts): identities, stage setup and fixed finalist/pair validation. |
| Server and persistence | [server.ts](lib/live/server.ts), [db/schema.ts](db/schema.ts), [drizzle/](drizzle/): server access checks, prepared statements, atomic D1 guards, request receipts, immutable heat submissions, votes and versioned review requests. Approval uniqueness includes source fingerprint to retain earlier approvals. |
| Tests | [tests/stage-fixture.ts](tests/stage-fixture.ts), unit `stage.test.ts`/`demo-setup.test.ts`, local D1 `stage-api.test.mts`/`stage-edge-api.test.mts`, browser `stage-browser.spec.ts`/`local-browser.spec.ts`; earlier legacy suites remain. |

New shared events default to `workflow: 'stage-v1'`. Existing shared events lacking that property retain the earlier full-song/block submission workflow, head-only ties and explicit single-role reopen/setup correction. Their [desk.tsx](components/live/desk.tsx) branch and tests remain. An opened event cannot switch workflow through setup. Earlier block tests are compatibility evidence, not evidence for stage rules.

The original `country-dance-judging:v2` AppState remains an unchanged legacy archive on ordinary startup and stage setup saves. `demoSetup` and `removedCompetitions` remain compatible optional fields. Explicit wrapped/plain restore retains original legacy scores and creates a fresh D1 preparation copy with remapped internal IDs, never stage ballots or approvals. There is no sum-to-average conversion.

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

The owner resumed implementation on 2026-10-08 and settled the rules above. Preferred checkout: `C:\Users\Iam\Projects\Country Dance Judging App\app`; Documents is a mirror. Branch: `codex/stage-heat-workflow`, tracking `github/codex/stage-heat-workflow`. Earlier uncommitted work was committed and explicitly pushed as `d9ea167`; the completed stage/setup batch is documented in [batch closeout](LOCAL_TEST_REPORT.md#batch-closeout-and-git-delivery). Fresh 2026-10-09 checks passed 17 unit, 17 local D1/API and all 8 browser scenarios plus lint, TypeScript and build. The owner approved local implementation of the next batch on 2026-10-09; its implemented contract is below. Inspect branch/status and compare affected files before any further sync. Never commit the parent Documents workspace as the app repository.

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

Both surfaces reuse `SetupEditor` in the same section order: Event & judges, Program & stages, round selection, required judges, finalist/pair setup, roster/heat assignment and song/rotation setup. Equivalent names, choices, validation and preparation confirmation controls are used. Competition removal and heat removal are visible. Both current organizer entry points save through the same D1 version guards. Cancellation leaves data intact and an empty program supports re-addition. Legacy archives remain separately preserved.

Local and shared pages use one canonical setup editor. The duplicate legacy overview and its editing controls are removed; this does not migrate or delete legacy scores. The editor retains the original competition cards, numbered bib badges, panel styling and head label beside the judge name. Event details, Judges, Program & stages, Round setup and Event-long private judge links are expandable native sections, collapsed on initial load/reload. Round setup contains separately collapsed Required judges, Finalists & pairings (count available from either stage, actual draw in Finals), Roster & heat assignments and Heats, songs & partner rotations. Summaries show useful counts/context while collapsed, support mouse/touch/keyboard, and opening/collapsing does not save edits. Multiple sections may stay open. Selecting a competition card selects its prelims and opens Round setup; choosing another round retains the current expanded sections. Legacy marks/revisions and v2 backups retain their sum meaning in read-only recovery/history through the same local adapter; legacy Score entry and result export controls are removed.

**Organizer home cleanup (2026-10-09).** The owner replaced the template-to-organizer hop with a working main-page desk. `/` reopens the existing origin-local event binding. With no saved event, it copies valid legacy preparation only, or creates a labeled fictional sample when there is no legacy data. Each private judge page uses the assigned judge name as its main heading and browser title, with event/role context below the name; loading/denied links reveal no assigned identity before authorization. Judge links are separate; the former organizer Score tab is now Run, holding only organizer room controls and progress. Copy organizer link uses `/?event=<private code>`; the role is checked before changing saved access. Existing `/live/<code>` URLs remain compatible with the same desk.

The fictional sample has three distinct named judges (one head), a separate organizer, four Strictly couples, two J&J leads/two follows, one heat per competition, two named songs/rotations and Finals counts of two couples/one pair. It contains no ballots, scores, submissions, votes, head approvals or publication records. Head-approved advancement automatically fills unopened Finals; J&J still requires actual draw pairs. Its attestation is a synthetic example; actual people/separation must be verified for a real event.

Other events holds fresh-sample/blank-event actions and saved event selection. Confirming a new event preserves earlier server data/private links and discards unsaved setup edits explicitly. Each copied preparation has fresh bounded internal IDs, retaining its references and participant identities, so D1 round records cannot collide with the source. Creation/setup response loss reuses the same nonce; successful prior setup is not overwritten during retry. Invalid storage/denied role is reported rather than replaced. These local results establish no hosted readiness or guaranteed offline reload.

Setup follows one column: Event details → Judges (with nested Setup imports) → Program & stages → Round setup. Event-long private judge links are collapsed in Run; Data & recovery is collapsed in Publish. Run competition is the separate Run navigation section, shown directly with room controls; result correction/withdrawal/history controls live together in one collapsed Amendments & withdrawals section in Results. Sections remain collapsed by default, with the existing theme/numbered sidebar/cards/bibs. Copy/Open judge actions remain prominent inside Access; Revoke/Replace are nested under Manage link. Started-competition withdrawal is collapsed within Results; withdrawal controls appear after a stage starts and request history appears there; existing dual approval/privacy/history rules are unchanged.

### Mock competition and test acceptance

Use deterministic synthetic fixtures and independent expected outcomes. Never reset, submit or export the owner’s open event. Full source evidence and pass counts are in [LOCAL_TEST_REPORT.md](LOCAL_TEST_REPORT.md).

The fixture includes 44 Strictly couples across Beginner/Intermediate and Advanced, three heats per Strictly division, 2–3 songs, both J&J individual-role divisions with rotations, three distinct judges including the head and a distinct organizer. Browser rehearsal uses a bounded 18-couple equivalent plus both J&J divisions in four isolated sessions at desktop and 360/390px. Equivalent local/shared setup has a retained v2 history fixture.

Required sequence: setup/add/remove/cancel/save/reload; all prelim heats/song pages; an uncovered entrant and explicit No/blank observations; interrupted save plus online retry/reload/focus preservation; acknowledgement cancellation/reset/final submission; whole-stage read-only cards; genuine mistaken-bib correction with both roles; panel cutoff voting and exact approval; automatic matching approved finalists/actual J&J draw pairs; all finals heats/acknowledgements; finals review/results; exact public preview, independent organizer/owner approvals, released and revised public cards, and internal backup/restore; separate withdrawal and head deadlock/finals tie scenarios.

Commands: `pnpm test`, `pnpm test:live`, `pnpm test:browser`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`. Browser match is `tests/**/*browser.spec.ts`; focused runs use `pnpm exec playwright test tests/local-browser.spec.ts tests/stage-browser.spec.ts` (passing filenames through the pnpm fallback script can insert `--` and run all matches). Synthetic outputs/local D1 files remain ignored. No extra tests of production or real services are implied.

### Required verification and completion evidence

Report passed/failed/unperformed checks separately. Unit tests cover independent mean/counts/coverage/ranking and legacy invariants. Actual local D1/API tests cover role/identity access, notes, revisions, duplicate/stale requests, racing saves/submissions, vote quorum/deadlock, corrected approval invalidation, immutable history, finalist gates, withdrawal context, backups and revoked links. Browser tests verify the actual controls, confirmations, focus, acknowledgement/hiding, persistence, absence of prohibited exports and internal recovery.

Physical phones, real venue Wi-Fi, extended outage/offline reload, hosted quota/provisioning/migration/deployment, real external publication and post-announcement replacement-finalist/redance operations remain unperformed or undecided. A real event-day release needs those applicable checks and separate deployment authorization. Builds and local synthetic sessions cannot establish them.

## Access, withdrawals and owner publication — implemented locally

The owner’s approved temporary specification is folded here. Its complete policy and isolated acceptance sequence remain below; actual verification belongs in LOCAL_TEST_REPORT.md. NEXT_BATCH_SPEC.md has been removed after folding, with history retained in Git.

Local implementation uses server-only synthetic `.dev.vars`: LOCAL_PUBLICATION_ONLY=true, independent LOCAL_OWNER_KEY and LOCAL_RECEIVER_KEY, and a loopback LOCAL_PUBLISHER_URL. These keys are ignored, omitted from client bundles/backups/responses, and never seeded into a public page. The separate results origin serves `/admin`. Its local sign-in checks the existing independent LOCAL_OWNER_KEY against server authority, retains the credential only in an expiring server-memory session and issues an HttpOnly/SameSite=Strict opaque cookie. Same-origin POSTs and an exact CSRF token protect approval/service actions. Keys never appear in HTML, browser storage or public result storage. `/owner` redirects there for old links. Hosted website admin identity integration, provider/domain provisioning and production authentication remain deferred.

Start the retained operational preview with `pnpm dev --hostname 127.0.0.1` (3000). Start `node --experimental-strip-types scripts/fake-publisher.mts` (3100), supplying LOCAL_RECEIVER_KEY via server environment; its ignored JSON store is separate from D1. Optional `scripts/publication-outbox.mts` uses LOCAL_OWNER_KEY and loopback LOCAL_OPERATIONAL_URL to retry durable approved deliveries/statuses every 2.5 seconds without creating approvals. Compiled Worker tests use 3001 with inspector 9230, receiver 3110 and a separate ignored D1/public store. Compiled settings belong in ignored `dist/server/.dev.vars`; point LOCAL_PUBLISHER_URL to 3110 and LOCAL_TEST_RECEIVER_STORE to the matching isolated receiver JSON path. No hosted service is contacted.

Preparation pins source, schema/scoring, disclosure, competition/stage scope, revision/supersedes, timestamp, named judges, explicit mark/blank slots, means/counts, head decisions and current head approvals into an immutable fingerprint. Repeated preparation of unchanged content reuses the record. Role/version/source CAS guards protect organizer approval, owner release and acknowledgement. Publication enablement is guarded atomically; the receiver independently checks current authorized source, complete payload fingerprint, means/counts/ranks and exact ordered revision before atomic replacement. Retried delivery IDs return the same acknowledgement and never create another revision. Old released snapshots remain immutable.

Applied changes invalidate pending releases or mark released sources Under review, queuing status independently of new-result release. A status arriving before its snapshot is retained. Dispatcher retries do not block ordinary judging; last-synchronized times expose delayed propagation. Suspension prevents new releases while permitting status notices; shutdown state does not archive the event. Physically stopping the local public process simulates unavailable hosting independently.

Eligibility is an overlay over frozen originals. A preliminary withdrawal affects that dancer/couple and dependent finals identities; a final withdrawal affects the fixed final pair only, preserving prelim eligibility. Past partners and observations are immutable. Exact J&J plans contain eligible opposite-role partners once per song and cover remaining active dancers over reviewed undanced work; unscheduled/withdrawn entrants cannot receive new marks. Withdrawal changes clear active review acknowledgements and require every judge’s submission even with zero active entrants. Withdrawn public cards retain recorded marks, per-judge means/counts but no official average/place.

The deferred post-Finals membership policy, legacy-only publication, reinstatement/substitutes, hosted authentication/provider/domain setup and real external release remain deliberately unimplemented.

### Experience and access

- Preserve the judging application's current visual template, general layout, theme, numbered sidebar, cards and bib badges. Set-Up sections and nested sections start collapsed; retain keyboard activation, explicit Save setup and draft preservation. Main navigation is **Set-Up → Run → Results → Publish**.
- Only an organizer role accesses the organizer interface, including direct routes and API responses. A judge/head link opens one scoring page containing assigned work, own notes, heat acknowledgement and relevant review/voting/head duties. No organizer navigation or organizer payload is sent to judges. Do not rely on hiding buttons.
- The organizer can open, copy, distribute, revoke and replace individual judge links. An organizer credential cannot enter scores, vote or act as head. Opening a judge link deliberately uses that judge's capability. Preserve the existing unique participant identifiers, separation attestation and distinct-role checks; link possession cannot prove a physical identity. Judges may look at the organizer screen during between-stage discussions.
- Organizer navigation is **Set up → Run → Results → Publish**, per the owner's subsequent clarification. **Run** contains start-stage, next-song/heat, lineup and conclude/open-review controls plus room/submission/coverage progress. It contains no judge mark entry, judge submission, vote or head-approval actions. Completing the stage opens **Results**, which holds read-only submitted scorecards, organizer correction initiation, exact approvals/history and competition/entrant withdrawal review. Head scoring/approval remains on the private judge page. Imports remain in **Set up**; private judge links are in **Run** and operational/legacy recovery is in **Publish** beside publication. Organizer correction/withdrawal/history controls share one collapsed **Amendments & withdrawals** section. Main standings omit observation counts; detailed scorecards and coverage rules retain them.

### Settled judging contracts retained

Marks: Yes=10, A1=4.5, A2=4.3, No=0. Blank means no observation; a note is not coverage. Each assigned judge must observe each active entrant at least once across 2–3 songs in a heat. Every required judge independently acknowledges/submits; no timeout, guessed marks, copied scores or general coverage override. The only new exclusion is a specifically approved withdrawal, described below.

Stages encompass every scheduled division/heat. At whole-stage conclusion, average each judge's recorded song marks first, then average those judge means equally. Expose observation counts and explicit blanks; never pool all observations into one weighted mean. J&J prelim roles rank separately; fixed finals pairs retain identity. Legacy v2 sums/completeness/shared-place ranks and backup version remain unchanged.

Cutoff tie votes require the whole assigned panel including the head, each selecting exactly the remaining places. Highest vote counts advance; the head resolves a remaining vote-boundary deadlock. Head finals placement decisions do not alter numeric marks. Preserve exact source fingerprints, approval version checks, renewal after correction, and matching approved finalists before Finals.

### Corrections and withdrawal

#### Request initiation and approval

Organizer initiates all new genuine recording-error corrections and withdrawal requests after discussing them with the affected judge. Judges no longer create/revise/cancel these requests from their page or API capability. Judges retain their own draft editing and author-only notes; the head retains necessary approval duties on the single judge page. Existing requests/history remain readable according to role and are not deleted because requester rules change.

Each request states affected competition/entrant/heat/submission, recorded and intended values when applicable, reason and exact version. Require separate explicit organizer and head approvals of the same request. Initiating the request is not an implicit approval. Editing request content invalidates both approvals; stale approvals fail. Preserve original records, requester, reason, identities, timestamps and amendments. Notes are not editable by organizer/head on another judge's behalf. A correction cannot fabricate an observation or leave a non-withdrawn entrant uncovered.

Applied changes invalidate affected results, votes, advancement and dependent finals approvals, plus pending publication approvals. Unchanged numeric scores must not be rewritten to resolve ties. Internal reasons and audit records are not automatically public commentary.

#### Scope now explicitly confirmed

| Action | Requirement and effect |
| --- | --- |
| Remove preparation competition/heat/roster entry | Existing preparation confirmation and explicit Save setup; separate from started withdrawal. Preserve history and frozen-work restrictions. |
| Withdraw a started competition | Retain existing reason + exact organizer/head approval, history preservation, active-room repair and dependent approval invalidation. Organizer initiates. |
| Withdraw a started contestant/couple | Implemented scope. Both roles approve the exact request before effect. Retain every recorded mark; label Withdrawn. Exclude the entry from current-stage placement/advancement and future work. Waive only that entry's remaining coverage. Every assigned judge still acknowledges/submits the heat. |
| Strictly or fixed-pair Finals partner withdrawal | Withdraw the fixed scoring couple together; retain identities/marks. No automatic substitute. |
| J&J prelim dancer withdrawal | Withdraw that dancer only. Retain observations already completed for everyone. Organizer proposes, and organizer/head approve, the exact revised plan for undanced pairings; block continuation if a remaining dancer lacks a valid pairing. No copied scores or automatic substitute. |
| Publication suspension/removal, event archive/delete | Distinct lifecycle actions; never treat them as dancer withdrawal or silently delete judging records. Owner controls public hosting. Existing operational archive/recovery is preserved; destructive deletion is outside this new withdrawal feature. |

Design withdrawal as a versioned change to eligibility, not deletion of an entrant or blanket ballot reopening. For an active heat, the reviewed submission version must include current eligibility: applying withdrawal invalidates a previously checked, unsubmitted acknowledgement. Already submitted ballots remain immutable; no new scores are invented. All still-required judges submit even if a heat has no active entrants left. Preserve the original roster/schedule in history and record effective stage/song boundaries. A pairing plan may change only undanced work; past partner identities cannot be rewritten. Pairing/coverage/withdrawal races must commit atomically or reject stale operations.

No automatic reinstatement, replacement finalist, substitute dancer or redance is introduced. A post-Finals correction or withdrawal that makes approved finalist membership inconsistent must invalidate dependent approvals and block publication. The separate redance/replacement policy remains deferred; do not use publication to bypass the block.

### Approved snapshots and public site

#### Authority and publication sequence — confirmed

The current organizer workflow publishes the complete event together: every configured competition must have all scheduled stages complete, current head-approved final results and valid upstream advancement. Review results to publish prepares every immutable competition snapshot in one guarded transaction; an unfinished competition prevents partial preparation. Send results for approval pins the exact latest snapshot ID/fingerprint for every competition in one guarded transaction. Missing, duplicate, foreign, stale or changed previews fail without partial approval. Existing per-competition protocol commands remain for compatibility/testing; the user-facing workflow has one complete-event action. Do not publish drafts or provisional calculations.

The organizer reviews a faithful public preview and explicitly approves its exact version. **The authenticated results-website admin separately approves and publishes the whole event with one button above the results**, including every correction revision. In this local preview, Wesley retains that authority through the existing independent credential. Organizer approval submits a publication request; it never publishes by itself. No administrative credentials or publishing keys appear in organizer/judge pages, bundles, localStorage, URLs, backups or responses.

The website admin sees pending events, a competition/version/status summary and final placements immediately below one Approve & publish results button. Prelims/judge scorecards, published history and website management controls are collapsed. The backend revalidates every current snapshot, organizer approval, complete event membership, event version and publication enablement before atomically queuing the changed records as one durable release set. The local receiver authenticates and validates every set member, then atomically persists every changed current pointer; a bad member exposes none of that set. Delivery retries reuse the same immutable payload and receipt. An unchanged already-published competition may join a corrected complete-event review without receiving a duplicate revision. A correction to any competition reviewed in an event request (including an unchanged already-published member) invalidates the undelivered set together so another member cannot be stranded in Sending pending. Public reads remain independent of operational drafts; website admin credentials never grant organizer/judge powers.

Recommended immutable snapshot fields: snapshot/schema/scoring-rule versions; public event and competition IDs; event display metadata; scope; source fingerprint; applicable stages/rounds/heats/songs and stable entrant/pair IDs; names/bibs/roles; judge display names and head designation; recorded marks and blank slots; per-judge means and observation counts; overall means/counts; numeric tied ranks and separate advancement/head decisions; withdrawn status; exact head result approval reference; organizer snapshot approval; owner release record; revision, timestamps and supersedes pointer. Keep internal participant identifiers, access codes, private notes, raw internal reasons and unneeded audit details outside the allowlisted public payload.

The public system renders this snapshot, not a live query of operational drafts. Derive publication data from authoritative server results and independently validate it; don't accept a client-supplied score table as truth. Pin approval to the entire snapshot, including displayed names, disclosure policy, eligibility and scoring version. Any material change requires a new snapshot and approvals.

#### Public pages and explanations — confirmed

| Page | Required content |
| --- | --- |
| Winners | Published final placements by event/competition/division; tied/shared places and Withdrawn accurately represented; revision status visible. Do not invent unique winners for shared places. |
| Leaderboard | Published competitions with event/division/stage context, standings and applicable approval/revision status. Each contestant/couple name links to its scorecard. Show only released snapshots. |
| Contestant/couple scorecard | Applicable prelim/final stages, heats/songs, stable person/pair context, every recorded mark and permitted blank, each named judge's mean/count and resulting overall mean/place. Follow individual J&J identity into the fixed final pair without relabeling earlier observations. |
| Judge scorecards | Read-only detailed submitted marks organized by named judge, competition/stage/heat/song. Show head designation, counts, blanks and the calculation context. Reachable from contestant cards and judge names; never expose active draft forms or private notes. |

**Judge names are public. Private notes are never public.** No new public comment/notes feature is in scope. Song/setup notes and internal correction/withdrawal reasons are excluded unless separately specified later. A sanitized revision explanation can say “Approved score correction” or “Approved withdrawal”; don't copy internal free text.

Explain Yes/A1/A2/No values, blank versus zero, equal judge weighting and observation counts next to expandable scoring details. Example: judge means 10, 5, 5 with counts 1, 2, 2 produce 20/3, not a pooled observation average. Keep stored precision for ranking; rounding is display-only. Explain cutoff votes/head decisions separately from numeric marks. Legacy archival results must identify their actual legacy sum rule and must not be relabeled as stage averages. New publication of legacy-only events is deferred; preservation/recovery remains in scope.

#### Revised results — confirmed

After a dual-approved correction/withdrawal changes a published source, keep the prior released snapshot visible with **Under review** status. A pending unapproved request alone does not change official public results. Renew affected head results approval, create/review a new snapshot, obtain organizer approval and then owner approval/release. Never silently replace the values under an unchanged revision number.

Show revision number, original publication time, latest revision time and an approved generic change summary on winners, leaderboard and detailed cards. A stable public URL resolves to the latest released revision; retained old revision views must be prominently marked Superseded and link to the current revision. Keep immutable prior snapshots internally regardless of public history presentation. Publish the new revision atomically so placements and scorecards cannot disagree; retries must not create duplicates. Reject stale approvals, changed source fingerprints, duplicate/out-of-order deliveries and cross-event references.

Implemented local protocol: persist a durable publication request/status outbox in the operational service, deliver to the separate publisher with server-held credentials, validate the authorized source/version, then atomically switch its public current-revision pointer. This local implementation does not authorize provisioning a hosted service. Correction status updates are separate from publishing new score data; disabling future releases should still permit Under review status notices while the public service is reachable. An outage may delay propagation; show last synchronized/publication time and retry without blocking judging.

#### No result exports; recovery remains

Remove public and organizer-facing Excel, CSV, PDF, result/scorecard file downloads, result print buttons and direct Google Sheets publication controls. Do not leave alternate direct export routes available to those roles. Publication preparation uses an on-screen preview, not a downloadable scorecard. Existing Apps Script compatibility source may remain inert for history; its publishing key UI cannot remain exposed as a competing publication path.

Preserve JSON operational backup/restore, v2 compatibility, audit retention and internal recovery. Keep recovery visibly distinct in a collapsed Set-Up Data & recovery section; it is not a result-export menu or a disguised scorecard download. Default backups exclude credentials and private notes; retain existing explicit note-inclusive recovery semantics and visibility warning, separate from ordinary author-only API/review access. Any future tightening of that privileged backup behavior needs an explicit decision rather than silent data loss.

Visible public results can still be copied, printed through the browser or captured in screenshots. The no-export requirement removes product features; it cannot prevent copying of displayed information. Do not add anti-copy scripts or claim DRM.

### Service ownership and continuity — confirmed

The owner provides the service in exchange for free event entries. Owner retains hosting, domain, deployment, administration and publication control. Organizers operate competitions and approve public snapshots; judges score/perform their assigned review duties. Free-entry arrangements give no score, vote or head override. Owner publication approval chooses whether/when to release an approved snapshot, not permission to edit judging outcomes.

The owner will maintain the operational judging tool. Organizers can continue conducting competitions when the publishing feature is discontinued. **No organizer self-hosting package, ownership transfer or support/handoff solution is promised or required.** Keep operational records and recovery capabilities; don't remove them to enforce publishing access.

Separate three states:

1. Publishing enabled: the website admin may approve complete event requests; every immutable competition snapshot retains its own revision and exact approval history.
2. Future publication suspended: scoring/setup/review/corrections/advancement/finals/results/recovery continue. Existing published results remain read-only while public hosting is available. Explain suspension clearly; do not imply a queued request was released. Pending requests stay auditable and need current approvals if publication resumes.
3. Public hosting shut down: 30 days' notice where practicable, no promise of indefinite public availability, operational event records/internal recovery retained. This does not shut down the operational judging app. Unexpected outages may prevent advance notice; no uptime guarantee was agreed.

Recommended technical boundary: separate origins/deployment identities, public snapshot storage and operational D1; separate owner-only publisher administration; minimum-scope server credentials controlled by owner; no public/organizer access to control-plane secrets; public read endpoints cannot reach operational drafts/notes. Operational paths never synchronously depend on the publisher being online or licensed. Owner publisher permissions never substitute for event organizer/head permissions. Switching off publication must not revoke judging links or erase data.

Suggested transparent event arrangement: “Event judging remains available through the maintained tool. Publication is an optional owner-operated service provided under our agreed event-entry arrangement. The organizer approves the exact results and the service owner approves each release. If future publication stops, competitions can still run; existing public results remain read-only while hosted. A public-site shutdown has 30 days' notice where practicable. Visible results may be copied or captured.” Exact event-entry quantity, event eligibility and support commitments can be agreed per event; no contract, automatic billing or purchase is created by this specification.

### Branding direction

Use the confirmed Interskate/Lewisville community, not the mistakenly supplied UK Facebook business. The owner confirms permission to reuse its branding/logo/photos. The research below records inspected sources, usable asset scope and a text-only public-site proposal. Preserve the judging app's appearance. Exact licensed asset files and final public color/type choices are implementation inputs, not approval to download arbitrary reposts or publish a website now.

The separate public pages are redesigned locally on the approved snapshot feed, with original community photos, latest winner cards, event-filtered leaderboards, scorecards and revision notices. No new hosted GPT Site is registered or deployed. Keep scoring/notes/private links outside the public site. Existing permission to use original community assets is settled.

2026-10-09 implementation: verified the correct Instagram profile in a separate local browser without signing in and obtained its original 150×150 boot/longhorn profile image via the browser asset bundle. Stored it as public/kickinit-community-logo.jpg; displayed at 100×100. No platform ring, third-party repost, photograph, video or paid font was selected. The separate local public pages use cream/brown/dark-red colors and system/Georgia fonts; these are design interpretations, not official brand tokens. The judging application retains its theme/layout.

#### Verified sources

- [Instagram — kickinitcountrydance](https://www.instagram.com/kickinitcountrydance/): inspected live in the browser without signing in. The profile identifies the Interskate dance community and welcomes different experience levels. Its black-and-white boot/longhorn emblem has horizontal stripes and curved lettering. Visible posts emphasize group photographs and social dancing. The colored profile ring belongs to Instagram's interface, not a verified brand palette.
- [Facebook — Kickin' It Country Dance group](https://www.facebook.com/groups/984536000183510/): the owner supplied this corrected URL. Inspected live without joining or signing in. The public group identifies Lewisville, Texas. Its cover matches the emblem and uses dark wood, warm lights, cream display lettering, red accents and stars around Interskate information. These are observed cues, not a formal brand guide.

Web text retrieval failed for Instagram and returned a blocked page for the group. The observations above come from visible browser pages after dismissing optional login prompts. No private/member-only content was accessed. The originally supplied `facebook.com/kickinitcountryclub/` represents a UK party business with different artwork; exclude it from this project.

#### Asset permission

The owner explicitly confirmed permission to use the intended community's branding/logo/photos on 2026-10-09. Do not reask that permission. Select original assets covered by it; social visibility alone does not make every repost a usable project asset.

| Asset | Proposed use |
| --- | --- |
| Correct community boot/longhorn logo | Use the original source at a suitable display size; the implemented 150×150 profile asset is limited to small-screen display; preserve proportions. Do not substitute the UK business's logo. |
| Authorized community/event photographs | Original public-grid assets from [group photo](https://www.instagram.com/kickinitcountrydance/p/DeRrE7RDO-n/) (640×449) and [friends photo](https://www.instagram.com/kickinitcountrydance/p/Dd_pnnJjJ5W/) (640×480), copied unchanged to `public-site/assets/community-night.jpg` / `community-friends.jpg` using browser pageAssets. Visible originals only, no login/bypass/private media. Credits link to the original posts; photos provide community context and are not assigned to fictional winners. |
| Community cover graphic | Reference for visual direction. Avoid copying its venue prices/schedules into competition results. |
| Third-party reposts, music, platform interface | Not selected. No copying of Instagram/Facebook interface or downloading videos/music. |
| Fonts/textures | Inspect licenses when selecting exact assets. No paid asset purchase authorized; do not claim a typeface identified from a screenshot. |

#### Implemented local public-site direction

Use the black/cream emblem with paper cream, forest ink and restrained copper accents. These are a design interpretation, not official color values. Keep score tables on plain light surfaces with high-contrast dark text. Reserve texture and Western display lettering for the masthead and small headings; use a readable normal face for names, marks and explanations.

Public navigation: Winners, Leaderboard, About scoring. This is separate from the judging application's unchanged Set-Up → Run → Results → Publish navigation.

- Winners: photo-led community landing page, fictional-preview banner, latest eight released competition cards with top-three placements and visible revision/Under review status; All results opens the full event-filtered leaderboard. Equal placements receive equal treatment.
- Leaderboard: event filter submitted through a native GET form, readable event/division/stage rows, clickable contestant names, Withdrawn/shared-place labels and published revision. Main columns are Place, Entrant and Average; observations remain in detailed scorecards. Maintain name/rank context on phones.
- Contestant cards: bib/person/pair context, applicable stages and expandable heat/song details, named judge means/counts and explicit blanks. Blank reads Not observed; No remains zero.
- Judge cards: named judge and head designation, stage/heat/song marks and counts, matching revision, no private notes.
- About scoring/service: actual averaging/tiebreak explanations, publication/revision meaning, owner-operated service terms and acknowledgment that visible results can be copied, printed or captured. Link to the correct community pages.

The owner approved implementation in this chat. Domain registration, hosted deployment and real publication remain separately unauthorized.

### Acceptance criteria and required verification

This is the owner-approved acceptance matrix. Current test evidence and any unperformed checks are in LOCAL_TEST_REPORT.md; earlier closeout checks are historical evidence only.

| Area | Unit / local D1/API evidence | Actual browser / persistence / permissions evidence |
| --- | --- | --- |
| Organizer/judge access | Role/action matrix; no organizer data to judge/public; cross-event/token substitution, revocation, replay and stale versions denied; distinct identity rules preserved | Direct routes, reload/back navigation, copied/replaced links, separate contexts and phone widths; organizer link distribution works; judge sees one page, relevant head duties only |
| Run / Results / setup | No organizer judge-score writes or legacy bypass; room controls in Run; review/withdrawal in Results; import freeze validation | Actual Run controls, no judge mark/submission/vote/head approval controls; automatic stage-completion transition to Results; imports in Set up; judge links in Run; recovery in Publish; combined collapsed Results management; simplified standings and visible publication blockers; collapsed setup and keyboard/Save/cancel/reload |
| Submission/scoring | Independent expected means/counts, No/blanks, stage gates, legacy sums, exact acknowledgement version and racing save rejection | Review/check/confirm/cancel/edit-reset, pending retry, incomplete active coverage, all-judge gate, immutable submitted entries, full stage boundary |
| Corrections | Organizer-only initiation/revision/cancel; dual exact-version approval, no implicit approval, prior requests retained, vote/finals invalidation | Judge has no request controls; head approves exact changes; stale browser cannot approve new version; note privacy in DOM/network and reload |
| Entrant/couple withdrawal | Eligibility + pairing plan version guards; only approved withdrawn coverage waived; no record deletion; original submissions immutable; all-judge quorum retained; zero-active heat handled | Wrong-role request denied, cancel/revise/approve actual controls, J&J blocked invalid pairings, fixed-pair withdrawal, persisted Withdrawn labels, active acknowledgement reset, no auto replacement |
| Automatic Finals | Independent top-X identity/order and eligible-pair/frozen-round checks; local API head-only approval, persistence/backups, count invalidation/refill and older empty-roster preparation | Actual Prelims count input/save, read-only automatic roster and Start Finals; full Strictly/J&J mock verifies resolved votes/actual draw before Finals |
| Public snapshot | Allowlist rejects credentials/notes/internal IDs/reasons; source/scope/disclosure fingerprint; named judges; true blank/count/legacy semantics; only current approvals releasable | Organizer previews exact snapshot and approves; owner separately approves/releases to a local fake publisher; unnamed public context sees only released pages |
| Revision delivery | Atomic current pointer, retry dedupe, stale/out-of-order/source-race rejection, durable outbox recovery; immutable prior revisions | Approved correction causes Under review on prior snapshot; independent renewed approvals; actual revised winners/name-link/scorecard navigation; reload shows one consistent revision |
| Suspension/ownership | Publication-disabled paths cannot write releases; scoring has no publisher dependency; status-only invalidation retained; owner/event role separation | Kill fake publisher, finish scoring/results/corrections/recovery; suspend future publication, existing site remains read-only; no secrets in bundles/responses/storage/backups |
| No exports / recovery | No public/organizer result download endpoints; preserve wrapped/plain v2 and shared inert-history restore | No CSV/Excel/PDF/scorecard/template-download/print-result controls; inline import examples; actual internal backup/restore works; visible copy/print limitation disclosed |
| Branding and accessibility | Escape all public names/text; no stored markup injection or accidental private URL leakage | Public winners/leaderboard/cards at desktop and 360/390px; readable tables/headings/focus/contrast; correct community assets; judging template unchanged |

Required commands retain `pnpm test`, `pnpm test:live`, `pnpm test:browser`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` and whitespace checks. Use a separate local D1 store for compiled Worker tests; verify append-only migration/restart recovery there. Add a local publication receiver/read-site fixture with no real external send. Exercise actual buttons and independent expected outcomes, not only mocks of implementation functions. Do not reset the owner's open event, original localStorage or D1. Report all failures/unperformed checks; local success never proves physical venue or hosted operation.

### Complete isolated mock competition acceptance sequence

1. Create deterministic synthetic organizer, distinct head and two other judges plus separate owner admin and anonymous public sessions. Retain legacy v2 fixture/revision history separately. Use multiple Strictly divisions/heats, both J&J role divisions, rotations and fixed finals pairs; 2–3 songs per heat. Use independent numeric/vote expectations from the existing fixture.
2. Through actual Set-Up controls import entrants/judges, edit/save/cancel/reload, remove/re-add preparation competition/heat, test empty program and collapsed sections. Open/copy/revoke/replace each link. Verify direct-route and API denial by role. Never navigate synthetic tests through owner browser state.
3. Start prelims from Run; verify the organizer has room controls but no judge score-entry controls and no mid-stage official averages appear. Judge enters marks, No, blanks and own notes over all songs. Interrupt a save, recover online/reload, test conflicting cell version and acknowledgement reset. Leave an active entrant uncovered and prove submission/room advancement block.
4. On a separate eligible entrant exercise organizer withdrawal draft, cancellation, edited request/stale approval and exact dual approval. Preserve observed marks, Withdrawn label and only its coverage exemption. Withdraw a Strictly couple and one J&J prelim dancer in separate cases. For the latter reject an invalid remaining pairing plan, approve an exact valid plan for undanced work, and verify prior observations are unchanged. All judges still acknowledge/submit, including the all-withdrawn-heat edge case.
5. Every judge reviews bibs/marks, checks acknowledgement, cancels a confirmation once, edits to clear it and finally confirms the named heat. Block missing judges; complete all remaining heats/divisions. End the whole stage and check counts/blanks/equal means against independent expectations.
6. Discuss a mistaken bib; organizer alone initiates correction. Reject direct judge request and organizer/head single approval, revise request, reject stale approval, apply dual-approved exact version. Original submission and private note isolation survive reload. Reapprove stage after invalidation.
7. Exercise full-panel advancement cutoff votes and a head-only vote deadlock decision with exact remaining count; organizer/ordinary judge cannot perform head action. Advance exactly approved identities. In a separate case correct already-approved prelims and verify stale votes/finals readiness invalidate.
8. Set fixed final pairs and run every final heat/song/acknowledgement. Resolve final placement ties through head controls without changing averages. Approve final results. Keep another competition unfinished and demonstrate the complete-event publication action stays blocked without preparing a partial set; finish and approve that competition before continuing.
9. Organizer Publish preview includes applicable stages, named judge detail, counts/explicit blanks and sanitized revision context. Inspect all public payloads for private notes, participant IDs, codes and reasons. Organizer sends the exact complete-event preview using its single top action; anonymous/judge/organizer release attempts fail. The separate local results website admin uses one top Approve & publish results action for the whole event. Follow winners → leaderboard → contestant name → detailed judge/stage/heat/song cards, checking independent totals and persisted version.
10. Make a genuine post-publication correction that retains finalist membership. Dual approval marks prior public revision Under review without replacing it. Renew head results approval, organizer snapshot approval, owner release; verify new numbered revision/times and Superseded previous version. Duplicate/out-of-order sends and stale owner approval fail safely. Also verify membership-changing post-Finals changes block publication pending the deferred policy.
11. Simulate publication/network failure and restart outbox processing: no duplicate release or mixed revision. Disable future publication and finish another competition through correction/results/recovery. Prior public snapshots remain readable; status notices work when reachable. Simulate public-hosting shutdown without changing operational ability.
12. Assert absence of all prohibited export routes/buttons and actual internal v2/shared restore compatibility, retained withdrawal/correction history and inert historical approvals. Reload all sessions, recheck permissions, compare untouched owner data and preserved visual layout. Keep synthetic artifacts ignored and record exact pass counts and limits.


## Maintenance and handoff

Keep this document as the concise map of stable behavior. Update relevant sections with the code change, including the review date, affected contract, test evidence and external configuration status. Do not append raw logs, secrets, long transcripts, or every dependency to it. Update AGENTS.md only when working rules or navigation to this reference change.

Keep only AGENTS.md, PROJECT_SPEC.md and LOCAL_TEST_REPORT.md as working references. Record incomplete work/next steps in the test report rather than new handoff files. Proposed work must stay separate from locally verified behavior.

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

2026-10-09 decision: the owner approved all of NEXT_BATCH_SPEC.md for local implementation, including complete mock, branding, organizer-only initiation, dual entrant/couple withdrawal and separate owner publication. No settled requirements were reopened. No deployment, provisioning, real release or purchase was authorized.

Final 2026-10-09 verification: 22 unit, 25 development API, 25 final compiled Worker API and 11 distinct browser scenarios passed; focused final owner/access, publication, shutdown, restart, secret-scan and query/integrity checks are recorded in LOCAL_TEST_REPORT.md. The original local batch and later follow-ups are included in pushed checkpoint `b0b3368`; previews are retained.
