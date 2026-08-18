# Runbook — Remediasi Ledger ELO (Tahap B)

Panduan operator untuk menjalankan **Tahap B** (perbaikan data) dari
spesifikasi perbaikan ledger ELO. Tahap A (perbaikan kode) sudah dikerjakan di
`api/sheet.js` / `tourney/sheet.js` / `netlify/functions/sheet.js` + payload
klien — lihat commit "ELO ledger Tahap A".

> **Dua aturan nol (jangan dilewati):**
> 1. Ambil `baseline.json` **di dalam** jendela beku (langkah B2), bukan
>    sebelumnya. Kalau ada match masuk antara baseline dan replay, perbandingan
>    B9 tidak berarti.
> 2. Angka & daftar ID di spesifikasi adalah **potret**. Akar masalah valid,
>    tapi daftar sesi/pemain harus **di-regenerasi dari worklist audit** (B3).

## Prasyarat

- Akses edit ke Google Sheet `GOOGLE_SHEET_ID`.
- `python3` untuk `tools/elo/trekkr_elo_audit.py`.
- Tidak ada sesi/turnamen yang sedang berjalan (jendela beku 1–2 jam).

## Uji-terima Tahap A (jalankan lebih dulu, di luar jendela beku)

Setelah deploy Tahap A: jalankan satu sesi Mexicano di venue mana pun, lalu cek
sesi itu di `/api/sessions`.

- `playerCount` dan `roundCount` **terisi (bukan 0)** → Tahap A kena;
  pendarahan berhenti.
- Masih `0` → deploy belum aktif; jangan lanjut ke Tahap B.

Juga coba impor URL `americano-padel.com` yang sama dua kali → yang kedua harus
ditolak `409` (penjaga idempotensi).

---

## Urutan Tahap B

Seluruh langkah berurutan, **tanpa data masuk di antaranya**.

| # | Langkah | Alat |
|---|---|---|
| B1 | Backup Sheet (File > Make a copy) | manual |
| B2 | Snapshot baseline **di dalam** jendela beku | `trekkr_elo_audit.py --save baseline.json` |
| B3 | Regenerasi worklist dari output B2 | worklist yang dicetak audit |
| B4 | Hapus sesi duplikat (Perbaikan 4) | replay/manual |
| B5 | Tangani match walkover (Perbaikan 5) | replay/manual |
| B6 | Backfill baris INITIAL @1500 (Perbaikan 1) | replay/manual |
| B7 | Backdate timestamp INITIAL (Perbaikan 2) | replay/manual |
| B8 | Jalankan REPLAY | `trekkr_elo_replay` (lihat keputusan desain) |
| B9 | Audit + compare vs baseline | `trekkr_elo_audit.py --compare baseline.json` |
| B10 | Replay lagi + audit + compare → **Berubah: 0** | idem |

### B1 — Backup

Google Sheet → **File > Make a copy**. Simpan salinan bertanggal. Ini jaring
pengaman kalau replay salah.

### B2 — Baseline (DI DALAM jendela beku)

Ekspor `ELO_Log.csv` + `Sessions.csv` (File > Download > CSV per tab), lalu:

```bash
cd tools/elo
python3 trekkr_elo_audit.py --elo-csv ELO_Log.csv --sessions-csv Sessions.csv \
  --min-matches 1 --save baseline.json
```

Simpan output terminalnya — itu daftar kerja B3.

### B3 — Regenerasi worklist

Pakai bagian **WORKLIST REMEDIASI** dari output B2, **bukan** tabel di
dokumen spesifikasi. Bagian itu mencetak, dari data terkini:

- Perbaikan 1: sesi pendorong "tanpa INITIAL" + daftar pemainnya.
- Perbaikan 2: pemain dengan INITIAL tidak berurutan + target backdate.
- Perbaikan 3: **SESI PENYEBAB RANTAI PUTUS** (ini yang wajib dipakai — sesi
  baru bersidik-jari sama terus bertambah) + daftar sesi bersidik-jari
  `Americano/0/0`.
- Perbaikan 4: pasangan sesi kembar (`keep` / `remove`).
- Perbaikan 5: placeholder walkover.

### B4 — Hapus sesi duplikat (Perbaikan 4)

Untuk tiap pasangan di worklist, hapus baris `remove` (baik di tab **Sessions**
maupun seluruh baris ber-`sessionId` itu di **ELO_Log**). Jangan hapus `keep`.

> Jangan hapus pemain/sesi tanpa menghapus baris ELO_Log-nya juga — itu merusak
> zero-sum yang saat ini PASS.

### B5 — Match walkover (Perbaikan 5)

