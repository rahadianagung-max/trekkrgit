const { google } = require("googleapis");

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY || "";
  
  // Menghapus tanda kutip ganda di awal/akhir jika Vercel menambahkannya
  key = key.replace(/^"|"$/g, '');
  // Memaksa format baris baru (enter) menjadi benar
  key = key.replace(/\\n/g, "\n");

  return new google.auth.JWT(email, null, key, [
    "https://www.googleapis.com/auth/spreadsheets",
  ]);
}

function getSheets() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

const TABS = {
  players: "Players",
  sessions: "Sessions",
  elo_log: "ELO_Log",
  venues: "Venues",
  admins: "Admins",
  claims: "Claims",
  t_events: "Tournament_Events",
  t_tournaments: "Tournaments",
  t_entrants: "Tournament_Entrants",
  t_groups: "Tournament_Groups",
  t_matches: "Tournament_Matches",
  t_form: "Form_Responses",
};

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Content-Type": "application/json",
};

function respond(statusCode, data) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(data)
  };
}

// ==============================================================
// TOURNAMENT HELPERS (Phase 1)
// ==============================================================
const LEVEL_ELO = {
  beginner: 750, upper_beginner: 1050, lower_bronze: 1350, bronze: 1650,
  upper_bronze: 1950, silver: 2300, gold: 2750, platinum: 3100,
};
function levelToElo(level) {
  return LEVEL_ELO[String(level || "").toLowerCase().trim().replace(/\s+/g, "_")] || 1350;
}
function normName(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}
function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}
// Balanced group sizes: target is a minimum-ish target (>=3), no max, no group below 3.
function computeGroupSizes(n, target) {
  target = Math.max(3, parseInt(target) || 4);
  if (n <= 0) return [];
  let g = Math.max(1, Math.ceil(n / target));
  while (g > 1 && Math.floor(n / g) < 3) g--;
  const base = Math.floor(n / g), rem = n % g, sizes = [];
  for (let i = 0; i < g; i++) sizes.push(base + (i < rem ? 1 : 0));
  return sizes;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function groupLabel(i) { return String.fromCharCode(65 + i); }
const CAT_CODE = {
  "men's doubles": "MD", "mens doubles": "MD", "md": "MD",
  "women's doubles": "WD", "womens doubles": "WD", "wd": "WD",
  "fixed mixed": "MIXED", "mixed": "MIXED",
};
function catCode(s) {
  return CAT_CODE[normName(s)] || String(s || "").toUpperCase().trim();
}
const T_HEADERS = {
  [TABS.t_events]: ["Event_ID", "Name", "Venue", "Date", "Start_Time", "Num_Courts", "Match_Minutes", "Created_At"],
  [TABS.t_tournaments]: ["Tournament_ID", "Event_ID", "Category", "Level", "Format", "Group_Size_Target", "Advancers_Per_Group", "Status", "Admin_Username", "Created_At"],
  [TABS.t_entrants]: ["Tournament_ID", "Entrant_ID", "Player1_Name", "Player1_IG", "Player2_Name", "Player2_IG", "Seed_ELO", "Is_New_P1", "Is_New_P2", "Created_At"],
  [TABS.t_groups]: ["Tournament_ID", "Category", "Group_Label", "Entrant_ID", "Player1_Name", "Player2_Name", "Seed_ELO"],
  [TABS.t_matches]: ["Tournament_ID", "Match_ID", "Stage", "Group_Label", "Bracket", "Round", "Court", "Slot_Index", "Scheduled_Time", "Entrant_A", "Entrant_B", "Score_A", "Score_B", "Winner", "Status", "Updated_At"],
  [TABS.t_form]: ["Timestamp", "Category", "Player1_Name", "Player1_IG", "Player2_Name", "Player2_IG", "Contact_WA"],
};
// Create any missing tournament tabs (with header row) so the engine is self-bootstrapping.
async function ensureTabs(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const existing = (meta.data.sheets || []).map((s) => s.properties.title);
  const toCreate = Object.keys(T_HEADERS).filter((t) => !existing.includes(t));
  if (!toCreate.length) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: toCreate.map((title) => ({ addSheet: { properties: { title } } })) },
  });
  for (const title of toCreate) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `${title}!A1`, valueInputOption: "RAW",
      requestBody: { values: [T_HEADERS[title]] },
    });
  }
}

// ==============================================================
// 1. HANDLER UTAMA (LOGIKA BACKEND API)
// ==============================================================
const netlifyHandler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    const path = (event.path || event.url || "")
      .replace("/.netlify/functions/sheet", "")
      .replace("/api/", "")
      .replace("/api", "")
      .replace(/^\//, "")
      .split("?")[0];
      
    const method = event.httpMethod;

    let rawBody = event.body || "{}";
    if (event.isBase64Encoded && event.body) {
      rawBody = Buffer.from(event.body, "base64").toString("utf-8");
    }
    const body = method === "POST" || method === "PUT" ? JSON.parse(rawBody) : {};
    const params = event.queryStringParameters || {};

    // --- ROUTES ---
    if (path === "settings" && method === "GET") return await getSettings();
    if (path === "auth/login") return await login(body);

    if (path === "players" && method === "GET") return await getPlayers(params);
    if (path === "players" && method === "POST") return await addPlayer(body);
    if (path === "players/update" && method === "PUT") return await updatePlayer(body);
    if (path === "players/claim" && method === "POST") return await claimProfile(body);
    if (path.startsWith("players/") && method === "GET") {
      const name = decodeURIComponent(path.replace("players/", ""));
      return await getPlayerDetail(name);
    }

    if (path === "venues" && method === "GET") return await getVenues();
    if (path === "venues" && method === "POST") return await addVenue(body);
    if (path === "venues/update" && method === "PUT") return await updateVenue(body);
    if (path.startsWith("venues/") && path.endsWith("/matches") && method === "GET") {
      const v = decodeURIComponent(path.replace("venues/", "").replace("/matches", ""));
      return await getVenueMatches(v, params);
    }
    if (path.startsWith("venues/") && path.endsWith("/matches") && method === "POST") {
      const v = decodeURIComponent(path.replace("venues/", "").replace("/matches", ""));
      return await addVenueMatch(v, body);
    }
    if (path.startsWith("venues/") && path.endsWith("/ranking") && method === "GET") {
      const v = decodeURIComponent(path.replace("venues/", "").replace("/ranking", ""));
      return await getVenueWeeklyRanking(v, params);
    }

    if (path === "sessions" && method === "POST") return await saveSession(body);
    if (path === "sessions" && method === "GET") return await listSessions(params);

    if (path === "elo/latest" && method === "GET") return await getLatestElo();
    if (path === "elo/history" && method === "GET") return await getEloHistory(params.player);
    if (path === "elo/leaderboard" && method === "GET") return await getNationalLeaderboard(params);

    if (path === "parse" && method === "POST") return await parseAmericanoUrl(body);

    if (path === "admins" && method === "GET") return await getAdmins();
    if (path === "admins" && method === "POST") return await addAdmin(body);

    // --- TOURNAMENT ROUTES (Phase 1) ---
    if (path === "tournament/event" && method === "POST") return await tCreateEvent(body);
    if (path === "tournament/events" && method === "GET") return await tListEvents();
    if (path.startsWith("tournament/event/") && path.endsWith("/schedule") && method === "POST") {
      return await tScheduleEvent(decodeURIComponent(path.replace("tournament/event/", "").replace("/schedule", "")), body);
    }
    if (path.startsWith("tournament/event/") && path.endsWith("/finalize-elo") && method === "POST") {
      return await tFinalizeElo(decodeURIComponent(path.replace("tournament/event/", "").replace("/finalize-elo", "")), body && body.force);
    }
    if (path.startsWith("tournament/event/") && path.endsWith("/public") && method === "GET") {
      return await tPublicEvent(decodeURIComponent(path.replace("tournament/event/", "").replace("/public", "")));
    }
    if (path.startsWith("tournament/event/") && path.endsWith("/schedule") && method === "GET") {
      return await tGetEventSchedule(decodeURIComponent(path.replace("tournament/event/", "").replace("/schedule", "")));
    }
    if (path === "tournament/list" && method === "GET") return await tListTournaments(params);
    if (path === "tournament" && method === "POST") return await tCreateTournament(body);
    if (path === "tournament/entrant" && method === "PUT") return await tUpdateEntrant(body);
    if (path === "tournament/match" && method === "PUT") return await tUpdateMatchScore(body);
    if (path === "tournament/playoff/match" && method === "PUT") return await tUpdatePlayoffScore(body);
    if (path === "tournament/match/meta" && method === "PUT") return await tUpdateMatchMeta(body);
    if (path.startsWith("tournament/") && path.endsWith("/playoff") && method === "POST") {
      return await tGeneratePlayoff(decodeURIComponent(path.replace("tournament/", "").replace("/playoff", "")), body);
    }
    if (path.startsWith("tournament/") && path.endsWith("/import") && method === "POST") {
      return await tImport(decodeURIComponent(path.replace("tournament/", "").replace("/import", "")));
    }
    if (path.startsWith("tournament/") && path.endsWith("/draw") && method === "POST") {
      return await tDrawGroups(decodeURIComponent(path.replace("tournament/", "").replace("/draw", "")));
    }
    if (path.startsWith("tournament/") && path.endsWith("/groups") && method === "GET") {
      return await tGetGroups(decodeURIComponent(path.replace("tournament/", "").replace("/groups", "")));
    }
    if (path.startsWith("tournament/") && path.endsWith("/matches") && method === "GET") {
      return await tListMatches(decodeURIComponent(path.replace("tournament/", "").replace("/matches", "")));
    }
    if (path.startsWith("tournament/") && path.endsWith("/entrants") && method === "GET") {
      return await tListEntrants(decodeURIComponent(path.replace("tournament/", "").replace("/entrants", "")));
    }
    if (path.startsWith("tournament/") && path.endsWith("/standings") && method === "GET") {
      return await tGetStandings(decodeURIComponent(path.replace("tournament/", "").replace("/standings", "")));
    }
    if (path.startsWith("tournament/") && path.endsWith("/playoff") && method === "GET") {
      return await tGetPlayoff(decodeURIComponent(path.replace("tournament/", "").replace("/playoff", "")));
    }
    if (path.startsWith("tournament/") && method === "GET") {
      return await tGetTournament(decodeURIComponent(path.replace("tournament/", "")));
    }

    return respond(404, { error: "Route not found", route: path });
  } catch (err) {
    console.error("Function error:", err);
    return respond(500, { error: err.message });
  }
};

// ==============================================================
// 2. VERCEL ADAPTER (JEMBATAN UNTUK HOSTING VERCEL)
// ==============================================================
module.exports = async (req, res) => {
  const event = {
    path: req.url,
    url: req.url,
    httpMethod: req.method,
    queryStringParameters: req.query || {},
    body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}),
    isBase64Encoded: false
  };

  try {
    const result = await netlifyHandler(event);
    if (result.headers) {
      for (const [key, value] of Object.entries(result.headers)) {
        res.setHeader(key, value);
      }
    }
    return res.status(result.statusCode || 200).send(result.body);
  } catch (err) {
    console.error("Vercel Adapter Error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};


// ==============================================================
// 3. FUNGSI GOOGLE SHEETS & LOGIKA APLIKASI
// ==============================================================

// ── AUTH ──
async function login({ username, password }) {
  if (!username || !password) return respond(400, { error: "Username and password required" });
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.admins}!A2:E` });
  const rows = res.data.values || [];
  const match = rows.find((r) => r[0] === username && r[1] === password);
  if (!match) return respond(401, { error: "Invalid credentials" });

  const role = match[2] || "venue_admin";
  const venue = match[3] || "";
  const token = Buffer.from(`${username}:${role}:${venue}:${Date.now()}`).toString("base64");
  return respond(200, { token, role, venue, username });
}

// ── PLAYERS ──
async function getPlayers(params) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.players}!A2:J` });
  const rows = res.data.values || [];
  let players = rows.map((r) => ({
    name: r[0] || "", ig: r[1] || "", verified: r[2] === "TRUE",
    displayName: r[3] || r[0] || "", gender: (r[4] || "M").toUpperCase(),
    region: r[5] || "", photoUrl: r[6] || "", clubs: r[7] || "", createdAt: r[8] || "",
    winnerAt: r[9] || "",
  }));
  if (params.gender) players = players.filter((p) => p.gender === params.gender.toUpperCase());
  if (params.region) players = players.filter((p) => p.region.toLowerCase().includes(params.region.toLowerCase()));
  if (params.search) {
    const q = params.search.toLowerCase();
    players = players.filter((p) => p.name.toLowerCase().includes(q) || p.displayName.toLowerCase().includes(q) || p.ig.toLowerCase().includes(q));
  }
  return respond(200, { players });
}

