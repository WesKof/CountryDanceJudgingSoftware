# Country Dance Judging

A local-first judging desk for Strictly and Jack & Jill competitions. The app keeps event setup, ballots, and result revisions in the browser on the current device. An internet connection is not required while judging.

## Core behavior

- Event, competition, judge, and contestant setup
- Strictly couple rosters and Jack & Jill lead/follow rosters
- Legacy mark values: Yes = 10, A1 = 4.5, A2 = 4.3, No = 0
- Automatic local autosave
- Incomplete-ballot checks and shared-place tie handling
- Timestamped result revisions
- CSV roster import, CSV results export, print layout, and full JSON backup/restore
- Optional Google Apps Script publishing endpoint

## CSV formats

Strictly contestants:

```csv
Number,Lead,Follow
128,Lead name,Follow name
```

Jack & Jill contestants:

```csv
Number,Name,Role
204,Dancer name,Lead
```

Judges:

```csv
Name
Judge name
```

Templates are also downloadable from the Data screen.

## Google Apps Script publishing

The connector is optional. Configure a deployed HTTPS web-app `/exec` URL on the Data screen. Completed results are sent as a form field named `results` containing an array-of-arrays JSON payload, which remains compatible with the existing `doPost(e)` contract.

Do not use the Apps Script editor URL or a private spreadsheet CSV URL as the publishing endpoint. Deploy the script intentionally and review its access settings before use.

## Local development

Requirements: Node.js 22.13 or newer and pnpm.

```sh
pnpm install
pnpm dev
```

Quality checks:

```sh
pnpm test
pnpm lint
pnpm build
```
