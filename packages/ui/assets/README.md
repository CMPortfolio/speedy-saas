# Naples AI brand assets

The Naples AI mark (cropped from the website logo), metadata stripped.

- `naples-mark-64.png` → each app's `public/naples-mark.png` (header and footer, 2x of 30px)
- `naples-mark-128.png` → each app's `src/app/icon.png`
- `naples-mark-180.png` → each app's `src/app/apple-icon.png`, and `src/og-mark.ts` (base64)
- `favicon.ico` → each app's `src/app/favicon.ico` (a 64px PNG inside an ICO)

The app copies (and `templates/tool`) must be refreshed together with these, and `src/og-mark.ts`
regenerated from the 180px file. Strip metadata from any new PNG before committing: exports from
design tools carry author names and document IDs.
