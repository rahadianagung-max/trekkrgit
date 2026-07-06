import React, { useState, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { loadLiveData } from "./live.js";

/* Trekkr Sabermetrics v6 — responsive (desktop master-detail + mobile),
 * "Explore by club" / "Explore by players", full rosters, partner analysis
 * gated to players with >1 recorded partner. Live-themed to trekkr.online. */

const T = {
  bg: "#FFFFFF", surf: "#FFFFFF", surf2: "#F5F5F7", surf3: "#EFEFF1",
  border: "#E4E4E7", borderSoft: "#EDEDF0",
  text: "#0D0D0D", muted: "#52525B", subtle: "#9A9AA2", faint: "#C4C4C8",
  orange: "#FF6A00", orangeHi: "#FF7D1F", red: "#FF3830", amber: "#FFB000", green: "#22A052",
  warm: "#FFF4EA", warmBorder: "#F0D9C4", grad: "linear-gradient(90deg,#FF3830,#FFB000)",
};
// Populated live from the Trekkr API at boot (see loadLiveData / boot below),
// so new venues and players appear without rebuilding this page.
// VENUES groups players by club; GLOBAL_PLAYERS is the cross-venue player list
// used by "By players" (impact & best-fit computed over all matches at once).
let VENUES = [];
let GLOBAL_PLAYERS = [];

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Saira+Condensed:ital,wght@0,600;0,700;0,800;1,700;1,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
@keyframes drawLine { from { height: 0; opacity: 0; } to { opacity: 1; } }
@keyframes rise { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes decrypt { 0%,100%{opacity:1} 50%{opacity:.45} }
@keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce){ *{animation:none!important; transition:none!important} }
`;
const body = { fontFamily: "'Plus Jakarta Sans',system-ui,sans-serif" };
const num = { fontFamily: "'Saira Condensed',system-ui,sans-serif", fontStyle: "italic", fontWeight: 800 };
const head = { ...num, textTransform: "uppercase", letterSpacing: "-.01em", lineHeight: 0.95 };
const eyebrow = { ...body, fontSize: 11, letterSpacing: ".18em", textTransform: "uppercase", fontWeight: 600 };
const gradText = { backgroundImage: T.grad, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent", color: "transparent" };
const fmt = (x) => (x >= 0 ? "+" : "") + x.toFixed(2);
const maskName = (n) => n.split(" ").map((w, i) => (i === 0 ? w[0] + "·" : "•".repeat(Math.min(w.length, 5)))).join(" ");

const DEFS = {
  reveal: { t: "Win rate vs. real impact", d: "Win rate only counts matches you won, so in doubles it blends your skill with your partner's. Impact Score strips that away and measures just you. When impact rank beats win-rate rank, the record has been underselling the player — usually because they've been carrying weaker partners." },
  impact: { t: "Impact Score", d: "How many points a player adds to their team in an average match, after the model removes partner and opponent influence. Their true individual value, independent of who they played with. Measured in points per match." },
  valueAdded: { t: "Value Added", d: "How many more points this player brings than an average player would. Higher means a bigger difference to any team they join." },
  accuracy: { t: "Model Accuracy", d: "How well the model predicts real match results across the whole pool. 65% means it explains most of what actually happens on court — so the ratings hold up." },
  pairScore: { t: "Pair Score", d: "Projected points per match if the two play together — their impact, their partner's impact, and the chemistry between them, combined." },
  strength: { t: "Partner strength", d: "How good that partner is on their own — their individual Impact Score." },
  chemistry: { t: "Chemistry", d: "A bonus or penalty from how two playing styles fit together, beyond raw skill. Some pairs over- or under-perform what their individual scores predict." },
  divergence: { t: "The gap (▲ / ▼)", d: "The difference between a player's win-rate rank and their true impact rank. ▲ orange means impact ranks higher than win rate — they're underrated. ▼ grey means win rate flatters them." },
  calibrated: { t: "Calibrated", d: "Enough matches for a stable, trustworthy rating. Below the threshold, ratings are still settling." },
};

function useIsDesktop(bp = 900) {
  const [d, setD] = useState(typeof window !== "undefined" && window.innerWidth >= bp);
  useEffect(() => { const on = () => setD(window.innerWidth >= bp); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, [bp]);
  return d;
}
function useCount(target, run, ms = 700) {
  const [v, setV] = useState(run ? 0 : target);
  useEffect(() => { if (!run) { setV(target); return; } let raf, t0; const step = (t) => { if (!t0) t0 = t; const p = Math.min((t - t0) / ms, 1); setV(target * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf); }, [target, run]);
  return v;
}
function Q({ id, onOpen }) {
  return <button onClick={() => onOpen(id)} aria-label={"What is " + DEFS[id].t} style={{ ...body, width: 15, height: 15, minWidth: 15, borderRadius: "50%", border: `1px solid ${T.faint}`, background: "transparent", color: T.subtle, fontSize: 10, fontWeight: 700, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", marginLeft: 5, padding: 0, verticalAlign: "middle" }}>?</button>;
}
function Locked({ w = 44, label }) {
  return <span style={{ ...body, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6, color: T.subtle, background: T.surf2, border: `1px solid ${T.border}`, borderRadius: 6, padding: "2px 8px", minWidth: w, justifyContent: "center", animation: "decrypt 1.8s ease-in-out infinite", fontSize: 13 }}>
    <svg width="10" height="12" viewBox="0 0 10 12" fill="none"><rect x="1" y="5" width="8" height="6" rx="1" stroke={T.orange} strokeWidth="1.2" /><path d="M3 5V3.5a2 2 0 014 0V5" stroke={T.orange} strokeWidth="1.2" /></svg>{label || "—"}</span>;
}
function Icon({ name }) {
  const p = { stroke: T.orange, strokeWidth: 1.6, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" };
  if (name === "target") return <svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" {...p} /><circle cx="12" cy="12" r="3.4" {...p} /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" {...p} /></svg>;
  if (name === "link") return <svg width="20" height="20" viewBox="0 0 24 24"><circle cx="8" cy="8" r="3.2" {...p} /><circle cx="16" cy="16" r="3.2" {...p} /><path d="M10.3 10.3l3.4 3.4" {...p} /></svg>;
  if (name === "people") return <svg width="20" height="20" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3" {...p} /><path d="M3 19a6 6 0 0112 0" {...p} /><path d="M16 6a3 3 0 010 6M21 19a6 6 0 00-4-5.6" {...p} /></svg>;
  if (name === "search") return <svg width="16" height="16" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" stroke={T.subtle} strokeWidth="1.7" fill="none" /><path d="M20 20l-3.2-3.2" stroke={T.subtle} strokeWidth="1.7" strokeLinecap="round" /></svg>;
  return <svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 4v16M5 8h14M5 8l-2.5 5a3 3 0 005 0L5 8zM19 8l-2.5 5a3 3 0 005 0L19 8z" {...p} /></svg>;
}

function ExplainSheet({ open, onClose }) {
  if (!open) return null;
  const g = open === "__glossary__";
  return <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#0D0D0D55", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center", animation: "fadeIn .15s ease" }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, background: T.surf, borderTop: `3px solid ${T.orange}`, borderRadius: "18px 18px 0 0", padding: "20px 20px 28px", animation: "sheetUp .22s cubic-bezier(.2,.8,.2,1)", maxHeight: "82vh", overflowY: "auto", boxShadow: "0 -20px 60px rgba(13,13,13,.18)", marginBottom: "0" }}>
      <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border, margin: "0 auto 16px" }} />
      {g ? <>
        <div style={{ ...head, fontSize: 26, marginBottom: 4, color: T.text }}>How to read this</div>
        <div style={{ ...body, fontSize: 13, color: T.muted, marginBottom: 18 }}>Three ideas power the whole thing.</div>
        {[["01", "Impact, not win rate", "Win rate can't tell whether a player or their partner won the match. Impact Score measures just the player, across many different partners and opponents."], ["02", "Value added", "How much more they bring than an average player at their level — their edge, in one number."], ["03", "The right partner", "Who lifts them most — combining how strong a partner is with the chemistry they actually show together."]].map(([n, t, d]) => <div key={n} style={{ display: "flex", gap: 14, marginBottom: 16 }}><div style={{ ...num, fontSize: 22, ...gradText, flexShrink: 0, lineHeight: 1 }}>{n}</div><div><div style={{ ...body, fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 3 }}>{t}</div><div style={{ ...body, fontSize: 13.5, color: T.muted, lineHeight: 1.55 }}>{d}</div></div></div>)}
      </> : <>
        <div style={{ ...head, fontSize: 26, marginBottom: 10, color: T.text }}>{DEFS[open].t}</div>
        <div style={{ ...body, fontSize: 14.5, color: T.text, lineHeight: 1.6 }}>{DEFS[open].d}</div>
      </>}
      <button onClick={onClose} style={{ ...body, width: "100%", marginTop: 18, padding: "13px", borderRadius: 999, border: `1px solid ${T.border}`, background: T.surf2, color: T.text, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Got it</button>
    </div>
  </div>;
}

function Header({ page, onBack, backLabel }) {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", position: "sticky", top: 0, background: "rgba(255,255,255,.85)", backdropFilter: "blur(14px)", zIndex: 40, borderBottom: `1px solid ${T.borderSoft}` }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ ...head, fontSize: 22, ...gradText }}>Trekkr</span><span style={{ ...eyebrow, fontSize: 9.5, color: T.subtle, borderLeft: `1px solid ${T.border}`, paddingLeft: 8 }}>Sabermetrics</span></div>
    {page === "analysis" && <button onClick={onBack} style={{ ...body, fontSize: 12.5, fontWeight: 600, color: T.muted, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 999, padding: "6px 13px", cursor: "pointer" }}>{backLabel}</button>}
  </div>;
}

/* ---------------- Overview ---------------- */
function Intro({ go, onOpen, isDesktop }) {
  const totalMatches = VENUES.reduce((s, v) => s + (v.rows || 0), 0);
  const feats = [
    { ic: "target", t: "Every player's real Impact", d: "How much each member adds per match — and where they truly rank, not where win rate puts them." },
    { ic: "link", t: "Best-fit partners", d: "For any player, a ranked shortlist of who lifts their game most, from strength and chemistry combined." },
    { ic: "scale", t: "Who's carried, who's carrying", d: "See at a glance which members are underrated and which are riding stronger partners." },
  ];
  return <div style={{ padding: isDesktop ? "20px 24px 56px" : "8px 18px 40px", maxWidth: 760, margin: "0 auto", animation: "fadeIn .25s ease" }}>
    <div style={{ padding: isDesktop ? "34px 0 22px" : "26px 0 20px" }}>
      <div style={{ ...eyebrow, color: T.orange, marginBottom: 14 }}>New · Advanced analytics</div>
      <h1 style={{ ...head, fontSize: isDesktop ? 66 : 52, margin: 0, color: T.text }}>See what<br />win rate <span style={gradText}>hides</span></h1>
      <p style={{ ...body, fontSize: isDesktop ? 16.5 : 15, color: T.muted, lineHeight: 1.6, marginTop: 16, maxWidth: 560 }}>Sabermetrics is the science of measuring what actually wins games — looking past surface stats like win rate to each player's true value. We bring it to padel: since doubles blends your skill with your partner's, we use your match history across many different partners to isolate what you alone contribute.</p>
    </div>
    <div style={{ ...eyebrow, color: T.subtle, margin: "18px 0 12px" }}>How it works</div>
    <div style={{ display: isDesktop ? "grid" : "block", gridTemplateColumns: isDesktop ? "1fr 1fr 1fr" : undefined, gap: isDesktop ? 18 : 0 }}>
      {[["01", "We read the match history", "Every Trekkr match records who played with whom, against whom, and the score."], ["02", "We isolate each player", "Because members play with many partners, the model separates each one's contribution — win rate can't."], ["03", "We find the right pairings", "Then it ranks partners by how strong they are and how well their styles click."]].map(([n, t, d]) => <div key={n} style={{ display: "flex", gap: 15, padding: "13px 0", borderTop: `1px solid ${T.borderSoft}` }}><div style={{ ...num, fontSize: 26, ...gradText, lineHeight: 1, flexShrink: 0, width: 34 }}>{n}</div><div><div style={{ ...body, fontWeight: 700, fontSize: 15.5, color: T.text }}>{t}</div><div style={{ ...body, fontSize: 13.5, color: T.muted, lineHeight: 1.55, marginTop: 3 }}>{d}</div></div></div>)}
    </div>
    <div style={{ ...eyebrow, color: T.subtle, margin: "26px 0 12px" }}>What you get</div>
    <div style={{ display: isDesktop ? "grid" : "flex", gridTemplateColumns: isDesktop ? "1fr 1fr 1fr" : undefined, flexDirection: isDesktop ? undefined : "column", gap: 10 }}>{feats.map((f) => <div key={f.t} style={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}><div style={{ width: 38, height: 38, borderRadius: 10, background: T.warm, border: `1px solid ${T.warmBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginBottom: 11 }}><Icon name={f.ic} /></div><div><div style={{ ...body, fontWeight: 700, fontSize: 15, color: T.text }}>{f.t}</div><div style={{ ...body, fontSize: 13, color: T.muted, lineHeight: 1.5, marginTop: 3 }}>{f.d}</div></div></div>)}</div>
    <div style={{ marginTop: 22, background: T.text, borderRadius: 14, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><span style={{ ...num, fontSize: 34, color: "#fff" }}>{totalMatches.toLocaleString()}</span><span style={{ ...body, fontSize: 13, color: "#C4C4C8" }}>real matches analyzed</span></div>
      <div style={{ ...body, fontSize: 13, color: "#C4C4C8", lineHeight: 1.55, marginTop: 8 }}>The model predicts about <b style={{ color: "#fff" }}>two-thirds of match outcomes</b> — earned, not guessed.<button onClick={() => onOpen("accuracy")} style={{ ...body, background: "transparent", border: "none", color: T.amber, fontWeight: 600, fontSize: 13, cursor: "pointer", padding: "0 0 0 4px" }}>How?</button></div>
    </div>
    <div style={{ ...eyebrow, color: T.subtle, margin: "26px 0 12px" }}>Start exploring</div>
    <div style={{ display: "flex", flexDirection: isDesktop ? "row" : "column", gap: 11 }}>
      <button onClick={() => go("venue")} style={{ ...body, flex: 1, padding: "15px 18px", borderRadius: 14, border: "none", cursor: "pointer", background: T.orange, color: "#fff", display: "flex", alignItems: "center", gap: 13, textAlign: "left", boxShadow: `0 10px 30px ${T.orange}40` }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,.18)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V9l8-5 8 5v11"/><path d="M9 20v-6h6v6"/></svg></span>
        <span style={{ flex: 1 }}><span style={{ fontWeight: 700, fontSize: 15.5, display: "block" }}>Explore by club</span><span style={{ fontSize: 12, opacity: .85 }}>Whole-roster analysis for a club or community</span></span><span style={{ fontSize: 18 }}>→</span>
      </button>
      <button onClick={() => go("players")} style={{ ...body, flex: 1, padding: "15px 18px", borderRadius: 14, cursor: "pointer", background: T.surf, color: T.text, border: `1.5px solid ${T.orange}`, display: "flex", alignItems: "center", gap: 13, textAlign: "left" }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: T.warm, border: `1px solid ${T.warmBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="people" /></span>
        <span style={{ flex: 1 }}><span style={{ fontWeight: 700, fontSize: 15.5, display: "block" }}>Explore by players</span><span style={{ fontSize: 12, color: T.muted }}>Search any player and see their analysis</span></span><span style={{ fontSize: 18, color: T.orange }}>→</span>
      </button>
    </div>
    <div style={{ ...body, fontSize: 12, color: T.subtle, textAlign: "center", marginTop: 14 }}>Full analysis is a <span style={{ color: T.orange, fontWeight: 600 }}>Pro</span> feature · real data from trekkr.online</div>
  </div>;
}

/* ---------------- detail pieces ---------------- */
function RankShift({ hero, pro, animKey, onOpen, scope }) {
  const delta = hero.winRateRank - hero.impactRank;
  const shown = useCount(hero.impactRank, pro, 700);
  return <div style={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 18px 20px", boxShadow: "0 1px 2px rgba(13,13,13,.04)" }}>
    <div style={{ ...eyebrow, color: T.orange, display: "flex", alignItems: "center" }}>The reveal <Q id="reveal" onOpen={onOpen} /></div>
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 14 }}><span style={{ ...body, fontSize: 13.5, color: T.muted }}>By win rate, ranks</span><span style={{ ...num, fontSize: 32, color: T.subtle, lineHeight: 1 }}>#{hero.winRateRank}</span></div>
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0 8px 4px" }}><div key={animKey} style={{ width: 2, height: 34, background: `linear-gradient(${T.subtle}, ${T.orange})`, borderRadius: 2, animation: "drawLine .6s ease both" }} /><div style={{ ...body, fontWeight: 600, fontSize: 12, color: T.orange, display: "flex", alignItems: "center", gap: 6 }}><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 10V2M6 2L2.5 5.5M6 2l3.5 3.5" stroke={T.orange} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>{pro ? `${Math.abs(delta)} spots ${delta >= 0 ? "better" : "lower"} than the record shows` : "real rank differs — unlock to see"}</div></div>
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}><span style={{ ...body, fontSize: 13.5, color: T.text, fontWeight: 600 }}>By real impact, ranks</span>{pro ? <span style={{ ...num, fontSize: 46, ...gradText, lineHeight: 1 }}>#{Math.round(shown)}</span> : <Locked w={70} label="#??" />}</div>
    <div style={{ ...body, fontSize: 11.5, color: T.subtle, marginTop: 10 }}>of {hero.totalRanked} players in {scope} · partner &amp; opponent effects removed</div>
  </div>;
}
function Stat({ label, qid, onOpen, children, sub }) {
  return <div style={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, flex: 1, boxShadow: "0 1px 2px rgba(13,13,13,.04)" }}><div style={{ ...eyebrow, fontSize: 9.5, color: T.subtle, display: "flex", alignItems: "center" }}>{label}{qid && <Q id={qid} onOpen={onOpen} />}</div><div style={{ marginTop: 9 }}>{children}</div>{sub && <div style={{ ...body, fontSize: 10.5, color: T.subtle, marginTop: 6 }}>{sub}</div>}</div>;
}
function PartnerRow({ p, pro, rank, onOpen }) {
  const strengthW = Math.max(0, Math.min(1, (p.partnerBeta + 1) / 4.5)) * 100;
  const synMag = Math.min(Math.abs(p.synergy) / 0.6, 1) * 26; const synPos = p.synergy >= 0;
  return <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderTop: rank === 0 ? "none" : `1px solid ${T.borderSoft}`, animation: "rise .4s ease both", animationDelay: `${rank * 55}ms` }}>
    <span style={{ ...num, fontSize: 16, color: T.faint, width: 16 }}>{rank + 1}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ ...body, fontWeight: 600, fontSize: 14, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pro ? p.partner : maskName(p.partner)}</span><span style={{ ...body, fontSize: 10, color: T.subtle }}>· {p.shared} together</span></div>
      <div style={{ display: "flex", alignItems: "center", height: 7, marginTop: 7, borderRadius: 4, overflow: "hidden", background: T.surf3 }}><div style={{ width: `${strengthW}%`, height: "100%", background: T.orange, opacity: pro ? 1 : 0.3 }} />{pro && <div style={{ width: `${synMag}%`, height: "100%", background: synPos ? T.amber : T.red, marginLeft: synPos ? 2 : 0, opacity: synPos ? 1 : 0.55 }} />}</div>
      <div style={{ ...body, fontSize: 10.5, color: T.subtle, marginTop: 5 }}>{pro ? <><span style={{ color: T.orange, fontWeight: 600 }}>strength {fmt(p.partnerBeta)}</span>{"   ·   "}<span style={{ color: synPos ? "#B37A00" : T.red, fontWeight: 600 }}>chemistry {fmt(p.synergy)}</span></> : "unlock to see the fit"}</div>
    </div>
    <div style={{ textAlign: "right" }}>{pro ? <span style={{ ...num, fontSize: 22, color: T.text }}>{fmt(p.pairScore)}</span> : <Locked w={40} />}<div style={{ ...eyebrow, fontSize: 8.5, color: T.subtle, letterSpacing: ".1em" }}>pair score</div></div>
  </div>;
}

function PlayerDetail({ hero, scope, count, pro, onOpen, onBack, backLabel, showBack }) {
  const animKey = hero.name + pro + scope;
  return <div style={{ animation: "fadeIn .2s ease" }}>
    {showBack && <button onClick={onBack} style={{ ...body, fontSize: 12.5, fontWeight: 600, color: T.orange, background: "transparent", border: "none", cursor: "pointer", padding: "0 0 12px", display: "flex", alignItems: "center", gap: 5 }}>← {backLabel}</button>}
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}><h1 style={{ ...head, fontSize: 34, margin: 0, color: T.text }}>{hero.name}</h1><span style={{ ...eyebrow, fontSize: 9, color: T.orange, border: `1px solid ${T.orange}66`, borderRadius: 5, padding: "3px 7px" }}>{hero.gender === "M" ? "Men" : "Women"}</span></div>
      <div style={{ ...body, fontSize: 12, color: T.muted, marginTop: 6, display: "flex", alignItems: "center" }}>{scope} · {hero.apps} matches · {hero.winRate}% win · calibrated<Q id="calibrated" onOpen={onOpen} /></div>
    </div>
    <RankShift hero={{ ...hero, totalRanked: count }} pro={pro} animKey={animKey} onOpen={onOpen} scope={scope} />
    <div style={{ display: "flex", gap: 10, marginTop: 12 }}><Stat label="Impact Score" qid="impact" onOpen={onOpen} sub={pro ? `±${hero.se.toFixed(2)} confidence` : "locked on Free"}>{pro ? <span style={{ ...num, fontSize: 32, ...gradText }}>{fmt(hero.impact)}<span style={{ ...body, fontSize: 12, color: T.subtle, fontWeight: 500, fontStyle: "normal", WebkitTextFillColor: T.subtle }}> pts/match</span></span> : <Locked w={90} label="+ ??" />}</Stat></div>
    <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
      <Stat label="Value Added" qid="valueAdded" onOpen={onOpen} sub="vs. an average player">{pro ? <span style={{ ...num, fontSize: 24, color: T.text }}>{fmt(hero.valueAdded)}</span> : <Locked w={54} />}</Stat>
      <Stat label="Model Accuracy" qid="accuracy" onOpen={onOpen} sub="how reliable ratings are"><span style={{ ...num, fontSize: 24, color: T.text }}>{hero.gender === "M" ? 65 : 66}%</span></Stat>
    </div>
    {/* PARTNER ANALYSIS */}
    {(() => {
      const bf = hero.bestFit || [];
      const enough = bf.length > 1;
      return <div style={{ marginTop: 22, background: T.surf, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 16px 8px", boxShadow: "0 1px 2px rgba(13,13,13,.04)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><div><div style={{ ...head, fontSize: 20, color: T.text }}>Partner analysis</div><div style={{ ...body, fontSize: 11, color: T.subtle, marginTop: 4, display: "flex", alignItems: "center" }}>{enough ? <>best partners by pair score<Q id="pairScore" onOpen={onOpen} /></> : "not enough data yet"}</div></div><div style={{ width: 32, height: 32, borderRadius: 9, background: T.warm, border: `1px solid ${T.warmBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="link" /></div></div>
        {enough ? <>
          <div style={{ display: "flex", gap: 16, marginTop: 11, ...body, fontSize: 10.5, color: T.muted }}><span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: T.orange }} /> strength<Q id="strength" onOpen={onOpen} /></span><span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: T.amber }} /> chemistry<Q id="chemistry" onOpen={onOpen} /></span></div>
          {!pro && <div style={{ ...body, fontSize: 12.5, color: "#8A5A00", background: T.warm, border: `1px solid ${T.warmBorder}`, borderRadius: 10, padding: "10px 12px", margin: "12px 0 4px", lineHeight: 1.5 }}>Best-fit partner found — projected <b style={{ color: T.orange }}>+{bf[0].pairScore.toFixed(1)} pts/match</b>. Unlock Pro to see who.</div>}
          <div style={{ marginTop: 6 }}>{bf.map((p, i) => <PartnerRow key={p.partner + i} p={p} pro={pro} rank={i} onOpen={onOpen} />)}</div>
          <div style={{ display: "flex", gap: 10, margin: "12px 0 8px" }}>
            <div style={{ flex: 1, background: T.warm, border: `1px solid ${T.warmBorder}`, borderRadius: 12, padding: 12 }}><div style={{ ...eyebrow, fontSize: 9, color: T.orange }}>Lifts you most</div><div style={{ ...body, fontWeight: 700, fontSize: 13.5, marginTop: 5, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pro ? bf[0].partner : maskName(bf[0].partner)}</div></div>
            <div style={{ flex: 1, background: T.surf2, border: `1px solid ${T.border}`, borderRadius: 12, padding: 12 }}><div style={{ ...eyebrow, fontSize: 9, color: T.subtle }}>Holds you back</div><div style={{ ...body, fontWeight: 700, fontSize: 13.5, marginTop: 5, color: pro ? T.muted : T.faint, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hero.worstFit ? (pro ? hero.worstFit.partner : "•••••• (club plans)") : "—"}</div></div>
          </div>
        </> : <div style={{ ...body, fontSize: 13, color: T.muted, lineHeight: 1.6, padding: "14px 2px 10px" }}>
          {bf.length === 1
            ? <>Only recorded playing with <b style={{ color: T.text }}>{bf[0].partner}</b> so far, so a partner analysis can’t be given yet — it needs matches with a few different partners.</>
            : "No partner data yet — this player needs matches with a few different partners before a best-fit can be found."}
        </div>}
      </div>;
    })()}
  </div>;
}

