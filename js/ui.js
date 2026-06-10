(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var banner = document.getElementById("gr-sticky-banner");
    if (!banner) return;

    var closeBtn = banner.querySelector("[data-banner-close]");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        banner.hidden = true;
        try {
          sessionStorage.setItem("gr_banner_closed", "1");
        } catch (e) {
          void e;
        }
      });
    }

    try {
      if (sessionStorage.getItem("gr_banner_closed") === "1") {
        banner.hidden = true;
      }
    } catch (e) {
      void e;
    }
  });
})();
