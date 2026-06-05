# Production readiness

## Closed now

- Production Node server: serves `dist`, SPA fallback, `/api/health`, `/api/social-state`.
- Shared state persistence outside browser storage: `KOTLETA_DATA_DIR/social-state.json`.
- Atomic state writes and basic server-side state shape validation.
- Optimistic concurrency for shared state writes: stale clients get `409`.
- Request body limit for state writes.
- Basic security headers: CSP, frame deny, referrer policy, permissions policy, HSTS on HTTPS.
- Basic Origin check for unsafe HTTP methods.
- Media upload API: `/api/media` stores image/video/audio files outside social state and serves `/media/...`.
- Server smoke test: `npm run check`.
- Guest user is the default session; browsers no longer auto-login as `rub1kub`.
- Production Discord OAuth path uses server-side authorization code flow.

## Required environment for production Discord login

- `PUBLIC_ORIGIN`: public HTTPS origin, for example `https://example.com`.
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `KOTLETA_AUTH_SECRET`: long random secret for signed cookies.

Discord application redirect URL must be:

```text
${PUBLIC_ORIGIN}/api/auth/discord/callback
```

## Still not production-grade

- JSON-file persistence is acceptable for a small private alpha, not for public scale. Replace with Postgres before real launch.
- Media is stored on local disk for now. Replace with S3/R2/MinIO object storage before public scale.
- No domain-level API mutations yet. The current shared state endpoint still accepts a whole sanitized snapshot.
- No server-side authorization on individual post/comment/pixel mutations yet.
- No anti-spam, audit log, ban system, or moderation queue at API level.
- No real-time transport. Polling is good enough for local/dev, but production needs WebSocket/SSE or a managed realtime layer.
- `src/App.tsx` is too large. It should be split into feature modules before adding more product surface.
