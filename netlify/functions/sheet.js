const { google } = require("googleapis");

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
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

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    const path = event.path
      .replace("/.netlify/functions/sheet", "")
      .replace("/api", "")
      .replace(/^\//, "");
    const method = event.httpMethod;

    let rawBody = event.body || "{}";
    if (event.isBase64Encoded && event.body) {
      rawBody = Buffer.from(event.body, "base64").toString("utf-8");
    }
    const body =
      method === "POST" || method === "PUT" ? JSON.parse(rawBody) : {};
    const params = event.queryStringParameters || {};

    if (path === "auth/login") return await login(body);

    if (path === "players" && method === "GET") return await getPlayers(params);
    if (path === "players" && method === "POST") return await addPlayer(body);
    if (path === "players/update" && method === "PUT")
      return await updatePlayer(body);
    if (path === "players/claim" && method === "POST")
      return await claimProfile(body);
    if (path.startsWith("players/") && method === "GET") {
      const name = decodeURIComponent(path.replace("players/", ""));
      return await getPlayerDetail(name);
    }

    if (path === "venues" && method === "GET") return await getVenues();
    if (path === "venues" && method === "POST") return await addVenue(body);
    if (path === "venues/update" && method === "PUT")
      return await updateVenue(body);
    if (
      path.startsWith("venues/") &&
      path.endsWith("/matches") &&
      method === "GET"
    ) {
      const v = decodeURIComponent(
        path.replace("venues/", "").replace("/matches", "")
      );
      return await getVenueMatches(v, params);
    }
    if (
      path.startsWith("venues/") &&
      path.endsWith("/matches") &&
      method === "POST"
    ) {
      const v = decodeURIComponent(
        path.replace("venues/", "").replace("/matches", "")
      );
      return await addVenueMatch(v, body);
    }
    if (
      path.startsWith("venues/") &&
      path.endsWith("/ranking") &&
      method === "GET"
    ) {
      const v = decodeURIComponent(
        path.replace("venues/", "").replace("/ranking", "")
      );
      return await getVenueWeeklyRanking(v, params);
    }

    if (path === "sessions" && method === "POST") return await saveSession(body);
    if (path === "sessions" && method === "GET")
      return await listSessions(params);

    if (path === "elo/latest" && method === "GET") return await getLatestElo();
    if (path === "elo/history" && method === "GET")
      return await getEloHistory(params.player);
    if (path === "elo/leaderboard" && method === "GET")
      return await getNationalLeaderboard(params);

    if (path === "parse" && method === "POST")
      return await parseAmericanoUrl(body);

    if (path === "admins" && method === "GET") return await getAdmins();
    if (path === "admins" && method === "POST") return await addAdmin(body);

    return respond(404, { error: "Not found", route: path });
  } catch (err) {
    console.error("Function error:", err);
    return respond(500, { error: err.message });
  }
};

// ── AUTH ──
async function login({ username, password }) {
  if (!username || !password) {
    return respond(400, { error: "Username and password required" });
  }
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TABS.admins}!A2:E`,
  });
  const rows = res.data.values || [];
  const match = rows.find((r) => r[0] === username && r[1] === password);
  if (!match) return respond(401, { error: "Invalid credentials" });

  const role = match[2] || "venue_admin";
  const venue = match[3] || "";
  const token = Buffer.from(
    `${username}:${role}:${venue}:${Date.now()}`
  ).toString("base64");
  return respond(200, { token, role, venue, username });
}

// ── PLAYERS ──
// Columns: Name | IG_Handle | Verified | Display_Name | Gender | Region | Photo_URL | Clubs | Created_At
async function getPlayers(params) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TABS.players}!A2:I`,
  });
  const rows = res.data.values || [];
  let players = rows.map((r) => ({
    name: r[0] || "",
    ig: r[1] || "",
    verified: r[2] === "TRUE",
    displayName: r[3] || r[0] || "",
    gender: (r[4] || "M").toUpperCase(),
    region: r[5] || "",
    photoUrl: r[6] || "",
    clubs: r[7] || "",
    createdAt: r[8] || "",
  }));
  if (params.gender)
    players = players.filter((p) => p.gender === params.gender.toUpperCase());
  if (params.region)
    players = players.filter((p) =>
      p.region.toLowerCase().includes(params.region.toLowerCase())
    );
  if (params.search) {
    const q = params.search.toLowerCase();
    players = players.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.displayName.toLowerCase().includes(q) ||
        p.ig.toLowerCase().includes(q)
    );
  }
  return respond(200, { players });
}

