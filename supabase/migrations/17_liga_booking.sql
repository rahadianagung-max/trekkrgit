-- Liga Trekkr booking (Oct 2026) — additive only.
-- schedule.division     : Liga division of a session ("D1" | "D2" | "D3"); blank for non-Liga rows.
-- session_bookings.partner_name : Mixed Liga sessions are booked as a pair; the
--                                 booker is the Captain, this is the partner.
alter table public.schedule add column if not exists division text;
alter table public.session_bookings add column if not exists partner_name text;
-- rollback:
--   alter table public.schedule drop column if exists division;
--   alter table public.session_bookings drop column if exists partner_name;
