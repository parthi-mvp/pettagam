# Pettagam

An offline-first mobile app (Expo / React Native) for tracking:

- **Expenses & income**, with categories, merchants and notes
- **Bank balances**, **credit card outstanding/limits**, wallets, cash and loans
- **Investments**: FD, RD, chit funds, stocks, mutual funds, gold, PPF/EPF/NPS, bonds, real estate, crypto and others
- **Auto entries from bank SMS** (Android): reads debit/credit/card/UPI alerts and turns them into transactions you review before importing
- **Reports & analysis**: category breakdown, 6-month income vs expense, top merchants, net worth, investment allocation, plain-language insights, CSV export
- **Neon cloud account with offline cache**: your data lives in Neon Postgres and is cached on the phone, so the app keeps working offline and edits upload when you're back online

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| App framework | **Expo SDK 58**, React Native 0.88, TypeScript | One codebase for Android and iOS, with EAS cloud builds |
| Navigation | **Expo Router** (native tabs and stack) | File-based routes in `src/app/` |
| Backend | **Neon**: Postgres, Neon Auth (Better Auth), Data API (PostgREST) | No server code to run. Row-Level Security keeps each user's rows private |
| Offline cache | **expo-sqlite** (SQLite, WAL) plus an outbox of queued edits | Opens and works offline. Reports run on the local copy |
| State | The SQLite cache plus a small `useLiveQuery` hook | No Redux/Zustand to keep in step |
| SMS reading | Local Expo native module `modules/sms-reader` (Kotlin, `content://sms/inbox`) | Supports the new architecture, with no unmaintained third-party library |
| SMS parsing | Pure TypeScript regex parser `src/sms/parser.ts` | Runs on the device and is unit-tested |
| Auth | Neon Auth email + password, session cookie kept in the device keychain (`expo-secure-store`) | Calls the REST endpoints directly; the browser SDK doesn't fit React Native |
| Sync | Upload the outbox, then pull rows with `rev` above this phone's cursor. The server keeps the later edit | Neon is the source of truth, so the phone never merges whole databases |
| Charts | Lightweight View-based bars | No extra native chart dependencies |
| Builds | **EAS Build** (`eas.json` has development, preview and production profiles) | No need for local Android Studio |

## UI stack

Same setup as waei-flow's mobile app:

| | |
|---|---|
| **Uniwind + Tailwind CSS v4** | Write `className="bg-surface text-fg rounded-card"` on React Native components. The tokens live in `src/global.css`, with light and dark values; Metro compiles them through `withUniwindConfig` (`metro.config.js`). |
| **tailwind-variants + tailwind-merge + clsx** | Component variants with `tv()`, and `cn()` (`src/lib/cn.ts`) to merge classes. |
| **TrueSheet** (`@lodev09/react-native-true-sheet`) | Native bottom sheets through `<Sheet>` in `src/components/ui/Sheet.tsx`. The Home "+" opens `QuickAddSheet`. |
| **sonner-native** | Toasts via `toast.success(...)`, themed in `AppToaster`. |
| **expo-haptics** | `haptic.success()` etc. (`src/lib/haptics.ts`). Users can turn it off in Settings. |
| **zustand** | Small stores, such as the theme and haptics preferences, saved with `expo-sqlite/kv-store`. |
| **NetInfo** | Syncs as soon as the internet comes back. |

Rules:

- **Colours:** use token classes (`bg-canvas`, `text-fg-muted`, `border-line`, `bg-primary`, `text-on-primary`, `bg-brass-soft`). Read a token in JS (for an SVG fill or a native prop) with `useThemeColor('primary')`, and never hard-code hex.
- **Fonts:** Inter for the interface (`font-regular` … `font-extrabold`), Fraunces (`font-display`) only for hero lines, Noto Sans Tamil (`font-tamil`). These are the design system's choices (tokens in the Pettagam design canvas).
- **Type scale:** it uses Tailwind's standard size names, so tailwind-merge reads them as sizes. In pixels: xs 12 · sm 13 · base 14 · lg 15 · xl 16 · 2xl 18 · 3xl 20 · 4xl 22 · 5xl 28 · 6xl 40.
- **Taps:** every tappable surface is `PressableScale`, which scales slightly when pressed and dims instead when Reduce Motion is on.
- **Theme:** Settings → Appearance offers Same as phone / Light / Dark, and the Home header has a quick sun/moon toggle. Both go through `Uniwind.setTheme`.
- **Generated file:** Metro generates `src/uniwind-types.d.ts` and it's committed. Don't edit it.

## Project layout

```
src/
  app/                    Expo Router screens
    (tabs)/               Home, Transactions, Accounts, Invest, Reports
    transaction-form.tsx  add/edit income, expense, transfer (card bill payment)
    account-form.tsx      bank / credit card / wallet / cash / loan
    investment-form.tsx   any investment type (chit-specific fields, FD interest calc)
    investment/[id].tsx   holdings detail, entries (buy/SIP/installment/sell/payout/dividend), revalue
    sms-import.tsx        scan inbox → review → import
    settings.tsx          account, sync status, one-time Drive import, sign out
    sign-in.tsx           Neon Auth sign in / sign up
  db/                     schema + migrations, repository, live queries
  sms/                    parser + import (account matching by last 4 digits, dedupe)
  auth/                   Neon Auth client (session in SecureStore, JWT for the Data API)
  sync/                   Neon sync engine (outbox → Data API, incremental pull), auto-sync,
                          one-time Google Drive import (drive.ts, merge.ts, drive-import.ts)
  reports/analytics.ts    report queries, insights, CSV export
modules/sms-reader/       Android native module (Kotlin)
neon/migrations/          Postgres schema, RLS policies, last-write-wins trigger, balances view
neon/test/                SQL tests against a local Postgres (npm run test:db)
tests/                    unit tests: SMS parser, Drive merge, Neon wire helpers (node --test)
```

