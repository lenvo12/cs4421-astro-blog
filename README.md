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

## Owner-only developer tools

The public game hides developer mode, zone test flights, and weather/time preview controls. On a Node.js server deployment, use the small dot at the end of the footer to open the password form.

Configure `DEVELOPER_ACCESS_PASSWORD` with a 16–256 character password and `DEVELOPER_ACCESS_SECRET` with at least 32 random bytes in the **server runtime environment**. For local development, put these variables in the ignored `.env` file. For example, generate the session secret with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

The signed, HTTP-only developer session lasts 12 hours. Do not put either value in client-side code or commit them. This feature requires the Astro Node adapter; a static S3 deployment cannot validate the password or protect the developer controls. Since the game itself runs in the visitor’s browser, this gate hides the tools from regular visitors but cannot prevent a determined user from modifying their local client.

## Credit

This theme is based off of the lovely [Bear Blog](https://github.com/HermanMartinus/bearblog/).
