import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, extname, join, resolve } from "node:path";
import { resolveDataPath, sendJson, sendText } from "./shared-state-store.mjs";

const maxMediaPayloadBytes = 24 * 1024 * 1024;
const mediaDir = resolveDataPath("media");
const allowedMimeTypes = new Map([
  ["image/gif", { extension: ".gif", kind: "image" }],
  ["image/jpeg", { extension: ".jpg", kind: "image" }],
  ["image/png", { extension: ".png", kind: "image" }],
  ["image/webp", { extension: ".webp", kind: "image" }],
  ["video/mp4", { extension: ".mp4", kind: "video" }],
  ["video/ogg", { extension: ".ogv", kind: "video" }],
  ["video/webm", { extension: ".webm", kind: "video" }],
  ["audio/mpeg", { extension: ".mp3", kind: "audio" }],
  ["audio/ogg", { extension: ".ogg", kind: "audio" }],
  ["audio/wav", { extension: ".wav", kind: "audio" }],
  ["audio/webm", { extension: ".weba", kind: "audio" }],
]);

export async function handleMediaUpload(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendText(response, 405, "Method not allowed");
    return;
  }

  try {
    const body = JSON.parse(await readRequestBody(request, maxMediaPayloadBytes) || "{}");
    const attachment = await saveMediaAttachment(body);
    sendJson(response, { attachment }, 201);
  } catch (error) {
    const message = error instanceof MediaValidationError ? error.message : "Media upload error";
    sendText(response, error instanceof MediaValidationError ? error.statusCode : 500, message);
  }
}

export async function readMediaFile(pathname) {
  const fileName = basename(pathname);
  if (!fileName || fileName !== pathname.split("/").at(-1)) return null;

  const filePath = resolve(mediaDir, fileName);
  if (!filePath.startsWith(mediaDir)) return null;

  const extension = extname(filePath).toLowerCase();
  const contentType = findContentType(extension);
  if (!contentType) return null;

  try {
    return {
      bytes: await readFile(filePath),
      contentType,
    };
  } catch {
    return null;
  }
}

async function saveMediaAttachment(body) {
  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
  const name = sanitizeFileName(typeof body.name === "string" ? body.name : "media");
  const requestedType = typeof body.type === "string" ? body.type : "";
  const declaredSize = Number(body.size) || 0;
  const parsed = parseDataUrl(dataUrl);
  const allowed = allowedMimeTypes.get(parsed.mimeType);

  if (!allowed) throw new MediaValidationError(415, "Unsupported media type");
  if (requestedType && requestedType !== allowed.kind) throw new MediaValidationError(400, "Media type mismatch");
  if (parsed.bytes.byteLength > maxMediaPayloadBytes) throw new MediaValidationError(413, "Media file is too large");
  if (declaredSize > 0 && Math.abs(declaredSize - parsed.bytes.byteLength) > 1024) {
    throw new MediaValidationError(400, "Media size mismatch");
  }

  const id = randomUUID();
  const fileName = `${id}${allowed.extension}`;
  await mkdir(mediaDir, { recursive: true });
  await writeFile(resolve(mediaDir, fileName), parsed.bytes);

  return {
    id,
    name,
    size: parsed.bytes.byteLength,
    type: allowed.kind,
    url: `/media/${fileName}`,
  };
}

function parseDataUrl(value) {
  const match = /^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i.exec(value);
  if (!match) throw new MediaValidationError(400, "Invalid media payload");

  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (bytes.byteLength === 0) throw new MediaValidationError(400, "Empty media file");

  return {
    bytes,
    mimeType: match[1].toLowerCase(),
  };
}

function sanitizeFileName(name) {
  return name
    .replace(/[^\p{L}\p{N}._ -]/gu, "")
    .trim()
    .slice(0, 96) || "media";
}

function findContentType(extension) {
  for (const [mimeType, value] of allowedMimeTypes) {
    if (value.extension === extension) return mimeType;
  }
  return null;
}

async function readRequestBody(request, maxBytes) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    let bytes = 0;

    request.on("data", (chunk) => {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        reject(new MediaValidationError(413, "Media payload is too large"));
        request.destroy();
        return;
      }

      body += chunk.toString("utf8");
    });
    request.on("end", () => resolveBody(body));
    request.on("error", reject);
  });
}

class MediaValidationError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}
