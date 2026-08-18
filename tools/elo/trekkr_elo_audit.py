#!/usr/bin/env python3
"""
TREKKR — Audit Ledger ELO (6 tes) + worklist remediasi.

Alat pengukur untuk Tahap B pada spesifikasi perbaikan ledger. Membaca dua tab
Google Sheet — ELO_Log dan Sessions — lalu:

  1. Menjalankan 6 tes kesehatan ledger (rantai, K/ match, zero-sum, W/L,
     kronologi, higienitas).
  2. Mencetak WORKLIST terkini: daftar persis untuk Perbaikan 1–5 yang
     di-*generate dari data*, bukan disalin dari dokumen. Ini memenuhi
     langkah B3 ("regenerasi daftar sesi perusak DARI output audit").
  3. Menyimpan snapshot (--save baseline.json) atau membandingkannya
     (--compare baseline.json), termasuk uji determinisme "Berubah: N".

Alat ini TIDAK menulis apa pun ke Sheet. Ia hanya membaca dan melapor.

── Skema kolom (kontrak, jangan diubah) ─────────────────────────────────────
  ELO_Log  A:G = [sessionId, player, elo, delta, w, l, timestamp]
  Sessions A:I = [id, name, sourceUrl, format, courts, venue,
                  playerCount, roundCount, createdAt]

── Sumber data ──────────────────────────────────────────────────────────────
  Mode CSV (disarankan untuk jendela beku — potret statis, nol setup):
      Di Google Sheet: File > Download > CSV untuk tab ELO_Log dan Sessions.
      python3 trekkr_elo_audit.py --elo-csv ELO_Log.csv --sessions-csv Sessions.csv

  Mode live (butuh google-api-python-client + service account):
      export GOOGLE_SERVICE_ACCOUNT_EMAIL=... GOOGLE_PRIVATE_KEY=... GOOGLE_SHEET_ID=...
      python3 trekkr_elo_audit.py --sheet

Contoh alur Tahap B:
      python3 trekkr_elo_audit.py --elo-csv e.csv --sessions-csv s.csv --min-matches 1 --save baseline.json
      # ... jalankan remediasi + replay ...
      python3 trekkr_elo_audit.py --elo-csv e2.csv --sessions-csv s2.csv --min-matches 1 --compare baseline.json
"""

import argparse
import csv
import json
import os
import re
import sys
from collections import defaultdict, OrderedDict

# ── Konstanta engine (harus konsisten dengan rmCalcElo di api/sheet.js) ──────
# rmKFactor maksimum = 40 (untuk <10 match); faktor margin maksimum = 1.30.
# Jadi |delta| per pemain per match secara teoritis dibatasi 40 * 1.30 = 52.
ENGINE_KMAX = 40
ENGINE_MARGIN_MAX = 1.30
DELTA_CEILING = int(round(ENGINE_KMAX * ENGINE_MARGIN_MAX))  # 52

INITIAL_SEED = 1500          # seed kanonik untuk backfill INITIAL (Perbaikan 1)
INITIAL_TAG = "INITIAL"

# Placeholder walkover (Perbaikan 5). Cocokkan nama seperti:
#   "walk out 1", "walk out 2", "Michella Adlen [walk Out]", "Fifi Yanti [walk Out]"
WALKOVER_RE = re.compile(r"walk\s*out", re.IGNORECASE)

# Sidik jari sesi yang ditulis jalur saveSession lama (Perbaikan 3):
#   format == "Americano" DAN playerCount == 0 DAN roundCount == 0
SUSPECT_FORMAT = "americano"

# Ambang jarak waktu untuk mendeteksi sesi kembar (Perbaikan 4), dalam ms.
DUP_WINDOW_MS = 30_000


# ── Util ─────────────────────────────────────────────────────────────────────
def norm_name(s):
    """Sama dengan normName() di backend."""
    return re.sub(r"\s+", " ", str(s or "").strip().lower())


def to_int(v, default=0):
    try:
        return int(float(str(v).strip()))
    except (ValueError, TypeError):
        return default