Keputusan aturan (Pasal 14.4): **Opsi A (rekomendasi)** — kecualikan match
walkover dari perhitungan ELO saat replay, lalu hapus 4 pemain placeholder;
atau **Opsi B** — biarkan memengaruhi ELO dan ubah rulebook. Terapkan konsisten.

### B6 — Backfill INITIAL @1500 (Perbaikan 1)

Untuk tiap pemain di worklist Perbaikan 1, sisipkan baris ELO_Log:

```
sessionId=INITIAL, elo=1500, delta=0, w=0, l=0,
timestamp = 1 ms sebelum entri pertama pemain
```

### B7 — Backdate INITIAL (Perbaikan 2)

Untuk tiap pemain di worklist Perbaikan 2, ubah timestamp baris INITIAL menjadi
1 ms sebelum match pertamanya. (Engine replay juga memaksa INITIAL diproses
pertama apa pun timestamp-nya — penjaga permanen.)

### B8 — Replay

Lihat **Keputusan desain replay** di bawah. Engine belum dibangun.

### B9 / B10 — Verifikasi + determinisme

```bash
# setelah replay pertama, ekspor ulang CSV, lalu:
python3 trekkr_elo_audit.py --elo-csv ELO_Log_after.csv \
  --sessions-csv Sessions_after.csv --min-matches 1 --compare baseline.json
```

Target keenam tes:

| Tes | Baseline | Target |
|---|---|---|
| 1. Rantai ledger | 38 putus | **0** |
| 2. Batas K/ match | PASS | PASS |
| 3. Zero-sum | +28 | ≈ 0 |
| 4. Rekonsiliasi W/L | PASS | PASS |
| 5. Kronologi | 35 kacau | **0** |
| 6. Higienitas | 174 + 4 | **0 + 0** |

Lalu **B10**: jalankan replay sekali lagi tanpa menambah data → audit
`--compare` (baseline = hasil run pertama) harus **`Berubah: 0`**. Kalau masih
bergeser, rebuild tidak deterministik dan **tidak boleh** dipakai menetapkan
tier Musim 0.

---

## Keputusan desain replay (B8) — **butuh keputusan sebelum dibangun**

Temuan penting dari kode: baris match `Venue_*` hanya menyimpan kolom **Date**
(resolusi hari), tanpa timestamp per-match. Urutan kronologis milidetik hanya
ada di `ELO_Log`, yang menyimpan agregat per-pemain per-ronde (bukan skor/lawan
per-match). Konsekuensinya ada dua bentuk "replay" yang berbeda:

### Opsi R1 — Re-chain ledger (deterministik, aman)

Setelah B4–B7, hitung ulang **kolom `elo`** tiap pemain sebagai jumlah kumulatif
`delta` dari seed INITIAL, dalam urutan INITIAL-first lalu timestamp. Delta lama
dipertahankan.

- ✅ Menuntaskan Tes 1/5/6 secara pasti dan deterministik (`Berubah: 0` dijamin).
- ✅ Tidak butuh rekonstruksi match; risiko rendah.
- ❌ **Tidak** menetralkan seed "deklarasi Silver" (44 pemain @2100) — delta
  historis tetap dihitung dengan seed lama, jadi klaim seed masih tersirat di
  magnitudo delta.

### Opsi R2 — Replay penuh dari match (sesuai maksud spec)

Bangun ulang ELO_Log dari korpus match (`Venue_*` + `Tournament_Matches`),
semua mulai 1500, lewat engine `rmCalcElo`, kecualikan walkover & sesi duplikat.

- ✅ Menetralkan seed deklaratif — rating murni dari hasil pertandingan.
- ✅ Deterministik **asalkan** aturan urutan kanonik ditetapkan.
- ❌ Urutan intra-hari hilang (venue log resolusi hari), jadi hasil **tidak**
  identik dengan histori dan butuh aturan urutan kanonik yang disepakati
  (mis. Date → nama tab venue → indeks baris). Lebih kompleks, perlu review.

**Rekomendasi:** R2 kalau tujuan utamanya menghapus seed deklaratif untuk tier
Musim 0 (itu alasan replay ada di spec); R1 kalau tujuannya sekadar
mengonsistenkan ledger dengan cepat dan aman. Keduanya bisa dibangun sebagai
alat **dry-run** yang menulis usulan ELO_Log ke berkas untuk diaudit lebih dulu,
baru `--apply` setelah `Berubah: 0` terbukti.

## Penetapan tier (setelah replay bersih)

Batas: **T1 ≥ 1600 · T2 1400–1599 · T3 < 1400**, hanya untuk pemain dengan
**≥ 15 pertandingan**.
