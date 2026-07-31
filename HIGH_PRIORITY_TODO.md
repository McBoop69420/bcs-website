# High Priority Security TODO

These items track the high-priority findings from the security audit.

## Domain Ownership and Hosting

- [x] Register `bluegrasscybersecurity.com`.
  - Confirmed via WHOIS on 2026-07-31: registered through Namecheap, created 2026-05-12, `clientTransferProhibited` (transfer lock active).

- [x] Configure DNS for `bluegrasscybersecurity.com`.
  - Apex and `www` both resolve through Cloudflare and serve the production site.
  - Domain lock is active per WHOIS above. MFA, domain privacy, and auto-renew live in the registrar account UI and can't be checked remotely — confirm these directly in the Namecheap dashboard.

- [x] Deploy this site to the new domain.
  - Confirmed 2026-07-31: `https://bluegrasscybersecurity.com/` and `https://www.bluegrasscybersecurity.com/` both serve this repository.
  - `http://` redirects to `https://` (301) on both apex and `www`.
  - Apex redirects to the canonical `www` host (301).

- [x] Prepare repository metadata for the new domain.
  - Canonical URLs, Open Graph URLs, JSON-LD, `robots.txt`, `sitemap.xml`, CSP image source, and email links now reference `bluegrasscybersecurity.com`.

## Email List Form

- [x] Remove the placeholder Formspree endpoint.
  - The email signup form now uses a controlled `mailto:` fallback instead of posting to an unconfigured third-party placeholder.

- [x] Replace the temporary signup fallback with a real email-list provider or controlled form endpoint.
  - Forms now POST to the Cloudflare Worker (`/api/signup`), which verifies Turnstile and stores leads in KV — this is the controlled endpoint, not a third-party placeholder.
  - Consent copy is present and required (`consent` checkbox) before submission.
  - CSP `form-action` is already scoped to `'self'`.
  - Rate limiting added 2026-07-31: `/api/signup` caps each IP at 5 requests per rolling 10-minute window via a KV-backed counter (`cloudflare/worker.js`), returning `429` past the cap.

## Post-Deploy Verification

- [x] Verify production response headers.
  - Confirmed 2026-07-31: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` are all present on the live response.

- [x] Verify live domain is no longer parked.
  - Confirmed 2026-07-31: homepage, products page, blog index, and one blog article all return 200 with real content; no parking/ad script signatures found.
