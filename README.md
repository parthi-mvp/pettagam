# Pettagam

An offline-first mobile app (Expo / React Native) for tracking:

- **Expenses & income**, with categories, merchants and notes
- **Bank balances**, **credit card outstanding/limits**, wallets, cash and loans
- **Investments**: FD, RD, chit funds, stocks, mutual funds, gold, PPF/EPF/NPS, bonds, real estate, crypto and others
- **Auto entries from bank SMS** (Android): reads debit/credit/card/UPI alerts and turns them into transactions you review before importing
- **Reports & analysis**: category breakdown, 6-month income vs expense, top merchants, net worth, investment allocation, plain-language insights, CSV export
- **No account, no server**: your data lives on the phone (SQLite). Optional backup and multi-device sync through your own Google Drive (a hidden app folder)

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| App framework | **Expo SDK 58**, React Native 0.88, TypeScript | One codebase for Android and iOS, with EAS cloud builds |
| Navigation | **Expo Router** (native tabs and stack) | File-based routes in `src/app/` |
| Storage | **expo-sqlite** on the phone; optional backup to the user's own Google Drive (`drive.appdata`) | No backend to run or pay for; nothing leaves the phone except to the user's Drive |
| Change tracking | An outbox of rows edited since the last backup | Back up only when something changed |
| State | The SQLite cache plus a small `useLiveQuery` hook | No Redux/Zustand to keep in step |
| SMS reading | Local Expo native module `modules/sms-reader` (Kotlin, `content://sms/inbox`) | Supports the new architecture, with no unmaintained third-party library |
| SMS parsing | Pure TypeScript regex parser `src/sms/parser.ts` | Runs on the device and is unit-tested |
| Auth | None. Google Sign-In only to reach Drive, when backup is turned on | No sign-up wall for a finance app |
| Sync | Each phone writes its own `pettagam-<device>.json` (full snapshot, soft deletes included) and merges the others' files, newest row wins | Phones never write the same file, so no edit is lost |
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
    settings/sync.tsx     Google Drive backup: connect, back up now, status, stop
  db/                     schema + migrations, repository, live queries
  sms/                    parser + import (account matching by last 4 digits, dedupe)
  sync/                   Drive backup and sync (drive.ts client, drive-sync.ts engine, merge.ts), auto-sync
  reports/analytics.ts    report queries, insights, CSV export
modules/sms-reader/       Android native module (Kotlin)
tests/                    unit tests: SMS parser, merge, reports, sync errors (node --test)
```

## Getting started

```bash
npm install
npm test            # unit tests
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

## Google Drive backup (one time setup)

Backup is optional; the app works fully without it. To enable it in your builds:

1. In [Google Cloud Console](https://console.cloud.google.com), create a project and enable the **Google Drive API**.
2. **OAuth consent screen**: add the scope `https://www.googleapis.com/auth/drive.appdata`. While in *Testing*, add your Google account as a test user.
3. **Credentials → Create OAuth client → Android**, once per app id you install: `com.pettagam.app.dev`, `com.pettagam.app.preview`, `com.pettagam.app`, each with the SHA-1 of the keystore that signs it (`eas credentials` shows it for EAS builds).
4. Rebuild isn't needed for this; the Google Sign-In module is already in the app.

How it works:

- **Saving.** Every edit is saved on the phone and marked in the outbox. A few seconds later, and when the app opens or goes to the background, the phone uploads a small change file with just the fields it changed; every 50 change files it also writes a full snapshot and removes its older change files.
- **Other phones.** Each sync lists the backup files; any other phone's file that changed is downloaded and merged in, keeping the newer copy of each entry.
- **Deletes.** Deletes are soft, so they reach every phone.
- **New phone.** Install, tap *Restore from Google Drive* on the welcome screen (or More → Backup) and connect the same account.
- **Privacy.** The app folder is hidden and private to Pettagam; it can't see the user's other Drive files.

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

- Daily mutual fund NAV and gold price refresh
- Background SMS listener (auto-import on arrival) and a notification to review new entries
- Budgets per category with alerts
- Live NAV / stock / gold prices (AMFI NAV file, an exchange API)
- Recurring transactions (rent, SIPs, EMIs)
- App lock (biometric) using `expo-local-authentication`