async function getPlayerDetail(name) {
  const sheets = getSheets();
  const pRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TABS.players}!A2:I`,
  });
  const pRows = pRes.data.values || [];
  const pRow = pRows.find((r) => r[0]?.toLowerCase() === name.toLowerCase());
  if (!pRow) return respond(404, { error: "Player not found" });

  const player = {
    name: pRow[0],
    ig: pRow[1] || "",
    verified: pRow[2] === "TRUE",
    displayName: pRow[3] || pRow[0],
    gender: (pRow[4] || "M").toUpperCase(),
    region: pRow[5] || "",
    photoUrl: pRow[6] || "",
    clubs: pRow[7] || "",
    createdAt: pRow[8] || "",
  };

  const eRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TABS.elo_log}!A2:G`,
  });
  const eRows = eRes.data.values || [];
  const history = eRows
    .filter((r) => r[1]?.toLowerCase() === name.toLowerCase())
    .map((r) => ({
      sessionId: r[0],
      elo: parseInt(r[2]) || 1350,
      delta: parseInt(r[3]) || 0,
      w: parseInt(r[4]) || 0,
      l: parseInt(r[5]) || 0,
      timestamp: r[6] || "",
    }));

  const totalW = history.reduce((s, h) => s + h.w, 0);
  const totalL = history.reduce((s, h) => s + h.l, 0);
  const totalMatches = totalW + totalL;
  const winRate =
    totalMatches > 0 ? Math.round((totalW / totalMatches) * 100) : 0;
  const currentElo =
    history.length > 0 ? history[history.length - 1].elo : 1350;

  let streak = 0;
  let streakType = "";
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].delta > 0) {
      if (streakType === "" || streakType === "W") {
        streak++;
        streakType = "W";
      } else break;
    } else if (history[i].delta < 0) {
      if (streakType === "" || streakType === "L") {
        streak++;
        streakType = "L";
      } else break;
    }
  }

  return respond(200, {
    player,
    stats: { currentElo, totalMatches, totalW, totalL, winRate, streak: `${streak}${streakType}` },
    history,
  });
}

async function addPlayer(body) {
  const { name, gender, ig, displayName, region, photoUrl, clubs } = body;
  if (!name) return respond(400, { error: "Name is required" });
  const sheets = getSheets();
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${TABS.players}!A:I`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          name, ig || "", ig ? "TRUE" : "FALSE", displayName || name,
          (gender || "M").toUpperCase(), region || "", photoUrl || "",
          clubs || "", now,
        ],
      ],
    },
  });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${TABS.elo_log}!A:G`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [["INITIAL", name, 1350, 0, 0, 0, now]] },
  });
  return respond(200, { success: true });
}

