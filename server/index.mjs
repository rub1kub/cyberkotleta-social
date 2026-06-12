import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSharedStateStore,
  createSocialStateActionHandler,
  createSocialStateEventsHandler,
  createSocialStateHandler,
  resolveDataPath,
  sendJson,
  sendText,
} from "./shared-state-store.mjs";
import { createAuthHandler } from "./auth.mjs";
import { handleMediaUpload, readMediaFile } from "./media-store.mjs";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distDir = resolve(process.env.KOTLETA_DIST_DIR ?? join(rootDir, "dist"));
const assetsDir = resolve(distDir, "assets");
const downloadsDir = resolve(process.env.KOTLETA_DOWNLOADS_DIR ?? resolveDataPath("downloads"));
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 4173);
const store = createSharedStateStore();
const handleSocialState = createSocialStateHandler(store);
const handleSocialStateEvents = createSocialStateEventsHandler(store);
const handleSocialStateAction = createSocialStateActionHandler(store);
const handleAuth = createAuthHandler();

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

const server = createServer(async (request, response) => {
  setSecurityHeaders(request, response);

  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (!isSafeMethod(request.method) && !hasTrustedOrigin(request)) {
    sendText(response, 403, "Forbidden origin");
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(response, {
      ok: true,
      dbFile: store.dbFile,
      stateFile: store.stateFile,
      time: new Date().toISOString(),
    });
    return;
  }

  if (url.pathname === "/api/social-state/events") {
    await handleSocialStateEvents(request, response);
    return;
  }

  if (url.pathname === "/api/social-state/actions") {
    await handleSocialStateAction(request, response);
    return;
  }

  if (url.pathname === "/api/social-state") {
    await handleSocialState(request, response);
    return;
  }

  if (url.pathname === "/api/media") {
    await handleMediaUpload(request, response);
    return;
  }

  if (url.pathname.startsWith("/api/auth/")) {
    const handled = await handleAuth(request, response, url.pathname);
    if (handled) return;
  }

  if (url.pathname.startsWith("/media/")) {
    await streamMedia(url.pathname, response);
    return;
  }

  if (url.pathname.startsWith("/downloads/")) {
    await streamDownload(request, url.pathname, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "Method not allowed");
    return;
  }

  await serveStatic(url.pathname, response);
});

server.listen(port, host, () => {
  console.log(`КиберКотлета server: http://${host}:${port}`);
  console.log(`State file: ${store.stateFile}`);
});

async function serveStatic(pathname, response) {
  const safePath = decodeURIComponent(pathname).replace(/^\/+/, "");
  const requestedPath = safePath ? resolve(distDir, safePath) : resolve(distDir, "index.html");

  if (!requestedPath.startsWith(distDir)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  const filePath = await resolveExistingFile(requestedPath);
  if (!filePath) {
    await streamFile(resolve(distDir, "index.html"), response, false);
    return;
  }

  await streamFile(filePath, response, true);
}

async function resolveExistingFile(filePath) {
  try {
    const info = await stat(filePath);
    if (info.isFile()) return filePath;
    if (info.isDirectory()) {
      const indexPath = join(filePath, "index.html");
      const indexInfo = await stat(indexPath);
      if (indexInfo.isFile()) return indexPath;
    }
  } catch {
    return null;
  }

  return null;
}

async function streamFile(filePath, response, allowImmutableCache) {
  try {
    const info = await stat(filePath);
    response.statusCode = 200;
    response.setHeader("Content-Length", info.size);
    response.setHeader("Content-Type", contentTypes.get(extname(filePath)) ?? "application/octet-stream");
    response.setHeader(
      "Cache-Control",
      allowImmutableCache && filePath.startsWith(assetsDir)
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    );
    createReadStream(filePath).pipe(response);
  } catch {
    sendText(response, 404, "Not found");
  }
}

async function streamDownload(request, pathname, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "Method not allowed");
    return;
  }

  const fileName = basename(pathname);
  if (!fileName || fileName !== pathname.split("/").at(-1)) {
    sendText(response, 404, "Not found");
    return;
  }

  const filePath = resolve(downloadsDir, fileName);
  if (!filePath.startsWith(downloadsDir)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  const contentType = getDownloadContentType(filePath);
  if (!contentType) {
    sendText(response, 404, "Not found");
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      sendText(response, 404, "Not found");
      return;
    }

    response.statusCode = 200;
    response.setHeader("Content-Type", contentType);
    response.setHeader("Content-Length", info.size);
    response.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    response.setHeader("Cache-Control", "public, max-age=3600");
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(filePath).pipe(response);
  } catch {
    sendText(response, 404, "Not found");
  }
}

function getDownloadContentType(filePath) {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".zip") return "application/zip";
  if (extension === ".mrpack") return "application/x-modrinth-modpack+zip";
  return null;
}

async function streamMedia(pathname, response) {
  const file = await readMediaFile(pathname);
  if (!file) {
    sendText(response, 404, "Not found");
    return;
  }

  response.statusCode = 200;
  response.setHeader("Content-Type", file.contentType);
  response.setHeader("Content-Length", file.bytes.byteLength);
  response.setHeader("Cache-Control", "public, max-age=86400");
  response.end(file.bytes);
}

function setSecurityHeaders(request, response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  response.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data: blob: https://cdn.discordapp.com",
      "media-src 'self' data: blob:",
      "connect-src 'self' https://api.modrinth.com",
      "form-action 'self' https://discord.com",
    ].join("; "),
  );
  if (getRequestOrigin(request).startsWith("https://")) {
    response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function isSafeMethod(method) {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function hasTrustedOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  return origin === getRequestOrigin(request);
}

function getRequestOrigin(request) {
  const host = request.headers["x-forwarded-host"] ?? request.headers.host ?? "127.0.0.1";
  const proto = request.headers["x-forwarded-proto"] ?? "http";
  return `${proto}://${host}`;
}
