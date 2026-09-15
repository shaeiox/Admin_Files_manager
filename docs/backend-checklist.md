# 🚀 Dimension Files Manager — Node.js Backend Checklist

This document outlines the atomic steps to build a secure, high-performance Node.js backend that acts as a bridge between the Dimension UI and the Linux File System (`/download` directory).

## 🏗️ Phase 1: Project Setup & Core Server
- [ ] Initialize Node.js project (`npm init -y`).
- [ ] Install core dependencies (`express`, `cors`, `dotenv`, `helmet`).
- [ ] Setup standard folder structure (`/src/controllers`, `/src/routes`, `/src/services`, `/src/utils`).
- [ ] Create basic Express server (`server.js`) with global error handling middleware.
- [ ] Configure Environment Variables (`.env`) for the storage root path (e.g., `STORAGE_ROOT=/download`).

## 🛡️ Phase 2: Security & FS Service Layer
- [ ] Create `PathService` to securely resolve and sanitize client paths against `STORAGE_ROOT` (Prevent Directory Traversal attacks).
- [ ] Create `FileSystemService` wrapping Node's `fs/promises` (`stat`, `readdir`, `mkdir`, `rename`, `rm`).
- [ ] Implement a safe `exists` and `isDirectory` check mechanism.

## 💾 Phase 3: Metadata Service (JSON Database)
- [ ] Create `MetadataService` to manage `metadata.json` (stored outside the public download folder).
- [ ] Implement read/write locks or atomic writes to prevent data corruption during concurrent requests.
- [ ] Create methods to get/set stats (downloads count, starred status, activity logs) mapped to file paths.

## 📂 Phase 4: File Browser APIs (Read)
- [ ] Implement `GET /api/fs/tree` (Scan directories up to depth 2 to build the sidebar tree).
- [ ] Implement `GET /api/fs/list` (Read directory contents, merge with Metadata, handle sorting/filtering/pagination).
- [ ] Mount these routes in `/src/routes/fs.routes.js`.

## ✍️ Phase 5: File Mutations APIs (Write)
- [ ] Implement `POST /api/fs/folder` (Create new directory).
- [ ] Implement `PUT /api/fs/rename` (Rename/Move files and update Metadata paths accordingly).
- [ ] Implement `DELETE /api/fs/delete` (Delete files/folders securely).
- [ ] Implement `GET /api/fs/download` (Stream file to client with proper Content-Disposition headers).

## 🚀 Phase 6: Streaming Upload Engine
- [ ] Install streaming multipart parser (e.g., `busboy` or `multer`).
- [ ] Implement `POST /api/fs/upload` to pipe uploaded chunks directly to the Linux disk (Zero-memory-bloat streaming).
- [ ] Handle `overwrite` and `preservePath` logic from the frontend request.
- [ ] Add error handling for aborted requests or network drops during upload.

## 📊 Phase 7: Dashboard & Telemetry APIs
- [ ] Create `GET /api/user/profile` (Return configured admin details).
- [ ] Create `GET /api/storage/quota` (Use Node `fs.statfs` or `diskusage` to get real Linux disk space).
- [ ] Implement `GET /api/dashboard/summary` (Calculate total files, merge activities, calculate chart mock data or read from logs).
- [ ] Implement `GET /api/dashboard/health` (Use Node `os` module to return real CPU, RAM, and Uptime metrics).

## ⚙️ Phase 8: Settings API & Final Polish
- [ ] Implement `GET /api/settings` and `PUT /api/settings` (Read/write from a `config.json`).
- [ ] Implement `POST /api/settings/action` (Handle Danger Zone actions).
- [ ] Serve the Frontend static files (HTML/CSS/JS) via Express static middleware so the app runs on a single port.