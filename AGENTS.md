# Project Notes for Codex

## Blog Maintenance

- Always check whether the blog is current when initializing work in this repository.
- The blog is intended to maintain a weekly cadence, newest first, on `blog.html`.
- If the latest post is more than 7 days old, preserve the existing structure and add placeholder/current-entry scaffolding as needed. Content quality can be refined later; keeping the structure, links, dates, sitemap entries, and article pages current is the priority.
- When adding or updating posts, keep these surfaces in sync:
  - `blog.html`
  - `blog/*.html`
  - `sitemap.xml`
- Verify local `file://` rendering paths still work after changes.
- The blog lives on `main` only. Write and publish posts on `main` (branch from it and open a PR), never on `staging`. `staging` receives posts by merging `main` into it; on a conflict in blog files, take `main`'s version.
- Keep the blog independent of the toolkit: no Toolkit nav item or other toolkit code or links in blog post pages. The toolkit stays off production until the owner says otherwise.
- Only `main` and `staging` branches should exist; delete working branches once merged.