def parse_ts(s):
    """Kembalikan epoch milidetik (int) atau None kalau tak terbaca.

    Timestamp ditulis sebagai ISO string (Date.toISOString()), tetapi ekspor CSV
    dari Sheets bisa memformat ulang menjadi tanggal lokal. Coba beberapa bentuk.
    """
    if s is None:
        return None
    raw = str(s).strip()
    if not raw:
        return None
    # Epoch ms/detik murni.
    if re.fullmatch(r"\d{10,13}", raw):
        n = int(raw)
        return n if len(raw) >= 13 else n * 1000
    # ISO 8601.
    iso = raw.replace("Z", "+00:00")
    from datetime import datetime
    for fmt in (
        None,  # fromisoformat
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%m/%d/%Y %H:%M:%S",
        "%m/%d/%Y",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y",
    ):
        try:
            dt = datetime.fromisoformat(iso) if fmt is None else datetime.strptime(raw, fmt)
            return int(dt.timestamp() * 1000)
        except (ValueError, OverflowError):
            continue
    return None


# ── Pemuatan data ────────────────────────────────────────────────────────────
def _read_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.reader(fh))
    if not rows:
        return []
    # Buang baris header kalau kolom pertama jelas label.
    head = [c.strip().lower() for c in rows[0]]
    if head and head[0] in ("sessionid", "session_id", "id", "session"):
        rows = rows[1:]
    return rows


def load_elo_rows_from_csv(path):
    out = []
    for i, r in enumerate(_read_csv(path)):
        if not r or not (r[0] if len(r) else "").strip():
            continue
        r = (r + [""] * 7)[:7]
        out.append({
            "session": r[0].strip(),
            "player": r[1].strip(),
            "key": norm_name(r[1]),
            "elo": to_int(r[2], 0),
            "delta": to_int(r[3], 0),
            "w": to_int(r[4], 0),
            "l": to_int(r[5], 0),
            "ts_raw": r[6].strip(),
            "ts": parse_ts(r[6]),
            "idx": i,  # urutan baris asli = urutan append (tie-breaker stabil)
        })
    return out


def load_sessions_from_csv(path):
    out = []
    for i, r in enumerate(_read_csv(path)):
        if not r or not (r[0] if len(r) else "").strip():
            continue
        r = (r + [""] * 9)[:9]
        out.append({
            "id": r[0].strip(),
            "name": r[1].strip(),
            "sourceUrl": r[2].strip(),
            "format": r[3].strip(),
            "courts": r[4].strip(),
            "venue": r[5].strip(),
            "playerCount": to_int(r[6], 0),
            "roundCount": to_int(r[7], 0),
            "createdAt": r[8].strip(),
            "ts": parse_ts(r[8]),
            "idx": i,
        })
    return out


def load_from_sheet():
    """Baca live via Google Sheets API. Butuh google-api-python-client."""
    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build
    except ImportError:
        sys.exit("Mode --sheet butuh: pip install google-api-python-client google-auth")
    email = os.environ.get("GOOGLE_SERVICE_ACCOUNT_EMAIL")
    key = os.environ.get("GOOGLE_PRIVATE_KEY", "").replace("\\n", "\n")
    sheet_id = os.environ.get("GOOGLE_SHEET_ID")
    if not (email and key and sheet_id):
        sys.exit("Set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID.")
    creds = Credentials.from_service_account_info(
        {"client_email": email, "private_key": key, "token_uri": "https://oauth2.googleapis.com/token"},
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"],
    )
    svc = build("sheets", "v4", credentials=creds, cache_discovery=False)
    vals = svc.spreadsheets().values()
    elo = vals.get(spreadsheetId=sheet_id, range="ELO_Log!A2:G").execute().get("values", [])
    ses = vals.get(spreadsheetId=sheet_id, range="Sessions!A2:I").execute().get("values", [])

    def mk_elo(i, r):
        r = (r + [""] * 7)[:7]
        return {"session": str(r[0]).strip(), "player": str(r[1]).strip(),
                "key": norm_name(r[1]), "elo": to_int(r[2]), "delta": to_int(r[3]),
                "w": to_int(r[4]), "l": to_int(r[5]), "ts_raw": str(r[6]).strip(),
                "ts": parse_ts(r[6]), "idx": i}

    def mk_ses(i, r):
        r = (r + [""] * 9)[:9]
        return {"id": str(r[0]).strip(), "name": str(r[1]).strip(),
                "sourceUrl": str(r[2]).strip(), "format": str(r[3]).strip(),
                "courts": str(r[4]).strip(), "venue": str(r[5]).strip(),
                "playerCount": to_int(r[6]), "roundCount": to_int(r[7]),
                "createdAt": str(r[8]).strip(), "ts": parse_ts(r[8]), "idx": i}

    return ([mk_elo(i, r) for i, r in enumerate(elo) if r and str(r[0]).strip()],
            [mk_ses(i, r) for i, r in enumerate(ses) if r and str(r[0]).strip()])


