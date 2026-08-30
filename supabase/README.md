# Trekkr → Supabase

Migrasi database Trekkr dari Google Sheets ke Supabase (Postgres).

## Cara kerja (ringkas)

- `api/sheet.js` tetap berisi seluruh logika. Ia mengakses data lewat
  `getSheets()`.
- `api/_supasheets.js` adalah **drop-in** berbentuk sama seperti client Google
  Sheets, tapi setiap panggilan diterjemahkan ke Supabase (PostgREST).
- **Saklar** di `getSheets()`: kalau `SUPABASE_URL` **dan**
  `SUPABASE_SERVICE_KEY` ada → pakai Supabase; kalau tidak → tetap Google Sheets
  (perilaku lama, aman).

## Variabel lingkungan (server-side, mis. di Vercel)

| Nama | Isi |
|---|---|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_KEY` | kunci **service_role** (rahasia) |

Selama dua-duanya belum diisi, situs tetap memakai Google Sheet.

## Urutan migration (SQL)

Jalankan berurutan di Supabase SQL Editor:

1. `migrations/01_players_ratings.sql`
2. `migrations/02_matches_sessions.sql`
3. `migrations/03_venues.sql`
4. `migrations/04_tournaments.sql`
5. `migrations/05_registration_admin_rankedevent.sql`
6. `migrations/06_extra_tables.sql`
7. `migrations/07_schema_fixes.sql`
8. `migrations/08_enable_rls.sql` (keamanan; sebelum go-live)
9. `migrations/09_player_accounts.sql`
10. `migrations/10_playrank_seed.sql` (kolom `seed_estimate` — PlayRank Step 1)
11. `migrations/11_tier_boundaries.sql` (cache cutoff Series Tier — PlayRank Step 3)

Data lama diimpor via CSV (Table Editor → Import data from CSV).

## Catatan

- `league_series` belum dibuat (tab kosong/tak dipakai di kode).
- `netlify/functions/sheet.js` (deploy Netlify lama) **belum** disambungkan ke
  Supabase — masih Google Sheets. Target utama adalah Vercel (`api/sheet.js`).
- Kolom semua bertipe `text` (lift-and-shift). Bisa diperketat nanti.
