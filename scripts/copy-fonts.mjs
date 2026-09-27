// Vite's library mode inlines every asset as base64, so fonts are kept out of the
// bundle: copy src/fonts into dist/fonts and link it from the top of dist/styles.css.
import { cpSync, readFileSync, writeFileSync } from 'node:fs';

cpSync('src/fonts', 'dist/fonts', { recursive: true });
const css = readFileSync('dist/styles.css', 'utf8');
writeFileSync('dist/styles.css', `@import './fonts/fonts.css';\n${css}`);
