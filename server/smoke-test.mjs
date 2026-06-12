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

  const eventController = new AbortController();
  const eventResponse = await fetch(`http://127.0.0.1:${port}/api/social-state/events`, {
    signal: eventController.signal,
  });
  assert(eventResponse.ok, "shared state SSE endpoint failed");
  assert(eventResponse.headers.get("Content-Type")?.includes("text/event-stream"), "shared state SSE content type is wrong");
  const eventText = await readFirstStreamEvent(eventResponse);
  eventController.abort();
  assert(eventText.includes("event: social-state"), "shared state SSE did not emit a state event");
  assert(eventText.includes(`\"version\":${snapshot.version}`), "shared state SSE did not emit current version");

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

  const actionCreated = await fetchJson(`http://127.0.0.1:${port}/api/social-state/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "post.create",
      actorId: "guest",
      post: {
        id: "action-smoke-post",
        wallId: "main",
        text: "action smoke",
        attachments: [],
        position: { x: 48, y: 72 },
      },
    }),
  });
  assert(actionCreated.state.posts.some((post) => post.id === "action-smoke-post"), "post.create action did not persist");

  const actionMoved = await fetchJson(`http://127.0.0.1:${port}/api/social-state/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "post.move",
      actorId: "rub1kub",
      postId: "action-smoke-post",
      x: 240,
      y: 264,
    }),
  });
  assert(
    actionMoved.state.posts.find((post) => post.id === "action-smoke-post")?.position?.x === 240,
    "post.move action did not persist",
  );

  const actionReacted = await fetchJson(`http://127.0.0.1:${port}/api/social-state/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "post.react",
      actorId: "guest",
      postId: "action-smoke-post",
      amount: 3,
    }),
  });
  assert(
    actionReacted.state.posts.find((post) => post.id === "action-smoke-post")?.reactions === 3,
    "post.react action did not persist",
  );

  const actionViewed = await fetchJson(`http://127.0.0.1:${port}/api/social-state/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "post.view",
      actorId: "guest",
      postId: "action-smoke-post",
    }),
  });
  assert(
    actionViewed.state.posts.find((post) => post.id === "action-smoke-post")?.views?.uniqueUserIds?.includes("guest"),
    "post.view action did not persist",
  );

  const actionPixel = await fetchJson(`http://127.0.0.1:${port}/api/social-state/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "pixel.paint",
      actorId: "guest",
      x: 1,
      y: 2,
      color: "#21e69a",
    }),
  });
  assert(actionPixel.state.pixelCells.some((cell) => cell.x === 1 && cell.y === 2), "pixel.paint action did not persist");

  const actionUpdated = await fetchJson(`http://127.0.0.1:${port}/api/social-state/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "post.update",
      actorId: "guest",
      postId: "action-smoke-post",
      text: "action smoke updated",
      options: {
        checklist: [{ id: "todo-1", text: "check", checkedBy: [] }],
        poll: {
          question: "ok?",
          multi: false,
          options: [
            { id: "yes", text: "yes", voterIds: [] },
            { id: "no", text: "no", voterIds: [] },
          ],
        },
      },
    }),
  });
  assert(actionUpdated.state.posts.find((post) => post.id === "action-smoke-post")?.text.includes("updated"), "post.update action did not persist");

  const actionChecklist = await fetchJson(`http://127.0.0.1:${port}/api/social-state/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "checklist.toggle", actorId: "guest", postId: "action-smoke-post", itemId: "todo-1" }),
  });
  assert(actionChecklist.state.posts.find((post) => post.id === "action-smoke-post")?.checklist?.[0]?.checkedBy?.includes("guest"), "checklist.toggle action did not persist");

  const actionPoll = await fetchJson(`http://127.0.0.1:${port}/api/social-state/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "poll.vote", actorId: "guest", postId: "action-smoke-post", optionId: "yes" }),
  });
  assert(actionPoll.state.posts.find((post) => post.id === "action-smoke-post")?.poll?.options?.[0]?.voterIds?.includes("guest"), "poll.vote action did not persist");

  const actionComment = await fetchJson(`http://127.0.0.1:${port}/api/social-state/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "comment.create",
      actorId: "guest",
      comment: {
        id: "action-smoke-comment",
        postId: "action-smoke-post",
        text: "comment",
        attachments: [],
      },
    }),
  });
  assert(actionComment.state.comments.some((comment) => comment.id === "action-smoke-comment"), "comment.create action did not persist");

  const actionCommentReact = await fetchJson(`http://127.0.0.1:${port}/api/social-state/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "comment.react", actorId: "rub1kub", commentId: "action-smoke-comment", amount: 2 }),
  });
  assert(actionCommentReact.state.comments.find((comment) => comment.id === "action-smoke-comment")?.reactions === 2, "comment.react action did not persist");

  const actionCommentUpdate = await fetchJson(`http://127.0.0.1:${port}/api/social-state/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "comment.update", actorId: "guest", commentId: "action-smoke-comment", text: "edited" }),
  });
  assert(actionCommentUpdate.state.comments.find((comment) => comment.id === "action-smoke-comment")?.text === "edited", "comment.update action did not persist");

  const actionConnection = await fetchJson(`http://127.0.0.1:${port}/api/social-state/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "connection.create",
      actorId: "guest",
      connection: {
        id: "action-smoke-connection",
        fromPostId: "action-smoke-post",
        toPostId: "minecraft-download-post",
        createdAt: Date.now(),
      },
    }),
  });
  assert(actionConnection.state.postConnections.some((connection) => connection.id === "action-smoke-connection"), "connection.create action did not persist");

  const actionConnectionDelete = await fetchJson(`http://127.0.0.1:${port}/api/social-state/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "connection.delete", actorId: "guest", connectionId: "action-smoke-connection" }),
  });
  assert(!actionConnectionDelete.state.postConnections.some((connection) => connection.id === "action-smoke-connection"), "connection.delete action did not persist");

  const actionSave = await fetchJson(`http://127.0.0.1:${port}/api/social-state/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "post.save.toggle", actorId: "guest", postId: "action-smoke-post" }),
  });
  assert(actionSave.state.savedPostIdsByUser.guest?.includes("action-smoke-post"), "post.save.toggle action did not persist for actor");
  assert(!actionSave.state.savedPostIdsByUser.rub1kub?.includes("action-smoke-post"), "post.save.toggle leaked to another user");

  const actionRepost = await fetchJson(`http://127.0.0.1:${port}/api/social-state/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "post.repost", actorId: "rub1kub", postId: "action-smoke-post", repostId: "action-smoke-repost" }),
  });
  assert(actionRepost.state.posts.some((post) => post.id === "action-smoke-repost" && post.repostOfId === "action-smoke-post"), "post.repost action did not persist");

  const actionFollow = await fetchJson(`http://127.0.0.1:${port}/api/social-state/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "follow.toggle", actorId: "guest", targetType: "user", targetId: "rub1kub" }),
  });
  assert(actionFollow.state.follows.some((follow) => follow.userId === "guest" && follow.targetType === "user" && follow.targetId === "rub1kub"), "follow.toggle action did not persist for actor");
  assert(!actionFollow.state.follows.some((follow) => follow.userId === "rub1kub" && follow.targetType === "user" && follow.targetId === "rub1kub"), "follow.toggle leaked to another user");

  const actionWall = await fetchJson(`http://127.0.0.1:${port}/api/social-state/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "wall.create",
      actorId: "rub1kub",
      wall: {
        id: "space:smoke-wall",
        siteSectionId: "space",
        name: "Smoke wall",
        description: "",
        rules: "",
        publishMode: "owner",
      },
    }),
  });
  assert(actionWall.state.walls.some((wall) => wall.id === "space:smoke-wall"), "wall.create action did not persist");

  const actionWallUpdate = await fetchJson(`http://127.0.0.1:${port}/api/social-state/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "wall.update", actorId: "rub1kub", wallId: "space:smoke-wall", wall: { name: "Smoke updated" } }),
  });
  assert(actionWallUpdate.state.walls.find((wall) => wall.id === "space:smoke-wall")?.name === "Smoke updated", "wall.update action did not persist");

  const actionWallDelete = await fetchJson(`http://127.0.0.1:${port}/api/social-state/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "wall.delete", actorId: "rub1kub", wallId: "space:smoke-wall" }),
  });
  assert(!actionWallDelete.state.walls.some((wall) => wall.id === "space:smoke-wall"), "wall.delete action did not persist");

  const actionCommentDelete = await fetchJson(`http://127.0.0.1:${port}/api/social-state/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "comment.delete", actorId: "guest", commentId: "action-smoke-comment" }),
  });
  assert(!actionCommentDelete.state.comments.some((comment) => comment.id === "action-smoke-comment"), "comment.delete action did not persist");

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

async function readFirstStreamEvent(response) {
  const reader = response.body?.getReader();
  assert(reader, "stream response body is missing");
  const decoder = new TextDecoder();
  let text = "";

  while (!text.includes("\n\n")) {
    const result = await Promise.race([
      reader.read(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("SSE event timeout")), 2000)),
    ]);
    if (result.done) break;
    text += decoder.decode(result.value, { stream: true });
  }

  await reader.cancel().catch(() => undefined);
  return text;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
