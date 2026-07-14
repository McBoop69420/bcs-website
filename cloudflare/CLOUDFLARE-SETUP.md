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

### 7. Security headers — injected by the Worker (not a Transform Rule)
Cloudflare **Free** does not expose the "Modify Response Header" Transform Rule for
programmatic (or, in this account, even dashboard-visible) creation. Instead the whole
site is routed through the Worker (`/*`), which proxies GitHub Pages and injects the 5
security headers on every response. This is handled entirely by `cloudflare/worker.js` —
**no dashboard Transform Rule to create.** The canonical header values live in
`cloudflare/csp.txt` and are mirrored in `worker.js` (`SECURITY_HEADERS` / `CSP`).

Verify live after deploy:
`curl -sI https://www.bluegrasscybersecurity.com` should show:
`Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`.

### 8. Deploy the signup Worker (Part B) — or hand me a token
The Worker in `cloudflare/worker.js` does two jobs on the `/*` route:
- proxies all static pages and injects the security headers, and
- handles `/api/signup` (Turnstile verify + KV store) and `/api/leads/export`
  (CSV export, gated by `EXPORT_SECRET`).

Either you run Part B, or you generate a Cloudflare **API token** with these scopes:
- Zone: DNS:Edit, SSL and Certificates:Edit, Transform Rules:Edit, **Workers Routes:Edit**
- Account: Turnstile:Edit, Workers Scripts:Edit, Workers KV Storage:Edit

(Email Routing could NOT be set via token — it was done in the dashboard. The token
above does not include Email Routing and is not needed for it.) Give me the token and
I'll create the KV namespace, set the secrets, `wrangler deploy --env production`, bind
the `/*` routes, then `curl` the live headers and `/api/signup` to prove it works.

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

# 3) deploy to the production env (routes are bound to bcs-signup-worker-production)
wrangler deploy --env production
```

The Worker is bound to the **`/*`** route on both `bluegrasscybersecurity.com` and
`www.bluegrasscybersecurity.com`, so it serves the entire site and injects headers.
Test live after Cloudflare is active: a real browser submit that passes Turnstile writes
a KV entry; `POST /api/signup` without a token returns `403`; `GET /api/leads/export`
without `?secret=` returns `401`.

### Download leads
The Worker exposes a CSV export (protected by EXPORT_SECRET):
`https://www.bluegrasscybersecurity.com/api/leads/export?secret=YOUR_EXPORT_SECRET`
Open in a browser or `curl` it to get `bcs-leads.csv`.

---

## Part C — Email Routing (`info@` → your inbox)

Cloudflare **Email Routing** forwards `info@bluegrasscybersecurity.com` to a verified
Gmail address. It is configured **in the dashboard only** (the API token used for the
Worker does not have Email Routing permission).

### Setup (done — recorded here for reference)
1. **Email** > **Email Routing** > **Onboard Domain** → `bluegrasscybersecurity.com`.
2. **Destination address:** `jared.luyster@gmail.com` → verify via the link Cloudflare
   emails to that inbox. (Status shows **Verified**.)
3. **Routing rule:** `info@bluegrasscybersecurity.com` → **Send to** `jared.luyster@gmail.com`.
4. **Activate** → Cloudflare adds its own DNS records and **removes** the old Namecheap
   `eforward*.registrar-servers.com` MX records. Resulting records:
   - MX `bluegrasscybersecurity.com` → `route1/2/3.mx.cloudflare.net`
   - TXT `bluegrasscybersecurity.com` → `v=spf1 include:_spf.mx.cloudflare.net ~all`
   - TXT `cf2024-1._domainkey.bluegrasscybersecurity.com` → DKIM

### Verify live
`dig +short MX bluegrasscybersecurity.com` (or `nslookup -type=MX bluegrasscybersecurity.com`)
should return the three `route*.mx.cloudflare.net` hosts. Send a test email to
`info@bluegrasscybersecurity.com` and confirm it lands in `jared.luyster@gmail.com`.

> To change the destination later: **Email** > **Email Routing** > **Destination Addresses**
> → add the new address, verify it, then edit the routing rule to target it.

---

## What changed in the repo (this branch)
- `index.html` / `contact.html`: forms now `POST` to `/api/signup` (same-origin) with a Turnstile
  widget + explicit consent checkbox; they degrade to `mailto:` if JS/Turnstile is unavailable.
- `js/signup.js` (new): handles fetch + Turnstile token + consent gate + status messages.
- `css/pages.css`: styles for consent label, Turnstile widget, and submission status.
- `cloudflare/worker.js` (new): the signup endpoint (Turnstile verify + KV store + CSV export).
- `cloudflare/wrangler.toml` (new): Worker deploy config (KV id placeholder to fill).
- `cloudflare/csp.txt` (new): canonical CSP (mirrored in `worker.js` `SECURITY_HEADERS`/`CSP`).
- `cloudflare/CLOUDFLARE-SETUP.md` (new): this file.
- `_headers`: now documents that GitHub Pages ignores it; CSP updated to mirror csp.txt.
