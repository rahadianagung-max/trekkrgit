/* Injects a "Player Login / Akun" link into the site nav (desktop + mobile).
   Points to /login: logged-out players sign in there; logged-in players are
   auto-forwarded to their own passport. Idempotent. */
(function () {
  var onMain = location.hostname === "trekkr.online" || location.hostname.endsWith(".vercel.app");
  var href = (onMain ? "" : "https://trekkr.online") + "/login";
  var loggedIn = false;
  try { loggedIn = !!localStorage.getItem("trekkr_player_token"); } catch (e) {}
  var label = loggedIn ? "Akun" : "Player Login";
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
