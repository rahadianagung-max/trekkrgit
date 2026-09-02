// ============================================================
// Supabase-backed drop-in for the Google Sheets client used by api/sheet.js.
//
// api/sheet.js talks to Google Sheets through `getSheets()`, using a handful of
// methods (values.get/append/update/batchGet/batchUpdate/clear and
// spreadsheets.get/batchUpdate). This module returns an object with the SAME
// shape, but every call is translated to Supabase (PostgREST) so the ~4500
// lines of business logic keep working unchanged.
//
// It is activated only when SUPABASE_URL + SUPABASE_SERVICE_KEY are set (see
// getSheets() in api/sheet.js). With them unset, api/sheet.js keeps using
// Google Sheets exactly as before — a safe on/off switch.
//
// Design notes:
//  - Each Sheet "tab" maps to a Supabase table + an ordered list of columns
//    matching the sheet's A,B,C… layout (SHEET_MAP below).
//  - Rows are addressed positionally, exactly like the Sheets API: reading
//    `Tab!A2:K` returns the data rows (row 1 = header, skipped); updating
//    `Tab!A5:J5` targets the 4th data row; deleteDimension(startIndex=n)
//    removes the (n-1)th data row. We keep a stable order by the surrogate
//    `id` column so positions are deterministic within one request.
//  - Per-venue tabs `Venue_<X>` all live in one `venue_matches` table, keyed by
//    a `venue` column derived from the tab title.
//  - Values are read back as strings (like Sheets) and written as strings
//    (USER_ENTERED semantics; our columns are all text).
// ============================================================

// Sheet title -> { table, cols[] } where cols[] is the sheet's A,B,C… order.
const SHEET_MAP = {
  Players:            { table: "players",             cols: ["name","ig","verified","display_name","gender","region","photo_url","clubs","created_at","winner_at","tournaments","claim_email","seed_estimate"] },
  Sessions:           { table: "sessions",            cols: ["session_id","session_name","source_url","format","sub_format","venue","player_count","match_count","created_at"] },
  ELO_Log:            { table: "elo_log",             cols: ["session_id","player","new_elo","elo_change","wins","losses","timestamp"] },
  Venues:             { table: "venues",              cols: ["name","location","region","schedule","prize_pool","contact","logo_url","created_at","register_url","featured","sort_order","hidden"] },
  Admins:             { table: "admins",              cols: ["username","password","role","venue","created_at"] },
  Claims:             { table: "claims",              cols: ["name","ig","session_id","status","created_at"] },
  PlayRank_Active:    { table: "playrank_active",     cols: ["event_id","title","venue","level","gender","format","week_start","week_end","status","players","leader","url","highlight"] },
  Tracked_Events:     { table: "tracked_events",      cols: ["month_year","name","location","logo_url","url"] },
  Tournament_Leads:   { table: "tournament_leads",    cols: ["lead_id","timestamp","tournament_name","location","pic_name","phone","email","message","status"] },
  Competitions:       { table: "competitions",        cols: ["slug","type","source_venue","name","location","logo_url","status"] },
  Tournament_Events:  { table: "tournament_events",   cols: ["event_id","name","venue","date","start_time","num_courts","match_minutes","created_at","status","format","category","url","highlight"] },
  Tournaments:        { table: "tournaments",         cols: ["tournament_id","event_id","category","level","format","group_size_target","advancers_per_group","status","admin_username","created_at"] },
  Tournament_Entrants:{ table: "tournament_entrants", cols: ["tournament_id","entrant_id","player1_name","player1_ig","player2_name","player2_ig","seed_elo","is_new_p1","is_new_p2","created_at"] },
  Tournament_Groups:  { table: "tournament_groups",   cols: ["tournament_id","category","group_label","entrant_id","player1_name","player2_name","seed_elo"] },
  Tournament_Matches: { table: "tournament_matches",  cols: ["tournament_id","match_id","stage","group_label","bracket","round","court","slot_index","scheduled_time","entrant_a","entrant_b","score_a","score_b","winner","status","updated_at"] },
  Form_Responses:     { table: "form_responses",      cols: ["timestamp","category","player1_name","player1_ig","player2_name","player2_ig","contact_wa"] },
  RegForms:           { table: "reg_forms",           cols: ["form_id","name","status","linked_tournament","config","created_at","updated_at"] },
  Registrations:      { table: "registrations",       cols: ["reg_id","form_id","timestamp","name","gender","phone","photo_url","payment_proof_url","data","linked_tournament","status"] },
  Edit_Requests:      { table: "edit_requests",       cols: ["request_id","player_name","display_name","ig","photo_url","status","created_at","resolved_at","email","gender","type","region"] },
  Venue_Leads:        { table: "venue_leads",         cols: ["lead_id","timestamp","pic_name","venue_community","region","whatsapp","email","status"] },
  Player_Auth:        { table: "player_auth",         cols: ["email","player_name","password_hash","salt","status","token","token_exp","token_type","is_claim","created_at","last_login"] },
  Schedule:           { table: "schedule",            cols: ["sched_id","type","venue","area","date","start_time","end_time","courts","capacity","booked","price_per_player","status","whatsapp_url","note"] },
  RE_Events:          { table: "re_events",           cols: ["event_id","name","venue","date","start_time","status","phase","courts","match_minutes","p1_waves","p2_waves","current_wave","created_at","category"] },
  RE_Players:         { table: "re_players",          cols: ["event_id","player_id","name","canonical","start_elo","tier","claimed_at","status","level","gender"] },
  RE_Waves:           { table: "re_waves",            cols: ["event_id","wave","phase","start_time","status","rest_ids"] },
  RE_Matches:         { table: "re_matches",          cols: ["event_id","match_id","wave","phase","tier","court","a1","a2","b1","b2","score_a","score_b","status","scorer","updated_at"] },
};

