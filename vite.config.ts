import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, extname, resolve } from "node:path";
import { initialState } from "./src/data";
import { sanitizeSocialState } from "./src/storage";
import type { SocialState } from "./src/types";

type SharedStatePayload = {
  state: SocialState;
  version: number;
};

const sharedStateFile = resolve(".local/social-state.json");
const mediaDir = resolve(".local/media");
const maxRequestBodyBytes = 6 * 1024 * 1024;
const maxMediaPayloadBytes = 24 * 1024 * 1024;
const allowedMediaTypes = new Map([
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

async function readRequestBody(
  request: import("node:http").IncomingMessage,
  maxBytes = maxRequestBodyBytes,
): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let body = "";
    let bytes = 0;

    request.on("data", (chunk: Buffer) => {
      bytes += chunk.byteLength;
      if (bytes > maxBytes) {
        reject(new Error("Request payload is too large"));
        request.destroy();
        return;
      }

      body += chunk.toString("utf8");
    });
    request.on("end", () => resolveBody(body));
    request.on("error", reject);
  });
}

async function readSharedState(): Promise<SharedStatePayload> {
  try {
    const raw = await readFile(sharedStateFile, "utf8");
    const parsed = JSON.parse(raw) as SharedStatePayload;
    if (!parsed.state || !Number.isFinite(parsed.version)) {
      throw new Error("Invalid shared state");
    }
    return {
      state: sanitizeSocialState(parsed.state),
      version: parsed.version,
    };
  } catch {
    const payload: SharedStatePayload = {
      state: sanitizeSocialState(initialState),
      version: Date.now(),
    };
    await writeSharedState(payload);
    return payload;
  }
}

async function writeSharedState(payload: SharedStatePayload): Promise<void> {
  const safePayload: SharedStatePayload = {
    state: sanitizeSocialState(payload.state),
    version: payload.version,
  };
  const tempFile = `${sharedStateFile}.${process.pid}.${Date.now()}.tmp`;
  await mkdir(dirname(sharedStateFile), { recursive: true });
  await writeFile(tempFile, JSON.stringify(safePayload, null, 2), "utf8");
  await rename(tempFile, sharedStateFile);
}

function sendJson(response: import("node:http").ServerResponse, payload: unknown, statusCode = 200): void {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function hasTrustedOrigin(request: import("node:http").IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  const host = request.headers["x-forwarded-host"] ?? request.headers.host ?? "127.0.0.1:5173";
  const proto = request.headers["x-forwarded-proto"] ?? "http";
  return origin === `${proto}://${host}`;
}

async function saveMedia(body: { dataUrl?: string; name?: string; size?: number; type?: string }) {
  const parsed = parseDataUrl(typeof body.dataUrl === "string" ? body.dataUrl : "");
  const allowed = allowedMediaTypes.get(parsed.mimeType);
  if (!allowed) throw new Error("Unsupported media type");
  if (body.type && body.type !== allowed.kind) throw new Error("Media type mismatch");

  const declaredSize = Number(body.size) || 0;
  if (parsed.bytes.byteLength > maxMediaPayloadBytes) throw new Error("Media file is too large");
  if (declaredSize > 0 && Math.abs(declaredSize - parsed.bytes.byteLength) > 1024) {
    throw new Error("Media size mismatch");
  }

  const id = randomUUID();
  const fileName = `${id}${allowed.extension}`;
  await mkdir(mediaDir, { recursive: true });
  await writeFile(resolve(mediaDir, fileName), parsed.bytes);

  return {
    id,
    name: sanitizeFileName(body.name ?? "media"),
    size: parsed.bytes.byteLength,
    type: allowed.kind,
    url: `/media/${fileName}`,
  };
}

function parseDataUrl(value: string): { bytes: Buffer; mimeType: string } {
  const match = /^data:([^;,]+);base64,([a-z0-9+/=\s]+)$/i.exec(value);
  if (!match) throw new Error("Invalid media payload");

  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (bytes.byteLength === 0) throw new Error("Empty media file");

  return {
    bytes,
    mimeType: match[1].toLowerCase(),
  };
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^\p{L}\p{N}._ -]/gu, "")
    .trim()
    .slice(0, 96) || "media";
}

function findMediaContentType(pathname: string): string | null {
  const extension = extname(pathname).toLowerCase();
  for (const [mimeType, value] of allowedMediaTypes) {
    if (value.extension === extension) return mimeType;
  }
  return null;
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "kotleta-shared-state",
      configureServer(server) {
        server.middlewares.use("/api/media", async (request, response) => {
          try {
            if (request.method !== "POST") {
              response.statusCode = 405;
              response.setHeader("Allow", "POST");
              response.end("Method not allowed");
              return;
            }

            if (!hasTrustedOrigin(request)) {
              response.statusCode = 403;
              response.end("Forbidden origin");
              return;
            }

            const rawBody = await readRequestBody(request, maxMediaPayloadBytes);
            const attachment = await saveMedia(JSON.parse(rawBody || "{}"));
            sendJson(response, { attachment }, 201);
          } catch (error) {
            server.config.logger.error(error instanceof Error ? error.message : String(error));
            response.statusCode = 400;
            response.end("Media upload error");
          }
        });

        server.middlewares.use("/media/", async (request, response) => {
          try {
            const url = new URL(request.url ?? "/", "http://127.0.0.1");
            const fileName = basename(url.pathname);
            const contentType = findMediaContentType(fileName);
            if (!fileName || !contentType) {
              response.statusCode = 404;
              response.end("Not found");
              return;
            }

            const filePath = resolve(mediaDir, fileName);
            if (!filePath.startsWith(mediaDir)) {
              response.statusCode = 403;
              response.end("Forbidden");
              return;
            }

            const bytes = await readFile(filePath);
            response.statusCode = 200;
            response.setHeader("Content-Type", contentType);
            response.setHeader("Cache-Control", "public, max-age=86400");
            response.end(bytes);
          } catch {
            response.statusCode = 404;
            response.end("Not found");
          }
        });

        server.middlewares.use("/api/social-state", async (request, response) => {
          try {
            if (request.method === "GET") {
              const payload = await readSharedState();
              sendJson(response, payload);
              return;
            }

            if (request.method === "PUT") {
              if (!hasTrustedOrigin(request)) {
                response.statusCode = 403;
                response.end("Forbidden origin");
                return;
              }

              const rawBody = await readRequestBody(request);
              const body = JSON.parse(rawBody || "{}") as { state?: SocialState; version?: number | null };
              if (!body.state) {
                response.statusCode = 400;
                response.end("Missing state");
                return;
              }

              const current = await readSharedState();
              if (Number.isFinite(body.version) && body.version !== current.version) {
                sendJson(response, { ...current, conflict: true }, 409);
                return;
              }

              const payload: SharedStatePayload = {
                state: sanitizeSocialState(body.state),
                version: Date.now(),
              };
              await writeSharedState(payload);
              sendJson(response, payload);
              return;
            }

            response.statusCode = 405;
            response.setHeader("Allow", "GET, PUT");
            response.end("Method not allowed");
          } catch (error) {
            server.config.logger.error(error instanceof Error ? error.message : String(error));
            response.statusCode = 500;
            response.end("Shared state error");
          }
        });
      },
    },
  ],
});
