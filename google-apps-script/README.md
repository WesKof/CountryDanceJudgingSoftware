# Secured Google Sheets publisher

The judging app works without this connector. Install it only when an organizer wants to publish completed results to Google Sheets.

## Configure

1. Open the **Country Dance Web App Connector** project in Google Apps Script.
2. Replace the active `doPost` implementation with `Do_Post.gs` from this folder.
3. Open **Project Settings → Script properties** and add:
   - `SHEET_ID`: the destination spreadsheet ID.
   - `PUBLISHING_KEY`: a long random value known only to event organizers.
4. Deploy a new Web app version that executes as the script owner.
5. Copy the deployment's `/exec` URL—not the editor or `/dev` URL—into the judging app.
6. Enter the same publishing key in the judging app on the organizer's device.

## Behavior

- Requests without the correct key are rejected.
- Payload size and shape are validated before any spreadsheet write.
- A script lock prevents overlapping publishes.
- Every accepted publication is appended to **Published Results Archive** with a timestamp.
- **Published Private Results** remains the latest-results snapshot for existing consumers.

The URL and key are saved only in that browser and are excluded from downloaded event backups.
