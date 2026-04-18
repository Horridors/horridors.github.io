# GoDaddy DNS Setup for horridors.com → GitHub Pages

Follow these steps after the GitHub repo is live.

## Step 1 — Log in to GoDaddy

1. Go to [dcc.godaddy.com](https://dcc.godaddy.com/control/portfolio) and sign in
2. Click **horridors.com** in your domain list
3. Click the **DNS** tab (or "Manage DNS")

## Step 2 — Delete existing parking records

GoDaddy adds default records when you register a domain. Delete these first:

- Any existing **A record** with name `@` (usually points to a GoDaddy parking IP)
- Any existing **CNAME** with name `www` (usually points to a GoDaddy forwarding URL)
- Any **Forwarding** rules under the "Forwarding" section (if present)

Leave alone: the `NS` records and `SOA` record — do NOT touch those.

## Step 3 — Add 4 A records for the apex (horridors.com)

Click **Add New Record** four times, one for each IP below:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | `185.199.108.153` | 1 Hour |
| A | @ | `185.199.109.153` | 1 Hour |
| A | @ | `185.199.110.153` | 1 Hour |
| A | @ | `185.199.111.153` | 1 Hour |

These are GitHub Pages' official IPs.

## Step 4 — Add CNAME for www

| Type | Name | Value | TTL |
|------|------|-------|-----|
| CNAME | www | `horridors.github.io` | 1 Hour |

**Note:** Replace `horridors` with your actual GitHub username if different.
The value MUST end with a period or GoDaddy may add one — both work.

## Step 5 — Save and wait for DNS propagation

- Click **Save** after adding each record
- DNS typically propagates in **10 minutes to 1 hour** (sometimes up to 24 hours)
- Check propagation at [dnschecker.org](https://dnschecker.org/#A/horridors.com) — you should see the 4 GitHub IPs globally

## Step 6 — Enable custom domain in GitHub Pages

1. Go to your repo → **Settings** → **Pages**
2. Under **Custom domain**, enter: `horridors.com`
3. Click **Save**
4. Wait for the green checkmark ("DNS check successful")
5. Tick **Enforce HTTPS** (may take a few minutes to become available while GitHub issues the SSL cert via Let's Encrypt)

## Step 7 — Verify it works

Open these URLs — all should show the Horridors game or privacy page:

- https://horridors.com
- https://www.horridors.com (should redirect to apex)
- https://horridors.com/privacy

## Troubleshooting

**"DNS check unsuccessful" in GitHub settings:**
- Wait longer (up to 24h in rare cases)
- Make sure you deleted the old parking A record — only the 4 GitHub IPs should exist for `@`

**"Your connection is not private" / SSL error:**
- GitHub is still issuing the Let's Encrypt cert — wait 15 min and retry
- Make sure "Enforce HTTPS" is ticked in Pages settings

**www.horridors.com doesn't work:**
- Check the CNAME record — name must be exactly `www`, value must be `<username>.github.io`

**Email (if you set up custom email later):**
- The apex A records above do NOT affect email. If you add email later (Google Workspace, etc.), add the `MX` records separately — they coexist fine.
