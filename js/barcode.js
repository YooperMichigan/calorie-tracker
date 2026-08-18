// Thin wrapper around the vendored html5-qrcode library for UPC/EAN barcode scanning.
// html5-qrcode uses getUserMedia under the hood, which iOS Safari only allows on
// secure origins (https://, or http://localhost) — see the "Testing locally" note
// in the README/setup instructions.

const BarcodeScanner = (() => {
  let instance = null;
  let running = false;

  // Broad format list: grocery items most commonly carry EAN-13/UPC-A, but
  // this covers other 1D formats too so an unusual barcode isn't silently
  // ignored (formatsToSupport is an allow-list — anything left off it never
  // triggers a detection, with no error shown).
  const FORMATS = (window.Html5QrcodeSupportedFormats && [
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.CODE_93,
    Html5QrcodeSupportedFormats.CODABAR,
    Html5QrcodeSupportedFormats.ITF,
  ]) || undefined;

  async function start(elementId, onDetected, onError, onDiag) {
    if (typeof Html5Qrcode === "undefined") {
      onError("Barcode scanner failed to load.");
      return;
    }
    if (running) await stop();

    let fired = false;
    let frameCount = 0;

    const successCallback = (decodedText) => {
      if (fired) return;
      fired = true;
      onDetected(decodedText);
    };
    const decodeFailCallback = (errorMessage) => {
      // Fires on every frame where no code was found — this is normal,
      // expected noise, not a real error. Surfaced here only so we can
      // confirm the decode loop is actually running.
      frameCount++;
      if (onDiag && frameCount % 8 === 0) {
        const videoEl = document.querySelector(`#${elementId} video`);
        onDiag({
          running: true,
          frameCount,
          lastMessage: errorMessage,
          videoWidth: videoEl ? videoEl.videoWidth : 0,
          videoHeight: videoEl ? videoEl.videoHeight : 0,
          videoReadyState: videoEl ? videoEl.readyState : -1,
        });
      }
    };

    // Try the standard mobile pattern first (plain "environment" string —
    // the form used in virtually every html5-qrcode example and known to
    // work on iOS Safari), requesting a sharper stream since 1D barcodes
    // need real resolution to decode reliably. width/height are `ideal`
    // (soft) constraints so they can't cause a hard start failure the way
    // `exact` would. If rejected (e.g. a desktop webcam with no
    // rear-facing lens, like an iMac), fall back to the front camera —
    // html5-qrcode requires a camera-selector key (facingMode or deviceId)
    // in this object; passing {} throws its own confusing validation error
    // ("should have exactly 1 key, found 0") that masks whatever the real
    // problem was.
    const attempts = [
      { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
      { facingMode: "environment" },
      { facingMode: "user" },
    ];

    let lastErr = null;
    for (const cameraConfig of attempts) {
      // A fresh instance per attempt — reusing one Html5Qrcode across
      // multiple start() calls can leave its internal state machine
      // mid-transition after a failed attempt, so the next start() fails
      // with "Cannot transition to a new state, already under transition"
      // even though the camera itself would have been fine.
      const attemptInstance = new Html5Qrcode(elementId, { formatsToSupport: FORMATS, verbose: false });
      try {
        await attemptInstance.start(cameraConfig, { fps: 10 }, successCallback, decodeFailCallback);
        instance = attemptInstance;
        running = true;
        if (onDiag) onDiag({ started: true, cameraConfig });
        return;
      } catch (err) {
        lastErr = err;
        try { await attemptInstance.stop(); } catch (e) { /* never started */ }
        try { attemptInstance.clear(); } catch (e) { /* nothing to clear */ }
      }
    }

    running = false;
    const raw = lastErr ? `${lastErr.name || ""} ${lastErr.message || lastErr}`.trim() : "Unknown error";
    const lower = raw.toLowerCase();
    const msg = (lower.includes("permission") || lower.includes("notallowed") || lower.includes("denied"))
      ? `Camera permission denied. Enable camera access for this site in Settings. (${raw})`
      : `Couldn't start the camera: ${raw}`;
    onError(msg);
  }

  async function stop() {
    if (!instance || !running) {
      running = false;
      return;
    }
    try {
      await instance.stop();
      instance.clear();
    } catch (e) { /* already stopped */ }
    running = false;
    instance = null;
  }

  return { start, stop };
})();
