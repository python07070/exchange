# Job Photo Capture

An HTML5 web app for internal staff: enter a job number, take 3–4 photos, submit.
Each photo is timestamped and filed into a Google Drive folder named after the job
number, alongside a JSON record of the submission and (optionally) a row in a
Google Sheet log.

No build step, no server-side code, no dependencies. It is a folder of static
files — drop it on any web host and it runs.

---

## Why Google Drive and not iCloud

**iCloud is not available to a web app like this.** Apple's only web-facing API is
CloudKit JS, which reads and writes a *developer's own* CloudKit container tied to
an Apple Developer Program membership. There is no public API — CloudKit JS or
otherwise — that lets a third-party web app write files into a staff member's
iCloud Drive. Photos could only reach iCloud by syncing from a device's camera
roll, which defeats the point of central filing.

Google Drive has a documented REST API with browser OAuth, which is why the app
targets it. The entire storage layer lives in [`js/drive.js`](js/drive.js) and is
the only file that knows about Google — swapping in S3, SharePoint/OneDrive, or
your own server means rewriting that one file against the same four functions
(`ensureFolder`, `uploadFile`, `uploadJson`, `appendLogRow`).

If iCloud filing is a hard requirement, the realistic route is a small backend
that receives the uploads and a Mac (or Mac mini) signed into the iCloud account
that mirrors them into iCloud Drive. That is a different project.

---

## What a submission produces

For job `24-1087`, inside your shared Drive folder:

```
24-1087/
  JOB-24-1087__20260807-143210__p1of4.jpg
  JOB-24-1087__20260807-143255__p2of4.jpg
  JOB-24-1087__20260807-143318__p3of4.jpg
  JOB-24-1087__20260807-143402__p4of4.jpg
  JOB-24-1087__submission-20260807-143512.json
```

Each JPEG carries a banner burned into the bottom of the image:

```
JOB 24-1087                                          Photo 2
2026-08-07 14:32:55 UTC+10
```

The stamp is burned into the pixels deliberately. EXIF metadata is stripped by
many viewers, by Drive's own preview, and by anything that screenshots or prints
the photo — a visible banner survives all of that. The machine-readable copy is
kept too, as Drive `appProperties` (`jobNumber`, `capturedAt`, `photoIndex`) so
photos stay searchable.

The `submission-*.json` file records job number, submitter, both UTC and local
timestamps, per-photo dimensions and byte sizes, notes, and the Drive file IDs.
Repeat submissions for the same job add files to the same folder rather than
overwriting.

---

## Setup

### 1. Create the Drive folder

Make one folder in Google Drive (or a Shared Drive) to hold all jobs — e.g.
`Job Photos`. Share it with the staff who will use the app, with **Editor**
access. Copy its ID from the URL:

```
https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz
                                       └────────── this ──────────┘
```

A Shared Drive is preferable to a personal My Drive folder: files stay with the
organisation when someone leaves. Note that with the setup below each file is
*owned* by the staff member who uploaded it unless it lands in a Shared Drive.

### 2. Create the Google Cloud OAuth client

1. Go to <https://console.cloud.google.com/> and create a project (or pick one).
2. **APIs & Services → Library** → enable **Google Drive API**. Also enable
   **Google Sheets API** if you want the sheet log.
3. **APIs & Services → OAuth consent screen** → choose **Internal** (available on
   Google Workspace; this skips Google's app-verification review entirely, which
   is the main reason to use a Workspace account here). Fill in the app name and
   support email.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   → Application type **Web application**.
5. Under **Authorised JavaScript origins**, add every origin the app is served
   from — scheme and port included, no trailing slash:
   - `https://photos.yourcompany.com` (production)
   - `http://localhost:8080` (local testing)
6. Copy the client ID.

No redirect URI is needed — the app uses the token flow, not the code flow.

### 3. Fill in `config.js`

```js
GOOGLE_CLIENT_ID:       '1234567890-abcdef.apps.googleusercontent.com',
DRIVE_PARENT_FOLDER_ID: '1AbCdEfGhIjKlMnOpQrStUvWxYz',
ORG_NAME:               'Acme Field Services',
```

`config.js` is the only file an administrator edits. Everything else — photo
count, image size, job-number format — is also in there, commented.

### 4. Optional: the Google Sheet log

Create a spreadsheet, rename a tab to `Log`, and add a header row:

| Submitted | Job number | Photos | Submitted by | Folder | Files | Notes |
|---|---|---|---|---|---|---|

Set `LOG_SHEET_ID` in `config.js` to the ID from the sheet's URL and share the
sheet with staff as **Editor**. Each submission appends one row. Leave
`LOG_SHEET_ID` blank to skip it — the per-job JSON record is always written
either way.

### 5. Deploy

Copy the folder to any HTTPS static host — IIS, nginx, Apache, Netlify, Cloudflare
Pages, an S3 bucket, a SharePoint site, whatever you already run.

