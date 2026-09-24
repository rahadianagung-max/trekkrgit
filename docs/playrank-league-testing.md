# PlayRank League · Fixed Partner — Panduan Testing

Dua tahap: **(A) simulasi** tanpa login dan tanpa data tersimpan, lalu **(B) sesi
percobaan** di venue sungguhan (masuk ke ELO).

---

## A. Simulasi (aman, tidak menyentuh database/ELO)

Buka **https://trekkr.online/playrank-demo?mode=league**
(atau `/playrank-demo`, lalu pilih **🏆 League · Fixed Partner** di kartu *Session Type*).

| # | Langkah | Yang diharapkan |
|---|---|---|
| A1 | Setup default: 14 pasangan · 4 jam · 17 menit · 2 lapangan | Rekomendasi: *14 slots per court … Every pair plays **4 matches** … 28 matches total, 19:00–±22:58* |
| A2 | Ubah jam/menit/pasangan/lapangan | Rekomendasi langsung berubah. Pasangan ganjil → jumlah match per pasangan selalu genap |
| A3 | Tombol − / + di "Match per pasangan" | Bisa diturunkan; tidak bisa melebihi maksimal yang muat |
| A4 | Pilih **Mixed** → **▶ Auto-play** | Engine memilih 14 pria + 14 wanita, auto-pair (1 pria + 1 wanita), memainkan 14 slot, lalu menampilkan hasil |
| A5 | Pilih **Women**, **Best Of 5** → Auto-play | Skor otomatis 3–0 / 3–1 / 3–2; semua pasangan main 4 match |
| A6 | Pakai **⏭ 1 slot** (bukan Auto-play) | Satu slot per klik. Cek tab **Leaderboard** (tabel pasangan) & **History** (order of play + jam) |
| A7 | Perhatikan tombol **End Match** saat memakai ⏭ 1 slot | Terkunci, lalu **terbuka setelah slot 7** (semua 2 match) dan setelah slot 14 |
| A8 | Pilih **Weekly PlayRank** → Auto-play | PlayRank mingguan berjalan seperti biasa (regresi) |

## B. Sesi percobaan di venue (real, masuk ELO)

Butuh akun venue di **admin.trekkr.online**. Saran: 4 pasangan · 2 lapangan ·
1 jam · 15 menit (3 match per pasangan, ±45 menit main), dengan pemain yang memang mau ranking-nya
bergerak — **hasil sesi ini tercatat ke ELO**.

### Setup
- [ ] Tab PlayRank → **🏆 PlayRank League · Fixed Partner**
- [ ] Isi pasangan, durasi, menit per match, jam mulai, lapangan → cek rekomendasi masuk akal
- [ ] Pilih kategori (Men / Women / **Mixed**) + format skor (**Race to 4** atau **Best of 5**)
- [ ] Pick Players: jumlah pemain = pasangan × 2 (Mixed: jumlah pria = wanita, kalau tidak akan ditolak)
- [ ] Pair Teams: coba pasangkan 2 pria di Mixed → harus ditolak; lalu **Auto-pair** atau pairing manual
- [ ] Start → slot 1 muncul dengan jam per lapangan + kotak **Up next**

### Link untuk pemain & TV
- [ ] Salin link live dari bar **LIVE** → buka di HP lain: `trekkr.online/live/<code>`
  - [ ] Ada **League table** (per pasangan) dan **Order of play** lengkap dengan jam
  - [ ] Ketik nama di kolom cari → hanya slot pemain itu yang tampil
- [ ] Buka TV venue: `venue.trekkr.online/<venue>/tv`
  - [ ] Kiri: lapangan yang sedang main + *Up next*; kanan: League Table per pasangan
  - [ ] Setelah submit skor, TV & live page ikut update (±5–10 detik)

### Saat bermain
- [ ] Input skor seri (mis. 2–2) → ditolak *(no draws)*
- [ ] Input skor tidak sesuai format (mis. Race to 4 → 3–1) → ditolak
- [ ] Submit skor valid → pindah ke slot berikutnya, klasemen berubah
- [ ] Tombol **End Match** terkunci sampai semua pasangan main sama banyak
- [ ] Coba refresh browser admin di tengah sesi → **▶ Lanjutkan** → kembali ke slot yang sama
- [ ] (Opsional) Manage Players → **ganti** satu pemain → pasangan tetap dengan jadwal yang sama

### Selesai
- [ ] Slot terakhir → panel *All league matches played* → **End Match** → **Yes, End**
- [ ] Layar hasil: podium & final standings **per pasangan**, ELO tiap pemain (▲/▼)
- [ ] Link live berubah jadi **Final results**: league table, podium pasangan, tabel ELO pemain
- [ ] TV menampilkan podium pasangan
- [ ] Cek **trekkr.online/rankings** / passport pemain: ELO ter-update; sesi Mixed masuk ranking Mixed
- [ ] Tab **Match History** venue: semua match tercatat

### Catat bila ada masalah
Screenshot + jam kejadian + link live (`/live/<code>`) — cukup untuk ditelusuri.

---

### Aturan ringkas (untuk briefing pemain)
- Pasangan tetap sepanjang sesi; semua pasangan main **jumlah match yang sama**, lawan selalu berbeda.
- Jadwal & jam main sudah ada sejak awal di link live.
- Peringkat: **jumlah menang → selisih poin (PD) → poin didapat → head-to-head**.
- Hasil tercatat ke ELO Trekkr masing-masing pemain.