async function getPlayerDetail(name) {
  const sheets = getSheets();
  const pRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.players}!A2:J` });
  const pRows = pRes.data.values || [];
  const pRow = pRows.find((r) => r[0]?.toLowerCase() === name.toLowerCase());
  if (!pRow) return respond(404, { error: "Player not found" });

  const player = {
    name: pRow[0], ig: pRow[1] || "", verified: pRow[2] === "TRUE",
    displayName: pRow[3] || pRow[0], gender: (pRow[4] || "M").toUpperCase(),
    region: pRow[5] || "", photoUrl: pRow[6] || "", clubs: pRow[7] || "", createdAt: pRow[8] || "",
    winnerAt: pRow[9] || "",
  };

  const eRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.elo_log}!A2:G` });
  const eRows = eRes.data.values || [];
  const history = eRows.filter((r) => r[1]?.toLowerCase() === name.toLowerCase()).map((r) => ({
    sessionId: r[0], elo: parseInt(r[2]) || 1350, delta: parseInt(r[3]) || 0, w: parseInt(r[4]) || 0, l: parseInt(r[5]) || 0, timestamp: r[6] || "",
  }));

  const totalW = history.reduce((s, h) => s + h.w, 0);
  const totalL = history.reduce((s, h) => s + h.l, 0);
  const totalMatches = totalW + totalL;
  const winRate = totalMatches > 0 ? Math.round((totalW / totalMatches) * 100) : 0;
  const currentElo = history.length > 0 ? history[history.length - 1].elo : 1350;

  let streak = 0, streakType = "";
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].delta > 0) { if (streakType === "" || streakType === "W") { streak++; streakType = "W"; } else break; }
    else if (history[i].delta < 0) { if (streakType === "" || streakType === "L") { streak++; streakType = "L"; } else break; }
  }

  return respond(200, { player, stats: { currentElo, totalMatches, totalW, totalL, winRate, streak: `${streak}${streakType}` }, history });
}

async function addPlayer(body) {
  const { name, gender, ig, displayName, region, photoUrl, clubs } = body;
  if (!name) return respond(400, { error: "Name is required" });
  const startElo = parseInt(body.elo) || 1350;
  const sheets = getSheets();
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: `${TABS.players}!A:I`, valueInputOption: "USER_ENTERED",
    requestBody: { values: [[ name, ig || "", ig ? "TRUE" : "FALSE", displayName || name, (gender || "M").toUpperCase(), region || "", photoUrl || "", clubs || "", now ]] },
  });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: `${TABS.elo_log}!A:G`, valueInputOption: "USER_ENTERED",
    requestBody: { values: [["INITIAL", name, startElo, 0, 0, 0, now]] },
  });
  return respond(200, { success: true });
}

async function updatePlayer(body) {
  const { name, updates } = body;
  if (!name || !updates) return respond(400, { error: "name and updates required" });
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.players}!A2:J` });
  const rows = res.data.values || [];
  const ri = rows.findIndex((r) => r[0]?.toLowerCase() === name.toLowerCase());
  if (ri === -1) return respond(404, { error: "Player not found" });
  const sr = ri + 2, c = rows[ri];
  const updated = [
    updates.name || c[0] || "", updates.ig || c[1] || "", updates.ig ? "TRUE" : c[2] || "FALSE",
    updates.displayName || c[3] || c[0] || "", (updates.gender || c[4] || "M").toUpperCase(),
    updates.region || c[5] || "", updates.photoUrl || c[6] || "", updates.clubs || c[7] || "", c[8] || "", c[9] || "",
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: `${TABS.players}!A${sr}:J${sr}`, valueInputOption: "USER_ENTERED",
    requestBody: { values: [updated] },
  });
  return respond(200, { success: true });
}

async function claimProfile({ name, ig_handle, session_id }) {
  if (!name || !ig_handle) return respond(400, { error: "name and ig_handle required" });
  const sheets = getSheets();
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: `${TABS.claims}!A:E`, valueInputOption: "USER_ENTERED",
    requestBody: { values: [[name, ig_handle, session_id || "", "PENDING", now]] },
  });
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.players}!A2:J` });
  const rows = existing.data.values || [];
  const ri = rows.findIndex((r) => r[0]?.toLowerCase() === name.toLowerCase());
  
  if (ri === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: `${TABS.players}!A:I`, valueInputOption: "USER_ENTERED",
      requestBody: { values: [[name, ig_handle, "TRUE", name, "M", "", "", "", now]] },
    });
  } else {
    const sr = ri + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `${TABS.players}!B${sr}:C${sr}`, valueInputOption: "USER_ENTERED",
      requestBody: { values: [[ig_handle, "TRUE"]] },
    });
  }
  return respond(200, { success: true });
}

// ── VENUES ──
function venueTabName(name) {
  return `Venue_${name.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

async function getVenues() {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.venues}!A2:I` });
  const rows = res.data.values || [];
  const venues = rows.map((r) => ({
    name: r[0] || "", location: r[1] || "", region: r[2] || "", schedule: r[3] || "",
    prizePool: r[4] || "", contact: r[5] || "", logoUrl: r[6] || "", createdAt: r[7] || "", registerUrl: r[8] || "",
  }));
  return respond(200, { venues });
}

async function addVenue(body) {
  const { name, location, region, schedule, prizePool, contact, logoUrl, registerUrl } = body;
  if (!name) return respond(400, { error: "Venue name required" });
  const sheets = getSheets();
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: `${TABS.venues}!A:I`, valueInputOption: "USER_ENTERED",
    requestBody: { values: [[ name, location || "", region || "", schedule || "", prizePool || "", contact || "", logoUrl || "", now, registerUrl || "" ]] },
  });
  const tabName = venueTabName(name);
  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const exists = spreadsheet.data.sheets.some((s) => s.properties.title === tabName);
    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID, requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID, range: `${tabName}!A1:J1`, valueInputOption: "USER_ENTERED",
        requestBody: { values: [[ "Week", "Date", "P1_Team1", "P2_Team1", "P1_Team2", "P2_Team2", "Score_T1", "Score_T2", "Gender", "Source_URL" ]] },
      });
    }
  } catch (e) { console.error("Error creating venue tab:", e); }
  return respond(200, { success: true });
}

async function updateVenue(body) {
  const { name, updates } = body;
  if (!name || !updates) return respond(400, { error: "name and updates required" });
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.venues}!A2:I` });
  const rows = res.data.values || [];
  const ri = rows.findIndex((r) => r[0]?.toLowerCase() === name.toLowerCase());
  if (ri === -1) return respond(404, { error: "Venue not found" });
  const sr = ri + 2, c = rows[ri];
  const updated = [
    updates.name || c[0] || "", updates.location || c[1] || "", updates.region || c[2] || "",
    updates.schedule || c[3] || "", updates.prizePool || c[4] || "", updates.contact || c[5] || "",
    updates.logoUrl || c[6] || "", c[7] || "", updates.registerUrl || c[8] || "",
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: `${TABS.venues}!A${sr}:I${sr}`, valueInputOption: "USER_ENTERED",
    requestBody: { values: [updated] },
  });
  return respond(200, { success: true });
}

function getWeekNumber(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

async function getVenueMatches(venueName, params) {
  const sheets = getSheets();
  const tab = venueTabName(venueName);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tab}!A2:J` }).catch(() => ({ data: { values: [] } }));
  const rows = res.data.values || [];
  let matches = rows.map((r) => ({
    week: r[0] || "", date: r[1] || "", p1t1: r[2] || "", p2t1: r[3] || "", p1t2: r[4] || "", p2t2: r[5] || "",
    scoreT1: parseInt(r[6]) || 0, scoreT2: parseInt(r[7]) || 0, gender: (r[8] || "M").toUpperCase(), sourceUrl: r[9] || "",
  }));
  if (params.week) matches = matches.filter((m) => m.week === params.week);
  if (params.gender) matches = matches.filter((m) => m.gender === params.gender.toUpperCase());
  return respond(200, { matches, venue: venueName });
}

async function addVenueMatch(venueName, body) {
  const { matches } = body;
  if (!matches || !matches.length) return respond(400, { error: "matches array required" });
  const sheets = getSheets();
  const tab = venueTabName(venueName);
  const now = new Date().toISOString().split("T")[0];
  const weekNum = getWeekNumber(new Date());
  
  const rows = matches.map((m) => [
    m.week || `W${weekNum}`, m.date || now, m.p1t1 || "", m.p2t1 || "", m.p1t2 || "", m.p2t2 || "",
    m.scoreT1 || 0, m.scoreT2 || 0, (m.gender || "M").toUpperCase(), m.sourceUrl || ""
  ]);

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: `${tab}!A:J`, valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });
  } catch (err) {
    return respond(500, { error: `Failed to write to venue tab. Make sure tab ${tab} exists.` });
  }

  // Create new players if they don't exist
  const newPlayers = [];
  try {
    const allPlayersNames = [...new Set(matches.flatMap((m) => [m.p1t1, m.p2t1, m.p1t2, m.p2t2]).filter(Boolean))];
    const pRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.players}!A2:A` });
    const existingPlayers = (pRes.data.values || []).map((r) => (r[0] || "").toLowerCase());
    const isoNow = new Date().toISOString();
    
    for (const p of allPlayersNames) {
      if (!existingPlayers.includes(p.toLowerCase())) {
        newPlayers.push(p);
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID, range: `${TABS.players}!A:I`, valueInputOption: "USER_ENTERED",
          requestBody: { values: [[ p, "", "FALSE", p, "M", "", "", venueName, isoNow ]] },
        });
        await sheets.spreadsheets.values.append({
          spreadsheetId: SHEET_ID, range: `${TABS.elo_log}!A:G`, valueInputOption: "USER_ENTERED",
          requestBody: { values: [["INITIAL", p, 1350, 0, 0, 0, isoNow]] },
        });
        existingPlayers.push(p.toLowerCase());
      }
    }
  } catch(e) { console.warn("Player auto-create error:", e) }

  return respond(200, { success: true, added: rows.length, newPlayers });
}

async function getVenueWeeklyRanking(venueName, params) {
  const week = params.week || `W${getWeekNumber(new Date())}`;
  const sheets = getSheets();
  const tab = venueTabName(venueName);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${tab}!A2:I` }).catch(() => ({ data: { values: [] } }));
  const rows = res.data.values || [];
  const weekMatches = rows.filter((r) => r[0] === week);
  const stats = {};
  
  weekMatches.forEach((r) => {
    const t1 = [r[2], r[3]].filter(Boolean);
    const t2 = [r[4], r[5]].filter(Boolean);
    const s1 = parseInt(r[6]) || 0;
    const s2 = parseInt(r[7]) || 0;
    const gender = (r[8] || "M").toUpperCase();
    
    [...t1, ...t2].forEach((p) => { if (!stats[p]) stats[p] = { w: 0, l: 0, played: 0, gender }; });
    if (s1 > s2) {
      t1.forEach((p) => { stats[p].w++; stats[p].played++; });
      t2.forEach((p) => { stats[p].l++; stats[p].played++; });
    } else if (s2 > s1) {
      t2.forEach((p) => { stats[p].w++; stats[p].played++; });
      t1.forEach((p) => { stats[p].l++; stats[p].played++; });
    } else {
      [...t1, ...t2].forEach((p) => { stats[p].played++; });
    }
  });

  const eRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.elo_log}!A2:G` });
  const eRows = eRes.data.values || [];
  const latestElo = {};
  eRows.forEach((r) => { if (r[1]) latestElo[r[1].toLowerCase()] = parseInt(r[2]) || 1350; });

  let ranking = Object.keys(stats).map((p) => ({
    name: p, w: stats[p].w, l: stats[p].l, played: stats[p].played,
    gender: stats[p].gender, elo: latestElo[p.toLowerCase()] || 1350,
  }));
  
  ranking.sort((a, b) => b.w - a.w || b.elo - a.elo);
  if (params.gender) ranking = ranking.filter((p) => p.gender === params.gender.toUpperCase());
  return respond(200, { week, venue: venueName, ranking });
}

// ── SESSIONS ──
async function saveSession(body) {
  const { sessionName, venue, sourceUrl, matchCount, playerCount, players, matches, elo_results } = body;
  const sheets = getSheets();
  const sessionId = `SES_${Date.now()}`;
  const now = new Date().toISOString();
  
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: `${TABS.sessions}!A:I`, valueInputOption: "USER_ENTERED",
    requestBody: { values: [[ sessionId, sessionName || "Manual Entry", sourceUrl || "", "Americano", "N/A", venue || "Unknown", playerCount || 0, matchCount || 0, now ]] },
  });

  if (elo_results && elo_results.length > 0) {
    const eloRows = elo_results.map(r => [
        sessionId, r.player, r.new_elo || 1350, r.elo_change || 0, 
        r.w || 0, r.l || 0, now
    ]);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID, range: `${TABS.elo_log}!A:G`, valueInputOption: "USER_ENTERED",
      requestBody: { values: eloRows },
    });
  }

  return respond(200, { success: true, sessionId });
}

async function listSessions(params) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.sessions}!A2:I` });
  const rows = res.data.values || [];
  let sessions = rows.map((r) => ({
    id: r[0], name: r[1], sourceUrl: r[2], format: r[3], courts: r[4], venue: r[5], playerCount: r[6], roundCount: r[7], createdAt: r[8],
  }));
  if (params.venue) sessions = sessions.filter((s) => s.venue.toLowerCase().includes(params.venue.toLowerCase()));
  return respond(200, { sessions });
}

