/**
 * Flux Track — LP capture. Include on the landing page:
 *   <script src="https://fluxtrack.com/track.js" data-checkout-selector="a.checkout-btn"></script>
 * Reads utm_content (clickid) from URL, persists it, injects it into the checkout link on click.
 * No clickid anywhere -> checkout still proceeds, just unattributed. Never blocks the buyer.
 */
(function () {
  var STORE_KEY = "flux_clickid";
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

  function readUtmsFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var out = {};
    UTM_KEYS.forEach(function (k) {
      var v = params.get(k);
      if (v) out[k] = v;
    });
    return out;
  }

  function persist(utms) {
    try {
      var payload = JSON.stringify(utms);
      localStorage.setItem(STORE_KEY, payload);
      sessionStorage.setItem(STORE_KEY, payload);
      var maxAge = 30 * 24 * 60 * 60; // 30 days
      document.cookie = STORE_KEY + "=" + encodeURIComponent(payload) + ";max-age=" + maxAge + ";path=/;SameSite=Lax";
    } catch { /* storage blocked — degrade silently, checkout still works unattributed */ }
  }

  function readStored() {
    try {
      var raw = localStorage.getItem(STORE_KEY) || sessionStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
      var match = document.cookie.match(new RegExp("(?:^|; )" + STORE_KEY + "=([^;]*)"));
      if (match) return JSON.parse(decodeURIComponent(match[1]));
    } catch { /* corrupt/blocked storage — treat as no clickid */ }
    return null;
  }

  var fromUrl = readUtmsFromUrl();
  var utms = Object.keys(fromUrl).length ? fromUrl : readStored();
  if (Object.keys(fromUrl).length) persist(fromUrl);
  if (!utms || !utms.utm_content) return; // nothing to attach — leave checkout links untouched

  function appendUtms(url) {
    try {
      var u = new URL(url, window.location.href);
      UTM_KEYS.forEach(function (k) {
        if (utms[k]) u.searchParams.set(k, utms[k]);
      });
      return u.toString();
    } catch {
      return url; // malformed href — leave as-is rather than break the link
    }
  }

  function wireLinks() {
    var selector = (document.currentScript && document.currentScript.getAttribute("data-checkout-selector")) || "a[href*='checkout']";
    document.querySelectorAll(selector).forEach(function (el) {
      if (el.dataset.fluxWired) return;
      el.dataset.fluxWired = "1";
      el.addEventListener("click", function () {
        el.href = appendUtms(el.href);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireLinks);
  } else {
    wireLinks();
  }
})();