async function updatePlayer(body) {
  const { name, updates } = body;
  if (!name || !updates)
    return respond(400, { error: "name and updates required" });
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TABS.players}!A2:I`,
  });
  const rows = res.data.values || [];
  const ri = rows.findIndex((r) => r[0]?.toLowerCase() === name.toLowerCase());
  if (ri === -1) return respond(404, { error: "Player not found" });
  const sr = ri + 2;
  const c = rows[ri];
  const updated = [
    updates.name || c[0] || "",
    updates.ig || c[1] || "",
    updates.ig ? "TRUE" : c[2] || "FALSE",
    updates.displayName || c[3] || c[0] || "",
    (updates.gender || c[4] || "M").toUpperCase(),
    updates.region || c[5] || "",
    updates.photoUrl || c[6] || "",
    updates.clubs || c[7] || "",
    c[8] || "",
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${TABS.players}!A${sr}:I${sr}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [updated] },
  });
  return respond(200, { success: true });
}

async function claimProfile({ name, ig_handle, session_id }) {
  if (!name || !ig_handle)
    return respond(400, { error: "name and ig_handle required" });
  const sheets = getSheets();
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${TABS.claims}!A:E`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[name, ig_handle, session_id || "", "PENDING", now]],
    },
  });
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TABS.players}!A2:I`,
  });
  const rows = existing.data.values || [];
  const ri = rows.findIndex(
    (r) => r[0]?.toLowerCase() === name.toLowerCase()
  );
  if (ri === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${TABS.players}!A:I`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[name, ig_handle, "TRUE", name, "M", "", "", "", now]],
      },
    });
  } else {
    const sr = ri + 2;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${TABS.players}!B${sr}:C${sr}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[ig_handle, "TRUE"]] },
    });
  }
  const fuzzy = rows
    .filter(
      (r) =>
        r[0] &&
        r[0].toLowerCase() !== name.toLowerCase() &&
        r[0].toLowerCase().slice(0, 3) === name.toLowerCase().slice(0, 3)
    )
    .map((r) => ({ name: r[0], ig: r[1] || null }));
  return respond(200, { success: true, fuzzyMatches: fuzzy });
}

// ── VENUES ──
// Columns: Name | Location | Region | Schedule | Prize_Pool | Contact | Logo_URL | Created_At | Register_URL
async function getVenues() {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TABS.venues}!A2:I`,
  });
  const rows = res.data.values || [];
  const venues = rows.map((r) => ({
    name: r[0] || "",
    location: r[1] || "",
    region: r[2] || "",
    schedule: r[3] || "",
    prizePool: r[4] || "",
    contact: r[5] || "",
    logoUrl: r[6] || "",
    createdAt: r[7] || "",
    registerUrl: r[8] || "",
  }));
  return respond(200, { venues });
}

async function addVenue(body) {
  const { name, location, region, schedule, prizePool, contact, logoUrl, registerUrl } =
    body;
  if (!name) return respond(400, { error: "Venue name required" });
  const sheets = getSheets();
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${TABS.venues}!A:I`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          name, location || "", region || "", schedule || "",
          prizePool || "", contact || "", logoUrl || "", now,
          registerUrl || "",
        ],
      ],
    },
  });
  const tabName = `Venue_${name.replace(/[^a-zA-Z0-9]/g, "_")}`;
  try {
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID,
    });
    const exists = spreadsheet.data.sheets.some(
      (s) => s.properties.title === tabName
    );
    if (!exists) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${tabName}!A1:J1`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [
            [
              "Week", "Date", "P1_Team1", "P2_Team1", "P1_Team2",
              "P2_Team2", "Score_T1", "Score_T2", "Gender", "Source_URL",
            ],
          ],
        },
      });
    }
  } catch (err) {
    console.error("Error creating venue tab:", err.message);
  }
  return respond(200, { success: true, tabName });
}

async function updateVenue(body) {
  const { name, updates } = body;
  if (!name || !updates)
    return respond(400, { error: "name and updates required" });
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TABS.venues}!A2:I`,
  });
  const rows = res.data.values || [];
  const ri = rows.findIndex(
    (r) => r[0]?.toLowerCase() === name.toLowerCase()
  );
  if (ri === -1) return respond(404, { error: "Venue not found" });
  const sr = ri + 2;
  const c = rows[ri];
  const updated = [
    updates.name || c[0] || "",
    updates.location !== undefined ? updates.location : c[1] || "",
    updates.region !== undefined ? updates.region : c[2] || "",
    updates.schedule !== undefined ? updates.schedule : c[3] || "",
    updates.prizePool !== undefined ? updates.prizePool : c[4] || "",
    updates.contact !== undefined ? updates.contact : c[5] || "",
    updates.logoUrl !== undefined ? updates.logoUrl : c[6] || "",
    c[7] || "",
    updates.registerUrl !== undefined ? updates.registerUrl : c[8] || "",
  ];
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${TABS.venues}!A${sr}:I${sr}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [updated] },
  });
  return respond(200, { success: true });
}

