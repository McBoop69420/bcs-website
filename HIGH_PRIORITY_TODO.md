# High Priority Security TODO

These items track the high-priority findings from the security audit.

## Domain Ownership and Hosting

- [ ] Register `bluegrasscybersecurity.com`.
  - Local DNS checks on May 9, 2026 found no NS or A records, so the domain appears likely available.
  - Final availability and price must be confirmed at registrar checkout.

- [ ] Configure DNS for `bluegrasscybersecurity.com`.
  - Point apex and `www` records to the production host.
  - Enable registrar account MFA, domain privacy, auto-renew, and domain lock.

- [ ] Deploy this site to the new domain.
  - Confirm `https://bluegrasscybersecurity.com/` and `https://www.bluegrasscybersecurity.com/` serve this repository.
  - Redirect HTTP to HTTPS.
  - Redirect the non-canonical hostname to the canonical hostname.

- [x] Prepare repository metadata for the new domain.
  - Canonical URLs, Open Graph URLs, JSON-LD, `robots.txt`, `sitemap.xml`, CSP image source, and email links now reference `bluegrasscybersecurity.com`.

## Email List Form

- [x] Remove the placeholder Formspree endpoint.
  - The email signup form now uses a controlled `mailto:` fallback instead of posting to an unconfigured third-party placeholder.

- [ ] Replace the temporary signup fallback with a real email-list provider or controlled form endpoint.
  - Add spam protection and rate limiting.
  - Add consent/privacy copy before collecting production signups at scale.
  - Update CSP `form-action` when the production endpoint is selected.

## Post-Deploy Verification

- [ ] Verify production response headers.
  - Confirm CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy` are present.

- [ ] Verify live domain is no longer parked.
  - Check the homepage, products page, blog index, and one blog article.
  - Confirm no third-party parking/ad scripts are served.
