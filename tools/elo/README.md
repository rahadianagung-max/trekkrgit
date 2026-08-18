# Trekkr — Perkakas Remediasi Ledger ELO (Tahap B)

Perkakas untuk menjalankan **Tahap B** pada spesifikasi perbaikan ledger ELO
(remediasi data di jendela beku). Semua alat di sini **hanya membaca** kecuali
disebut sebaliknya secara eksplisit.

## Isi

| Berkas | Fungsi | Menulis ke Sheet? |
|---|---|---|
| `trekkr_elo_audit.py` | 6 tes kesehatan ledger + worklist remediasi + snapshot/compare | **Tidak** (read-only) |
| `testdata/` | Fixture sintetis dengan tiap cacat untuk menguji audit | — |

`trekkr_elo_replay.*` (engine replay dari 1500) **belum dibangun** — menunggu
keputusan desain, lihat runbook `docs/elo-remediation-runbook.md`.

## Menyiapkan data (mode CSV — disarankan untuk jendela beku)

Ekspor tab dari Google Sheet sebagai potret statis:

1. Buka spreadsheet `GOOGLE_SHEET_ID`.
2. Tab **ELO_Log** → File > Download > *Comma-separated values* → simpan `ELO_Log.csv`.
3. Tab **Sessions** → sama → simpan `Sessions.csv`.

Potret statis menjamin audit sebelum & sesudah melihat data identik — inti dari
aturan jendela beku.

## Menjalankan audit

```bash
python3 trekkr_elo_audit.py \
  --elo-csv ELO_Log.csv --sessions-csv Sessions.csv \
  --min-matches 1 --save baseline.json
```

Keluaran: ringkasan 6 tes + **WORKLIST** (daftar terkini untuk Perbaikan 1–5,
di-generate dari data — inilah langkah B3). `--save` menulis snapshot untuk
perbandingan nanti.

Membandingkan setelah remediasi + replay:

```bash
python3 trekkr_elo_audit.py \
  --elo-csv ELO_Log_after.csv --sessions-csv Sessions_after.csv \
  --min-matches 1 --compare baseline.json
```

Baris **`Berubah: N`** = jumlah pemain yang final ELO-nya berbeda dari baseline.
Untuk uji determinisme (B10) jalankan replay dua kali; run kedua vs run pertama
harus **`Berubah: 0`**.

### Mode live (opsional)

```bash
pip install google-api-python-client google-auth
export GOOGLE_SERVICE_ACCOUNT_EMAIL=... GOOGLE_PRIVATE_KEY=... GOOGLE_SHEET_ID=...
python3 trekkr_elo_audit.py --sheet --min-matches 1 --save baseline.json
```

## Uji cepat perkakas

```bash
python3 trekkr_elo_audit.py \
  --elo-csv testdata/ELO_Log.csv --sessions-csv testdata/Sessions.csv \
  --min-matches 1
```

Fixture sengaja memuat: rantai putus, INITIAL hilang, INITIAL tak berurutan,
sesi kembar (`SES_1780200383067` vs `SES_1780200397429`), dan placeholder
walkover (`walk out 1`). Semua harus muncul di worklist.

## Kontrak kolom (jangan diubah)

```
ELO_Log  A:G = [sessionId, player, elo, delta, w, l, timestamp]
Sessions A:I = [id, name, sourceUrl, format, courts, venue,
                playerCount, roundCount, createdAt]
Venue_*  A:M = [Week, Date, P1_Team1, P2_Team1, P1_Team2, P2_Team2,
                Score_T1, Score_T2, <4 gender>, Source_URL]
```

Catatan penting: baris `Venue_*` hanya menyimpan **Date** (resolusi hari), tanpa
timestamp per-match. Urutan kronologis milidetik hanya ada di `ELO_Log`. Ini
memengaruhi desain replay — lihat runbook.
