// Runs only on the ScamShield app (localhost:3000). When the tab was opened
// by the right-click menu (?from=extension), fetch the clicked item from the
// extension in chunks and hand it to the page, which starts the check.

(async () => {
  if (new URLSearchParams(location.search).get("from") !== "extension") return;

  const ask = (offset) =>
    new Promise((resolve) => chrome.runtime.sendMessage({ type: "scamshield-get", offset }, resolve));

  // The page may finish loading after us, so every message waits until the
  // page says its listener is attached ("scamshield-page-ready").
  const pageReady = new Promise((resolve) => {
    const onMessage = (event) => {
      if (event.source !== window || event.data?.source !== "scamshield-page-ready") return;
      window.removeEventListener("message", onMessage);
      resolve();
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "scamshield-extension-hello" }, location.origin);
  });

  // Tell the page when nothing is coming, so it can say so instead of
  // sitting on an empty form.
  const fail = async () => {
    await pageReady;
    window.postMessage({ source: "scamshield-extension-failed" }, location.origin);
  };

  // Wait for the extension to finish downloading (up to 3 minutes: a 50 MB
  // video on a slow connection takes a while).
  let first;
  for (let i = 0; i < 360; i++) {
    first = await ask(0);
    if (!first || first.status !== "pending") break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!first || first.status !== "ready") return fail();

  let base64 = first.chunk;
  let response = first;
  while (!response.done) {
    response = await ask(base64.length);
    if (!response || response.status !== "ready") return fail();
    base64 += response.chunk;
  }

  let bytes = null;
  if (base64) {
    const binary = atob(base64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  }

  const payload = { source: "scamshield-extension", item: first.item, bytes: bytes ? bytes.buffer : null };
  await pageReady;
  window.postMessage(payload, location.origin, bytes ? [payload.bytes] : []);
})();