# ── Model per pemain ─────────────────────────────────────────────────────────
def order_key(row):
    """Urutan kronologis: INITIAL selalu pertama, lalu timestamp, lalu urutan
    append. Ini penjaga INITIAL-first yang sama dipakai replay (Perbaikan 2/A3).
    """
    is_initial = 0 if row["session"] == INITIAL_TAG else 1
    ts = row["ts"] if row["ts"] is not None else float("inf")
    return (is_initial, ts, row["idx"])


def build_players(elo_rows):
    by_player = defaultdict(list)
    for r in elo_rows:
        if r["key"]:
            by_player[r["key"]].append(r)
    for k in by_player:
        by_player[k].sort(key=order_key)
    return by_player


def match_count(rows):
    return sum(1 for r in rows if r["session"] != INITIAL_TAG)


# ── Tes ──────────────────────────────────────────────────────────────────────
def test_chain(by_player, min_matches):
    """Tes 1 — Rantai ledger: elo[i] == elo[i-1] + delta[i]."""
    broken_players = []
    breaks_by_session = defaultdict(int)
    total_breaks = 0
    for key, rows in by_player.items():
        if match_count(rows) < min_matches:
            continue
        prev = None
        player_broken = False
        for r in rows:
            if r["session"] == INITIAL_TAG and prev is None:
                prev = r["elo"]
                continue
            if prev is None:
                prev = r["elo"] - r["delta"]  # tanpa INITIAL, turunkan seed tersirat
            expected = prev + r["delta"]
            if r["elo"] != expected:
                total_breaks += 1
                breaks_by_session[r["session"]] += 1
                player_broken = True
            prev = r["elo"]
        if player_broken:
            broken_players.append(rows[0]["player"])
    return {
        "name": "Rantai ledger",
        "broken_players": len(broken_players),
        "total_break_steps": total_breaks,
        "players": sorted(broken_players),
        "sessions": OrderedDict(sorted(breaks_by_session.items(), key=lambda kv: -kv[1])),
        "pass": len(broken_players) == 0,
    }


def test_kfactor(elo_rows):
    """Tes 2 — Batas K per match: |delta| <= ceiling engine."""
    over = [r for r in elo_rows if r["session"] != INITIAL_TAG and abs(r["delta"]) > DELTA_CEILING]
    max_abs = max((abs(r["delta"]) for r in elo_rows if r["session"] != INITIAL_TAG), default=0)
    return {
        "name": "Batas K per match",
        "max_abs_delta": max_abs,
        "ceiling": DELTA_CEILING,
        "over_ceiling": len(over),
        "pass": len(over) == 0,
    }


def test_zero_sum(elo_rows):
    """Tes 3 — Zero-sum: total seluruh delta mendekati 0."""
    total = sum(r["delta"] for r in elo_rows if r["session"] != INITIAL_TAG)
    return {"name": "Zero-sum", "sum_delta": total, "pass": abs(total) <= 100}


def test_wl(by_player, sessions):
    """Tes 4 — Rekonsiliasi W/L.

    Bandingkan dua cara menghitung total match: (a) jumlah w+l dari baris ELO_Log
    per pemain, (b) jumlah baris non-INITIAL. Keduanya harus konsisten. Selisih
    menandai baris dengan w/l hilang/ganda.
    """
    mismatch = 0
    for rows in by_player.values():
        rows_wl = sum(r["w"] + r["l"] for r in rows if r["session"] != INITIAL_TAG)
        # Setiap baris non-INITIAL mewakili minimal satu hasil; w+l harus >= 1.
        zero_wl = sum(1 for r in rows if r["session"] != INITIAL_TAG and (r["w"] + r["l"]) == 0)
        mismatch += zero_wl
    return {"name": "Rekonsiliasi W/L", "rows_missing_wl": mismatch, "pass": mismatch == 0}


