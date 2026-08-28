/* Injects an "Akun/Masuk" link into the site nav (desktop + mobile).
   Shows "Akun" when a player is logged in, otherwise "Masuk". Idempotent. */
(function () {
  var onMain = location.hostname === "trekkr.online" || location.hostname.endsWith(".vercel.app");
  var href = (onMain ? "" : "https://trekkr.online") + "/akun";
  var loggedIn = false;
  try { loggedIn = !!localStorage.getItem("trekkr_player_token"); } catch (e) {}
  var label = loggedIn ? "Akun" : "Masuk";
  function addTo(nav) {
    if (!nav || nav.querySelector("a[data-akun]")) return;
    var a = document.createElement("a");
    a.href = href; a.textContent = label; a.setAttribute("data-akun", "1");
    nav.appendChild(a);
  }
  function run() {
    document.querySelectorAll("nav.nav, nav.mobile-nav").forEach(addTo);
  }
  if (document.readyState !== "loading") run();
  else document.addEventListener("DOMContentLoaded", run);
})();
