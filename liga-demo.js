/* Liga Trekkr — data contoh untuk demo leaderboard (belum tersambung ke engine).
   Dipakai liga-leaderboard.html (semua venue) dan liga-venue.html (per venue).
   Semua nama & venue fiktif; angka dibangkitkan deterministik (seed tetap). */
(function () {
  var CAT = { M: "Men", W: "Women", X: "Mixed" };
  var DIV = {
    D1: { name: "Division 1", tier: "Beginner – Upper Beginner", lo: 850, hi: 1199 },
    D2: { name: "Division 2", tier: "Lower Bronze – Bronze", lo: 1200, hi: 1799 },
    D3: { name: "Division 3", tier: "Upper Bronze – Silver", lo: 1800, hi: 2499 },
  };
  var VENUES = [
    { slug: "venue-a", name: "Venue A · Kemang", city: "Jakarta Selatan", area: "Jakarta", cats: [["M", "D1"], ["M", "D2"], ["W", "D2"]] },
    { slug: "venue-b", name: "Venue B · BSD", city: "Tangerang Selatan", area: "Tangerang", cats: [["W", "D1"], ["X", "D2"]] },
    { slug: "venue-c", name: "Venue C · PIK", city: "Jakarta Utara", area: "Jakarta", cats: [["M", "D2"], ["M", "D3"], ["X", "D1"]] },
    { slug: "venue-d", name: "Venue D · Dago", city: "Bandung", area: "Bandung", cats: [["M", "D1"], ["W", "D1"]] },
  ];
  var MEN = ["Andre Wijaya", "Bayu Pratama", "Dimas Saputra", "Rizky Hidayat", "Kevin Santoso", "Fajar Nugroho", "Aldo Kurniawan", "Hendra Gunawan", "Yoga Permana", "Bima Aditya", "Reza Firmansyah", "Galih Ramadhan", "Arif Setiawan", "Dodi Prasetyo", "Teguh Wibisono", "Gilang Mahendra"];
  var WOMEN = ["Nadia Putri", "Sarah Amelia", "Tiara Maharani", "Clara Wibowo", "Intan Lestari", "Maya Salsabila", "Dewi Anggraini", "Rani Oktavia", "Laras Ayu", "Citra Kirana", "Putri Handayani", "Anisa Rahma", "Sekar Arum", "Winda Paramita"];
  var MONTHS = [{ key: "2026-10", label: "October 2026" }, { key: "2026-09", label: "September 2026" }];

  function rng(seed) { var s = seed % 2147483647; if (s <= 0) s += 2147483646; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function hash(str) { var h = 7; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 1000003; return h + 1; }
  function pick(list, r, n) { var a = list.slice(), out = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(r() * a.length), 1)[0]); return out; }

  // Urutan ranking (standar internasional): W desc → H2H → PD desc → PF desc → PA asc.
  // H2H = mini-klasemen di antara pemain yang menang sama banyak: hanya match saat
  // mereka saling berhadapan (beda tim) yang dihitung. Data demo: hasil pertemuan
  // dibangkitkan deterministik per pasangan nama.
  function rest(a, b) { return b.pd - a.pd || b.pf - a.pf || a.pa - b.pa; }
  function rank(rows, key) {
    rows.sort(function (a, b) { return b.w - a.w; });
    var out = [], i = 0;
    while (i < rows.length) {
      var g = rows.filter(function (x) { return x.w === rows[i].w; });
      g.forEach(function (x) { x.h2h = 0; x.h2hN = 0; });
      for (var a = 0; a < g.length; a++) for (var b = a + 1; b < g.length; b++) {
        var pair = [g[a].name, g[b].name].sort(), r = rng(hash(key + "|" + pair.join("|")));
        var meet = Math.floor(r() * 3);
        for (var m = 0; m < meet; m++) {
          var aWins = r() < 0.5 + (g[a].pd - g[b].pd) / 80;
          (aWins ? g[a] : g[b]).h2h++; g[a].h2hN++; g[b].h2hN++;
        }
      }
      g.sort(function (x, y) { return (g.length > 1 ? y.h2h - x.h2h : 0) || rest(x, y); });
      out = out.concat(g); i += g.length;
    }
    out.forEach(function (x, j) { x.rank = j + 1; x.note = tieNote(x, out[j - 1]); });
    return out;
  }
  function tieNote(a, prev) {
    if (!prev || prev.w !== a.w) return "";
    if (prev.h2h !== a.h2h) return "split by H2H";
    if (prev.pd !== a.pd) return "split by PD";
    if (prev.pf !== a.pf) return "split by PF";
    if (prev.pa !== a.pa) return "split by PA";
    return "tie-break";
  }

  function board(venue, cat, div, month) {
    var r = rng(hash(venue.slug + cat + div + month));
    var d = DIV[div], n = 9 + Math.floor(r() * 6);
    var pool = cat === "W" ? WOMEN : MEN;
    var names = pick(pool, r, Math.min(n, pool.length));
    var partners = cat === "X" ? pick(WOMEN, r, names.length) : [];
    var rows = names.map(function (nm, i) {
      var skill = 0.72 - i * 0.03 + (r() - 0.5) * 0.1, sessions = 1 + Math.floor(r() * 4);
      var w = 0, l = 0, pf = 0, pa = 0;
      for (var m = 0; m < sessions * 8; m++) {
        var lose = Math.floor(r() * 4);
        if (r() < skill) { w++; pf += 4; pa += lose; } else { l++; pf += lose; pa += 4; }
      }
      var elo = Math.round(d.lo + (d.hi - d.lo) * (0.35 + skill * 0.6) + (r() - 0.5) * 80);
      elo = Math.max(d.lo, Math.min(d.hi, elo));
      return { name: nm, partner: partners[i] || "", sessions: sessions, matches: sessions * 8, w: w, l: l, pf: pf, pa: pa, pd: pf - pa, elo: elo, eloDelta: Math.round((r() - 0.35) * 60) };
    });
    rows = rank(rows, venue.slug + cat + div + month);
    var promoted = [];
    if (div !== "D3" && r() < 0.7) {
      var pn = pick(pool.filter(function (p) { return names.indexOf(p) < 0; }), r, 1)[0];
      if (pn) promoted.push({ name: pn, to: div === "D1" ? "Division 2" : "Division 3", when: month === "2026-10" ? "6 Oct" : "22 Sep" });
    }
    var loyal = rows.slice().sort(function (a, b) { return b.matches - a.matches || a.rank - b.rank; })[0];
    return { venue: venue, cat: cat, div: div, month: month, rows: rows, promoted: promoted, loyal: loyal };
  }

  function sessions(venue, cat, div, month) {
    var b = board(venue, cat, div, month), r = rng(hash("s" + venue.slug + cat + div + month));
    var dates = month === "2026-10" ? ["1 Oct", "8 Oct"] : ["3 Sep", "10 Sep", "17 Sep", "24 Sep"];
    return dates.map(function (dt) {
      var ppl = pick(b.rows, r, Math.min(9, b.rows.length)).map(function (p) {
        var w = Math.floor(r() * 9), pf = 0, pa = 0;
        for (var m = 0; m < 8; m++) { var lo = Math.floor(r() * 4); if (m < w) { pf += 4; pa += lo; } else { pf += lo; pa += 4; } }
        return { name: p.name, partner: p.partner, w: w, l: 8 - w, pf: pf, pa: pa, pd: pf - pa };
      });
      ppl = rank(ppl, "s" + venue.slug + cat + div + month + dt);
      return { date: dt, players: ppl };
    });
  }

  function nextSession(venue, cat, div) {
    var r = rng(hash("n" + venue.slug + cat + div));
    var days = ["Mon 13 Oct", "Tue 14 Oct", "Wed 15 Oct", "Thu 16 Oct", "Sat 18 Oct"];
    var cap = [9, 12, 16][Math.floor(r() * 3)];
    return { day: days[Math.floor(r() * days.length)], time: "19:00", cap: cap, left: Math.floor(r() * 5) };
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ini(n) { return String(n || "").split(/\s+/).map(function (w) { return w[0] || ""; }).join("").slice(0, 2).toUpperCase(); }
  function short(n) { var p = String(n).split(/\s+/); return p[0] + (p[1] ? " " + p[1][0] + "." : ""); }
  function pd(v) { return (v > 0 ? "+" : "") + v; }

  window.LigaDemo = { CAT: CAT, DIV: DIV, VENUES: VENUES, MONTHS: MONTHS, board: board, sessions: sessions, nextSession: nextSession, esc: esc, ini: ini, short: short, pd: pd };
})();