// ── VENUE MATCHES ──
function venueTabName(n) {
  return `Venue_${n.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

async function getVenueMatches(venueName, params) {
  const sheets = getSheets();
  const tab = venueTabName(venueName);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A2:J`,
  });
  const rows = res.data.values || [];
  let matches = rows.map((r) => ({
    week: r[0] || "", date: r[1] || "",
    p1t1: r[2] || "", p2t1: r[3] || "",
    p1t2: r[4] || "", p2t2: r[5] || "",
    scoreT1: parseInt(r[6]) || 0, scoreT2: parseInt(r[7]) || 0,
    gender: (r[8] || "M").toUpperCase(), sourceUrl: r[9] || "",
  }));
  if (params.week) matches = matches.filter((m) => m.week === params.week);
  if (params.gender)
    matches = matches.filter((m) => m.gender === params.gender.toUpperCase());
  return respond(200, { matches, venue: venueName });
}

async function addVenueMatch(venueName, body) {
  const { matches } = body;
  if (!matches || !matches.length)
    return respond(400, { error: "matches array required" });
  const sheets = getSheets();
  const tab = venueTabName(venueName);
  const now = new Date().toISOString().split("T")[0];
  const ts = new Date().toISOString();
  const weekNum = getWeekNumber(new Date());
  const rows = matches.map((m) => [
    m.week || `W${weekNum}`, m.date || now,
    m.p1t1 || "", m.p2t1 || "", m.p1t2 || "", m.p2t2 || "",
    m.scoreT1 || 0, m.scoreT2 || 0,
    (m.gender || "M").toUpperCase(), m.sourceUrl || "",
  ]);
  // 1. Save matches to venue tab
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A:J`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: rows },
  });

  // 2. Collect all unique player names
  const allPlayerNames = [
    ...new Set(
      matches.flatMap((m) =>
        [m.p1t1, m.p2t1, m.p1t2, m.p2t2].filter(Boolean)
      )
    ),
  ];

  // 3. Check which players already exist
  const pRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TABS.players}!A2:A`,
  });
  const existingNames = (pRes.data.values || []).map((r) =>
    r[0]?.toLowerCase()
  );
  const newPlayers = allPlayerNames.filter(
    (n) => !existingNames.includes(n.toLowerCase())
  );

  // 4. Auto-create new players with initial ELO 1350
  if (newPlayers.length > 0) {
    const newRows = newPlayers.map((n) => {
      const gender =
        matches.find((m) =>
          [m.p1t1, m.p2t1, m.p1t2, m.p2t2].includes(n)
        )?.gender || "M";
      return [
        n, "", "FALSE", n, gender.toUpperCase(), "", "", venueName, ts,
      ];
    });
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${TABS.players}!A:I`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: newRows },
    });
    const eloInitRows = newPlayers.map((n) => ["INITIAL", n, 1350, 0, 0, 0, ts]);
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${TABS.elo_log}!A:G`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: eloInitRows },
    });
  }

  // 5. Get current ELO and match counts for all players
  const eRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TABS.elo_log}!A2:G`,
  });
  const eRows = eRes.data.values || [];
  const currentElo = {};
  const matchCounts = {};
  eRows.forEach((r) => {
    const name = r[1];
    if (!name) return;
    currentElo[name] = parseInt(r[2]) || 1350;
    matchCounts[name] = (matchCounts[name] || 0) + (r[0] !== "INITIAL" ? 1 : 0);
  });

  // 6. Calculate ELO for each match and collect updates
  const sessionId = `VM-${Date.now().toString(36).toUpperCase()}`;
  const eloUpdates = {}; // name -> { latestElo, totalDelta, w, l }

  matches.forEach((m) => {
    const p1t1 = m.p1t1, p2t1 = m.p2t1, p1t2 = m.p1t2, p2t2 = m.p2t2;
    if (!p1t1 || !p2t1 || !p1t2 || !p2t2) return;

    const players = {
      p1t1: { name: p1t1, elo: currentElo[p1t1] || 1350, matches: matchCounts[p1t1] || 0 },
      p2t1: { name: p2t1, elo: currentElo[p2t1] || 1350, matches: matchCounts[p2t1] || 0 },
      p1t2: { name: p1t2, elo: currentElo[p1t2] || 1350, matches: matchCounts[p1t2] || 0 },
      p2t2: { name: p2t2, elo: currentElo[p2t2] || 1350, matches: matchCounts[p2t2] || 0 },
    };

    const results = calculateMatchElo(players, parseInt(m.scoreT1) || 0, parseInt(m.scoreT2) || 0);

    results.forEach((r) => {
      if (!eloUpdates[r.name]) {
        eloUpdates[r.name] = { latestElo: currentElo[r.name] || 1350, totalDelta: 0, w: 0, l: 0 };
      }
      eloUpdates[r.name].latestElo = r.newElo;
      eloUpdates[r.name].totalDelta += r.delta;
      eloUpdates[r.name].w += r.w;
      eloUpdates[r.name].l += r.l;
      // Update running ELO so subsequent matches in the same batch use updated values
      currentElo[r.name] = r.newElo;
      matchCounts[r.name] = (matchCounts[r.name] || 0) + 1;
    });
  });

  // 7. Write ELO updates to ELO_Log
  const eloLogRows = Object.entries(eloUpdates).map(([name, u]) => [
    sessionId, name, u.latestElo, u.totalDelta, u.w, u.l, ts,
  ]);
  if (eloLogRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${TABS.elo_log}!A:G`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: eloLogRows },
    });
  }

  // 8. Also save as a session for tracking
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${TABS.sessions}!A:I`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        sessionId, `${venueName} W${weekNum}`, "", "Venue Match",
        "", venueName, allPlayerNames.length, matches.length, ts,
      ]],
    },
  });

  return respond(200, {
    success: true,
    added: matches.length,
    newPlayers,
    sessionId,
    eloUpdates: Object.entries(eloUpdates).map(([name, u]) => ({
      name, elo: u.latestElo, delta: u.totalDelta, w: u.w, l: u.l,
    })),
  });
}

async function getVenueWeeklyRanking(venueName, params) {
  const sheets = getSheets();
  const tab = venueTabName(venueName);
  const week = params.week || `W${getWeekNumber(new Date())}`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${tab}!A2:J`,
  });
  const rows = res.data.values || [];
  const weekMatches = rows.filter((r) => r[0] === week);
  const stats = {};
  weekMatches.forEach((r) => {
    const t1 = [r[2], r[3]].filter(Boolean);
    const t2 = [r[4], r[5]].filter(Boolean);
    const s1 = parseInt(r[6]) || 0;
    const s2 = parseInt(r[7]) || 0;
    const gender = (r[8] || "M").toUpperCase();
    [...t1, ...t2].forEach((p) => {
      if (!stats[p]) stats[p] = { w: 0, l: 0, played: 0, gender };
    });
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
  const eRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TABS.elo_log}!A2:G`,
  });
  const eRows = eRes.data.values || [];
  const latestElo = {};
  eRows.forEach((r) => { if (r[1]) latestElo[r[1]] = parseInt(r[2]) || 1350; });
  const pRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TABS.players}!A2:G`,
  });
  const pRows = pRes.data.values || [];
  const playerPhotos = {};
  pRows.forEach((r) => { if (r[0]) playerPhotos[r[0]] = r[6] || ""; });
  let ranking = Object.entries(stats).map(([name, s]) => ({
    name, w: s.w, l: s.l, played: s.played, gender: s.gender,
    elo: latestElo[name] || 1350,
    level: getTierName(latestElo[name] || 1350),
    photoUrl: playerPhotos[name] || "",
  }));
  ranking.sort((a, b) => b.w - a.w || a.l - b.l);
  if (params.gender)
    ranking = ranking.filter((p) => p.gender === params.gender.toUpperCase());
  return respond(200, { ranking, week, venue: venueName });
}

