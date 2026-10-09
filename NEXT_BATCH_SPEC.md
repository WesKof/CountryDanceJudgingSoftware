# Next batch: private judging access and owner-controlled public results

Version 1.1 — 2026-10-09. **Specification only; not implemented.** The completed stage/setup batch is committed and pushed as `f589b7c6f5a0cde60c29b689019bed2137f19d4d` on `github/codex/stage-heat-workflow`. See [closeout](LOCAL_TEST_REPORT.md#batch-closeout-and-git-delivery), [timeline](PROJECT_SPEC.md#project-timeline), [existing implementation](PROJECT_SPEC.md) and [future chat prompt](NEXT_BATCH_SPEC.md#fresh-implementation-chat-prompt).

The owner answered the material policy questions below on 2026-10-09. These are settled requirements. Implementation still waits for the owner to finish specification review and authorize a fresh GPT-6.1 Sol High chat. No code, schema, dependency, website or hosted service is changed by this document. Deployment, public publication and purchases require separate authorization even after local implementation is authorized.

## Document lifecycle

This is the temporary next-batch specification. After implementation, fold actual behavior and settled decisions into PROJECT_SPEC.md, verification into LOCAL_TEST_REPORT.md, then remove this temporary file. Git retains prior specifications. Do not create separate timeline, closeout, branding or handoff files.

## Confirmed experience and access

- Preserve the judging application's current visual template, general layout, theme, numbered sidebar, cards and bib badges. Set-Up sections and nested sections start collapsed; retain keyboard activation, explicit Save setup and draft preservation. Main navigation is **Set-Up → Score → Results → Publish**.
- Only an organizer role accesses the organizer interface, including direct routes and API responses. A judge/head link opens one scoring page containing assigned work, own notes, heat acknowledgement and relevant review/voting/head duties. No organizer navigation or organizer payload is sent to judges. Do not rely on hiding buttons.
- The organizer can open, copy, distribute, revoke and replace individual judge links. An organizer credential cannot enter scores, vote or act as head. Opening a judge link deliberately uses that judge's capability. Preserve the existing unique participant identifiers, separation attestation and distinct-role checks; link possession cannot prove a physical identity. Judges may look at the organizer screen during between-stage discussions.
- Organizer **Score is entirely view-only**. Recommended placement: room controls (start stage, next song, lineup, next heat, conclude stage) move to a Run competition section within Set-Up. Score shows room/submission/coverage progress; stage marks and comparisons appear only at whole-stage conclusion. Results holds read-only scorecards and organizer correction initiation/review. Publish holds publication preparation/approval/status. These placements reuse existing panels and do not introduce another main tab.
- Judges edit drafts until their acknowledged heat submission: review named heat/bibs/marks, check acknowledgement, then confirm the named heat. Any edit clears acknowledgement; stale version, unsaved pending changes or uncovered active entrants prevent submission. Server guards, immutable originals and author-only notes remain mandatory.
- Move contestant/judge and other setup imports into Set-Up. Validate imports before explicit save, show affected scope, protect started assignments, retain existing cancellation/empty-program behavior. There are no organizer-facing CSV template downloads in the proposed flow; show column examples inline. Importing CSV is distinct from exporting it.
- Local rehearsal and shared event routes use the same role checks, stage engine and interface. The old local v2 ballot remains recoverable without conversion to stage averages, but cannot remain an unguarded organizer score-entry bypass. Plan a clearly labeled organizer-only legacy recovery/history surface; keep its stored marks, revisions and backups. Do not silently migrate existing local data to D1 or create server events on ordinary template edits.

## Settled judging contracts retained

Marks: Yes=10, A1=4.5, A2=4.3, No=0. Blank means no observation; a note is not coverage. Each assigned judge must observe each active entrant at least once across 2–3 songs in a heat. Every required judge independently acknowledges/submits; no timeout, guessed marks, copied scores or general coverage override. The only new exclusion is a specifically approved withdrawal, described below.

Stages encompass every scheduled division/heat. At whole-stage conclusion, average each judge's recorded song marks first, then average those judge means equally. Expose observation counts and explicit blanks; never pool all observations into one weighted mean. J&J prelim roles rank separately; fixed finals pairs retain identity. Legacy v2 sums/completeness/shared-place ranks and backup version remain unchanged.

Cutoff tie votes require the whole assigned panel including the head, each selecting exactly the remaining places. Highest vote counts advance; the head resolves a remaining vote-boundary deadlock. Head finals placement decisions do not alter numeric marks. Preserve exact source fingerprints, approval version checks, renewal after correction, and matching approved finalists before Finals.

## Corrections and withdrawal

### Request initiation and approval

Organizer initiates all new genuine recording-error corrections and withdrawal requests after discussing them with the affected judge. Judges no longer create/revise/cancel these requests from their page or API capability. Judges retain their own draft editing and author-only notes; the head retains necessary approval duties on the single judge page. Existing requests/history remain readable according to role and are not deleted because requester rules change.

Each request states affected competition/entrant/heat/submission, recorded and intended values when applicable, reason and exact version. Require separate explicit organizer and head approvals of the same request. Initiating the request is not an implicit approval. Editing request content invalidates both approvals; stale approvals fail. Preserve original records, requester, reason, identities, timestamps and amendments. Notes are not editable by organizer/head on another judge's behalf. A correction cannot fabricate an observation or leave a non-withdrawn entrant uncovered.

Applied changes invalidate affected results, votes, advancement and dependent finals approvals, plus pending publication approvals. Unchanged numeric scores must not be rewritten to resolve ties. Internal reasons and audit records are not automatically public commentary.

### Scope now explicitly confirmed

| Action | Requirement and effect |
| --- | --- |
| Remove preparation competition/heat/roster entry | Existing preparation confirmation and explicit Save setup; separate from started withdrawal. Preserve history and frozen-work restrictions. |
| Withdraw a started competition | Retain existing reason + exact organizer/head approval, history preservation, active-room repair and dependent approval invalidation. Organizer initiates. |
| Withdraw a started contestant/couple | New scope. Both roles approve the exact request before effect. Retain every recorded mark; label Withdrawn. Exclude the entry from current-stage placement/advancement and future work. Waive only that entry's remaining coverage. Every assigned judge still acknowledges/submits the heat. |
| Strictly or fixed-pair Finals partner withdrawal | Withdraw the fixed scoring couple together; retain identities/marks. No automatic substitute. |
| J&J prelim dancer withdrawal | Withdraw that dancer only. Retain observations already completed for everyone. Organizer proposes, and organizer/head approve, the exact revised plan for undanced pairings; block continuation if a remaining dancer lacks a valid pairing. No copied scores or automatic substitute. |
| Publication suspension/removal, event archive/delete | Distinct lifecycle actions; never treat them as dancer withdrawal or silently delete judging records. Owner controls public hosting. Existing operational archive/recovery is preserved; destructive deletion is outside this new withdrawal feature. |

Design withdrawal as a versioned change to eligibility, not deletion of an entrant or blanket ballot reopening. For an active heat, the reviewed submission version must include current eligibility: applying withdrawal invalidates a previously checked, unsubmitted acknowledgement. Already submitted ballots remain immutable; no new scores are invented. All still-required judges submit even if a heat has no active entrants left. Preserve the original roster/schedule in history and record effective stage/song boundaries. A pairing plan may change only undanced work; past partner identities cannot be rewritten. Pairing/coverage/withdrawal races must commit atomically or reject stale operations.

No automatic reinstatement, replacement finalist, substitute dancer or redance is introduced. A post-Finals correction or withdrawal that makes approved finalist membership inconsistent must invalidate dependent approvals and block publication. The separate redance/replacement policy remains deferred; do not use publication to bypass the block.

## Approved snapshots and public site

### Authority and publication sequence — confirmed

Publish completed competitions independently, including all their applicable stages. A competition must have current head-approved final results and valid upstream advancement before an organizer can approve an exact public snapshot. Other unfinished competitions remain private. Do not publish drafts or provisional live calculations.

The organizer reviews a faithful public preview and explicitly approves its exact version. **Wesley, as service owner, separately approves and publishes every snapshot**, including every correction revision. Organizer approval submits a publication request; it never publishes by itself. No administrative credentials or publishing keys appear in organizer/judge pages, bundles, localStorage, URLs, backups or responses.

Recommended immutable snapshot fields: snapshot/schema/scoring-rule versions; public event and competition IDs; event display metadata; scope; source fingerprint; applicable stages/rounds/heats/songs and stable entrant/pair IDs; names/bibs/roles; judge display names and head designation; recorded marks and blank slots; per-judge means and observation counts; overall means/counts; numeric tied ranks and separate advancement/head decisions; withdrawn status; exact head result approval reference; organizer snapshot approval; owner release record; revision, timestamps and supersedes pointer. Keep internal participant identifiers, access codes, private notes, raw internal reasons and unneeded audit details outside the allowlisted public payload.

The public system renders this snapshot, not a live query of operational drafts. Derive publication data from authoritative server results and independently validate it; don't accept a client-supplied score table as truth. Pin approval to the entire snapshot, including displayed names, disclosure policy, eligibility and scoring version. Any material change requires a new snapshot and approvals.

### Public pages and explanations — confirmed

| Page | Required content |
| --- | --- |
| Winners | Published final placements by event/competition/division; tied/shared places and Withdrawn accurately represented; revision status visible. Do not invent unique winners for shared places. |
| Leaderboard | Published competitions with event/division/stage context, standings and applicable approval/revision status. Each contestant/couple name links to its scorecard. Show only released snapshots. |
| Contestant/couple scorecard | Applicable prelim/final stages, heats/songs, stable person/pair context, every recorded mark and permitted blank, each named judge's mean/count and resulting overall mean/place. Follow individual J&J identity into the fixed final pair without relabeling earlier observations. |
| Judge scorecards | Read-only detailed submitted marks organized by named judge, competition/stage/heat/song. Show head designation, counts, blanks and the calculation context. Reachable from contestant cards and judge names; never expose active draft forms or private notes. |

**Judge names are public. Private notes are never public.** No new public comment/notes feature is in scope. Song/setup notes and internal correction/withdrawal reasons are excluded unless separately specified later. A sanitized revision explanation can say “Approved score correction” or “Approved withdrawal”; don't copy internal free text.

Explain Yes/A1/A2/No values, blank versus zero, equal judge weighting and observation counts next to expandable scoring details. Example: judge means 10, 5, 5 with counts 1, 2, 2 produce 20/3, not a pooled observation average. Keep stored precision for ranking; rounding is display-only. Explain cutoff votes/head decisions separately from numeric marks. Legacy archival results must identify their actual legacy sum rule and must not be relabeled as stage averages. New publication of legacy-only events is deferred; preservation/recovery remains in scope.

### Revised results — confirmed

After a dual-approved correction/withdrawal changes a published source, keep the prior released snapshot visible with **Under review** status. A pending unapproved request alone does not change official public results. Renew affected head results approval, create/review a new snapshot, obtain organizer approval and then owner approval/release. Never silently replace the values under an unchanged revision number.

Show revision number, original publication time, latest revision time and an approved generic change summary on winners, leaderboard and detailed cards. A stable public URL resolves to the latest released revision; retained old revision views must be prominently marked Superseded and link to the current revision. Keep immutable prior snapshots internally regardless of public history presentation. Publish the new revision atomically so placements and scorecards cannot disagree; retries must not create duplicates. Reject stale approvals, changed source fingerprints, duplicate/out-of-order deliveries and cross-event references.

Implementation recommendation: persist a durable publication request/status outbox in the operational service, deliver to the separate publisher with server-held credentials, validate the authorized source/version, then atomically switch its public current-revision pointer. This is a technical proposal, not permission to provision a service. Correction status updates are separate from publishing new score data; disabling future releases should still permit Under review status notices while the public service is reachable. An outage may delay propagation; show last synchronized/publication time and retry without blocking judging.

### No result exports; recovery remains

Remove public and organizer-facing Excel, CSV, PDF, result/scorecard file downloads, result print buttons and direct Google Sheets publication controls. Do not leave alternate direct export routes available to those roles. Publication preparation uses an on-screen preview, not a downloadable scorecard. Existing Apps Script compatibility source may remain inert for history; its publishing key UI cannot remain exposed as a competing publication path.

Preserve JSON operational backup/restore, v2 compatibility, audit retention and internal recovery. Keep recovery visibly distinct in a collapsed Set-Up Data & recovery section; it is not a result-export menu or a disguised scorecard download. Default backups exclude credentials and private notes; retain existing explicit note-inclusive recovery semantics and visibility warning, separate from ordinary author-only API/review access. Any future tightening of that privileged backup behavior needs an explicit decision rather than silent data loss.

Visible public results can still be copied, printed through the browser or captured in screenshots. The no-export requirement removes product features; it cannot prevent copying of displayed information. Do not add anti-copy scripts or claim DRM.

## Service ownership and continuity — confirmed

The owner provides the service in exchange for free event entries. Owner retains hosting, domain, deployment, administration and publication control. Organizers operate competitions and approve public snapshots; judges score/perform their assigned review duties. Free-entry arrangements give no score, vote or head override. Owner publication approval chooses whether/when to release an approved snapshot, not permission to edit judging outcomes.

The owner will maintain the operational judging tool. Organizers can continue conducting competitions when the publishing feature is discontinued. **No organizer self-hosting package, ownership transfer or support/handoff solution is promised or required.** Keep operational records and recovery capabilities; don't remove them to enforce publishing access.

Separate three states:

1. Publishing enabled: owner may release individually approved snapshots.
2. Future publication suspended: scoring/setup/review/corrections/advancement/finals/results/recovery continue. Existing published results remain read-only while public hosting is available. Explain suspension clearly; do not imply a queued request was released. Pending requests stay auditable and need current approvals if publication resumes.
3. Public hosting shut down: 30 days' notice where practicable, no promise of indefinite public availability, operational event records/internal recovery retained. This does not shut down the operational judging app. Unexpected outages may prevent advance notice; no uptime guarantee was agreed.

Recommended technical boundary: separate origins/deployment identities, public snapshot storage and operational D1; separate owner-only publisher administration; minimum-scope server credentials controlled by owner; no public/organizer access to control-plane secrets; public read endpoints cannot reach operational drafts/notes. Operational paths never synchronously depend on the publisher being online or licensed. Owner publisher permissions never substitute for event organizer/head permissions. Switching off publication must not revoke judging links or erase data.

Suggested transparent event arrangement: “Event judging remains available through the maintained tool. Publication is an optional owner-operated service provided under our agreed event-entry arrangement. The organizer approves the exact results and the service owner approves each release. If future publication stops, competitions can still run; existing public results remain read-only while hosted. A public-site shutdown has 30 days' notice where practicable. Visible results may be copied or captured.” Exact event-entry quantity, event eligibility and support commitments can be agreed per event; no contract, automatic billing or purchase is created by this specification.

## Branding direction

Use the confirmed Interskate/Lewisville community, not the mistakenly supplied UK Facebook business. The owner confirms permission to reuse its branding/logo/photos. The research below records inspected sources, usable asset scope and a text-only public-site proposal. Preserve the judging app's appearance. Exact licensed asset files and final public color/type choices are implementation inputs, not approval to download arbitrary reposts or publish a website now.

2026-10-09. Research and text-only proposal; no website or asset download created. The judging application's existing appearance remains unchanged.

### Verified sources

- [Instagram — kickinitcountrydance](https://www.instagram.com/kickinitcountrydance/): inspected live in the browser without signing in. The profile identifies the Interskate dance community and welcomes different experience levels. Its black-and-white boot/longhorn emblem has horizontal stripes and curved lettering. Visible posts emphasize group photographs and social dancing. The colored profile ring belongs to Instagram's interface, not a verified brand palette.
- [Facebook — Kickin' It Country Dance group](https://www.facebook.com/groups/984536000183510/): the owner supplied this corrected URL. Inspected live without joining or signing in. The public group identifies Lewisville, Texas. Its cover matches the emblem and uses dark wood, warm lights, cream display lettering, red accents and stars around Interskate information. These are observed cues, not a formal brand guide.

Web text retrieval failed for Instagram and returned a blocked page for the group. The observations above come from visible browser pages after dismissing optional login prompts. No private/member-only content was accessed. The originally supplied `facebook.com/kickinitcountryclub/` represents a UK party business with different artwork; exclude it from this project.

### Asset permission

The owner explicitly confirmed permission to use the intended community's branding/logo/photos on 2026-10-09. Do not reask that permission. Select original assets covered by it; social visibility alone does not make every repost a usable project asset.

| Asset | Proposed use |
| --- | --- |
| Correct community boot/longhorn logo | Use the original transparent/vector or suitable high-resolution file; preserve proportions. Do not substitute the UK business's logo. |
| Authorized community/event photographs | Optional event or winners imagery; use original files within the owner's permission and retain any required credit. Results pages work without photos. |
| Community cover graphic | Reference for visual direction. Avoid copying its venue prices/schedules into competition results. |
| Third-party reposts, music, platform interface | Not selected. No copying of Instagram/Facebook interface or downloading videos/music. |
| Fonts/textures | Inspect licenses when selecting exact assets. No paid asset purchase authorized; do not claim a typeface identified from a screenshot. |

### Proposed public-site direction

Use the black/cream emblem with restrained warm brown and dark red accents. These are a design interpretation, not official color values. Keep score tables on plain light surfaces with high-contrast dark text. Reserve texture and Western display lettering for the masthead and small headings; use a readable normal face for names, marks and explanations.

Public navigation: Winners, Leaderboard, About scoring. This is separate from the judging application's unchanged Set-Up → Score → Results → Publish navigation.

- Winners: event identity/date, clear final placements, optional authorized event photo, and visible revision/Under review status. Equal placements receive equal treatment.
- Leaderboard: readable event/division/stage rows, clickable contestant names, Withdrawn/shared-place labels and published revision. Maintain name/rank context on phones.
- Contestant cards: bib/person/pair context, applicable stages and expandable heat/song details, named judge means/counts and explicit blanks. Blank reads Not observed; No remains zero.
- Judge cards: named judge and head designation, stage/heat/song marks and counts, matching revision, no private notes.
- About scoring/service: actual averaging/tiebreak explanations, publication/revision meaning, owner-operated service terms and acknowledgment that visible results can be copied, printed or captured. Link to the correct community pages.

The specification and implementation start must be approved before building. Domain registration, hosted deployment and real publication remain separately unauthorized. See [NEXT_BATCH_SPEC.md](NEXT_BATCH_SPEC.md).

## Acceptance criteria and required verification

All next-batch checks below are **planned, not performed**. Existing closeout success does not establish them.

| Area | Unit / local D1/API evidence | Actual browser / persistence / permissions evidence |
| --- | --- | --- |
| Organizer/judge access | Role/action matrix; no organizer data to judge/public; cross-event/token substitution, revocation, replay and stale versions denied; distinct identity rules preserved | Direct routes, reload/back navigation, copied/replaced links, separate contexts and phone widths; organizer link distribution works; judge sees one page, relevant head duties only |
| View-only Score and setup | No organizer score writes or legacy bypass; same local/shared adapter behavior; import freeze validation | Actual navigation, no writable controls in Score, room controls reachable in Set-Up, imports only in Set-Up, sections collapsed on load, keyboard and Save/cancel/reload |
| Submission/scoring | Independent expected means/counts, No/blanks, stage gates, legacy sums, exact acknowledgement version and racing save rejection | Review/check/confirm/cancel/edit-reset, pending retry, incomplete active coverage, all-judge gate, immutable submitted entries, full stage boundary |
| Corrections | Organizer-only initiation/revision/cancel; dual exact-version approval, no implicit approval, prior requests retained, vote/finals invalidation | Judge has no request controls; head approves exact changes; stale browser cannot approve new version; note privacy in DOM/network and reload |
| Entrant/couple withdrawal | Eligibility + pairing plan version guards; only approved withdrawn coverage waived; no record deletion; original submissions immutable; all-judge quorum retained; zero-active heat handled | Wrong-role request denied, cancel/revise/approve actual controls, J&J blocked invalid pairings, fixed-pair withdrawal, persisted Withdrawn labels, active acknowledgement reset, no auto replacement |
| Public snapshot | Allowlist rejects credentials/notes/internal IDs/reasons; source/scope/disclosure fingerprint; named judges; true blank/count/legacy semantics; only current approvals releasable | Organizer previews exact snapshot and approves; owner separately approves/releases to a local fake publisher; unnamed public context sees only released pages |
| Revision delivery | Atomic current pointer, retry dedupe, stale/out-of-order/source-race rejection, durable outbox recovery; immutable prior revisions | Approved correction causes Under review on prior snapshot; independent renewed approvals; actual revised winners/name-link/scorecard navigation; reload shows one consistent revision |
| Suspension/ownership | Publication-disabled paths cannot write releases; scoring has no publisher dependency; status-only invalidation retained; owner/event role separation | Kill fake publisher, finish scoring/results/corrections/recovery; suspend future publication, existing site remains read-only; no secrets in bundles/responses/storage/backups |
| No exports / recovery | No public/organizer result download endpoints; preserve wrapped/plain v2 and shared inert-history restore | No CSV/Excel/PDF/scorecard/template-download/print-result controls; inline import examples; actual internal backup/restore works; visible copy/print limitation disclosed |
| Branding and accessibility | Escape all public names/text; no stored markup injection or accidental private URL leakage | Public winners/leaderboard/cards at desktop and 360/390px; readable tables/headings/focus/contrast; correct community assets; judging template unchanged |

Required commands retain `pnpm test`, `pnpm test:live`, `pnpm test:browser`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` and whitespace checks. Use a separate local D1 store for compiled Worker tests; verify append-only migration/restart recovery there. Add a local publication receiver/read-site fixture with no real external send. Exercise actual buttons and independent expected outcomes, not only mocks of implementation functions. Do not reset the owner's open event, original localStorage or D1. Report all failures/unperformed checks; local success never proves physical venue or hosted operation.

## Complete isolated mock competition acceptance sequence

1. Create deterministic synthetic organizer, distinct head and two other judges plus separate owner admin and anonymous public sessions. Retain legacy v2 fixture/revision history separately. Use multiple Strictly divisions/heats, both J&J role divisions, rotations and fixed finals pairs; 2–3 songs per heat. Use independent numeric/vote expectations from the existing fixture.
2. Through actual Set-Up controls import entrants/judges, edit/save/cancel/reload, remove/re-add preparation competition/heat, test empty program and collapsed sections. Open/copy/revoke/replace each link. Verify direct-route and API denial by role. Never navigate synthetic tests through owner browser state.
3. Start prelims from Set-Up; verify organizer Score is view-only and no mid-stage official averages appear. Judge enters marks, No, blanks and own notes over all songs. Interrupt a save, recover online/reload, test conflicting cell version and acknowledgement reset. Leave an active entrant uncovered and prove submission/room advancement block.
4. On a separate eligible entrant exercise organizer withdrawal draft, cancellation, edited request/stale approval and exact dual approval. Preserve observed marks, Withdrawn label and only its coverage exemption. Withdraw a Strictly couple and one J&J prelim dancer in separate cases. For the latter reject an invalid remaining pairing plan, approve an exact valid plan for undanced work, and verify prior observations are unchanged. All judges still acknowledge/submit, including the all-withdrawn-heat edge case.
5. Every judge reviews bibs/marks, checks acknowledgement, cancels a confirmation once, edits to clear it and finally confirms the named heat. Block missing judges; complete all remaining heats/divisions. End the whole stage and check counts/blanks/equal means against independent expectations.
6. Discuss a mistaken bib; organizer alone initiates correction. Reject direct judge request and organizer/head single approval, revise request, reject stale approval, apply dual-approved exact version. Original submission and private note isolation survive reload. Reapprove stage after invalidation.
7. Exercise full-panel advancement cutoff votes and a head-only vote deadlock decision with exact remaining count; organizer/ordinary judge cannot perform head action. Advance exactly approved identities. In a separate case correct already-approved prelims and verify stale votes/finals readiness invalidate.
8. Set fixed final pairs and run every final heat/song/acknowledgement. Resolve final placement ties through head controls without changing averages. Approve final results. Keep another competition unfinished and demonstrate only the completed competition is publishable.
9. Organizer Publish preview includes applicable stages, named judge detail, counts/explicit blanks and sanitized revision context. Inspect all public payloads for private notes, participant IDs, codes and reasons. Organizer approves exact snapshot; anonymous/judge/organizer release attempts fail. Owner releases through a local-only publisher. Follow winners → leaderboard → contestant name → detailed judge/stage/heat/song cards, checking independent totals and persisted version.
10. Make a genuine post-publication correction that retains finalist membership. Dual approval marks prior public revision Under review without replacing it. Renew head results approval, organizer snapshot approval, owner release; verify new numbered revision/times and Superseded previous version. Duplicate/out-of-order sends and stale owner approval fail safely. Also verify membership-changing post-Finals changes block publication pending the deferred policy.
11. Simulate publication/network failure and restart outbox processing: no duplicate release or mixed revision. Disable future publication and finish another competition through correction/results/recovery. Prior public snapshots remain readable; status notices work when reachable. Simulate public-hosting shutdown without changing operational ability.
12. Assert absence of all prohibited export routes/buttons and actual internal v2/shared restore compatibility, retained withdrawal/correction history and inert historical approvals. Reload all sessions, recheck permissions, compare untouched owner data and preserved visual layout. Keep synthetic artifacts ignored and record exact pass counts and limits.

## Implementation order after authorization

1. Read docs, inspect preferred branch/status, compare mirror; record baseline/hash and preservation plan. Review relevant Sites persistence guidance before any schema work. No new hosted resource/provider/account is assumed.
2. Implement role-separated entry/routes and single judge page, organizer read-only Score, relocation of room controls/imports/recovery, and local/shared parity. Preserve current scoring/legacy storage before adding publication.
3. Enforce organizer-only request initiation; add versioned entrant/couple withdrawal and exact undanced pairing plans with dual approvals, audit and invalidation. Run unit/D1 tests before UI acceptance.
4. Add immutable snapshot construction, public allowlist, approval/state models and durable local delivery protocol. Keep publication optional and owner credentials solely in server-side development secrets.
5. Implement organizer Publish preview/request and separate owner-only release control plus separate local public winners/leaderboard/cards. Integrate approved branding assets without altering judging styles.
6. Add revised results/Under review/atomic release, suspension and failure recovery; remove prohibited result export controls/endpoints while retaining internal recovery and inert compatibility data.
7. Run full unit/D1/compiled/browser/persistence/permission suite and isolated mock above. Fix reproducible gaps within scope, document actual behavior/timeline, report checks unperformed. Stop before deployment, public release, purchase or any scope expansion.

## Open decisions and deliberately deferred items

There are **no unanswered core policy questions** from the October 9 decision rounds. The following remain proposals or bounded implementation inputs; they must not be mistaken for already implemented behavior.

- Owner review of this assembled specification and authorization to begin the fresh implementation chat remain pending. Do not start it automatically.
- The proposed UI placements, immutable public revision views, snapshot protocol and origin separation are design recommendations for review. They implement confirmed constraints without changing scoring rules. Provider/domain choices, real owner-auth provisioning and real secrets wait for explicit hosted-service authorization; local development uses isolated owner credentials and fake delivery.
- Post-Finals changed-membership replacement/redance policy remains unresolved and outside this batch: invalidate/block rather than guess. It does not prevent normal revised results whose finalist membership stays valid. Reinstatement/substitutes and publication of legacy-only events are also deferred.
- Branding permission is confirmed. Use the correct community logo; exact source asset files/resolution and final typography/color tokens need inspection when implementation begins. No paid font/media/service may be purchased by inference.
- Per-event free-entry quantity and support terms are event-arrangement details, not software permissions. No automatic billing or organizer self-hosting handoff is in scope.

Preserve existing data/uncommitted work, legacy scoring, v2 backups, local/shared parity and visual template throughout. No deployment, public publication or purchases without authorization.

## Fresh implementation chat prompt

Use **GPT-6.1 Sol, High**. This prompt is saved for the owner to send after reviewing the specification; it does not authorize this documentation task to implement anything or create a new chat. Sending it in the fresh chat supplies the implementation approval, so that chat need not ask again merely because this document records the earlier review gate.

---

I approve NEXT_BATCH_SPEC.md for local implementation. Use the preferred checkout `C:\Users\Iam\Projects\Country Dance Judging App\app`. Read AGENTS.md, PROJECT_SPEC.md (Quick context, stage workflow and timeline), LOCAL_TEST_REPORT.md and all of NEXT_BATCH_SPEC.md, including branding, acceptance criteria and the complete isolated mock. This message authorizes implementation; do not reopen settled decisions or ask again for permission to begin.

Inspect branch/status/remotes and compare affected files with `C:\Users\Iam\Documents\ChatGPT\Country Dance Judging App\app` before edits or sync. Repository: `https://github.com/WesKof/CountryDanceJudgingSoftware.git`, branch `codex/stage-heat-workflow`. Preserve later commits, unrelated/uncommitted work, existing data/browser state, legacy scoring/revisions, v2 backups, local/shared parity and the visual template with collapsed setup sections.

Implement the documented access separation, single judge page, view-only organizer Score, setup imports, organizer-initiated corrections, dual-approved contestant/couple withdrawals, and separate owner-controlled public-results workflow. Preserve acknowledgement, coverage, equal-judge scoring, voting, head decisions, author-only notes and history. Public judge names are allowed; private notes are not. Use approved immutable snapshots, separate organizer/owner approvals and numbered revisions. Keep competition operation available when publication is disabled. Use the correct Interskate/Lewisville branding and the recorded asset permission.

Follow the implementation order and full mock in NEXT_BATCH_SPEC.md. Use synthetic fixtures, isolated role sessions, local D1 and a fake local publisher. Verify actual controls, permissions, persistence, scoring and revision outcomes with meaningful unit, local API, compiled Worker and browser tests; run lint, TypeScript, build and whitespace checks. Fix reproducible gaps within scope. Do not invent the deferred post-Finals replacement/redance policy.

Do not deploy, provision hosted services, publish real results or purchase anything. Keep the local preview available. Update the master spec/timeline and test report with implemented behavior, evidence and unperformed checks. Fold the temporary next-batch spec into those documents when complete; keep three permanent documents and one temporary next-batch spec only when needed. Finish with a concise reviewable handoff.

---