// ── ELO / LEADERBOARD ──
async function getLatestElo() {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.elo_log}!A2:G` });
  const rows = res.data.values || [];
  const latest = {};
  rows.forEach((r) => {
    if (r[1]) {
      latest[r[1]] = { sessionId: r[0], elo: parseInt(r[2]) || 1350, delta: parseInt(r[3]) || 0, w: parseInt(r[4]) || 0, l: parseInt(r[5]) || 0, timestamp: r[6] || "" };
    }
  });
  return respond(200, { players: latest });
}

async function getEloHistory(player) {
  if (!player) return respond(400, { error: "player param required" });
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.elo_log}!A2:G` });
  const rows = res.data.values || [];
  const history = rows.filter((r) => r[1]?.toLowerCase() === player.toLowerCase()).map((r) => ({
    sessionId: r[0], elo: parseInt(r[2]) || 1350, delta: parseInt(r[3]) || 0, w: parseInt(r[4]) || 0, l: parseInt(r[5]) || 0, timestamp: r[6] || "",
  }));
  return respond(200, { player, history });
}

function getTierName(elo) {
  if (elo >= 3000) return "Platinum";
  if (elo >= 2500) return "Gold";
  if (elo >= 2100) return "Silver";
  if (elo >= 1800) return "Upper Bronze";
  if (elo >= 1500) return "Bronze";
  if (elo >= 1200) return "Lower Bronze";
  if (elo >= 900) return "Upper Beginner";
  return "Beginner";
}

async function getNationalLeaderboard(params) {
  const sheets = getSheets();
  const pRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.players}!A2:J` });
  const pRows = pRes.data.values || [];
  const playersInfo = {};
  pRows.forEach((r) => {
    if (r[0]) {
      playersInfo[r[0].toLowerCase()] = {
        name: r[0], ig: r[1] || "", verified: r[2] === "TRUE",
        displayName: r[3] || r[0], gender: (r[4] || "M").toUpperCase(),
        region: r[5] || "", photoUrl: r[6] || "", clubs: r[7] || "", winnerAt: r[9] || "",
      };
    }
  });

  const eRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.elo_log}!A2:G` });
  const eRows = eRes.data.values || [];

  // Build full stats per player from ELO_Log
  // Each row: [sessionId, name, elo, delta, w, l, timestamp]
  const playerStats = {};
  eRows.forEach((r) => {
    if (!r[1]) return;
    const k = r[1].toLowerCase();
    if (!playerStats[k]) {
      playerStats[k] = {
        elo: 1350,
        totalW: 0,
        totalL: 0,
        history: [],   // [{delta, timestamp}] for streak calculation
      };
    }
    const elo    = parseInt(r[2]) || 1350;
    const delta  = parseInt(r[3]) || 0;
    const w      = parseInt(r[4]) || 0;
    const l      = parseInt(r[5]) || 0;
    const ts     = r[6] || "";

    // Always update to latest ELO (rows are in append order, last = current)
    if (r[0] !== "INITIAL") {
      playerStats[k].elo     = elo;
      playerStats[k].totalW += w;
      playerStats[k].totalL += l;
      playerStats[k].history.push({ delta, timestamp: ts });
    } else {
      // INITIAL row: only set ELO if no other row yet
      if (playerStats[k].history.length === 0) {
        playerStats[k].elo = elo;
      }
    }
  });

  // Compute winRate + streak per player
  Object.keys(playerStats).forEach((k) => {
    const ps = playerStats[k];
    const totalMatches = ps.totalW + ps.totalL;
    ps.totalMatches = totalMatches;
    ps.winRate = totalMatches > 0 ? Math.round((ps.totalW / totalMatches) * 100) : 0;

    // Streak: walk history backwards
    let streak = 0, streakType = "";
    for (let i = ps.history.length - 1; i >= 0; i--) {
      const d = ps.history[i].delta;
      if (d > 0) {
        if (streakType === "" || streakType === "W") { streak++; streakType = "W"; } else break;
      } else if (d < 0) {
        if (streakType === "" || streakType === "L") { streak++; streakType = "L"; } else break;
      } else break; // delta 0 = draw / calibration row, stop streak
    }
    ps.streak = streak > 0 ? `${streak}${streakType}` : "—";
    delete ps.history; // don't send raw history in leaderboard response
  });

  let leaderboard = Object.keys(playerStats).map((k) => {
    const ps  = playerStats[k];
    const elo = ps.elo;
    const info = playersInfo[k] || { name: k, displayName: k, gender: "M", region: "", clubs: "", verified: false, photoUrl: "", winnerAt: "" };
    return {
      ...info,
      elo,
      level:        getTierName(elo),
      totalMatches: ps.totalMatches,
      totalW:       ps.totalW,
      totalL:       ps.totalL,
      winRate:      ps.winRate,
      streak:       ps.streak,
    };
  });

  leaderboard.sort((a, b) => b.elo - a.elo);

  if (params.gender) leaderboard = leaderboard.filter((p) => p.gender === params.gender.toUpperCase());
  if (params.region) leaderboard = leaderboard.filter((p) => p.region.toLowerCase().includes(params.region.toLowerCase()));
  if (params.level) leaderboard = leaderboard.filter((p) => p.level.toLowerCase().replace(/\s/g, "") === params.level.toLowerCase().replace(/\s/g, ""));
  
  if (params.search) {
    const q = params.search.toLowerCase();
    leaderboard = leaderboard.filter((p) => p.name.toLowerCase().includes(q) || p.displayName.toLowerCase().includes(q));
  }
  
  if (params.venue) {
    const v = params.venue.toLowerCase();
    leaderboard = leaderboard.filter((p) => (p.clubs || "").toLowerCase().includes(v));
  }

  const page = parseInt(params.page) || 1;
  const limit = parseInt(params.limit) || 20;
  const start = (page - 1) * limit;
  const paginated = leaderboard.slice(start, start + limit);

  return respond(200, {
    leaderboard: paginated, total: leaderboard.length, page, limit,
    totalPages: Math.ceil(leaderboard.length / limit)
  });
}

// ── PARSE AMERICANO-PADEL.COM (FETCH FIX) ──
async function parseAmericanoUrl({ url, venue, gender }) {
  if (!url) return respond(400, { error: "URL is required" });
  if (!url.includes("americano-padel.com/r/"))
    return respond(400, { error: "Only americano-padel.com URLs supported" });
  try {
    const fetchUrl = url.includes("?ln=") ? url : `${url}?ln=en`;
    
    // Menggunakan fetch untuk handle redirect
    const response = await fetch(fetchUrl, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
      }
    });

    if (!response.ok) throw new Error(`Server responded with status: ${response.status}`);
    const html = await response.text();

    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || html.match(/<title>([^<]+)<\/title>/i);
    let sessionName = titleMatch ? titleMatch[1].replace("Americano Padel app - ", "").trim() : "Imported Session";

    const standings = [];
    const standingsRegex = /<td[^>]*player-pos[^>]*>\s*(\d+)\.\s*<\/td>\s*<td>([^<]+)<\/td>\s*<td[^>]*win-loss-tie[^>]*>\s*(\d+)-(\d+)-(\d+)\s*<\/td>\s*<td[^>]*points-diff[^>]*>\s*([^<]+)<\/td>[\s\S]*?<span class="points">\s*(\d+)\s*<\/span>/gi;
    let sM;
    while ((sM = standingsRegex.exec(html)) !== null) {
      standings.push({
        rank: parseInt(sM[1]), name: sM[2].trim(),
        w: parseInt(sM[3]), l: parseInt(sM[4]), t: parseInt(sM[5]),
        diff: parseInt(sM[6]), points: parseInt(sM[7]),
      });
    }

    const matches = [];
    const roundBlocks = html.split(/Round\s+#(\d+)/i);
    
    for (let i = 1; i < roundBlocks.length; i += 2) {
      const roundNum = parseInt(roundBlocks[i]);
      const block = roundBlocks[i + 1] || "";
      const courtBlocks = block.split(/Court\s+(\d+)/i);
      
      for (let j = 1; j < courtBlocks.length; j += 2) {
        const courtNum = parseInt(courtBlocks[j]);
        const cb = courtBlocks[j + 1] || "";

        const nameRegex = /<div[^>]*class="[^"]*team[12][^"]*"[^>]*>\s*([^<]+)\s*<\/div>/gi;
        const names = [];
        let nM;
        while ((nM = nameRegex.exec(cb)) !== null) names.push(nM[1].trim());

        const scoreRegex = /<div[^>]*id="match_\d+_team_[12]_result"[^>]*>\s*(\d+)\s*<\/div>/gi;
        const scores = [];
        let scM;
        while ((scM = scoreRegex.exec(cb)) !== null) scores.push(parseInt(scM[1], 10));

        if (names.length >= 4 && scores.length >= 2) {
          matches.push({
            round: roundNum, court: courtNum,
            p1t1: names[0], p2t1: names[1],
            p1t2: names[2], p2t2: names[3],
            scoreT1: scores[0], scoreT2: scores[1],
            gender: gender || "M",
          });
        }
      }
    }

    const allPlayers = standings.length > 0 ? standings.map((s) => s.name) : [...new Set(matches.flatMap((m) => [m.p1t1, m.p2t1, m.p1t2, m.p2t2]))];

    return respond(200, {
      success: true, sessionName, sourceUrl: url,
      playerCount: allPlayers.length, matchCount: matches.length,
      players: allPlayers, standings, matches,
    });
  } catch (err) {
    console.error("Parse error:", err);
    return respond(500, { error: `Failed to parse: ${err.message}` });
  }
}