// ── SESSIONS ──
async function saveSession(body) {
  const { session_name, source_url, format, courts, venue, players, rounds, elo_results } = body;
  if (!session_name || !elo_results?.length)
    return respond(400, { error: "session_name and elo_results required" });
  const sheets = getSheets();
  const now = new Date().toISOString();
  const sessionId = `S-${Date.now().toString(36).toUpperCase()}`;
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${TABS.sessions}!A:I`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          sessionId, session_name, source_url || "", format || "Mexicano",
          courts || 2, venue || "", players?.length || elo_results.length,
          rounds?.length || 0, now,
        ],
      ],
    },
  });
  const eloRows = elo_results.map((p) => [
    sessionId, p.name, p.elo, p.delta, p.w ?? 0, p.l ?? 0, now,
  ]);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${TABS.elo_log}!A:G`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: eloRows },
  });
  return respond(200, { success: true, sessionId });
}

async function listSessions(params) {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TABS.sessions}!A2:I`,
  });
  const rows = res.data.values || [];
  let sessions = rows.map((r) => ({
    id: r[0], name: r[1], sourceUrl: r[2], format: r[3],
    courts: r[4], venue: r[5], playerCount: r[6],
    roundCount: r[7], createdAt: r[8],
  }));
  if (params.venue)
    sessions = sessions.filter((s) =>
      s.venue.toLowerCase().includes(params.venue.toLowerCase())
    );
  return respond(200, { sessions });
}

// ── ELO / LEADERBOARD ──
async function getLatestElo() {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TABS.elo_log}!A2:G`,
  });
  const rows = res.data.values || [];
  const latest = {};
  rows.forEach((r) => {
    if (r[1]) {
      latest[r[1]] = {
        sessionId: r[0], elo: parseInt(r[2]) || 1350,
        delta: parseInt(r[3]) || 0, w: parseInt(r[4]) || 0,
        l: parseInt(r[5]) || 0, timestamp: r[6] || "",
      };
    }
  });
  return respond(200, { players: latest });
}

