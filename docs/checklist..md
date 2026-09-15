# 🚀 Dimension Files Manager — Linux File-System Migration Checklist

This document tracks the step-by-step migration of the Dimension frontend from a "Static Prototype with Mock Data" to an "Enterprise-Grade Production UI" connected to a Node.js backend interfacing directly with the Linux File System (`/download` root).

---

## 🛠️ Architectural Prerequisites
- [x] **Backend Language Selection:** Node.js chosen for its native streaming capabilities (`fs` module) and seamless JSON handling.
- [x] **API Base URL Defined:** Set to `/api` (adjustable in `js/api.js`).
- [x] **Metadata Strategy Decided:** Linux FS provides core stats (size, modified, type). Extended stats (downloads, stars, activity logs) will be stored in a lightweight `metadata.json` or SQLite alongside the files.

---

## 📦 Phase 1: Network Communication Layer (API Bridge)
- [x] Create a dedicated `js/api.js` file for centralized `fetch` requests.
- [x] Implement core REST methods (`GET`, `POST`, `PUT`, `DELETE`).
- [x] Implement a specialized `upload` method using `XMLHttpRequest` to support `onprogress` and `abort()`.
- [x] Implement an Error Interceptor to automatically trigger UI Toasts for network failures.
- [x] Inject `api.js` into the `<head>` of all HTML files.

---

## 👤 Phase 2: Global Data & Sidebar Dynamic Injection
- [x] Remove hardcoded user information (Name, Role, Avatar) from HTML sidebars.
- [x] Remove hardcoded storage quota numbers (e.g., "342 GB of 500 GB").
- [x] Create a `loadGlobalData()` fetcher in `app.js` that calls `/api/user/profile` and `/api/storage/quota`.
- [x] Implement graceful fallbacks so the UI doesn't break if the backend is offline.
- [x] Dynamically render the storage progress bar based on actual Linux disk usage stats.

---

## 📊 Phase 3: Dashboard API Connection (`js/dashboard.js`)
- [x] Remove all static mock arrays (`stats`, `chartData`, `storageBreakdown`, `activities`, `topFiles`, `serverHealth`).
- [x] Fetch aggregate telemetry data from `/api/dashboard/summary` on page load.
- [x] Bind fetched data to the Top Stat Cards (with sparklines).
- [x] Bind fetched data to the Traffic Bar Chart and Storage Donut Chart (SVG).
- [x] Bind fetched data to the Activity Feed and Top Downloads lists.
- [x] Remove the fake `setInterval` randomizer and replace it with a lightweight polling mechanism calling `/api/dashboard/health` for live server telemetry.

---

## 📂 Phase 4: File Browser - Read Operations (`js/files.js`)
- [x] Delete the `makeFiles()` function and all fake file/folder generator logic.
- [x] Fetch the Folder Tree hierarchy from `/api/fs/tree`.
- [x] Fetch directory contents using `/api/fs/list?path=...`.
- [x] Shift Pagination, Sorting, Searching, and Type Filtering to the backend (passed as URL Query Parameters).
- [x] Replace hardcoded IDs with absolute OS paths (e.g., `/media/videos`).
- [x] Dynamically generate the top breadcrumb navigation by splitting the current OS path string.

---

## ✍️ Phase 5: File Browser - Mutations & Actions (`js/files.js`)
- [x] Connect the "New Folder" prompt to `POST /api/fs/folder` (maps to Linux `mkdir`).
- [x] Connect the "Rename" prompt to `PUT /api/fs/rename` (maps to Linux `mv`).
- [x] Connect "Delete" and "Bulk Delete" to `DELETE /api/fs/delete` (maps to Linux `rm -rf` or moving to `.trash`).
- [x] Ensure `loadFiles()` and `loadTree()` are called after successful mutations to keep the UI strictly synced with the server disk.
- [x] Update Context Menu and Row actions to trigger real API handlers.

---

## 🚀 Phase 6: Real XHR Upload Engine (`js/uploads.js`)
- [x] Remove the simulated `setInterval` tick engine.
- [x] Implement `FormData` builder to attach the binary `file` and destination `path`.
- [x] Connect the upload queue to `window.API.upload` (XHR) to stream files to the backend.
- [x] Bind the `onprogress` network event to update the progress bars and percentages accurately.
- [x] Implement a time-delta speed calculation inside the XHR event for accurate MB/s reporting.
- [x] Implement Network Abort (`xhr.abort()`) so "Pause" and "Cancel" buttons physically stop network traffic.
- [x] Enforce the `concurrency` setting dictated by the selected Upload Preset.

---

## ⚙️ Phase 7: Settings & Configuration Integration (Pending)
- [x] Remove hardcoded default values from the `settings.html` inputs.
- [x] Fetch workspace configuration from `/api/settings` on page load and populate inputs.
- [x] Intercept the "Save changes" button click to send a `PUT /api/settings` request.
- [x] Handle Danger Zone actions properly (e.g., calling an endpoint to revoke API keys).