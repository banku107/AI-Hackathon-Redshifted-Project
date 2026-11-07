// Runs only on the ScamShield app (localhost:3000). When the tab was opened
// by the right-click menu (?from=extension), fetch the clicked item from the
// extension in chunks and hand it to the page, which starts the check.

(async () => {
  if (new URLSearchParams(location.search).get("from") !== "extension") return;

  const ask = (offset) =>
    new Promise((resolve) => chrome.runtime.sendMessage({ type: "scamshield-get", offset }, resolve));

  // Wait for the extension to finish downloading (up to about 60 s).
  let first;
  for (let i = 0; i < 120; i++) {
    first = await ask(0);
    if (!first || first.status !== "pending") break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!first || first.status !== "ready") return;

  let base64 = first.chunk;
  let response = first;
  while (!response.done) {
    response = await ask(base64.length);
    if (!response || response.status !== "ready") return;
    base64 += response.chunk;
  }

  let bytes = null;
  if (base64) {
    const binary = atob(base64);
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  }

  const payload = { source: "scamshield-extension", item: first.item, bytes: bytes ? bytes.buffer : null };
  const send = () => window.postMessage(payload, location.origin, bytes ? [payload.bytes] : []);

  // The page says when its listener is attached; it may hydrate after us.
  let sent = false;
  window.addEventListener("message", (event) => {
    if (sent || event.source !== window || event.data?.source !== "scamshield-page-ready") return;
    sent = true;
    send();
  });
  window.postMessage({ source: "scamshield-extension-hello" }, location.origin);
})();