// ── ADMINS ──
async function getAdmins() {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.admins}!A2:E` });
  const rows = res.data.values || [];
  const admins = rows.map((r) => ({
    username: r[0], role: r[2] || "venue_admin", venue: r[3] || "", createdAt: r[4] || "",
  }));
  return respond(200, { admins });
}

async function addAdmin(body) {
  const { username, password, role, venue } = body;
  if (!username || !password) return respond(400, { error: "username and password required" });
  const sheets = getSheets();
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: `${TABS.admins}!A:E`, valueInputOption: "USER_ENTERED",
    requestBody: { values: [[username, password, role || "venue_admin", venue || "", now]] },
  });
  return respond(200, { success: true });
}
async function getSettings() {
  const sheets = getSheets();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: "Settings!A2:B",
    });
    const rows = res.data.values || [];
    const settings = {};
    rows.forEach((r) => { if (r[0]) settings[r[0]] = r[1] || ""; });
    return respond(200, { settings });
  } catch (e) {
    // Settings tab may not exist yet — return defaults
    return respond(200, { settings: {} });
  }
}
// ==============================================================
// TOURNAMENT HANDLERS (Phase 1: events, tournaments, import, entrants)
// ==============================================================
async function tCreateEvent(body) {
  const sheets = getSheets();
  await ensureTabs(sheets);
  const id = genId("EV");
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: `${TABS.t_events}!A:H`, valueInputOption: "USER_ENTERED",
    requestBody: { values: [[
      id, body.name || "Untitled Event", body.venue || "", body.date || "",
      body.startTime || "", parseInt(body.numCourts) || 1, parseInt(body.matchMinutes) || 15, now,
    ]] },
  });
  return respond(200, { success: true, eventId: id });
}

async function tListEvents() {
  const sheets = getSheets();
  await ensureTabs(sheets);
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_events}!A2:H` });
  const events = (r.data.values || []).map((x) => ({
    eventId: x[0], name: x[1], venue: x[2], date: x[3], startTime: x[4],
    numCourts: parseInt(x[5]) || 0, matchMinutes: parseInt(x[6]) || 15, createdAt: x[7],
  }));
  return respond(200, { events });
}

async function tCreateTournament(body) {
  if (!body.eventId) return respond(400, { error: "eventId required" });
  const sheets = getSheets();
  await ensureTabs(sheets);
  const id = genId("TM");
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: `${TABS.t_tournaments}!A:J`, valueInputOption: "USER_ENTERED",
    requestBody: { values: [[
      id, body.eventId, catCode(body.category), String(body.level || "lower_bronze").toLowerCase().trim(),
      String(body.format || "SINGLE").toUpperCase(), parseInt(body.groupSizeTarget) || 4,
      parseInt(body.advancersPerGroup) || 2, "SETUP", body.adminUsername || "", now,
    ]] },
  });
  return respond(200, { success: true, tournamentId: id });
}

async function tListTournaments(params) {
  const sheets = getSheets();
  await ensureTabs(sheets);
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_tournaments}!A2:J` });
  let rows = r.data.values || [];
  if (params.eventId) rows = rows.filter((x) => x[1] === params.eventId);
  const tournaments = rows.map((x) => ({
    tournamentId: x[0], eventId: x[1], category: x[2], level: x[3], format: x[4],
    groupSizeTarget: parseInt(x[5]) || 4, advancersPerGroup: parseInt(x[6]) || 2,
    status: x[7], adminUsername: x[8], createdAt: x[9],
  }));
  return respond(200, { tournaments });
}

async function tGetTournamentRow(sheets, id) {
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_tournaments}!A2:J` });
  const rows = r.data.values || [];
  const idx = rows.findIndex((x) => x[0] === id);
  if (idx === -1) return null;
  const x = rows[idx];
  return {
    rowIndex: idx + 2,
    tournament: {
      tournamentId: x[0], eventId: x[1], category: x[2], level: x[3], format: x[4],
      groupSizeTarget: parseInt(x[5]) || 4, advancersPerGroup: parseInt(x[6]) || 2,
      status: x[7], adminUsername: x[8], createdAt: x[9],
    },
  };
}

async function tGetTournament(id) {
  const sheets = getSheets();
  await ensureTabs(sheets);
  const t = await tGetTournamentRow(sheets, id);
  if (!t) return respond(404, { error: "Tournament not found" });
  const enr = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_entrants}!A2:A` });
  const entrantCount = (enr.data.values || []).filter((x) => x[0] === id).length;
  return respond(200, { tournament: t.tournament, entrantCount });
}

// Import pairs from Form_Responses for this tournament's category.
// Existing Trekkr players keep their last ELO; unknown names are auto-created at the category level ELO.
async function tImport(id) {
  const sheets = getSheets();
  await ensureTabs(sheets);
  const t = await tGetTournamentRow(sheets, id);
  if (!t) return respond(404, { error: "Tournament not found" });
  const category = t.tournament.category;
  const startElo = levelToElo(t.tournament.level);

  const [pRes, eRes, fRes, enRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.players}!A2:J` }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.elo_log}!A2:G` }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_form}!A2:G` }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_entrants}!A2:J` }),
  ]);
  const pRows = pRes.data.values || [];
  const eRows = eRes.data.values || [];
  const fRows = fRes.data.values || [];
  const enRows = enRes.data.values || [];

  const playerByName = new Map();
  for (const r of pRows) playerByName.set(normName(r[0]), { name: r[0], displayName: r[3] || r[0] });
  const eloByName = new Map();
  for (const r of eRows) { const v = parseInt(r[2]); if (!isNaN(v)) eloByName.set(normName(r[1]), v); }

  const existingPairs = new Set();
  for (const r of enRows) { if (r[0] === id) existingPairs.add([normName(r[2]), normName(r[4])].sort().join("|")); }

  const now = new Date().toISOString();
  const newPlayerRows = [], newEloRows = [], newEntrantRows = [];
  const createdThisRun = new Set();
  let matched = 0, created = 0, skipped = 0;

  function resolvePlayer(rawName, ig) {
    const nm = normName(rawName);
    if (!nm) return null;
    if (playerByName.has(nm)) {
      matched++;
      return { name: playerByName.get(nm).name, elo: eloByName.has(nm) ? eloByName.get(nm) : startElo, isNew: false };
    }
    const cleanName = String(rawName).trim();
    created++;
    createdThisRun.add(nm);
    newPlayerRows.push([cleanName, ig || "", ig ? "TRUE" : "FALSE", cleanName, "", "", "", "", now]);
    newEloRows.push(["INITIAL", cleanName, startElo, 0, 0, 0, now]);
    eloByName.set(nm, startElo);
    playerByName.set(nm, { name: cleanName, displayName: cleanName });
    return { name: cleanName, elo: startElo, isNew: true };
  }

  for (const f of fRows) {
    if (catCode(f[1]) !== category) continue;
    const p1 = resolvePlayer(f[2], f[3]);
    const p2 = resolvePlayer(f[4], f[5]);
    if (!p1 || !p2) continue;
    const key = [normName(p1.name), normName(p2.name)].sort().join("|");
    if (existingPairs.has(key)) { skipped++; continue; }
    existingPairs.add(key);
    const seed = Math.round((p1.elo + p2.elo) / 2);
    newEntrantRows.push([
      id, genId("EN"), p1.name, f[3] || "", p2.name, f[5] || "", seed,
      p1.isNew ? "TRUE" : "FALSE", p2.isNew ? "TRUE" : "FALSE", now,
    ]);
  }

  if (newPlayerRows.length) await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: `${TABS.players}!A:I`, valueInputOption: "USER_ENTERED", requestBody: { values: newPlayerRows } });
  if (newEloRows.length) await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: `${TABS.elo_log}!A:G`, valueInputOption: "USER_ENTERED", requestBody: { values: newEloRows } });
  if (newEntrantRows.length) await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: `${TABS.t_entrants}!A:J`, valueInputOption: "USER_ENTERED", requestBody: { values: newEntrantRows } });

  return respond(200, {
    success: true, imported: newEntrantRows.length, newPlayers: newPlayerRows.length,
    matchedNames: matched, skippedDuplicates: skipped, startElo,
  });
}

async function tListEntrants(id) {
  const sheets = getSheets();
  await ensureTabs(sheets);
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_entrants}!A2:J` });
  const entrants = (r.data.values || []).filter((x) => x[0] === id).map((x) => ({
    tournamentId: x[0], entrantId: x[1], player1Name: x[2], player1Ig: x[3],
    player2Name: x[4], player2Ig: x[5], seedElo: parseInt(x[6]) || 0,
    isNewP1: x[7] === "TRUE", isNewP2: x[8] === "TRUE", createdAt: x[9],
  }));
  return respond(200, { entrants });
}

async function tUpdateEntrant(body) {
  const { entrantId, updates } = body;
  if (!entrantId || !updates) return respond(400, { error: "entrantId and updates required" });
  const sheets = getSheets();
  await ensureTabs(sheets);
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_entrants}!A2:J` });
  const rows = r.data.values || [];
  const idx = rows.findIndex((x) => x[1] === entrantId);
  if (idx === -1) return respond(404, { error: "Entrant not found" });
  const row = rows[idx];
  while (row.length < 10) row.push("");
  const map = { player1Name: 2, player1Ig: 3, player2Name: 4, player2Ig: 5, seedElo: 6 };
  for (const [k, v] of Object.entries(updates)) { if (k in map) row[map[k]] = v; }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: `${TABS.t_entrants}!A${idx + 2}:J${idx + 2}`,
    valueInputOption: "USER_ENTERED", requestBody: { values: [row] },
  });
  return respond(200, { success: true });
}

// ==============================================================
// TOURNAMENT HANDLERS (Phase 2: group draw & read/sync)
// ==============================================================
async function rewriteGroups(sheets, id, newRows) {
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_groups}!A2:G` });
  const rows = r.data.values || [];
  const keep = rows.filter((x) => x[0] !== id);
  const all = keep.concat(newRows);
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `${TABS.t_groups}!A2:G` });
  if (all.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `${TABS.t_groups}!A2`, valueInputOption: "USER_ENTERED",
      requestBody: { values: all },
    });
  }
}

// Random draw of entrants into balanced groups; overwrites this tournament's group rows.
async function tDrawGroups(id) {
  const sheets = getSheets();
  await ensureTabs(sheets);
  const t = await tGetTournamentRow(sheets, id);
  if (!t) return respond(404, { error: "Tournament not found" });
  const enr = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_entrants}!A2:J` });
  const entrants = (enr.data.values || []).filter((x) => x[0] === id);
  if (!entrants.length) return respond(400, { error: "Belum ada peserta untuk diundi" });

  const sizes = computeGroupSizes(entrants.length, t.tournament.groupSizeTarget);
  const shuffled = shuffle(entrants);
  const newRows = [], summary = [];
  let cursor = 0;
  for (let gi = 0; gi < sizes.length; gi++) {
    const label = groupLabel(gi);
    const members = shuffled.slice(cursor, cursor + sizes[gi]);
    cursor += sizes[gi];
    for (const e of members) {
      newRows.push([id, t.tournament.category, label, e[1], e[2], e[4], parseInt(e[6]) || 0]);
    }
    const matches = (sizes[gi] * (sizes[gi] - 1)) / 2;
    summary.push({
      label, size: sizes[gi], matches,
      members: members.map((e) => ({ entrantId: e[1], player1Name: e[2], player2Name: e[4], seedElo: parseInt(e[6]) || 0 })),
    });
  }
  await rewriteGroups(sheets, id, newRows);
  return respond(200, { success: true, groupCount: sizes.length, sizes, groups: summary });
}

// Read current groups for a tournament (also used as "sync from sheet" after manual edits).
async function tGetGroups(id) {
  const sheets = getSheets();
  await ensureTabs(sheets);
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_groups}!A2:G` });
  const rows = (r.data.values || []).filter((x) => x[0] === id);
  const map = new Map();
  for (const x of rows) {
    const label = x[2] || "?";
    if (!map.has(label)) map.set(label, []);
    map.get(label).push({ entrantId: x[3], player1Name: x[4], player2Name: x[5], seedElo: parseInt(x[6]) || 0 });
  }
  const groups = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, members]) => ({
    label, size: members.length, matches: (members.length * (members.length - 1)) / 2, members,
  }));
  return respond(200, { groups });
}

