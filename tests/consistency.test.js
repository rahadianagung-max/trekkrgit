// Run: node tests/consistency.test.js — the calibration threshold and level/division
// bands must be identical in the backend, the shared API client copies and the Passport.
"use strict";
const assert = require("assert"), fs = require("fs"), vm = require("vm"), path = require("path");
const R = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const P = require("../passport-insights.js");
let pass = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { console.error("FAIL", name, "\n ", e.message); process.exitCode = 1; } };

const srv = R("api/sheet.js");
const CALIB = Number((srv.match(/const CALIB_MATCHES = (\d+);/) || [])[1]);
const fnSrc = srv.slice(srv.indexOf("function getTierName(elo)"), srv.indexOf('return "Beginner";') + 20);
const serverTier = vm.runInNewContext(fnSrc + ";getTierName");
const CLIENTS = ["trekkr-api.js", "admin/trekkr-api.js", "player/trekkr-api.js", "venue/trekkr-api.js", "superadmin/trekkr-api.js"];
const client = (f) => { const c = { window: { location: { hostname: "trekkr.online" } }, localStorage: { getItem() { return null; } } }; vm.createContext(c); vm.runInContext(R(f) + ";this.T=TrekkrAPI;", c); return c.T; };

t("backend calibration threshold is defined", () => assert.ok(CALIB > 0));
t("Passport page threshold = backend", () => assert.strictEqual(Number((R("player/index.html").match(/const CALIB_THRESHOLD = (\d+);/) || [])[1]), CALIB));
t("rankings threshold = backend", () => ["rankings.html", "rankings/index.html"].forEach((f) => assert.strictEqual(Number((R(f).match(/MIN_TIER_MATCHES=(\d+)/) || [])[1]), CALIB, f)));
t("admin engine copy = backend", () => assert.strictEqual(Number((R("admin/index.html").match(/const CALIB_MATCHES = (\d+)/) || [])[1]), CALIB));
t("API client copies = backend", () => CLIENTS.forEach((f) => assert.strictEqual(client(f).MIN_TIER_MATCHES, CALIB, f)));
t("turnamenpadel engine = backend (if checked out)", () => {
  const tp = path.join(__dirname, "..", "..", "turnamenpadel", "api", "sheet.js");
  if (!fs.existsSync(tp)) return;
  assert.strictEqual(Number((fs.readFileSync(tp, "utf8").match(/const CALIB_MATCHES = (\d+);/) || [])[1]), CALIB);
});
t("no stale calibration copy (15 matches)", () => ["app/app.js", "player/index.html", "how-trekkr-works.html", "how-trekkr-works/index.html", "trekkr-loader.js", "about.html", "index.html", "rankings.html", "playrank.html"].forEach((f) =>
  assert.ok(!/(first|minimum|after) 15 (rated |recorded )?matches|15 recorded matches/i.test(R(f)), f)));
t("level bands: Passport = backend getTierName", () => { for (let e = 0; e <= 3600; e++) assert.strictEqual(P.tierOf(e).name, serverTier(e), "elo " + e); });
t("Liga divisions: Passport = API client getTierName", () => { const T = client("trekkr-api.js"); for (let e = 0; e <= 3600; e++) assert.strictEqual(P.divisionOf(e).name, T.getTierName(e), "elo " + e); });

console.log(pass + " passed" + (process.exitCode ? ", some FAILED" : ""));
