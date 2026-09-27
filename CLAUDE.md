# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`tutors-ui`: a small React + TypeScript component library for a tutoring app, styled as "friendly & bright" (warm coral primary, violet secondary, rounded Nunito font). It has 8 components: Button, Input, Card, Badge, Avatar, Alert, Tabs and Modal. It is synced to Claude Design (claude.ai/design) with the `/design-sync` skill, so the design agent builds with these real components.

## Commands

```sh
npm install
npm run build            # vite build -> scripts/copy-fonts.mjs -> tsc declarations, all into dist/
npm run typecheck        # tsc --noEmit (includes stories and .storybook)
npm run storybook        # dev server on :6006
npm run build-storybook  # static build into storybook-static/
```

There are no tests or linter. `npm run typecheck` plus `npm run build-storybook` is the check that everything compiles.

## Architecture

- **Styling is plain CSS with custom properties, not CSS-in-JS.** Each component has a `.css` file next to its `.tsx`. Every class uses the `tt-` prefix with BEM naming (`tt-button`, `tt-button--primary`, `tt-card__title`). Components build class strings with `cx()` from `src/cx.ts`.
- **Tokens:** all design values live as `--tt-*` custom properties on `:root` in `src/tokens.css`. Component CSS should only read tokens, never hard-code colors. There is no provider or wrapper component, because the tokens apply globally once the stylesheet loads.
- **Stylesheet entry:** `src/styles.css` `@import`s the tokens and every component's CSS. Add a new component's CSS there. `src/index.ts` imports `styles.css` so Vite extracts it to `dist/styles.css`. Consumers import `tutors-ui/styles.css`.
- **Fonts are kept out of the Vite bundle on purpose.** Vite's library mode inlines every asset as base64, whatever `assetsInlineLimit` says. So `src/fonts/` (Latin-only Nunito woff2 files plus `fonts.css`) is copied to `dist/fonts/` by `scripts/copy-fonts.mjs`, which also prepends `@import './fonts/fonts.css';` to `dist/styles.css`. Storybook loads `src/fonts/fonts.css` directly in `.storybook/preview.ts`.
- **Types:** Vite emits JS and CSS only. `tsc -p tsconfig.build.json` emits the `.d.ts` files, excluding stories. Each component exports a `<Name>Props` interface, and `src/index.ts` re-exports every component and its props type.
- **Stories:** `src/components/<Name>/<Name>.stories.tsx`, titled `Components/<Name>`. The design sync uses them as the reference previews, so keep them realistic (tutoring copy) and self-contained.
- **Contrast:** filled colors that carry white text use the `-600` shades, all of which reach at least 4.5:1. `--tt-color-primary-500` is too light for white text and is for accents only.
- **Modal** renders through a portal to `document.body` and locks body scroll while open.

## Repository layout

This folder is its own git repo. It pushes to the private GitHub repo https://github.com/ariessako/tutors-to-g-v2026 on the `main` branch. It is nested inside a different git repo, `/Users/ariessako/claudecodetest`, which holds an unrelated tic-tac-toe game. Claude Code also loads that parent folder's `CLAUDE.md` here. Nothing in it applies to this project. Run git commands from inside this folder.