// ==============================================================
// TOURNAMENT HANDLERS (Phase 3a: group-stage scheduler)
// ==============================================================
// Round-robin via circle method, returned as equal-sized rounds (each entrant plays <=1 per round).
function roundRobinRounds(ids) {
  let arr = ids.slice();
  const n = arr.length;
  if (n < 2) return [];
  if (n % 2 === 1) arr.push(null);
  const m = arr.length, R = m - 1, half = m / 2;
  let list = arr.slice();
  const rounds = [];
  for (let r = 0; r < R; r++) {
    const round = [];
    for (let i = 0; i < half; i++) {
      const a = list[i], b = list[m - 1 - i];
      if (a !== null && b !== null) round.push([a, b]);
    }
    rounds.push(round);
    const fixed = list[0], rest = list.slice(1);
    rest.unshift(rest.pop());
    list = [fixed, ...rest];
  }
  return rounds;
}
// Concatenate rounds starting at a given round offset (preserves <=2 consecutive guarantee).
function flattenRounds(rounds, offset) {
  const R = rounds.length, out = [];
  for (let i = 0; i < R; i++) for (const mt of rounds[(i + offset) % R]) out.push(mt);
  return out;
}
// Candidate court-orderings: round-offset x within-round rotation. Each keeps <=2 consecutive
// (rounds stay intact; any intra-round order keeps each entrant <=1 per round).
function buildOrderings(rounds) {
  const R = rounds.length;
  if (!R) return [[]];
  const maxLen = Math.max(1, ...rounds.map((r) => r.length));
  const out = [], seen = new Set();
  for (let off = 0; off < R; off++) {
    for (let rot = 0; rot < maxLen; rot++) {
      const order = [];
      for (let i = 0; i < R; i++) {
        const ri = (i + off) % R, round = rounds[ri], L = round.length;
        for (let k = 0; k < L; k++) { const [a, b] = round[(k + rot) % L]; order.push({ a, b, round: ri + 1 }); }
      }
      const sig = order.map((m) => m.a + "-" + m.b).join("|");
      if (!seen.has(sig)) { seen.add(sig); out.push(order); }
    }
  }
  return out;
}
// Greedy LPT: assign each group to the court that frees earliest (creates waves when groups > courts).
// ---- Player play-pattern rule: each pair should play in blocks of 2-3 consecutive
//      matches, never more than 3, and avoid single-then-rest unless forced. ----
function runLengths(order, ids) {
  const slotsOf = {}; ids.forEach((id) => (slotsOf[id] = []));
  order.forEach((m, idx) => { if (slotsOf[m.a]) slotsOf[m.a].push(idx); if (slotsOf[m.b]) slotsOf[m.b].push(idx); });
  const runs = {};
  for (const id of ids) {
    const s = slotsOf[id], rr = []; let cur = 0;
    for (let i = 0; i < s.length; i++) { if (i > 0 && s[i] === s[i - 1] + 1) cur++; else { if (cur > 0) rr.push(cur); cur = 1; } }
    if (cur > 0) rr.push(cur);
    runs[id] = rr;
  }
  return runs;
}
function patternPenalty(order, ids) {
  const runs = runLengths(order, ids); let pen = 0;
  for (const id of ids) for (const len of runs[id]) { if (len === 1) pen += 10; else if (len > 3) pen += (len - 3) * 8; }
  return pen;
}
function otherEnd(e, t) { return e.a === t ? e.b : e.a; }
// Greedy sequencer: keep carrying a team through consecutive matches until its run
// reaches 2-3, then switch to fresh teams. Produces 2-3 blocks, minimal singles.
function greedyCluster(edges, ids, startIdx) {
  const M = edges.length; const used = new Array(M).fill(false);
  const deg = {}; ids.forEach((id) => (deg[id] = 0)); edges.forEach((e) => { deg[e.a]++; deg[e.b]++; });
  const order = []; const trail = {}; ids.forEach((id) => (trail[id] = 0));
  const incident = (t) => { const res = []; for (let i = 0; i < M; i++) if (!used[i] && (edges[i].a === t || edges[i].b === t)) res.push(i); return res; };
  const place = (i) => {
    used[i] = true; const e = edges[i]; const prev = order.length >= 1 ? order[order.length - 1] : null;
    order.push(e); deg[e.a]--; deg[e.b]--;
    const inPrev = (t) => prev && (prev.a === t || prev.b === t);
    const ta = inPrev(e.a) ? trail[e.a] + 1 : 1, tb = inPrev(e.b) ? trail[e.b] + 1 : 1;
    for (const id of ids) trail[id] = 0; trail[e.a] = ta; trail[e.b] = tb;
  };
  place(startIdx);
  while (order.length < M) {
    const prev = order[order.length - 1], p = prev.a, q = prev.b, tp = trail[p], tq = trail[q];
    const canCarry = (t, tr) => tr < 3 && incident(t).length > 0;
    const cp = canCarry(p, tp), cq = canCarry(q, tq);
    let carry = null;
    if (tp >= 2 && tq >= 2) carry = null;
    else if (cp && cq) {
      if (tp === 1 && tq !== 1) carry = p;
      else if (tq === 1 && tp !== 1) carry = q;
      else if (tp === 1 && tq === 1) carry = (deg[p] >= deg[q] ? p : q);
      else carry = (tp <= tq ? p : q);
    } else if (cp) carry = p; else if (cq) carry = q; else carry = null;
    let pick = -1;
    if (carry != null) {
      const inc = incident(carry);
      inc.sort((i, j) => { const xi = otherEnd(edges[i], carry), xj = otherEnd(edges[j], carry); const ti = trail[xi] || 0, tj = trail[xj] || 0; if (ti !== tj) return ti - tj; return (deg[xj] || 0) - (deg[xi] || 0); });
      pick = inc[0];
    } else {
      let cands = []; for (let i = 0; i < M; i++) if (!used[i]) { const e = edges[i]; if (e.a !== p && e.b !== p && e.a !== q && e.b !== q) cands.push(i); }
      if (!cands.length) for (let i = 0; i < M; i++) if (!used[i]) cands.push(i);
      cands.sort((i, j) => (deg[edges[j].a] + deg[edges[j].b]) - (deg[edges[i].a] + deg[edges[i].b]));
      pick = cands[0];
    }
    if (pick < 0) for (let i = 0; i < M; i++) if (!used[i]) { pick = i; break; }
    place(pick);
  }
  return order;
}
function buildClusteredOrderings(rounds, ids) {
  const edges = []; rounds.forEach((r, ri) => r.forEach(([a, b]) => edges.push({ a, b, round: ri + 1 })));
  if (edges.length <= 1) return [edges.slice()];
  const out = [], seen = new Set();
  for (let s = 0; s < edges.length; s++) {
    const o = greedyCluster(edges, ids, s);
    if (o && o.length === edges.length) { const sig = o.map((m) => m.a + "-" + m.b).join("|"); if (!seen.has(sig)) { seen.add(sig); out.push(o); } }
  }
  if (!out.length) out.push(edges.slice());
  return out;
}
function patternTotal(groups) { let s = 0; for (const g of groups) s += patternPenalty(g.orderings[g.oi] || [], g.entrantIds); return s; }
// Choose orderings to (1) avoid cross-court player clashes, then (2) keep good play patterns.
function optimizeOrderings(groups, namesMap) {
  const cost = () => totalClashes(groups, namesMap).clashes * 1000 + patternTotal(groups);
  let best = cost();
  for (let pass = 0; pass < 5; pass++) {
    let improved = false;
    for (const g of groups) {
      const N = (g.orderings || []).length; if (N < 2) continue;
      let bestOi = g.oi, bestC = best;
      for (let o = 0; o < N; o++) { g.oi = o; const c = cost(); if (c < bestC) { bestC = c; bestOi = o; } }
      g.oi = bestOi; if (bestC < best) { best = bestC; improved = true; }
    }
    if (!improved) break;
  }
  return best;
}
function assignGroupsToCourts(groups, numCourts) {
  const courts = Array.from({ length: Math.max(1, numCourts) }, () => 0);
  const sorted = groups.slice().sort((a, b) => b.length - a.length);
  const assign = {};
  for (const g of sorted) {
    let ci = 0;
    for (let i = 1; i < courts.length; i++) if (courts[i] < courts[ci]) ci = i;
    assign[g.key] = { court: ci + 1, startSlot: courts[ci] };
    courts[ci] += g.length;
  }
  return assign;
}
// Normalize a clock value that may come back from Sheets in odd formats
// ("8:00", "08:00:00", "8.00", "8:00 AM") into a clean 24h "HH:MM".
function normClock(v) {
  let s = String(v == null ? "" : v).trim();
  if (!s) return "";
  const ap = /(am|pm)/i.exec(s);
  s = s.replace(/\s*(am|pm)/i, "").trim();
  const p = s.split(/[:.]/);
  let h = parseInt(p[0], 10), m = parseInt(p[1], 10);
  if (isNaN(h)) return "";
  if (isNaN(m)) m = 0;
  if (ap) { const pm = /pm/i.test(ap[0]); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  h = ((h % 24) + 24) % 24; m = ((m % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function addMinutesToTime(hhmm, minutes) {
  const parts = String(hhmm || "09:00").split(":");
  let total = (parseInt(parts[0]) || 0) * 60 + (parseInt(parts[1]) || 0) + minutes;
  total = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
// Count player clashes (same player in 2+ matches at the same absolute slot, across courts).
function totalClashes(groups, namesMap) {
  const slot = new Map();
  for (const g of groups) {
    const order = g.orderings[g.oi || 0] || [];
    for (let j = 0; j < order.length; j++) {
      const players = [...(namesMap[order[j].a] || []), ...(namesMap[order[j].b] || [])].filter(Boolean);
      const s = g.startSlot + j;
      if (!slot.has(s)) slot.set(s, []);
      slot.get(s).push(players);
    }
  }
  let clashes = 0;
  const detail = [];
  for (const [s, arr] of slot) {
    const count = {};
    for (const players of arr) for (const p of players) count[normName(p)] = (count[normName(p)] || 0) + 1;
    const clashed = Object.keys(count).filter((p) => count[p] > 1);
    if (clashed.length) { clashes += clashed.length; detail.push({ slot: s, players: clashed }); }
  }
  return { clashes, detail };
}
// Coordinate descent over each group's round-offset to minimise clashes (best-effort).
function reduceClashes(groups, namesMap) {
  let best = totalClashes(groups, namesMap).clashes;
  for (let pass = 0; pass < 4 && best > 0; pass++) {
    let improved = false;
    for (const g of groups) {
      const N = (g.orderings || []).length;
      if (N < 2) continue;
      let bestOi = g.oi || 0, bestC = best;
      for (let o = 0; o < N; o++) {
        g.oi = o;
        const c = totalClashes(groups, namesMap).clashes;
        if (c < bestC) { bestC = c; bestOi = o; }
      }
      g.oi = bestOi;
      if (bestC < best) { best = bestC; improved = true; }
    }
    if (!improved) break;
  }
  return best;
}
function mapMatchRow(x) {
  return {
    tournamentId: x[0], matchId: x[1], stage: x[2], groupLabel: x[3], bracket: x[4], round: x[5],
    court: parseInt(x[6]) || 0, slot: parseInt(x[7]) || 0, time: x[8], entrantA: x[9], entrantB: x[10],
    scoreA: x[11], scoreB: x[12], winner: x[13], status: x[14], updatedAt: x[15],
  };
}
async function rewriteEventGroupMatches(sheets, tids, newRows) {
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_matches}!A2:P` });
  const rows = r.data.values || [];
  const keep = rows.filter((x) => !(tids.includes(x[0]) && x[2] === "GROUP"));
  const all = keep.concat(newRows);
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `${TABS.t_matches}!A2:P` });
  if (all.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `${TABS.t_matches}!A2`, valueInputOption: "USER_ENTERED",
      requestBody: { values: all },
    });
  }
}
// Generate the full group-stage schedule for an event (all categories share the court pool).
async function tScheduleEvent(eventId, body) {
  const sheets = getSheets();
  await ensureTabs(sheets);
  const evRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_events}!A2:H` });
  const evRows = evRes.data.values || [];
  const evIdx = evRows.findIndex((x) => x[0] === eventId);
  if (evIdx === -1) return respond(404, { error: "Event not found" });
  const evRow = evRows[evIdx];
  // Allow caller (step 6) to override the event's schedule params; persist the new values so the whole app stays consistent.
  const b = body || {};
  const startTime = normClock((b.startTime && String(b.startTime).trim()) || evRow[4]) || "09:00";
  const numCourts = parseInt(b.numCourts) || parseInt(evRow[5]) || 1;
  const matchMinutes = parseInt(b.matchMinutes) || parseInt(evRow[6]) || 15;
  const overridden = (b.startTime != null && String(b.startTime).trim() !== "") || b.numCourts != null || b.matchMinutes != null;
  if (overridden) {
    while (evRow.length < 8) evRow.push("");
    evRow[4] = startTime; evRow[5] = numCourts; evRow[6] = matchMinutes;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `${TABS.t_events}!A${evIdx + 2}:H${evIdx + 2}`,
      valueInputOption: "USER_ENTERED", requestBody: { values: [evRow] },
    });
  }

  const trRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_tournaments}!A2:J` });
  const tournaments = (trRes.data.values || []).filter((x) => x[1] === eventId);
  if (!tournaments.length) return respond(400, { error: "Belum ada kategori di event ini" });
  const tids = tournaments.map((x) => x[0]);

  const grRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_groups}!A2:G` });
  const grRows = (grRes.data.values || []).filter((x) => tids.includes(x[0]));
  if (!grRows.length) return respond(400, { error: "Belum ada grup. Undi grup tiap kategori dulu." });

  const namesMap = {};
  const gmap = new Map();
  for (const x of grRows) {
    const key = `${x[0]}|${x[2]}`;
    if (!gmap.has(key)) gmap.set(key, { key, tid: x[0], label: x[2], category: x[1], entrantIds: [], offset: 0 });
    gmap.get(key).entrantIds.push(x[3]);
    namesMap[x[3]] = [x[4] || "", x[5] || ""];
  }
  const groups = [...gmap.values()];
  for (const g of groups) {
    g.rounds = roundRobinRounds(g.entrantIds);
    g.orderings = buildClusteredOrderings(g.rounds, g.entrantIds);
    let bo = 0, bp = Infinity;
    g.orderings.forEach((o, i) => { const p = patternPenalty(o, g.entrantIds); if (p < bp) { bp = p; bo = i; } });
    g.oi = bo;
    g.length = (g.orderings[0] || []).length;
  }

  const assign = assignGroupsToCourts(groups.map((g) => ({ key: g.key, length: g.length })), numCourts);
  for (const g of groups) { g.court = assign[g.key].court; g.startSlot = assign[g.key].startSlot; }

  optimizeOrderings(groups, namesMap);

  const now = new Date().toISOString();
  const newRows = [];
  let count = 0;
  for (const g of groups) {
    const order = g.orderings[g.oi] || [];
    for (let j = 0; j < order.length; j++) {
      const { a, b, round } = order[j];
      const absSlot = g.startSlot + j;
      const time = addMinutesToTime(startTime, absSlot * matchMinutes);
      newRows.push([g.tid, genId("MT"), "GROUP", g.label, "", round, g.court, absSlot, time, a, b, "", "", "", "SCHEDULED", now]);
      count++;
    }
  }

  const { detail } = totalClashes(groups, namesMap);
  const clashes = detail.map((d) => ({ slot: d.slot, time: addMinutesToTime(startTime, d.slot * matchMinutes), players: d.players }));

  await rewriteEventGroupMatches(sheets, tids, newRows);
  return respond(200, {
    success: true, engine: "clustered-2to3", scheduledMatches: count, groups: groups.length, numCourts, startTime, matchMinutes,
    clashes, clashCount: clashes.length,
  });
}
// All matches for one tournament (admin per-category view).
async function tListMatches(id) {
  const sheets = getSheets();
  await ensureTabs(sheets);
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_matches}!A2:P` });
  const matches = (r.data.values || []).filter((x) => x[0] === id).map(mapMatchRow).sort((a, b) => a.slot - b.slot || a.court - b.court);
  return respond(200, { matches });
}
// Event-wide schedule with team names resolved (for mobile/TV later).
async function tGetEventSchedule(eventId) {
  const sheets = getSheets();
  await ensureTabs(sheets);
  const trRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_tournaments}!A2:J` });
  const trs = (trRes.data.values || []).filter((x) => x[1] === eventId);
  const tids = trs.map((x) => x[0]);
  const catByTid = {};
  for (const x of trs) catByTid[x[0]] = x[2];
  const grRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_groups}!A2:G` });
  const names = {};
  for (const x of (grRes.data.values || [])) if (tids.includes(x[0])) names[x[3]] = `${x[4]} + ${x[5]}`;
  const mRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_matches}!A2:P` });
  const matches = (mRes.data.values || []).filter((x) => tids.includes(x[0]) && x[2] === "GROUP").map((x) => ({
    ...mapMatchRow(x), category: catByTid[x[0]] || "", teamA: names[x[9]] || x[9], teamB: names[x[10]] || x[10],
  })).sort((a, b) => a.slot - b.slot || a.court - b.court);
  return respond(200, { matches });
}