**HTTPS is mandatory.** Camera access, service workers and Google sign-in all
refuse to run on plain HTTP. `http://localhost` is the one exception, for testing.

---

## Local testing

From this folder:

```powershell
python -m http.server 8080
```

or

```powershell
npx --yes serve -l 8080 .
```

Then open <http://localhost:8080/> and make sure `http://localhost:8080` is listed
as an authorised JavaScript origin on the OAuth client.

Desktop browsers open a file picker instead of a camera — that is expected. Use
**Choose file** there and test the camera on a real phone against the deployed
HTTPS URL.

---

## Staff instructions

1. Open the app URL on a phone. On iOS: Share → **Add to Home Screen**. On
   Android: menu → **Install app**. It then launches full-screen like a native
   app.
2. Tap **Connect** once and sign in with the work Google account. The session
   persists for about an hour and renews silently after that.
3. Type the job number, take 3–4 photos, add notes if useful, tap **Submit**.
4. Wait for the tick. If a photo fails — dead spot, dropped signal — tap
   **Retry failed uploads**; photos that already went up are not re-sent.

---

## Configuration reference

All in `config.js`:

| Setting | Default | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | — | Required. |
| `DRIVE_PARENT_FOLDER_ID` | — | Blank files jobs at the root of each user's My Drive. |
| `DRIVE_SCOPE` | full `drive` | See below. |
| `LOG_SHEET_ID` / `LOG_SHEET_NAME` | — / `Log` | Optional sheet log. |
| `MIN_PHOTOS` / `MAX_PHOTOS` | 3 / 4 | |
| `MAX_IMAGE_EDGE` | 2000 px | Longest edge after downscaling. |
| `JPEG_QUALITY` | 0.85 | |
| `STAMP_LOCATION` | `false` | Burns GPS coordinates into the stamp. Prompts each user for location permission. |
| `UPPERCASE_JOB_NUMBER` | `true` | |
| `JOB_NUMBER_PATTERN` | alphanumeric, 2–32 chars | Regex, as a string. |

### About the Drive scope

The default is the full `https://www.googleapis.com/auth/drive` scope. This is
required whenever `DRIVE_PARENT_FOLDER_ID` points at a folder the app did not
create itself — which is the normal setup, where an admin shares one folder with
everyone. Under the narrower `drive.file` scope, Google only exposes files the app
created, so writing into a pre-existing shared folder fails with a 404.

Switch `DRIVE_SCOPE` to `.../auth/drive.file` **only** if you also blank out
`DRIVE_PARENT_FOLDER_ID`; each user then gets job folders in their own My Drive,
and the app can see nothing else in their Drive. The app warns on screen if these
two settings contradict each other.

Getting narrow scope *and* a central folder requires either Google Picker (a
one-time per-device folder selection) or a backend service account. Both are
larger changes; ask if you want either.

---

## Files

| File | Purpose |
|---|---|
| `index.html` | Markup and view structure. |
| `styles.css` | All styling. Mobile-first, dark, large tap targets. |
| `config.js` | **The only file to edit for deployment.** |
| `js/image.js` | Decode, EXIF-correct rotation, downscale, burn the timestamp banner. |
| `js/drive.js` | Google auth, Drive folders and uploads, Sheets logging. The whole storage layer. |
| `js/app.js` | UI wiring, capture flow, submission orchestration. |
| `sw.js` | Service worker — caches the app shell so it loads on a weak signal. |
| `manifest.webmanifest`, `icon.svg` | Install-to-home-screen metadata. |

Bump `CACHE` in `sw.js` when you deploy changes, otherwise phones that have
already installed the app keep serving the old shell.

---

## Deliberate limits

Worth knowing before rollout:

- **No offline queue.** The app shell loads offline, but a submission needs a live
  connection. Photos survive a failed upload in the current tab and can be
  retried, but closing the tab loses them. If staff routinely work out of signal,
  an IndexedDB queue with background sync is the next thing to build.
- **Access tokens live in memory only**, never `localStorage`, so closing the tab
  ends the session — deliberate, since these are often shared devices. The cost is
  a sign-in prompt roughly hourly; Google usually resolves it silently without any
  user interaction.
- **Files are owned by the uploading staff member** unless the parent folder is in
  a Shared Drive. Use a Shared Drive if you need the organisation to retain
  ownership.
- **PWA icon is an SVG.** Android and desktop Chrome accept it. iOS home-screen
  icons want PNG — export `icon.svg` to 180×180 and 512×512 PNGs and add them to
  `manifest.webmanifest` plus an `apple-touch-icon` link if the iOS icon matters.
- **The client ID is public**, as it is in every browser OAuth app. That is fine —
  it is not a secret, and the authorised-origins list plus an *Internal* consent
  screen is what actually restricts use.