// Per-venue match tabs (Venue_<X>) all share one table, keyed by `venue`.
const VENUE_TABLE = "venue_matches";
const VENUE_COLS = ["week","date","p1_team1","p2_team1","p1_team2","p2_team2","score_t1","score_t2","p1_team1_gender","p2_team1_gender","p1_team2_gender","p2_team2_gender","source_url"];
// venueTabName() in api/sheet.js is: `Venue_${name.replace(/[^a-zA-Z0-9]/g,"_")}`.
// We stored venue = that suffix with underscores turned back into spaces, so we
// reverse the same way here to filter/insert consistently.
function venueFromTab(title) { return title.replace(/^Venue_/, "").replace(/_/g, " ").trim(); }

// ---- column-letter helpers ----
function colToIdx(letters) {
  let n = 0;
  for (const ch of String(letters).toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1; // A -> 0
}

// Parse "Title!A2:K" / "Title!A:M" / "Title!A5:J5" / "Title!A1" -> descriptor.
function parseRange(range) {
  const bang = String(range).indexOf("!");
  const title = bang >= 0 ? range.slice(0, bang) : range;
  const a1 = bang >= 0 ? range.slice(bang + 1) : "";
  if (!a1) return { title, startCol: 0, endCol: null, startRow: null, endRow: null };
  const [left, right] = a1.split(":");
  const lm = /^([A-Za-z]+)?(\d+)?$/.exec(left) || [];
  const startCol = lm[1] ? colToIdx(lm[1]) : 0;
  const startRow = lm[2] ? parseInt(lm[2], 10) : null;
  let endCol = null, endRow = null;
  if (right) {
    const rm = /^([A-Za-z]+)?(\d+)?$/.exec(right) || [];
    endCol = rm[1] ? colToIdx(rm[1]) : null;
    endRow = rm[2] ? parseInt(rm[2], 10) : null;
  } else {
    endCol = startCol; endRow = startRow;
  }
  return { title, startCol, endCol, startRow, endRow };
}

function resolve(title) {
  // Explicit map wins first, so a specifically-mapped tab like `Venue_Leads`
  // (→ venue_leads) is never mistaken for a dynamic per-venue match tab.
  const m = SHEET_MAP[title];
  if (m) return { table: m.table, cols: m.cols, venue: null };
  if (/^Venue_/.test(title)) return { table: VENUE_TABLE, cols: VENUE_COLS, venue: venueFromTab(title) };
  return null;
}

function s(v) { return v == null ? "" : String(v); }

// ---- PostgREST HTTP layer ----
function makeRest(baseUrl, key) {
  const root = String(baseUrl).replace(/\/+$/, "") + "/rest/v1";
  const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  async function req(method, path, body, extraHeaders) {
    const resp = await fetch(root + path, {
      method,
      headers: { ...H, ...(extraHeaders || {}) },
      body: body == null ? undefined : JSON.stringify(body),
    });
    const text = await resp.text();
    if (!resp.ok) throw new Error(`Supabase ${method} ${path} -> ${resp.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }
  return {
    // read all rows (paginated), ordered by id
    async selectAll(table, selectCols, venue) {
      const sel = encodeURIComponent(selectCols.join(",") + ",id");
      let out = [], offset = 0; const page = 1000;
      for (;;) {
        let p = `/${table}?select=${sel}&order=id.asc&limit=${page}&offset=${offset}`;
        if (venue != null) p += `&venue=eq.${encodeURIComponent(venue)}`;
        const rows = await req("GET", p);
        out = out.concat(rows || []);
        if (!rows || rows.length < page) break;
        offset += page;
      }
      return out;
    },
    async selectIds(table, venue) {
      let out = [], offset = 0; const page = 1000;
      for (;;) {
        let p = `/${table}?select=id&order=id.asc&limit=${page}&offset=${offset}`;
        if (venue != null) p += `&venue=eq.${encodeURIComponent(venue)}`;
        const rows = await req("GET", p);
        out = out.concat((rows || []).map((r) => r.id));
        if (!rows || rows.length < page) break;
        offset += page;
      }
      return out;
    },
    insert(table, objs) { return req("POST", `/${table}`, objs, { Prefer: "return=minimal" }); },
    patchById(table, id, obj) { return req("PATCH", `/${table}?id=eq.${id}`, obj, { Prefer: "return=minimal" }); },
    deleteById(table, id) { return req("DELETE", `/${table}?id=eq.${id}`, null, { Prefer: "return=minimal" }); },
    deleteAll(table, venue) {
      let p = `/${table}?id=gte.0`;
      if (venue != null) p += `&venue=eq.${encodeURIComponent(venue)}`;
      return req("DELETE", p, null, { Prefer: "return=minimal" });
    },
  };
}

// Build the fake "sheets" client. `rest` is the PostgREST layer above (real or a
// mock for tests). Returns an object shaped like google.sheets({version:"v4"}).
function buildClient(rest) {
  // Stable synthetic sheetId per title (needed for deleteDimension round-trips).
  const titleList = Object.keys(SHEET_MAP);
  const idToTitle = {}, titleToId = {};
  titleList.forEach((t, i) => { const id = 1000 + i; idToTitle[id] = t; titleToId[t] = id; });
  function venueSheetId(title) {
    if (titleToId[title] != null) return titleToId[title];
    const id = 5000 + Object.keys(idToTitle).length;
    idToTitle[id] = title; titleToId[title] = id; return id;
  }

  // Turn a DB row object into a sheet-style array in cols order.
  function rowToArr(cols, obj) { return cols.map((c) => s(obj[c])); }

  async function readRange(range) {
    const r = parseRange(range);
    const info = resolve(r.title);
    if (!info) return { values: [] }; // unknown tab -> empty (e.g. League_Series)
    const rows = await rest.selectAll(info.table, info.cols, info.venue);
    const dataArrs = rows.map((o) => rowToArr(info.cols, o));
    // If the range starts at row 1 (or a whole-column A:M), the caller expects a
    // header row at index 0 (it will slice(1) it off). Otherwise (A2:…) return
    // data rows only.
    const includeHeader = r.startRow === 1 || r.startRow == null;
    const body = includeHeader ? [info.cols.slice()].concat(dataArrs) : dataArrs;
    // Optionally clip to the requested row window (rarely needed, but correct).
    return { values: body };
  }

  const values = {
    async get({ range }) {
      return { data: await readRange(range) };
    },
    async batchGet({ ranges }) {
      const valueRanges = [];
      for (const rg of ranges || []) valueRanges.push(await readRange(rg));
      return { data: { valueRanges } };
    },
    async append({ range, requestBody }) {
      const r = parseRange(range);
      const info = resolve(r.title);
      if (!info) return { data: {} };
      const rowsIn = (requestBody && requestBody.values) || [];
      const objs = rowsIn.map((vals) => {
        const o = {};
        info.cols.forEach((c, i) => { o[c] = i < vals.length ? s(vals[i]) : ""; });
        if (info.venue != null) o.venue = info.venue;
        return o;
      });
      if (objs.length) await rest.insert(info.table, objs);
      return { data: { updates: { updatedRows: objs.length } } };
    },
    async update({ range, requestBody }) {
      const r = parseRange(range);
      // Writing to row 1 is a header write in Sheets — a no-op here.
      if (r.startRow === 1 && (r.endRow === 1 || r.endRow == null)) return { data: {} };
      const info = resolve(r.title);
      if (!info) return { data: {} };
      const rowsIn = (requestBody && requestBody.values) || [];
      const ids = await rest.selectIds(info.table, info.venue);
      let dataPos = (r.startRow || 2) - 2; // 0-based index into data rows
      for (const vals of rowsIn) {
        const id = ids[dataPos];
        if (id != null) {
          const o = {};
          for (let i = 0; i < vals.length; i++) {
            const colIdx = r.startCol + i;
            if (colIdx < info.cols.length) o[info.cols[colIdx]] = s(vals[i]);
          }
          if (Object.keys(o).length) await rest.patchById(info.table, id, o);
        }
        dataPos++;
      }
      return { data: {} };
    },
    async batchUpdate({ requestBody }) {
      const data = (requestBody && requestBody.data) || [];
      for (const d of data) await values.update({ range: d.range, requestBody: { values: d.values } });
      return { data: {} };
    },
    async clear({ range }) {
      const r = parseRange(range);
      const info = resolve(r.title);
      if (info) await rest.deleteAll(info.table, info.venue);
      return { data: {} };
    },
  };

  const spreadsheets = {
    values,
    async get() {
      // Metadata: list every known tab (fixed + existing venue tabs) with a
      // stable sheetId. Venue tabs are discovered from distinct venue values.
      const sheetsMeta = titleList.map((t) => ({ properties: { title: t, sheetId: titleToId[t] } }));
      try {
        const venueRows = await rest.selectAll(VENUE_TABLE, ["venue"], null);
        const seen = new Set();
        for (const row of venueRows) {
          const v = s(row.venue).trim();
          if (!v || seen.has(v)) continue;
          seen.add(v);
          const title = "Venue_" + v.replace(/[^a-zA-Z0-9]/g, "_");
          sheetsMeta.push({ properties: { title, sheetId: venueSheetId(title) } });
        }
      } catch (e) { /* venue_matches optional */ }
      return { data: { sheets: sheetsMeta } };
    },
    async batchUpdate({ requestBody }) {
      const requests = (requestBody && requestBody.requests) || [];
      for (const rq of requests) {
        if (rq.addSheet) continue; // tables already exist -> no-op
        if (rq.deleteDimension) {
          const dd = rq.deleteDimension.range || {};
          const title = idToTitle[dd.sheetId];
          if (!title) continue;
          const info = resolve(title);
          if (!info) continue;
          const ids = await rest.selectIds(info.table, info.venue);
          // startIndex is 0-based incl header (header=0, first data=1).
          const from = Math.max(1, dd.startIndex || 0);
          const to = dd.endIndex || (from + 1);
          const victims = [];
          for (let sheetRow = from; sheetRow < to; sheetRow++) {
            const id = ids[sheetRow - 1];
            if (id != null) victims.push(id);
          }
          for (const id of victims) await rest.deleteById(info.table, id);
        }
      }
      return { data: {} };
    },
  };

  return { spreadsheets };
}

function makeSupabaseSheets() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY not set");
  return buildClient(makeRest(url, key));
}

module.exports = { makeSupabaseSheets, buildClient, parseRange, colToIdx, resolve, SHEET_MAP, VENUE_COLS };
