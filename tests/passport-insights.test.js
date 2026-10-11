// Run: node tests/passport-insights.test.js   (no dependencies)
"use strict";
const assert = require("assert");
const P = require("../passport-insights.js");
const DAY = 864e5, NOW = Date.parse("2026-10-11T12:00:00Z");
const at = (d) => new Date(NOW - d * DAY).toISOString();
let pass = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { console.error("FAIL", name, "\n ", e.message); process.exitCode = 1; } };

// history: INITIAL 1500 (120d ago), then wins/losses
const H = [
  { sessionId: "INITIAL", elo: 1500, delta: 0, w: 0, l: 0, timestamp: at(120) },
  { sessionId: "A", elo: 1527, delta: 27, w: 1, l: 0, timestamp: at(100) },
  { sessionId: "A", elo: 1549, delta: 22, w: 1, l: 0, timestamp: at(100) },
  { sessionId: "B", elo: 1531, delta: -18, w: 0, l: 1, timestamp: at(60) },
  { sessionId: "C", elo: 1561, delta: 30, w: 2, l: 0, timestamp: at(20) },  // one row, two matches
  { sessionId: "D", elo: 1566, delta: 5, w: 1, l: 0, timestamp: at(2) },
];

t("walkover names", () => {
  ["[Walk Over] 1", "Walk Out 2", "- Walk Out 1 -", "Fifi Yanti [walk Out]", "W/O"].forEach((n) => assert.ok(P.isWalkoverName(n), n));
  ["Walker Smith", "Novia Dewanty", ""].forEach((n) => assert.ok(!P.isWalkoverName(n), n));
});

t("tiers match official thresholds", () => {
  assert.deepStrictEqual([P.tierOf(899).name, P.tierOf(900).name, P.tierOf(1799).name, P.tierOf(1800).name, P.tierOf(3000).name],
    ["Beginner", "Upper Beginner", "Bronze", "Upper Bronze", "Platinum"]);
  assert.strictEqual(P.tierOf(1728).ptsAway, 72);
  assert.strictEqual(P.tierOf(3200).next, null);          // top tier: no next milestone
  assert.strictEqual(P.tierOf(3200).ptsAway, 0);
});

t("divisions are separate from levels", () => {
  assert.strictEqual(P.divisionOf(1199).name, "Division 1");
  assert.strictEqual(P.divisionOf(1728).ceil, 1800);
  assert.strictEqual(P.divisionOf(2600).next, null);
});

t("rating change over windows", () => {
  const c30 = P.ratingChange(H, 1566, 30, NOW);
  assert.deepStrictEqual(c30, { delta: 35, matches: 3, spansPeriod: true }); // base = 1531 (60d row)
  const call = P.ratingChange(H, 1566, null, NOW);
  assert.strictEqual(call.delta, 66);
  assert.strictEqual(call.matches, 6);
  assert.strictEqual(P.ratingChange([], 1500, 30, NOW), null);
});

t("periods only when history reaches back", () => {
  assert.deepStrictEqual(P.availablePeriods(H, NOW).map((p) => p.days), [30, 90, null]);
  const recent = [{ sessionId: "X", elo: 1510, delta: 10, w: 1, l: 0, timestamp: at(5) }];
  assert.deepStrictEqual(P.availablePeriods(recent, NOW).map((p) => p.days), [null]);
  assert.deepStrictEqual(P.availablePeriods([{ sessionId: "INITIAL", elo: 1500, w: 0, l: 0, timestamp: at(5) }], NOW), []);
});

t("describeChange refuses tiny samples", () => {
  assert.match(P.describeChange({ delta: 40, matches: 2 }, 30), /too few/);
  assert.match(P.describeChange({ delta: 0, matches: 0 }, 30), /No rated matches/);
  assert.match(P.describeChange({ delta: 4, matches: 6 }, 90), /about the same/);
  assert.match(P.describeChange({ delta: -25, matches: 5 }, 30), /went down 25 points in the last 30 days/);
  assert.strictEqual(P.describeChange(null, 30), null);
});

t("align deltas skips walkovers and expands sessions", () => {
  const rows = [{ resText: "W" }, { resText: "W" }, { resText: "L" }, { resText: "W", wo: true }, { resText: "W" }, { resText: "W" }, { resText: "W" }];
  P.alignDeltas(rows, H);
  assert.strictEqual(rows[6].delta, 5);
  assert.strictEqual(rows[5].delta, 30); assert.strictEqual(rows[5].deltaSession, true); // session row on its last match
  assert.strictEqual(rows[4].delta, undefined);                                          // first match of that session
  assert.strictEqual(rows[3].delta, undefined);                                          // walkover: never rated
  assert.strictEqual(rows[2].delta, -18);
  assert.strictEqual(rows[1].delta, 22);
  assert.strictEqual(rows[0].delta, 27);
});

t("verdicts: calibrating, on fire, honest wording", () => {
  const cal = P.verdicts({ stats: { totalMatches: 7, streak: "1W" }, history: H, calib: 16, now: NOW });
  assert.strictEqual(cal[0].h, "Finding your level");
  const hot = P.verdicts({ stats: { totalMatches: 20, streak: "6W" }, history: H, change30: { delta: 35 }, calib: 16, now: NOW, tierName: "Bronze" });
  assert.match(hot[0].h, /on fire/);
  const up = P.verdicts({ stats: { totalMatches: 20, streak: "2W" }, history: H, change30: { delta: 35 }, calib: 16, now: NOW });
  assert.strictEqual(up[0].h, "Your rating is rising");                // rating, not "you got better"
  assert.deepStrictEqual(P.verdicts({ stats: { unrated: true } }), []);
});

t("standing among confirmed players only", () => {
  const lb = [
    { name: "A", elo: 2000, gender: "F", region: "Bandung", totalMatches: 20 },
    { name: "Me", elo: 1700, gender: "F", region: "Kota Jakarta Selatan", totalMatches: 27 },
    { name: "Prov", elo: 1900, gender: "F", region: "Jakarta Selatan", totalMatches: 5 },    // not confirmed: ignored
    { name: "[Walk Over] 2", elo: 2500, gender: "F", totalMatches: 90 },                    // placeholder: ignored
    { name: "M1", elo: 1800, gender: "M", region: "Jakarta Selatan", totalMatches: 30 },
  ];
  const s = P.standing(lb, ["Me"], 16);
  assert.deepStrictEqual(s.items.map((x) => [x.scope, x.rank, x.total]), [["gender", 2, 2], ["overall", 3, 3]]); // region pop < 5 → hidden
  assert.deepStrictEqual(P.standing(lb, ["Prov"], 16), { notYet: 11 });
  assert.strictEqual(P.standing(lb, ["Nobody"], 16), null);
});

t("win value needs 8 wins", () => {
  assert.strictEqual(P.winValue(H), null);
});

console.log(pass + " passed" + (process.exitCode ? ", some FAILED" : ""));