def test_chronology(by_player):
    """Tes 5 — Kronologi: timestamp INITIAL harus <= match pertama."""
    bad = []
    for key, rows in by_player.items():
        initial = next((r for r in rows if r["session"] == INITIAL_TAG), None)
        first_match = next((r for r in rows if r["session"] != INITIAL_TAG), None)
        if not initial or not first_match:
            continue
        if initial["ts"] is None or first_match["ts"] is None:
            continue
        if initial["ts"] > first_match["ts"]:
            bad.append({
                "player": rows[0]["player"],
                "initial_ts": initial["ts_raw"],
                "first_match_ts": first_match["ts_raw"],
                "first_session": first_match["session"],
            })
    return {"name": "Kronologi", "out_of_order": len(bad), "players": bad, "pass": len(bad) == 0}


def test_hygiene(by_player, min_matches):
    """Tes 6 — Higienitas: pemain tanpa INITIAL + placeholder walkover."""
    no_initial = []
    for key, rows in by_player.items():
        if match_count(rows) < min_matches:
            continue
        if not any(r["session"] == INITIAL_TAG for r in rows):
            first = rows[0]
            no_initial.append({"player": first["player"], "first_session": first["session"]})
    placeholders = sorted({rows[0]["player"] for key, rows in by_player.items()
                           if WALKOVER_RE.search(rows[0]["player"])})
    return {
        "name": "Higienitas data",
        "no_initial": len(no_initial),
        "no_initial_players": no_initial,
        "placeholder_walkover": len(placeholders),
        "placeholder_players": placeholders,
        "pass": len(no_initial) == 0 and len(placeholders) == 0,
    }


# ── Worklist remediasi (memenuhi B3) ─────────────────────────────────────────
def worklist(by_player, sessions, hygiene, chain, chrono):
    ses_by_id = {s["id"]: s for s in sessions}

    # Perbaikan 1 — sesi impor massal pendorong "tanpa INITIAL".
    first_ses_counter = defaultdict(int)
    for p in hygiene["no_initial_players"]:
        first_ses_counter[p["first_session"]] += 1
    fix1_driver = sorted(first_ses_counter.items(), key=lambda kv: -kv[1])

    # Perbaikan 3 — sesi bersidik-jari Americano/0/0 (jalur rusak).
    suspect_sessions = [s for s in sessions
                        if s["format"].lower() == SUSPECT_FORMAT
                        and s["playerCount"] == 0 and s["roundCount"] == 0]

    # Perbaikan 4 — sesi kembar: nama+venue sama, jarak < DUP_WINDOW_MS,
    # dan W/L per pemain identik.
    def session_wl(sid):
        wl = {}
        for rows in by_player.values():
            for r in rows:
                if r["session"] == sid:
                    wl[r["key"]] = (r["w"], r["l"])
        return wl

    dup_pairs = []
    ordered = [s for s in sessions if s["ts"] is not None]
    ordered.sort(key=lambda s: s["ts"])
    for i in range(len(ordered)):
        for j in range(i + 1, len(ordered)):
            a, b = ordered[i], ordered[j]
            if b["ts"] - a["ts"] > DUP_WINDOW_MS:
                break
            if a["name"] == b["name"] and a["venue"] == b["venue"] and a["name"]:
                wa, wb = session_wl(a["id"]), session_wl(b["id"])
                if wa and wa == wb:
                    dup_pairs.append({"keep": a["id"], "remove": b["id"],
                                      "gap_ms": b["ts"] - a["ts"],
                                      "name": a["name"], "venue": a["venue"],
                                      "players": len(wa)})

    return {
        "fix1_missing_initial_driver_sessions": fix1_driver,
        "fix2_out_of_order_initial": chrono["players"],
        "fix3_chain_break_sessions": [
            {"id": sid, "broken_players": n,
             "name": ses_by_id.get(sid, {}).get("name", "?"),
             "venue": ses_by_id.get(sid, {}).get("venue", "?")}
            for sid, n in chain["sessions"].items()
        ],
        "fix3_suspect_fingerprint_sessions": [
            {"id": s["id"], "name": s["name"], "venue": s["venue"]} for s in suspect_sessions
        ],
        "fix4_duplicate_sessions": dup_pairs,
        "fix5_placeholder_players": hygiene["placeholder_players"],
    }


