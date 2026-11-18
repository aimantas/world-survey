/* Analytics loader, off by default.
   geography.aimantas.com counts page visits and finished games with cookie-free Plausible. To do the same on
   your copy, set DOMAIN to your site and SCRIPT to your Plausible (or compatible) script URL, and add that host
   to the Content-Security-Policy in build.py. It is skipped under Do Not Track and Global Privacy Control, and
   on any host other than DOMAIN, so local previews never report. The game calls
   window.plausible?.('Game Finished', { props: { mode, kind } }) when a game ends; nothing else is sent. */
(function () {
  var DOMAIN = '';
  var SCRIPT = '';
  var n = navigator;
  if (!DOMAIN || !SCRIPT) return;
  if (n.doNotTrack === '1' || window.doNotTrack === '1' || n.globalPrivacyControl === true) return;
  if (location.hostname !== DOMAIN) return;
  window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
  var s = document.createElement('script');
  s.defer = true;
  s.setAttribute('data-domain', DOMAIN);
  s.src = SCRIPT;
  document.head.appendChild(s);
})();
