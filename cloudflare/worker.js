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

// Fields captured explicitly on the record; everything else the client
// submits is preserved under `extra` instead of being silently dropped.
const KNOWN_SIGNUP_FIELDS = new Set([
  "email",
  "turnstileToken",
  "cf-turnstile-response",
  "form_type",
  "subject",
  "name",
  "organization",
]);

// Turnstile's own widget posts the token as `cf-turnstile-response` (native
// <form> submission, no JS); the fetch()-driven path sends `turnstileToken`.
function extractTurnstileToken(payload) {
  if (typeof payload.turnstileToken === "string" && payload.turnstileToken) {
    return payload.turnstileToken;
  }
  if (typeof payload["cf-turnstile-response"] === "string") {
    return payload["cf-turnstile-response"];
  }
  return "";
}

async function parseSignupPayload(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    return Object.fromEntries(form.entries());
  }
  // Default to JSON (the JS-driven path); this also covers browsers that
  // omit a content-type on a plain-text body.
  return request.json();
}

function buildExtraFields(payload) {
  const extra = {};
  for (const [k, v] of Object.entries(payload)) {
    if (KNOWN_SIGNUP_FIELDS.has(k)) continue;
    if (typeof v === "string" && v) extra[k] = v.slice(0, 2000);
  }
  return extra;
}

// KV metadata is capped at 1024 bytes serialized, and that cap is on UTF-8
// bytes, not JS string length — multi-byte characters (CJK, emoji, etc.)
// make those diverge. Shrink `details` first since it's the only unbounded
// field, then fall back to `organization`/`name` for pathological cases
// where free-text fields alone exceed the cap.
const MAX_METADATA_BYTES = 1000;
const SHRINKABLE_METADATA_FIELDS = ["details", "organization", "name"];
const byteLength = (str) => new TextEncoder().encode(str).length;

function buildExportMetadata(record) {
  const meta = { ...record, details: JSON.stringify(record.extra || {}) };
  delete meta.extra;
  for (const field of SHRINKABLE_METADATA_FIELDS) {
    while (byteLength(JSON.stringify(meta)) > MAX_METADATA_BYTES && meta[field].length > 0) {
      meta[field] = meta[field].slice(0, Math.max(0, meta[field].length - 100));
    }
  }
  return meta;
}

// Cheap per-IP abuse guard for /api/signup. Turnstile stops bots but doesn't
// cap request *rate* — a solved token can be replayed to script rapid
// submissions. Reuses the LEADS KV binding rather than adding a new one.
// Each hit both increments the counter and refreshes its TTL, so sustained
// abuse stays capped instead of the window quietly resetting mid-flood; the
// tradeoff is a legit user retrying inside the window keeps the block alive
// too, which is an acceptable cost for a low-volume B2B contact form.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SECONDS = 600;

async function checkRateLimit(env, ip) {
  if (!ip) return true; // nothing to key on — fail open rather than block everyone behind it
  const key = `ratelimit:${ip}`;
  const current = await env.LEADS.get(key);
  const count = current ? parseInt(current, 10) || 0 : 0;
  if (count >= RATE_LIMIT_MAX) return false;
  try {
    await env.LEADS.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });
  } catch {
    // KV rejects more than one write/sec to the same key, so two requests
    // from the same IP inside one second can land here. The read above
    // already confirmed the request is under the cap — losing this
    // particular increment just means the counter undercounts slightly,
    // which is a better failure mode than a 500 on a legitimate submission.
  }
  return true;
}

async function handleSignup(request, env) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "";

  if (!(await checkRateLimit(env, ip))) {
    return jsonResponse(
      { ok: false, error: "Too many requests — please try again later." },
      429
    );
  }

  let payload;
  try {
    payload = await parseSignupPayload(request);
  } catch {
    return jsonResponse({ ok: false, error: "Invalid request body" }, 400);
  }

  const rawEmail = typeof payload.email === "string" ? payload.email : "";
  const email = rawEmail.trim();
  if (!isValidEmail(email)) {
    return jsonResponse({ ok: false, error: "A valid email is required" }, 422);
  }

  const ok = await verifyTurnstile(extractTurnstileToken(payload), env.TURNSTILE_SECRET, ip);
  if (!ok) {
    return jsonResponse({ ok: false, error: "Human verification failed" }, 403);
  }

  const record = {
    received_at: new Date().toISOString(),
    form_type: typeof payload.form_type === "string" ? payload.form_type : "unknown",
    name: (typeof payload.name === "string" ? payload.name : "").slice(0, 200),
    email,
    organization: (typeof payload.organization === "string" ? payload.organization : "").slice(0, 200),
    extra: buildExtraFields(payload),
    ip_country: request.cf && request.cf.country ? request.cf.country : "",
  };

  const key = `lead:${Date.now()}:${crypto.randomUUID()}`;
  await env.LEADS.put(key, JSON.stringify(record), {
    metadata: buildExportMetadata(record),
  });

  return jsonResponse({ ok: true, message: "Thanks — we'll be in touch." });
}

function isAuthorizedExport(request, env) {
  const auth = request.headers.get("authorization") || "";
  const [scheme, token] = auth.split(" ");
  return scheme === "Bearer" && !!token && token === env.EXPORT_SECRET;
}

async function handleExport(request, env) {
  if (!isAuthorizedExport(request, env)) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  // Leads are read straight from list() metadata (written at signup time),
  // never via a per-key get() — that keeps this to one KV operation per
  // page of up to 1000 keys no matter how many leads exist, instead of an
  // N+1 get() pattern that blows past the per-invocation subrequest limit.
  const rows = [];
  let cursor;
  do {
    const page = await env.LEADS.list(cursor ? { cursor } : {});
    for (const k of page.keys) {
      if (k.metadata) {
        rows.push(k.metadata);
        continue;
      }
      // Leads written before metadata existed have none, and would
      // otherwise be silently dropped from the export. This get() is
      // bounded to that legacy backlog — current writes always carry
      // metadata, so steady-state export stays at one list() per page.
      const raw = await env.LEADS.get(k.name);
      if (!raw) continue;
      const record = JSON.parse(raw);
      rows.push({ ...record, details: JSON.stringify(record.extra || {}) });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  rows.sort((a, b) => (a.received_at < b.received_at ? 1 : -1));

  const header = ["received_at", "form_type", "name", "email", "organization", "ip_country", "details"];
  // Neutralize spreadsheet formula injection: a cell beginning with
  // = + - @ is executed as a formula by Excel/Sheets on open.
  // https://owasp.org/www-community/attacks/CSV_Injection
  const esc = (s) => {
    let str = String(s ?? "");
    if (/^[=+\-@\t\r\n]/.test(str)) str = "'" + str;
    return `"${str.replace(/"/g, '""')}"`;
  };
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