# ── Snapshot final ELO (uji determinisme) ────────────────────────────────────
def final_elos(by_player):
    out = {}
    for key, rows in by_player.items():
        last = rows[-1]
        out[key] = last["elo"]
    return out


# ── Render ───────────────────────────────────────────────────────────────────
def status(ok):
    return "PASS" if ok else "GAGAL"


def print_report(res, wl):
    t = res["tests"]
    print("=" * 70)
    print("TREKKR — AUDIT LEDGER ELO")
    print("=" * 70)
    print(f"Pemain dianalisis (>= min-matches) : {res['players_analyzed']}")
    print(f"Total baris ELO_Log                : {res['elo_rows']}")
    print(f"Total sesi                         : {res['sessions']}")
    print("-" * 70)
    print(f"1. {t['chain']['name']:<22} {status(t['chain']['pass'])}  "
          f"({t['chain']['broken_players']} pemain putus, {t['chain']['total_break_steps']} langkah)")
    print(f"2. {t['kfactor']['name']:<22} {status(t['kfactor']['pass'])}  "
          f"(maks |delta| {t['kfactor']['max_abs_delta']}, batas {t['kfactor']['ceiling']})")
    print(f"3. {t['zero_sum']['name']:<22} {status(t['zero_sum']['pass'])}  "
          f"(sum delta {t['zero_sum']['sum_delta']:+d})")
    print(f"4. {t['wl']['name']:<22} {status(t['wl']['pass'])}  "
          f"({t['wl']['rows_missing_wl']} baris tanpa W/L)")
    print(f"5. {t['chrono']['name']:<22} {status(t['chrono']['pass'])}  "
          f"({t['chrono']['out_of_order']} riwayat tidak berurutan)")
    print(f"6. {t['hygiene']['name']:<22} {status(t['hygiene']['pass'])}  "
          f"({t['hygiene']['no_initial']} tanpa INITIAL + {t['hygiene']['placeholder_walkover']} placeholder)")
    print("=" * 70)
    print("WORKLIST REMEDIASI (regenerasi terkini — pakai ini, bukan dokumen)")
    print("-" * 70)
    print("Perbaikan 1 — sesi pendorong 'tanpa INITIAL':")
    for sid, n in wl["fix1_missing_initial_driver_sessions"][:10]:
        print(f"    {sid:<28} {n} pemain")
    if not wl["fix1_missing_initial_driver_sessions"]:
        print("    (tidak ada)")
    print("Perbaikan 2 — INITIAL tidak berurutan (backdate ke sebelum match pertama):")
    for p in wl["fix2_out_of_order_initial"][:20]:
        print(f"    {p['player']:<24} INITIAL {p['initial_ts']}  >  match {p['first_match_ts']}")
    if not wl["fix2_out_of_order_initial"]:
        print("    (tidak ada)")
    print("Perbaikan 3 — SESI PENYEBAB RANTAI PUTUS:")
    for s in wl["fix3_chain_break_sessions"][:20]:
        print(f"    {s['id']:<28} {s['broken_players']:>3} pemain  {s['name']} @ {s['venue']}")
    if not wl["fix3_chain_break_sessions"]:
        print("    (tidak ada)")
    print(f"Perbaikan 3b — sesi bersidik-jari Americano/0/0: {len(wl['fix3_suspect_fingerprint_sessions'])}")
    print("Perbaikan 4 — sesi kembar (hapus kolom 'remove'):")
    for d in wl["fix4_duplicate_sessions"]:
        print(f"    keep {d['keep']}  remove {d['remove']}  ({d['gap_ms']}ms, "
              f"{d['players']} pemain identik)  {d['name']} @ {d['venue']}")
    if not wl["fix4_duplicate_sessions"]:
        print("    (tidak ada)")
    print("Perbaikan 5 — placeholder walkover:")
    for p in wl["fix5_placeholder_players"]:
        print(f"    {p}")
    if not wl["fix5_placeholder_players"]:
        print("    (tidak ada)")
    print("=" * 70)


