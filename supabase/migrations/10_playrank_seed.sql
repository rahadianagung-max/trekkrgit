-- ============================================================
-- Trekkr → Supabase migration
-- Group 10: PlayRank tier placement — seed estimate (Step 1)
--
-- Menambah 1 kolom "seed_estimate" ke tabel players. Ini SEED ONLY:
-- jawaban placement ringan saat registrasi (join.html), dipakai HANYA buat
-- kualitas matchmaking di sesi kalibrasi awal — BUKAN ELO/tier resmi.
-- Nilai: "900" | "1000" | "1500" (anchor) atau kosong ("nggak yakin"/tak diisi).
-- Additive & aman: ditaruh di akhir tabel supaya posisi kolom A..L lama tidak
-- bergeser (pembacaan positional di api/_supasheets.js tetap valid).
-- ============================================================

alter table players
  add column if not exists seed_estimate text;
