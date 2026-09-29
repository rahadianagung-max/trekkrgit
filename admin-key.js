/* Trekkr admin key — kunci admin bertanda tangan (HMAC, berlaku 12 jam) untuk
   endpoint yang menulis ELO. Dipakai halaman admin tanpa layar login sendiri
   (re-admin, tourney/tournament-admin) dan panel venue admin.

   TrekkrAdminKey.get()          → kunci tersimpan ('' bila tidak ada)
   TrekkrAdminKey.valid(minMs)   → true bila kunci ada & belum kedaluwarsa
   TrekkrAdminKey.ensure()       → Promise<kunci>; tampilkan login bila perlu
   TrekkrAdminKey.fetch(url, o)  → fetch + header X-Admin-Key; 401 → login → ulang sekali
*/
(function () {
  var LS = "trekkr_admin_key";
  var API = (location.hostname === "trekkr.online" || (location.hostname.endsWith(".vercel.app") && location.hostname.startsWith("trekkrgit")))
    ? "/api" : "https://trekkr.online/api";

  function get() { try { return localStorage.getItem(LS) || ""; } catch (e) { return ""; } }
  function set(k) { try { if (k) localStorage.setItem(LS, k); else localStorage.removeItem(LS); } catch (e) {} }
  function payload(k) {
    try { return JSON.parse(atob(String(k).split(".")[0].replace(/-/g, "+").replace(/_/g, "/"))); } catch (e) { return null; }
  }
  function valid(minMs) {
    var p = payload(get());
    return !!(p && p.k === "admin" && Number(p.exp) > Date.now() + (minMs || 60000));
  }

  var pending = null;
  function login(reason) {
    if (pending) return pending;
    pending = new Promise(function (resolve, reject) {
      var wrap = document.createElement("div");
      wrap.setAttribute("style", "position:fixed;inset:0;z-index:99999;background:rgba(9,13,20,.72);display:flex;align-items:center;justify-content:center;padding:16px;font-family:'Plus Jakarta Sans',system-ui,sans-serif");
      wrap.innerHTML =
        '<form style="background:#fff;color:#090D14;border:2px solid #090D14;box-shadow:6px 6px 0 #FF5900;padding:20px;width:min(360px,100%)">' +
        '<div style="font:800 11px \'JetBrains Mono\',monospace;letter-spacing:.12em;text-transform:uppercase;color:#FF5900">Trekkr Admin</div>' +
        '<h3 style="margin:6px 0 4px;font:700 20px \'Space Grotesk\',sans-serif">Login admin</h3>' +
        '<p data-r style="margin:0 0 12px;font-size:13px;color:#475569"></p>' +
        '<input data-u autocomplete="username" placeholder="Username" style="width:100%;box-sizing:border-box;padding:10px;border:2px solid #090D14;margin-bottom:8px;font-size:14px">' +
        '<input data-p type="password" autocomplete="current-password" placeholder="Password" style="width:100%;box-sizing:border-box;padding:10px;border:2px solid #090D14;margin-bottom:8px;font-size:14px">' +
        '<div data-e style="display:none;color:#e03b30;font-size:12px;margin-bottom:8px"></div>' +
        '<div style="display:flex;gap:8px"><button type="button" data-c style="flex:1;padding:10px;border:2px solid #090D14;background:#fff;font-weight:700;cursor:pointer">Batal</button>' +
        '<button type="submit" style="flex:2;padding:10px;border:2px solid #090D14;background:#FF5900;color:#fff;font-weight:800;cursor:pointer">Login →</button></div></form>';
      var q = function (s) { return wrap.querySelector(s); };
      q("[data-r]").textContent = reason || "Aksi ini menulis ELO — login dengan akun admin Trekkr.";
      try { var u0 = localStorage.getItem("trekkr_user") || localStorage.getItem("trekkr_username"); if (u0) q("[data-u]").value = u0; } catch (e) {}
      function done(err, key) { wrap.remove(); pending = null; err ? reject(err) : resolve(key); }
      q("[data-c]").onclick = function () { done(new Error("Login admin dibatalkan.")); };
      q("form").onsubmit = function (ev) {
        ev.preventDefault();
        var e = q("[data-e]"); e.style.display = "none";
        fetch(API + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: q("[data-u]").value.trim(), password: q("[data-p]").value }) })
          .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "Login gagal"); return d; }); })
          .then(function (d) {
            if (!d.adminKey) throw new Error("Server tidak memberi kunci admin.");
            set(d.adminKey); done(null, d.adminKey);
          })
          .catch(function (x) { e.textContent = x.message || "Login gagal"; e.style.display = "block"; });
      };
      document.body.appendChild(wrap);
      setTimeout(function () { (q("[data-u]").value ? q("[data-p]") : q("[data-u]")).focus(); }, 50);
    });
    return pending;
  }

  function ensure(reason) { return valid() ? Promise.resolve(get()) : login(reason); }

  function withKey(opts, key) {
    var o = Object.assign({}, opts || {});
    var h = new Headers(o.headers || {});
    if (key) h.set("X-Admin-Key", key);
    o.headers = h;
    return o;
  }
  function afetch(url, opts) {
    return fetch(url, withKey(opts, get())).then(function (r) {
      if (r.status !== 401) return r;
      set("");
      return login("Sesi admin kedaluwarsa — login ulang untuk melanjutkan.").then(function (k) { return fetch(url, withKey(opts, k)); });
    });
  }

  window.TrekkrAdminKey = { get: get, valid: valid, ensure: ensure, login: login, fetch: afetch };
})();
