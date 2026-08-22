/**
 * BCS Policy Finder.
 *
 * Drives the multi-step questionnaire on policy-finder.html: steps through
 * six radio-button questions, then scores the answers against the four
 * policy templates sold on products.html and reveals a results panel plus
 * the "done for you" upsell form.
 *
 * All markup this script touches (steps, result cards, upsell form) already
 * exists in the page at load time so js/signup.js can wire the upsell form
 * the normal way; this script only shows/hides and fills in text.
 */

(function () {
  "use strict";

  var TOTAL_STEPS = 6;

  var POLICY_NAMES = {
    infosec: "Information Security Policy",
    bcp: "Business Continuity Plan",
    vendor: "Vendor Management Policy",
    ir: "Incident Response Plan",
  };

  // Industry does not change which policies get recommended (that's Q3-Q6
  // only) — there's no industry-specific SKU on products.html yet. It only
  // personalizes the results copy and gets captured on the lead record.
  var INDUSTRY_COPY = {
    bank: {
      label: "Bank",
      blurb: "Banks are typically driven by FFIEC guidance and GLBA Safeguards requirements — examiners expect these policies to be current, approved, and evidenced.",
    },
    creditunion: {
      label: "Credit union",
      blurb: "Credit unions face similar oversight to banks (NCUA, GLBA Safeguards) — examiners expect the same board-approved, evidenced documentation.",
    },
    msp: {
      label: "MSP / IT service provider",
      blurb: "MSPs increasingly face CMMC/NIST 800-171 flow-down requirements from clients with federal contracts, plus general vendor due diligence expectations from the businesses you serve.",
    },
    medical: {
      label: "Medical or healthcare practice",
      blurb: "Healthcare practices are governed by HIPAA's Security and Privacy Rules — these policies map directly to what a HIPAA risk assessment or OCR audit expects to see.",
    },
    lawfirm: {
      label: "Law firm",
      blurb: "Law firms carry client confidentiality obligations under state bar ethics rules, plus increasing client-driven security requirements in engagement letters and RFPs.",
    },
    cpa: {
      label: "CPA or accounting firm",
      blurb: "CPA and accounting firms are subject to state board data-security expectations and the FTC Safeguards Rule when handling client tax and financial data.",
    },
    construction: {
      label: "Construction company",
      blurb: "Construction firms increasingly face security prequalification from GCs and public-sector clients, plus general obligations around project and client data.",
    },
    manufacturing: {
      label: "Manufacturer",
      blurb: "Manufacturers with defense or federal supply chain exposure face CMMC/NIST 800-171 requirements; others still need baseline protection for IP and operational systems.",
    },
    insurance: {
      label: "Insurance agency",
      blurb: "Insurance agencies are typically governed by state NAIC Insurance Data Security Model Law requirements for written information security programs.",
    },
    retail: {
      label: "Retail business",
      blurb: "Retail businesses handling card payments fall under PCI DSS requirements for protecting cardholder data.",
    },
    restaurant: {
      label: "Restaurant",
      blurb: "Restaurants processing card payments fall under PCI DSS requirements, with added exposure from POS systems and third-party delivery integrations.",
    },
    municipality: {
      label: "Municipality or local government",
      blurb: "Municipalities and local governments face public records obligations alongside state and local cybersecurity requirements, often with board/council reporting expectations.",
    },
    lender: {
      label: "Non-bank lender or fintech",
      blurb: "Non-bank lenders and fintechs are typically governed by GLBA and the FTC Safeguards Rule, with state-specific licensing requirements layered on top.",
    },
    other: {
      label: "Other regulated or small business",
      blurb: null,
    },
  };

  function byData(root, attr) {
    return root.querySelector("[data-" + attr + "]");
  }

  function init() {
    var app = document.querySelector("[data-finder-app]");
    var results = document.querySelector("[data-finder-results]");
    if (!app || !results) return;

    var form = byData(app, "finder-form");
    var progressText = byData(app, "finder-progress");
    var progressBar = byData(app, "finder-progress-bar");
    var backBtn = byData(app, "finder-back");
    var nextBtn = byData(app, "finder-next");
    var steps = Array.prototype.slice.call(app.querySelectorAll(".finder-step"));
    var restartBtn = byData(results, "finder-restart");

    var current = 1;

    function stepEl(n) {
      return steps.filter(function (s) {
        return Number(s.getAttribute("data-step")) === n;
      })[0];
    }

    function currentAnswer(n) {
      var s = stepEl(n);
      if (!s) return null;
      var checked = s.querySelector('input[type="radio"]:checked');
      return checked ? checked.value : null;
    }

    function updateProgress() {
      progressText.textContent = "Question " + current + " of " + TOTAL_STEPS;
      var pct = Math.round(((current - 1) / TOTAL_STEPS) * 100);
      progressBar.style.width = pct + "%";
    }

    function updateNextState() {
      nextBtn.disabled = !currentAnswer(current);
      nextBtn.textContent = current === TOTAL_STEPS ? "See My Results" : "Next";
    }

    function showStep(n) {
      steps.forEach(function (s) {
        s.hidden = Number(s.getAttribute("data-step")) !== n;
      });
      backBtn.hidden = n === 1;
      updateProgress();
      updateNextState();
    }

    steps.forEach(function (s) {
      s.addEventListener("change", updateNextState);
    });

    backBtn.addEventListener("click", function () {
      if (current > 1) {
        current -= 1;
        showStep(current);
      }
    });

    nextBtn.addEventListener("click", function () {
      if (!currentAnswer(current)) return;
      if (current < TOTAL_STEPS) {
        current += 1;
        showStep(current);
      } else {
        finish();
      }
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
    });

    function finish() {
      var answers = {
        q1: currentAnswer(1),
        q2: currentAnswer(2),
        q3: currentAnswer(3),
        q4: currentAnswer(4),
        q5: currentAnswer(5),
        q6: currentAnswer(6),
      };

      var recommended = [];
      if (answers.q3 !== "yes") recommended.push("infosec");
      if (answers.q4 !== "tested") recommended.push("bcp");
      if (answers.q5 !== "yes") recommended.push("vendor");
      if (answers.q6 !== "yes") recommended.push("ir");

      renderResults(answers, recommended);

      app.hidden = true;
      results.hidden = false;
      results.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function renderResults(answers, recommended) {
      var heading = byData(results, "finder-results-heading");
      var summary = byData(results, "finder-results-summary");
      var cards = Array.prototype.slice.call(
        results.querySelectorAll(".finder-result-card")
      );
      var summaryField = results.querySelector("[data-finder-summary-field]");
      var industryField = results.querySelector("[data-finder-industry-field]");
      var industry = INDUSTRY_COPY[answers.q1];

      cards.forEach(function (card) {
        var key = card.getAttribute("data-policy");
        card.hidden = recommended.indexOf(key) === -1;
      });

      summary.textContent = "";

      if (recommended.length === 0) {
        heading.textContent = "You're already covering the basics";
        addSummaryLine(
          summary,
          "Based on your answers, the core policies are already in place. A second set of eyes before an exam can still catch language that won't hold up under review."
        );
      } else {
        heading.textContent =
          recommended.length === 1
            ? "Here's the policy we'd start with"
            : "Here's what we'd recommend, in order";
        addSummaryLine(
          summary,
          "Based on your answers, these are the templates most likely to close your gaps."
        );
        if (recommended.length >= 3) {
          var bundleP = document.createElement("p");
          bundleP.appendChild(
            document.createTextNode(
              "With " +
                recommended.length +
                " templates on the list, the "
            )
          );
          var bundleLink = document.createElement("a");
          bundleLink.href = "products.html#bundles";
          bundleLink.textContent = "Complete Compliance Bundle";
          bundleP.appendChild(bundleLink);
          bundleP.appendChild(
            document.createTextNode(" is usually cheaper than buying them one at a time.")
          );
          summary.appendChild(bundleP);
        }
      }

      if (industry && industry.blurb) {
        addSummaryLine(summary, industry.blurb);
      }

      if (answers.q2 === "yes") {
        var p = document.createElement("p");
        p.appendChild(
          document.createTextNode(
            "Since you rely on an MSP, it's also worth having an independent set of eyes on that relationship — see "
          )
        );
        var link = document.createElement("a");
        link.href = "msp-oversight.html";
        link.textContent = "MSP oversight";
        p.appendChild(link);
        p.appendChild(document.createTextNode("."));
        summary.appendChild(p);
      }

      if (summaryField) {
        var names = recommended.map(function (key) {
          return POLICY_NAMES[key];
        });
        summaryField.value =
          names.length > 0
            ? "Recommended from the Policy Finder: " + names.join(", ") + "."
            : "Policy Finder result: core policies already in place — requesting a review.";
      }

      if (industryField) {
        industryField.value = industry ? industry.label : answers.q1 || "";
      }
    }

    function addSummaryLine(container, text) {
      var p = document.createElement("p");
      p.textContent = text;
      container.appendChild(p);
    }

    if (restartBtn) {
      restartBtn.addEventListener("click", function () {
        form.reset();
        current = 1;
        results.hidden = true;
        app.hidden = false;
        showStep(current);
        app.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    showStep(current);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
