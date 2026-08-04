# Oeank

*karena rakyat desa gapake dollar*

Oeank is an offline-first personal finance tracker for iOS, Android, and the web. Track income and expenses in a Google Sheet that you own—the app works completely offline and syncs when you're connected. No accounts, no login required, and you keep full control of your data.

## How It Works

Your data lives in a Google Sheet that you own and manage. The app stores all transactions locally and syncs them to your Sheet when connected. If you lose internet access, all your transactions are safe on your device and will sync as soon as you're online again. There is no backend server, no sign-up, and nothing to lose access to—your financial data stays yours.

## Setup

### 1. Create a Google Sheet

Create a new Google Sheet where your transactions will live. Name it whatever you'd like (e.g., "My Finance").

### 2. Set Up the Apps Script

1. In your Google Sheet, go to **Extensions** > **Apps Script**.
2. Replace the entire script editor content with the code from `google-apps-script/Code.gs` (in this repository).
3. Click **Deploy** > **New deployment**.
4. Select **Type** > **Web app**.
5. Set **Execute as** to your account.
6. Set **Who has access** to **Anyone**.
7. Click **Deploy** and authorize the script.
8. Copy the deployment URL (you'll see it after deployment is complete). It should look like:  
   ```
   https://script.google.com/macros/d/<PROJECT_ID>/usercopy/exec
   ```

### 3. Connect the App

1. Open this app in your browser or install it on your phone.
2. On the login screen, paste the Apps Script URL into the **API URL** field.
3. Click **Connect** and you're done—your sheet is now linked.

To switch to a different sheet later, tap **Change Sheet** in the app header (you'll need to re-confirm and re-paste the URL).

## Sheet Format

Your Google Sheet must have a tab named **Transactions** with the following columns (row 1 = header):

| Column    | Format                           |
|-----------|----------------------------------|
| `id`      | UUID (auto-generated)            |
| `type`    | "income" or "expense"            |
| `amount`  | Number (in IDR)                  |
| `category`| Text (preset or custom)          |
| `date`    | Date in `YYYY-MM-DD` format      |
| `note`    | Text (optional)                  |
| `createdAt`| ISO timestamp (auto-generated)  |
| `accountId`| Id from the Accounts tab (optional; blank = unassigned) |

Seven more tabs are created automatically the first time you need them:

**Accounts** — `id`, `name`, `ownerName`, `icon`, `createdAt`
**Transfers** — `id`, `fromAccountId`, `toAccountId`, `amount`, `date`, `note`, `createdAt`
**Debts** — `id`, `name`, `totalAmount`, `instalmentCount`, `firstDueDate`, `note`, `createdAt`
**DebtInstalments** — `id`, `debtId`, `number`, `amount`, `dueDate`, `paidDate`, `transactionId`, `createdAt`
**Savings** — `id`, `name`, `icon`, `targetAmount`, `note`, `createdAt`
**SavingContributions** — `id`, `savingId`, `amount`, `date`, `note`, `createdAt`
**Allocations** — `id`, `name`, `icon`, `amount`, `cadence`, `intervalDays`, `categories`, `startDate`, `openingBalance`, `note`, `createdAt`

`DebtInstalments` is sparse: a row appears only for an instalment you have edited or paid, so a
24-month debt starts with no rows at all. The rest of the schedule is computed from the header.

`Allocations` holds envelope budgets. `cadence` is one of `daily`, `weekly`, `monthly` or `days`;
`intervalDays` applies only to `days`. `categories` is a JSON array of the categories the envelope
claims, though a comma-separated list is read too if you edit the cell by hand. `startDate` and
`openingBalance` together carry the rollover: editing an envelope's amount, cadence or categories
rebases them to today rather than retroactively rewriting past periods, so those two cells change on
their own and are not worth editing directly.

The Apps Script handles all of this automatically—just create the sheet and deploy the code. It also
adds any column a newer version needs, so upgrading is a matter of pasting in the new `Code.gs` and
redeploying; your existing rows are left alone.

## Security (Optional)

By default, anyone with the Web App URL can add, edit, and delete transactions. If you plan to share the URL, secure it with a token:

1. In your Apps Script editor, go to **Project Settings**.
2. Find **Script Properties** (add if not visible) and create a new property:
   - Key: `OWNER_TOKEN`
   - Value: a random string of your choosing (e.g., `mysecrettoken123`)
3. Save and re-deploy the script.
4. Paste the URL and token into the app's login screen, and every sync will require the token.

## Local Development

### Install Dependencies

```bash
pnpm install
```

### Run the Dev Server

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Type Check

```bash
pnpm typecheck
```

### Run Tests

```bash
pnpm test
```

Runs all unit tests for money formatting, date grouping, heatmap logic, and summary calculations.

### Build for Production

```bash
pnpm build
```

Outputs to `dist/`. The app is a React 18 + TypeScript + Vite PWA (Progressive Web App), so it can be deployed to any static host (Netlify, Vercel, GitHub Pages, etc.).

## Features

- **Offline-first**: all transactions stored locally; syncs when online
- **Responsive**: works on phones, tablets, and desktop browsers
- **Installable**: add to your home screen as a PWA
- **Spending heatmap**: visual calendar view of spending by day
- **Reports**: scope to a year, month or day, see totals and charts, export a PDF
- **Envelope budgets**: daily, weekly, monthly or custom allocations per category, with rollover
- **Bilingual**: English and Bahasa Indonesia
- **Zero tracking**: no analytics, no third-party scripts

## Tech Stack

- **React 18** with TypeScript
- **Vite** for fast builds
- **Vitest** for unit testing
- **Google Apps Script** for backend (no server required)
- **Service Worker** for offline mode and PWA capabilities

## License

Personal use. See the repository for details.
