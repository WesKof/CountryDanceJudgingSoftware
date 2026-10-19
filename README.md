# Country Dance Judging

Organizer and private-judge software for Strictly and Jack & Jill events, with shared stage/heat judging, Results review and independently approved publication.

## Current source and references

`main` is the current development baseline. Named `checkpoint/*` tags preserve the original GitHub branches, hosted versions and each reviewed UI milestone. See the complete [checkpoint and rollback map](PROJECT_SPEC.md#github-checkpoints-and-rollback-map).

- [PROJECT_SPEC.md](PROJECT_SPEC.md): product behavior, scoring/data contracts, deployment context and rollback map.
- [AGENTS.md](AGENTS.md): working instructions and current authorization.
- [LOCAL_TEST_REPORT.md](LOCAL_TEST_REPORT.md): dated checks, evidence and limitations.

The [live judging site](https://country-dance-judging.wes6969.chatgpt.site/) runs public Sites version 4, deployed October 19, 2026 from source `da371cb`. The reviewed local design, shared judging and refresh recovery are now online with Sites-managed D1 `DB`. Updating GitHub alone does not deploy it. Version 3 remains preserved at `checkpoint/live-site-v3-before-upgrade-2026-10-19`; deployment IDs, verification and rollback limits are in the canonical documents.

The separate public-results publisher is not deployed/configured. Publish can prepare and record an organizer approval request, but there is no production website-admin delivery/release service or public-results URL. Judging, review and backups work independently. Local fake-receiver release tests are local evidence only; the independent website-admin approval gate remains enforced.

## Current behavior

- Organizer flow: Set up, Score, Results, Publish. The last page and selected competition/round survive a refresh within the same browser tab, separately per event.
- Private judge links, autosaved song drafts and acknowledged heat submissions. Setup changes require Save setup.
- Strictly couples and Jack & Jill leads/follows, approved advancement and actual Finals pairings.
- Yes = 10, A1 = 4.5, A2 = 4.3, No = 0; blanks are excluded. Each judge average carries equal weight.
- Exact head approvals, tie decisions, versioned corrections/withdrawals, retained history and role boundaries.
- Complete-event publication previews and separate website-admin release approval. A hosted results publisher is separate from the judging app; local fake-receiver tests do not establish a hosted service.
- JSON recovery backups exclude private notes and access credentials by default. Restore creates a new event and links, retaining previous results as history.
- Legacy device records remain preserved separately. Old exports and direct Google Apps Script publication are historical compatibility source, not current organizer features.

Shared judging requires access to its server. There is no guaranteed offline reload or service worker. Browser/device data is not included in Git source checkpoints.

## Local development

Requirements: Node.js 22.13 or newer and pnpm. The application uses React, TypeScript, Vinext/Vite and logical D1 binding `DB`.

```sh
pnpm install
pnpm dev --hostname 127.0.0.1 --port 3000
```

Use the preferred uncompressed checkout named in AGENTS.md. Preserve ignored local stores and environment files. Follow the specification for local D1 preparation and use isolated synthetic stores for testing.

```sh
pnpm test
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

API/browser integration suites require the separately configured synthetic Worker/D1 and fake results receiver; never point mutation tests at an owner's event. See LOCAL_TEST_REPORT.md for the latest verified scope.

## Inspect an earlier checkpoint safely

```sh
git show checkpoint/publish-layout-2026-10-19
git switch -c codex/inspect-publish checkpoint/publish-layout-2026-10-19
```

Start from a clean checkout and preserve ignored runtime state separately. Prefer a new branch or a revert commit over resetting shared history. A source rollback does not roll a database back.
