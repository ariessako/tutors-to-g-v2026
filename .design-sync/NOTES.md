# design-sync notes: tutors-ui

Source shape: storybook (`.storybook/` at repo root). Build with `npm run build`, then rebuild `.design-sync/sb-reference` with `npx storybook build -c .storybook -o "$(pwd)/.design-sync/sb-reference"` whenever the source or stories change.

## Fixes

- [GENERAL] `[CSS_IMPORT_MISSING]` for `./fonts/fonts.css`, then `[FONT_MISSING]` for "Nunito Variable" -> `scripts/copy-fonts.mjs` prepends `@import './fonts/fonts.css';` to `dist/styles.css`, and the converter copies `cssEntry` verbatim without following that import -> `cfg.extraFonts: ["dist/fonts/fonts.css"]` emits `fonts/fonts.css` plus the woff2 files, so the copied `@import` resolves.
- [GENERAL] `[FONT_MISSING]` for "Nunito" -> it was a dead fallback name in `--tt-font-sans` (only "Nunito Variable" ships) -> removed it from `src/tokens.css`.
- [GENERAL] Compare sheets: Storybook shots are cropped to the component while preview shots are the full 900x700 page, so the sheet makes previews look about half size. Judge size from the raw PNGs, which match 1:1. The cream Storybook canvas (`backgrounds` in `.storybook/preview.ts`) against the white preview page is framing, not a mismatch.
- `[GRID_OVERFLOW]` -> `cardMode: "column"` for Alert, Card and Tabs (their stories set fixed widths of 340-460px); `cardMode: "single"` + `primaryStory: "Open"` for Modal (portal + fixed overlay).
- Modal: open-state stories showed `sb-error` "no storybook root content" -> the modal portals to `document.body`, so `#storybook-root` stays empty and compare finds nothing to shoot -> the `withPage` decorator in `Modal.stories.tsx` renders a full-height page behind the open modal. Keep it on every open-state Modal story.
- Card "With Media": the Badge stretched to the full card width on BOTH sides (a real library bug, not a sync bug) -> `.tt-card__body` is a flex column, so its children stretch -> added `width: fit-content` to `.tt-badge` in `src/components/Badge/Badge.css`.

## Re-sync risks

- `scripts/copy-fonts.mjs` and `cfg.extraFonts: ["dist/fonts/fonts.css"]` must move together. If the font files or the prepended `@import` change, re-check that `ds-bundle/fonts/` gets both woff2 files and that validate prints no `[FONT_MISSING]`.
- The `withPage` decorator in `Modal.stories.tsx` is what makes Modal capturable. A new open-state Modal story without it will show `sb-error` "no storybook root content".
- `cardMode` overrides (column for Alert, Card and Tabs; single for Modal) were set for the current story widths. A new wide story on another component will print `[GRID_OVERFLOW]`, which needs the same treatment.
- All 37 stories were graded from images on the first sync (every component's full story set; the story cap of 6 wasn't hit).
- Toolchain at first sync: Storybook 10.6, Vite 8.3, React 19.3, Node 25. A major upgrade of any of these can churn previews, which shows up as a `[SPOT_CHECK]` canary.
