/* ==========================================================================
   trekkr-card.js — kartu IG Story (1080×1920) dari data Player Passport.
   Tiga tema PlayRank League: "night" (poster gelap), "score" (scorecard
   kertas), "level" (volt level-up). Digambar di <canvas>, tanpa library.
   Isi penting berada di safe zone Story (y 210–1684) agar tidak tertutup UI IG.
   API: TrekkrCard.data(playerData) → model; TrekkrCard.render(canvas, model,
   theme) → Promise<canvas>.
   ========================================================================== */
(function (w) {
  var W = 1080, H = 1920, X0 = 72, X1 = W - 72, TOP = 210, BOT = H - 236;
  var INK = '#090D14', OR = '#FF5900', VOLT = '#D2F802', PAPER = '#F4F1EA', MUTED = '#94A3B8', SLATE = '#475569';
  var DISP = '"Space Grotesk", "Plus Jakarta Sans", sans-serif', MONO = '"JetBrains Mono", ui-monospace, monospace';
  var TIERS = [['Beginner', 0], ['Upper Beginner', 900], ['Lower Bronze', 1200], ['Bronze', 1500], ['Upper Bronze', 1800], ['Silver', 2100], ['Gold', 2500], ['Platinum', 3000]];

  // ---------- data ----------
  function tierOf(elo) {
    var i = 0; for (var k = 0; k < TIERS.length; k++) if (elo >= TIERS[k][1]) i = k;
    var cur = TIERS[i], nxt = TIERS[i + 1] || null;
    return { name: cur[0], min: cur[1], next: nxt ? nxt[0] : null, nextMin: nxt ? nxt[1] : null,
      pts: nxt ? nxt[1] - elo : 0, pct: nxt ? Math.max(2, Math.min(100, (elo - cur[1]) / (nxt[1] - cur[1]) * 100)) : 100 };
  }
  function fmtDate(s) {
    var d = new Date(String(s || '').slice(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    return d.getDate() + ' ' + ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'][d.getMonth()] + ' ' + d.getFullYear();
  }
  function data(pd) {
    var p = pd.player || {}, s = pd.stats || {}, ls = pd.lastSession || null;
    var hist = (pd.history || []).filter(function (e) { return e && e.elo != null; });
    var elo = Math.round(Number(s.currentElo) || 0);
    var words = String(p.name || '').trim().split(/\s+/).filter(Boolean);
    var games = ls && ls.games ? ls.games : [];
    var w = ls ? ls.w : (s.totalW || 0), l = ls ? ls.l : (s.totalL || 0);
    var gf = 0, ga = 0; games.forEach(function (g) { gf += Number(g.scoreFor) || 0; ga += Number(g.scoreAgainst) || 0; });
    var vr = (pd.venueRanks || [])[0] || null;
    var partner = '';
    if (games.length) { var cnt = {}; games.forEach(function (g) { cnt[g.partner] = (cnt[g.partner] || 0) + 1; });
      partner = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0] || ''; if (cnt[partner] < games.length) partner = ''; }
    var delta = ls ? Math.round(Number(ls.sessionDelta != null ? ls.sessionDelta : ls.delta) || 0) : null;
    return {
      name: String(p.name || ''), first: (words[0] || '').toUpperCase(), rest: words.slice(1).join(' ').toUpperCase(),
      initials: ((words[0] || '?')[0] + (words.length > 1 ? words[words.length - 1][0] : (words[0] || '?')[1] || '')).toUpperCase(),
      photo: p.photoUrl || '', elo: elo, tier: tierOf(elo), unrated: !!s.unrated,
      delta: delta, w: w, l: l, n: ls ? games.length : (s.totalMatches || 0), gf: gf, ga: ga,
      games: games.slice(-5).map(function (g) { return { r: g.resText || 'D', s: g.scoreFor + '–' + g.scoreAgainst }; }),
      moreGames: Math.max(0, games.length - 5), partner: partner,
      event: ls ? String(ls.venue || '').toUpperCase() : 'TREKKR PASSPORT', date: ls ? fmtDate(ls.date) : '',
      hasSession: !!ls,
      rank: vr ? { pct: vr.pct, rank: vr.rank, total: vr.total, g: /^(women|f)/i.test(vr.gender || '') ? 'WANITA' : 'PRIA', venue: String(vr.venue || '').toUpperCase() } : null,
      spark: hist.slice(-24).map(function (e) { return Number(e.elo); }),
      url: 'trekkr.online/player/' + String(p.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
    };
  }

  // ---------- drawing helpers ----------
  function font(ctx, f) { ctx.font = f; }
  function sp(ctx, str, x, y, ls, align) { // manual letter-spacing (Safari lacks ctx.letterSpacing)
    str = String(str); var tw = 0, i;
    for (i = 0; i < str.length; i++) tw += ctx.measureText(str[i]).width + (i < str.length - 1 ? ls : 0);
    var cx = align === 'right' ? x - tw : (align === 'center' ? x - tw / 2 : x);
    var a = ctx.textAlign; ctx.textAlign = 'left';
    for (i = 0; i < str.length; i++) { ctx.fillText(str[i], cx, y); cx += ctx.measureText(str[i]).width + ls; }
    ctx.textAlign = a; return tw;
  }
  function spW(ctx, str, ls) { var t = 0; str = String(str); for (var i = 0; i < str.length; i++) t += ctx.measureText(str[i]).width + (i < str.length - 1 ? ls : 0); return t; }
  function fit(ctx, str, weight, size, family, maxW, ls) { // shrink until it fits
    ls = ls || 0; var z = size;
    while (z > 20) { font(ctx, weight + ' ' + z + 'px ' + family); if (spW(ctx, str, ls * z) <= maxW) break; z -= 2; }
    return z;
  }
  function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  function box(ctx, x, y, w, h, bg, border, bw, shadow, sd) {
    if (shadow) rect(ctx, x + sd, y + sd, w, h, shadow);
    rect(ctx, x, y, w, h, border); if (bg) rect(ctx, x + bw, y + bw, w - 2 * bw, h - 2 * bw, bg);
  }
  function grid(ctx, color) {
    ctx.fillStyle = color;
    for (var x = 0; x < W; x += 72) ctx.fillRect(x, 0, 2, H);
    for (var y = 0; y < H; y += 72) ctx.fillRect(0, y, W, 2);
  }
  var LOGO = null; // /trekkr-logo.png (same origin → canvas stays exportable)
  function logo(ctx, x, y, color, slashBg) { // baseline y
    if (LOGO) {
      var lh = 50, lw = lh * LOGO.naturalWidth / LOGO.naturalHeight;
      if (color === INK && slashBg === INK) { // on the orange band: ink silhouette so it stays readable
        var o = document.createElement('canvas'); o.width = Math.ceil(lw); o.height = lh;
        var ox = o.getContext('2d'); ox.drawImage(LOGO, 0, 0, lw, lh); ox.globalCompositeOperation = 'source-in'; ox.fillStyle = INK; ox.fillRect(0, 0, lw, lh);
        ctx.drawImage(o, x, y - 44);
      } else ctx.drawImage(LOGO, x, y - 44, lw, lh);
      return;
    }
    font(ctx, 'italic 700 54px ' + DISP); ctx.fillStyle = color; ctx.textAlign = 'left';
    var t = sp(ctx, 'TREKKR', x, y, -1.5);
    font(ctx, 'italic 700 54px ' + DISP); var sw = ctx.measureText('//').width + 20;
    rect(ctx, x + t + 6, y - 46, sw, 58, slashBg); ctx.fillStyle = '#fff'; ctx.fillText('//', x + t + 16, y);
  }
  function photo(ctx, img, m, x, y, s) { // square photo (cover) or monogram fallback
    if (img) {
      var r = img.naturalWidth / img.naturalHeight, dw, dh;
      if (r > 1) { dh = s; dw = s * r; } else { dw = s; dh = s / r; }
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, s, s); ctx.clip();
      ctx.drawImage(img, x + (s - dw) / 2, y + (s - dh) / 2.6, dw, dh); ctx.restore(); return;
    }
    var g = ctx.createLinearGradient(x, y, x + s, y + s);
    g.addColorStop(0, '#FF7A2E'); g.addColorStop(.45, OR); g.addColorStop(1, '#B83A00');
    rect(ctx, x, y, s, s, g);
    ctx.fillStyle = 'rgba(9,13,20,.22)';
    for (var yy = y + 11; yy < y + s; yy += 22) for (var xx = x + 11; xx < x + s; xx += 22) {
      var k = ((xx - x) + (yy - y)) / (2 * s); if (k < .35) continue;
      ctx.beginPath(); ctx.arc(xx, yy, 2 + 3 * (k - .35), 0, 7); ctx.fill();
    }
    font(ctx, '700 ' + Math.round(s * .5) + 'px ' + DISP); ctx.fillStyle = 'rgba(255,255,255,.93)'; ctx.textAlign = 'center';
    sp(ctx, m.initials, x + s / 2, y + s / 2 + s * .18, -s * .03, 'center');
  }
  function lines2(ctx, a, b, x, y, weight, size, maxW, lh, c1, c2) { // name on two lines, shared size
    var z = Math.min(fit(ctx, a, weight, size, DISP, maxW, -.05), b ? fit(ctx, b, weight, size, DISP, maxW, -.05) : size);
    font(ctx, weight + ' ' + z + 'px ' + DISP);
    ctx.fillStyle = c1; sp(ctx, a, x, y + z * .8, -z * .05);
    if (b) { ctx.fillStyle = c2; sp(ctx, b, x, y + z * .8 + z * lh, -z * .05); }
    return y + z * .8 + (b ? z * lh : 0);
  }
  function label(ctx, str, x, y, color, size, align) { font(ctx, '800 ' + (size || 20) + 'px ' + MONO); ctx.fillStyle = color; return sp(ctx, str, x, y, (size || 20) * .14, align); }
  function signed(d) { return (d > 0 ? '+' : (d < 0 ? '−' : '±')) + Math.abs(d); }

  // ---------- A · NIGHT POSTER ----------
  function night(ctx, m, img) {
    rect(ctx, 0, 0, W, H, INK); grid(ctx, 'rgba(255,255,255,.045)');
    logo(ctx, X0, TOP + 54, '#fff', OR);
    label(ctx, m.date, X1, TOP + 22, MUTED, 22, 'right'); label(ctx, m.event.slice(0, 28), X1, TOP + 54, '#fff', 22, 'right');
    var py = TOP + 110, ps = 500;
    box(ctx, X0, py, ps, ps, null, '#fff', 6, OR, 24); photo(ctx, img, m, X0 + 6, py + 6, ps - 12);
    // sticker
    var up = m.delta != null && m.delta > 0;
    var sv = up ? signed(m.delta) : String(m.elo), sl = up ? '▲ ELO · ' + m.n + ' MATCH' : 'ELO RATING';
    ctx.save(); ctx.translate(X1 - 215, py + ps - 60); ctx.rotate(-4 * Math.PI / 180);
    box(ctx, -215, -120, 430, 240, VOLT, INK, 6, '#fff', 14);
    var z = fit(ctx, sv, '800', 156, MONO, 360, -.06); font(ctx, '800 ' + z + 'px ' + MONO); ctx.fillStyle = INK; sp(ctx, sv, -185, 30, -z * .06);
    label(ctx, sl, -185, 84, INK, 24);
    ctx.restore();
    var y = lines2(ctx, m.first, m.rest, X0, py + ps + 84, '700', 128, X1 - X0, .9, '#fff', OR);
    // stats
    y += 48; var bw = [270, 270, 356], bx = X0, vals = [[String(m.elo), OR], [m.w + '–' + m.l, '#fff']];
    ['ELO', 'RECORD', 'TIER'].forEach(function (k, i) {
      box(ctx, bx, y, bw[i], 150, INK, '#fff', 4); label(ctx, k, bx + 22, y + 40, MUTED, 19);
      if (i < 2) { font(ctx, '800 64px ' + MONO); ctx.fillStyle = vals[i][1]; sp(ctx, vals[i][0], bx + 22, y + 116, -2); }
      else { var t = m.tier.name.split(' '), a = t.length > 1 ? t.slice(0, -1).join(' ') : t[0], b = t.length > 1 ? t[t.length - 1] : '';
        var tz = Math.min(fit(ctx, a, '700', 38, DISP, bw[i] - 44), fit(ctx, b || a, '700', 38, DISP, bw[i] - 44)); font(ctx, '700 ' + tz + 'px ' + DISP); ctx.fillStyle = '#fff';
        if (b) { sp(ctx, a, bx + 22, y + 90, -1); sp(ctx, b, bx + 22, y + 90 + tz * 1.05, -1); } else sp(ctx, a, bx + 22, y + 108, -1); }
      bx += bw[i] + 20;
    });
    y += 150 + 40;
    // sparkline
    var sk = m.spark;
    if (sk.length > 1) {
      label(ctx, 'ELO JOURNEY', X0, y, MUTED, 19); label(ctx, Math.round(sk[0]) + ' → ' + m.elo, X1, y, MUTED, 19, 'right');
      var ch = 100, cy = y + 24, mn = Math.min.apply(0, sk) - 8, mx = Math.max.apply(0, sk) + 8, cw = X1 - X0 - 24;
      var px = function (i) { return X0 + 12 + i * cw / (sk.length - 1); }, pyf = function (v) { return cy + ch - (v - mn) / (mx - mn) * ch; };
      ctx.beginPath(); sk.forEach(function (v, i) { i ? ctx.lineTo(px(i), pyf(v)) : ctx.moveTo(px(i), pyf(v)); });
      ctx.lineTo(px(sk.length - 1), cy + ch); ctx.lineTo(px(0), cy + ch); ctx.closePath(); ctx.fillStyle = 'rgba(255,89,0,.14)'; ctx.fill();
      ctx.beginPath(); sk.forEach(function (v, i) { i ? ctx.lineTo(px(i), pyf(v)) : ctx.moveTo(px(i), pyf(v)); });
      ctx.strokeStyle = OR; ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.stroke();
      sk.forEach(function (v, i) { var last = i === sk.length - 1, r = last ? 15 : 6; rect(ctx, px(i) - r - 3, pyf(v) - r - 3, 2 * r + 6, 2 * r + 6, INK); rect(ctx, px(i) - r, pyf(v) - r, 2 * r, 2 * r, last ? VOLT : '#fff'); });
    }
    // rank + footer (anchored to the bottom of the safe zone)
    var fy = BOT - 96;
    if (m.rank) {
      font(ctx, '800 26px ' + MONO); var t = 'TOP ' + m.rank.pct + '%', tw = spW(ctx, t, 1.5) + 28;
      rect(ctx, X0, fy - 78, tw, 50, OR); ctx.fillStyle = '#fff'; sp(ctx, t, X0 + 14, fy - 43, 1.5);
      ctx.fillStyle = '#fff'; var rt = '#' + m.rank.rank + ' DARI ' + m.rank.total + ' ' + m.rank.g + ' · ' + m.rank.venue;
      var rz = fit(ctx, rt, '800', 26, MONO, X1 - X0 - tw - 18, .06); font(ctx, '800 ' + rz + 'px ' + MONO); sp(ctx, rt, X0 + tw + 18, fy - 43, rz * .06);
    }
    rect(ctx, X0, fy, X1 - X0, 4, '#fff');
    footer(ctx, fy + 70, '#fff', VOLT, '#CBD5E1', m);
  }
  function footer(ctx, y, c, accent, uc, m) {
    font(ctx, '700 46px ' + DISP); ctx.fillStyle = c; ctx.textAlign = 'left';
    var x = X0; x += sp(ctx, "What's ", x, y, -1.2); ctx.fillStyle = accent; x += sp(ctx, 'your', x, y, -1.2) + 12; ctx.fillStyle = c; sp(ctx, 'ELO?', x, y, -1.2);
    var parts = m.url.split('/player/');
    font(ctx, '700 22px ' + MONO); ctx.fillStyle = uc; sp(ctx, parts[0] + '/player/', X1, y - 26, .4, 'right'); sp(ctx, parts[1] || '', X1, y + 4, .4, 'right');
  }

  // ---------- B · SCORECARD ----------
  function score(ctx, m, img) {
    rect(ctx, 0, 0, W, H, PAPER); grid(ctx, 'rgba(9,13,20,.07)');
    rect(ctx, 0, 0, W, 600, OR);
    ctx.fillStyle = 'rgba(9,13,20,.14)';
    for (var yy = 13; yy < 600; yy += 26) for (var xx = 13; xx < W; xx += 26) { var k = xx / W; if (k < .45) continue; ctx.beginPath(); ctx.arc(xx, yy, 1.5 + 3 * (k - .45), 0, 7); ctx.fill(); }
    rect(ctx, 0, 600, W, 8, INK);
    logo(ctx, X0, TOP + 54, INK, INK);
    if (m.date) { font(ctx, '800 22px ' + MONO); var dt = m.date, dw = spW(ctx, dt, 3) + 32; rect(ctx, X1 - dw, TOP + 4, dw, 50, INK); ctx.fillStyle = '#fff'; sp(ctx, dt, X1 - 16, TOP + 38, 3, 'right'); }
    var hl = m.hasSession ? (m.l === 0 && m.w > 0 ? 'UNBEATEN' : (m.delta > 0 ? 'LEVEL UP' : (m.w > m.l ? 'WINNING' : 'GAME ON'))) : 'PASSPORT';
    var hz = fit(ctx, hl, '700', 188, DISP, X1 - X0, -.065); font(ctx, '700 ' + hz + 'px ' + DISP); ctx.fillStyle = INK; sp(ctx, hl, X0 - 4, TOP + 110 + hz * .74, -hz * .065);
    var sub = m.event + (m.date ? '' : ''); var sz = fit(ctx, sub, '800', 24, MONO, X1 - X0, .14); font(ctx, '800 ' + sz + 'px ' + MONO); ctx.fillStyle = '#fff'; sp(ctx, sub, X0, TOP + 110 + hz * .74 + 58, sz * .14);
    // who
    var wy = 690, ps = 340;
    box(ctx, X0, wy, ps, ps, null, INK, 6, INK, 18); photo(ctx, img, m, X0 + 6, wy + 6, ps - 12);
    var nx = X0 + ps + 40, nw = X1 - nx;
    var y = lines2(ctx, m.first, m.rest, nx, wy - 6, '700', 84, nw, .88, INK, INK);
    font(ctx, '800 20px ' + MONO); var tt = m.tier.name.toUpperCase(), tw2 = spW(ctx, tt, 2.4) + 32;
    box(ctx, nx, y + 26, tw2, 52, '#fff', INK, 4); ctx.fillStyle = INK; sp(ctx, tt, nx + 16, y + 60, 2.4);
    label(ctx, 'ELO RATING', nx, y + 130, SLATE, 20);
    font(ctx, '800 118px ' + MONO); ctx.fillStyle = OR; var ew = sp(ctx, String(m.elo), nx - 4, y + 238, -6);
    if (m.delta) { font(ctx, '800 40px ' + MONO); ctx.fillStyle = m.delta > 0 ? '#15803D' : '#B91C1C'; sp(ctx, (m.delta > 0 ? '▲' : '▼') + signed(m.delta), nx + ew + 10, y + 238, -1); }
    // sheet
    var sy = wy + ps + 50, sw = X1 - X0, hasG = m.games.length > 0, GH = 150, sh = (hasG ? 72 + GH : 0) + 124;
    box(ctx, X0, sy, sw, sh, '#fff', INK, 6, OR, 18);
    var cy = sy + 6;
    if (hasG) {
      var ht = 'MATCH SHEET' + (m.partner ? ' · W/ ' + m.partner.toUpperCase() : '');
      var hz2 = fit(ctx, ht, '800', 20, MONO, sw - 220, .12); font(ctx, '800 ' + hz2 + 'px ' + MONO); ctx.fillStyle = INK; sp(ctx, ht, X0 + 26, cy + 44, hz2 * .12);
      label(ctx, m.w + 'W · ' + m.l + 'L', X1 - 26, cy + 44, INK, 20, 'right');
      rect(ctx, X0, cy + 66, sw, 4, INK); cy += 70;
      var n = m.games.length, cw = (sw - 12) / 5;
      for (var i = 0; i < 5; i++) {
        var gx = X0 + 6 + i * cw; if (i) rect(ctx, gx - 2, cy, 4, GH, INK);
        var g = m.games[i]; if (!g) continue;
        var col = g.r === 'W' ? VOLT : (g.r === 'L' ? '#fff' : '#E2E8F0');
        box(ctx, gx + cw / 2 - 36, cy + 18, 72, 72, col, INK, 4);
        font(ctx, '800 40px ' + MONO); ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.fillText(g.r, gx + cw / 2, cy + 68);
        font(ctx, '800 30px ' + MONO); ctx.fillText(g.s, gx + cw / 2, cy + 128); ctx.textAlign = 'left';
      }
      rect(ctx, X0, cy + GH, sw, 4, INK); cy += GH + 4;
    }
    var half = (sw - 12) / 2;
    rect(ctx, X0 + 6 + half - 2, cy, 4, 118, INK);
    label(ctx, m.rank ? 'PERINGKAT ' + m.rank.g : 'MATCH', X0 + 32, cy + 40, SLATE, 19);
    font(ctx, '800 46px ' + MONO); ctx.fillStyle = INK; sp(ctx, m.rank ? 'TOP ' + m.rank.pct + '%' : String(m.n), X0 + 32, cy + 96, -1.4);
    label(ctx, m.tier.next ? 'MENUJU ' + m.tier.next.toUpperCase() : 'TIER', X0 + half + 32, cy + 40, SLATE, 19);
    font(ctx, '800 46px ' + MONO); ctx.fillStyle = INK; sp(ctx, m.tier.next ? m.tier.pts + ' PTS' : 'TERTINGGI', X0 + half + 32, cy + 96, -1.4);
    // games total + footer bar
    var fy = BOT - 102;
    rect(ctx, X0, fy, X1 - X0, 102, INK);
    if (hasG) {
      font(ctx, '700 96px ' + DISP); ctx.fillStyle = INK; var gx2 = X0; gx2 += sp(ctx, String(m.gf), gx2, fy - 34, -4.8); ctx.fillStyle = OR; gx2 += sp(ctx, '–', gx2, fy - 34, 0); ctx.fillStyle = INK; gx2 += sp(ctx, String(m.ga), gx2, fy - 34, -4.8);
      label(ctx, 'GAMES MENANG · KALAH', gx2 + 22, fy - 40, SLATE, 22);
    }
    font(ctx, '700 38px ' + DISP); ctx.fillStyle = '#fff'; var x = X0 + 28, by = fy + 64;
    x += sp(ctx, "What's ", x, by, -1); ctx.fillStyle = OR; x += sp(ctx, 'your', x, by, -1) + 10; ctx.fillStyle = '#fff'; sp(ctx, 'ELO?', x, by, -1);
    var parts = m.url.split('/player/'); font(ctx, '700 20px ' + MONO); ctx.fillStyle = VOLT;
    sp(ctx, parts[0] + '/player/', X1 - 28, fy + 44, .4, 'right'); sp(ctx, parts[1] || '', X1 - 28, fy + 74, .4, 'right');
  }

  // ---------- C · LEVEL-UP ----------
  function level(ctx, m, img) {
    rect(ctx, 0, 0, W, H, VOLT); grid(ctx, 'rgba(9,13,20,.08)');
    logo(ctx, X0, TOP + 54, INK, OR);
    label(ctx, m.event.slice(0, 28), X1, TOP + 22, INK, 22, 'right'); label(ctx, m.date, X1, TOP + 54, INK, 22, 'right');
    // big ELO + delta box
    var up = m.delta != null && m.delta > 0, bx = 200;
    var bz = fit(ctx, String(m.elo), '800', 330, MONO, X1 - X0 - bx - 30, -.085);
    font(ctx, '800 ' + bz + 'px ' + MONO); ctx.fillStyle = INK; sp(ctx, String(m.elo), X0 - 10, TOP + 110 + bz * .76, -bz * .085);
    ctx.save(); ctx.translate(X1 - 100, TOP + 110 + bz * .76 - 108); ctx.rotate(4 * Math.PI / 180);
    box(ctx, -100, -100, 200, 200, OR, INK, 6, INK, 12);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    if (up) { font(ctx, '800 60px ' + MONO); ctx.fillText('▲', 0, -12); var dz = fit(ctx, signed(m.delta), '800', 60, MONO, 170); font(ctx, '800 ' + dz + 'px ' + MONO); ctx.fillText(signed(m.delta), 0, 58); }
    else { font(ctx, '800 24px ' + MONO); ctx.fillText('REKOR', 0, -22); var rz = fit(ctx, m.w + '–' + m.l, '800', 64, MONO, 170); font(ctx, '800 ' + rz + 'px ' + MONO); ctx.fillText(m.w + '–' + m.l, 0, 44); }
    ctx.textAlign = 'left'; ctx.restore();
    var y = TOP + 110 + bz * .76 + 36;
    rect(ctx, X0, y, X1 - X0, 6, INK); label(ctx, 'ELO RATING · ' + m.tier.name.toUpperCase(), X0, y + 48, INK, 24);
    // photo + name
    var py = y + 100, ps = 420;
    box(ctx, X0, py, ps, ps, null, INK, 6, INK, 16); photo(ctx, img, m, X0 + 6, py + 6, ps - 12);
    var nx = X0 + ps + 36, nw = X1 - nx, parts = [m.first].concat(m.rest ? m.rest.split(' ') : []);
    var nz = 86; parts.forEach(function (t) { nz = Math.min(nz, fit(ctx, t, '700', 86, DISP, nw, -.05)); });
    if (parts.length > 3) parts = [parts[0], parts.slice(1, -1).join(' '), parts[parts.length - 1]], nz = Math.min(nz, fit(ctx, parts[1], '700', 86, DISP, nw, -.05));
    font(ctx, '700 ' + nz + 'px ' + DISP); ctx.fillStyle = INK;
    parts.forEach(function (t, i) { sp(ctx, t, nx, py + nz * .8 + i * nz * .88, -nz * .05); });
    var chip = m.n + ' MATCH · ' + m.w + ' MENANG'; font(ctx, '800 20px ' + MONO); var cw = spW(ctx, chip, 2.4) + 28;
    var ry = py + ps - 54; rect(ctx, nx, ry - 84, Math.min(cw, nw), 50, INK); ctx.fillStyle = '#fff'; sp(ctx, chip, nx + 14, ry - 50, 2.4);
    m.games.forEach(function (g, i) { box(ctx, nx + i * 62, ry - 14, 54, 54, g.r === 'W' ? '#fff' : (g.r === 'L' ? '#CBD5E1' : '#E2E8F0'), INK, 4); font(ctx, '800 30px ' + MONO); ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.fillText(g.r, nx + i * 62 + 27, ry + 24); ctx.textAlign = 'left'; });
    // tier progress
    var ly = py + ps + 60, lh = 214;
    rect(ctx, X0 + 16, ly + 16, X1 - X0, lh, OR); rect(ctx, X0, ly, X1 - X0, lh, INK);
    label(ctx, m.tier.name.toUpperCase() + ' · ' + m.tier.min, X0 + 32, ly + 54, MUTED, 21);
    if (m.tier.next) label(ctx, m.tier.next.toUpperCase() + ' · ' + m.tier.nextMin, X1 - 32, ly + 54, VOLT, 21, 'right');
    var bx0 = X0 + 32, bw = X1 - X0 - 64, byy = ly + 78;
    rect(ctx, bx0, byy, bw, 44, '#fff'); rect(ctx, bx0 + 4, byy + 4, bw - 8, 36, INK);
    var fw = (bw - 8) * m.tier.pct / 100;
    ctx.save(); ctx.beginPath(); ctx.rect(bx0 + 4, byy + 4, fw, 36); ctx.clip(); rect(ctx, bx0 + 4, byy + 4, fw, 36, OR);
    ctx.fillStyle = '#FF7A2E'; for (var s = -60; s < fw + 60; s += 36) { ctx.beginPath(); ctx.moveTo(bx0 + s, byy + 40); ctx.lineTo(bx0 + s + 18, byy + 40); ctx.lineTo(bx0 + s + 54, byy + 4); ctx.lineTo(bx0 + s + 36, byy + 4); ctx.fill(); }
    ctx.restore(); rect(ctx, bx0 + 4 + fw - 3, byy - 10, 6, 64, VOLT);
    font(ctx, '800 42px ' + MONO); ctx.fillStyle = VOLT; var tx = sp(ctx, m.tier.next ? m.tier.pts + ' poin' : 'Tier tertinggi', bx0, ly + 180, -1.2);
    font(ctx, '700 42px ' + DISP); ctx.fillStyle = '#fff'; sp(ctx, m.tier.next ? ' lagi naik ke ' + m.tier.next + '.' : ' tercapai.', bx0 + tx, ly + 180, -1.2);
    // rank
    var fy = BOT - 96;
    if (m.rank) {
      font(ctx, '800 96px ' + MONO); ctx.fillStyle = INK; var rw = sp(ctx, 'TOP ' + m.rank.pct, X0, fy - 42, -5.7);
      font(ctx, '800 48px ' + MONO); rw += sp(ctx, '%', X0 + rw, fy - 42, 0) + 22;
      var r1 = '#' + m.rank.rank + ' DARI ' + m.rank.total, r2 = 'PEMAIN ' + m.rank.g + ' · ' + m.rank.venue;
      var rz = fit(ctx, r2, '800', 22, MONO, X1 - X0 - rw, .12);
      label(ctx, r1, X0 + rw, fy - 84, INK, rz); label(ctx, r2, X0 + rw, fy - 50, INK, rz);
    }
    rect(ctx, X0, fy, X1 - X0, 6, INK);
    font(ctx, '700 44px ' + DISP); ctx.fillStyle = INK; sp(ctx, 'Cek ELO-mu →', X0, fy + 72, -1.3);
    var up2 = m.url.split('/player/'); font(ctx, '700 22px ' + MONO); ctx.fillStyle = INK;
    sp(ctx, up2[0] + '/player/', X1, fy + 44, .4, 'right'); sp(ctx, up2[1] || '', X1, fy + 74, .4, 'right');
  }

  var THEMES = { night: night, score: score, level: level };
  var _img = {};
  function loadImg(src) { // CORS image; null on failure → monogram
    if (!src) return Promise.resolve(null);
    if (_img[src]) return _img[src];
    _img[src] = new Promise(function (res) {
      var tryLoad = function (u, alt) {
        var im = new Image(); im.crossOrigin = 'anonymous';
        im.onload = function () { res(im); };
        im.onerror = function () { if (!alt && u.indexOf('i.ibb.co') > -1) tryLoad(u.indexOf('i.ibb.co.com') > -1 ? u.replace('i.ibb.co.com/', 'i.ibb.co/') : u.replace('i.ibb.co/', 'i.ibb.co.com/'), true); else res(null); };
        im.src = u;
      };
      tryLoad(src, false);
    });
    return _img[src];
  }
  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all(['700 100px "Space Grotesk"', 'italic 700 54px "Space Grotesk"', '800 100px "JetBrains Mono"', '700 22px "JetBrains Mono"']
      .map(function (f) { return document.fonts.load(f).catch(function () {}); })).then(function () {});
  }
  function render(canvas, m, theme) {
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    var lg = LOGO ? Promise.resolve(LOGO) : new Promise(function (res) { var im = new Image(); im.onload = function () { LOGO = im; res(im); }; im.onerror = function () { res(null); }; im.src = '/trekkr-logo.png'; });
    return Promise.all([fontsReady(), loadImg(m.photo), lg]).then(function (r) {
      var img = r[1], fn = THEMES[theme] || night;
      fn(ctx, m, img);
      if (img) { try { canvas.toDataURL('image/png').slice(0, 8); } catch (e) { fn(ctx, m, null); } } // tainted → monogram
      return canvas;
    });
  }
  w.TrekkrCard = { data: data, render: render, themes: ['night', 'score', 'level'] };
})(window);
