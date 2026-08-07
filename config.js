/* ------------------------------------------------------------------------
 * Job Photo Capture — deployment settings
 *
 * This is the ONLY file an administrator needs to edit. See README.md for
 * how to obtain the Google values.
 * --------------------------------------------------------------------- */

window.APP_CONFIG = {

  /* Name shown in the header and on the install tile. */
  ORG_NAME: 'Job Photo Capture',

  /* ---------------------------------------------------------------- */
  /* Google — required                                                */
  /* ---------------------------------------------------------------- */

  /* OAuth 2.0 *Web application* client ID from Google Cloud Console.
     Looks like: 1234567890-abcdef.apps.googleusercontent.com */
  GOOGLE_CLIENT_ID: '',

  /* The Drive folder that all job folders are created inside.
     Take it from the folder's URL:
     https://drive.google.com/drive/folders/<THIS PART>
     Leave blank to file jobs at the root of each user's My Drive. */
  DRIVE_PARENT_FOLDER_ID: '',

  /* Drive permission requested at sign-in.
     'https://www.googleapis.com/auth/drive'
         Full Drive access. Required if DRIVE_PARENT_FOLDER_ID points at a
         folder the app did not create itself — i.e. the normal setup, where
         an admin shares one folder with all staff. This is the default.
     'https://www.googleapis.com/auth/drive.file'
         Narrower: the app can only see files it created. Use this only when
         DRIVE_PARENT_FOLDER_ID is blank; each user then gets job folders in
         their own My Drive. */
  DRIVE_SCOPE: 'https://www.googleapis.com/auth/drive',

  /* ---------------------------------------------------------------- */
  /* Google Sheet log — optional                                      */
  /* ---------------------------------------------------------------- */

  /* Spreadsheet ID from its URL:
     https://docs.google.com/spreadsheets/d/<THIS PART>/edit
     Leave blank to skip sheet logging. A JSON manifest is always written
     into the job folder either way. */
  LOG_SHEET_ID: '',

  /* Sheet/tab to append rows to. Must already exist in the spreadsheet. */
  LOG_SHEET_NAME: 'Log',

  /* ---------------------------------------------------------------- */
  /* Capture rules                                                    */
  /* ---------------------------------------------------------------- */

  MIN_PHOTOS: 3,
  MAX_PHOTOS: 4,

  /* Longest edge in pixels after downscaling. 2000px keeps detail legible
     while holding most photos near 500 KB — important on mobile data. */
  MAX_IMAGE_EDGE: 2000,

  /* JPEG quality, 0–1. */
  JPEG_QUALITY: 0.85,

  /* Burn GPS coordinates into the stamp. Turning this on makes the browser
     ask each user for location permission the first time they capture. */
  STAMP_LOCATION: false,

  /* Force job numbers to upper case as they are typed. */
  UPPERCASE_JOB_NUMBER: true,

  /* Accepted job number format. Default: starts alphanumeric, then 1–31 of
     letters, digits, hyphen, underscore or slash. Slashes are converted to
     hyphens in folder and file names. */
  JOB_NUMBER_PATTERN: '^[A-Za-z0-9][A-Za-z0-9\\-_/]{1,31}$',
  JOB_NUMBER_HELP: 'Letters and numbers, 2–32 characters.'
};
