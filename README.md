# Pega + Next.js Headless POC (Option 4: DX API V2 — No ConstellationJS)

This proof-of-concept demonstrates calling Pega's DX API V2 REST endpoints directly
from a Next.js application, without any Pega client libraries (no ConstellationJS,
no PCore, no bootstrap-shell.js, no @pega/auth).

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Next.js App (your code — 100% custom)                  │
│                                                         │
│  Browser                         Server (Route Handler) │
│  ┌──────────────┐               ┌─────────────────────┐ │
│  │ React Pages  │ ──POST──────▶ │ /api/pega           │ │
│  │ DynamicForm  │               │  - Basic Auth header │ │
│  │ Phone Tiles  │ ◀──JSON──────│  - Proxy to Pega     │ │
│  └──────────────┘               └─────────┬───────────┘ │
│                                           │              │
└───────────────────────────────────────────┼──────────────┘
                                            │
                                    REST (HTTP/HTTPS)
                                            │
                                ┌───────────▼───────────┐
                                │  Pega Infinity 25     │
                                │  DX API V2 Endpoints  │
                                │                       │
                                │  POST /cases          │
                                │  GET  /cases/{id}     │
                                │  GET  /assignments/.. │
                                │  PUT  /assignments/.. │
                                └───────────────────────┘
```

## What this POC demonstrates

1. **Case Creation** — POST to `/api/application/v2/cases` with starting fields (phone GUID)
2. **Assignment Processing** — GET assignment → GET action form → PUT submit
3. **Metadata Interpretation** — Parsing `uiResources` into renderable form fields
4. **Dynamic Form Rendering** — Mapping Pega component types to React form elements
5. **eTag Handling** — Tracking and sending `If-Match` headers for optimistic locking
6. **Server-Side Auth** — Basic auth credentials never touch the browser
7. **Stage Progress** — Displaying case stages from the API response

## Prerequisites

- Node.js 18+
- Pega Infinity 25 with MediaCo sample application installed
- OAuth 2.0 Client Registration configured in Pega (or Basic auth enabled on the service package)

## Setup

### 1. Configure Pega Connection

Edit `pega-config.json` in the project root:

```json
{
  "pegaServer": {
    "baseUrl": "https://your-pega-server:port/prweb",
    "appAlias": "MediaCo",
    "apiBasePath": "/api/application/v2",
    "caseType": "DIXL-MediaCo-Work-PurchasePhone"
  },
  "auth": {
    "type": "basic",
    "username": "customer@mediaco",
    "password": "pega"
  }
}
```

**Important:** Update `baseUrl` to point to your Pega Infinity instance.

### 2. Pega Server Configuration

Ensure the following on your Pega server:

- **Service Package** for the application has authentication enabled (Basic or OAuth 2.0)
- **CORS** is configured to allow your Next.js domain (e.g., `http://localhost:3000`)
- The operator (username) has the **PegaRULES:PegaAPI** access role
- The **MediaCo** sample application is installed and working

### 3. Install and Run

```bash
npm install
npm run dev
```

Open http://localhost:3000

### 4. Test the Flow

1. Click "Shop Now" on any phone card
2. A case is created via `POST /api/application/v2/cases`
3. You're redirected to the case processing page
4. The form fields are dynamically rendered from the DX API's `uiResources` metadata
5. Fill in the form and click Submit
6. The submission goes via `PUT /api/application/v2/assignments/{id}/actions/{actionId}`
7. If there are more assignments, the next form loads automatically
8. When complete, you see a confirmation screen

## Project Structure

```
pega-nextjs-headless/
├── pega-config.json              # Pega connection config (edit this!)
├── src/
│   ├── app/
│   │   ├── layout.tsx            # Root layout
│   │   ├── page.tsx              # Home page with phone tiles
│   │   ├── api/pega/route.ts     # Server-side API proxy (auth stays here)
│   │   └── pega-case/
│   │       └── [caseId]/
│   │           └── page.tsx      # Case processing page (assignment lifecycle)
│   ├── components/
│   │   └── DynamicForm.tsx       # Renders form fields from metadata
│   ├── lib/
│   │   ├── pega-api.ts           # Server-side DX API V2 client
│   │   ├── pega-client.ts        # Client-side API wrapper (calls /api/pega)
│   │   └── metadata-interpreter.ts  # Parses uiResources into RenderedField[]
│   └── types/
│       └── pega.ts               # TypeScript types for DX API responses
├── package.json
├── tsconfig.json
└── next.config.js
```

## Key Files Explained

### `src/lib/pega-api.ts` — Server-side DX API client
Makes authenticated REST calls to Pega. Handles Basic auth header construction,
URL building with app alias, and eTag extraction. This file runs on the server only.

### `src/lib/metadata-interpreter.ts` — The ConstellationJS replacement
This is the core file that replaces what ConstellationJS does automatically.
It walks the `uiResources` component tree from DX API responses and maps
Pega component types (TextInput, Dropdown, Date, etc.) to our internal types.

### `src/components/DynamicForm.tsx` — Form renderer
Takes the parsed `RenderedField[]` array and renders actual React form elements.
Each Pega component type maps to a specific input type (text, select, radio, etc.).

### `src/app/pega-case/[caseId]/page.tsx` — Assignment lifecycle
Implements the DX API calling sequence:
1. `GET /cases/{id}` — find open assignments
2. `GET /assignments/{id}` — get available actions
3. `GET /assignments/{id}/actions/{actionId}` — get form metadata
4. `PUT /assignments/{id}/actions/{actionId}` — submit form data
5. Check `nextAssignmentInfo` — loop if more steps

## Limitations of this POC

This is a proof-of-concept. In a production headless implementation, you'd also need:

- **Complete component coverage** — This POC handles ~15 component types. Pega has 40+.
- **Conditional visibility** — `uiResources` includes visibility rules that we don't evaluate yet.
- **Repeating grids / tables** — Complex embedded data pages need recursive rendering.
- **File attachments** — Multipart upload to the attachments endpoint.
- **Data views / autocomplete** — Calling `/data_views/{id}` for dynamic dropdown options.
- **Rich text editing** — Currently falls back to a plain textarea.
- **Error handling** — DX API validation errors need full field-level mapping.
- **Token refresh** — Basic auth doesn't expire, but OAuth tokens do.
- **Multi-case worklist** — Querying and displaying a list of open cases.

## Comparison with Option 2 (SDK + Embedded)

| Aspect                    | This POC (Option 4)              | SDK Embedded (Option 2)         |
|---------------------------|----------------------------------|---------------------------------|
| ConstellationJS           | Not used                         | Required                        |
| SSR support               | Full                             | Client components only          |
| Auth                      | Standard fetch + Bearer header   | @pega/auth + sdkSetAuthHeader   |
| Form rendering            | Custom (metadata interpreter)    | Automatic (PCore + MUI)         |
| Component coverage        | ~15 types (POC)                  | 40+ types (complete)            |
| Bundle size               | Minimal (just React + Tailwind)  | Large (MUI + Pega libs)         |
| Design system freedom     | 100% yours                       | MUI (overridable)               |
| Development effort        | Very High (build interpreter)    | Low (use SDK as-is)             |
