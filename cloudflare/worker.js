/**
 * BCS edge worker.
 *
 * Serves the whole site (route /*) by proxying GitHub Pages and injecting
 * the canonical security headers on every response. It also handles the
 * signup/lead-collection API (route /api/*) — Turnstile verification +
 * KV storage + a protected CSV export.
 *
 * Why proxy instead of a Cloudflare Transform Rule:
 *   The Free plan does not expose the "Modify Response Header" Transform
 *   Rule for programmatic (or, in this account's dashboard, visible)
 *   creation, so we inject the headers at the edge from the Worker. Same
 *   outcome, fully automatable.
 *
 * Secrets (wrangler secret put):
 *   TURNSTILE_SECRET  - Turnstile widget secret
 *   EXPORT_SECRET     - shared secret required to download the CSV export
 *
 * Bindings (wrangler.toml):
 *   LEADS  - Workers KV namespace
 */

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// GitHub Pages origin that actually hosts the static site. The zone's
// DNS is orange-clouded, but with a /* Worker route Cloudflare sends
// requests here instead of proxying, so we fetch the real origin directly.
const ORIGIN_HOST = "mcboop69420.github.io";

// Canonical CSP — single source of truth mirrors cloudflare/csp.txt.
const CSP = `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https://www.bluegrasscybersecurity.com; script-src 'self' https://challenges.cloudflare.com 'sha256-884w7bl91WYQj7mzuYBmwGY+y40qiioQcCegSdtt5z0=' 'sha256-Bjl/8HxUcB39yaYTvwVKApeUn/QwOP+gYAzho+ZBY0U=' 'sha256-HgDoNSa9QyCvVTpsEFBR0F/+CBLxvv7jpxmHbmoILPg=' 'sha256-Krsjpsjk0uGiul/SV1pZC4sIow/RlnUf4GqvpCJ4xU0=' 'sha256-LBo6nt183Hhh5MsyaRpDm+/skSTmIna5aK6slCExJZo=' 'sha256-LzVCBVm/40hGGRIWGz8U6WErJNeedCC0zHGyJsvNCWw=' 'sha256-n2JHBBnaPEetNPbqdy+CnC/IN6ro5j8+F7XkeppVCe0=' 'sha256-oub/SoTSmysjXHMKjzorq7JA8ScQLNe3sWhy/lyRsS0=' 'sha256-pbhGiE1An+LL9b9GavH6U9eZx49LOFcPkHBvqdYRPwc=' 'sha256-Pgl2iI1Z6NoWO2bYVmv1VfcUxPj3nOfNANlrnZlTxqE=' 'sha256-SbU7se08/XStXg943bPijHP0V57BHGvL0d51xlEhVPQ=' 'sha256-t33qVoidhyx7etkxyoAHuGCMVvpEnDJqLLOLIsP0Vtc=' 'sha256-ZL2zxjTyYKDPKIXEHrNXLKR/KW45hlukZAvGJZbsRNY='; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; frame-src https://challenges.cloudflare.com; child-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com; upgrade-insecure-requests; block-all-mixed-content`;

const SECURITY_HEADERS = {
  "Content-Security-Policy": CSP,
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy":
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
};

function addSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonResponse(body, status = 200) {
  const base = new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
  return addSecurityHeaders(base);
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

async function verifyTurnstile(token, secret, ip) {
  if (!token || !secret) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

async function handleSignup(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const email = (payload.email || "").trim();
  if (!isValidEmail(email)) {
    return jsonResponse({ ok: false, error: "A valid email is required" }, 422);
  }

  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "";
  const ok = await verifyTurnstile(payload.turnstileToken, env.TURNSTILE_SECRET, ip);
  if (!ok) {
    return jsonResponse({ ok: false, error: "Human verification failed" }, 403);
  }

  const record = {
    received_at: new Date().toISOString(),
    form_type: payload.form_type || "unknown",
    name: (payload.name || "").slice(0, 200),
    email,
    organization: (payload.organization || "").slice(0, 200),
    extra: payload.extra || {},
    ip_country: request.cf && request.cf.country ? request.cf.country : "",
  };

  const key = `lead:${Date.now()}:${crypto.randomUUID()}`;
  await env.LEADS.put(key, JSON.stringify(record));

  return jsonResponse({ ok: true, message: "Thanks — we'll be in touch." });
}

async function handleExport(request, env) {
  const url = new URL(request.url);
  const provided = url.searchParams.get("secret");
  if (!provided || provided !== env.EXPORT_SECRET) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }
  const { keys } = await env.LEADS.list();
  const rows = [];
  for (const k of keys) {
    const v = await env.LEADS.get(k.name);
    if (v) {
      try {
        rows.push(JSON.parse(v));
      } catch {
        /* skip malformed */
      }
    }
  }
  rows.sort((a, b) => (a.received_at < b.received_at ? 1 : -1));

  const header = ["received_at", "form_type", "name", "email", "organization", "ip_country"];
  const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const csv = [
    header.join(","),
    ...rows.map((r) => header.map((h) => esc(r[h])).join(",")),
  ].join("\n");

  const base = new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="bcs-leads.csv"',
      "cache-control": "no-store",
    },
  });
  return addSecurityHeaders(base);
}

async function proxyToOrigin(request) {
  // The zone is orange-clouded with A records pointing at GitHub Pages, so a
  // normal subrequest to the same URL is proxied by Cloudflare to the origin
  // (same path that served the site before the Worker existed). This avoids
  // hand-crafting the origin request, which GitHub Pages rejected from
  // Cloudflare egress IPs when targeted directly at *.github.io.
  const resp = await fetch(request);
  return addSecurityHeaders(resp);
}

export default {
  async fetch(request, env) {
    // Force HTTPS (covers Flexible SSL mode where the browser may arrive on http).
    const proto = request.headers.get("x-forwarded-proto");
    if (proto === "http") {
      const u = new URL(request.url);
      return Response.redirect(`https://${u.host}${u.pathname}${u.search}`, 301);
    }

    const url = new URL(request.url);
    if (url.pathname === "/api/signup") return handleSignup(request, env);
    if (url.pathname === "/api/leads/export") return handleExport(request, env);
    return proxyToOrigin(request);
  },
};
