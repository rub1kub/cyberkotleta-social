import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const port = 43000 + Math.floor(Math.random() * 1000);
const dataDir = await mkdtemp(join(tmpdir(), "kotleta-server-"));
await mkdir(join(dataDir, "downloads"), { recursive: true });
await writeFile(join(dataDir, "downloads", "smoke-pack.zip"), "zip smoke");
const server = spawn(process.execPath, ["server/index.mjs"], {
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    KOTLETA_DATA_DIR: dataDir,
    PORT: String(port),
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
server.stdout.on("data", (chunk) => {
  stdout += chunk.toString("utf8");
});
server.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

try {
  await waitForServer(port);

  const health = await fetchJson(`http://127.0.0.1:${port}/api/health`);
  assert(health.ok === true, "health endpoint failed");

  const anonymousSession = await fetchJson(`http://127.0.0.1:${port}/api/auth/session`);
  assert(anonymousSession === null, "anonymous auth session should be null");

  const authStart = await fetch(`http://127.0.0.1:${port}/api/auth/discord/start`, {
    redirect: "manual",
  });
  assert(authStart.status === 503, "auth start without Discord env should return 503");

  const snapshot = await fetchJson(`http://127.0.0.1:${port}/api/social-state`);
  assert(snapshot.state?.activeUserId === "guest", "shared state did not initialize as guest");
  assert(Array.isArray(snapshot.state?.posts), "shared state posts are missing");

  const nextState = structuredClone(snapshot.state);
  nextState.utilityPositions = {
    ...nextState.utilityPositions,
    "smoke-object": { x: 120, y: 240 },
  };
  nextState.posts = [
    {
      id: "server-smoke-post",
      wallId: "main",
      authorId: "guest",
      text: "server smoke",
      attachments: [],
      reactions: 0,
      views: { total: 0, uniqueUserIds: [] },
      createdAt: Date.now(),
    },
    ...nextState.posts,
  ];

  const updated = await fetchJson(`http://127.0.0.1:${port}/api/social-state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state: nextState, version: snapshot.version }),
  });
  assert(updated.state.posts[0].id === "server-smoke-post", "shared state PUT did not persist");
  assert(updated.state.utilityPositions["smoke-object"]?.x === 120, "utility position did not persist");

  const staleWrite = await fetch(`http://127.0.0.1:${port}/api/social-state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state: snapshot.state, version: snapshot.version }),
  });
  assert(staleWrite.ok, "stale shared state PUT should return the current snapshot");
  const stalePayload = await staleWrite.json();
  assert(stalePayload.conflict === true, "stale shared state PUT should be marked as conflict");

  const destructiveState = structuredClone(updated.state);
  destructiveState.users = destructiveState.users.slice(0, 1);
  const rejectedRegression = await fetchJson(`http://127.0.0.1:${port}/api/social-state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state: destructiveState, version: updated.version }),
  });
  assert(rejectedRegression.conflict === true, "destructive state write should be marked as conflict");
  assert(rejectedRegression.rejected?.reason === "users-regression", "destructive state write should explain rejection");
  assert(rejectedRegression.state.users.length === updated.state.users.length, "destructive state write should not persist");

  const rootHtml = await fetchText(`http://127.0.0.1:${port}/`);
  assert(rootHtml.includes("<!doctype html>"), "root HTML did not serve dist");

  const rootResponse = await fetch(`http://127.0.0.1:${port}/`);
  assert(rootResponse.headers.get("Content-Security-Policy")?.includes("default-src 'self'"), "CSP header is missing");
  assert(rootResponse.headers.get("X-Frame-Options") === "DENY", "frame protection header is missing");

  const downloadResponse = await fetch(`http://127.0.0.1:${port}/downloads/smoke-pack.zip`, { method: "HEAD" });
  assert(downloadResponse.ok, "download file did not serve back");
  assert(downloadResponse.headers.get("Content-Type") === "application/zip", "download content type is wrong");
  assert(downloadResponse.headers.get("Content-Disposition")?.includes("smoke-pack.zip"), "download disposition is missing");

  const forbiddenOrigin = await fetch(`http://127.0.0.1:${port}/api/social-state`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://evil.example",
    },
    body: JSON.stringify({ state: updated.state, version: updated.version }),
  });
  assert(forbiddenOrigin.status === 403, "foreign Origin PUT should return 403");

  const mediaUpload = await fetchJson(`http://127.0.0.1:${port}/api/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
      name: "pixel.png",
      type: "image",
    }),
  });
  assert(mediaUpload.attachment?.url?.startsWith("/media/"), "media upload did not return a media URL");

  const mediaResponse = await fetch(`http://127.0.0.1:${port}${mediaUpload.attachment.url}`);
  assert(mediaResponse.ok, "uploaded media did not serve back");
  assert(mediaResponse.headers.get("Content-Type") === "image/png", "uploaded media content type is wrong");
  assert((await mediaResponse.arrayBuffer()).byteLength > 0, "uploaded media is empty");

  const fallbackHtml = await fetchText(`http://127.0.0.1:${port}/feed`);
  assert(fallbackHtml.includes("<!doctype html>"), "SPA fallback did not serve dist index");

  console.log("production server smoke: ok");
} finally {
  server.kill("SIGTERM");
  await rm(dataDir, { force: true, recursive: true });
}

async function waitForServer(targetPort) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`server exited early\nstdout:\n${stdout}\nstderr:\n${stderr}`);
    }

    try {
      await fetch(`http://127.0.0.1:${targetPort}/api/health`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  throw new Error(`server did not start\nstdout:\n${stdout}\nstderr:\n${stderr}`);
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  assert(response.ok, `${url} returned ${response.status}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url);
  assert(response.ok, `${url} returned ${response.status}`);
  return response.text();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
