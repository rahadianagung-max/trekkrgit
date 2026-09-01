# Trekkr transactional email templates

Professional, brand-consistent HTML for every player-facing email. All templates
share one design system: an orange gradient header with the **TREKKR** wordmark,
a white rounded card, a bulletproof orange CTA button, and a muted footer with
`trekkr.online` links. Table-based + inline styles so they render in Gmail,
Outlook and Apple Mail. Language is English, matching the app/web UI.

## Two delivery paths (important)

Trekkr sends player emails through **two** systems, so the templates live in two
places:

| Email | Sent by | Where the template lives |
|-------|---------|--------------------------|
| **Onboarding / confirm signup** (new player via the app) | Supabase Auth (GoTrue) | Supabase dashboard — paste `supabase-confirm-signup.html` |
| **Forgot / reset password** (app "Forgot password?") | Supabase Auth (GoTrue) | Supabase dashboard — paste `supabase-reset-password.html` |
| **Magic link** (optional) | Supabase Auth (GoTrue) | Supabase dashboard — paste `supabase-magic-link.html` |
| **Welcome + set password** (legacy `auth/register` flow) | our code (Brevo) | `api/sheet.js` → `tplWelcomeSetPassword()` — already wired |
| **Profile claim approved** | our code (Brevo) | `api/sheet.js` → `tplClaimApproved()` — already wired |
| **Password reset** (Brevo fallback, if ever used) | our code (Brevo) | `api/sheet.js` → `tplPasswordReset()` |
| **Claim-your-profile outreach** (bulk to existing players) | Brevo **Campaign** | paste `brevo-claim-outreach.html` into a campaign |

The Brevo ones are already live in the backend. The Supabase ones must be pasted
into the dashboard once (below) — that is where the app's real onboarding and
forgot-password emails come from.

## Installing the Supabase templates (one-time, no deploy needed)

1. Supabase dashboard → **Authentication → Emails → Templates**.
2. For each row below, open the template, switch the editor to **HTML / source**,
   and paste the whole file:
   - **Confirm signup** ← `supabase-confirm-signup.html`
   - **Reset password** ← `supabase-reset-password.html`
   - **Magic Link** ← `supabase-magic-link.html` (optional)
3. Set a friendly **subject** per template, e.g.
   - Confirm signup: `Welcome to Trekkr — confirm your email 🎾`
   - Reset password: `Reset your Trekkr password`
   - Magic Link: `Your Trekkr login link`
4. Save. (Also confirm the **Site URL** / redirect URLs under Authentication →
   URL Configuration point at `https://trekkr.online`.)

These files keep the GoTrue variables intact:
`{{ .ConfirmationURL }}` (the action link) and `{{ .Email }}` (the recipient).
Don't rename or remove them — GoTrue fills them at send time.

## Previews

`preview/*.html` are the same templates with sample data filled in — open them in
a browser to see exactly how each email looks. They are for reference only and
are not used at runtime.

## Claim-your-profile outreach campaign (bulk)

Goal: email players who already have a Trekkr profile (built from match data) but
haven't claimed it yet, so they download the app and claim it. Use a **Brevo
Campaign** (marketing) — not a transactional loop — for deliverability and a
built-in unsubscribe.

**Why a campaign, not code:** these are unsolicited bulk emails, so they need an
unsubscribe link and good sending reputation. Brevo campaigns handle both; a
`sendBrevoEmail` loop does not and risks the domain landing in spam.

**One-tap deep link (already shipped).** The app now reads `?claim=<name>`:
opening `https://trekkr.online/app?claim=Andi%20Wijaya` jumps straight to the
Register/claim screen with the name pre-filled — the player just sets a password
and submits. `brevo-claim-outreach.html` builds this link per-recipient from a
contact attribute.

**Steps:**
1. **Prepare the list (CSV).** Columns: `EMAIL`, `PLAYER_NAME` (the exact Trekkr
   profile name — this drives the deep link). Optionally `FIRSTNAME`.
2. **Brevo → Contacts → Attributes:** make sure a `PLAYER_NAME` attribute exists
   (type: Text).
3. **Brevo → Contacts → Import:** upload the CSV into a new list (e.g.
   "Unclaimed players"), mapping the columns to the attributes.
4. **Brevo → Campaigns → Email → Create.** For the design step choose
   "Paste your code" / rich-text HTML and paste `brevo-claim-outreach.html`.
   - Subject: `Your padel profile is on Trekkr — claim it 🎾`
   - The template already uses `{{ contact.PLAYER_NAME }}` for the name and in
     the claim link, and `{{ unsubscribe }}` for the opt-out link. Leave those
     tags intact.
5. **Send a test** to yourself, click the button, confirm it opens the app on the
   claim screen with the name filled in.
6. **Send / schedule** to the list.

Notes:
- If a name doesn't match a profile exactly, the app gracefully falls back to the
  "register as new" form — the recipient can fix the name — so a near-miss is not
  a dead end.
- Keep it to players who genuinely opted in / are your users; honor unsubscribes
  (Brevo does this automatically).

## Editing / keeping in sync

The canonical markup lives in `api/sheet.js` (the `emailShell` / `emailButton` /
`tpl*` helpers). If you change the brand shell there, regenerate these files so
the Supabase templates match. Keep colors on the brand tokens
(`--orange #FF6A00`) and never hard-code secrets or tokens into a template.
