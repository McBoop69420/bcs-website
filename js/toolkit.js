/**
 * Toolkit print buttons.
 *
 * Any element with a data-print attribute opens the browser's print dialog,
 * which is also how visitors save a tool as a PDF. This lives in a file rather
 * than an onclick attribute because the production Content Security Policy
 * blocks inline event handlers.
 */
(function () {
  "use strict";

  document.addEventListener("click", function (event) {
    var target = event.target;
    var button = target && target.closest ? target.closest("[data-print]") : null;
    if (!button) return;
    event.preventDefault();
    window.print();
  });
})();
