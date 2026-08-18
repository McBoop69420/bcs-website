# Bluegrass Cybersecurity Solutions Website

Static website for Bluegrass Cybersecurity Solutions, a cybersecurity consulting practice focused on risk assessments, policy development, exam prep, vendor management, MSP oversight, incident response, and board/regulatory reporting support.

The site is plain HTML, CSS, and JavaScript. There is no runtime build step or package dependency.

## Current Site

- Production domain: `https://www.bluegrasscybersecurity.com`
- Canonical host is controlled by `CNAME`
- Shared styling lives in `css/style.css` and `css/pages.css`
- Shared navigation behavior lives in `js/main.js`
- Security headers are documented for supported hosts in `_headers`
- Search indexing is guided by `robots.txt` and `sitemap.xml`

## Staging

`https://bcs.jaredluyster.com` is a Cloudflare Pages project connected directly to
this repo (Git integration, root output directory, no build step) — it auto-deploys
whatever is on `main` here, ahead of/alongside what's live on production. It's
separate infrastructure from the `jaredluyster.com` repo; only the custom domain
lives under that zone.

- `_headers`' `X-Robots-Tag: noindex, nofollow` rule takes effect there (Cloudflare
  Pages reads `_headers` natively) even though production ignores the same file.
- **Known gap:** the `cloudflare/worker.js` signup Worker only binds routes on the
  `bluegrasscybersecurity.com` zone, so `/api/signup` (used by the homepage and
  `contact.html` forms) 404s on staging. Staging is for visual/content review, not
  end-to-end form testing.

## Page Inventory

### Core Pages

- `index.html` - Homepage, service overview, trust proof, board/regulatory reporting CTA, and contact-style reporting form.
- `products.html` - Security policy templates and framework product page.
- `blog.html` - Blog index, newest first, with the current reporting CTA.
- `contact.html` - Consultation request page.
- `style-bible.html` - Brand, style, and component reference.
- `404.html` - Custom not-found page.

### Service Pages

- `risk-assessments.html`
- `exam-prep.html`
- `vendor-management.html`
- `msp-oversight.html`
- `policy-development.html`
- `incident-response.html`

### Blog Posts

Blog articles live in `blog/` as standalone HTML pages. Current posts include:

- `blog/ffiec-cat-sunset.html`
- `blog/kev-driven-vulnerability-management.html`
- `blog/logging-and-monitoring.html`
- `blog/it-exam-prep.html`
- `blog/glba-safeguards-rule.html`
- `blog/patch-management.html`
- `blog/incident-response-basics.html`
- `blog/business-continuity-planning.html`
- `blog/access-control-user-management.html`
- `blog/security-awareness-training.html`
- `blog/annual-risk-assessment.html`
- `blog/ffiec-vendor-management.html`

## Local Preview

Because this is a static site, most pages can be opened directly in a browser from the filesystem. For a closer production-style check, serve the folder locally:

```powershell
py -m http.server 8080 --bind 127.0.0.1
```

Then open:

```text
http://127.0.0.1:8080/index.html
```

Stop the server with `Ctrl+C` in the terminal that started it.

## Tests

The test suite uses Node's built-in test runner and has no third-party dependencies. Run it with:

```bash
npm test
```

Use `npm run test:watch` while developing. The suite covers Worker routing, signup validation,
Turnstile verification, KV writes and export pagination, CSV safety, security headers, form
integration, and CSP synchronization. Known review findings remain as executable `TODO` tests
until their production fixes land. GitHub Actions runs the same suite on pushes and pull requests.

## Blog Maintenance

This repository follows the local `AGENTS.md` maintenance rule:

- Check whether the blog is current whenever beginning work in this repo.
- `blog.html` should remain newest first.
- If the latest post is more than 7 days old, add current placeholder/post scaffolding as needed.
- Keep these surfaces in sync when adding or updating posts:
  - `blog.html`
  - `blog/*.html`
  - `sitemap.xml`

When adding a post, copy the structure from an existing `blog/*.html` article, update title/meta/JSON-LD/canonical fields, add a new card near the top of `blog.html`, and add the URL to `sitemap.xml` with the correct `lastmod`.

## Forms And CTAs

The homepage and contact forms submit to the Cloudflare Worker at `/api/signup`, with Turnstile
verification and KV-backed lead storage. Client-side failures degrade to a pre-populated email to
`info@bluegrasscybersecurity.com`. If the endpoint changes, update the `form-action` directive in
the canonical CSP so submissions remain permitted.

Current homepage framing is board and regulatory reporting: board-ready summaries, regulatory evidence, open findings, remediation tracking, and vendor/MSP reporting.

## Assets

- Logo and service images are in `Images/`.
- The active logo reference is `Images/logo-new.png`.
- Main service-card images use the `*-clean.png` files.
- Keep image filenames stable unless all HTML references are updated.

## Styling

Primary design tokens are defined in `css/style.css`:

- Primary blue: `#1e3a5f`
- Accent blue: `#2c5f8d`
- Light blue: `#4a90c7`
- Green: `#2d5016`
- Light green: `#5a7d3d`
- Gold: `#d4a017`

Most page-specific layout rules are in `css/pages.css`. The file includes styles extracted from individual pages as part of CSP hardening, so check for existing selectors before adding new ones.

## Deployment Checklist

Before publishing meaningful changes:

- Open or locally serve `index.html`, `blog.html`, `products.html`, `contact.html`, and one representative `blog/*.html` page.
- Confirm navigation links work from both root pages and nested blog pages.
- Confirm forms still have valid labels, required fields, and allowed `form-action` targets.
- If blog content changed, update `blog.html`, the article page, and `sitemap.xml`.
- If inline JSON-LD scripts changed, verify `_headers` CSP hashes still match the deployed content.
- Confirm production serves HTTPS and the expected security headers:
  - `Content-Security-Policy`
  - `Strict-Transport-Security`
  - `X-Content-Type-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`

## Git Notes

The primary branch is `main`, tracking `origin/main` at:

```text
https://github.com/McBoop69420/bcs-website
```

Keep commits focused by surface: content/copy changes, blog additions, styling changes, and deployment/security updates are easier to review when separated.
