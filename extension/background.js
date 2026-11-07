// ScamShield browser extension: the right-click menu.
//
// Right-click selected text, a link, a picture or a video and choose
// "Check with ScamShield". We fetch what was clicked, open ScamShield
// (running on this laptop) in a new tab, and hand the item to that tab in
// chunks; the page then runs its normal check.

const APP = "http://localhost:3000";
const MAX_BYTES = 50 * 1024 * 1024; // same limit as the app's video upload
const CHUNK = 4 * 1024 * 1024; // base64 characters per message

// tabId -> { status: "pending" | "ready" | "error", item, base64 }
const pending = new Map();

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "scamshield-check",
      title: "Check with ScamShield",
      contexts: ["selection", "link", "image", "video", "page"],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "scamshield-check") return;
  const target = await chrome.tabs.create({ url: `${APP}/?from=extension`, index: (tab?.index ?? 0) + 1 });
  pending.set(target.id, { status: "pending" });
  try {
    const result = await collect(info, tab);
    pending.set(target.id, { status: "ready", ...result });
  } catch (error) {
    pending.set(target.id, {
      status: "ready",
      item: { kind: "text", text: fallbackText(info, tab, error) },
      base64: "",
    });
  }
});

function pageContext(tab) {
  if (!tab?.url || !/^https?:/.test(tab.url)) return "";
  return `It was found on the web page "${tab.title || tab.url}" (${tab.url}).`;
}

function fallbackText(info, tab) {
  const what = info.srcUrl ? `a ${info.mediaType || "file"} at ${info.srcUrl}` : "something on a web page";
  return `The person right-clicked ${what} to check it, but it could not be downloaded. ${pageContext(tab)}`.trim();
}

async function collect(info, tab) {
  const context = pageContext(tab);

  if (info.mediaType === "image" && info.srcUrl) {
    const file = await download(info.srcUrl, "image/");
    return {
      item: {
        kind: "image",
        mime: file.mime,
        name: fileName(info.srcUrl, "picture"),
        text: `The person right-clicked this picture to check if it is a scam. ${context}`.trim(),
      },
      base64: file.base64,
    };
  }

  if (info.mediaType === "video") {
    // A real video file (mp4 on a news site, in webmail, etc.) gets the full
    // video check. Streaming players (YouTube and similar) have no file to
    // download, so take a picture of the frame on screen instead.
    if (info.srcUrl && /^https?:/.test(info.srcUrl)) {
      try {
        const file = await download(info.srcUrl, "video/");
        return {
          item: {
            kind: "video",
            mime: file.mime,
            name: fileName(info.srcUrl, "video.mp4"),
            text: `The person right-clicked this video to check if it is a scam or made by AI. ${context}`.trim(),
          },
          base64: file.base64,
        };
      } catch {
        // fall through to the frame snapshot
      }
    }
    const frame = await snapshotVideo(tab, info);
    if (frame) {
      return {
        item: {
          kind: "image",
          mime: "image/jpeg",
          name: "video-frame.jpg",
          text: `This is a picture of the frame on screen from a streaming video the person right-clicked. The video file itself could not be downloaded, so only this frame and the page can be checked. ${context}`.trim(),
        },
        base64: frame,
      };
    }
    throw new Error("video unavailable");
  }

  if (info.selectionText) {
    const link = info.linkUrl ? `\n\nLink in it: ${info.linkUrl}` : "";
    return { item: { kind: "text", text: `${info.selectionText}${link}` }, base64: "" };
  }

  if (info.linkUrl) {
    return {
      item: { kind: "text", text: `Is this link safe to open? ${info.linkUrl}\n\n${context}`.trim() },
      base64: "",
    };
  }

  return {
    item: { kind: "text", text: `Is this web page a scam? "${tab?.title || ""}" ${tab?.url || ""}`.trim() },
    base64: "",
  };
}

function fileName(url, fallback) {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last).slice(0, 120) : fallback;
  } catch {
    return fallback;
  }
}

async function download(url, kindPrefix) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const mime = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!mime.startsWith(kindPrefix)) throw new Error(`not ${kindPrefix}`);
  const size = Number(response.headers.get("content-length") || 0);
  if (size > MAX_BYTES) throw new Error("too large");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) throw new Error("bad size");
  return { mime, base64: toBase64(new Uint8Array(buffer)) };
}

function toBase64(bytes) {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

// Draw the visible frame of the clicked (or largest playing) video to a
// canvas inside the page. Returns base64 JPEG, or null if the page blocks it.
async function snapshotVideo(tab, info) {
  if (!tab?.id) return null;
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [info.frameId ?? 0] },
      args: [info.srcUrl || ""],
      func: (src) => {
        const videos = [...document.querySelectorAll("video")];
        const video =
          videos.find((v) => src && (v.currentSrc === src || v.src === src)) ||
          videos.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
        if (!video || !video.videoWidth) return null;
        const scale = Math.min(1, 1024 / video.videoWidth);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        try {
          canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
        } catch {
          return null; // cross-origin video: the browser will not let us read it
        }
      },
    });
    return result?.result || null;
  } catch {
    return null;
  }
}

// The ScamShield tab asks for its item piece by piece.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "scamshield-get" || !sender.tab?.id) return;
  const entry = pending.get(sender.tab.id);
  if (!entry) {
    sendResponse({ status: "none" });
    return;
  }
  if (entry.status !== "ready") {
    sendResponse({ status: "pending" });
    return;
  }
  const offset = message.offset || 0;
  const chunk = entry.base64.slice(offset, offset + CHUNK);
  const done = offset + CHUNK >= entry.base64.length;
  sendResponse({ status: "ready", item: entry.item, chunk, done, total: entry.base64.length });
  if (done) pending.delete(sender.tab.id);
});

chrome.tabs.onRemoved.addListener((tabId) => pending.delete(tabId));
