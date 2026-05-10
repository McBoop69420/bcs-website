# Security Hardening TODO

This list tracks medium and low priority findings from the static-site security audit.

## Medium Priority

- [x] Add deployable security headers for the production host.
  - Include `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and `frame-ancestors`.
  - Choose the right config format for the actual host, such as `_headers`, `netlify.toml`, `vercel.json`, `.htaccess`, or server/CDN rules.

- [x] Move inline event handlers into `js/main.js`.
  - Replace `onclick="toggleMenu()"` on navigation buttons with JavaScript event listeners.
  - Keep existing accessibility behavior for `aria-expanded` and menu close-on-link-click.

- [x] Reduce inline CSS so a stricter CSP can be used.
  - Move page-level `<style>` blocks into `css/style.css` or page-specific static CSS files.
  - Preserve current rendering on `index.html`, `products.html`, `blog.html`, `404.html`, `style-bible.html`, and all `blog/*.html` pages.

- [x] Decide how to handle inline JSON-LD under CSP.
  - Use a CSP nonce/hash strategy, or document why `script-src` needs to allow trusted inline JSON-LD.
  - Validate structured data after the CSP change.

## Low Priority

- [x] Self-host Google Fonts or replace them with the system font stack.
  - Remove external requests to `fonts.googleapis.com` and `fonts.gstatic.com` if self-hosting/replacing.
  - Update CSP font/style directives after the font decision.

- [x] Add a deployment security checklist to the README.
  - Include HTTPS redirect, HSTS, security headers, CSP validation, form endpoint verification, and post-deploy smoke checks.

- [ ] Review public third-party dependencies quarterly.
  - Confirm external links and loaded third-party resources remain intentional.
  - Re-check privacy and supply-chain exposure when new embeds, analytics, forms, or fonts are added.
