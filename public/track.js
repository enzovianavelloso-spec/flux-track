/**
 * Flux Track — LP capture. Include on the landing page:
 *   <script src="https://fluxtrack.com/track.js" data-checkout-selector="a.checkout-btn" data-pixel-id="123456789"></script>
 * Reads utm_content (clickid) from URL, persists it, injects it into the checkout link on click.
 * No clickid anywhere -> checkout still proceeds, just unattributed. Never blocks the buyer.
 *
 * data-pixel-id (optional): loads the Meta Pixel and fires PageView + ViewContent on load,
 * InitiateCheckout on checkout-link click. event_id is clickid-based (`<clickid>-ic`) so the
 * server-side CAPI call in lib/meta/capi.ts's sendCheckoutEvents can dedup against it.
 * No pixel id -> browser-side Meta events are skipped entirely, server-side CAPI still works.
 */
(function () {
  var STORE_KEY = "flux_clickid";
  // clickid: alguns redirects mandam o id em param próprio além do utm_content. Persistir
  // os dois — sem ele, um refresh sem query perde a atribuição desse caminho.
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "clickid"];

  // document.currentScript vira null assim que o script sai do parse síncrono (ex: dentro
  // de callback de DOMContentLoaded) — captura os data-attributes já aqui em cima.
  var scriptEl = document.currentScript;
  var pixelId = scriptEl && scriptEl.getAttribute("data-pixel-id");
  var checkoutSelector = (scriptEl && scriptEl.getAttribute("data-checkout-selector")) || "a[href*='checkout']";

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

  // Meta Pixel base code (oficial, minificado) — só carrega se data-pixel-id foi passado.
  // PageView/ViewContent disparam pra todo visitante, com ou sem clickid: são sinal de
  // topo de funil pro Pixel, não dependem de atribuição pra ter valor pro Ads Manager.
  if (pixelId) {
    (function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
      t = b.createElement(e); t.async = true; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    window.fbq("init", pixelId);
    window.fbq("track", "PageView");
    window.fbq("track", "ViewContent");
  }

  /** Cookie `_fbp` que o próprio Pixel seta — casa o clique server-side (sales.fbp) com o browser. */
  function readFbp() {
    var match = document.cookie.match(/(?:^|; )_fbp=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
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
      // GGCheckout só ecoa de volta no webhook os campos utm_* que já mapeia (route.ts's
      // `utm()`) — um param solto tipo "fbp" nunca chegaria lá. utm_term é setado sempre
      // vazio em /r (app/r/route.ts) e nada mais o usa, então carona nele até o servidor
      // reconhecer o formato "fb.1...." e gravar em sales.fbp (route.ts).
      var fbp = readFbp();
      if (fbp && !utms.utm_term) u.searchParams.set("utm_term", fbp);
      return u.toString();
    } catch {
      return url; // malformed href — leave as-is rather than break the link
    }
  }

  function wireLinks() {
    document.querySelectorAll(checkoutSelector).forEach(function (el) {
      if (el.dataset.fluxWired) return;
      el.dataset.fluxWired = "1";
      el.addEventListener("click", function () {
        el.href = appendUtms(el.href);
        // event_id casa com o InitiateCheckout server-side em lib/meta/capi.ts
        // (sendCheckoutEvents usa `${sale.clickid}-ic`) — mesmo clickid, mesmo sufixo.
        if (pixelId && window.fbq) {
          window.fbq("track", "InitiateCheckout", {}, { eventID: utms.utm_content + "-ic" });
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireLinks);
  } else {
    wireLinks();
  }
})();
