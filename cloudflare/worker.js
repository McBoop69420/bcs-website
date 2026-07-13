/**
 * BCS signup/lead collector worker.
 *
 * Deployed to Cloudflare (workers.dev for testing, then on the
 * bluegrasscybersecurity.com zone route /api/*). It receives a JSON
 * POST from the static site's js/signup.js, verifies the Cloudflare
 * Turnstile token, and appends the lead to a Workers KV namespace.
 *
 * Secrets (set with `wrangler secret put`):
 *   TURNSTILE_SECRET   - the Turnstile widget secret (from Cloudflare dashboard)
 *   EXPORT_SECRET      - shared secret required to download the CSV export
 *
 * Bindings (set in wrangler.toml):
 *   LEADS  - a Workers KV namespace (created with `wrangler kv namespace create LEADS`)
 *
 * The site's CSP sets form-action 'self' and connect-src 'self', so the
 * browser can only POST to this same-origin /api path. Turnstile is
 * verified server-side, so a spoofed client can't skip the challenge.
 */

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function isValidEmail(email) {
  // Pragmatic RFC-5322-lite check; Turnstile + KV are the real safeguards.
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

  // Only store what the form actually sent, plus server-side metadata.
  const record = {
    received_at: new Date().toISOString(),
    form_type: payload.form_type || "unknown",
    name: (payload.name || "").slice(0, 200),
    email,
    organization: (payload.organization || "").slice(0, 200),
    // Carry optional extra fields for the consultation form.
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

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="bcs-leads.csv"',
      "cache-control": "no-store",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/signup") return handleSignup(request, env);
    if (url.pathname === "/api/leads/export") return handleExport(request, env);
    return jsonResponse({ ok: false, error: "Not found" }, 404);
  },
};
