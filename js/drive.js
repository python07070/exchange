/* ------------------------------------------------------------------------
 * drive.js — Google sign-in, Drive folders/uploads, Sheets logging.
 *
 * This is the whole storage layer. Everything above it (app.js) talks only
 * to the functions returned here, so swapping Drive for another backend
 * means rewriting this file and nothing else.
 *
 * Access tokens are kept in memory only — never localStorage — so closing
 * the tab ends the session on shared devices.
 * --------------------------------------------------------------------- */

window.Cloud = (function () {
  'use strict';

  var cfg = window.APP_CONFIG;

  var FOLDER_MIME = 'application/vnd.google-apps.folder';
  var API   = 'https://www.googleapis.com/drive/v3';
  var UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

  var tokenClient = null;
  var token = null;        // { value, expiresAt }
  var account = null;      // email address, once known
  var pending = null;      // in-flight token request

  /* ------------------------------------------------------------ scopes -- */

  function scopes() {
    var list = [cfg.DRIVE_SCOPE, 'https://www.googleapis.com/auth/userinfo.email'];
    if (cfg.LOG_SHEET_ID) list.push('https://www.googleapis.com/auth/spreadsheets');
    return list.join(' ');
  }

  /* The GIS script is loaded async; wait for it rather than assuming order. */
  function gisReady() {
    return new Promise(function (resolve, reject) {
      var waited = 0;
      (function poll() {
        if (window.google && google.accounts && google.accounts.oauth2) { resolve(); return; }
        if ((waited += 100) > 12000) {
          reject(new Error('Could not reach Google sign-in. Check the network connection.'));
          return;
        }
        setTimeout(poll, 100);
      })();
    });
  }

  /* ------------------------------------------------------------- auth -- */

  function tokenIsLive() {
    return !!token && Date.now() < token.expiresAt - 60000; // 60s safety margin
  }

  /**
   * @param {boolean} interactive  false = try silently, fail if consent needed
   */
  function getToken(interactive) {
    if (tokenIsLive()) return Promise.resolve(token.value);
    if (pending) return pending;

    pending = gisReady().then(function () {
      return new Promise(function (resolve, reject) {
        if (!tokenClient) {
          tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: cfg.GOOGLE_CLIENT_ID,
            scope: scopes(),
            callback: function () {}   // replaced per request below
          });
        }

        tokenClient.callback = function (resp) {
          if (resp.error) {
            reject(new Error(
              resp.error === 'access_denied'
                ? 'Google access was declined.'
                : 'Google sign-in failed: ' + resp.error
            ));
            return;
          }
          token = {
            value: resp.access_token,
            expiresAt: Date.now() + (Number(resp.expires_in) || 3600) * 1000
          };
          resolve(token.value);
        };

        tokenClient.error_callback = function (err) {
          reject(new Error('Google sign-in was closed or blocked (' + (err && err.type) + ').'));
        };

        /* '' lets Google skip the account chooser when it already knows who
           this is; 'consent' is only needed the very first time. */
        tokenClient.requestAccessToken({ prompt: interactive ? '' : 'none' });
      });
    });

    pending.catch(function () {}).then(function () { pending = null; });
    return pending;
  }

  function signOut() {
    if (token && window.google && google.accounts && google.accounts.oauth2) {
      google.accounts.oauth2.revoke(token.value, function () {});
    }
    token = null;
    account = null;
  }

  function fetchAccount() {
    if (account) return Promise.resolve(account);
    return api('https://www.googleapis.com/oauth2/v3/userinfo', {})
      .then(function (info) { account = info.email || null; return account; })
      .catch(function () { return null; });
  }

  /* -------------------------------------------------------- api helper -- */

  /* Single retry on 401 — access tokens expire mid-submission on slow links. */
  function api(url, opts, retried) {
    opts = opts || {};
    return getToken(true).then(function (t) {
      var headers = Object.assign({ Authorization: 'Bearer ' + t }, opts.headers || {});
      return fetch(url, Object.assign({}, opts, { headers: headers }));
    }).then(function (res) {
      if (res.status === 401 && !retried) {
        token = null;
        return api(url, opts, true);
      }
      return res.text().then(function (body) {
        var data = null;
        try { data = body ? JSON.parse(body) : null; } catch (e) { /* non-JSON */ }
        if (!res.ok) {
          var msg = (data && data.error && (data.error.message || data.error)) ||
                    ('HTTP ' + res.status);
          throw new Error(String(msg));
        }
        return data;
      });
    });
  }

  /* -------------------------------------------------------- folders -- */

  function escapeQ(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

  /** Find a folder by name under parent, or create it. Returns the file resource. */
  function ensureFolder(name, parentId) {
    var q = [
      "mimeType = '" + FOLDER_MIME + "'",
      "name = '" + escapeQ(name) + "'",
      "trashed = false",
      "'" + escapeQ(parentId || 'root') + "' in parents"
    ].join(' and ');

    var listUrl = API + '/files?' + new URLSearchParams({
      q: q,
      fields: 'files(id,name,webViewLink)',
      pageSize: '1',
      spaces: 'drive',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true'
    });

    return api(listUrl).then(function (data) {
      if (data && data.files && data.files.length) return data.files[0];

      var body = { name: name, mimeType: FOLDER_MIME };
      if (parentId) body.parents = [parentId];

      return api(API + '/files?' + new URLSearchParams({
        fields: 'id,name,webViewLink',
        supportsAllDrives: 'true'
      }), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    });
  }

  /* --------------------------------------------------------- uploads -- */

  /**
   * multipart/related upload via XHR, because fetch gives no upload progress.
   * FormData cannot be used here: Drive needs multipart/related, not
   * multipart/form-data, so the body is assembled by hand.
   */
  function uploadFile(opts, retried) {
    var boundary = 'jpc' + String(opts.name).length + 'x7b3d9f1a4c';

    var metadata = {
      name: opts.name,
      mimeType: opts.blob.type || 'application/octet-stream'
    };
    if (opts.parents) metadata.parents = [opts.parents];
    if (opts.description) metadata.description = opts.description;
    if (opts.appProperties) metadata.appProperties = opts.appProperties;

    var body = new Blob([
      '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      '\r\n--' + boundary + '\r\nContent-Type: ' + metadata.mimeType + '\r\n\r\n',
      opts.blob,
      '\r\n--' + boundary + '--\r\n'
    ]);

    return getToken(true).then(function (t) {
      return new Promise(function (resolve, reject) {
        var url = UPLOAD + '/files?' + new URLSearchParams({
          uploadType: 'multipart',
          fields: 'id,name,webViewLink,size',
          supportsAllDrives: 'true'
        });

        var xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + t);
        xhr.setRequestHeader('Content-Type', 'multipart/related; boundary=' + boundary);
        xhr.timeout = 180000;

        if (opts.onProgress) {
          xhr.upload.onprogress = function (e) {
            if (e.lengthComputable) opts.onProgress(e.loaded / e.total);
          };
        }

        xhr.onload = function () {
          if (xhr.status === 401 && !retried) {
            token = null;
            uploadFile(opts, true).then(resolve, reject);
            return;
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)); }
            catch (e) { reject(new Error('Drive returned an unreadable response')); }
            return;
          }
          var msg = 'HTTP ' + xhr.status;
          try {
            var d = JSON.parse(xhr.responseText);
            if (d.error && d.error.message) msg = d.error.message;
          } catch (e) { /* keep status */ }
          reject(new Error(msg));
        };

        xhr.onerror   = function () { reject(new Error('Network error during upload')); };
        xhr.ontimeout = function () { reject(new Error('Upload timed out')); };
        xhr.onabort   = function () { reject(new Error('Upload cancelled')); };

        xhr.send(body);
      });
    });
  }

  function uploadJson(name, obj, parentId) {
    return uploadFile({
      name: name,
      blob: new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }),
      parents: parentId
    });
  }

  /* ---------------------------------------------------------- sheets -- */

  /** Appends one row to the configured log sheet. No-op when unconfigured. */
  function appendLogRow(values) {
    if (!cfg.LOG_SHEET_ID) return Promise.resolve(null);

    var range = encodeURIComponent((cfg.LOG_SHEET_NAME || 'Log') + '!A1');
    var url = 'https://sheets.googleapis.com/v4/spreadsheets/' +
      encodeURIComponent(cfg.LOG_SHEET_ID) + '/values/' + range +
      ':append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS';

    return api(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [values] })
    });
  }

  return {
    getToken: getToken,
    signOut: signOut,
    fetchAccount: fetchAccount,
    isConnected: tokenIsLive,
    ensureFolder: ensureFolder,
    uploadFile: uploadFile,
    uploadJson: uploadJson,
    appendLogRow: appendLogRow
  };
})();
