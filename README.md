# Agentic Elephant Carpaccio 🐘

> **A hands-on training exercise exploring AI-assisted development through thin vertical slices**

## The Scenario

We've built a great product and Sales have beaten all expectations—signing customers far beyond our expectations. We now have a backlog of customers waiting to be onboarded.

To get the product to market fast, we deferred tooling and self-service onboarding. The product needs **a LOT of complex setup** to work 🤦‍♂️. Now the CS team is overloaded and can't keep up.

**We only get paid once customers are provisioned and fully set up successfully.**

### Your Mission

Build an internal tool that helps CS clear the onboarding queue faster.

**What's the smallest thing you can give them NOW?**

---

## Quick Start (Dev Container — recommended for the workshop)

> **Two ways to get started:** use the Dev Container below (nothing to install but Docker + VS Code), or develop directly on your machine with a single `just setup` — see [Quick Start (without a Dev Container)](#quick-start-without-a-dev-container).

This repo ships a preconfigured [Dev Container](https://containers.dev/) so every participant gets an identical, ready-to-run environment (Node 20, all dependencies, Playwright browsers) with **no local setup** beyond Docker + VS Code.

### One-time prerequisites (Windows & Mac)

1. **Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)** and make sure it is **running** (whale icon in the tray/menu bar).
   - **Windows:** Docker Desktop uses the WSL 2 backend. If prompted during install, accept the WSL 2 installation and reboot. No other config is needed.
   - **Mac:** Works on both Apple Silicon (M1/M2/M3) and Intel — Docker Desktop picks the right image automatically.
2. **Install [VS Code](https://code.visualstudio.com/)**.
3. **Install the [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)** (`ms-vscode-remote.remote-containers`).

### Open the app in the Dev Container

1. Clone the repo and open the folder in VS Code:
   - **Windows (PowerShell):**
     ```powershell
     git clone https://github.com/HgGenAIHive/OnboardingSampleApp.git
     cd OnboardingSampleApp
     code .
     ```
   - **Mac (Terminal):**
     ```bash
     git clone https://github.com/HgGenAIHive/OnboardingSampleApp.git
     cd OnboardingSampleApp
     code .
     ```
     > On Mac, if the `code` command isn't found, open VS Code and run **Shell Command: Install 'code' command in PATH** from the Command Palette (`Cmd+Shift+P`).
2. When VS Code shows the **"Reopen in Container"** popup (bottom-right), click it. If you miss it, open the Command Palette (**Windows:** `Ctrl+Shift+P` / **Mac:** `Cmd+Shift+P`) and run **Dev Containers: Reopen in Container**.
3. The first build takes a few minutes (it pulls the image, installs all dependencies, and installs the Playwright browser). Subsequent opens are fast.
4. Once the container is ready, open a terminal in VS Code (**Windows:** `` Ctrl+` `` / **Mac:** `` Ctrl+` ``) and run:
   ```bash
   npm start
   ```
5. VS Code automatically **forwards ports 5173 and 3001** from the container to your machine and offers to open the browser. Open **http://localhost:5173** on your host (Windows or Mac) — it just works, no manual port mapping required.

You can also press **F5** inside the container to launch with the debugger attached (see `.vscode/launch.json`).

> **Tip:** Everything (deps, tests, git) runs *inside* the container, so your Windows/Mac machine stays clean. To stop, close the VS Code window or run **Dev Containers: Reopen Folder Locally**.

---

## Quick Start (without a Dev Container)

### Option 1: `just setup` (recommended)

One command installs every dependency (root, server, client) and the Playwright Chromium browser used by the e2e tests.

**Prerequisites**

1. **[Node.js](https://nodejs.org/) 20.19+ or 22.12+** (includes npm; any current LTS works). `just setup` checks the version and stops with a clear message if it is unsupported.
2. **[just](https://just.systems/man/en/packages.html)**, the command runner:
   - **Mac:** `brew install just`
   - **Windows:** `winget install --id Casey.Just --exact` (or `scoop install just`)
   - **Linux:** your package manager (e.g. `sudo apt install just` on Ubuntu 24.04+), or `cargo install just`

**Set up and run**

```bash
git clone https://github.com/HgGenAIHive/OnboardingSampleApp.git
cd OnboardingSampleApp

just setup   # install all dependencies + Playwright Chromium
just start   # run server (3001) and client (5173)
```

Then open **http://localhost:5173** in your browser.

> **Linux:** `just setup` runs `playwright install --with-deps`, which installs Chromium's system libraries and may prompt for your `sudo` password.

Run `just` with no arguments to list every recipe.

### Option 2: npm only

If you'd rather not install `just`:

```bash
# Install all dependencies (root, server, client)
npm run install:all

# Install the Playwright browser (needed for e2e tests only)
npx playwright install chromium

# Start the app (runs both server and client)
npm start
```

Then open **http://localhost:5173** in your browser.

### Other Commands

| just | npm | Description |
|------|-----|-------------|
| `just setup` | `npm run install:all` | Install all dependencies (`just` also installs Playwright Chromium) |
| `just start` | `npm start` | Run full app (server + client) |
| `just server` | `npm run server` | Run backend only (port 3001) |
| `just client` | `npm run client` | Run frontend only (port 5173) |
| `just test` | `npm test` | Run unit and e2e tests |
| `just test-unit` | `npm run test:unit` | Run unit tests |
| `just test-e2e` | `npm run test:e2e` | Run Playwright e2e tests |

### VSCode/Cursor/Windsurf

Press **F5** to launch the app with debugging enabled. See `.vscode/launch.json` for available configurations.

---

## Session Structure (60 minutes)

### Introduction & Framing

- This is **NOT** a coding competition
- You (probably) will **NOT finish the app** — that's intentional
- Success = *earliest usable value*, not completeness
- Huge Success = earliest usable value + fastest expansion in completeness
- **AI writes ALL code** — you decide what matters

**Elephant Carpaccio principles:**
- Thin slices
- Working software over completeness
- Tool MUST work at every iteration
- Always deliver something demonstrably more useful at each iteration

### Build Time (5 × 8-minute sprints)

**Rules:**
- Start from this base repo (fork for tools like Devin)
- Use any mix of AI & traditional tools
- Follow any methodology: TDD, manual testing, let users test in prod
- You own operations after sprint 1 — any regression reports from CS (facilitator) MUST be addressed over features
- The clock never stops: plan, implement, and demo within each sprint

### Demos & Reflection

Demo **whatever you reached**, no matter how small.

**Reflection questions:**
- What was your *first* valuable slice?
- Where did AI accelerate you most?
- Where did it *not* help?
- What did you *not* build that you normally would?
- How did your workflow differ from your company's accepted norms?
- How comfortable are you that the company keeps using this tool so it can pay you?
- What would your next slice be with 10 more minutes?

---

## What's in This Repo

### Running Skeleton App
- ✅ App boots with single command
- ✅ Single page loads with "Onboarding Dashboard" heading

### Navigation Scaffold
- ✅ Dashboard (shows onboarding queue)
- ✅ Customer Info (create, edit, validate, and save customer details)
- ✅ Data Mapping (CSV repair review, column mapping, export and saved files)
- ✅ Tenant Setup (placeholder)
- ✅ Import (dry run, cross-file checks, import into the tenant, failed-rows report)

### Example Domain Models

```javascript
Customer {
  id, name, industry, region, contactEmail, createdAt
}

Tenant {
  id, customerId, status, plan, createdAt
}

OnboardingStep {
  id, name, status, order
}
```

### Seed Data
- 1 example customer: **Acme Corporation**
- 1 example onboarding state at 0% progress

### Progress Indicator
- ✅ Static checklist showing all steps as pending
- ✅ Progress bar at 0%

### Test Structure
- ✅ Unit tests: `just test-unit` / `npm run test:unit`
- ✅ E2E tests: `just test-e2e` / `npm run test:e2e`

---

## Tech Stack

Intentionally boring and fast:

- **Frontend:** React 18 + Vite
- **Backend:** Express.js
- **Storage:** In-memory only (no database)
- **Auth:** None
- **Styling:** Minimal CSS

---

## The Onboarding Process

> The full workflow involves:
>
> 1. **Collecting customer information** — validate and normalize data
> 2. **Data mapping** — map customer needs to platform configuration
> 3. **Tenant provisioning** — create and configure customer tenant
> 4. **Data import** — import customer data into the platform
>
> The process is complex, but customers want value **as early as possible**.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/customers` | List all customers |
| POST | `/api/customers` | Validate and create a customer; complete Customer Info |
| GET | `/api/customers/:id` | Get customer by ID |
| PUT | `/api/customers/:id` | Validate and update customer details; complete Customer Info |
| GET | `/api/customers/:id/onboarding` | Get onboarding state |
| GET | `/api/onboarding` | Dashboard view (all states + customer info) |
| GET | `/api/tenants/:customerId` | Get tenant by customer ID |
| GET | `/api/sample-data` | List customer sample-data folders (`[{ id, label }]`, sorted by id) |
| GET | `/api/sample-data/:id/profile` | Profile one sample-data folder: suggested customer info, schema style, date format, currency, record counts, normalised clients/contacts and data-quality issues (404 for unknown ids) |
| GET | `/api/mapping/options` | Supported data types, target fields and sample-file catalog |
| GET | `/api/mapping/samples/:sampleId` | Original CSV text for an allowlisted sample file |
| POST | `/api/mapping/preview` | Analyze CSV, propose repairs and preview mapped rows |
| GET | `/api/customers/:id/mappings` | Saved source files and mappings for one customer |
| POST | `/api/customers/:id/mappings` | Revalidate and save a prepared file; complete Data Mapping |
| POST | `/api/customers/:id/import/dry-run` | Check the four saved mappings against each other without importing (409 with `blockers` until Data Mapping is complete and the tenant is active) |
| POST | `/api/customers/:id/import` | Re-run the dry run, then load the records into the tenant (400 if it finds errors); complete Import |
| GET | `/api/customers/:id/import` | Last import result for one customer (404 if none) |
| PUT | `/api/test-support/tenants/:customerId` | Test support only (disabled when `NODE_ENV=production`): set the tenant status `{ status }`; `active` also completes Tenant Setup |

`POST /api/mapping/preview` and `POST /api/customers/:id/mappings` accept `{ csv, datasetType, mapping?, dateFormat?, valueMapping? }`. `valueMapping` is an optional override map `{ [fieldKey]: { [sourceValue]: targetValue } }`; missing entries (or `null` targets) fall back to the suggestions. The preview response includes `valueMappings: [{ field, label, targets, values: [{ source, count, suggested, target }] }]` (schema field order; values by count, then source). A saved mapping includes `valueMapping`, the fully resolved `{ [field]: { [source]: target } }` map.

### Customer Info — first working slice

CS staff can select an existing customer or choose **Add customer**. The form uses the fields in the Customer model: company name, contact email, industry, and region. For this implementation, company name and a valid contact email are required; industry and region are optional. These required-field rules are a workshop implementation choice, not additional business requirements from the exercise.

Saving trims surrounding whitespace, validates on the server, and marks only Customer Info complete (25% for a new onboarding). Later completed steps are preserved when editing. New customers appear on the dashboard; tenant provisioning remains a separate step. Data survives browser refreshes but resets when the backend restarts, as storage is in memory.

For backend changes, use `npm run dev --prefix server` to restart automatically, or restart `npm start` manually. To test a running frontend on another port, use `BASE_URL=http://localhost:5174 npm run test:e2e`. An existing Chromium executable can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

### Data Mapping

Choose a customer and a data type (clients, contacts, chart of accounts, or transactions). Upload CSV, paste its contents, or load one of the 12 repository samples. Analyze the file to review proposed repairs, source-to-target column assignments, date normalization and the first 10 mapped rows. Source files are limited to 500 KB and 5,000 data rows. Client/contact aliases and date parsing reuse the existing profiling modules; strict CSV validation and export extend the shared parser.

Known unquoted name and description fields can be proposed for repair. Every proposal includes the original row, corrected row and reason, and requires acceptance before export or saving. Unknown row-shape errors, missing required values, invalid dates/numbers and duplicate IDs block saving. Source columns excluded from the mapped export require explicit acceptance. IDs retain leading zeros, amounts stay precise decimal strings, and free-text values such as category are preserved.

**Value mapping.** Picklist fields carry their canonical `targets` in `GET /api/mapping/options`: client entity type (Corporation, S-Corporation, LLC, Partnership, Sole Proprietor, Non-Profit) and status (Active, Inactive, Pending); contact status (Active, Inactive); account type (Asset, Liability, Equity, Revenue, Expense), normal balance (Debit, Credit) and status (Active, Inactive); transaction type (Debit, Credit), status (Completed, Pending, Cancelled) and payment method (Wire Transfer, ACH, Check, Credit Card, Cash, Bank Transfer). For every picklist field that is column-mapped, the preview lists each distinct non-blank source value with its row count, a suggested target and the effective target. Suggestions are case- and whitespace-insensitive and follow the tables in [sample-data/README.md](sample-data/README.md), reusing the Customer Info profiling tables for clients and contacts. Workshop decisions: Premier "Limited Company" → Corporation, LLP → LLC, "Direct Costs"/"Overheads"/"Finance Costs" → Expense, account status flags 1/Yes → Active and 0/No → Inactive. Payment methods found in the samples beyond the README table are suggested as: EFT, BACS, Direct Deposit, Direct Debit → ACH; Card Payment, Online Payment → Credit Card; Petty Cash → Cash; Bank, Bank Charge, Fee, Standing Order, Financing, Lease, HP, Journal Entry/JE → Bank Transfer. Any value can be overridden; a value without a valid target blocks export and saving. Preview rows and the mapped CSV contain target values, while the repaired source CSV keeps the originals. Value mapping logic lives in `server/src/mapping/values.js`.

Repaired-source and mapped CSV downloads are separate. Saving revalidates the original input on the server, preserves both source and prepared files, and completes only Data Mapping after Customer Info is complete (normally 50% overall progress). This workshop slice accepts one valid file to complete the step; saving another file of the same data type replaces that customer's earlier file. Tenant provisioning and data import remain separate. Saved files and mappings can be reloaded during the workshop session; a backend restart resets in-memory storage.

The same repair logic is available as a standalone script. It prints a report and exits with status 2 if repairs need acceptance, or 1 if errors cannot be repaired. It writes only to a separate, previously nonexistent output file:

```bash
npm run repair:csv -- input.csv repaired.csv
npm run repair:csv -- input.csv repaired.csv --accept-repairs
```

### Import

Choose a customer to see a readiness checklist: Customer Info saved, Data Mapping with all four data types saved, and an **active** tenant. Each unmet item links to its tab. **Run dry run** checks the saved mapped files together without changing anything. **Import into tenant** is enabled only after a dry run without errors. On reload the tab shows the customer's last import.

The dry run (`POST /api/customers/:id/import/dry-run`) returns `409 { error, blockers: [{ code, message, ... }] }` when Data Mapping is incomplete (`data_mapping_incomplete`, with `missing` data types) or the tenant is missing (`tenant_missing`) or not active (`tenant_not_active`, with `tenantStatus`). Otherwise it returns `{ ready, counts: { accounts, clients, contacts, transactions }, issues: [{ datasetType, row, recordId, field, severity, message }] }`. `row` is the 1-based data row in the mapped file. Errors are: duplicate IDs within a data type, missing required fields, non-numeric amounts (and annual revenue), contacts or transactions referencing a client that is not in the mapped clients, transactions referencing an account that is not in the chart of accounts, and a parent account that does not exist or is the account itself (a blank parent is allowed). A transaction posted to an Inactive account is only a warning. `ready` is `true` when there are no errors.

`POST /api/customers/:id/import` applies the same gate and checks, refuses with 400 when there are errors, and otherwise loads the records into an in-memory store for the tenant in the order accounts, clients, contacts, transactions. Each import replaces the tenant's previous import, so re-importing is idempotent. It returns `{ importId, importedAt, tenantId, counts, issues, onboarding }` and marks only Import complete. Onboarding reaches 100% (the customer is fully set up and we get paid) once all four steps are complete. The ABC sample imports cleanly: 39 accounts, 10 clients, 15 contacts and 25 transactions.

Dry-run and import issues can be downloaded as a CSV failed-rows report (`datasetType,row,recordId,field,severity,message`), generated in the browser. Import logic lives in `server/src/import/`.

Until the Tenant Setup flow can activate tenants, e2e tests use `PUT /api/test-support/tenants/:customerId`. To run e2e tests against a second stack, start the backend with `PORT=3003 npm start --prefix server` and the client with `API_PROXY_TARGET=http://localhost:3003 npx vite --port 5175` (from `client/`), then set `BASE_URL=http://localhost:5175`.

---

## License

MIT — use freely for training and educational purposes.

---

## Sample Data

The `sample-data/` directory contains test data from three fictional accounting customers, each using different data schemas and formats. This data is designed to test the application's ability to map varying schemas and data values to a target system.

See [sample-data/README.md](sample-data/README.md) for detailed documentation of the schema differences between customers.

### Sample Data Overview

| Customer | Schema Style | Date Format |
|----------|--------------|-------------|
| ABC Accounting | Title Case columns | MM/DD/YYYY |
| XYZ Financial Services | camelCase columns | YYYY-MM-DD |
| Premier Bookkeeping | snake_case columns | DD-MM-YYYY |

Each customer folder contains:
- Clients (10-12 records)
- Contacts (15-20 records)
- Chart of Accounts (35-40 entries)
- Transactions (25 records)