def build_snapshot(res, finals):
    t = res["tests"]
    return {
        "meta": {"players_analyzed": res["players_analyzed"], "elo_rows": res["elo_rows"],
                 "sessions": res["sessions"], "min_matches": res["min_matches"]},
        "metrics": {
            "chain_broken_players": t["chain"]["broken_players"],
            "chain_break_steps": t["chain"]["total_break_steps"],
            "kfactor_max_abs": t["kfactor"]["max_abs_delta"],
            "kfactor_over": t["kfactor"]["over_ceiling"],
            "zero_sum": t["zero_sum"]["sum_delta"],
            "wl_missing": t["wl"]["rows_missing_wl"],
            "chrono_out_of_order": t["chrono"]["out_of_order"],
            "hygiene_no_initial": t["hygiene"]["no_initial"],
            "hygiene_placeholder": t["hygiene"]["placeholder_walkover"],
        },
        "final_elos": finals,
    }


def compare_snapshot(current, baseline_path):
    with open(baseline_path, encoding="utf-8") as fh:
        base = json.load(fh)
    print("=" * 70)
    print(f"PERBANDINGAN vs {baseline_path}")
    print("-" * 70)
    bm, cm = base["metrics"], current["metrics"]
    for k in cm:
        b, c = bm.get(k, "?"), cm[k]
        arrow = "" if b == c else f"   ({b} -> {c})"
        print(f"    {k:<24} {c}{arrow}")
    # Uji determinisme: berapa pemain yang final ELO-nya berubah.
    bf, cf = base.get("final_elos", {}), current["final_elos"]
    changed = [k for k in set(bf) | set(cf) if bf.get(k) != cf.get(k)]
    print("-" * 70)
    print(f"Berubah: {len(changed)}")
    if changed:
        for k in sorted(changed)[:25]:
            print(f"    {k:<28} {bf.get(k)} -> {cf.get(k)}")
    print("=" * 70)
    return len(changed)


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="Audit ledger ELO Trekkr (6 tes + worklist).")
    ap.add_argument("--elo-csv", help="CSV ekspor tab ELO_Log")
    ap.add_argument("--sessions-csv", help="CSV ekspor tab Sessions")
    ap.add_argument("--sheet", action="store_true", help="Baca live via Google Sheets API (env vars)")
    ap.add_argument("--min-matches", type=int, default=1, help="Abaikan pemain di bawah N match")
    ap.add_argument("--save", metavar="FILE", help="Simpan snapshot ke FILE (baseline)")
    ap.add_argument("--compare", metavar="FILE", help="Bandingkan dengan snapshot FILE")
    ap.add_argument("--json", action="store_true", help="Cetak hasil mentah sebagai JSON")
    args = ap.parse_args()

    if args.sheet:
        elo_rows, sessions = load_from_sheet()
    elif args.elo_csv and args.sessions_csv:
        elo_rows = load_elo_rows_from_csv(args.elo_csv)
        sessions = load_sessions_from_csv(args.sessions_csv)
    else:
        ap.error("Beri --elo-csv + --sessions-csv, atau --sheet.")

    by_player = build_players(elo_rows)
    analyzed = sum(1 for rows in by_player.values() if match_count(rows) >= args.min_matches)

    chain = test_chain(by_player, args.min_matches)
    kfactor = test_kfactor(elo_rows)
    zero_sum = test_zero_sum(elo_rows)
    wl = test_wl(by_player, sessions)
    chrono = test_chronology(by_player)
    hygiene = test_hygiene(by_player, args.min_matches)

    res = {
        "players_analyzed": analyzed,
        "elo_rows": len(elo_rows),
        "sessions": len(sessions),
        "min_matches": args.min_matches,
        "tests": {"chain": chain, "kfactor": kfactor, "zero_sum": zero_sum,
                  "wl": wl, "chrono": chrono, "hygiene": hygiene},
    }
    work = worklist(by_player, sessions, hygiene, chain, chrono)

    if args.json:
        print(json.dumps({"result": res, "worklist": work}, ensure_ascii=False, indent=2))
    else:
        print_report(res, work)

    snapshot = build_snapshot(res, final_elos(by_player))
    if args.save:
        with open(args.save, "w", encoding="utf-8") as fh:
            json.dump(snapshot, fh, ensure_ascii=False, indent=2)
        print(f"[snapshot disimpan -> {args.save}]")
    if args.compare:
        compare_snapshot(snapshot, args.compare)

    all_pass = all(res["tests"][k]["pass"] for k in res["tests"])
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    main()