async function getEloHistory(player) {
  if (!player) return respond(400, { error: "player param required" });
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TABS.elo_log}!A2:G`,
  });
  const rows = res.data.values || [];
  const history = rows
    .filter((r) => r[1]?.toLowerCase() === player.toLowerCase())
    .map((r) => ({
      sessionId: r[0], elo: parseInt(r[2]) || 1350,
      delta: parseInt(r[3]) || 0, w: parseInt(r[4]) || 0,
      l: parseInt(r[5]) || 0, timestamp: r[6] || "",
    }));
  return respond(200, { player, history });
}

async function getNationalLeaderboard(params) {
  const sheets = getSheets();
  const pRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TABS.players}!A2:I`,
  });
  const pRows = pRes.data.values || [];
  const eRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TABS.elo_log}!A2:G`,
  });
  const eRows = eRes.data.values || [];
  const latestElo = {};
  const totalStats = {};
  eRows.forEach((r) => {
    const name = r[1];
    if (!name) return;
    latestElo[name] = parseInt(r[2]) || 1350;
    if (!totalStats[name]) totalStats[name] = { w: 0, l: 0 };
    totalStats[name].w += parseInt(r[4]) || 0;
    totalStats[name].l += parseInt(r[5]) || 0;
  });
  let leaderboard = pRows.map((r) => {
    const name = r[0] || "";
    const elo = latestElo[name] || 1350;
    const s = totalStats[name] || { w: 0, l: 0 };
    return {
      name, displayName: r[3] || name,
      gender: (r[4] || "M").toUpperCase(),
      region: r[5] || "", photoUrl: r[6] || "",
      ig: r[1] || "", verified: r[2] === "TRUE",
      clubs: r[7] || "",
      elo, level: getTierName(elo),
      w: s.w, l: s.l, played: s.w + s.l,
    };
  });
  leaderboard.sort((a, b) => b.elo - a.elo);
  if (params.gender)
    leaderboard = leaderboard.filter(
      (p) => p.gender === params.gender.toUpperCase()
    );
  if (params.region)
    leaderboard = leaderboard.filter((p) =>
      p.region.toLowerCase().includes(params.region.toLowerCase())
    );
  if (params.level)
    leaderboard = leaderboard.filter(
      (p) =>
        p.level.toLowerCase().replace(/\s/g, "") ===
        params.level.toLowerCase().replace(/\s/g, "")
    );
  if (params.search) {
    const q = params.search.toLowerCase();
    leaderboard = leaderboard.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.displayName.toLowerCase().includes(q)
    );
  }
  if (params.venue) {
    const v = params.venue.toLowerCase();
    leaderboard = leaderboard.filter((p) =>
      (p.clubs || "").toLowerCase().includes(v)
    );
  }
  const page = parseInt(params.page) || 1;
  const limit = parseInt(params.limit) || 20;
  const start = (page - 1) * limit;
  const paginated = leaderboard.slice(start, start + limit);
  return respond(200, {
    leaderboard: paginated, total: leaderboard.length,
    page, limit, totalPages: Math.ceil(leaderboard.length / limit),
  });
}

// ── PARSE AMERICANO-PADEL.COM ──
async function parseAmericanoUrl({ url, venue, gender }) {
  if (!url) return respond(400, { error: "URL is required" });
  if (!url.includes("americano-padel.com/r/"))
    return respond(400, { error: "Only americano-padel.com URLs supported" });
  try {
    const https = require("https");
    const fetchUrl = url.includes("?ln=") ? url : `${url}?ln=en`;
    const html = await new Promise((resolve, reject) => {
      https
        .get(fetchUrl, { headers: { "User-Agent": "Trekkr/3.0" } }, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve(data));
          res.on("error", reject);
        })
        .on("error", reject);
    });
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    const sessionName = titleMatch ? titleMatch[1].trim() : "Imported Session";
    const standings = [];
    const standingsRegex =
      /<td[^>]*>\s*(\d+)\.\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>(\d+)-(\d+)-(\d+)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>[^)]*\)\s*(\d+)/g;
    let sM;
    while ((sM = standingsRegex.exec(html)) !== null) {
      standings.push({
        rank: parseInt(sM[1]), name: sM[2].trim(),
        w: parseInt(sM[3]), l: parseInt(sM[4]), t: parseInt(sM[5]),
        diff: parseInt(sM[6]), points: parseInt(sM[7]),
      });
    }
    const matches = [];
    const roundBlocks = html.split(/Round #(\d+)/);
    for (let i = 1; i < roundBlocks.length; i += 2) {
      const roundNum = parseInt(roundBlocks[i]);
      const block = roundBlocks[i + 1] || "";
      const courtBlocks = block.split(/Court (\d+)/);
      for (let j = 1; j < courtBlocks.length; j += 2) {
        const courtNum = parseInt(courtBlocks[j]);
        const cb = courtBlocks[j + 1] || "";
        const nameMatches = cb.match(
          /<td[^>]*class="[^"]*(?:name|player)[^"]*"[^>]*>([^<]+)<\/td>/gi
        );
        const scoreMatches = cb.match(
          /<td[^>]*class="[^"]*score[^"]*"[^>]*>(\d+)<\/td>/gi
        );
        const names = nameMatches
          ? nameMatches
              .map((m) => m.replace(/<[^>]+>/g, "").trim())
              .filter((n) => n && !n.match(/^\d+$/))
          : [];
        const scores = scoreMatches
          ? scoreMatches.map((m) => parseInt(m.replace(/<[^>]+>/g, "")))
          : [];
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
    const allPlayers =
      standings.length > 0
        ? standings.map((s) => s.name)
        : [
            ...new Set(
              matches.flatMap((m) => [m.p1t1, m.p2t1, m.p1t2, m.p2t2])
            ),
          ];
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
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${TABS.admins}!A2:E`,
  });
  const rows = res.data.values || [];
  const admins = rows.map((r) => ({
    username: r[0], role: r[2] || "venue_admin",
    venue: r[3] || "", createdAt: r[4] || "",
  }));
  return respond(200, { admins });
}

