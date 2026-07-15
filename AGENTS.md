# Blog Repository Guidance

## Active Project

- The active Hexo source repository is `F:\blog\blog`.
- Work on the `source` branch unless the user explicitly requests another branch.
- The Git remote is `https://github.com/Nike232/Nike232.github.io.git`.
- `F:\blog\Nike232.github.io` is an older secondary checkout. Do not edit or deploy from it unless the user explicitly asks.
- The production site is `tomfng.space`; the admin entry is `/admin/`.

## Product Direction

- The admin editor should feel like a native Typora-style Markdown editor: light, minimal, inline-rendered, keyboard-friendly, and comfortable for long-form writing.
- Preserve the current visual direction and improve features in place. Do not replace it with a generic dashboard or a split-pane Markdown preview.
- Keep Markdown as the stored source of truth. Live rendering, Vim mode, source mode, categories, local autosave, OAuth ownership, image uploads, and one-click publishing must continue to work together.

## Repository Map

- `source/admin/index.md`: admin page markup.
- `source/admin/admin.js`: editor, workspace, authentication, publishing, and interaction logic.
- `source/note-tools.css`: shared public-note and admin styling.
- `source/note-utils.js`: shared Markdown parsing and pure editor helpers. Add focused tests for reusable behavior here.
- `source/notes/`: public note-reading page.
- `source/_posts/`: published Hexo Markdown articles.
- `source/images/posts/`: uploaded article images.
- `admin-worker/`: Cloudflare Worker for GitHub OAuth, repository reads/writes, image uploads, and publish status.
- `test/`: site and editor utility tests.
- `public/`: generated output. Never make source edits directly in this directory.

## Local Commands

Run site commands from `F:\blog\blog`:

```powershell
npm install
npm test
npm run clean
npm run build
npx hexo server -p 4001
```

Run Worker checks from `F:\blog\blog\admin-worker`:

```powershell
npm install
npm test
npx wrangler deploy --dry-run
```

Use `http://[::1]:4001/admin/` for local admin verification. The Worker CORS configuration already allows port `4001`.

## Verification

- Before editing, inspect `git status` and preserve all existing user or in-progress changes.
- For editor changes, run `npm test`, `node --check source/admin/admin.js`, `node --check source/note-utils.js`, and `git diff --check`.
- For Worker changes, also run the Worker tests and Wrangler dry run.
- Build the site and verify relevant admin behavior in a real browser at desktop and mobile widths. Check the browser console for errors.
- After a build, generated `public/admin/admin.js` and `public/note-utils.js` should match their `source/` counterparts.
- When changing browser assets, bump their cache-busting query versions in `_config.redefine.yml`.

## Deployment

- Push source changes to the `source` branch. `.github/workflows/pages.yml` builds Hexo and publishes generated files to `main`; do not manually maintain `main`.
- Deploy `admin-worker` separately only when Worker code or configuration changes.
- Never commit OAuth secrets, GitHub tokens, session secrets, or local credentials.
- After pushing, verify both the Hexo workflow and GitHub Pages deployment, then confirm the production page loads the new asset versions.
