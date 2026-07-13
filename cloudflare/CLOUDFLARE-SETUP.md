# Cloudflare Setup — bluegrasscybersecurity.com

This site is served by **GitHub Pages** at the domain `www.bluegrasscybersecurity.com`.
GitHub Pages cannot emit custom security response headers (it ignores `_headers` files),
so we put **Cloudflare in front of GitHub Pages**. Cloudflare injects the headers, serves
Turnstile human-verification, and runs the signup Worker.

Everything in this folder is committed to the repo. The GitHub Pages deploy is untouched —
Cloudflare is a DNS/edge layer only.

---

## Part A — You do this (your accounts)

### 1. Create a free Cloudflare account
- Go to https://dash.cloudflare.com/sign-up and sign up (free plan is enough).
- Click **Add a Site**, enter `bluegrasscybersecurity.com`, choose the **Free** plan.

### 2. Point the domain at Cloudflare (nameserver change at your registrar)
- Cloudflare will show you two nameservers like `xxx.ns.cloudflare.com` / `yyy.ns.cloudflare.com`.
- Log in to **wherever you bought the domain** (the registrar — your HIGH_PRIORITY_TODO
  mentions registering it; that's the account to use).
- Replace the current nameservers with the two Cloudflare gave you.
- Wait for DNS propagation (can take minutes to a few hours; Cloudflare shows status).
- Back in Cloudflare, the site status will flip to **Active** once it sees the new NS records.

### 3. Add the DNS records (Cloudflare → GitHub Pages)
In Cloudflare **DNS** > **Records**, add (the orange "Proxied" cloud should be ON for both):

| Type | Name | Content                         | Proxy |
|------|------|---------------------------------|-------|
| A    | @    | 185.199.108.153                 | Proxied |
| A    | @    | 185.199.109.153                 | Proxied |
| A    | @    | 185.199.110.153                 | Proxied |
| A    | @    | 185.199.111.153                 | Proxied |
| CNAME| www  | McBoop69420.github.io           | Proxied |

(The four GitHub Pages IPs and the `*.github.io` target are the standard GitHub Pages values.
The existing `CNAME` file in this repo keeps GitHub Pages serving the right hostname; Cloudflare
proxies in front of it.)

### 4. SSL/TLS
- **SSL/TLS** > **Overview**: set mode to **Full** (not "Flexible" — GitHub Pages serves a valid
  cert, so Full avoids a plaintext hop). Do NOT use Strict unless you've enabled GitHub Pages'
  "Enforce HTTPS" with the Cloudflare cert; **Full** is the safe default here.

### 5. Turnstile (human verification widget)
- **Turnstile** > **Create widget**.
- Domains: `bluegrasscybersecurity.com`, `www.bluegrasscybersecurity.com`.
- Copy the **Site Key** and **Secret Key**.
- Replace every `__TURNSTILE_SITEKEY__` in `index.html` and `contact.html` with the Site Key.
  (If you'd rather have Cloudflare inject it, you can set the sitekey via a Transform Rule that
  rewrites the HTML — but the simple path is the find/replace.)
- Give the **Secret Key** to me (or set it yourself with `wrangler secret put TURNSTILE_SECRET`).

### 6. Create the KV namespace for leads
- Run once (needs `wrangler` — see Part B, or I can do it if you share an API token):
  `wrangler kv namespace create LEADS`
- Copy the returned **id** into `cloudflare/wrangler.toml` as `binding.id`.

### 7. Security headers — Transform Rule
- **Rules** > **Transform Rules** > **Modify Response Header** > **Create rule**.
- Rule name: `BCS security headers`.
- **When incoming requests match:** `Hostname equals www.bluegrasscybersecurity.com` (and add a
  second OR condition for `bluegrasscybersecurity.com` if you serve the apex too).
- **Set the following response headers** (one row each; "Set" if absent, "Overwrite" if present):
  - `Content-Security-Policy` ← paste the full value from `cloudflare/csp.txt`
  - `Strict-Transport-Security` ← `max-age=31536000; includeSubDomains; preload`
  - `X-Content-Type-Options` ← `nosniff`
  - `Referrer-Policy` ← `strict-origin-when-cross-origin`
  - `Permissions-Policy` ← `accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()`
- Deploy. After a minute, verify with `curl -I https://www.bluegrasscybersecurity.com` — the headers
  above should appear (they did NOT before Cloudflare).

### 8. Deploy the signup Worker (Part B) — or hand me a token
The Worker in `cloudflare/worker.js` receives form posts at `/api/signup` and stores leads in KV.
Either:
  - You run the commands in Part B, or
  - You generate a Cloudflare **API token** (Account: `Workers Scripts` + `Account Filter Lists`
    + `Zone: DNS:Edit` for the zone) and give it to me — I'll create the KV namespace, set the
    secrets, and `wrangler deploy`, then `curl` the live headers and `/api/signup` to prove it works.

---

## Part B — Deploy the Worker (needs `wrangler`)

```bash
# one-time
npm install -g wrangler
wrangler login            # opens browser; authorizes this machine

cd cloudflare
# 1) KV namespace (do once; paste id into wrangler.toml)
wrangler kv namespace create LEADS

# 2) secrets (Cloudflare prompts for each value)
wrangler secret put TURNSTILE_SECRET
wrangler secret put EXPORT_SECRET      # any long random string; used to download CSV

# 3) deploy
wrangler deploy
```

After deploy, the Worker is on the route `www.bluegrasscybersecurity.com/api/*` (and apex).
Test locally (without a real Turnstile token) by temporarily allowing posts, or test live after
Cloudflare is active: a real browser submit that passes Turnstile will write a KV entry.

### Download leads
The Worker exposes a CSV export (protected by EXPORT_SECRET):
`https://www.bluegrasscybersecurity.com/api/leads/export?secret=YOUR_EXPORT_SECRET`
Open in a browser or `curl` it to get `bcs-leads.csv`.

---

## What changed in the repo (this branch)
- `index.html` / `contact.html`: forms now `POST` to `/api/signup` (same-origin) with a Turnstile
  widget + explicit consent checkbox; they degrade to `mailto:` if JS/Turnstile is unavailable.
- `js/signup.js` (new): handles fetch + Turnstile token + consent gate + status messages.
- `css/pages.css`: styles for consent label, Turnstile widget, and submission status.
- `cloudflare/worker.js` (new): the signup endpoint (Turnstile verify + KV store + CSV export).
- `cloudflare/wrangler.toml` (new): Worker deploy config (KV id placeholder to fill).
- `cloudflare/csp.txt` (new): canonical CSP (matches the Cloudflare Transform Rule).
- `cloudflare/CLOUDFLARE-SETUP.md` (new): this file.
- `_headers`: now documents that GitHub Pages ignores it; CSP updated to mirror csp.txt.