async function addAdmin(body) {
  const { username, password, role, venue } = body;
  if (!username || !password)
    return respond(400, { error: "username and password required" });
  const sheets = getSheets();
  const now = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${TABS.admins}!A:E`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[username, password, role || "venue_admin", venue || "", now]],
    },
  });
  return respond(200, { success: true });
}

// ── HELPERS ──

// ELO Calculation Engine
// K-factor: starts at 40, decays with match count for stability
function getKFactor(matchCount) {
  if (matchCount < 10) return 40;
  if (matchCount < 30) return 32;
  if (matchCount < 60) return 24;
  return 20;
}

function calculateExpected(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

// Calculate ELO changes for a doubles match
// Team 1 (p1t1 + p2t1) vs Team 2 (p1t2 + p2t2)
// Returns array of { name, newElo, delta }
function calculateMatchElo(players, scoreT1, scoreT2) {
  // players = { p1t1: {elo, matches}, p2t1: {elo, matches}, p1t2: {elo, matches}, p2t2: {elo, matches} }
  const t1Avg = (players.p1t1.elo + players.p2t1.elo) / 2;
  const t2Avg = (players.p1t2.elo + players.p2t2.elo) / 2;

  // Determine actual result: 1 = win, 0 = loss, 0.5 = draw
  let t1Result, t2Result;
  if (scoreT1 > scoreT2) {
    t1Result = 1; t2Result = 0;
  } else if (scoreT2 > scoreT1) {
    t1Result = 0; t2Result = 1;
  } else {
    t1Result = 0.5; t2Result = 0.5;
  }

  // Score margin multiplier (bigger win = slightly bigger ELO change)
  const diff = Math.abs(scoreT1 - scoreT2);
  const marginMult = 1 + Math.min(diff * 0.04, 0.3); // max 30% bonus

  const expected1 = calculateExpected(t1Avg, t2Avg);
  const expected2 = 1 - expected1;

  const results = [];

  // Team 1 players
  [{ key: "p1t1" }, { key: "p2t1" }].forEach(({ key }) => {
    const p = players[key];
    const k = getKFactor(p.matches) * marginMult;
    const delta = Math.round(k * (t1Result - expected1));
    results.push({ name: p.name, newElo: p.elo + delta, delta, w: t1Result === 1 ? 1 : 0, l: t1Result === 0 ? 1 : 0 });
  });

  // Team 2 players
  [{ key: "p1t2" }, { key: "p2t2" }].forEach(({ key }) => {
    const p = players[key];
    const k = getKFactor(p.matches) * marginMult;
    const delta = Math.round(k * (t2Result - expected2));
    results.push({ name: p.name, newElo: p.elo + delta, delta, w: t2Result === 1 ? 1 : 0, l: t2Result === 0 ? 1 : 0 });
  });

  return results;
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

function getWeekNumber(d) {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff =
    d - start + (start.getTimezoneOffset() - d.getTimezoneOffset()) * 60000;
  return Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
}

function respond(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}
