# Deploy to GitHub Pages

## 1. Repo and base path

- The app is built with **base path** `/xc_2026/` (see `vite.config.ts`).
- If your GitHub repo is **not** named `xc_2026`, change `base` in `vite.config.ts` to your repo name, e.g. `base: "/my-repo-name/"`.

## 2. Push to GitHub

From your repo root (e.g. `xc_2026`):

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/xc_2026.git
git branch -M main
git push -u origin main
```

(If the repo already exists, just push as usual.)

## 3. Turn on GitHub Pages

1. On GitHub: **Settings** → **Pages**.
2. Under **Build and deployment**:
   - **Source**: **GitHub Actions**.

No need to choose a branch; the workflow deploys the built app.

## 4. Run the workflow

- **Automatic**: every push to `main` runs the workflow and deploys.
- **Manual**: **Actions** → **Deploy to GitHub Pages** → **Run workflow**.

## 5. Open the site

After the first successful run:

**https://YOUR_USERNAME.github.io/xc_2026/**

(Use your repo name instead of `xc_2026` if you changed `base`.)

## Local build check

From `race-analyzer-app`:

```bash
npm run build
npx vite preview
```

Then open the URL Vite prints (and add the base path, e.g. `http://localhost:4173/xc_2026/`) to confirm assets and race data load.
