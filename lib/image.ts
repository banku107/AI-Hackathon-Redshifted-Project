// Turns a picture the reader picked into the contract's InputImage.
//
// Two rules from the contract: no "data:" prefix in the base64, and the
// screenshots stay small. A phone camera photo is 4-8 MB; 1600px and JPEG keeps
// the agent's vision input sharp without sending the whole file.

import type { InputImage } from "./contract";

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

/** Splits a data URL into the media type and the bare base64 payload. */
export function splitDataUrl(dataUrl: string): {
  mediaType: InputImage["mediaType"];
  base64: string;
} {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("That picture is not in a format we can read.");
  }
  return {
    mediaType: match[1] as InputImage["mediaType"],
    base64: match[2],
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("We could not open that picture. Try another one."));
    };
    image.src = url;
  });
}

export async function fileToInputImage(file: File): Promise<InputImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose a picture, not another kind of file.");
  }

  const image = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser blocked the picture.");

  // White behind the picture: a transparent PNG becomes a black rectangle in
  // JPEG otherwise, and the agent then reads a dark image.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  return splitDataUrl(dataUrl);
}

/** Same conversion for a data URL, for the frames pulled out of a video. */
export function dataUrlToInputImage(dataUrl: string): InputImage {
  return splitDataUrl(dataUrl);
}