// ==============================================================
// TOURNAMENT HANDLERS (Phase 3b: standings & score entry)
// ==============================================================
// Standings for one group. Tiebreak: wins -> head-to-head (among tied) -> game diff -> games for.
function computeGroupStandings(matches, entrantIds) {
  const st = {};
  for (const id of entrantIds) st[id] = { entrantId: id, played: 0, wins: 0, losses: 0, draws: 0, gf: 0, ga: 0 };
  const has = (v) => v !== "" && v !== null && v !== undefined && !isNaN(Number(v));
  const done = matches.filter((m) => has(m.scoreA) && has(m.scoreB));
  for (const m of done) {
    const a = m.entrantA, b = m.entrantB, sa = Number(m.scoreA), sb = Number(m.scoreB);
    if (!st[a] || !st[b]) continue;
    st[a].played++; st[b].played++;
    st[a].gf += sa; st[a].ga += sb; st[b].gf += sb; st[b].ga += sa;
    if (sa > sb) { st[a].wins++; st[b].losses++; }
    else if (sb > sa) { st[b].wins++; st[a].losses++; }
    else { st[a].draws++; st[b].draws++; }
  }
  function h2hWins(id, subset) {
    let w = 0;
    for (const m of done) {
      const a = m.entrantA, b = m.entrantB, sa = Number(m.scoreA), sb = Number(m.scoreB);
      if (a === id && subset.has(b)) { if (sa > sb) w++; }
      else if (b === id && subset.has(a)) { if (sb > sa) w++; }
    }
    return w;
  }
  const arr = Object.values(st);
  arr.forEach((s) => { s.gd = s.gf - s.ga; });
  arr.sort((x, y) => {
    if (y.wins !== x.wins) return y.wins - x.wins;
    const subset = new Set(arr.filter((s) => s.wins === x.wins).map((s) => s.entrantId));
    const hx = h2hWins(x.entrantId, subset), hy = h2hWins(y.entrantId, subset);
    if (hy !== hx) return hy - hx;
    if (y.gd !== x.gd) return y.gd - x.gd;   // PD (points difference)
    if (y.gf !== x.gf) return y.gf - x.gf;   // PF (points for)
    return x.ga - y.ga;                       // PA (points against, lower is better)
  });
  arr.forEach((s, i) => { s.rank = i + 1; });
  return arr;
}
async function tGetStandings(id) {
  const sheets = getSheets();
  await ensureTabs(sheets);
  const grRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_groups}!A2:G` });
  const grRows = (grRes.data.values || []).filter((x) => x[0] === id);
  if (!grRows.length) return respond(200, { groups: [] });
  const names = {}, members = new Map();
  for (const x of grRows) {
    const label = x[2];
    if (!members.has(label)) members.set(label, []);
    members.get(label).push(x[3]);
    names[x[3]] = `${x[4]} + ${x[5]}`;
  }
  const mRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_matches}!A2:P` });
  const matches = (mRes.data.values || []).filter((x) => x[0] === id && x[2] === "GROUP").map(mapMatchRow);
  const groups = [];
  for (const [label, ids] of [...members.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const gm = matches.filter((m) => m.groupLabel === label);
    const standings = computeGroupStandings(gm, ids).map((s) => ({ ...s, team: names[s.entrantId] || s.entrantId }));
    groups.push({ label, standings });
  }
  return respond(200, { groups });
}
async function tUpdateMatchScore(body) {
  const { matchId, scoreA, scoreB } = body;
  if (!matchId) return respond(400, { error: "matchId required" });
  const sheets = getSheets();
  await ensureTabs(sheets);
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_matches}!A2:P` });
  const rows = r.data.values || [];
  const idx = rows.findIndex((x) => x[1] === matchId);
  if (idx === -1) return respond(404, { error: "Match not found" });
  const row = rows[idx];
  while (row.length < 16) row.push("");
  const sa = (scoreA === undefined || scoreA === null) ? "" : String(scoreA);
  const sb = (scoreB === undefined || scoreB === null) ? "" : String(scoreB);
  row[11] = sa; row[12] = sb;
  const numeric = sa !== "" && sb !== "" && !isNaN(Number(sa)) && !isNaN(Number(sb));
  let winner = "";
  if (numeric) { winner = Number(sa) > Number(sb) ? row[9] : Number(sb) > Number(sa) ? row[10] : ""; }
  row[13] = winner;
  row[14] = numeric ? "DONE" : "SCHEDULED";
  row[15] = new Date().toISOString();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: `${TABS.t_matches}!A${idx + 2}:P${idx + 2}`,
    valueInputOption: "USER_ENTERED", requestBody: { values: [row] },
  });
  return respond(200, { success: true, status: row[14], winner });
}

// ==============================================================
// TOURNAMENT HANDLERS (Phase 4: playoff brackets)
// ==============================================================
function nextPow2(n) { let p = 1; while (p < n) p *= 2; return Math.max(1, p); }
// Standard bracket seed positions: size4 -> [1,4,2,3]; size8 -> [1,8,4,5,2,7,3,6].
function seedOrder(size) {
  if (size < 2) return [1].slice(0, size);
  let pots = [1, 2];
  const rounds = Math.log2(size);
  for (let r = 1; r < rounds; r++) {
    const sum = pots.length * 2 + 1, next = [];
    for (const p of pots) { next.push(p); next.push(sum - p); }
    pots = next;
  }
  return pots;
}
// Build all rounds from an ordered list of round-1 pairings (each [a,b], a/b = entrantId or null=bye).
// round1.length must be a power of 2. Byes pre-resolved & advanced.
function bracketFromRound1(round1, tier) {
  const m1 = round1.length;
  if (m1 < 1) return { matches: [], numRounds: 0, bronze: false, nQual: 0 };
  const numRounds = Math.log2(m1) + 1;
  const rounds = [];
  for (let r = 1; r <= numRounds; r++) {
    const cnt = m1 / Math.pow(2, r - 1), arr = [];
    for (let i = 0; i < cnt; i++) arr.push({ bracket: tier, round: r, idx: i, a: null, b: null, status: "SCHEDULED", winner: "" });
    rounds.push(arr);
  }
  for (let i = 0; i < m1; i++) { rounds[0][i].a = round1[i][0] || null; rounds[0][i].b = round1[i][1] || null; }
  const advance = (w, r, i) => { if (r >= numRounds) return; const m = rounds[r][Math.floor(i / 2)]; if (i % 2 === 0) m.a = w; else m.b = w; };
  for (let i = 0; i < m1; i++) {
    const m = rounds[0][i];
    if (m.a && !m.b) { m.winner = m.a; m.status = "BYE"; advance(m.a, 1, i); }
    else if (!m.a && m.b) { m.winner = m.b; m.status = "BYE"; advance(m.b, 1, i); }
  }
  const nQual = round1.reduce((n, p) => n + (p[0] ? 1 : 0) + (p[1] ? 1 : 0), 0);
  const bronze = nQual >= 4;
  const matches = [];
  for (const arr of rounds) for (const m of arr) matches.push(m);
  if (bronze) matches.push({ bracket: tier, round: "BRONZE", idx: 0, a: null, b: null, status: "SCHEDULED", winner: "" });
  return { matches, numRounds, bronze, size: 2 * m1, nQual };
}
// Performance seeding: place a flat seeded list (best first) into standard bracket slots.
function buildBracket(seeded, tier) {
  const nQual = seeded.length;
  if (nQual < 2) return { matches: [], numRounds: 0, bronze: false, nQual, soleWinner: nQual === 1 ? seeded[0] : null };
  const size = nextPow2(nQual);
  const order = seedOrder(size);
  const pos = order.map((sn) => (sn <= nQual ? seeded[sn - 1] : null));
  const round1 = [];
  for (let i = 0; i < size / 2; i++) round1.push([pos[2 * i] || null, pos[2 * i + 1] || null]);
  return bracketFromRound1(round1, tier);
}
// World Cup style fixed cross by group position. groupsQual = per-group entrantIds in rank order.
// Applies only when every group has exactly 2 qualifiers and group count is a power of 2 (2,4,8...).
// Pairs group i with mirror group (g-1-i), crossing positions: 1(i) vs 2(mirror), 1(mirror) vs 2(i).
// Guarantees two teams from the same group land in opposite halves (can only meet in the final).
function crossSeedRound1(groupsQual) {
  const g = groupsQual.length;
  if (g < 2) return null;
  if ((g & (g - 1)) !== 0) return null;           // group count must be a power of 2
  if (!groupsQual.every((a) => a.length === 2)) return null; // exactly 2 per group
  const W = groupsQual.map((a) => a[0]), R = groupsQual.map((a) => a[1]);
  const top = [], bot = [];
  for (let i = 0; i < g / 2; i++) {
    const j = g - 1 - i;
    top.push([W[i], R[j]]); // e.g. 1A vs 2H
    bot.push([W[j], R[i]]); // e.g. 1H vs 2A
  }
  return top.concat(bot);
}
async function rewritePlayoffMatches(sheets, id, newRows) {
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_matches}!A2:P` });
  const rows = r.data.values || [];
  const keep = rows.filter((x) => !(x[0] === id && x[2] === "PLAYOFF"));
  const all = keep.concat(newRows);
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `${TABS.t_matches}!A2:P` });
  if (all.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `${TABS.t_matches}!A2`, valueInputOption: "USER_ENTERED", requestBody: { values: all },
    });
  }
}
// Compute current group standings for a tournament -> [{label, standings:[{entrantId,rank,wins,gd,gf}]}]
async function computeTournamentStandings(sheets, id) {
  const grRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_groups}!A2:G` });
  const grRows = (grRes.data.values || []).filter((x) => x[0] === id);
  const members = new Map();
  for (const x of grRows) { const l = x[2]; if (!members.has(l)) members.set(l, []); members.get(l).push(x[3]); }
  const mRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_matches}!A2:P` });
  const matches = (mRes.data.values || []).filter((x) => x[0] === id && x[2] === "GROUP").map(mapMatchRow);
  const out = [];
  for (const [label, ids] of [...members.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const gm = matches.filter((m) => m.groupLabel === label);
    out.push({ label, standings: computeGroupStandings(gm, ids) });
  }
  return out;
}
const seedSort = (a, b) => a.rank - b.rank || b.wins - a.wins || b.gd - a.gd || b.gf - a.gf;
async function tGeneratePlayoff(id, body) {
  const sheets = getSheets();
  await ensureTabs(sheets);
  const tRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_tournaments}!A2:J` });
  const tRow = (tRes.data.values || []).find((x) => x[0] === id);
  if (!tRow) return respond(404, { error: "Tournament not found" });
  const format = tRow[4] || "SINGLE", N = parseInt(tRow[6]) || 2;
  const groups = await computeTournamentStandings(sheets, id);
  if (!groups.length) return respond(400, { error: "Belum ada grup/standing. Undi grup & input skor dulu." });

  const b0 = body || {};
  const sched = {
    startTime: b0.startTime || "09:00",
    numCourts: parseInt(b0.numCourts) || 1,
    matchMinutes: parseInt(b0.matchMinutes) || 15,
    date: b0.date || "",
  };

  const champCount = groups.reduce((n, g) => n + g.standings.filter((s) => s.rank <= N).length, 0);
  const prospCount = groups.reduce((n, g) => n + g.standings.filter((s) => s.rank > N).length, 0);

  const now = new Date().toISOString();
  const toRow = (m) => [id, genId("MT"), "PLAYOFF", "", m.bracket, m.round, m.court || "", m.idx, m.time || "", m.a || "", m.b || "", "", "", m.winner || "", m.status, now];
  const summary = [];
  const built = [];
  const emitTier = (tier, predicate) => {
    const groupsQual = groups.map((g) => g.standings.filter(predicate).sort((a, b) => a.rank - b.rank).map((s) => s.entrantId));
    const cross = crossSeedRound1(groupsQual);
    let b, method;
    if (cross) { b = bracketFromRound1(cross, tier); method = "cross"; }
    else {
      const flat = [];
      groups.forEach((g) => g.standings.filter(predicate).forEach((s) => flat.push(s)));
      flat.sort(seedSort);
      b = buildBracket(flat.map((s) => s.entrantId), tier);
      method = "seed";
    }
    built.push({ tier, b });
    summary.push({ tier, method, entrants: b.nQual, rounds: b.numRounds, bronze: b.bronze, matches: b.matches.length });
  };
  if (format === "SPLIT") {
    if (champCount < 2) return respond(400, { error: "Champion tier perlu minimal 2 tim." });
    emitTier("CHAMPION", (s) => s.rank <= N);
    if (prospCount >= 2) emitTier("PROSPECT", (s) => s.rank > N);
  } else {
    if (champCount < 2) return respond(400, { error: `Perlu minimal 2 tim lolos (top ${N}/grup).` });
    emitTier("MAIN", (s) => s.rank <= N);
  }

  schedulePlayoff(built, sched);
  const newRows = [];
  built.forEach(({ b }) => b.matches.forEach((m) => newRows.push(toRow(m))));

  await rewritePlayoffMatches(sheets, id, newRows);
  await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_tournaments}!A2:J` }).then(async (r) => {
    const rows = r.data.values || [], i = rows.findIndex((x) => x[0] === id);
    if (i !== -1) { while (rows[i].length < 8) rows[i].push(""); rows[i][7] = "PLAYOFF";
      await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${TABS.t_tournaments}!A${i + 2}:J${i + 2}`, valueInputOption: "USER_ENTERED", requestBody: { values: [rows[i]] } }); }
  });
  return respond(200, { success: true, format, brackets: summary, schedule: sched });
}
// Assign court + planned time to playoff matches, round-by-round across tiers (shared court pool).
// BYE matches get no court/time. Each tier's bronze is scheduled at that tier's final round level.
function schedulePlayoff(built, sched) {
  const C = Math.max(1, sched.numCourts || 1);
  const dur = sched.matchMinutes || 15;
  const maxR = Math.max(0, ...built.map((t) => t.b.numRounds));
  let wave = 0;
  for (let L = 1; L <= maxR; L++) {
    const real = [];
    for (const t of built) {
      t.b.matches.forEach((m) => { if (typeof m.round === "number" && m.round === L && m.status !== "BYE") real.push(m); });
      if (L === t.b.numRounds) t.b.matches.forEach((m) => { if (String(m.round) === "BRONZE" && m.status !== "BYE") real.push(m); });
    }
    for (let j = 0; j < real.length; j++) {
      real[j].court = (j % C) + 1;
      real[j].time = addMinutesToTime(sched.startTime, (wave + Math.floor(j / C)) * dur);
    }
    if (real.length) wave += Math.ceil(real.length / C);
  }
}
// Set court (and optionally planned time) on any match row.
async function tUpdateMatchMeta(body) {
  const { matchId, court, time } = body || {};
  if (!matchId) return respond(400, { error: "matchId required" });
  const sheets = getSheets();
  await ensureTabs(sheets);
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_matches}!A2:P` });
  const rows = r.data.values || [];
  const idx = rows.findIndex((x) => x[1] === matchId);
  if (idx === -1) return respond(404, { error: "Match not found" });
  const row = rows[idx];
  while (row.length < 16) row.push("");
  if (court !== undefined && court !== null) row[6] = String(court);
  if (time !== undefined && time !== null) row[8] = String(time);
  row[15] = new Date().toISOString();
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: `${TABS.t_matches}!A${idx + 2}:P${idx + 2}`,
    valueInputOption: "USER_ENTERED", requestBody: { values: [row] },
  });
  return respond(200, { success: true, court: row[6], time: row[8] });
}
async function tUpdatePlayoffScore(body) {
  const { matchId, scoreA, scoreB } = body;
  if (!matchId) return respond(400, { error: "matchId required" });
  const sheets = getSheets();
  await ensureTabs(sheets);
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_matches}!A2:P` });
  const rows = r.data.values || [];
  const row = rows.find((x) => x[1] === matchId);
  if (!row) return respond(404, { error: "Match not found" });
  if (row[2] !== "PLAYOFF") return respond(400, { error: "Bukan match playoff" });
  while (row.length < 16) row.push("");
  const tid = row[0], tier = row[4], roundRaw = row[5], mIdx = parseInt(row[7]) || 0, a = row[9], b = row[10];
  const sa = parseInt(scoreA), sb = parseInt(scoreB), numeric = !isNaN(sa) && !isNaN(sb);
  row[11] = isNaN(sa) ? "" : sa; row[12] = isNaN(sb) ? "" : sb;
  const winner = numeric ? (sa > sb ? a : (sb > sa ? b : "")) : "";
  const loser = winner ? (winner === a ? b : a) : "";
  row[13] = winner; row[14] = numeric ? "DONE" : "SCHEDULED"; row[15] = new Date().toISOString();

  const inTier = (x) => x[0] === tid && x[2] === "PLAYOFF" && x[4] === tier;
  const numRounds = Math.max(0, ...rows.filter((x) => inTier(x) && /^\d+$/.test(String(x[5]))).map((x) => parseInt(x[5])));
  const rnum = /^\d+$/.test(String(roundRaw)) ? parseInt(roundRaw) : null;
  const resetSlot = (m, slot, val) => { m[slot] = val; m[11] = ""; m[12] = ""; m[13] = ""; m[14] = (m[9] && m[10]) ? "SCHEDULED" : m[14] === "BYE" ? "BYE" : "SCHEDULED"; m[15] = row[15]; };
  if (numeric && winner && rnum !== null) {
    if (rnum < numRounds) {
      const next = rows.find((x) => inTier(x) && /^\d+$/.test(String(x[5])) && parseInt(x[5]) === rnum + 1 && (parseInt(x[7]) || 0) === Math.floor(mIdx / 2));
      if (next) { while (next.length < 16) next.push(""); resetSlot(next, mIdx % 2 === 0 ? 9 : 10, winner); }
    }
    if (rnum === numRounds - 1) {
      const bronze = rows.find((x) => inTier(x) && String(x[5]) === "BRONZE");
      if (bronze && loser) { while (bronze.length < 16) bronze.push(""); resetSlot(bronze, mIdx === 0 ? 9 : 10, loser); }
    }
  }
  await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `${TABS.t_matches}!A2:P` });
  await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${TABS.t_matches}!A2`, valueInputOption: "USER_ENTERED", requestBody: { values: rows } });
  return respond(200, { success: true, status: row[14], winner });
}
// Pure view-builder: given mapped PLAYOFF matches + a name(entrantId) fn -> brackets array.
function playoffBracketsView(all, nm) {
  if (!all.length) return [];
  const tiers = [...new Set(all.map((m) => m.bracket))];
  return tiers.map((tier) => {
    const tm = all.filter((m) => m.bracket === tier);
    const numRounds = Math.max(0, ...tm.filter((m) => /^\d+$/.test(String(m.round))).map((m) => parseInt(m.round)));
    const nQual = tm.filter((m) => parseInt(m.round) === 1).reduce((n, m) => n + (m.entrantA ? 1 : 0) + (m.entrantB ? 1 : 0), 0);
    const view = (m) => ({ matchId: m.matchId, round: m.round, idx: m.slot, court: m.court, time: m.time, teamA: nm(m.entrantA), teamB: nm(m.entrantB), entrantA: m.entrantA, entrantB: m.entrantB, scoreA: m.scoreA, scoreB: m.scoreB, winner: m.winner, status: m.status });
    const rounds = [];
    for (let rr = 1; rr <= numRounds; rr++) rounds.push({ round: rr, matches: tm.filter((m) => parseInt(m.round) === rr).sort((a, b) => a.slot - b.slot).map(view) });
    const bronzeM = tm.find((m) => String(m.round) === "BRONZE");
    const final = tm.find((m) => parseInt(m.round) === numRounds && m.slot === 0);
    const loserOf = (m) => (m && m.winner ? (String(m.winner) === String(m.entrantA) ? m.entrantB : m.entrantA) : "");
    let champion = "", runnerUp = "", third = "";
    if (final && final.status === "DONE" && final.winner) { champion = nm(final.winner); runnerUp = nm(loserOf(final)); }
    if (bronzeM && bronzeM.status === "DONE" && bronzeM.winner) third = nm(bronzeM.winner);
    else if (!bronzeM) {
      const sfReal = tm.filter((m) => parseInt(m.round) === numRounds - 1 && m.entrantA && m.entrantB && m.status === "DONE");
      if (sfReal.length === 1) third = nm(loserOf(sfReal[0]));
    }
    return { tier, numRounds, nQual, rounds, bronze: bronzeM ? view(bronzeM) : null, podium: { champion, runnerUp, third } };
  });
}
async function tGetPlayoff(id) {
  const sheets = getSheets();
  await ensureTabs(sheets);
  const grRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_groups}!A2:G` });
  const names = {};
  for (const x of (grRes.data.values || [])) if (x[0] === id) names[x[3]] = `${x[4]} + ${x[5]}`;
  const nm = (eid) => (eid ? (names[eid] || eid) : "");
  const mRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_matches}!A2:P` });
  const all = (mRes.data.values || []).filter((x) => x[0] === id && x[2] === "PLAYOFF").map(mapMatchRow);
  return respond(200, { brackets: playoffBracketsView(all, nm) });
}

