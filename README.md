# Pega DX API V2 — Next.js Headless POC

A proof-of-concept that drives a complete Pega case lifecycle entirely from a custom Next.js frontend, with **no ConstellationJS, no PCore, no @pega/auth, no bootstrap-shell** — just standard `fetch` calls to Pega's DX API V2 REST endpoints.

> **What problem does this solve?** Pega's standard Constellation SDK requires a heavyweight embedded runtime that constrains your design system, SSR support, and bundle size. This POC demonstrates that you can build a fully dynamic, production-ready headless UI using only the public DX API V2 REST contract.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [How Dynamic Form Rendering Works](#2-how-dynamic-form-rendering-works)
3. [DX API V2 Response Structure](#3-dx-api-v2-response-structure)
4. [Metadata Interpreter Deep Dive](#4-metadata-interpreter-deep-dive)
5. [Case Lifecycle Flow](#5-case-lifecycle-flow)
6. [Technology Stack](#6-technology-stack)
7. [Project Structure](#7-project-structure)
8. [Setup & Configuration](#8-setup--configuration)
9. [Component Type Mapping](#9-component-type-mapping)
10. [Validation & Error Handling](#10-validation--error-handling)
11. [My Cases — Persistence Strategy](#11-my-cases--persistence-strategy)
12. [Limitations & Production Gaps](#12-limitations--production-gaps)
13. [Option Comparison](#13-option-comparison)

---

## 1. Architecture Overview

```
 ┌─────────────────────────────────────────────────────────────────────────┐
 │  BROWSER (React / Next.js Client Components)                            │
 │                                                                         │
 │  ┌─────────────────┐   ┌──────────────────────┐   ┌─────────────────┐  │
 │  │   page.tsx      │   │  pega-case/[id]/      │   │  my-cases/      │  │
 │  │   Home / Shop   │   │  page.tsx             │   │  page.tsx       │  │
 │  │                 │   │  Assignment lifecycle  │   │  Case list      │  │
 │  │  Phone cards    │   │                       │   │  (localStorage) │  │
 │  │  "Shop Now" btn │   │  ┌─────────────────┐  │   └─────────────────┘  │
 │  └────────┬────────┘   │  │  DynamicForm.tsx │  │                        │
 │           │            │  │  Renders fields  │  │                        │
 │           │            │  │  from metadata   │  │                        │
 │           │            │  └─────────────────┘  │                        │
 │           │            └──────────┬─────────────┘                        │
 │           │                       │                                      │
 │           │   POST /api/pega      │   POST /api/pega                     │
 │           └───────────────────────┘                                      │
 └─────────────────────────────┬───────────────────────────────────────────┘
                               │  (all calls via internal proxy)
 ┌─────────────────────────────▼───────────────────────────────────────────┐
 │  SERVER  (Next.js Route Handler — /api/pega/route.ts)                   │
 │                                                                         │
 │  • Reads pega-config.json (credentials never leave the server)          │
 │  • Adds Authorization header (Basic or OAuth Bearer token)              │
 │  • Forwards request to Pega DX API V2                                   │
 │  • Streams response + ETag header back to browser                       │
 │  • Translates 422 Pega validation errors into structured JSON           │
 └─────────────────────────────┬───────────────────────────────────────────┘
                               │  HTTPS REST
 ┌─────────────────────────────▼───────────────────────────────────────────┐
 │  PEGA INFINITY 25  (DX API V2)                                          │
 │                                                                         │
 │  POST   /cases                             Create case                  │
 │  GET    /cases/{caseID}                    Case details + assignments    │
 │  GET    /assignments/{assignmentID}        Assignment details            │
 │  GET    /assignments/{id}/actions/{id}     Form metadata (uiResources)  │
 │  PATCH  /assignments/{id}/actions/{id}     Submit form data             │
 │  GET    /casetypes                         Available case types         │
 └─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. How Dynamic Form Rendering Works

This is the core of the POC. Everything on the form pages — field labels, field types, options, order, validation — comes from Pega at runtime. No form schema is hardcoded in the Next.js app.

### High-Level Flow

```
 Pega DX API Response
 ┌──────────────────────────────────────────────────────────────┐
 │  {                                                           │
 │    data: {                                                   │
 │      caseInfo: { content, stages, assignments, ... }         │
 │      shared: { D_PhoneModelsList: { pxResults: [...] } }     │  ← data page results
 │    },                                                        │
 │    uiResources: {                                            │
 │      root: { type: "reference", config: { name: "..." } }   │  ← entry point
 │      resources: {                                           │
 │        views: { "DeviceOptions": [...] }                     │  ← view definitions
 │        fields: { "KeepNumber": [{ datasource: {...} }] }     │  ← field metadata
 │        datapages: { "D_PhoneModelsList": {...} }             │
 │      },                                                      │
 │      navigation: { steps: [...] }                            │  ← multi-step nav
 │      actionButtons: { main: [...], secondary: [...] }        │
 │    }                                                         │
 │  }                                                           │
 └───────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼
 metadata-interpreter.ts   extractFields(uiResources, caseContent, responseData)
 ┌──────────────────────────────────────────────────────────────┐
 │                                                              │
 │  1. Start at uiResources.root                                │
 │     └─ type: "reference" → look up name in resources.views   │
 │                                                              │
 │  2. Walk component tree recursively                          │
 │     ├─ Layout nodes (View, Region, DefaultForm, Columns...)  │
 │     │   └─ recurse into children                            │
 │     ├─ Reference nodes                                       │
 │     │   └─ resolve from resources.views registry            │
 │     └─ Field nodes (TextInput, RadioButtons, Dropdown, ...)  │
 │         └─ extract: fieldID, label, type, options, value     │
 │                                                              │
 │  3. Datasource resolution                                    │
 │     ├─ @ASSOCIATED  → resources.fields[fieldID].datasource   │
 │     ├─ @DATASOURCE  → data.shared[pageName][pageName].pxResults│
 │     └─ inline records → datasource.records[]                 │
 │                                                              │
 │  4. Return RenderedField[]                                   │
 └───────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼
 DynamicForm.tsx   <DynamicForm fields={fields} onSubmit={...} />
 ┌──────────────────────────────────────────────────────────────┐
 │                                                              │
 │  For each RenderedField:                                     │
 │  ├─ "text" / "email" / "phone" / "url" → <input>            │
 │  ├─ "integer" / "decimal" / "currency" → <input type=text>  │
 │  │   (stores as JS number, not string, to satisfy Pega)      │
 │  ├─ "textarea"                          → <textarea>         │
 │  ├─ "dropdown" / "autocomplete"         → <select>           │
 │  ├─ "checkbox"                          → <input type=check> │
 │  ├─ "radio"                             → radio button list  │
 │  ├─ "card-radio"                        → image cards        │
 │  │   (phone models, storage, payment options)                │
 │  ├─ "date" / "datetime"                 → <input type=date>  │
 │  └─ "display"                           → read-only text     │
 │                                                              │
 │  On Submit → buildContent() → JSON → PATCH /assignments/...  │
 └──────────────────────────────────────────────────────────────┘
```

### What is `uiResources`?

`uiResources` is the UI metadata object that Pega's DX API V2 returns alongside case data. It describes **what to show** (structure, field types, labels, options, order) without containing any business logic. Think of it as a serialised view definition tree.

Key sections:

| Section | What It Contains |
|---|---|
| `uiResources.root` | Entry point — always a `reference` pointing to a named view |
| `uiResources.resources.views` | Map of view name → array of `ViewComponent` nodes (the actual tree) |
| `uiResources.resources.fields` | Field definitions including data types and `@ASSOCIATED` option lists |
| `uiResources.resources.datapages` | Metadata about data pages referenced in the form |
| `uiResources.navigation.steps` | Multi-step nav bar (Device options → Plan and Payment → …) |
| `uiResources.actionButtons` | What buttons to show (Next, Previous, Save for later, Cancel) |
| `data.shared` | Pre-fetched data page results (phone models, payment options, storage sizes) |

### Named View Reference Resolution

Pega views are **not** inline trees. `root` just says `"name": "DeviceOptions"`. The actual tree is in `resources.views["DeviceOptions"]`. The interpreter resolves these lazily:

```
root
└─ reference { name: "DeviceOptions" }
       │
       └─ resources.views["DeviceOptions"][0]   ← resolved here
              └─ View (DefaultForm)
                     └─ Region
                            ├─ reference { name: "DeviceOptions_PhoneModelss" }
                            │       └─ resources.views["DeviceOptions_PhoneModelss"][0]
                            │              └─ View (DataReference)
                            │                     └─ RadioButtons (variant=card)
                            │                            datasource: @DATASOURCE D_PhoneModelsList.pxResults
                            │                            → data.shared.D_PhoneModelsList.D_PhoneModelsList.pxResults
                            └─ reference { name: "DeviceOptions_StorageCapacity" }
                                    └─ ...
```

### Datasource Types

| Datasource String | Resolution Strategy | Example |
|---|---|---|
| Object with `.records[]` | Inline — use as-is | Prompt lists |
| `"@ASSOCIATED .FieldName"` | Look up `resources.fields[fieldID][0].datasource.records` | KeepNumber, TradeIn |
| `"@DATASOURCE D_List.pxResults"` | Read `data.shared.D_List.D_List.pxResults` | Phone models, Storage, Payment |

---

## 3. DX API V2 Response Structure

Every assignment action response has this envelope:

```json
{
  "data": {
    "caseInfo": {
      "ID": "DIXL-MEDIACO-WORK P-18",
      "status": "New",
      "stageLabel": "Information Capture",
      "stages": [ { "ID": "PRIM0", "name": "Create", "visited_status": "completed" }, ... ],
      "assignments": [
        {
          "ID": "ASSIGN-WORKLIST DIXL-MEDIACO-WORK P-18!INFORMATIONCAPTURE_FLOW",
          "name": "Plan and Payment",
          "isMultiStep": "true",
          "actions": [ { "ID": "PlanAndPayment", "name": "Plan and Payment" } ]
        }
      ],
      "content": {
        "KeepNumber": "",
        "TradeIn": "",
        "PaymentOptions": { "pyGUID": "", "PaymentOptionName": "" }
      }
    },
    "shared": {
      "D_PaymentoptionsList": {
        "D_PaymentoptionsList": {
          "pxResults": [
            { "pyGUID": "9db5...", "PaymentOptionName": "Monthly", "TransactionValue": "$18.05/mo", "Tax": "+ tax and fees" },
            { "pyGUID": "e02a...", "PaymentOptionName": "Pay in full", "TransactionValue": "$800.00 one-time payment" }
          ]
        }
      }
    }
  },
  "uiResources": {
    "root": { "type": "reference", "config": { "name": "PlanAndPayment" } },
    "resources": {
      "views": {
        "PlanAndPayment": [ { "type": "View", "config": { "template": "DefaultForm" }, "children": [...] } ],
        "PlanAndPayment_PaymentOptions": [ { "type": "View", "config": { "template": "DataReference" }, "children": [...] } ]
      },
      "fields": {
        "KeepNumber": [ { "datasource": { "records": [ { "key": "Keep my number", "value": "Keep my number" }, ... ] } } ],
        "TradeIn":    [ { "datasource": { "records": [ { "key": "Yes", "value": "Yes" }, ... ] } } ]
      }
    },
    "navigation": {
      "steps": [
        { "ID": "AssignmentSF1", "name": "Device options", "visited_status": "success" },
        { "ID": "AssignmentSF2", "name": "Plan and Payment", "visited_status": "current" },
        { "ID": "AssignmentSF3", "name": "Personal Info", "visited_status": "future" }
      ]
    },
    "actionButtons": {
      "main": [ { "name": "Next", "actionID": "next" } ],
      "secondary": [ { "name": "Previous", "actionID": "back" }, { "name": "Save for later", "actionID": "save" } ]
    }
  }
}
```

---

## 4. Metadata Interpreter Deep Dive

**File:** `src/lib/metadata-interpreter.ts`

This file is the direct replacement for what ConstellationJS does automatically. It contains three exported functions:

### `extractFields(uiResources, caseContent, fullResponseData)`

Walks the `uiResources` component tree and returns a flat `RenderedField[]` array that `DynamicForm` can render directly.

```
Component type         →  Mapped internal type   →  React element
──────────────────────────────────────────────────────────────────
TextInput              →  "text"                 →  <input type="text">
Phone                  →  "phone"                →  <input type="tel">
Email                  →  "email"                →  <input type="email">
Integer                →  "integer"              →  <input> (stores as number)
Decimal / Currency     →  "decimal"              →  <input> (stores as float)
TextArea / RichText    →  "textarea"             →  <textarea>
Boolean / Checkbox     →  "checkbox"             →  <input type="checkbox">
Dropdown / DropDown    →  "dropdown"             →  <select>
AutoComplete           →  "autocomplete"         →  <select>
RadioButtons (plain)   →  "radio"                →  radio button list
RadioButtons (card)    →  "card-radio"           →  card grid with images
Date                   →  "date"                 →  <input type="date">
DateTime               →  "datetime"             →  <input type="datetime-local">
DisplayText            →  "display"              →  <p> (read-only)
View / Region / etc.   →  layout (recurse)       →  (transparent)
reference              →  resolved view          →  (transparent)
```

### `buildContent(formData)`

Converts the flat `{ "PaymentOptions.pyGUID": "abc" }` form state into the nested JSON object Pega expects:

```js
// Input (flat key-value from form state)
{ "PaymentOptions.pyGUID": "9db5...", "KeepNumber": "Keep my number" }

// Output (nested, sent as request body content)
{ "PaymentOptions": { "pyGUID": "9db5..." }, "KeepNumber": "Keep my number" }
```

### `extractValidationErrors(errorResponse)`

Parses Pega's 422 error body into a `Record<fieldID, message>` map for inline field-level display:

```json
// Pega 422 body
{
  "errorDetails": [
    {
      "message": "9234098772127712 is not a valid integer value",
      "erroneousInputOutputFieldInPage": ".PaymentInfo",
      "erroneousInputOutputIdentifier": ".CardNumber"
    }
  ]
}

// Extracted
{ "PaymentInfo.CardNumber": "9234098772127712 is not a valid integer value" }
```

---

## 5. Case Lifecycle Flow

```
 User clicks "Shop Now"
        │
        ▼
 POST /api/pega { action: "createCase", caseTypeID, startingFields }
        │
        ▼ Pega returns caseID + first assignment + actions
        │
 Store caseID in localStorage ──────────────────────────────▶  My Cases page
        │
        ▼
 Navigate to /pega-case/{caseID}?assignmentID=...&actionID=...
        │
        ▼
 ┌─────────────────────────────────────────────────────────────┐
 │  FAST PATH (assignmentID + actionID in query params)        │
 │  GET /assignments/{id}/actions/{actionID}                   │
 │  → returns uiResources + data                               │
 └──────────────────────────────┬──────────────────────────────┘
        │  (if query params missing — e.g., from My Cases)
        ▼
 ┌─────────────────────────────────────────────────────────────┐
 │  FALLBACK PATH                                              │
 │  1. GET /cases/{caseID}                                     │
 │     → find open assignments[]                               │
 │  2. GET /assignments/{assignmentID}                         │
 │     → find available actions[]                              │
 │  3. GET /assignments/{id}/actions/{actionID}                │
 │     → uiResources + data                                    │
 └──────────────────────────────┬──────────────────────────────┘
        │
        ▼
 extractFields(uiResources, content, data)
        │
        ▼
 <DynamicForm fields={...} />   ──── user fills form ────┐
        │                                                  │
        │◀─────────────────────────────────────────────────┘
        ▼
 buildContent(formState)
        │
        ▼
 PATCH /assignments/{id}/actions/{actionID}
   body: { content: { ... } }
   headers: { If-Match: etag }
        │
        ├── 422 → extractValidationErrors → show inline field errors → stay on form
        │
        ├── confirmationNote present → show "Case Completed" screen ✓
        │
        ├── nextAssignmentInfo present
        │     └─ GET /assignments/{nextID}
        │         └─ GET /assignments/{nextID}/actions/{firstActionID}
        │               └─ render next form step  ──────▶ (loop back)
        │
        └── fallback → GET /cases/{caseID} → check for next assignment
```

---

## 6. Technology Stack

| Layer | Technology | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) | SSR, file-based routing, server components, API routes |
| Language | TypeScript | End-to-end type safety for DX API response shapes |
| Styling | Tailwind CSS | Utility-first, zero-runtime, full design system freedom |
| API proxy | Next.js Route Handlers | Keep auth credentials server-side, avoid CORS |
| Auth | Basic or OAuth 2.0 ROPC | Server-side only, token cached in module scope |
| State | React `useState` / `useCallback` | No external state library needed for this scope |
| Case persistence | `localStorage` | Simple client-side store of created case IDs |
| Pega interface | DX API V2 REST | Public contract, no Pega JS libraries required |

**Notable non-dependencies:**
- No `@pega/constellationjs`
- No `@pega/auth`
- No `@pega/dx-api-client`
- No Redux / Zustand / React Query
- No MUI / Ant Design / Chakra

---

## 7. Project Structure

```
pega-nextjs-headless/
│
├── pega-config.json              ← NOT committed (credentials). Copy from example below.
├── pega-config.example.json      ← Commit this with placeholder values
├── next.config.js
├── tsconfig.json
├── package.json
│
└── src/
    ├── app/
    │   ├── layout.tsx                ← Root HTML layout
    │   ├── globals.css               ← Tailwind base styles
    │   │
    │   ├── page.tsx                  ← Home: phone card grid, creates case on click
    │   │
    │   ├── my-cases/
    │   │   └── page.tsx              ← Reads case IDs from localStorage, fetches each
    │   │
    │   ├── pega-case/
    │   │   └── [caseId]/
    │   │       └── page.tsx          ← Core: assignment lifecycle + form rendering
    │   │
    │   └── api/
    │       └── pega/
    │           └── route.ts          ← Server proxy: adds auth, forwards to Pega
    │
    ├── components/
    │   └── DynamicForm.tsx           ← Renders RenderedField[] into React form elements
    │
    ├── lib/
    │   ├── pega-api.ts               ← Server-side: raw fetch to Pega DX API V2
    │   ├── pega-client.ts            ← Client-side: wraps fetch to /api/pega
    │   └── metadata-interpreter.ts  ← Parses uiResources into RenderedField[]
    │
    └── types/
        └── pega.ts                   ← TypeScript interfaces for all DX API shapes
```

### Key file responsibilities

**`src/lib/pega-api.ts`** — Server-side only. Builds authenticated requests to Pega. Handles:
- OAuth 2.0 Resource Owner Password Credentials Grant with module-level token caching
- Basic auth fallback
- App alias URL construction (`/prweb/app/{alias}/api/application/v2/...`)
- ETag extraction from response headers
- 422 error body preservation for upstream handling

**`src/lib/metadata-interpreter.ts`** — The ConstellationJS replacement. Stateless pure functions. Handles:
- Named view reference resolution from `resources.views` registry
- All three datasource types (`@ASSOCIATED`, `@DATASOURCE`, inline records)
- Card-variant RadioButtons with image and extra data fields
- Label resolution (`@FL`/`@L` locale prefix stripping + camelCase splitting)
- Flat `RenderedField[]` output consumed by `DynamicForm`

**`src/components/DynamicForm.tsx`** — Pure presentation. Handles:
- Controlled inputs for all field types
- Integer/decimal fields stored as JS numbers (not strings) to satisfy Pega type validation
- `card-radio` grid layout with selection state and extra data display
- Inline field-level validation error display
- `_form`-level error banner for non-field validation errors

**`src/app/pega-case/[caseId]/page.tsx`** — The assignment orchestrator. Handles:
- Fast path (query param assignmentID + actionID) vs. fallback path (GET /cases → assignments)
- Stage progress bar from `caseInfo.stages`
- Multi-step nav bar from `uiResources.navigation.steps`
- Submit → 422 → inline errors (stays on form)
- Submit → `nextAssignmentInfo` → load next form
- Submit → `confirmationNote` → completion screen

---

## 8. Setup & Configuration

### Prerequisites

- Node.js 18+
- Pega Infinity 25 with the **MediaCo** sample application installed
- Service package with either Basic auth or an OAuth 2.0 client registration

### Step 1 — Clone and install

```bash
git clone https://github.com/Narendar07/pega-dx-api-nextjs-headless.git
cd pega-dx-api-nextjs-headless
npm install
```

### Step 2 — Create `pega-config.json`

`pega-config.json` is excluded from version control. Create it at the project root:

```json
{
  "pegaServer": {
    "baseUrl": "https://your-pega-server/prweb",
    "appAlias": "MediaCo",
    "apiBasePath": "/api/application/v2",
    "caseType": "DIXL-MediaCo-Work-PurchasePhone",
    "tokenEndpoint": "/PRRestService/oauth2/v1/token"
  },
  "auth": {
    "type": "basic",
    "username": "customer@mediaco",
    "password": "rules"
  },
  "phoneModels": [
    { "name": "Oceonix 25",      "guid": "<pyGUID from Pega>", "price": "$9.99/mo",  "retail": "$360",  "save": "Save $180", "level": "Basic"  },
    { "name": "Oceonix 25 Max",  "guid": "<pyGUID from Pega>", "price": "$18.05/mo", "retail": "$650",  "save": "Save $300", "level": "Silver" },
    { "name": "Oceonix 25 Ultra","guid": "<pyGUID from Pega>", "price": "$27.77/mo", "retail": "$1000", "save": "Save $500", "level": "Gold"   }
  ]
}
```

**For OAuth 2.0:**
```json
"auth": {
  "type": "oauth",
  "clientId": "your-client-id",
  "clientSecret": "your-client-secret",
  "username": "customer@mediaco",
  "password": "rules"
}
```

### Step 3 — Pega server requirements

| Requirement | Details |
|---|---|
| Service package auth | Basic auth enabled **or** OAuth 2.0 client registration |
| CORS | Allow `http://localhost:3000` (only needed if calling Pega directly — this POC uses a server proxy so CORS is not required) |
| Operator role | `PegaRULES:PegaAPI` access role on the operator record |
| Application | MediaCo sample app installed and working |

### Step 4 — Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Step 5 — Test the flow

1. The home page loads phone models from `pega-config.json` and shows them as cards
2. Click **Shop Now** on any phone → a Pega case is created via `POST /cases`
3. You are redirected to the case form page at `/pega-case/{caseID}`
4. Each form step is rendered dynamically from the DX API `uiResources` response
5. Complete all steps (Device options → Plan and Payment → Personal Info → Payment Info → Billing address)
6. A confirmation screen appears when the case resolves
7. Previous cases are accessible via **My Cases** in the header

---

## 9. Component Type Mapping

Pega sends a component `type` string in each `ViewComponent` node. This POC maps them as follows:

```
Pega Component Type          Internal Type    React Element
─────────────────────────────────────────────────────────────────────
TextInput                →   "text"        →  <input type="text">
Phone                    →   "phone"       →  <input type="tel">
Email                    →   "email"       →  <input type="email">
URL                      →   "url"         →  <input type="url">
Integer                  →   "integer"     →  <input> (value stored as Number)
Decimal                  →   "decimal"     →  <input> (value stored as Float)
Currency                 →   "currency"    →  <input> (stored as Float)
Percentage               →   "percentage"  →  <input> (stored as Float)
TextArea / RichText      →   "textarea"    →  <textarea rows={4}>
Boolean / Checkbox       →   "checkbox"    →  <input type="checkbox">
Dropdown / DropDown      →   "dropdown"    →  <select>
AutoComplete             →   "autocomplete"→  <select>
RadioButtons (plain)     →   "radio"       →  <input type="radio"> list
RadioButtons (card)      →   "card-radio"  →  card grid (images + metadata)
Date                     →   "date"        →  <input type="date">
DateTime                 →   "datetime"    →  <input type="datetime-local">
DisplayText              →   "display"     →  <p> (read-only)
─────────────────────────────────────────────────────────────────────
View / Region / Columns
/ DefaultForm / FlowContainer
/ FieldGroup / DeferLoad
/ Reference / CaseView      →  layout container (recurse into children, not rendered)
```

> **Integer fields are a subtle gotcha.** Pega's DX API validates numeric fields strictly — sending `"1234"` (string) for an Integer field returns a 422 error. This POC stores numeric field values as JavaScript numbers via `parseInt`/`parseFloat` so they serialise as `1234` (number) in the JSON body.

---

## 10. Validation & Error Handling

### 422 Validation Errors

When Pega rejects a form submission due to validation, it returns HTTP 422 with a body like:

```json
{
  "errorDetails": [
    {
      "message": "9234098772127712 is not a valid integer value",
      "erroneousInputOutputFieldInPage": ".PaymentInfo",
      "erroneousInputOutputIdentifier": ".CardNumber"
    }
  ]
}
```

The error propagation chain:

```
Pega → pega-api.ts (throw with statusCode:422 + validationBody)
     → route.ts    (forward 422 + body as-is)
     → pega-client.ts (throw with validationBody attached)
     → page.tsx handleSubmit (catch → extractValidationErrors → setValidationErrors)
     → DynamicForm (error prop per field → red border + message under field)
```

Field-level errors display inline under the relevant input. Non-field errors appear as a red banner at the top of the form. The form stays mounted (not reset) so the user's input is preserved.

### ETag / Optimistic Locking

Every GET response that includes form data also includes an `etag` response header. This is stored in React state and sent back as `If-Match` on the PATCH submission. If the case was modified between fetch and submit (e.g., concurrent edit), Pega returns 412 and the user must refresh.

---

## 11. My Cases — Persistence Strategy

Pega's DX API V2 `GET /assignments` (worklist) is not available in all server configurations. This POC uses a localStorage workaround:

```
User creates case
    │
    ▼
caseID stored in localStorage["pega_case_ids"]   (max 50, newest first)
    │
My Cases page loads
    │
    ▼
Read IDs from localStorage
    │
    ▼
Promise.all(ids.map(id => GET /cases/{id}?viewType=none))  ← parallel fetches
    │
    ▼
Extract caseInfo.ID, status, stageLabel, createTime from each response
    │
    ▼
Sort by createTime descending, render table
    │
Click a case row → /pega-case/{caseID}  (no query params → fallback path)
```

**Limitation:** Cases created on a different device or browser won't appear. A production app would use `GET /assignments` (worklist) or a backend query.

---

## 12. Limitations & Production Gaps

This is a POC. A production headless implementation would need:

| Gap | Details |
|---|---|
| Component coverage | ~19 types handled. Pega supports 40+. Missing: Attachment, Signature, Map, RichText editor, Grid/Table row editing |
| Conditional visibility | `uiResources` includes visibility conditions. We render all non-read-only fields unconditionally |
| Repeating grids | Embedded list editing (add/remove rows in a table) requires recursive state management |
| File attachments | Multipart `POST /attachments` endpoint, separate file picker UI |
| Data view autocomplete | `GET /data_views/{id}?query=...` for type-ahead search fields |
| Navigation step jumping | The `allow_jump: true` steps have PATCH hrefs to jump to any step — not yet wired |
| Save for later | `actionButtons.secondary` includes a save action — not yet implemented |
| OAuth token refresh | Token is cached module-level. Long-running sessions need proactive refresh on expiry |
| Real worklist | localStorage is not a substitute for `GET /assignments` or a proper backend session |
| Multi-instance / SSR | OAuth token is in module-level memory — one token shared across all users in the same server process (fine for a POC, not for production) |
| Error recovery | Network errors during multi-step submission leave the case in a partial state |

---

## 13. Option Comparison

| Aspect | This POC (Option 4: Headless) | Constellation SDK (Option 2) |
|---|---|---|
| ConstellationJS | Not used | Required |
| SSR / Server Components | Full support | Client components only |
| Design system | 100% yours (Tailwind here) | MUI with Pega theming |
| Bundle size | ~200 KB (React + Tailwind) | 1.5 MB+ (MUI + Pega libs) |
| Authentication | Standard fetch + Bearer | `@pega/auth` + `sdkSetAuthHeader` |
| Form rendering | Custom metadata interpreter | Automatic via PCore + MFC |
| Component coverage | ~19 types (extendable) | 40+ types (built-in) |
| Conditional visibility | Not implemented | Automatic |
| Repeating grids | Not implemented | Automatic |
| Time to first form | High (build the interpreter) | Low (SDK handles it) |
| Maintenance | You own the interpreter | Pega SDK updates |
| CORS requirement | None (server proxy) | Needs CORS configured |
| Credentials in browser | Never | Never (`@pega/auth` handles) |

---

## License

MIT — this is a proof-of-concept intended for learning and exploration.