function EmptyDetail() {
  return <div style={{ border: `1px dashed ${T.border}`, borderRadius: 16, padding: "60px 24px", textAlign: "center", background: T.surf2, animation: "fadeIn .2s ease" }}>
    <div style={{ width: 48, height: 48, borderRadius: 12, background: T.warm, border: `1px solid ${T.warmBorder}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}><Icon name="people" /></div>
    <div style={{ ...head, fontSize: 24, color: T.text }}>Select a player</div>
    <div style={{ ...body, fontSize: 13.5, color: T.muted, marginTop: 6, maxWidth: 300, marginLeft: "auto", marginRight: "auto", lineHeight: 1.55 }}>Pick anyone from the list to see their true impact, rank, and best-fit partners.</div>
  </div>;
}

function DivBadge({ delta, pro }) {
  if (!pro) return <span style={{ ...body, fontSize: 11, color: T.faint }}>◦</span>;
  if (delta === 0) return <span style={{ ...body, fontSize: 11, color: T.subtle }}>—</span>;
  const up = delta > 0;
  return <span style={{ ...num, fontSize: 14, color: up ? T.orange : T.subtle, display: "inline-flex", alignItems: "center", gap: 1 }}>{up ? "▲" : "▼"}{Math.abs(delta)}</span>;
}
function PlayerRowMini({ p, pro, onPick, subtitle, rankNo }) {
  return <button onClick={() => onPick(p)} style={{ ...body, display: "flex", width: "100%", alignItems: "center", gap: 11, padding: "12px 14px", background: "transparent", border: "none", borderTop: rankNo === 1 ? "none" : `1px solid ${T.borderSoft}`, cursor: "pointer", textAlign: "left" }}>
    {rankNo != null && <span style={{ ...num, fontSize: 18, color: rankNo <= 3 ? T.orange : T.faint, width: 22 }}>{rankNo}</span>}
    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div><div style={{ ...body, fontSize: 10.5, color: T.subtle, marginTop: 2 }}>{subtitle}</div></div>
    {pro ? <span style={{ ...num, fontSize: 19, color: T.text }}>{fmt(p.impact)}</span> : <Locked w={44} />}<span style={{ ...body, fontSize: 12, color: T.orange }}>→</span>
  </button>;
}

/* ---------------- Club mode ---------------- */
function RosterView({ venue, pro, onPick, onOpen, activeName }) {
  const [query, setQuery] = useState("");
  const roster = venue.players;
  const matches = query ? roster.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())) : null;
  const bestDuo = useMemo(() => {
    const names = new Set(roster.map((p) => p.name)); let best = null;
    roster.forEach((p) => (p.bestFit || []).forEach((f) => { if (names.has(f.partner) && (!best || f.pairScore > best.score)) best = { a: p.name, b: f.partner, score: f.pairScore }; }));
    return best;
  }, [venue.name]);
  return <div style={{ animation: "fadeIn .2s ease" }}>
    <div style={{ marginBottom: 14 }}><h1 style={{ ...head, fontSize: 28, margin: 0, color: T.text }}>{venue.name}</h1><div style={{ ...body, fontSize: 12, color: T.muted, marginTop: 5 }}>{[venue.region, venue.location].filter(Boolean).join(" · ") || "Club"} · {venue.count} players · {venue.rows} matches</div></div>
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.surf2, border: `1px solid ${T.border}`, borderRadius: 999, padding: "9px 14px", marginBottom: 14 }}>
      <Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={"Search a player in this club"} style={{ ...body, flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13.5, color: T.text }} />{query && <button onClick={() => setQuery("")} style={{ ...body, border: "none", background: "transparent", color: T.subtle, cursor: "pointer", fontSize: 16, padding: 0 }}>×</button>}
    </div>
    {matches ? <div>{matches.length === 0 ? <div style={{ ...body, fontSize: 13, color: T.subtle, padding: "8px 4px" }}>No player matches “{query}” here.</div> : <div style={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>{matches.slice(0, 30).map((p, i) => <PlayerRowMini key={p.name} p={p} pro={pro} onPick={onPick} rankNo={i + 1} subtitle={`${p.winRate}% win · ${p.apps} matches`} />)}</div>}</div>
      : <>
        {bestDuo && <div style={{ background: pro ? T.warm : T.surf2, border: `1px solid ${pro ? T.warmBorder : T.border}`, borderRadius: 12, padding: "13px 15px", marginBottom: 14 }}>
          <div style={{ ...eyebrow, fontSize: 9, color: pro ? T.orange : T.subtle }}>Strongest duo in the club</div>
          {pro ? <div style={{ ...body, fontWeight: 700, fontSize: 15, color: T.text, marginTop: 5 }}>{bestDuo.a} + {bestDuo.b} <span style={{ ...num, color: T.orange, fontSize: 16, marginLeft: 4 }}>{fmt(bestDuo.score)}</span></div> : <div style={{ ...body, fontSize: 13, color: T.muted, marginTop: 5 }}>One pairing projects highest. <span style={{ color: T.orange, fontWeight: 600 }}>Unlock Pro</span> to see who.</div>}
        </div>}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "4px 4px 8px" }}><div style={{ ...eyebrow, color: T.subtle }}>Ranked by impact</div><div style={{ ...body, fontSize: 10.5, color: T.subtle, display: "flex", alignItems: "center" }}>gap<Q id="divergence" onOpen={onOpen} /></div></div>
        <div style={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 2px rgba(13,13,13,.04)" }}>
          {roster.map((p, i) => { const delta = p.winRateRank - p.impactRank; const active = p.name === activeName; return <button key={p.name} onClick={() => onPick(p)} style={{ ...body, display: "flex", width: "100%", alignItems: "center", gap: 11, padding: "12px 14px", background: active ? T.warm : "transparent", border: "none", borderTop: i === 0 ? "none" : `1px solid ${T.borderSoft}`, borderLeft: active ? `3px solid ${T.orange}` : "3px solid transparent", cursor: "pointer", textAlign: "left" }}>
            <span style={{ ...num, fontSize: 18, color: i < 3 ? T.orange : T.faint, width: 22 }}>{p.impactRank}</span>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div><div style={{ ...body, fontSize: 10.5, color: T.subtle, marginTop: 2 }}>{p.winRate}% win · {p.apps} matches</div></div>
            <div style={{ textAlign: "right", minWidth: 40 }}><DivBadge delta={delta} pro={pro} /><div style={{ ...eyebrow, fontSize: 8, color: T.subtle, letterSpacing: ".08em" }}>vs win%</div></div>
            <div style={{ textAlign: "right", minWidth: 52 }}>{pro ? <span style={{ ...num, fontSize: 19, color: T.text }}>{fmt(p.impact)}</span> : <Locked w={44} />}<div style={{ ...eyebrow, fontSize: 8, color: T.subtle, letterSpacing: ".08em" }}>impact</div></div>
          </button>; })}
        </div>
        {!pro && <div style={{ ...body, fontSize: 12.5, color: "#8A5A00", background: T.warm, border: `1px solid ${T.warmBorder}`, borderRadius: 10, padding: "11px 13px", marginTop: 12, lineHeight: 1.5 }}>Free shows names and win rate. <b>Unlock Pro</b> to reveal each member's true impact and who's underrated.</div>}
      </>}
  </div>;
}

/* ---------------- Players mode ---------------- */
function PlayersView({ globalPlayers, pro, onPick, activeName }) {
  const [query, setQuery] = useState("");
  const matches = query ? globalPlayers.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())) : null;
  const top = globalPlayers.slice(0, 20);
  return <div style={{ animation: "fadeIn .2s ease" }}>
    <div style={{ marginBottom: 14 }}><h1 style={{ ...head, fontSize: 28, margin: 0, color: T.text }}>All players</h1><div style={{ ...body, fontSize: 12, color: T.muted, marginTop: 5 }}>{globalPlayers.length} players across every club · search any name</div></div>
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.surf2, border: `1px solid ${T.border}`, borderRadius: 999, padding: "9px 14px", marginBottom: 14 }}>
      <Icon name="search" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search any player" style={{ ...body, flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 13.5, color: T.text }} />{query && <button onClick={() => setQuery("")} style={{ ...body, border: "none", background: "transparent", color: T.subtle, cursor: "pointer", fontSize: 16, padding: 0 }}>×</button>}
    </div>
    {matches ? (matches.length === 0 ? <div style={{ ...body, fontSize: 13, color: T.subtle, padding: "8px 4px" }}>No player matches “{query}”.</div> : <div style={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden" }}>{matches.slice(0, 30).map((p, i) => <PlayerRowMini key={p.name} p={p} pro={pro} onPick={onPick} rankNo={i + 1} subtitle={`${p.venue} · ${p.winRate}% win`} />)}</div>)
      : <><div style={{ ...eyebrow, color: T.subtle, margin: "4px 4px 8px" }}>Top players overall</div><div style={{ background: T.surf, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 2px rgba(13,13,13,.04)" }}>{top.map((p, i) => <PlayerRowMini key={p.name} p={p} pro={pro} onPick={onPick} rankNo={i + 1} subtitle={`${p.venue} · ${p.winRate}% win`} />)}</div></>}
  </div>;
}

function ModeControls({ mode, setMode, setPlayer, pro, setPro }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10 }}>
    <div style={{ display: "flex", background: T.surf2, borderRadius: 999, padding: 3, border: `1px solid ${T.border}` }}>
      {[["venue", "By club"], ["players", "By players"]].map(([m, label]) => { const on = mode === m; return <button key={m} onClick={() => { setMode(m); setPlayer(null); }} style={{ ...body, fontSize: 11.5, padding: "6px 12px", borderRadius: 999, border: "none", cursor: "pointer", color: on ? "#fff" : T.muted, background: on ? T.text : "transparent", fontWeight: 700, transition: "all .18s" }}>{label}</button>; })}
    </div>
    <div style={{ display: "flex", background: T.surf2, borderRadius: 999, padding: 3, border: `1px solid ${T.border}`, flexShrink: 0 }}>
      {["Free", "Pro"].map((t) => { const active = (t === "Pro") === pro; return <button key={t} onClick={() => setPro(t === "Pro")} style={{ ...body, fontSize: 11, letterSpacing: ".04em", padding: "6px 12px", borderRadius: 999, border: "none", cursor: "pointer", color: active ? "#fff" : T.muted, background: active ? T.orange : "transparent", fontWeight: 700, transition: "all .18s" }}>{t === "Pro" ? "★ PRO" : "FREE"}</button>; })}
    </div>
  </div>;
}
function ClubSelect({ venueName, setVenueName, setPlayer }) {
  return <div style={{ position: "relative", marginBottom: 14 }}>
    <select value={venueName} onChange={(e) => { setVenueName(e.target.value); setPlayer(null); }} style={{ ...body, width: "100%", fontSize: 13.5, fontWeight: 600, color: T.text, background: T.surf2, border: `1px solid ${T.border}`, borderRadius: 999, padding: "10px 34px 10px 16px", cursor: "pointer", appearance: "none", WebkitAppearance: "none" }}>{VENUES.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}</select>
    <span style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: T.subtle, fontSize: 11 }}>▼</span>
  </div>;
}
function GlossaryBtn({ onOpen }) {
  return <button onClick={() => onOpen("__glossary__")} style={{ ...body, fontSize: 12, fontWeight: 600, color: T.orange, background: T.warm, border: `1px solid ${T.warmBorder}`, borderRadius: 10, padding: "9px 12px", cursor: "pointer", width: "100%", textAlign: "left", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}><span>New here? Read “How to read this” first</span><span>→</span></button>;
}

function Analysis({ onOpen, mode, setMode, venueName, setVenueName, player, setPlayer, isDesktop }) {
  const [pro, setPro] = useState(false);
  const venue = VENUES.find((v) => v.name === venueName) || VENUES[0];
  // Cross-venue player list, already ranked by (global) impact.
  const globalPlayers = GLOBAL_PLAYERS;
  // "By players" scopes the analysis to every club at once; "By club" scopes it
  // to the selected venue's roster.
  const scope = !player ? "" : mode === "players" ? "all clubs" : venue.name;
  const count = !player ? 0 : mode === "players" ? globalPlayers.length : venue.count;
  const list = mode === "venue"
    ? <RosterView venue={venue} pro={pro} onPick={setPlayer} onOpen={onOpen} activeName={player && player.name} />
    : <PlayersView globalPlayers={globalPlayers} pro={pro} onPick={setPlayer} activeName={player && player.name} />;
  const detail = player ? <PlayerDetail hero={player} scope={scope} count={count} pro={pro} onOpen={onOpen} onBack={() => setPlayer(null)} backLabel={mode === "venue" ? "roster" : "all players"} showBack={!isDesktop} /> : null;
  const footer = <div style={{ ...body, fontSize: 11, color: T.subtle, textAlign: "center", marginTop: 18, lineHeight: 1.6 }}>{pro ? "Prototype · real data from trekkr.online" : "Free shows the insight exists — Pro unlocks it"}</div>;

  if (isDesktop) {
    return <div style={{ padding: "22px 28px 48px", maxWidth: 1120, margin: "0 auto", animation: "fadeIn .25s ease" }}>
      <ModeControls mode={mode} setMode={setMode} setPlayer={setPlayer} pro={pro} setPro={setPro} />
      <div style={{ display: "flex", gap: 26, alignItems: "flex-start" }}>
        <div style={{ width: 460, flexShrink: 0 }}>
          {mode === "venue" && <ClubSelect venueName={venueName} setVenueName={setVenueName} setPlayer={setPlayer} />}
          <GlossaryBtn onOpen={onOpen} />
          {list}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>{detail || <EmptyDetail />}</div>
      </div>
      {footer}
    </div>;
  }
  return <div style={{ padding: "16px 18px 40px", animation: "fadeIn .25s ease" }}>
    <ModeControls mode={mode} setMode={setMode} setPlayer={setPlayer} pro={pro} setPro={setPro} />
    {mode === "venue" && !player && <ClubSelect venueName={venueName} setVenueName={setVenueName} setPlayer={setPlayer} />}
    <GlossaryBtn onOpen={onOpen} />
    {player ? detail : list}
    {footer}
  </div>;
}

export default function App() {
  const isDesktop = useIsDesktop();
  const [page, setPage] = useState("intro");
  const [def, setDef] = useState(null);
  const [mode, setMode] = useState("venue");
  const [venueName, setVenueName] = useState(VENUES[0] ? VENUES[0].name : "");
  const [player, setPlayer] = useState(null);
  const go = (m) => { setMode(m); setPlayer(null); setPage("analysis"); };
  const onBack = () => { if (player) setPlayer(null); else setPage("intro"); };
  return <div style={{ minHeight: "100vh", background: T.bg, color: T.text, ...body }}>
    <style>{FONTS}</style>
    <div style={{ maxWidth: isDesktop ? "100%" : 440, margin: "0 auto", borderLeft: isDesktop ? "none" : `1px solid ${T.borderSoft}`, borderRight: isDesktop ? "none" : `1px solid ${T.borderSoft}`, minHeight: "100vh" }}>
      <Header page={page} onBack={onBack} backLabel={player ? "← Back" : "← Overview"} />
      {page === "intro" ? <Intro go={go} onOpen={setDef} isDesktop={isDesktop} /> : <Analysis onOpen={setDef} mode={mode} setMode={setMode} venueName={venueName} setVenueName={setVenueName} player={player} setPlayer={setPlayer} isDesktop={isDesktop} />}
    </div>
    <ExplainSheet open={def} onClose={() => setDef(null)} />
  </div>;
}

/* ---------------- boot / live data loading ---------------- */
function Splash({ children }) {
  return <div style={{ minHeight: "100vh", background: T.bg, color: T.text, ...body, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
    <style>{FONTS}</style>
    <div style={{ textAlign: "center", maxWidth: 340 }}>
      <div style={{ ...head, fontSize: 30, ...gradText, display: "inline-block" }}>Trekkr</div>
      <div style={{ ...eyebrow, color: T.subtle, marginTop: 6 }}>Sabermetrics</div>
      {children}
    </div>
  </div>;
}
function Booting() {
  return <Splash>
    <div style={{ ...body, fontSize: 13.5, color: T.muted, marginTop: 18 }}>Loading live club data…</div>
    <div style={{ margin: "18px auto 0", width: 26, height: 26, border: `3px solid ${T.surf3}`, borderTopColor: T.orange, borderRadius: "50%", animation: "spin .8s linear infinite" }} />
  </Splash>;
}
function LoadError({ onRetry, empty }) {
  return <Splash>
    <div style={{ ...body, fontSize: 15, fontWeight: 700, color: T.text, marginTop: 18 }}>{empty ? "No clubs found yet" : "Couldn’t load live data"}</div>
    <div style={{ ...body, fontSize: 13, color: T.muted, marginTop: 8, lineHeight: 1.55 }}>{empty ? "Once a venue records its first matches on trekkr.online, it’ll appear here." : "We couldn’t reach trekkr.online. Check your connection and try again."}</div>
    <button onClick={onRetry} style={{ ...body, marginTop: 18, padding: "11px 20px", borderRadius: 999, border: "none", cursor: "pointer", background: T.orange, color: "#fff", fontWeight: 700, fontSize: 14 }}>Retry</button>
  </Splash>;
}

const root = createRoot(document.getElementById("root"));
function boot() {
  root.render(<Booting />);
  loadLiveData()
    .then(({ venues, players }) => {
      VENUES = venues || [];
      GLOBAL_PLAYERS = players || [];
      if (!VENUES.length) { root.render(<LoadError onRetry={boot} empty />); return; }
      root.render(<App />);
    })
    .catch((err) => {
      console.error("[Trekkr] live load failed:", err);
      root.render(<LoadError onRetry={boot} />);
    });
}
boot();
