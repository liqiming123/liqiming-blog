<div align="center">

<img src="public/favicon/mascot-192.png" width="88" height="88" alt="Qiming Blog logo" />

# Qiming Blog

**AI news, engineering notes, and a record of continuous learning.**

A personal blog customized from Firefly, powered by Astro and Svelte.

[![Astro](https://img.shields.io/badge/Astro-7.3-BC52EE?logo=astro&logoColor=white)](https://astro.build/)
[![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)](https://svelte.dev/)
[![Build](https://github.com/liqiming123/liqiming-blog/actions/workflows/build.yml/badge.svg)](https://github.com/liqiming123/liqiming-blog/actions/workflows/build.yml)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[Live demo](https://liqiming.top) · [Quick start](#quick-start) · [Report an issue](https://github.com/liqiming123/liqiming-blog/issues)

[简体中文](README.md) | **English**

</div>

![Qiming Blog desktop homepage](docs/images/demo/home-desktop.png)

## About

This repository contains the source of [liqiming.top](https://liqiming.top), a personal blog covering AI news and software engineering. Content lives in Markdown / MDX files and is built into static pages. The core blog does not require a database.

It is a customized version of [CuteLeaf / Firefly](https://github.com/CuteLeaf/Firefly), which is based on [saicaca / Fuwari](https://github.com/saicaca/fuwari). Customizations include the site's content and visual settings, a self-hosted Artalk frontend, a Live2D chat interface, and RSS / Atom reading improvements.

## Screenshots

These are actual browser captures of the production build. The desktop homepage is shown above.

<details>
<summary>Mobile preview (440 px viewport)</summary>

<p align="center">
  <img src="docs/images/demo/mobile.png" width="360" alt="Qiming Blog mobile navigation, banner, and articles" />
</p>

</details>

## Features

- Markdown / MDX articles, categories, tags, archives, series, and a reading outline.
- Pagefind search with a build-time index and browser-side queries.
- Light / dark themes, configurable colors, rotating wallpapers, sidebars, and responsive layouts.
- Short updates, projects, galleries, bookmarks, friend links, and a guestbook.
- Svelte interactions, Swup navigation, immersive reading, and a Live2D mascot.
- Optional Artalk comments and streaming AI chat through your own server proxy.
- RSS / Atom feeds, a sitemap, Open Graph images, image placeholders, and asset optimization.

## Technology

| Technology | Role |
| --- | --- |
| Astro 7.3.2 | Routing, content collections, static generation, and images |
| Svelte 5 + TypeScript 6 | Interactive components and typed configuration |
| Tailwind CSS 4 + Stylus | Responsive layout and styling |
| Markdown / MDX + remark / rehype | Authoring and content transformations |
| Expressive Code + KaTeX | Code blocks and math |
| Pagefind + Swup | Search and page transitions |
| Artalk 2.10.0 + Live2D / Pio | Comment frontend and mascot interactions |
| pnpm + Biome + GitHub Actions | Dependencies, formatting, checks, and builds |

See [package.json](package.json) and [pnpm-lock.yaml](pnpm-lock.yaml) for exact dependencies.

## Quick start

Requirements: **Node.js >= 22.23.0** (Node.js 24 recommended), **pnpm 11.22.0**, and Git if cloning.

```bash
npm install --global pnpm@11.22.0
git clone https://github.com/liqiming123/liqiming-blog.git
cd liqiming-blog
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://localhost:4321**, or the URL printed by Astro if that port is occupied. Alternatively, [download the ZIP](https://github.com/liqiming123/liqiming-blog/archive/refs/heads/main.zip), extract it, and run the install and dev commands from the directory containing `package.json`.

No `.env` file or API key is required for the core blog. Installing dependencies requires an internet connection.

To check and preview the production build:

```bash
pnpm check
pnpm type-check
pnpm build
pnpm preview
```

Use the complete `pnpm build` command: it includes asset pruning, font subsetting, inline script compression, and the Pagefind index. Running only `astro build` skips these post-processing steps. Test full-text search using the production preview.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start the development server |
| `pnpm check` | Astro / Svelte diagnostics |
| `pnpm type-check` | TypeScript checks |
| `pnpm build` | Generate the complete site in `dist/` |
| `pnpm preview` | Preview the production build |
| `pnpm new-post my-first-post` | Create a Markdown article |
| `pnpm new-dynamic "A short update"` | Create a timestamped update |
| `pnpm format` | Format source and scripts; modifies files |
| `pnpm lint` | Run Biome with safe fixes; modifies files |

## Configuration

Configuration lives in `src/config/` and is exported through `src/config/index.ts`.

| File | Configure |
| --- | --- |
| `siteConfig.ts` | Title, domain, language, colors, page switches, favicon |
| `profileConfig.ts` | Avatar, bio, social links |
| `navBarConfig.ts` | Navigation |
| `backgroundWallpaper.ts` | Homepage headline, wallpapers, carousel |
| `sidebarConfig.ts` | Sidebar and layout |
| `commentConfig.ts` | Comments and backend URL |
| `pioConfig.ts` | Mascot, menus, AI chat |

Write articles in `src/content/posts/`, short updates in `src/content/dynamic/`, and project entries in `src/content/projects/`.

### Optional backend services

This repository includes the frontend and integration notes. It does **not** include the production comment database, AI proxy implementation, or service credentials.

- **Comments:** set `commentConfig.type` to `"none"` for a frontend-only preview. Otherwise, configure your own Artalk server and match its site name to `siteConfig.title`.
- **AI chat:** set `live2dWidgetConfig.chat.enable` to `false` to keep the mascot without AI. Otherwise, point `chat.apiEndpoint` at your own compatible proxy.
- **API keys:** keep keys on the server. Leave frontend `chat.apiKey` empty; values in static-site config can appear in generated HTML.

The checked-in settings reflect the live site. Its public backend endpoints are not intended as shared services for other domains or localhost.

Integration notes: [Artalk](docs/artalk-frontend.md) · [AI proxy](docs/mascot-chat-proxy.md).

## Structure

```text
src/
  assets/       Source images
  components/   Astro and Svelte components
  config/       Feature configuration
  content/      Articles, updates, projects, pages
  layouts/      Shared layouts
  pages/        Routes and feed endpoints
  plugins/      Markdown and HTML plugins
  styles/       Stylesheets
  types/        Type definitions
  utils/        Utilities
public/         Static assets, Artalk frontend, mascot models
scripts/        Authoring and build helpers
docs/           Screenshots and deployment notes
.github/        CI and issue templates
```

## Deployment

Build with `pnpm build` and serve the contents of `dist/` from a static host. Set the install command to `pnpm install --frozen-lockfile` and use Node.js 24.

Update `siteConfig.site_url` before deploying your own site. The default Astro `base` is `/`; subdirectory deployments need corresponding path configuration and verification.

CI runs diagnostics, TypeScript checks, and the complete build on `main`. The GitHub Pages workflow is manual and requires Pages configuration. See the [deployment guide](docs/deploy.md).

## Contributing

Issues and focused pull requests are welcome. Include reproduction steps, environment details, and screenshots for UI problems. Run `pnpm check`, `pnpm type-check`, and `pnpm build` before submitting. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits and license

Built on [Firefly](https://github.com/CuteLeaf/Firefly) and [Fuwari](https://github.com/saicaca/fuwari). The Live2D integration uses runtime/model resources from Mizuki / Pio. Thanks to the maintainers of Astro, Svelte, Pagefind, Artalk, and all other dependencies.

The code retains the [MIT License](LICENSE) and upstream copyright notices. Articles, quoted material, wallpapers, fonts, music, and mascot models retain their respective licenses and attribution requirements; the code license does not grant separate rights to those assets.
