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
- ✅ Tenant Setup (pre-filled configuration, simulated provisioning, failure and retry)
- ✅ Import (placeholder)

### Example Domain Models

```javascript
Customer {
  id, name, industry, region, contactEmail, createdAt
}

Tenant {
  id, customerId, status, plan, subdomain, dataRegion, currency,
  dateFormat, adminEmail, failureReason, createdAt, updatedAt, provisionedAt
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
| GET | `/api/customers/:id/tenant/defaults` | Suggested tenant settings from Customer Info (plan, unique subdomain, data region, currency, date format, admin email) |
| GET | `/api/customers/:id/tenant` | The customer's tenant, including `status` (`pending`, `provisioning`, `active`, `failed`); 404 if none |
| POST | `/api/customers/:id/tenant` | Validate settings and start (re-)provisioning; returns 202 `{ tenant, onboarding }`. Completes Tenant Setup when the tenant becomes `active` |

### Customer Info — first working slice

CS staff can select an existing customer or choose **Add customer**. The form uses the fields in the Customer model: company name, contact email, industry, and region. For this implementation, company name and a valid contact email are required; industry and region are optional. These required-field rules are a workshop implementation choice, not additional business requirements from the exercise.

Saving trims surrounding whitespace, validates on the server, and marks only Customer Info complete (25% for a new onboarding). Later completed steps are preserved when editing. New customers appear on the dashboard; tenant provisioning remains a separate step. Data survives browser refreshes but resets when the backend restarts, as storage is in memory.

For backend changes, use `npm run dev --prefix server` to restart automatically, or restart `npm start` manually. To test a running frontend on another port, use `BASE_URL=http://localhost:5174 npm run test:e2e`. An existing Chromium executable can be selected with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

### Data Mapping

Choose a customer and a data type (clients, contacts, chart of accounts, or transactions). Upload CSV, paste its contents, or load one of the 12 repository samples. Analyze the file to review proposed repairs, source-to-target column assignments, date normalization and the first 10 mapped rows. Source files are limited to 500 KB and 5,000 data rows. Client/contact aliases and date parsing reuse the existing profiling modules; strict CSV validation and export extend the shared parser.

Known unquoted name and description fields can be proposed for repair. Every proposal includes the original row, corrected row and reason, and requires acceptance before export or saving. Unknown row-shape errors, missing required values, invalid dates/numbers and duplicate IDs block saving. Source columns excluded from the mapped export require explicit acceptance. IDs retain leading zeros, amounts stay precise decimal strings, and status/category values are preserved.

Repaired-source and mapped CSV downloads are separate. Saving revalidates the original input on the server, preserves both source and prepared files, and completes only Data Mapping after Customer Info is complete (normally 50% overall progress). This workshop slice accepts one valid file to complete the step; saving another file of the same data type replaces that customer's earlier file. Tenant provisioning and data import remain separate. Saved files and mappings can be reloaded during the workshop session; a backend restart resets in-memory storage.

The same repair logic is available as a standalone script. It prints a report and exits with status 2 if repairs need acceptance, or 1 if errors cannot be repaired. It writes only to a separate, previously nonexistent output file:

```bash
npm run repair:csv -- input.csv repaired.csv
npm run repair:csv -- input.csv repaired.csv --accept-repairs
```

### Tenant Setup

Choose a customer whose Customer Info is saved (Data Mapping is not required). The form is pre-filled from Customer Info and every field can be changed:

| Setting | Default |
|---------|---------|
| Plan | `professional` (`starter`, `professional` or `enterprise`) |
| Subdomain | Slug of the company name: lowercase `a-z`, `0-9` and hyphens, 3–40 characters, unique across tenants (`-2`, `-3`… is added when taken) |
| Data region | `EU` when the customer region looks like the UK or Europe, otherwise `US` |
| Currency | `GBP` for the UK, `EUR` for the rest of Europe, otherwise `USD` |
| Date format | `DD/MM/YYYY` for the UK and Europe, otherwise `MM/DD/YYYY` |
| Admin email | The customer's contact email |

**Provision tenant** validates the settings on the server. Reserved subdomains (`admin`, `api`, `www`, `test`, `app`, `mail`, `support`) and subdomains used by another tenant are rejected before provisioning. The customer's existing tenant is reused (Acme's seeded `pending` tenant, for example). The tenant becomes `provisioning`, and the tab checks its status until it finishes about 1.5 seconds later. Set `TENANT_PROVISION_DELAY_MS` to change the delay. An `active` tenant completes only Tenant Setup (50% for a customer with Customer Info and Tenant Setup done); other steps keep their status.

To demo a failure, use a subdomain starting with `fail-`. The tenant becomes `failed`, and the tab shows the reason with a **Retry provisioning** button. Change the settings and retry. An active tenant can be re-provisioned only when a setting changes; Tenant Setup stays complete while it re-provisions. Dashboard cards show each customer's tenant status: No tenant, Pending, Provisioning, Active or Failed.

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
