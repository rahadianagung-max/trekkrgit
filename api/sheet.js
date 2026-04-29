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
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.players}!A2:I` });
  const rows = res.data.values || [];
  let players = rows.map((r) => ({
    name: r[0] || "", ig: r[1] || "", verified: r[2] === "TRUE",
    displayName: r[3] || r[0] || "", gender: (r[4] || "M").toUpperCase(),
    region: r[5] || "", photoUrl: r[6] || "", clubs: r[7] || "", createdAt: r[8] || "",
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
  const pRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.players}!A2:I` });
  const pRows = pRes.data.values || [];
  const pRow = pRows.find((r) => r[0]?.toLowerCase() === name.toLowerCase());
  if (!pRow) return respond(404, { error: "Player not found" });

  const player = {
    name: pRow[0], ig: pRow[1] || "", verified: pRow[2] === "TRUE",
    displayName: pRow[3] || pRow[0], gender: (pRow[4] || "M").toUpperCase(),
    region: pRow[5] || "", photoUrl: pRow[6] || "", clubs: pRow[7] || "", createdAt: pRow[8] || "",
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
  const sheets = getSheets();
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: `${TABS.players}!A:I`, valueInputOption: "USER_ENTERED",
    requestBody: { values: [[ name, ig || "", ig ? "TRUE" : "FALSE", displayName || name, (gender || "M").toUpperCase(), region || "", photoUrl || "", clubs || "", now ]] },
  });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: `${TABS.elo_log}!A:G`, valueInputOption: "USER_ENTERED",
    requestBody: { values: [["INITIAL", name, 1350, 0, 0, 0, now]] },
  });
  return respond(200, { success: true });
}

async function updatePlayer(body) {
  const { name, updates } = body;
  if (!name || !updates) return respond(400, { error: "name and updates required" });
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.players}!A2:I` });
  const rows = res.data.values || [];
  const ri = rows.findIndex((r) => r[0]?.toLowerCase() === name.toLowerCase());
  if (ri === -1) return respond(404, { error: "Player not found" });
  const sr = ri + 2, c = rows[ri];
  const updated = [
    updates.name || c[0] || "", updates.ig || c[1] || "", updates.ig ? "TRUE" : c[2] || "FALSE",
    updates.displayName || c[3] || c[0] || "", (updates.gender || c[4] || "M").toUpperCase(),
    updates.region || c[5] || "", updates.photoUrl || c[6] || "", updates.clubs || c[7] || "", c[8] || "",
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: `${TABS.players}!A${sr}:I${sr}`, valueInputOption: "USER_ENTERED",
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
  const existing = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.players}!A2:I` });
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
  const pRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${TABS.players}!A2:I` });
  const pRows = pRes.data.values || [];
  const playersInfo = {};
  pRows.forEach((r) => {
    if (r[0]) {
      playersInfo[r[0].toLowerCase()] = {
        name: r[0], ig: r[1] || "", verified: r[2] === "TRUE",
        displayName: r[3] || r[0], gender: (r[4] || "M").toUpperCase(),
        region: r[5] || "", photoUrl: r[6] || "", clubs: r[7] || "",
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
    const info = playersInfo[k] || { name: k, displayName: k, gender: "M", region: "", clubs: "", verified: false, photoUrl: "" };
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