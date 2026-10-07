# Country Dance Judging — working instructions

## Read first

This is a public competition desk for Wesley Coffman's local dance community and a portfolio project for employers. It uses React/TypeScript with Vinext/Vite and Sites hosting. State lives in each browser; Google Sheets publishing is optional. The owner prefers no custom in-app authentication and a vertical sidebar at all screen sizes.

The maintained reference is [PROJECT_SPEC.md](PROJECT_SPEC.md). Read its **Quick context** first, then only the sections and source files relevant to the task. Do not routinely scan the entire repository, dependency folders, build output, lockfile, or base64 social image. Verify affected code before changing it; the reference is a map, not a replacement for evidence.

## Task routing

| Task | Reference section | Start with |
| --- | --- | --- |
| UI, navigation, mobile | Product and workflow; Visual design | `app/page.tsx`, `app/globals.css` |
| Scoring, ties, completeness | Scoring contract | `lib/scoring.ts`, `tests/scoring.test.ts` |
| State, backup, import/export | Data and persistence | `lib/domain.ts`, relevant handlers in `app/page.tsx`, `lib/csv.ts` |
| Sheets publishing | Optional Google Sheets connector | `google-apps-script/Do_Post.gs`, `publishResults` |
| Build or hosting | Development and release | `package.json`, `vite.config.ts`, `.openai/hosting.json` |
| Social preview | Visual design | `app/layout.tsx`, `app/og/route.ts` |

## Preserve these decisions

- Marks: Yes=10, A1=4.5, A2=4.3, No=0. An empty mark is incomplete; No is completed.
- Rank only fully scored entries. Equal totals share place; use competition ranking (1, 1, 3). Rank Jack & Jill leads and follows separately.
- Keep existing event data compatible. Never change storage keys or backup schema without a migration plan.
- Keep publishing credentials out of event backups, source, logs, and examples.
- Keep Google integration optional. A frontend key field does not secure an old deployed script.
- Preserve the numbered vertical sidebar and accessible state labels.
- Public access does not mean shared event state. Do not imply cloud sync or guaranteed offline reload.
- Do not introduce accounts, cloud storage, a different scoring system, or a new framework unless the task calls for it.

## Working and maintenance

Check `git status` and preserve unrelated changes. Read the reference's known limitations before claiming a feature is complete. Test behavior proportionately: scoring/CSV changes need relevant tests; UI changes need lint/build and focused interaction checks when available. Documentation-only edits need link and factual checks, not a production deployment.

Update the affected sections of PROJECT_SPEC.md in the same change whenever behavior, architecture, schemas, workflow, or operating instructions change. Record the verification date and relevant evidence. Label proposed work and unverified external configuration explicitly. Do not turn the reference into a transcript or duplicate source code.

Before any push or deployment, confirm current authorization, branch, remote, and deployment access. Documentation is not standing authorization for external writes.
