(function () {
  function initMatomo(enabled) {
    if (!enabled) return;
    var _paq = window._paq = window._paq || [];
    _paq.push(['setTrackerUrl', 'https://stats.michaeluhrich.xyz/matomo.php']);
    _paq.push(['setSiteId', '2']);
    _paq.push(['setDoNotTrack', true]);
    _paq.push(['disableCookies']);
    _paq.push(['trackPageView']);
    _paq.push(['enableLinkTracking']);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://stats.michaeluhrich.xyz/matomo.js';
    document.head.appendChild(s);
  }

  var runtime = window.__UPLINK_RUNTIME__;
  if (runtime && runtime.analytics) {
    initMatomo(!!runtime.analytics.matomo);
  }
})();