## Getting started

```bash
npm install
cp .env.example .env   # fill in your Neon URLs (see below)
npm test            # unit tests
npm run test:db     # schema/RLS tests (needs a local Postgres)
npm run typecheck
npx expo lint
```

The app uses native code (SQLite, Google Sign-In, SMS module), so **Expo Go is not enough**. You need a development build:

```bash
npm i -g eas-cli
eas login
eas build --profile development --platform android   # installable APK
npx expo start --dev-client                          # then open the app on the phone
```

If Android Studio is installed locally, you can run `npx expo run:android` instead.

## Neon setup (one time)

1. Create a project at [neon.com](https://neon.com). Pick the **AWS Asia Pacific (Singapore)** region, the closest to India.
2. Apply the schema. In the Neon SQL editor (or with `psql "$DATABASE_URL"`), run the files in `neon/migrations/` in order. `0002` removes the DELETE permission that enabling the Data API grants automatically.
   - **Enable Neon Auth and the Data API first** (step 3). The schema uses the `authenticated` role and the `auth.user_id()` function, which they provide.
3. Turn on the services. In the Console, open your project:
   - **Auth**: enable it and keep **Email & password** on.
   - **Data API**: enable it on the `neondb` database and choose **Neon Auth** as the JWT provider.
4. Copy the **Auth URL** and the **Data API URL** into `.env` as `EXPO_PUBLIC_NEON_AUTH_URL` and `EXPO_PUBLIC_NEON_DATA_API_URL` (see `.env.example`). If the Console only shows the JWKS URL, the Data API URL follows the Auth URL's pattern with `neonauth` → `apirest` and `/auth` → `/rest/v1`. These URLs are public; access is controlled by each user's token and Postgres row-level security.
5. Restart `npx expo start --dev-client`, then create an account in the app.

How data flows:

- **Editing.** Every edit is saved on the phone first and queued in the outbox. A few seconds later, and on app open or close, the queue is uploaded to the Data API.
- **Pulling.** Changes made on other devices are pulled using a server sequence number (`rev`), so each sync only downloads what changed.
- **Conflicts.** If two devices edit the same entry while offline, a Postgres trigger keeps the later edit.
- **Deletes.** Deletes are soft, so they reach every device. The app's database role cannot hard-delete rows.
- **Signing in.** Signing in needs internet once; after that the app opens offline.
- **Signing out.** Signing out removes the phone's copy. The app warns you if edits haven't uploaded yet.

### Moving from the Google Drive version

Data from the earlier Drive-sync build is kept: on the first sign-in, everything already on the phone is uploaded to your account. To pull in a Drive backup from another phone, use **Settings → Import from Google Drive**. That only needs the Google OAuth client from the old setup (package `com.pettagam.app`, scope `drive.appdata`). It will be removed in a later release.

## SMS auto-entry

- **Android only.** iOS does not let apps read SMS, so on iOS you paste messages into the import screen instead.
- First add your accounts and cards with their **last 4 digits**. Alerts like "A/c XX1234" or "card ending 5678" are matched to them automatically.
- Import screen: **New since last import** or **Last 90 days** → review (tap an item to change its account, category or type) → **Import**.
- Skipped automatically: OTPs, bill/due reminders, promotional messages, declined or failed transactions, and future debits ("will be debited").
- Already-imported messages are skipped (each one is identified by a hash).
- To add bank formats, put a sample SMS in `tests/parser.test.ts` and adjust `src/sms/parser.ts`.

> **Play Store note:** Google Play only allows `READ_SMS` for apps that are the default SMS handler or that get an approved exception. For personal use, install the APK from EAS directly; this is fine. To publish on the Play Store, remove the permission and keep the paste/share import.

## Tips

- **Credit card bill payment** → add a *Transfer* from the bank account to the card. The bank balance goes down and the card outstanding goes down.
- **Chit fund** → enter the chit value, duration and installment. Log each month's installment as *Installment* and the auction prize as *Prize / Maturity payout*.
- **FD** → enter the principal, rate and start date. The current value is estimated with quarterly compounding (use **Recalculate FD** to refresh it).
- **Stocks / MF / gold** → update the value with a total or a per-unit price (for example `7450/u` for gold per gram).

## Roadmap ideas

- Receipts and statements in Neon Object Storage (upload links from a Neon Function)
- Daily mutual fund NAV and gold price refresh as a scheduled Neon Function
- Email OTP / Google sign-in through Neon Auth
- Background SMS listener (auto-import on arrival) and a notification to review new entries
- Budgets per category with alerts
- Live NAV / stock / gold prices (AMFI NAV file, an exchange API)
- Recurring transactions (rent, SIPs, EMIs)
- App lock (biometric) using `expo-local-authentication`
