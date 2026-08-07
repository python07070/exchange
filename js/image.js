/* ------------------------------------------------------------------------
 * image.js — decode, downscale and stamp a captured photo.
 *
 * The stamp is burned into the pixels on purpose: EXIF is stripped by many
 * viewers and by Drive's preview, so a visible banner is the only thing that
 * survives being screenshotted, printed or pasted into a report.
 * --------------------------------------------------------------------- */

window.ImageWork = (function () {
  'use strict';

  /* Decode via <img>. Browsers apply EXIF orientation to <img> by default
     (image-orientation: from-image), so drawing it to a canvas yields an
     upright bitmap without parsing EXIF ourselves. */
  function decode(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        if (!img.naturalWidth) { reject(new Error('Image has no dimensions')); return; }
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('That file could not be read as an image'));
      };
      img.src = url;
    });
  }

  function toBlob(canvas, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        blob ? resolve(blob) : reject(new Error('Could not encode the image'));
      }, 'image/jpeg', quality);
    });
  }

  /* Local time as "2026-08-07 14:32:10 UTC+10" — unambiguous on paper. */
  function stampTime(date) {
    var p = function (n) { return String(n).padStart(2, '0'); };
    var mins = -date.getTimezoneOffset();
    var sign = mins < 0 ? '-' : '+';
    var abs = Math.abs(mins);
    var off = sign + Math.floor(abs / 60) + (abs % 60 ? ':' + p(abs % 60) : '');
    return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate()) +
           ' ' + p(date.getHours()) + ':' + p(date.getMinutes()) + ':' + p(date.getSeconds()) +
           ' UTC' + off;
  }

  /* Compact filename fragment: 20260807-143210 */
  function fileStamp(date) {
    var p = function (n) { return String(n).padStart(2, '0'); };
    return '' + date.getFullYear() + p(date.getMonth() + 1) + p(date.getDate()) +
           '-' + p(date.getHours()) + p(date.getMinutes()) + p(date.getSeconds());
  }

  function drawBanner(ctx, w, h, lines, rightText) {
    /* Scale everything off image width so the stamp looks the same on a
       4000px DSLR shot and a 1200px phone shot. */
    var pad  = Math.round(w * 0.018);
    var size = Math.max(13, Math.round(w * 0.026));
    var lh   = Math.round(size * 1.32);
    var bandH = lh * lines.length + pad * 1.6;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
    ctx.fillRect(0, h - bandH, w, bandH);

    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = Math.max(2, Math.round(size * 0.18));

    var y = h - bandH + pad * 0.8;
    lines.forEach(function (line, i) {
      ctx.font = (i === 0 ? '700 ' : '400 ') + size + 'px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
      ctx.fillStyle = i === 0 ? '#ffffff' : 'rgba(255, 255, 255, 0.92)';
      ctx.textAlign = 'left';
      ctx.fillText(line, pad, y + i * lh);
    });

    if (rightText) {
      ctx.font = '600 ' + size + 'px -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.textAlign = 'right';
      ctx.fillText(rightText, w - pad, y);
    }

    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
  }

  /**
   * @param {File}   file
   * @param {Object} opts  {jobNumber, index, total, capturedAt:Date, location, maxEdge, quality}
   * @returns {Promise<{blob:Blob, width:number, height:number, capturedAt:Date}>}
   */
  function process(file, opts) {
    return decode(file).then(function (img) {
      var maxEdge = opts.maxEdge || 2000;
      var scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
      var w = Math.max(1, Math.round(img.naturalWidth * scale));
      var h = Math.max(1, Math.round(img.naturalHeight * scale));

      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;

      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);

      var lines = [
        'JOB ' + opts.jobNumber,
        stampTime(opts.capturedAt)
      ];
      if (opts.location) {
        lines.push(
          opts.location.lat.toFixed(5) + ', ' + opts.location.lng.toFixed(5) +
          (opts.location.accuracy ? '  ±' + Math.round(opts.location.accuracy) + 'm' : '')
        );
      }

      /* The set size is not known until submit, so only show "of N" when the
         caller actually knows it. */
      drawBanner(ctx, w, h, lines,
        'Photo ' + opts.index + (opts.total ? ' of ' + opts.total : ''));

      return toBlob(canvas, opts.quality || 0.85).then(function (blob) {
        return { blob: blob, width: w, height: h, capturedAt: opts.capturedAt };
      });
    });
  }

  /* Resolves to null rather than rejecting — a missing fix must never block
     a capture. */
  function currentLocation(timeoutMs) {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          });
        },
        function () { resolve(null); },
        { enableHighAccuracy: true, timeout: timeoutMs || 8000, maximumAge: 60000 }
      );
    });
  }

  return {
    process: process,
    currentLocation: currentLocation,
    stampTime: stampTime,
    fileStamp: fileStamp
  };
})();
