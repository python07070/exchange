/* ------------------------------------------------------------------------
 * app.js — UI, capture flow and submission orchestration.
 * --------------------------------------------------------------------- */

(function () {
  'use strict';

  var cfg = window.APP_CONFIG;
  var RECENT_KEY = 'jpc.recent.v1';

  var el = {};
  ['orgName', 'accountLine', 'authBtn', 'configBanner',
   'captureView', 'jobNumber', 'jobHint', 'photoGrid', 'photoCounter',
   'takeBtn', 'pickBtn', 'cameraInput', 'libraryInput', 'notes',
   'submitBtn', 'submitHint',
   'uploadView', 'uploadJob', 'uploadSteps', 'retryBtn', 'backBtn',
   'doneView', 'doneJob', 'doneSummary', 'doneLink', 'nextBtn',
   'recentCard', 'recentList', 'clearRecent', 'toast'
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  var state = {
    photos: [],        // { id, blob, url, capturedAt, location, w, h, status, progress, error, file }
    busyCaptures: 0,
    submitting: false,
    jobFolder: null,   // reused across retries so we never make duplicate folders
    submissionId: null,
    lastAttemptJob: null
  };

  var jobRe = new RegExp(cfg.JOB_NUMBER_PATTERN);
  var nextId = 1;

  /* ---------------------------------------------------------- helpers -- */

  function toast(message, isError) {
    el.toast.textContent = message;
    el.toast.classList.toggle('is-error', !!isError);
    el.toast.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.toast.classList.add('hidden'); }, isError ? 6000 : 3200);
  }

  function show(view) {
    ['captureView', 'uploadView', 'doneView'].forEach(function (v) {
      el[v].classList.toggle('hidden', v !== view);
    });
    el.recentCard.classList.toggle('hidden', view !== 'captureView' || !readRecent().length);
    window.scrollTo(0, 0);
  }

  function jobNumber() { return el.jobNumber.value.trim(); }

  function jobIsValid() { return jobRe.test(jobNumber()); }

  /* Drive tolerates most characters, but these break Windows/macOS sync
     clients when the folder is mirrored locally. */
  function safeName(s) { return String(s).replace(/[\\/:*?"<>|]+/g, '-'); }

  function formatBytes(n) {
    if (!n) return '';
    return n < 1024 * 1024
      ? Math.round(n / 1024) + ' KB'
      : (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  /* ------------------------------------------------------ config check -- */

  function checkConfig() {
    var problems = [];
    if (!cfg.GOOGLE_CLIENT_ID) problems.push('GOOGLE_CLIENT_ID is not set');
    if (cfg.DRIVE_SCOPE.indexOf('drive.file') !== -1 && cfg.DRIVE_PARENT_FOLDER_ID) {
      problems.push('DRIVE_SCOPE is drive.file but DRIVE_PARENT_FOLDER_ID is set — ' +
                    'the app cannot write into a folder it did not create');
    }
    if (!problems.length) return true;

    el.configBanner.innerHTML = '<strong>Setup incomplete.</strong> Edit <code>config.js</code>: ' +
      problems.join('; ') + '.';
    el.configBanner.classList.remove('hidden');
    return false;
  }

  /* ------------------------------------------------------------- auth -- */

  function paintAuth() {
    var on = window.Cloud.isConnected();
    el.accountLine.textContent = on
      ? (paintAuth.email || 'Connected to Google Drive')
      : 'Not connected';
    el.accountLine.classList.toggle('is-on', on);
    el.authBtn.textContent = on ? 'Sign out' : 'Connect';
  }

  function connect(interactive) {
    return window.Cloud.getToken(interactive).then(function () {
      return window.Cloud.fetchAccount();
    }).then(function (email) {
      paintAuth.email = email;
      paintAuth();
      return true;
    });
  }

  el.authBtn.addEventListener('click', function () {
    if (window.Cloud.isConnected()) {
      window.Cloud.signOut();
      paintAuth.email = null;
      paintAuth();
      toast('Signed out');
    } else {
      connect(true).then(function () { toast('Connected'); },
                         function (err) { toast(err.message, true); });
    }
  });

  /* ----------------------------------------------------------- photos -- */

  function renderGrid() {
    el.photoGrid.innerHTML = '';

    for (var i = 0; i < cfg.MAX_PHOTOS; i++) {
      var photo = state.photos[i];
      var slot = document.createElement('div');
      slot.className = 'slot' + (photo ? ' slot--filled' : '') +
                       (!photo && i < cfg.MIN_PHOTOS ? ' slot--required' : '');

      if (photo) {
        var img = document.createElement('img');
        img.className = 'slot__img';
        img.src = photo.url;
        img.alt = 'Photo ' + (i + 1);
        slot.appendChild(img);

        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'slot__x';
        x.setAttribute('aria-label', 'Remove photo ' + (i + 1));
        x.textContent = '×';
        x.dataset.id = photo.id;
        x.addEventListener('click', onRemove);
        slot.appendChild(x);
      } else {
        var n = document.createElement('span');
        n.className = 'slot__n';
        n.textContent = i + 1;
        slot.appendChild(n);
      }

      el.photoGrid.appendChild(slot);
    }

    for (var b = 0; b < state.busyCaptures; b++) {
      var busySlot = document.createElement('div');
      busySlot.className = 'slot';
      busySlot.innerHTML = '<span class="slot__busy">Processing…</span>';
      el.photoGrid.appendChild(busySlot);
    }

    var count = state.photos.length;
    el.photoCounter.textContent = count + ' of ' + cfg.MAX_PHOTOS;
    el.photoCounter.classList.toggle('is-ok', count >= cfg.MIN_PHOTOS);
  }

  function onRemove(e) {
    var id = Number(e.currentTarget.dataset.id);
    var i = state.photos.findIndex(function (p) { return p.id === id; });
    if (i === -1) return;
    URL.revokeObjectURL(state.photos[i].url);
    state.photos.splice(i, 1);
    renderGrid();
    paintSubmit();
  }

  function slotsFree() {
    return cfg.MAX_PHOTOS - state.photos.length - state.busyCaptures;
  }

  function handleFiles(files) {
    if (!jobIsValid()) {
      flagJob();
      toast('Enter the job number first — it is stamped onto each photo.', true);
      return;
    }

    var list = Array.prototype.slice.call(files).filter(function (f) {
      return f && f.type.indexOf('image/') === 0;
    });
    if (!list.length) return;

    var free = slotsFree();
    if (list.length > free) {
      toast('Only ' + free + ' slot' + (free === 1 ? '' : 's') + ' left — extra photos ignored.', true);
      list = list.slice(0, free);
    }
    if (!list.length) return;

    var locate = cfg.STAMP_LOCATION
      ? window.ImageWork.currentLocation()
      : Promise.resolve(null);

    locate.then(function (loc) {
      list.forEach(function (file) {
        state.busyCaptures++;
        renderGrid();
        paintSubmit();

        var capturedAt = new Date(file.lastModified || Date.now());
        /* Guard against a bogus clock or a stale library file. */
        if (isNaN(capturedAt) || Math.abs(Date.now() - capturedAt) > 86400000) {
          capturedAt = new Date();
        }

        window.ImageWork.process(file, {
          jobNumber: jobNumber(),
          /* Reserve the number synchronously: several files can be processing
             at once when someone multi-selects from the library. */
          index: state.photos.length + state.busyCaptures,
          total: null,
          capturedAt: capturedAt,
          location: loc,
          maxEdge: cfg.MAX_IMAGE_EDGE,
          quality: cfg.JPEG_QUALITY
        }).then(function (out) {
          state.photos.push({
            id: nextId++,
            blob: out.blob,
            url: URL.createObjectURL(out.blob),
            capturedAt: out.capturedAt,
            location: loc,
            w: out.width,
            h: out.height,
            status: 'pending',
            progress: 0,
            error: null
          });
        }).catch(function (err) {
          toast(err.message || 'That photo could not be processed', true);
        }).then(function () {
          state.busyCaptures--;
          renderGrid();
          paintSubmit();
        });
      });
    });
  }

  el.takeBtn.addEventListener('click', function () {
    if (slotsFree() <= 0) { toast('All ' + cfg.MAX_PHOTOS + ' slots are full.'); return; }
    el.cameraInput.click();
  });

  el.pickBtn.addEventListener('click', function () {
    if (slotsFree() <= 0) { toast('All ' + cfg.MAX_PHOTOS + ' slots are full.'); return; }
    el.libraryInput.click();
  });

  [el.cameraInput, el.libraryInput].forEach(function (input) {
    input.addEventListener('change', function () {
      handleFiles(input.files);
      input.value = '';  // so re-picking the same file fires change again
    });
  });

  /* ---------------------------------------------------------- job box -- */

  function flagJob() {
    el.jobNumber.classList.add('is-error');
    el.jobHint.classList.add('is-error');
    el.jobHint.textContent = cfg.JOB_NUMBER_HELP;
  }

  el.jobNumber.addEventListener('input', function () {
    if (cfg.UPPERCASE_JOB_NUMBER) {
      var pos = el.jobNumber.selectionStart;
      el.jobNumber.value = el.jobNumber.value.toUpperCase();
      try { el.jobNumber.setSelectionRange(pos, pos); } catch (e) { /* unsupported */ }
    }
    el.jobNumber.classList.remove('is-error');
    el.jobHint.classList.remove('is-error');
    el.jobHint.textContent = 'Photos are filed in a folder named after this number.';
    paintSubmit();
  });

  el.jobNumber.addEventListener('blur', function () {
    if (jobNumber() && !jobIsValid()) flagJob();
  });

  /* --------------------------------------------------------- submit UI -- */

  function paintSubmit() {
    var ok = jobIsValid() &&
             state.photos.length >= cfg.MIN_PHOTOS &&
             state.busyCaptures === 0 &&
             !state.submitting;
    el.submitBtn.disabled = !ok;

    var need = cfg.MIN_PHOTOS - state.photos.length;
    el.submitHint.textContent =
      !jobIsValid()          ? 'Enter a job number to continue.' :
      state.busyCaptures     ? 'Processing photos…' :
      need > 0               ? 'Add ' + need + ' more photo' + (need === 1 ? '' : 's') +
                               ' (' + cfg.MIN_PHOTOS + '–' + cfg.MAX_PHOTOS + ' required).' :
      'Ready to submit ' + state.photos.length + ' photos.';
  }

  /* ------------------------------------------------------ steps panel -- */

  var stepEls = {};

  function buildSteps() {
    el.uploadSteps.innerHTML = '';
    stepEls = {};

    state.photos.forEach(function (p, i) {
      addStep('p' + p.id, 'Photo ' + (i + 1) + ' · ' + formatBytes(p.blob.size));
    });
    addStep('manifest', 'Job record');
    if (cfg.LOG_SHEET_ID) addStep('sheet', 'Log sheet entry');
  }

  function addStep(key, label) {
    var li = document.createElement('li');
    li.className = 'step';
    li.innerHTML =
      '<div class="step__body">' +
        '<div class="step__name"></div>' +
        '<div class="bar"><div class="bar__fill"></div></div>' +
      '</div>' +
      '<div class="step__state">Waiting</div>';
    li.querySelector('.step__name').textContent = label;
    el.uploadSteps.appendChild(li);
    stepEls[key] = li;
  }

  function setStep(key, status, text, progress) {
    var li = stepEls[key];
    if (!li) return;
    li.classList.toggle('step--done', status === 'done');
    li.classList.toggle('step--error', status === 'error');
    li.querySelector('.step__state').textContent = text;
    li.querySelector('.bar__fill').style.width =
      Math.round((status === 'done' ? 1 : (progress || 0)) * 100) + '%';
  }

  /* --------------------------------------------------------- submitting -- */

  el.submitBtn.addEventListener('click', function () {
    if (el.submitBtn.disabled) return;
    state.submissionId = window.ImageWork.fileStamp(new Date());

    /* Photos that already reached Drive are not re-sent — unless the job
       number changed since the last attempt, in which case they belong in a
       different folder and must go up again. */
    if (state.lastAttemptJob !== jobNumber()) {
      state.jobFolder = null;
      state.photos.forEach(function (p) {
        p.status = 'pending'; p.error = null; p.progress = 0; p.driveFile = null;
      });
    }
    state.lastAttemptJob = jobNumber();

    startSubmit();
  });

  el.retryBtn.addEventListener('click', startSubmit);

  el.backBtn.addEventListener('click', function () {
    state.submitting = false;
    paintSubmit();
    show('captureView');
  });

  function startSubmit() {
    state.submitting = true;
    paintSubmit();

    el.uploadJob.textContent = jobNumber();
    el.retryBtn.classList.add('hidden');
    el.backBtn.classList.add('hidden');
    buildSteps();
    state.photos.forEach(function (p) {
      setStep('p' + p.id, p.status === 'done' ? 'done' : '',
              p.status === 'done' ? 'Uploaded' : 'Waiting', 0);
    });
    show('uploadView');

    /* getToken must run inside the click's gesture window or the browser
       blocks the Google popup — hence connecting here, not lazily. */
    connect(true)
      .then(ensureJobFolder)
      .then(uploadPhotos)
      .then(writeRecord)
      .then(finish)
      .catch(function (err) {
        toast(err.message || 'Submission failed', true);
        el.retryBtn.classList.remove('hidden');
        el.backBtn.classList.remove('hidden');
        state.submitting = false;
        paintSubmit();
      });
  }

  function ensureJobFolder() {
    if (state.jobFolder) return state.jobFolder;
    return window.Cloud
      .ensureFolder(safeName(jobNumber()), cfg.DRIVE_PARENT_FOLDER_ID)
      .then(function (folder) { state.jobFolder = folder; return folder; })
      .catch(function (err) {
        throw new Error('Could not open the job folder in Drive: ' + err.message);
      });
  }

  /* Sequential, not parallel: mobile uplinks are the bottleneck and serial
     uploads give an honest per-photo progress bar. */
  function uploadPhotos() {
    var total = state.photos.length;

    return state.photos.reduce(function (chain, photo, i) {
      return chain.then(function () {
        if (photo.status === 'done') { setStep('p' + photo.id, 'done', 'Uploaded', 1); return; }

        var key = 'p' + photo.id;
        var name = 'JOB-' + safeName(jobNumber()) +
                   '__' + window.ImageWork.fileStamp(photo.capturedAt) +
                   '__p' + (i + 1) + 'of' + total + '.jpg';

        setStep(key, '', 'Uploading…', 0);

        return window.Cloud.uploadFile({
          name: name,
          blob: photo.blob,
          parents: state.jobFolder.id,
          description: 'Job ' + jobNumber() + ' — photo ' + (i + 1) + ' of ' + total +
                       ' — taken ' + window.ImageWork.stampTime(photo.capturedAt),
          appProperties: {
            jobNumber: jobNumber(),
            capturedAt: photo.capturedAt.toISOString(),
            photoIndex: String(i + 1),
            photoCount: String(total),
            app: 'job-photo-capture'
          },
          onProgress: function (f) {
            setStep(key, '', Math.round(f * 100) + '%', f);
          }
        }).then(function (file) {
          photo.status = 'done';
          photo.driveFile = file;
          photo.name = name;
          setStep(key, 'done', 'Uploaded', 1);
        }).catch(function (err) {
          photo.status = 'error';
          photo.error = err.message;
          setStep(key, 'error', err.message, photo.progress);
          throw new Error('Photo ' + (i + 1) + ' failed: ' + err.message);
        });
      });
    }, Promise.resolve());
  }

  function writeRecord() {
    var submittedAt = new Date();
    var record = {
      jobNumber: jobNumber(),
      submittedAt: submittedAt.toISOString(),
      submittedAtLocal: window.ImageWork.stampTime(submittedAt),
      submittedBy: paintAuth.email || null,
      notes: el.notes.value.trim() || null,
      photoCount: state.photos.length,
      folderId: state.jobFolder.id,
      folderLink: state.jobFolder.webViewLink || null,
      photos: state.photos.map(function (p, i) {
        return {
          index: i + 1,
          fileName: p.name,
          fileId: p.driveFile && p.driveFile.id,
          capturedAt: p.capturedAt.toISOString(),
          capturedAtLocal: window.ImageWork.stampTime(p.capturedAt),
          width: p.w,
          height: p.h,
          bytes: p.blob.size,
          location: p.location || null
        };
      }),
      userAgent: navigator.userAgent
    };

    setStep('manifest', '', 'Writing…', 0.5);

    return window.Cloud.uploadJson(
      'JOB-' + safeName(jobNumber()) + '__submission-' + state.submissionId + '.json',
      record,
      state.jobFolder.id
    ).then(function () {
      setStep('manifest', 'done', 'Saved', 1);
    }).catch(function (err) {
      /* The photos are already safe in Drive — a missing manifest must not
         present as a failed submission. */
      setStep('manifest', 'error', 'Not saved: ' + err.message, 1);
    }).then(function () {
      if (!cfg.LOG_SHEET_ID) return record;
      setStep('sheet', '', 'Writing…', 0.5);
      return window.Cloud.appendLogRow([
        record.submittedAtLocal,
        record.jobNumber,
        record.photoCount,
        record.submittedBy || '',
        record.folderLink || '',
        record.photos.map(function (p) { return p.fileName; }).join('\n'),
        record.notes || ''
      ]).then(function () {
        setStep('sheet', 'done', 'Logged', 1);
        return record;
      }).catch(function (err) {
        setStep('sheet', 'error', 'Not logged: ' + err.message, 1);
        return record;
      });
    });
  }

  function finish(record) {
    saveRecent({
      job: record.jobNumber,
      at: record.submittedAt,
      count: record.photoCount,
      link: record.folderLink
    });

    el.doneJob.textContent = record.jobNumber;
    el.doneSummary.textContent =
      record.photoCount + ' photos filed at ' + record.submittedAtLocal +
      (record.submittedBy ? ' by ' + record.submittedBy : '') + '.';

    if (record.folderLink) {
      el.doneLink.href = record.folderLink;
      el.doneLink.classList.remove('hidden');
    } else {
      el.doneLink.classList.add('hidden');
    }

    state.submitting = false;
    show('doneView');
  }

  el.nextBtn.addEventListener('click', function () {
    state.photos.forEach(function (p) { URL.revokeObjectURL(p.url); });
    state.photos = [];
    state.jobFolder = null;
    state.submissionId = null;
    state.lastAttemptJob = null;
    el.jobNumber.value = '';
    el.notes.value = '';
    renderGrid();
    renderRecent();
    paintSubmit();
    show('captureView');
    el.jobNumber.focus();
  });

  /* ----------------------------------------------------------- recent -- */

  function readRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; }
    catch (e) { return []; }
  }

  function saveRecent(entry) {
    try {
      var list = readRecent();
      list.unshift(entry);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)));
    } catch (e) { /* private mode / quota — not worth interrupting the user */ }
  }

  function renderRecent() {
    var list = readRecent();
    el.recentCard.classList.toggle('hidden', !list.length);
    el.recentList.innerHTML = '';

    list.forEach(function (r) {
      var li = document.createElement('li');

      var job = document.createElement('span');
      job.className = 'recent__job';
      job.textContent = r.job;

      var when = document.createElement('span');
      when.className = 'recent__when';
      var d = new Date(r.at);
      when.textContent = (isNaN(d) ? '' : d.toLocaleString()) + ' · ' + r.count + ' photos';

      li.appendChild(job);
      li.appendChild(when);

      if (r.link) {
        var a = document.createElement('a');
        a.href = r.link;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = 'Open';
        li.appendChild(a);
      }

      el.recentList.appendChild(li);
    });
  }

  el.clearRecent.addEventListener('click', function () {
    try { localStorage.removeItem(RECENT_KEY); } catch (e) { /* ignore */ }
    renderRecent();
  });

  /* ------------------------------------------------------------- boot -- */

  window.addEventListener('beforeunload', function (e) {
    if (state.photos.length || state.submitting) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  function boot() {
    document.title = cfg.ORG_NAME;
    el.orgName.textContent = cfg.ORG_NAME;
    el.jobNumber.setAttribute('pattern', cfg.JOB_NUMBER_PATTERN);

    renderGrid();
    renderRecent();
    paintSubmit();
    paintAuth();

    if (!checkConfig()) {
      el.submitBtn.disabled = true;
      el.authBtn.disabled = true;
      return;
    }

    /* Try to restore the session silently so staff are not asked to sign in
       on every job. Failure here is normal and silent. */
    connect(false).catch(function () {});

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    }
  }

  boot();
})();
