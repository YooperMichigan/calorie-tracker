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

    instance = new Html5Qrcode(elementId, { formatsToSupport: FORMATS, verbose: false });
    let fired = false;
    let frameCount = 0;

    try {
      await instance.start(
        // `ideal` (not a bare string) so cameras that don't report a
        // "environment"-facing lens — like a fixed iMac/laptop webcam —
        // still get picked instead of failing to start.
        { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        // No qrbox: scans the full video frame instead of requiring the
        // barcode to be aligned inside a small on-screen box, which is a
        // common reason scanning silently "does nothing."
        { fps: 10 },
        (decodedText) => {
          if (fired) return;
          fired = true;
          onDetected(decodedText);
        },
        (errorMessage) => {
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
        }
      );
      running = true;
      if (onDiag) onDiag({ started: true });
    } catch (err) {
      running = false;
      const msg = (err && err.toString().toLowerCase().includes("permission"))
        ? "Camera permission denied. Enable camera access for this site in Settings."
        : "Couldn't start the camera. Your browser may not support camera access here.";
      onError(msg);
    }
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
