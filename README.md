# Pip's Ascension

Pip's Ascension is a browser-based penguin jumping game built with Astro. Help Pip steer between floating platforms, collect fish, and climb toward the summit.

## Project structure

The site pages and shared components live under `src/`; game artwork and other static assets live in `public/`.

```text
├── public/
├── src/
│   ├── components/
│   ├── pages/
│   ├── scripts/
│   └── styles/
├── astro.config.mjs
├── README.md
├── package.json
└── tsconfig.json
```

## Commands

Run these commands from the project root:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Install dependencies                             |
| `npm run dev`             | Start the local site at `localhost:4321`         |
| `npm run test:unit`       | Run game-physics unit tests                      |
| `npm run check`           | Check Astro pages and TypeScript                 |
| `npm run lint`            | Run ESLint                                       |
| `npm run build`           | Build the production site to `./dist/`           |
| `npm run preview`         | Preview the production build locally             |

## Shared leaderboard

The shared leaderboard uses the Supabase project URL and a server-only secret
key. For local development, copy `.env.example` to `.env` and set
`SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Never expose the secret key through
client-side code or commit it. The site validates score submissions on its
server, but without player accounts it cannot verify that a submitted score was
earned in a real game.

## Credit

This theme is based off of the lovely [Bear Blog](https://github.com/HermanMartinus/bearblog/).
