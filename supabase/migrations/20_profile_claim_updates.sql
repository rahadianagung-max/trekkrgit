-- Profile changes (photo, display name, gender, city, Instagram) filed with a claim;
-- applied to the player only when an admin approves the claim.
alter table profile_claims add column if not exists updates jsonb;
