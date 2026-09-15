# 🚀 Dimension Files Manager — Linux File-System Migration Checklist

This document defines the path for connecting the frontend to a backend integrated with the Linux file system, using the `/download` directory. In this architecture, `/download` acts as the **Root**, while the backend serves as a **Bridge** between the UI and the operating system.

---

## 🛠️ Architecture Prerequisites

* [ x] **Choose the backend language:** Node.js / Python / Go / PHP, with the ability to read and manage Linux file-system paths.
* [ x] **Define Permissions:** Ensure that the backend has Read/Write access to the Linux `/download` directory and all of its subdirectories (configure `chmod` and `chown` as required).
* [x ] **Decide on Metadata Storage (Auxiliary Database):** Determine whether download statistics, activity logs, and starred files should be stored using SQLite/JSON alongside the files, or whether these features should be removed from the UI.

---

## 📦 Phase 1: Network Communication Layer (`API Bridge`)

* [ x] Create a new `js/api.js` file to centralize `fetch` requests.
* [ x] Implement the core API methods with a focus on sending **paths** instead of IDs (e.g. `GET /api/fs?path=/media`).
* [ x] Handle operating-system-level errors, such as `403 Access Denied` or `404 Not Found` when a file has been deleted directly from the server.
* [ x] Add the `api.js` script to the `<head>` section of all HTML files.

---

## 👤 Phase 2: Sidebar & Operating System Information

* [ ] Retrieve the total disk capacity of the Linux server and the space used by the `/download` directory (equivalent to `df -h` and `du -sh`) through the API, and render the Storage bar in the sidebar.
* [ ] Remove the hardcoded user name and avatar and replace them with admin configuration settings (read from the backend configuration file).

---

## 📂 Phase 3: File Browser — Directory Reading (`js/files.js`)

* [ ] Remove the frontend `makeFiles()` function.
* [ ] Send a request to `/api/fs/list?path=/` to retrieve the direct contents of the `/download` root directory.
* [ ] Extract file metadata from the operating system (`OS Stats` including `size`, `mtime`, and `isDirectory`) and map it to the UI data structure.
* [ ] Implement the Folder Tree by dynamically reading directories inside `/download` at the first and second levels.
* [ ] Implement folder navigation by sending the new path to the API when the user clicks on a folder.

---

## ✍️ Phase 4: Linux File-System Operations (`js/files.js`)

* [ ] **Create Folder:** Send the target path to the API and execute the equivalent of the Linux `mkdir` command.
* [ ] **Rename:** Send the new name and execute the equivalent of `mv old_path new_path`.
* [ ] **Delete:** Move the file to a hidden folder such as `/download/.trash` instead of permanently deleting it, or execute `rm`.
* [ ] Implement **Bulk Actions** by sending an array of file paths to the backend.

---

## 🚀 Phase 5: Direct-to-Disk Upload Engine (`js/uploads.js`)

* [ ] Remove the fake `setInterval` timer from JavaScript.
* [ ] Implement `XMLHttpRequest` with `FormData` containing the destination path (`Destination Path`).
* [ ] The backend should store the received file directly into the specified path under `/download` using chunked writes (`Direct Disk Write`).
* [ ] Connect the `xhr.upload.onprogress` event to the UI Progress Bar.
* [ ] Automatically create missing directories (`Recursive Mkdir`) when an entire dropped folder is uploaded.

---

## 📊 Phase 6: Dashboard & Statistics (Depending on the Auxiliary Database Decision)

* [ ] Create a backend script to scan the entire `/download` directory and calculate the total number of files and total storage usage.
* [ ] **If SQLite is used:** Retrieve activity logs (uploads, folder creation, etc.) from the auxiliary database.
* [ ] **If Web Server Logs are used:** Parse Nginx/Apache logs to generate traffic charts and identify the most downloaded files.
* [ ] Connect **Server Health** status by retrieving system information such as `top`, `free -m`, and `iostat` from the operating system.

---

## ⚙️ Phase 7: Settings

* [ ] Store application settings, such as server port, default theme, and upload size limits, in a `config.json` or `.env` file on the Linux server.
* [ ] Create an API for reading and writing this configuration file from the `settings.html` page.
