# ScamShield browser extension

Right-click a message, link, picture or video on any web page and choose
**Check with ScamShield**. ScamShield opens in a new tab and checks it.

## Install (Chrome or Edge, about 1 minute)

1. Start ScamShield on this laptop: `npm run dev` (or the pm2 background setup).
2. Open `chrome://extensions` (Edge: `edge://extensions`).
3. Turn on **Developer mode** (top right in Chrome, left side in Edge).
4. Click **Load unpacked** and pick this `extension` folder.
5. Pin it if you like. That's it.

After you change a file in this folder, click the reload arrow on the
ScamShield card in `chrome://extensions`.

## What each right-click does

| You right-click | ScamShield checks |
| --- | --- |
| Selected text | The text (and any link you right-clicked inside it) |
| A link | Whether the link is safe to open |
| A picture | The picture, plus which page it was on |
| A video file (mp4/webm on a page or in webmail) | The full video check: frames, file details, the free AI detector |
| A streaming video (YouTube and similar) | A picture of the frame on screen, plus the page. These sites do not expose the video file |
| An empty part of a page | The page itself (title and address) |

## Notes

- The extension talks only to ScamShield at `http://localhost:3000`. Pictures
  and videos are downloaded by the extension and handed to that tab; nothing
  goes anywhere else until ScamShield sends it to the checker.
- It asks for access to all sites so it can download the picture or video you
  right-click. It does nothing until you choose "Check with ScamShield".
- Some sites block downloads or canvas snapshots. Then ScamShield checks the
  page address and title instead and says so.
