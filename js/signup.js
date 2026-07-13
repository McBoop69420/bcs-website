/**
 * BCS signup handling.
 *
 * Turns the mailto: forms into same-origin POSTs to /api/signup. Waits for the
 * Cloudflare Turnstile token, then submits the lead JSON. If JavaScript or
 * Turnstile fails, the form degrades to a mailto: link so the user is never
 * blocked. The actual recipient/handler is the Cloudflare Worker defined in
 * cloudflare/worker.js.
 *
 * Turnstile is loaded in the page via:
 *   <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
 * and each form carries a
 *   <div class="cf-turnstile" data-sitekey="PUBLIC_SITEKEY"></div>
 * whose key is injected by Cloudflare (or hardcoded once created).
 */

(function () {
  "use strict";

  function getTurnstileToken(widget) {
    // Returns the token string once the widget has solved, else "".
    if (!widget) return "";
    try {
      // turnstile.getResponse(widgetId) requires the widget id; the API also
      // exposes the token via the rendered input[name="cf-turnstile-response"].
      var hidden = widget.querySelector('input[name="cf-turnstile-response"]');
      if (hidden && hidden.value) return hidden.value;
      // Fallback: the global render may have stored the response on the node.
      if (widget.dataset.token) return widget.dataset.token;
    } catch (e) {
      /* ignore */
    }
    return "";
  }

  function setStatus(form, message, kind) {
    var el = form.querySelector(".form-status");
    if (!el) {
      el = document.createElement("p");
      el.className = "form-status";
      form.appendChild(el);
    }
    el.textContent = message;
    el.className = "form-status " + (kind || "info");
  }

  function degradeToMailto(form, data) {
    var subject = encodeURIComponent(data.subject || "BCS inquiry");
    var bodyLines = [];
    Object.keys(data).forEach(function (k) {
      if (k === "subject" || k === "form_type" || k === "turnstileToken") return;
      if (data[k]) bodyLines.push(k + ": " + data[k]);
    });
    var mailto =
      "mailto:info@bluegrasscybersecurity.com?subject=" +
      subject +
      "&body=" +
      encodeURIComponent(bodyLines.join("\n"));
    window.location.href = mailto;
  }

  function wireForm(form) {
    if (!form) return;
    var widget = form.querySelector(".cf-turnstile");

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var data = {
        form_type: (form.querySelector('input[name="form_type"]') || {}).value || "unknown",
        subject: (form.querySelector('input[name="subject"]') || {}).value || "",
      };
      var fields = form.querySelectorAll(
        'input[name], select[name], textarea[name]'
      );
      fields.forEach(function (f) {
        if (f.type === "hidden") return;
        if (f.name === "cf-turnstile-response") return;
        data[f.name] = f.value.trim();
      });

      var token = getTurnstileToken(widget);
      if (widget && !token) {
        setStatus(
          form,
          "Please complete the human verification checkbox.",
          "error"
        );
        if (window.turnstile && widget.dataset.widgetId) {
          window.turnstile.reset(widget.dataset.widgetId);
        }
        return;
      }
      data.turnstileToken = token;

      // Consent gate (only on the resources/email form).
      var consent = form.querySelector('input[name="consent"]');
      if (consent && !consent.checked) {
        setStatus(form, "Please check the consent box to continue.", "error");
        return;
      }

      setStatus(form, "Sending…", "info");

      fetch("/api/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      })
        .then(function (res) {
          return res.json().then(function (body) {
            return { ok: res.ok && body.ok, body: body };
          });
        })
        .then(function (r) {
          if (r.ok) {
            form.reset();
            setStatus(
              form,
              r.body.message || "Thanks — we'll be in touch shortly.",
              "success"
            );
            if (window.turnstile && widget && widget.dataset.widgetId) {
              window.turnstile.reset(widget.dataset.widgetId);
            }
          } else {
            // Server rejected (e.g. bad email / token). Degrade so the lead
            // is never lost.
            setStatus(
              form,
              "Submission failed — opening your email instead.",
              "error"
            );
            degradeToMailto(form, data);
          }
        })
        .catch(function () {
          setStatus(
            form,
            "Network error — opening your email instead.",
            "error"
          );
          degradeToMailto(form, data);
        });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    document
      .querySelectorAll("form[data-bcs-signup]")
      .forEach(wireForm);
  });
})();
