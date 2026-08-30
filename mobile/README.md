# Trekkr Player — Mobile App (Expo / React Native)

Aplikasi pemain untuk **Android & iOS**, dibangun sebagai client di atas engine
Trekkr yang sudah ada. **Backend tidak dibuat ulang** — app memanggil REST API
`https://trekkr.online/api/*` dan Supabase Auth (URL + anon key publik, sama
seperti web client).

## Status: MVP scaffold (Fase 0–1)

Sudah ada:
- Auth (login) via Supabase — sesi persist di AsyncStorage, auto-refresh.
- **Passport** — ELO, Series Tier (T1/T2/T3 persentil), W/L, riwayat ELO.
- **Rankings** — leaderboard pemain terkalibrasi (≥15 match) + tier dinamis.
- Navigasi bottom-tab, tema brand (oranye #FF6A00) light & dark.

Belum (fase berikutnya): edit profil, daftar event, push notification, ikon/splash kustom, font brand (Saira/Plus Jakarta via `@expo-google-fonts`).

## Menjalankan (dev)

Butuh Node 18+ dan app **Expo Go** di HP (atau simulator iOS/emulator Android).

```bash
cd mobile
npm install
npx expo start
```

Scan QR dengan Expo Go (Android) / Camera (iOS), atau tekan `a` / `i` untuk
emulator/simulator.

Login pakai akun pemain Trekkr (yang dibuat/di-claim di `trekkr.online/join`).

## Typecheck

```bash
npm run typecheck
```

## Struktur

```
mobile/
  App.tsx                 # providers + navigator
  index.ts                # entry (registerRootComponent)
  app.json                # konfigurasi Expo
  src/
    config.ts             # API base + Supabase URL/anon key (publik)
    theme.ts              # token brand (light/dark) + tierName()
    lib/supabase.ts       # Supabase client (AsyncStorage)
    lib/api.ts            # client REST /api/* (port dari trekkr-api.js)
    context/AuthContext.tsx
    navigation/RootNavigator.tsx
    screens/LoginScreen.tsx
    screens/PassportScreen.tsx
    screens/RankingsScreen.tsx
```

Path alias `@/*` → `src/*` (didukung Expo Metro via `tsconfig.json`).

## Build ke store (nanti, butuh akun kamu)

Pakai EAS. Butuh akun Apple Developer ($99/thn) & Google Play ($25 sekali).

```bash
npm i -g eas-cli
eas login
eas build:configure
eas build --platform ios       # → App Store Connect
eas build --platform android   # → Google Play
eas submit                     # submit ke store
```

## Catatan API

- Semua endpoint yang dipakai sudah ada & dikonsumsi web client.
- Aturan kontrak sama: nambah field aman, **jangan** rename
  `player`/`new_elo`/`elo_change`.
- Auth: kirim access token Supabase sebagai `Authorization: Bearer <token>`.
