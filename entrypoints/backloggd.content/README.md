# Toolkittd — Content Script (`backloggd.content`)

> A WXT content script that adds React UI to [Backloggd](https://backloggd.com). Its current feature exports a signed-in user's game collection as **CSV and JSON**.

---

## Table of Contents

- [Business Logic Overview](#business-logic-overview)
- [Architecture](#architecture)
- [WXT Content Script Specifics](#wxt-content-script-specifics)
- [Technical Stack](#technical-stack)
- [Development Standards](#development-standards)
- [API Layer](#api-layer)

---

## Business Logic Overview

The content script enhances Backloggd pages. Its current feature exports a signed-in user's game collection from **Settings → Data**:

1. **Authentication and injection** — Reads the username from Backloggd's navigation bar and adds the export action only on `/settings/data/`.
2. **Status selection** — The dialog starts from popup-saved defaults and requires at least one status. Its changes affect only the current export.
3. **Collection pages** — `exportCollection` parses the first HTML page to determine pagination, then fetches the remaining pages with at most four concurrent requests. Each page is parsed once into cached plain data, then games are deduplicated in page order.
4. **Game logs** — The same job requests `/log/edit/:gameId` sequentially, with a 100 ms delay to reduce rate limiting. Individual failures are skipped after retries. It uses React Query's imperative cache without mounting per-game observers, and owns the growing result array outside React state.
5. **Downloads** — `useExport` publishes progress counters through `idle → analyzing → exporting → complete` or `error`, and publishes game details only at completion. On success, the dialog downloads **CSV** (first playthrough per game) and **JSON** (full details), with a short delay between files. Empty results or a failed collection page produce an error instead. Unmounting the dialog cancels its requests and stops the queue.

> **Note:** Backloggd's internal endpoints are undocumented and may change. Response types live in [`shared/types/api.ts`](./shared/types/api.ts).

## Architecture

### Directory Structure

```text
📦 backloggd.content/
├── 📜 index.tsx           WXT entrypoint and Shadow DOM mount
├── 📜 App.tsx             React Query and toast providers
├── 📜 style.css           Styles injected into the shadow root
├── 📂 features/export/    Export UI, hooks, API, types, and file utilities
├── 📂 lib/                Axios, PapaParse, and React Query setup
└── 📂 shared/             Content-only UI, providers, types, and helpers
```

## WXT Content Script Specifics

### Entry Point & Lifecycle

WXT discovers this entrypoint through `backloggd.content/index.tsx`. Its `defineContentScript()` declaration matches Backloggd pages; `main()` mounts the UI only on `/settings/data/` when the user is signed in and the Data Management anchor exists. It skips duplicate mounts.

The script runs in the browser's isolated world: it can inspect the page DOM and use extension APIs, but cannot access Backloggd's page-level JavaScript variables. `index.tsx` mounts `<App />`, which owns the React Query and toast providers.

### Shadow DOM & Style Isolation

The UI is injected via WXT's `createShadowRootUi()` helper, which creates a [Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM) boundary.

**Why Shadow DOM?**

- **Style Encapsulation** — Backloggd's CSS cannot leak into the extension UI, and the extension's Tailwind/DaisyUI classes cannot break the host page.
- **DOM Isolation** — The `<toolkittd-ui>` shadow root isolates the component tree from Backloggd's normal page DOM queries. Page JavaScript can still access it explicitly through `shadowRoot`.
- **CSS Strategy** — `style.css` is imported as a raw string (`?inline`) and passed into the Shadow Root. DaisyUI is configured with `root: ':host'` to scope its theme variables to the shadow boundary instead of `:root`.

### Turbo-Aware Navigation Monitoring

Backloggd uses [Turbo](https://turbo.hotwired.dev/) navigation, so the script rechecks injection on `turbo:load`. It removes the listener when the extension context becomes invalid.

## Technical Stack

| Technology                | Purpose                                             | Location                                     |
| ------------------------- | --------------------------------------------------- | -------------------------------------------- |
| **WXT**                   | Content-script registration and Shadow DOM mounting | `index.tsx`                                  |
| **React**                 | Injected component tree and providers               | `App.tsx`, `features/`                       |
| **React Query**           | Imperative request caching and retries              | `lib/react-query.ts`, `features/export/api/` |
| **Axios**                 | Backloggd HTTP client and interceptors              | `lib/axios.ts`                               |
| **PapaParse**             | CSV serialization                                   | `lib/papaparse.ts`                           |
| **react-hot-toast**       | Export notifications                                | `shared/providers/`                          |
| **Tailwind CSS**          | Utility styles and theme tokens                     | `style.css`                                  |
| **DaisyUI**               | UI styles scoped to the shadow host                 | `style.css`                                  |
| **react-i18next**         | UI copy from shared locale resources                | `features/`, `@globalShared/i18n`            |
| **clsx + tailwind-merge** | Conditional and conflict-free class names           | `@globalShared/utils/cn`                     |

## Development Standards

### Path Aliases

`@content/*` addresses content modules; `@globalShared/*` addresses code shared across entrypoints. Both are defined in `tsconfig.json`. Use relative imports for nearby files.

### Import Boundaries

Entrypoints must not import each other, and content features must not import other features. Move genuine cross-entrypoint code to `entrypoints/shared/` and content-only shared code to `backloggd.content/shared/`. This is enforced by ESLint.

### Feature Isolation

Keep each feature's components, hooks, API calls, and utilities under its own `features/` directory. Add shared code only when another feature or entrypoint actually needs it.

## API Layer

`lib/axios.ts` configures the Backloggd client:

- **Base URL:** `https://backloggd.com`.
- **Responses:** An interceptor unwraps `response.data`; callers receive the body, not an `AxiosResponse`.
- **Errors:** Another interceptor normalizes failures to `{ message, status, url }`.
- **Types:** [`shared/types/axios.d.ts`](./shared/types/axios.d.ts) makes `api.get<T>()` return `Promise<T>`, matching the unwrapped response.

```ts
const details = await api.get<GameLogDetailsResponse>(`/log/edit/${gameId}`);
```

`details` is the response body. Feature-specific requests and HTML parsing live in `features/export/api/`.
