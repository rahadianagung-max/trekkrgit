-- ============================================================
-- Trekkr → Supabase migration
-- Group 11: Series Tier boundaries cache (PlayRank Step 3)
--
-- Menyimpan cutoff Series Tier (T1/T2/T3) yang dihitung dari persentil populasi
-- pemain aktif. Append-only: tiap recompute menulis 1 baris baru; server membaca
-- baris terakhir (id terbesar). Semua kolom text mengikuti konvensi lift-and-shift
-- (kecuali computed_at agar TTL 24 jam gampang dihitung).
-- Diakses hanya oleh server (service key); RLS aktif tanpa policy publik.
-- ============================================================

create table if not exists tier_boundaries (
  id           bigint generated always as identity primary key,
  t1           text,          -- cutoff ELO: elo >= t1  -> T1
  t2           text,          -- cutoff ELO: elo >= t2 (dan < t1) -> T2 ; < t2 -> T3
  pool_n       text,          -- ukuran pool yang dipakai menghitung
  method       text,          -- percentile-active | percentile-alltime | absolute-fallback
  computed_at  timestamptz default now()
);

alter table tier_boundaries enable row level security;