// ==============================================================
// PUBLIC AGGREGATE (Phase 5: one call for mobile/TV, fixed 5 reads)
// ==============================================================
async function tPublicEvent(eventId) {
  const sheets = getSheets();
  await ensureTabs(sheets);
  const [evR, trR, grR, mR, plR] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_events}!A2:H` }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_tournaments}!A2:J` }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_groups}!A2:G` }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_matches}!A2:P` }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.players}!A2:J` }),
  ]);
  const evRow = (evR.data.values || []).find((x) => x[0] === eventId);
  if (!evRow) return respond(404, { error: "Event not found" });
  const event = { eventId: evRow[0], name: evRow[1], venue: evRow[2], date: evRow[3], startTime: evRow[4], numCourts: parseInt(evRow[5]) || 1, matchMinutes: parseInt(evRow[6]) || 15 };

  const players = {};
  for (const r of (plR.data.values || [])) {
    const name = r[0] || ""; if (!name) continue;
    players[normName(name)] = { name, display: r[3] || name, photo: r[6] || "" };
  }
  const allGroups = grR.data.values || [];
  const allMatches = (mR.data.values || []).map(mapMatchRow);
  const tournaments = (trR.data.values || []).filter((x) => x[1] === eventId);

  const categories = tournaments.map((t) => {
    const tid = t[0];
    const grRows = allGroups.filter((x) => x[0] === tid);
    const entrants = {}, members = new Map();
    for (const x of grRows) {
      entrants[x[3]] = { player1: x[4] || "", player2: x[5] || "", seedElo: parseInt(x[6]) || 0 };
      const l = x[2]; if (!members.has(l)) members.set(l, []); members.get(l).push(x[3]);
    }
    const nm = (eid) => { const e = entrants[eid]; return e ? `${e.player1} + ${e.player2}` : (eid || ""); };
    const tMatches = allMatches.filter((m) => m.tournamentId === tid);
    const groupMatches = tMatches.filter((m) => m.stage === "GROUP");
    const groups = [...members.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([label, ids]) => ({
      label,
      standings: computeGroupStandings(groupMatches.filter((m) => m.groupLabel === label), ids)
        .map((s) => ({ rank: s.rank, entrantId: s.entrantId, team: nm(s.entrantId), played: s.played, wins: s.wins, losses: s.losses, gd: s.gd, gf: s.gf, ga: s.ga })),
    }));
    const schedule = groupMatches.slice().sort((a, b) => a.slot - b.slot || a.court - b.court).map((m) => ({
      matchId: m.matchId, court: m.court, slot: m.slot, time: m.time, groupLabel: m.groupLabel,
      entrantA: m.entrantA, entrantB: m.entrantB, teamA: nm(m.entrantA), teamB: nm(m.entrantB),
      scoreA: m.scoreA, scoreB: m.scoreB, winner: m.winner, status: m.status,
    }));
    const playoff = playoffBracketsView(tMatches.filter((m) => m.stage === "PLAYOFF"), nm);
    return {
      tournamentId: tid, category: t[2], level: t[3], format: t[4], status: t[7],
      advancersPerGroup: parseInt(t[6]) || 2, entrants, groups, schedule, playoff,
    };
  });
  return respond(200, { event, categories, players });
}

// ==============================================================
// TOURNAMENT HANDLERS (Phase 6: end-of-tournament ELO replay)
// ==============================================================
// --- Ranked Match ELO engine, copied VERBATIM from index.html (do not modify) ---
function rmKFactor(n) { return n < 10 ? 40 : n < 30 ? 32 : n < 60 ? 24 : 20; }
function rmCalcElo(p1t1, p2t1, p1t2, p2t2, s1, s2) {
  const t1a = (p1t1.elo + p2t1.elo) / 2, t2a = (p1t2.elo + p2t2.elo) / 2;
  const t1r = s1 > s2 ? 1 : s1 < s2 ? 0 : .5, t2r = 1 - t1r;
  const margin = 1 + Math.min(Math.abs(s1 - s2) * .04, .3);
  const exp1 = 1 / (1 + Math.pow(10, (t2a - t1a) / 400)), exp2 = 1 - exp1;
  const upd = (p, r, e) => {
    const k = rmKFactor(p.matchCount || 0) * margin;
    return { name: p.name, newElo: p.elo + Math.round(k * (r - e)), delta: Math.round(k * (r - e)), w: r === 1 ? 1 : 0, l: r === 0 ? 1 : 0 };
  };
  return [upd(p1t1, t1r, exp1), upd(p2t1, t1r, exp1), upd(p1t2, t2r, exp2), upd(p2t2, t2r, exp2)];
}
async function tFinalizeElo(eventId, force) {
  const sheets = getSheets();
  await ensureTabs(sheets);
  const sessionId = "SES_TRN_" + eventId;
  const [evR, trR, grR, mR, elR, seR] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_events}!A2:H` }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_tournaments}!A2:J` }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_groups}!A2:G` }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.t_matches}!A2:P` }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.elo_log}!A2:G` }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.sessions}!A2:I` }),
  ]);
  const evRow = (evR.data.values || []).find((x) => x[0] === eventId);
  if (!evRow) return respond(404, { error: "Event not found" });
  const sessionRows = seR.data.values || [];
  const already = sessionRows.some((r) => r[0] === sessionId);
  if (already && !force) return respond(409, { error: "ELO event ini sudah dihitung. Kirim force=true untuk hitung ulang dari seed.", alreadyDone: true });

  const tids = (trR.data.values || []).filter((x) => x[1] === eventId).map((x) => x[0]);
  if (!tids.length) return respond(400, { error: "Belum ada kategori." });

  // entrant -> [name1, name2]
  const entMap = {};
  for (const x of (grR.data.values || [])) if (tids.includes(x[0])) entMap[x[3]] = [x[4] || "", x[5] || ""];

  // Seed player state from ELO_Log, EXCLUDING this tournament's own session (so re-runs start from true seeds).
  const elRows = (elR.data.values || []).filter((r) => r[0] !== sessionId);
  const st = {};
  for (const r of elRows) {
    if (!r[1]) continue;
    const k = normName(r[1]);
    if (!st[k]) st[k] = { name: r[1], elo: 1350, matchCount: 0, hist: 0 };
    const elo = parseInt(r[2]) || 1350, w = parseInt(r[4]) || 0, l = parseInt(r[5]) || 0;
    if (r[0] !== "INITIAL") { st[k].elo = elo; st[k].matchCount += w + l; st[k].hist++; }
    else if (st[k].hist === 0) st[k].elo = elo;
  }
  const getP = (name) => { const k = normName(name); if (!st[k]) st[k] = { name, elo: 1350, matchCount: 0, hist: 0 }; return st[k]; };

  // Collect DONE matches; group stage chronologically, then playoff by round.
  const all = (mR.data.values || []).map(mapMatchRow).filter((m) =>
    tids.includes(m.tournamentId) && (m.stage === "GROUP" || m.stage === "PLAYOFF") &&
    m.status === "DONE" && m.entrantA && m.entrantB && m.scoreA !== "" && m.scoreB !== "");
  const grp = all.filter((m) => m.stage === "GROUP").sort((a, b) => a.slot - b.slot || a.court - b.court);
  const ply = all.filter((m) => m.stage === "PLAYOFF").sort((a, b) => ((parseInt(a.round) || 99) - (parseInt(b.round) || 99)) || a.slot - b.slot);
  const ordered = grp.concat(ply);
  if (!ordered.length) return respond(400, { error: "Belum ada match selesai untuk dihitung." });

  const now = new Date().toISOString();
  const eloRows = [];
  const changed = {};
  const mark = (p) => { const k = normName(p.name); if (!(k in changed)) changed[k] = { name: p.name, oldElo: p.elo, newElo: p.elo, delta: 0 }; };
  for (const m of ordered) {
    const A = entMap[m.entrantA], B = entMap[m.entrantB];
    if (!A || !B || !A[0] || !B[0]) continue;
    const P = [getP(A[0]), getP(A[1]), getP(B[0]), getP(B[1])];
    P.forEach(mark);
    const res = rmCalcElo(
      { name: P[0].name, elo: P[0].elo, matchCount: P[0].matchCount },
      { name: P[1].name, elo: P[1].elo, matchCount: P[1].matchCount },
      { name: P[2].name, elo: P[2].elo, matchCount: P[2].matchCount },
      { name: P[3].name, elo: P[3].elo, matchCount: P[3].matchCount },
      Number(m.scoreA), Number(m.scoreB));
    res.forEach((r, i) => {
      const p = P[i];
      p.elo = r.newElo; p.matchCount += r.w + r.l;
      eloRows.push([sessionId, p.name, r.newElo, r.delta, r.w, r.l, now]);
      const c = changed[normName(p.name)]; c.newElo = r.newElo; c.delta = c.newElo - c.oldElo;
    });
  }
  const playersUpdated = Object.keys(changed).length;
  const sessionRow = [sessionId, (evRow[1] || "Turnamen") + " (Turnamen)", "", "Tournament", "N/A", evRow[2] || "", playersUpdated, ordered.length, now];

  if (already) {
    // Re-run: drop prior rows for this session, then rewrite.
    const keepElo = (elR.data.values || []).filter((r) => r[0] !== sessionId);
    await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `${TABS.elo_log}!A2:G` });
    await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${TABS.elo_log}!A2`, valueInputOption: "USER_ENTERED", requestBody: { values: keepElo.concat(eloRows) } });
    const keepSes = sessionRows.filter((r) => r[0] !== sessionId);
    await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `${TABS.sessions}!A2:I` });
    await sheets.spreadsheets.values.update({ spreadsheetId: SHEET_ID, range: `${TABS.sessions}!A2`, valueInputOption: "USER_ENTERED", requestBody: { values: keepSes.concat([sessionRow]) } });
  } else {
    await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: `${TABS.sessions}!A:I`, valueInputOption: "USER_ENTERED", requestBody: { values: [sessionRow] } });
    await sheets.spreadsheets.values.append({ spreadsheetId: SHEET_ID, range: `${TABS.elo_log}!A:G`, valueInputOption: "USER_ENTERED", requestBody: { values: eloRows } });
  }
  const results = Object.values(changed).sort((a, b) => b.delta - a.delta);
  return respond(200, { success: true, sessionId, matchesReplayed: ordered.length, playersUpdated, recomputed: !!already, results });
}
