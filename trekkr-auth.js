/* ==========================================================================
   trekkr-auth.js — passwordless sign-in for the Trekkr website.
   - "Lanjutkan dengan Google" (Supabase OAuth; shown only when the Google
     provider is enabled in Supabase Auth, and hidden inside in-app browsers
     like Instagram/Facebook where Google blocks sign-in).
   - Email magic link + 6-digit code (sent by our API via Brevo).
   - Stores the session in localStorage under the existing key
     "trekkr_player_token" (plus refresh token + expiry) and refreshes it.
   All OAuth / magic-link returns land on /login, which calls consumeHash()
   and forwards to the page stored with setNext().
   ========================================================================== */
(function (w) {
  var SUPA_URL = "https://ftkbankqixnwssfrbqyc.supabase.co";
  var SUPA_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ0a2JhbmtxaXhud3NzZnJicXljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3ODg0MDEsImV4cCI6MjEwMzM2NDQwMX0.RWVf6xehxQ9BPSK3ykDW8cikP9O5gvGRINwj9TAMaJQ";
  var host = w.location.hostname;
  var API = (host === "trekkr.online" || (host.endsWith(".vercel.app") && host.startsWith("trekkrgit"))) ? "/api" : "https://trekkr.online/api";
  var HOME = (host === "trekkr.online" || host.endsWith(".vercel.app")) ? "" : "https://trekkr.online";
  var TK = "trekkr_player_token", RK = "trekkr_player_refresh", EK = "trekkr_player_exp";
  var NK = "trekkr_auth_next", CK = "trekkr_auth_consent", MK = "trekkr_auth_email";

  function ls(k, v) {
    try {
      if (v === undefined) return w.localStorage.getItem(k) || "";
      if (v === null) w.localStorage.removeItem(k); else w.localStorage.setItem(k, v);
    } catch (e) { return ""; }
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim()); }

  function gotrue(path, body) {
    return fetch(SUPA_URL + "/auth/v1/" + path, {
      method: "POST", headers: { apikey: SUPA_ANON, "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.msg || d.error_description || d.error || d.message || ("HTTP " + r.status));
        return d;
      });
    });
  }

  // ---- session storage ----
  function saveSession(d) {
    if (!d || !d.access_token) return false;
    ls(TK, d.access_token);
    if (d.refresh_token) ls(RK, d.refresh_token);
    var exp = d.expires_at ? Number(d.expires_at) * 1000 : (Date.now() + (Number(d.expires_in) || 3600) * 1000);
    ls(EK, String(exp));
    return true;
  }
  function clear() { ls(TK, null); ls(RK, null); ls(EK, null); }
  var _refreshing = null;
  // Current access token, refreshed when it is about to expire (or already has).
  function token() {
    var at = ls(TK), rt = ls(RK), exp = Number(ls(EK)) || 0;
    if (!at) return Promise.resolve("");
    if (!rt || !exp || exp - Date.now() > 90 * 1000) return Promise.resolve(at);
    if (!_refreshing) {
      _refreshing = gotrue("token?grant_type=refresh_token", { refresh_token: rt })
        .then(function (d) { saveSession(d); return d.access_token; })
        .catch(function () { return exp > Date.now() ? at : (clear(), ""); })
        .then(function (t) { _refreshing = null; return t; });
    }
    return _refreshing;
  }
  // Session in the URL hash after a Google / magic-link redirect.
  function consumeHash() {
    var h = new URLSearchParams((w.location.hash || "").replace(/^#/, ""));
    if (h.get("error_description") || h.get("error")) {
      return { error: h.get("error_description") || h.get("error") };
    }
    var at = h.get("access_token");
    if (!at) return null;
    saveSession({ access_token: at, refresh_token: h.get("refresh_token"), expires_in: h.get("expires_in"), expires_at: h.get("expires_at") });
    try { w.history.replaceState(null, "", w.location.pathname + w.location.search); } catch (e) {}
    return { ok: true, type: h.get("type") || "" };
  }

  // ---- where to go after sign-in ----
  function setNext(url) { if (url) ls(NK, url); }
  function takeNext() { var n = ls(NK); ls(NK, null); return (n && /^\/[^/]/.test(n)) ? n : ""; }

  // ---- consent (UU PDP) ----
  // Remember the checkbox until we have a session, then store it server-side.
  function flushConsent() {
    var c = ls(CK); if (!c) return Promise.resolve();
    return token().then(function (t) {
      if (!t) return;
      return fetch(API + "/account/consent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t, marketing: c === "1", source: "web" }),
      }).then(function (r) { if (r.ok) ls(CK, null); });
    }).catch(function () {});
  }

  // ---- providers ----
  var _settings = null;
  function settings() {
    if (!_settings) {
      _settings = fetch(SUPA_URL + "/auth/v1/settings", { headers: { apikey: SUPA_ANON } })
        .then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (d) { return { google: !!(d && d.external && d.external.google) }; })
        .catch(function () { return { google: false }; });
    }
    return _settings;
  }
  // Instagram / Facebook / Line / TikTok webviews: Google refuses OAuth there.
  function inApp() { return /Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly|; wv\)/i.test(navigator.userAgent || ""); }
  function googleSignIn(next, marketing) {
    setNext(next); ls(CK, marketing ? "1" : "0");
    var back = w.location.origin + "/login";
    if (!/^https:\/\/(trekkr\.online|[a-z0-9-]+\.vercel\.app)$/.test(w.location.origin)) back = "https://trekkr.online/login";
    w.location.href = SUPA_URL + "/auth/v1/authorize?provider=google&redirect_to=" + encodeURIComponent(back);
  }
  function sendLink(email, marketing, next) {
    setNext(next); ls(CK, marketing ? "1" : "0"); ls(MK, email);
    return fetch(API + "/account/magic-link", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, marketing: !!marketing, source: "magic-link" }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || ("HTTP " + r.status));
        return d;
      });
    });
  }
  // 6-digit code from the email (works across devices / in-app browsers).
  function verifyCode(email, code) {
    var body = { email: String(email || "").trim().toLowerCase(), token: String(code || "").replace(/\D/g, "") };
    var tries = ["email", "magiclink", "signup"], i = 0;
    function attempt(err) {
      if (i >= tries.length) return Promise.reject(err || new Error("Kode salah atau sudah kedaluwarsa."));
      body.type = tries[i++];
      return gotrue("verify", body).then(function (d) {
        if (!saveSession(d)) throw new Error("Kode salah atau sudah kedaluwarsa.");
        return flushConsent().then(function () { return d; });
      }).catch(attempt);
    }
    return attempt();
  }

  // ---- UI: sign-in box (Google + email link/code) ----
  // renderBox(el, { title, sub, next, onDone, compact })
  function renderBox(el, opt) {
    opt = opt || {};
    var id = "ta" + Math.random().toString(36).slice(2, 7);
    el.innerHTML =
      '<div class="ta-box">'
      + (opt.title ? '<h2 class="ta-t">' + opt.title + '</h2>' : '')
      + (opt.sub ? '<p class="ta-sub">' + opt.sub + '</p>' : '')
      + '<div id="' + id + 'g"></div>'
      + '<div class="ta-field"><label for="' + id + 'e">Email</label>'
      + '<input id="' + id + 'e" type="email" inputmode="email" autocomplete="email" placeholder="email@contoh.com" value="' + esc(ls(MK)) + '"/></div>'
      + '<label class="ta-consent"><input type="checkbox" id="' + id + 'c" checked/> <span>Saya mau menerima kabar ELO, hasil turnamen &amp; info event Trekkr lewat email. Bisa berhenti kapan saja.</span></label>'
      + '<button class="btn ta-send" id="' + id + 's" type="button">Kirim link masuk</button>'
      + '<div class="ta-msg" id="' + id + 'm" role="status"></div>'
      + '<div class="ta-code" id="' + id + 'k" hidden>'
      + '<p class="ta-sub">Cek email kamu 📩 Klik tombol <b>Masuk ke Trekkr</b>, atau ketik 6 digit kode dari email di sini:</p>'
      + '<div class="ta-row"><input id="' + id + 'o" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456"/>'
      + '<button class="btn" id="' + id + 'v" type="button">Masuk</button></div>'
      + '<button class="ta-link" id="' + id + 'r" type="button">Kirim ulang</button>'
      + '</div>'
      + '<p class="ta-fine">Tanpa password. Dengan masuk, kamu menyetujui <a href="' + HOME + '/about" target="_blank" rel="noopener">ketentuan &amp; kebijakan privasi</a> Trekkr.</p>'
      + '</div>';
    var $ = function (s) { return document.getElementById(id + s); };
    function msg(t, k) { var m = $("m"); m.textContent = t || ""; m.className = "ta-msg" + (k ? " " + k : ""); }
    settings().then(function (st) {
      if (!st.google) return;
      var g = $("g");
      if (inApp()) {
        g.innerHTML = '<p class="ta-note">Mau masuk dengan Google? Buka halaman ini di Chrome/Safari (menu ⋮ → "Buka di browser"). Atau pakai email di bawah.</p>';
        return;
      }
      g.innerHTML = '<button class="ta-google" type="button" id="' + id + 'gb">'
        + '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>'
        + '<span>Lanjutkan dengan Google</span></button><div class="ta-or"><span>atau pakai email</span></div>';
      $("gb").onclick = function () { googleSignIn(opt.next || "", $("c").checked); };
    });
    function doSend() {
      var e = ($("e").value || "").trim();
      if (!validEmail(e)) { msg("Masukkan email yang valid.", "err"); return; }
      var b = $("s"); b.disabled = true; b.textContent = "Mengirim…"; msg("");
      sendLink(e, $("c").checked, opt.next || "").then(function () {
        $("k").hidden = false; b.textContent = "Link terkirim ✓";
        msg("Link & kode masuk sudah dikirim ke " + e + ". Cek juga folder spam/promosi.", "ok");
        setTimeout(function () { var o = $("o"); if (o) o.focus(); }, 50);
      }).catch(function (err) { msg(err.message, "err"); b.disabled = false; b.textContent = "Kirim link masuk"; });
    }
    $("s").onclick = doSend;
    $("e").addEventListener("keydown", function (ev) { if (ev.key === "Enter") doSend(); });
    $("r").onclick = function () { $("s").disabled = false; doSend(); };
    function doVerify() {
      var e = ($("e").value || "").trim(), c = ($("o").value || "").replace(/\D/g, "");
      if (c.length < 6) { msg("Masukkan kode dari email.", "err"); return; }
      var b = $("v"); b.disabled = true; b.textContent = "…";
      verifyCode(e, c).then(function () {
        msg("Berhasil masuk ✓", "ok");
        if (opt.onDone) opt.onDone(); else w.location.href = takeNext() || (HOME + "/login");
      }).catch(function () { msg("Kode salah atau sudah kedaluwarsa. Minta kode baru.", "err"); b.disabled = false; b.textContent = "Masuk"; });
    }
    $("v").onclick = doVerify;
    $("o").addEventListener("keydown", function (ev) { if (ev.key === "Enter") doVerify(); });
  }

  // Minimal styles for the box (PlayRank League look, square corners).
  (function css() {
    if (document.getElementById("ta-css")) return;
    var st = document.createElement("style"); st.id = "ta-css";
    st.textContent = ".ta-box{display:block}.ta-t{margin:0 0 6px;font-family:'Space Grotesk',system-ui,sans-serif;font-weight:700;letter-spacing:-.02em}"
      + ".ta-sub{margin:0 0 14px;color:#475569;font-size:14px;line-height:1.5}"
      + ".ta-google{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;padding:13px 14px;background:#fff;color:#090D14;border:2px solid #090D14;box-shadow:3px 3px 0 #090D14;font:800 14px 'Plus Jakarta Sans',system-ui,sans-serif;cursor:pointer}"
      + ".ta-google:active{transform:translate(2px,2px);box-shadow:1px 1px 0 #090D14}"
      + ".ta-or{display:flex;align-items:center;gap:10px;margin:16px 0 6px;color:#64748B;font:700 10.5px 'JetBrains Mono',monospace;letter-spacing:.08em;text-transform:uppercase}"
      + ".ta-or:before,.ta-or:after{content:'';flex:1;height:1px;background:#E2E8F0}"
      + ".ta-field{margin:10px 0}.ta-field label{display:block;margin-bottom:6px}.ta-field input,.ta-row input{width:100%;box-sizing:border-box;padding:12px;font-size:15px}"
      + ".ta-consent{display:flex;gap:9px;align-items:flex-start;margin:6px 0 14px;font:500 12.5px/1.45 'Plus Jakarta Sans',system-ui,sans-serif !important;text-transform:none !important;letter-spacing:0 !important;color:#334155 !important}"
      + ".ta-consent input{margin-top:2px;width:16px;height:16px;flex:none;accent-color:#FF5900}"
      + ".ta-send{width:100%}.ta-msg{margin-top:10px;font-size:13px;min-height:1px}.ta-msg.err{color:#B91C1C}.ta-msg.ok{color:#15803D}"
      + ".ta-code{margin-top:16px;padding-top:14px;border-top:1px dashed #CBD5E1}.ta-row{display:flex;gap:8px}.ta-row input{flex:1;font:800 20px 'JetBrains Mono',monospace;letter-spacing:.3em;text-align:center}.ta-row .btn{width:auto;margin:0;padding:0 18px}"
      + ".ta-link{background:none;border:0;padding:8px 0;color:#FF5900;font:800 12px 'JetBrains Mono',monospace;text-transform:uppercase;letter-spacing:.05em;cursor:pointer}"
      + ".ta-note{margin:0 0 12px;padding:10px 12px;background:#FFF4EC;border:2px solid #090D14;font-size:12.5px;line-height:1.45}"
      + ".ta-fine{margin:14px 0 0;font-size:11.5px;color:#64748B;line-height:1.5}.ta-fine a{color:#090D14}";
    document.head.appendChild(st);
  })();

  w.TrekkrAuth = {
    API: API, HOME: HOME, SUPA_URL: SUPA_URL, SUPA_ANON: SUPA_ANON,
    token: token, saveSession: saveSession, clear: clear, consumeHash: consumeHash,
    setNext: setNext, takeNext: takeNext, flushConsent: flushConsent,
    settings: settings, inApp: inApp, googleSignIn: googleSignIn,
    sendLink: sendLink, verifyCode: verifyCode, renderBox: renderBox,
    session: function () { return { access_token: ls(TK), refresh_token: ls(RK) }; },
  };
})(window);
