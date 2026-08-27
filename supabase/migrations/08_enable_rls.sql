-- ============================================================
-- Group 8: KEAMANAN — aktifkan Row Level Security (RLS) di semua tabel.
--
-- Tanpa policy apa pun, RLS = "tutup semua" untuk kunci publik (anon).
-- Backend Trekkr memakai kunci service_role yang MELEWATI RLS, jadi website
-- tetap jalan normal — tapi orang luar yang punya kunci publik TIDAK bisa
-- membaca/menulis data langsung. Jalankan ini sebelum go-live.
-- ============================================================
alter table players               enable row level security;
alter table elo_log               enable row level security;
alter table player_auth           enable row level security;
alter table claims                enable row level security;
alter table sessions              enable row level security;
alter table playrank_active       enable row level security;
alter table schedule              enable row level security;
alter table venues                enable row level security;
alter table venue_leads           enable row level security;
alter table venue_matches         enable row level security;
alter table competitions          enable row level security;
alter table tracked_events        enable row level security;
alter table tournament_leads      enable row level security;
alter table tournament_leads_legacy enable row level security;
alter table tournament_events     enable row level security;
alter table tournaments           enable row level security;
alter table tournament_entrants   enable row level security;
alter table tournament_groups     enable row level security;
alter table tournament_matches    enable row level security;
alter table form_responses        enable row level security;
alter table reg_forms             enable row level security;
alter table registrations         enable row level security;
alter table edit_requests         enable row level security;
alter table admins                enable row level security;
alter table re_events             enable row level security;
alter table re_players            enable row level security;
alter table re_waves              enable row level security;
alter table re_matches            enable row level security;
alter table claim_requests        enable row level security;
alter table calculator_leads      enable row level security;
alter table calculator_results    enable row level security;
alter table draw_log              enable row level security;
alter table tournament_archive    enable row level security;
alter table banners               enable row level security;
