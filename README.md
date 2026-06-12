# CyberKotleta Social

Minimal social space for a Russian-speaking community: boards, free-form posts, media, reactions, comments, profiles, and a Minecraft utility section.

Live: https://cyberkotleta.fun

## Product

CyberKotleta Social is built around a shared field rather than a classic feed-only social network. Boards are lightweight public spaces; posts can be placed on a canvas, moved, discussed, reacted to without per-user like limits, saved, reposted, and reported. The interface is intentionally compact, Russian-first, and visual-system driven.

The app also includes a `/space` area for community utilities. The first utility is a Minecraft page for distributing the CyberKotleta modpack as either a ZIP archive or a `.mrpack` file for Modrinth App.

## Highlights

- Free-form board canvas with draggable post cards.
- Profiles and personal boards.
- Post views, comments, one-level replies, saves, reposts, pinning, reports, and edit/delete actions.
- Media attachments for images, video, and audio.
- Pixel-field layer with shared drawing state.
- Board settings: name, avatar, banner, description, rules, custom links, publish permissions, and color theme.
- Server-backed shared social state with optimistic concurrency.
- Media upload API with server-side file validation.
- Discord OAuth authorization-code flow on the Node server.
- Production deploy behind Apache with HTTPS, HSTS, CSP, and origin checks.

## Stack

- React 19
- TypeScript
- Vite
- Node.js HTTP server
- Apache reverse proxy in production
- Let’s Encrypt / Certbot

## Architecture

```text
Browser
  -> Apache HTTPS virtual host
  -> Node server on 127.0.0.1
       -> dist/ SPA assets
       -> /api/social-state
       -> /api/media
       -> /api/auth/discord/*
       -> /media/*
```

The current persistence layer is a JSON file store under `KOTLETA_DATA_DIR`. It is suitable for a small alpha and local community testing. Before a wider public launch, the state API should be split into domain-specific mutations and moved to a database such as Postgres.

## Local Development

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

## Production-like Run

```bash
npm run build
cp .env.example .env
npm start
```

The server defaults to `127.0.0.1:4173`.

## Checks

```bash
npm run check
```

This runs the TypeScript/Vite production build and the Node server smoke test.

## Environment

Required for production:

- `PUBLIC_ORIGIN`
- `KOTLETA_AUTH_SECRET`
- `KOTLETA_DATA_DIR`
- `KOTLETA_DIST_DIR`

Required only for Discord OAuth:

- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`

Discord redirect URL:

```text
${PUBLIC_ORIGIN}/api/auth/discord/callback
```

## Deployment Notes

The live deployment uses:

- Apache as the public HTTPS endpoint.
- Node.js as a local app server.
- `cyberkotleta.service` under systemd.
- Let’s Encrypt certificate for `cyberkotleta.fun` and `www.cyberkotleta.fun`.

Server state and uploaded media live outside the release directory so deploys do not overwrite user data.

Deploy with:

```bash
npm run deploy:prod
```

The deploy script keeps older hashed assets in `dist/assets` during release. This prevents already-open browser tabs from requesting a deleted JS/CSS file and receiving the SPA HTML fallback instead.

## Development Process

The project was designed and implemented iteratively with ChatGPT Codex used as an engineering assistant for code changes, UI QA, deployment automation, and review loops. Product decisions, repository ownership, and final direction remain project-owned; Codex is documented here as part of the tooling, not as the product itself.
