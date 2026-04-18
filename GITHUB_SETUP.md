# GitHub Repo Setup for horridors.com

## Step 1 — Create the GitHub account

1. Go to [github.com/signup](https://github.com/signup)
2. Use username: **`Horridors`** (exact casing — case insensitive but clean)
3. Use a different email than your LastmanAI account
   - Tip: Gmail supports `+` aliases, e.g. `yourname+horridors@gmail.com` routes to your main inbox
4. Verify email, set password, done

## Step 2 — Create the repo

1. After signing in as `Horridors`, go to [github.com/new](https://github.com/new)
2. **Repository name:** `horridors.github.io` (exactly this — it's a special GitHub Pages name)
3. **Public** (required for free GitHub Pages on a user site)
4. Do NOT tick "Add README", "Add .gitignore", or "Choose a license" — leave the repo empty
5. Click **Create repository**

## Step 3 — Push this folder to the repo

Two options — pick whichever you prefer.

### Option A — GitHub Desktop (easy, visual)

1. Download [desktop.github.com](https://desktop.github.com/)
2. Sign in as `Horridors`
3. **File → Add local repository** → select this `horridors-site` folder
4. It'll say "not a git repo — create one?" → click **create a repository**
5. **Publish repository** → name it `horridors.github.io`, uncheck "private"
6. Done — it's pushed

### Option B — Command line (if you have git installed)

```bash
cd horridors-site
git init
git add .
git commit -m "Initial commit — horridors.com"
git branch -M main
git remote add origin https://github.com/Horridors/horridors.github.io.git
git push -u origin main
```

You'll be prompted to log in — use a [Personal Access Token](https://github.com/settings/tokens) instead of your password (GitHub requires this now).

## Step 4 — Enable GitHub Pages

1. In the repo, click **Settings** → **Pages** (left sidebar)
2. Under **Source**, it should already say "Deploy from a branch"
3. Under **Branch**, select `main` and `/ (root)`, click **Save**
4. Wait ~1 minute — the site will be live at `https://horridors.github.io`

## Step 5 — Configure the custom domain

See [GODADDY_DNS_SETUP.md](./GODADDY_DNS_SETUP.md) for the full DNS walkthrough.

The short version:
1. Add 4 A records pointing to GitHub's IPs + 1 CNAME for `www`
2. Back in GitHub repo → Settings → Pages → Custom domain → enter `horridors.com`
3. Tick **Enforce HTTPS** once available

---

**Final result:** horridors.com shows the game, horridors.com/privacy shows the privacy policy.
