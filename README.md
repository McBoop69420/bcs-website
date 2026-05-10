# Bluegrass Compliance Solutions Website - Complete Package

## Website Files Included

### Main Pages
- **index.html** - Homepage with hero section, services, values, and contact
- **products.html** - Policy templates and bundle packages page
- **blog.html** - Blog listing page (dynamically loads blog posts)
- **services-ad.html** - Policy implementation services and BCS Certified program landing page

### Blog Posts
- **post-1.html** - Business Continuity Planning: Beyond the Checkbox
- **post-2.html** - 5 Common Policy Documentation Mistakes and How to Avoid Them
- **post-3.html** - Questions to Ask Your MSP About Their Security Practices
- **post-4.html** - GLBA Privacy Rule: What Changed in 2025
- **post-5.html** - Building a Risk Assessment Program That Works
- **post-6.html** - Understanding FFIEC Cybersecurity Assessment Tool Updates

### Templates & Documentation
- **blog-post-template.html** - Blank template for creating new blog posts
- **BLOG-INSTRUCTIONS.md** - Complete instructions for managing your blog
- **blog-posts.json** - JSON data file (reference - not needed if using embedded JS version)

## Getting Started

### 1. Upload Files to Your Web Host
Upload all HTML files to your web hosting server. Most hosting providers use:
- cPanel File Manager
- FTP/SFTP client (like FileZilla)
- Direct upload through hosting dashboard

### 2. Replace Placeholder Logo
All pages currently use a placeholder logo. Replace this line in each HTML file:
```html
<img src="https://via.placeholder.com/200x60/1e3a5f/ffffff?text=BCS+Logo" alt="Bluegrass Compliance Solutions">
```

With your actual logo:
```html
<img src="your-logo.png" alt="Bluegrass Compliance Solutions">
```

### 3. Update Contact Email
Find and replace all instances of:
```
index.html#contact
```

With your actual contact email or form URL if needed.

### 4. Update Product Links
In products.html, update the email links in the "Purchase" buttons to go to your actual order/contact system.

## Website Structure

```
your-website-root/
├── index.html              (Homepage)
├── products.html           (Products/Templates page)
├── blog.html              (Blog listing)
├── services-ad.html       (Services advertisement)
├── post-1.html            (Blog post)
├── post-2.html            (Blog post)
├── post-3.html            (Blog post)
├── post-4.html            (Blog post)
├── post-5.html            (Blog post)
├── post-6.html            (Blog post)
└── blog-post-template.html (Template for new posts)
```

## Adding New Blog Posts

See **BLOG-INSTRUCTIONS.md** for complete details. Quick summary:

1. Copy `blog-post-template.html`
2. Rename it to `post-7.html` (or next number)
3. Edit the content between the marked sections
4. Open `blog.html` and add entry to the `blogPosts` array
5. Upload both files to your server

## Color Scheme

Your website uses these Kentucky bluegrass-inspired colors:
- Primary Blue: #1e3a5f
- Accent Blue: #2c5f8d
- Light Blue: #4a90c7
- Green: #2d5016
- Light Green: #5a7d3d
- Gold: #d4a017

## Features

✅ Fully responsive design (mobile-friendly)
✅ Fixed navigation header
✅ Mobile hamburger menu
✅ All pages have consistent styling
✅ Blog system with individual post pages
✅ Service offerings clearly displayed
✅ Product templates with pricing
✅ Call-to-action sections throughout
✅ Professional footer

## Customization

All styling is contained within `<style>` tags in each HTML file. To change:
- **Colors**: Edit the `:root` CSS variables at the top
- **Fonts**: Change the `font-family` in the `body` selector
- **Layout widths**: Adjust `max-width` values in `.container` classes

## Browser Compatibility

This website works on:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Deployment Security Checklist

- Confirm the production domain serves this repository, not a registrar or parking page.
- Force HTTP to HTTPS at the host or CDN layer.
- Deploy the `_headers` file, or translate those headers into the equivalent host/CDN configuration.
- Verify these headers after deployment: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`.
- Replace the placeholder email signup endpoint before collecting form submissions.
- Smoke test `index.html`, `products.html`, `blog.html`, `style-bible.html`, and a representative `blog/*.html` page after any CSP or header change.
- Re-run structured data validation when blog JSON-LD content changes, because CSP hashes must stay in sync with inline JSON-LD.

## Need Help?

Refer to BLOG-INSTRUCTIONS.md for blog management, or contact support if you need assistance with:
- Custom modifications
- Additional pages
- Integration with other systems
- SEO optimization

## File Size Reference

- Homepage: ~1.2MB (includes full content)
- Products page: ~125KB
- Blog listing: ~12KB
- Individual blog posts: ~11-12KB each
- Services ad page: ~19KB

## Next Steps

1. Upload all files to your web server
2. Replace placeholder logo with your actual logo
3. Update contact information
4. Test all links and navigation
5. Add your domain's SSL certificate for HTTPS
6. Submit to Google Search Console
7. Start writing new blog posts!

---

© 2025 Bluegrass Compliance Solutions. All rights reserved.
