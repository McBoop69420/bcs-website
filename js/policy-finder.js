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
