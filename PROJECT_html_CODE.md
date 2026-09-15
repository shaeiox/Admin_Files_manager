# 📦 Project: Admin Files Manager

> **Auto-generated code extraction for AI review and editing**
> 
> Generated on: 2026-09-15 11:58:34
> Total files: 4
> Total lines of code: 2221

---

## 🤖 Instructions for AI

This document contains the **complete source code** of the project.
Each file is clearly marked with:
- Its **full relative path** from the project root
- The **programming language** for syntax highlighting
- A **separator** between files for clarity

When suggesting edits, please reference files by their **full path** shown in the headers.

---

## 📊 Project Statistics

| Language | Files | Lines | Size |
|----------|-------|-------|------|
| HTML | 4 | 2221 | 107.5 KB |

---

## 🗂️ Project Structure

```
📦 Admin Files Manager/
  ├── 📄 settings.html
  ├── 📄 uploads.html
  ├── 📄 files.html
  └── 📄 index.html
```

---

## 📑 Table of Contents

1. [`files.html`](#file-1)
2. [`index.html`](#file-2)
3. [`settings.html`](#file-3)
4. [`uploads.html`](#file-4)

---

## 📝 Source Code Files

---

<a id="file-1"></a>

### 📄 File 1/4: `files.html`

| Property | Value |
|----------|-------|
| **Path** | `files.html` |
| **Language** | HTML |
| **Size** | 15.9 KB |
| **Lines** | 356 |

```html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="description" content="Browse, search, and manage all files in your Dimension file server.">
  <meta name="theme-color" content="#0a0a0a">
  <title>Files · Dimension Files Manager</title>

  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='6' fill='%236b62f2'/%3E%3Cpath d='M12 6 6 9v6l6 3 6-3V9z' fill='none' stroke='%23fff' stroke-width='1.5' stroke-linejoin='round'/%3E%3C/svg%3E">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

  <link rel="stylesheet" href="assets/css/tokens.css">
  <link rel="stylesheet" href="assets/css/base.css">
  <link rel="stylesheet" href="assets/css/themes.css">
  <link rel="stylesheet" href="assets/css/layout.css">
  <link rel="stylesheet" href="assets/css/components.css">
  <link rel="stylesheet" href="assets/css/files.css">
</head>

<body data-page="files">

  <div class="app-shell">

    <!-- ══════════════════════════════════════════
         SIDEBAR
         ══════════════════════════════════════════ -->
    <aside class="sidebar" aria-label="Primary navigation">
      <div class="sidebar-header">
        <a href="index.html" class="brand" aria-label="Dimension home">
          <div class="brand-mark">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M12 3 4 7v10l8 4 8-4V7l-8-4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              <path d="m4 7 8 4 8-4M12 11v10" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="brand-text">
            <span class="brand-name">Dimension</span>
            <span class="brand-sub">Files Manager</span>
          </div>
        </a>
      </div>

      <div class="sidebar-body">
        <div class="nav-group">
          <div class="nav-group-label">Overview</div>
          <a class="nav-item" href="index.html" data-nav="dashboard">
            <span class="nav-icon"><i data-icon="dashboard" data-icon-size="18"></i></span>
            <span class="nav-label">Dashboard</span>
          </a>
          <a class="nav-item" href="files.html" data-nav="files">
            <span class="nav-icon"><i data-icon="folder" data-icon-size="18"></i></span>
            <span class="nav-label">All Files</span>
            <span class="nav-badge is-neutral">24.8K</span>
          </a>
          <a class="nav-item" href="uploads.html" data-nav="uploads">
            <span class="nav-icon"><i data-icon="uploadCloud" data-icon-size="18"></i></span>
            <span class="nav-label">Uploads</span>
            <span class="nav-badge">Live</span>
          </a>
          <a class="nav-item" href="files.html" data-nav="downloads">
            <span class="nav-icon"><i data-icon="download" data-icon-size="18"></i></span>
            <span class="nav-label">Downloads</span>
          </a>
        </div>

        <div class="nav-group">
          <div class="nav-group-label">Library</div>
          <a class="nav-item" href="files.html">
            <span class="nav-icon"><i data-icon="star" data-icon-size="18"></i></span>
            <span class="nav-label">Starred</span>
          </a>
          <a class="nav-item" href="files.html">
            <span class="nav-icon"><i data-icon="users" data-icon-size="18"></i></span>
            <span class="nav-label">Shared</span>
          </a>
          <a class="nav-item" href="files.html">
            <span class="nav-icon"><i data-icon="clock" data-icon-size="18"></i></span>
            <span class="nav-label">Recent</span>
          </a>
          <a class="nav-item" href="files.html">
            <span class="nav-icon"><i data-icon="trash" data-icon-size="18"></i></span>
            <span class="nav-label">Trash</span>
            <span class="nav-badge is-neutral">217</span>
          </a>
        </div>

        <div class="nav-group">
          <div class="nav-group-label">System</div>
          <a class="nav-item" href="#">
            <span class="nav-icon"><i data-icon="activity" data-icon-size="18"></i></span>
            <span class="nav-label">Analytics</span>
          </a>
          <a class="nav-item" href="#">
            <span class="nav-icon"><i data-icon="server" data-icon-size="18"></i></span>
            <span class="nav-label">Server Health</span>
          </a>
          <a class="nav-item" href="settings.html" data-nav="settings">
            <span class="nav-icon"><i data-icon="settings" data-icon-size="18"></i></span>
            <span class="nav-label">Settings</span>
          </a>
        </div>

        <div class="storage-card">
          <div class="storage-head">
            <span class="storage-title">Storage</span>
            <span class="storage-pct">68%</span>
          </div>
          <div class="storage-bar">
            <div class="storage-fill" style="width: 68%"></div>
          </div>
          <div class="storage-meta">342 GB of 500 GB used</div>
        </div>
      </div>

      <div class="sidebar-footer">
        <div class="sidebar-user" role="button" tabindex="0" aria-label="User menu">
          <div class="user-avatar">SC</div>
          <div class="user-info">
            <div class="user-name">Sarah Chen</div>
            <div class="user-role">Administrator</div>
          </div>
          <div class="chev" style="color:var(--text-tertiary)">
            <i data-icon="chevronsUpDown" data-icon-size="14"></i>
          </div>
        </div>
      </div>
    </aside>

    <!-- ══════════════════════════════════════════
         MAIN AREA
         ══════════════════════════════════════════ -->
    <main class="main-area">

      <!-- Topbar -->
      <header class="topbar">
        <div class="topbar-left">
          <button class="mobile-menu-btn" aria-label="Open menu">
            <i data-icon="menu" data-icon-size="18"></i>
          </button>
          <nav class="breadcrumb" id="breadcrumb" aria-label="Breadcrumb">
            <span class="breadcrumb-item">Files</span>
          </nav>
        </div>

        <div class="topbar-center">
          <div class="search-field">
            <i data-icon="search" data-icon-size="16" class="search-icon"></i>
            <input id="globalSearch" class="search-input" type="search" placeholder="Search files, folders, users…" aria-label="Global search">
            <div class="search-kbd">
              <span class="kbd kbd-mod">⌘</span>
              <span class="kbd">K</span>
            </div>
          </div>
        </div>

        <div class="topbar-right">
          <button class="theme-toggle" data-theme-toggle aria-label="Toggle theme" title="Toggle theme">
            <span class="icon-sun"><i data-icon="sun" data-icon-size="12"></i></span>
            <span class="icon-moon"><i data-icon="moon" data-icon-size="12"></i></span>
          </button>
          <button class="btn-icon" data-tip="Notifications" aria-label="Notifications">
            <i data-icon="bell" data-icon-size="16"></i>
            <span class="notif-dot"></span>
          </button>
          <a class="btn btn-primary btn-sm" href="uploads.html">
            <i data-icon="plus" data-icon-size="15"></i>
            <span>Upload</span>
          </a>
        </div>
      </header>

      <!-- Page -->
      <div class="page">

        <!-- Page header -->
        <div class="page-header">
          <div class="page-title-group">
            <span class="page-eyebrow">
              <span class="dot"></span>
              File Browser
            </span>
            <h1 class="page-title">All files</h1>
            <p class="page-subtitle">Browse, organize, and manage every file across your storage tiers with precision.</p>
          </div>

          <div class="page-actions">
            <button class="btn btn-ghost btn-sm" data-quick="newFolder">
              <i data-icon="folderPlus" data-icon-size="15"></i>
              <span>New folder</span>
            </button>
            <a class="btn btn-primary btn-sm" href="uploads.html">
              <i data-icon="upload" data-icon-size="15"></i>
              <span>Upload files</span>
            </a>
          </div>
        </div>

        <!-- Toolbar -->
        <div class="files-toolbar">
          <div class="toolbar-left">
            <div class="search-field toolbar-search">
              <i data-icon="search" data-icon-size="15" class="search-icon"></i>
              <input id="filesSearch" class="search-input" type="search" placeholder="Filter files by name…" aria-label="Filter files">
            </div>
          </div>

          <div class="toolbar-right">
            <div class="btn-group" role="tablist" aria-label="View mode">
              <button class="btn-icon is-active" data-view="list" data-tip="List view" aria-label="List view">
                <i data-icon="list" data-icon-size="15"></i>
              </button>
              <button class="btn-icon" data-view="grid" data-tip="Grid view" aria-label="Grid view">
                <i data-icon="grid" data-icon-size="15"></i>
              </button>
            </div>

            <div class="dropdown">
              <button class="btn btn-ghost btn-sm" data-dropdown="sortDropdown">
                <i data-icon="sort" data-icon-size="14"></i>
                Sort
              </button>
              <div class="dropdown-menu" id="sortDropdown">
                <div class="dropdown-label">Sort by</div>
                <button class="dropdown-item"><i data-icon="fileText" data-icon-size="15"></i> Name</button>
                <button class="dropdown-item"><i data-icon="hardDrive" data-icon-size="15"></i> Size</button>
                <button class="dropdown-item"><i data-icon="calendar" data-icon-size="15"></i> Date modified</button>
                <button class="dropdown-item"><i data-icon="download" data-icon-size="15"></i> Downloads</button>
              </div>
            </div>

            <div class="dropdown">
              <button class="btn-icon is-bordered" data-dropdown="moreDropdown" data-tip="More actions">
                <i data-icon="moreVertical" data-icon-size="16"></i>
              </button>
              <div class="dropdown-menu" id="moreDropdown">
                <div class="dropdown-label">Actions</div>
                <button class="dropdown-item">
                  <i data-icon="download" data-icon-size="15"></i>
                  Export list
                  <span class="shortcut">CSV</span>
                </button>
                <button class="dropdown-item">
                  <i data-icon="refresh" data-icon-size="15"></i>
                  Refresh
                </button>
                <button class="dropdown-item">
                  <i data-icon="scan" data-icon-size="15"></i>
                  Scan for duplicates
                </button>
                <div class="dropdown-divider"></div>
                <button class="dropdown-item">
                  <i data-icon="sliders" data-icon-size="15"></i>
                  Column settings
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Filter chips row -->
        <div class="filter-row" id="filterChips" style="margin-bottom:20px;"></div>

        <!-- Layout: tree + content -->
        <div style="display:grid; grid-template-columns: 240px minmax(0, 1fr); gap: var(--spacing-20); align-items: start;">

          <!-- Folder tree -->
          <aside class="tree-panel" aria-label="Folder tree">
            <div class="tree-head">
              <div class="tree-title">Folders</div>
              <button class="btn-icon btn-icon-sm" data-quick="newFolder" data-tip="New folder">
                <i data-icon="plus" data-icon-size="13"></i>
              </button>
            </div>
            <div class="tree" id="folderTree"></div>
          </aside>

          <!-- Files container (list or grid) -->
          <section id="filesContainer" aria-label="Files"></section>
        </div>
      </div>
    </main>
  </div>

  <!-- ══════════════════════════════════════════
       BULK ACTION BAR
       ══════════════════════════════════════════ -->
  <div class="bulk-bar" id="bulkBar" role="toolbar" aria-label="Bulk actions">
    <div class="bulk-count"><span class="num">0</span> selected</div>
    <div class="divider-v"></div>
    <div class="bulk-actions">
      <button class="btn-icon" id="bulkDownload" data-tip="Download selected">
        <i data-icon="download" data-icon-size="16"></i>
      </button>
      <button class="btn-icon" data-tip="Move to folder">
        <i data-icon="move" data-icon-size="16"></i>
      </button>
      <button class="btn-icon" data-tip="Share">
        <i data-icon="share" data-icon-size="16"></i>
      </button>
      <button class="btn-icon" data-tip="Star">
        <i data-icon="star" data-icon-size="16"></i>
      </button>
      <button class="btn-icon" id="bulkDelete" data-tip="Delete">
        <i data-icon="trash" data-icon-size="16"></i>
      </button>
    </div>
    <div class="divider-v"></div>
    <button class="btn-icon btn-icon-sm" id="bulkClear" data-tip="Clear selection">
      <i data-icon="x" data-icon-size="15"></i>
    </button>
  </div>

  <!-- ══════════════════════════════════════════
       FILE DETAILS DRAWER
       ══════════════════════════════════════════ -->
  <aside class="drawer" id="fileDrawer" aria-label="File details" aria-hidden="true">
    <div class="drawer-header">
      <div class="drawer-title">File details</div>
      <button class="btn-icon btn-icon-sm" id="drawerClose" data-tip="Close" aria-label="Close details">
        <i data-icon="x" data-icon-size="15"></i>
      </button>
    </div>
    <div class="drawer-body"></div>
    <div class="drawer-footer">
      <button class="btn btn-ghost btn-sm">
        <i data-icon="share" data-icon-size="14"></i>
        Share
      </button>
      <button class="btn btn-primary btn-sm" style="flex:1;">
        <i data-icon="download" data-icon-size="14"></i>
        Download
      </button>
    </div>
  </aside>

  <!-- ══════════════════════════════════════════
       DRAG & DROP OVERLAY
       ══════════════════════════════════════════ -->
  <div class="drop-overlay" id="dropOverlay">
    <div class="drop-inner">
      <i data-icon="uploadCloud" data-icon-size="44"></i>
      <div class="drop-title">Drop files to upload</div>
      <div class="drop-desc">Release to add files to your queue</div>
    </div>
  </div>

  <!-- Scripts -->
  <script src="assets/js/app.js"></script>
  <script src="assets/js/theme.js"></script>
  <script src="assets/js/sidebar.js"></script>
  <script src="assets/js/files.js"></script>
</body>
</html>
```

---

<a id="file-2"></a>

### 📄 File 2/4: `index.html`

| Property | Value |
|----------|-------|
| **Path** | `index.html` |
| **Language** | HTML |
| **Size** | 19.3 KB |
| **Lines** | 446 |

```html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="description" content="Dimension — Admin Files Manager. Manage files, folders, uploads, and downloads for your file server.">
  <meta name="theme-color" content="#0a0a0a">
  <title>Dashboard · Dimension Files Manager</title>

  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='6' fill='%236b62f2'/%3E%3Cpath d='M12 6 6 9v6l6 3 6-3V9z' fill='none' stroke='%23fff' stroke-width='1.5' stroke-linejoin='round'/%3E%3C/svg%3E">

  <!-- Preconnect for fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

  <!-- Stylesheets — order matters -->
  <link rel="stylesheet" href="assets/css/tokens.css">
  <link rel="stylesheet" href="assets/css/base.css">
  <link rel="stylesheet" href="assets/css/themes.css">
  <link rel="stylesheet" href="assets/css/layout.css">
  <link rel="stylesheet" href="assets/css/components.css">
  <link rel="stylesheet" href="assets/css/dashboard.css">
</head>

<body data-page="dashboard">

  <div class="app-shell">

    <!-- ══════════════════════════════════════════
         SIDEBAR
         ══════════════════════════════════════════ -->
    <aside class="sidebar" aria-label="Primary navigation">

      <div class="sidebar-header">
        <a href="index.html" class="brand" aria-label="Dimension home">
          <div class="brand-mark">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M12 3 4 7v10l8 4 8-4V7l-8-4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              <path d="m4 7 8 4 8-4M12 11v10" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="brand-text">
            <span class="brand-name">Dimension</span>
            <span class="brand-sub">Files Manager</span>
          </div>
        </a>
      </div>

      <div class="sidebar-body">

        <!-- Overview group -->
        <div class="nav-group">
          <div class="nav-group-label">Overview</div>
          <a class="nav-item" href="index.html" data-nav="dashboard">
            <span class="nav-icon"><i data-icon="dashboard" data-icon-size="18"></i></span>
            <span class="nav-label">Dashboard</span>
          </a>
          <a class="nav-item" href="files.html" data-nav="files">
            <span class="nav-icon"><i data-icon="folder" data-icon-size="18"></i></span>
            <span class="nav-label">All Files</span>
            <span class="nav-badge is-neutral">24.8K</span>
          </a>
          <a class="nav-item" href="uploads.html" data-nav="uploads">
            <span class="nav-icon"><i data-icon="uploadCloud" data-icon-size="18"></i></span>
            <span class="nav-label">Uploads</span>
            <span class="nav-badge">Live</span>
          </a>
          <a class="nav-item" href="files.html" data-nav="downloads">
            <span class="nav-icon"><i data-icon="download" data-icon-size="18"></i></span>
            <span class="nav-label">Downloads</span>
          </a>
        </div>

        <!-- Library group -->
        <div class="nav-group">
          <div class="nav-group-label">Library</div>
          <a class="nav-item" href="files.html">
            <span class="nav-icon"><i data-icon="star" data-icon-size="18"></i></span>
            <span class="nav-label">Starred</span>
          </a>
          <a class="nav-item" href="files.html">
            <span class="nav-icon"><i data-icon="users" data-icon-size="18"></i></span>
            <span class="nav-label">Shared</span>
          </a>
          <a class="nav-item" href="files.html">
            <span class="nav-icon"><i data-icon="clock" data-icon-size="18"></i></span>
            <span class="nav-label">Recent</span>
          </a>
          <a class="nav-item" href="files.html">
            <span class="nav-icon"><i data-icon="trash" data-icon-size="18"></i></span>
            <span class="nav-label">Trash</span>
            <span class="nav-badge is-neutral">217</span>
          </a>
        </div>

        <!-- System group -->
        <div class="nav-group">
          <div class="nav-group-label">System</div>
          <a class="nav-item" href="#">
            <span class="nav-icon"><i data-icon="activity" data-icon-size="18"></i></span>
            <span class="nav-label">Analytics</span>
          </a>
          <a class="nav-item" href="#">
            <span class="nav-icon"><i data-icon="server" data-icon-size="18"></i></span>
            <span class="nav-label">Server Health</span>
          </a>
          <a class="nav-item" href="settings.html" data-nav="settings">
            <span class="nav-icon"><i data-icon="settings" data-icon-size="18"></i></span>
            <span class="nav-label">Settings</span>
          </a>
        </div>

        <!-- Storage card -->
        <div class="storage-card" role="group" aria-label="Storage usage">
          <div class="storage-head">
            <span class="storage-title">Storage</span>
            <span class="storage-pct">68%</span>
          </div>
          <div class="storage-bar">
            <div class="storage-fill" style="width: 68%"></div>
          </div>
          <div class="storage-meta">342 GB of 500 GB used</div>
        </div>
      </div>

      <!-- Sidebar footer -->
      <div class="sidebar-footer">
        <div class="sidebar-user" role="button" tabindex="0" aria-label="User menu">
          <div class="user-avatar">SC</div>
          <div class="user-info">
            <div class="user-name">Sarah Chen</div>
            <div class="user-role">Administrator</div>
          </div>
          <div class="chev" style="color:var(--text-tertiary)">
            <i data-icon="chevronsUpDown" data-icon-size="14"></i>
          </div>
        </div>
      </div>
    </aside>

    <!-- ══════════════════════════════════════════
         MAIN AREA
         ══════════════════════════════════════════ -->
    <main class="main-area">

      <!-- Topbar -->
      <header class="topbar">
        <div class="topbar-left">
          <button class="mobile-menu-btn" aria-label="Open menu">
            <i data-icon="menu" data-icon-size="18"></i>
          </button>
          <nav class="breadcrumb" aria-label="Breadcrumb">
            <span class="breadcrumb-item">Dimension</span>
            <span class="breadcrumb-sep"><i data-icon="chevronRight" data-icon-size="14"></i></span>
            <span class="breadcrumb-item is-current">Dashboard</span>
          </nav>
        </div>

        <div class="topbar-center">
          <div class="search-field">
            <i data-icon="search" data-icon-size="16" class="search-icon"></i>
            <input id="globalSearch" class="search-input" type="search" placeholder="Search files, folders, users…" aria-label="Global search">
            <div class="search-kbd">
              <span class="kbd kbd-mod">⌘</span>
              <span class="kbd">K</span>
            </div>
          </div>
        </div>

        <div class="topbar-right">
          <button class="btn-icon" id="refreshDashboard" data-tip="Refresh" aria-label="Refresh dashboard">
            <i data-icon="refresh" data-icon-size="16"></i>
          </button>

          <button class="theme-toggle" data-theme-toggle aria-label="Toggle theme" title="Toggle theme">
            <span class="icon-sun"><i data-icon="sun" data-icon-size="12"></i></span>
            <span class="icon-moon"><i data-icon="moon" data-icon-size="12"></i></span>
          </button>

          <div class="dropdown">
            <button class="btn-icon" data-dropdown="notifDropdown" aria-label="Notifications">
              <i data-icon="bell" data-icon-size="16"></i>
              <span class="notif-dot"></span>
            </button>
            <div class="dropdown-menu" id="notifDropdown" style="min-width:280px;">
              <div class="dropdown-label">Notifications · 3 new</div>
              <button class="dropdown-item">
                <i data-icon="upload" data-icon-size="15"></i>
                <div style="flex:1;text-align:left;">
                  <div style="color:var(--text-primary);font-size:13px;">Upload complete</div>
                  <div style="font-size:11px;color:var(--text-tertiary);">brand-kit-v2.zip · 2m ago</div>
                </div>
              </button>
              <button class="dropdown-item">
                <i data-icon="users" data-icon-size="15"></i>
                <div style="flex:1;text-align:left;">
                  <div style="color:var(--text-primary);font-size:13px;">New shared folder</div>
                  <div style="font-size:11px;color:var(--text-tertiary);">Marcus shared "Design 2025"</div>
                </div>
              </button>
              <button class="dropdown-item">
                <i data-icon="alert" data-icon-size="15"></i>
                <div style="flex:1;text-align:left;">
                  <div style="color:var(--text-primary);font-size:13px;">Storage 68% full</div>
                  <div style="font-size:11px;color:var(--text-tertiary);">Consider archiving old files</div>
                </div>
              </button>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item">
                <i data-icon="inbox" data-icon-size="15"></i>
                <span>View all notifications</span>
              </button>
            </div>
          </div>

          <a class="btn btn-primary btn-sm" href="uploads.html">
            <i data-icon="plus" data-icon-size="15"></i>
            <span>Upload</span>
          </a>
        </div>
      </header>

      <!-- Page -->
      <div class="page">

        <!-- Status banner -->
        <div style="display:flex;justify-content:center;margin-bottom:24px;">
          <a href="#" class="status-banner">
            <span class="sparkle"><i data-icon="sparkle" data-icon-size="14"></i></span>
            <span>Storage optimization saved 12.4 GB this week</span>
            <span class="arrow"><i data-icon="arrowRight" data-icon-size="14"></i></span>
          </a>
        </div>

        <!-- HERO PANEL -->
        <section class="hero-panel" aria-label="Welcome">
          <div class="hero-inner">
            <div class="hero-content">
              <span class="hero-eyebrow">
                <i data-icon="sparkle" data-icon-size="13"></i>
                Admin control center
              </span>
              <h1 class="hero-title">
                Command your file<br>infrastructure <span class="soft">at a glance.</span>
              </h1>
              <p class="hero-desc">
                Every file, every folder, every download — orchestrated from one calm, focused workspace built for admins who value clarity over chaos.
              </p>

              <div class="hero-bullets">
                <div class="hero-bullet">
                  <span class="bullet-icon"><i data-icon="check" data-icon-size="12"></i></span>
                  Real-time upload & download telemetry
                </div>
                <div class="hero-bullet">
                  <span class="bullet-icon"><i data-icon="check" data-icon-size="12"></i></span>
                  Multi-tier storage with instant tiering
                </div>
                <div class="hero-bullet">
                  <span class="bullet-icon"><i data-icon="check" data-icon-size="12"></i></span>
                  Granular access control & audit trails
                </div>
              </div>

              <div class="hero-actions">
                <a class="btn-hero" href="uploads.html">
                  <i data-icon="uploadCloud" data-icon-size="16"></i>
                  Upload files
                </a>
                <a class="btn-hero-ghost" href="files.html">
                  Browse files
                  <i data-icon="arrowRight" data-icon-size="16"></i>
                </a>
              </div>
            </div>

            <!-- Device mockup -->
            <div class="hero-mockup" aria-hidden="true">
              <div class="mockup-bar">
                <div class="mockup-dot"></div>
                <div class="mockup-dot"></div>
                <div class="mockup-dot"></div>
                <div class="mockup-path">dimension.io / files / releases</div>
              </div>
              <div class="mockup-body">
                <div class="mockup-row">
                  <div class="mockup-ico"><i data-icon="folder" data-icon-size="12"></i></div>
                  <div class="mockup-line w-60"></div>
                  <div class="mockup-meta"></div>
                </div>
                <div class="mockup-row">
                  <div class="mockup-ico"><i data-icon="video" data-icon-size="12"></i></div>
                  <div class="mockup-line w-75"></div>
                  <div class="mockup-meta"></div>
                </div>
                <div class="mockup-row">
                  <div class="mockup-ico"><i data-icon="fileText" data-icon-size="12"></i></div>
                  <div class="mockup-line w-50"></div>
                  <div class="mockup-meta"></div>
                </div>
                <div class="mockup-row">
                  <div class="mockup-ico"><i data-icon="image" data-icon-size="12"></i></div>
                  <div class="mockup-line w-40"></div>
                  <div class="mockup-meta"></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- STAT CARDS -->
        <section class="section" aria-label="Key metrics">
          <div class="section-header">
            <div>
              <h2 class="section-title">Overview</h2>
              <div class="section-desc">Last 30 days · compared to prior period</div>
            </div>
            <div class="segmented" role="tablist">
              <button class="is-active">30d</button>
              <button>7d</button>
              <button>24h</button>
            </div>
          </div>
          <div class="grid-stats" id="statsGrid"></div>
        </section>

        <!-- SPLIT: chart + storage donut -->
        <section class="section">
          <div class="grid-sidebar-split">

            <!-- Traffic chart -->
            <div class="card chart-panel card-accent">
              <div class="chart-head">
                <div>
                  <h3 class="card-title">Traffic activity</h3>
                  <div class="card-desc">Uploads, downloads & shares over the last 14 days</div>
                </div>
                <div class="chart-legend" id="chartLegend"></div>
              </div>
              <div class="chart-area">
                <div class="chart-canvas-wrap" id="trafficChart"></div>
              </div>
            </div>

            <!-- Storage donut -->
            <div class="card card-accent">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
                <div>
                  <h3 class="card-title">Storage breakdown</h3>
                  <div class="card-desc">By file type</div>
                </div>
                <div class="badge badge-accent">
                  <span class="live-dot"></span> Live
                </div>
              </div>
              <div id="storageDonut"></div>
            </div>
          </div>
        </section>

        <!-- QUICK ACTIONS -->
        <section class="section">
          <div class="section-header">
            <div>
              <h2 class="section-title">Quick actions</h2>
              <div class="section-desc">Shortcuts to the most common admin tasks</div>
            </div>
          </div>
          <div class="quick-grid" id="quickActions"></div>
        </section>

        <!-- SPLIT: activity + top files -->
        <section class="section">
          <div class="grid-sidebar-split">

            <!-- Activity feed -->
            <div class="card chart-panel">
              <div class="chart-head">
                <div>
                  <h3 class="card-title">Recent activity</h3>
                  <div class="card-desc">Live feed of file operations across your workspace</div>
                </div>
                <button class="btn btn-subtle btn-sm">
                  <i data-icon="history" data-icon-size="14"></i>
                  View all
                </button>
              </div>
              <div class="activity-list" id="activityFeed"></div>
            </div>

            <!-- Top files -->
            <div class="card chart-panel">
              <div class="chart-head">
                <div>
                  <h3 class="card-title">Top downloads</h3>
                  <div class="card-desc">Most requested files</div>
                </div>
              </div>
              <div class="rank-list" id="topFiles"></div>
            </div>
          </div>
        </section>

        <!-- ACCENT DIVIDER -->
        <div class="accent-divider"></div>

        <!-- SPLIT: capabilities + server health -->
        <section class="section">
          <div class="grid-sidebar-split">

            <!-- Numbered capabilities list -->
            <div class="card">
              <div style="margin-bottom:24px;">
                <h3 class="section-title">What Dimension handles for you</h3>
                <p style="color:var(--text-secondary);font-size:15px;margin-top:8px;max-width:52ch;">
                  A calm workspace built on top of a serious infrastructure. Focus on managing files — we handle the rest.
                </p>
              </div>
              <div class="numbered-list" id="capabilities"></div>
            </div>

            <!-- Server health -->
            <div class="card card-accent">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
                <div>
                  <h3 class="card-title">Server health</h3>
                  <div class="card-desc">All systems operational</div>
                </div>
                <div class="badge badge-success badge-dot">Healthy</div>
              </div>
              <div class="health-list" id="serverHealth"></div>
            </div>
          </div>
        </section>

      </div>
    </main>
  </div>

  <!-- Scripts — order matters -->
  <script src="assets/js/app.js"></script>
  <script src="assets/js/theme.js"></script>
  <script src="assets/js/sidebar.js"></script>
  <script src="assets/js/dashboard.js"></script>
</body>
</html>
```

---

<a id="file-3"></a>

### 📄 File 3/4: `settings.html`

| Property | Value |
|----------|-------|
| **Path** | `settings.html` |
| **Language** | HTML |
| **Size** | 55.1 KB |
| **Lines** | 1218 |

```html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="description" content="Manage your Dimension Files Manager preferences, storage, API keys, integrations, and appearance.">
  <meta name="theme-color" content="#0a0a0a">
  <title>Settings · Dimension Files Manager</title>

  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='6' fill='%236b62f2'/%3E%3Cpath d='M12 6 6 9v6l6 3 6-3V9z' fill='none' stroke='%23fff' stroke-width='1.5' stroke-linejoin='round'/%3E%3C/svg%3E">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

  <link rel="stylesheet" href="assets/css/tokens.css">
  <link rel="stylesheet" href="assets/css/base.css">
  <link rel="stylesheet" href="assets/css/themes.css">
  <link rel="stylesheet" href="assets/css/layout.css">
  <link rel="stylesheet" href="assets/css/components.css">
  <link rel="stylesheet" href="assets/css/settings.css">
</head>

<body data-page="settings">

  <div class="app-shell">

    <!-- ══════════════════════════════════════════
         SIDEBAR
         ══════════════════════════════════════════ -->
    <aside class="sidebar" aria-label="Primary navigation">
      <div class="sidebar-header">
        <a href="index.html" class="brand" aria-label="Dimension home">
          <div class="brand-mark">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M12 3 4 7v10l8 4 8-4V7l-8-4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              <path d="m4 7 8 4 8-4M12 11v10" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="brand-text">
            <span class="brand-name">Dimension</span>
            <span class="brand-sub">Files Manager</span>
          </div>
        </a>
      </div>

      <div class="sidebar-body">
        <div class="nav-group">
          <div class="nav-group-label">Overview</div>
          <a class="nav-item" href="index.html" data-nav="dashboard">
            <span class="nav-icon"><i data-icon="dashboard" data-icon-size="18"></i></span>
            <span class="nav-label">Dashboard</span>
          </a>
          <a class="nav-item" href="files.html" data-nav="files">
            <span class="nav-icon"><i data-icon="folder" data-icon-size="18"></i></span>
            <span class="nav-label">All Files</span>
            <span class="nav-badge is-neutral">24.8K</span>
          </a>
          <a class="nav-item" href="uploads.html" data-nav="uploads">
            <span class="nav-icon"><i data-icon="uploadCloud" data-icon-size="18"></i></span>
            <span class="nav-label">Uploads</span>
            <span class="nav-badge">Live</span>
          </a>
          <a class="nav-item" href="files.html" data-nav="downloads">
            <span class="nav-icon"><i data-icon="download" data-icon-size="18"></i></span>
            <span class="nav-label">Downloads</span>
          </a>
        </div>

        <div class="nav-group">
          <div class="nav-group-label">Library</div>
          <a class="nav-item" href="files.html">
            <span class="nav-icon"><i data-icon="star" data-icon-size="18"></i></span>
            <span class="nav-label">Starred</span>
          </a>
          <a class="nav-item" href="files.html">
            <span class="nav-icon"><i data-icon="users" data-icon-size="18"></i></span>
            <span class="nav-label">Shared</span>
          </a>
          <a class="nav-item" href="files.html">
            <span class="nav-icon"><i data-icon="clock" data-icon-size="18"></i></span>
            <span class="nav-label">Recent</span>
          </a>
          <a class="nav-item" href="files.html">
            <span class="nav-icon"><i data-icon="trash" data-icon-size="18"></i></span>
            <span class="nav-label">Trash</span>
            <span class="nav-badge is-neutral">217</span>
          </a>
        </div>

        <div class="nav-group">
          <div class="nav-group-label">System</div>
          <a class="nav-item" href="#">
            <span class="nav-icon"><i data-icon="activity" data-icon-size="18"></i></span>
            <span class="nav-label">Analytics</span>
          </a>
          <a class="nav-item" href="#">
            <span class="nav-icon"><i data-icon="server" data-icon-size="18"></i></span>
            <span class="nav-label">Server Health</span>
          </a>
          <a class="nav-item" href="settings.html" data-nav="settings">
            <span class="nav-icon"><i data-icon="settings" data-icon-size="18"></i></span>
            <span class="nav-label">Settings</span>
          </a>
        </div>

        <div class="storage-card">
          <div class="storage-head">
            <span class="storage-title">Storage</span>
            <span class="storage-pct">68%</span>
          </div>
          <div class="storage-bar">
            <div class="storage-fill" style="width: 68%"></div>
          </div>
          <div class="storage-meta">342 GB of 500 GB used</div>
        </div>
      </div>

      <div class="sidebar-footer">
        <div class="sidebar-user" role="button" tabindex="0" aria-label="User menu">
          <div class="user-avatar">SC</div>
          <div class="user-info">
            <div class="user-name">Sarah Chen</div>
            <div class="user-role">Administrator</div>
          </div>
          <div class="chev" style="color:var(--text-tertiary)">
            <i data-icon="chevronsUpDown" data-icon-size="14"></i>
          </div>
        </div>
      </div>
    </aside>

    <!-- ══════════════════════════════════════════
         MAIN AREA
         ══════════════════════════════════════════ -->
    <main class="main-area">

      <!-- Topbar -->
      <header class="topbar">
        <div class="topbar-left">
          <button class="mobile-menu-btn" aria-label="Open menu">
            <i data-icon="menu" data-icon-size="18"></i>
          </button>
          <nav class="breadcrumb" aria-label="Breadcrumb">
            <span class="breadcrumb-item">Dimension</span>
            <span class="breadcrumb-sep"><i data-icon="chevronRight" data-icon-size="14"></i></span>
            <span class="breadcrumb-item is-current">Settings</span>
          </nav>
        </div>

        <div class="topbar-center">
          <div class="search-field">
            <i data-icon="search" data-icon-size="16" class="search-icon"></i>
            <input id="globalSearch" class="search-input" type="search" placeholder="Search settings…" aria-label="Search">
            <div class="search-kbd">
              <span class="kbd kbd-mod">⌘</span>
              <span class="kbd">K</span>
            </div>
          </div>
        </div>

        <div class="topbar-right">
          <button class="theme-toggle" data-theme-toggle aria-label="Toggle theme" title="Toggle theme">
            <span class="icon-sun"><i data-icon="sun" data-icon-size="12"></i></span>
            <span class="icon-moon"><i data-icon="moon" data-icon-size="12"></i></span>
          </button>
          <button class="btn-icon" data-tip="Notifications" aria-label="Notifications">
            <i data-icon="bell" data-icon-size="16"></i>
            <span class="notif-dot"></span>
          </button>
          <a class="btn btn-primary btn-sm" href="uploads.html">
            <i data-icon="plus" data-icon-size="15"></i>
            <span>Upload</span>
          </a>
        </div>
      </header>

      <!-- Page -->
      <div class="page">

        <!-- Page header -->
        <div class="page-header">
          <div class="page-title-group">
            <span class="page-eyebrow">
              <span class="dot"></span>
              Preferences
            </span>
            <h1 class="page-title">Settings</h1>
            <p class="page-subtitle">Fine-tune your workspace — appearance, storage, security, and integrations. Changes apply instantly.</p>
          </div>
        </div>

        <!-- Settings layout -->
        <div class="settings-layout">

          <!-- Side navigation -->
          <nav class="settings-nav" aria-label="Settings sections">
            <div class="settings-nav-label">Workspace</div>
            <button class="settings-nav-item is-active" data-pane="general">
              <i data-icon="sliders" data-icon-size="16"></i>
              General
            </button>
            <button class="settings-nav-item" data-pane="appearance">
              <i data-icon="sun" data-icon-size="16"></i>
              Appearance
            </button>
            <button class="settings-nav-item" data-pane="storage">
              <i data-icon="hardDrive" data-icon-size="16"></i>
              Storage
            </button>

            <div class="settings-nav-label" style="margin-top:12px;">Access</div>
            <button class="settings-nav-item" data-pane="security">
              <i data-icon="shield" data-icon-size="16"></i>
              Security
            </button>
            <button class="settings-nav-item" data-pane="api">
              <i data-icon="key" data-icon-size="16"></i>
              API Keys
            </button>
            <button class="settings-nav-item" data-pane="integrations">
              <i data-icon="package" data-icon-size="16"></i>
              Integrations
            </button>

            <div class="settings-nav-label" style="margin-top:12px;">Account</div>
            <button class="settings-nav-item" data-pane="notifications">
              <i data-icon="bell" data-icon-size="16"></i>
              Notifications
            </button>
            <button class="settings-nav-item" data-pane="danger">
              <i data-icon="alert" data-icon-size="16"></i>
              Danger Zone
            </button>
          </nav>

          <!-- Content -->
          <div class="settings-content">

            <!-- ══════════════════════
                 PANE: GENERAL
                 ══════════════════════ -->
            <div class="settings-pane is-active" data-pane-content="general">

              <div class="settings-group">
                <div class="sg-head">
                  <div class="sg-title">
                    <i data-icon="user" data-icon-size="18"></i>
                    Workspace profile
                  </div>
                  <div class="sg-desc">Public information about your Dimension workspace.</div>
                </div>
                <div class="sg-body">
                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Workspace name</div>
                      <div class="setting-hint">Shown in the sidebar and shared file links.</div>
                    </div>
                    <div class="setting-control">
                      <input class="input" type="text" value="Dimension HQ">
                    </div>
                  </div>

                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Workspace URL</div>
                      <div class="setting-hint">The base URL for all shared download links.</div>
                    </div>
                    <div class="setting-control">
                      <input class="input" type="text" value="dl.dimension.io">
                    </div>
                  </div>

                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Default language</div>
                      <div class="setting-hint">Interface language for all admins.</div>
                    </div>
                    <div class="setting-control">
                      <select class="select">
                        <option>English (US)</option>
                        <option>English (UK)</option>
                        <option>Français</option>
                        <option>Deutsch</option>
                        <option>日本語</option>
                        <option>Português (BR)</option>
                      </select>
                    </div>
                  </div>

                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Time zone</div>
                      <div class="setting-hint">All timestamps display in this zone.</div>
                    </div>
                    <div class="setting-control">
                      <select class="select">
                        <option>UTC</option>
                        <option>America/New_York</option>
                        <option>America/Los_Angeles</option>
                        <option>Europe/London</option>
                        <option>Europe/Berlin</option>
                        <option>Asia/Tokyo</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div class="settings-group">
                <div class="sg-head">
                  <div class="sg-title">
                    <i data-icon="folder" data-icon-size="18"></i>
                    Default folder behavior
                  </div>
                  <div class="sg-desc">Rules that apply to newly uploaded files.</div>
                </div>
                <div class="sg-body">
                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Default upload folder</div>
                      <div class="setting-hint">Where files land when no destination is set.</div>
                    </div>
                    <div class="setting-control">
                      <input class="input" type="text" value="/inbox">
                    </div>
                  </div>

                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Auto-organize by type</div>
                      <div class="setting-hint">Sort uploads into subfolders based on file type (images/, videos/, etc.).</div>
                    </div>
                    <div class="setting-control">
                      <label class="switch">
                        <input type="checkbox" checked>
                        <span class="track"></span>
                      </label>
                    </div>
                  </div>

                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Auto-generate thumbnails</div>
                      <div class="setting-hint">Create previews for images and videos on upload.</div>
                    </div>
                    <div class="setting-control">
                      <label class="switch">
                        <input type="checkbox" checked>
                        <span class="track"></span>
                      </label>
                    </div>
                  </div>

                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Deduplication</div>
                      <div class="setting-hint">Detect identical files by hash and link instead of storing duplicates.</div>
                    </div>
                    <div class="setting-control">
                      <label class="switch">
                        <input type="checkbox" checked>
                        <span class="track"></span>
                      </label>
                    </div>
                  </div>
                </div>
                <div class="sg-footer">
                  <div class="sg-footer-note">Changes to organization rules apply to future uploads only.</div>
                </div>
              </div>
            </div>

            <!-- ══════════════════════
                 PANE: APPEARANCE
                 ══════════════════════ -->
            <div class="settings-pane" data-pane-content="appearance">

              <div class="settings-group">
                <div class="sg-head">
                  <div class="sg-title">
                    <i data-icon="monitor" data-icon-size="18"></i>
                    Theme
                  </div>
                  <div class="sg-desc">Choose how Dimension looks on this device.</div>
                </div>

                <div class="theme-picker">
                  <button class="theme-option" data-theme-value="dark">
                    <div class="theme-preview dark">
                      <div class="tp-side">
                        <div class="tp-line accent" style="width:80%"></div>
                        <div class="tp-line" style="width:60%"></div>
                        <div class="tp-line" style="width:70%"></div>
                      </div>
                      <div class="tp-main">
                        <div class="tp-line" style="width:50%"></div>
                        <div class="tp-block"></div>
                      </div>
                    </div>
                    <div>
                      <div class="theme-option-name">Dusk (Dark)</div>
                      <div class="theme-option-desc">Signature look · low-glare</div>
                    </div>
                  </button>

                  <button class="theme-option" data-theme-value="light">
                    <div class="theme-preview light">
                      <div class="tp-side">
                        <div class="tp-line accent" style="width:80%"></div>
                        <div class="tp-line" style="width:60%"></div>
                        <div class="tp-line" style="width:70%"></div>
                      </div>
                      <div class="tp-main">
                        <div class="tp-line" style="width:50%"></div>
                        <div class="tp-block"></div>
                      </div>
                    </div>
                    <div>
                      <div class="theme-option-name">Dawn (Light)</div>
                      <div class="theme-option-desc">Bright · high-clarity</div>
                    </div>
                  </button>

                  <button class="theme-option" data-theme-value="system">
                    <div class="theme-preview system">
                      <div class="tp-side">
                        <div class="tp-line accent" style="width:80%"></div>
                        <div class="tp-line" style="width:60%"></div>
                      </div>
                      <div class="tp-main">
                        <div class="tp-line" style="width:50%"></div>
                        <div class="tp-block"></div>
                      </div>
                    </div>
                    <div>
                      <div class="theme-option-name">System</div>
                      <div class="theme-option-desc">Follows OS setting</div>
                    </div>
                  </button>
                </div>
              </div>

              <div class="settings-group">
                <div class="sg-head">
                  <div class="sg-title">
                    <i data-icon="sliders" data-icon-size="18"></i>
                    Interface density
                  </div>
                  <div class="sg-desc">Adjust how much breathing room the layout uses.</div>
                </div>
                <div class="sg-body">
                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Density</div>
                      <div class="setting-hint">Comfortable is the design's native rhythm.</div>
                    </div>
                    <div class="setting-control">
                      <div class="segmented">
                        <button>Compact</button>
                        <button class="is-active">Comfortable</button>
                        <button>Spacious</button>
                      </div>
                    </div>
                  </div>

                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Reduce motion</div>
                      <div class="setting-hint">Disable subtle animations and transitions.</div>
                    </div>
                    <div class="setting-control">
                      <label class="switch">
                        <input type="checkbox">
                        <span class="track"></span>
                      </label>
                    </div>
                  </div>

                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Show file thumbnails</div>
                      <div class="setting-hint">Display preview images in list and grid views.</div>
                    </div>
                    <div class="setting-control">
                      <label class="switch">
                        <input type="checkbox" checked>
                        <span class="track"></span>
                      </label>
                    </div>
                  </div>

                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Default view</div>
                      <div class="setting-hint">The layout used when opening the file browser.</div>
                    </div>
                    <div class="setting-control">
                      <div class="segmented">
                        <button class="is-active">List</button>
                        <button>Grid</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- ══════════════════════
                 PANE: STORAGE
                 ══════════════════════ -->
            <div class="settings-pane" data-pane-content="storage">

              <div class="settings-group">
                <div class="sg-head">
                  <div class="sg-title">
                    <i data-icon="hardDrive" data-icon-size="18"></i>
                    Storage quota
                  </div>
                  <div class="sg-desc">Current usage across all storage tiers.</div>
                </div>

                <div class="quota-panel">
                  <div class="quota-top">
                    <div class="quota-used">
                      342 GB <span class="of">of 500 GB</span>
                    </div>
                    <button class="btn btn-primary btn-sm">
                      <i data-icon="arrowUp" data-icon-size="14"></i>
                      Upgrade quota
                    </button>
                  </div>

                  <div class="quota-bar">
                    <div class="quota-seg" style="width:29%; background:#a78bfa;" data-tip="Videos"></div>
                    <div class="quota-seg" style="width:16.4%; background:#f472b6;" data-tip="Images"></div>
                    <div class="quota-seg" style="width:10.8%; background:#60a5fa;" data-tip="Documents"></div>
                    <div class="quota-seg" style="width:7.6%; background:#fbbf24;" data-tip="Archives"></div>
                    <div class="quota-seg" style="width:4.6%; background:#34d399;" data-tip="Other"></div>
                  </div>

                  <div class="quota-legend">
                    <div class="ql-item"><span class="ql-swatch" style="background:#a78bfa"></span><span class="ql-name">Videos</span><span class="ql-val">145 GB</span></div>
                    <div class="ql-item"><span class="ql-swatch" style="background:#f472b6"></span><span class="ql-name">Images</span><span class="ql-val">82 GB</span></div>
                    <div class="ql-item"><span class="ql-swatch" style="background:#60a5fa"></span><span class="ql-name">Documents</span><span class="ql-val">54 GB</span></div>
                    <div class="ql-item"><span class="ql-swatch" style="background:#fbbf24"></span><span class="ql-name">Archives</span><span class="ql-val">38 GB</span></div>
                    <div class="ql-item"><span class="ql-swatch" style="background:#34d399"></span><span class="ql-name">Other</span><span class="ql-val">23 GB</span></div>
                  </div>
                </div>
              </div>

              <div class="settings-group">
                <div class="sg-head">
                  <div class="sg-title">
                    <i data-icon="clock" data-icon-size="18"></i>
                    Retention & lifecycle
                  </div>
                  <div class="sg-desc">Automate cleanup and tier transitions.</div>
                </div>
                <div class="sg-body">
                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Trash retention</div>
                      <div class="setting-hint">How long deleted files stay recoverable before permanent removal.</div>
                    </div>
                    <div class="setting-control">
                      <select class="select">
                        <option>7 days</option>
                        <option selected>30 days</option>
                        <option>90 days</option>
                        <option>Never delete</option>
                      </select>
                    </div>
                  </div>

                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Move to cold storage after</div>
                      <div class="setting-hint">Files untouched for this period are moved to slower, cheaper storage.</div>
                    </div>
                    <div class="setting-control">
                      <select class="select">
                        <option>Never</option>
                        <option>30 days</option>
                        <option selected>90 days</option>
                        <option>180 days</option>
                        <option>1 year</option>
                      </select>
                    </div>
                  </div>

                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Auto-purge temp folder</div>
                      <div class="setting-hint">Clear /temp weekly to reclaim space.</div>
                    </div>
                    <div class="setting-control">
                      <label class="switch">
                        <input type="checkbox" checked>
                        <span class="track"></span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- ══════════════════════
                 PANE: SECURITY
                 ══════════════════════ -->
            <div class="settings-pane" data-pane-content="security">

              <div class="settings-group">
                <div class="sg-head">
                  <div class="sg-title">
                    <i data-icon="lock" data-icon-size="18"></i>
                    Authentication
                  </div>
                  <div class="sg-desc">Protect admin access with strong authentication.</div>
                </div>
                <div class="sg-body">
                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">
                        Two-factor authentication
                        <span class="badge badge-success">Enabled</span>
                      </div>
                      <div class="setting-hint">Require a second factor when signing in.</div>
                    </div>
                    <div class="setting-control">
                      <button class="btn btn-ghost btn-sm">Manage</button>
                    </div>
                  </div>

                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Single sign-on (SSO)</div>
                      <div class="setting-hint">Connect Okta, Azure AD, or Google Workspace.</div>
                    </div>
                    <div class="setting-control">
                      <button class="btn btn-ghost btn-sm">Configure</button>
                    </div>
                  </div>

                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Session timeout</div>
                      <div class="setting-hint">Automatically sign out inactive sessions.</div>
                    </div>
                    <div class="setting-control">
                      <select class="select">
                        <option>15 min</option>
                        <option>1 hour</option>
                        <option selected>8 hours</option>
                        <option>24 hours</option>
                        <option>Never</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div class="settings-group">
                <div class="sg-head">
                  <div class="sg-title">
                    <i data-icon="shield" data-icon-size="18"></i>
                    File protection
                  </div>
                  <div class="sg-desc">Security policies applied to all files.</div>
                </div>
                <div class="sg-body">
                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Encryption at rest</div>
                      <div class="setting-hint">AES-256 encryption for all stored files.</div>
                    </div>
                    <div class="setting-control">
                      <label class="switch">
                        <input type="checkbox" checked disabled>
                        <span class="track"></span>
                      </label>
                    </div>
                  </div>

                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Virus scanning</div>
                      <div class="setting-hint">Scan uploads against ClamAV signature database.</div>
                    </div>
                    <div class="setting-control">
                      <label class="switch">
                        <input type="checkbox" checked>
                        <span class="track"></span>
                      </label>
                    </div>
                  </div>

                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Password-protected links</div>
                      <div class="setting-hint">Require a password for all new share links by default.</div>
                    </div>
                    <div class="setting-control">
                      <label class="switch">
                        <input type="checkbox">
                        <span class="track"></span>
                      </label>
                    </div>
                  </div>

                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Download watermarking</div>
                      <div class="setting-hint">Add invisible watermarks to downloaded documents.</div>
                    </div>
                    <div class="setting-control">
                      <label class="switch">
                        <input type="checkbox">
                        <span class="track"></span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- ══════════════════════
                 PANE: API KEYS
                 ══════════════════════ -->
            <div class="settings-pane" data-pane-content="api">

              <div class="settings-group">
                <div class="sg-head">
                  <div class="sg-title">
                    <i data-icon="key" data-icon-size="18"></i>
                    API keys
                  </div>
                  <div class="sg-desc">Programmatic access tokens for the Dimension REST API.</div>
                </div>

                <div class="sg-body">
                  <div class="token-row">
                    <div class="token-ico"><i data-icon="key" data-icon-size="15"></i></div>
                    <div class="token-body">
                      <div class="token-name">
                        Production API
                        <span class="badge badge-success badge-dot">Active</span>
                      </div>
                      <div class="token-key">
                        <span>dim_live_</span><span class="masked">••••••••••••••••</span><span>a8f2</span>
                        <button class="btn-icon btn-icon-sm" data-tip="Copy" data-copy="dim_live_a8f2">
                          <i data-icon="copy" data-icon-size="13"></i>
                        </button>
                      </div>
                    </div>
                    <div class="token-meta">
                      Created Jan 4<br>
                      Last used 2m ago
                    </div>
                  </div>

                  <div class="token-row">
                    <div class="token-ico"><i data-icon="key" data-icon-size="15"></i></div>
                    <div class="token-body">
                      <div class="token-name">
                        Staging Deploy
                        <span class="badge badge-success badge-dot">Active</span>
                      </div>
                      <div class="token-key">
                        <span>dim_test_</span><span class="masked">••••••••••••••••</span><span>3b17</span>
                        <button class="btn-icon btn-icon-sm" data-tip="Copy" data-copy="dim_test_3b17">
                          <i data-icon="copy" data-icon-size="13"></i>
                        </button>
                      </div>
                    </div>
                    <div class="token-meta">
                      Created Feb 12<br>
                      Last used 3h ago
                    </div>
                  </div>

                  <div class="token-row">
                    <div class="token-ico"><i data-icon="key" data-icon-size="15"></i></div>
                    <div class="token-body">
                      <div class="token-name">
                        Legacy Migration
                        <span class="badge badge-warning">Expiring soon</span>
                      </div>
                      <div class="token-key">
                        <span>dim_live_</span><span class="masked">••••••••••••••••</span><span>c412</span>
                        <button class="btn-icon btn-icon-sm" data-tip="Copy" data-copy="dim_live_c412">
                          <i data-icon="copy" data-icon-size="13"></i>
                        </button>
                      </div>
                    </div>
                    <div class="token-meta">
                      Created Oct 3, 2024<br>
                      Expires in 6 days
                    </div>
                  </div>
                </div>

                <div class="sg-footer">
                  <div class="sg-footer-note">API keys grant full access. Never share them publicly.</div>
                  <button class="btn btn-primary btn-sm">
                    <i data-icon="plus" data-icon-size="14"></i>
                    Generate new key
                  </button>
                </div>
              </div>

              <div class="settings-group">
                <div class="sg-head">
                  <div class="sg-title">
                    <i data-icon="globe" data-icon-size="18"></i>
                    Webhooks
                  </div>
                  <div class="sg-desc">Notify external systems when file events occur.</div>
                </div>
                <div class="sg-body">
                  <div class="setting-row is-stacked">
                    <div class="setting-info">
                      <div class="setting-name">Webhook endpoint URL</div>
                      <div class="setting-hint">POST events to this HTTPS endpoint.</div>
                    </div>
                    <div class="setting-control is-wide">
                      <input class="input" type="text" placeholder="https://your-app.com/webhooks/dimension">
                    </div>
                  </div>

                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Trigger events</div>
                      <div class="setting-hint">Which file operations should fire a webhook.</div>
                    </div>
                    <div class="setting-control">
                      <div class="swatch-row">
                        <span class="tag">upload.completed</span>
                        <span class="tag">file.deleted</span>
                        <span class="tag">share.created</span>
                        <button class="btn-icon btn-icon-sm" data-tip="Add event">
                          <i data-icon="plus" data-icon-size="13"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- ══════════════════════
                 PANE: INTEGRATIONS
                 ══════════════════════ -->
            <div class="settings-pane" data-pane-content="integrations">

              <div class="settings-group">
                <div class="sg-head">
                  <div class="sg-title">
                    <i data-icon="package" data-icon-size="18"></i>
                    Connected services
                  </div>
                  <div class="sg-desc">Sync files with external cloud providers and productivity tools.</div>
                </div>

                <div class="integration-grid">
                  <div class="integration-card">
                    <div class="integration-ico" style="color:#4285F4"><i data-icon="cloud" data-icon-size="17"></i></div>
                    <div class="integration-body">
                      <div class="integration-name">Google Drive</div>
                      <div class="integration-status connected"><span class="dot"></span> Connected</div>
                    </div>
                    <button class="btn btn-ghost btn-sm">Manage</button>
                  </div>

                  <div class="integration-card">
                    <div class="integration-ico" style="color:#0061FF"><i data-icon="cloud" data-icon-size="17"></i></div>
                    <div class="integration-body">
                      <div class="integration-name">Dropbox</div>
                      <div class="integration-status connected"><span class="dot"></span> Connected</div>
                    </div>
                    <button class="btn btn-ghost btn-sm">Manage</button>
                  </div>

                  <div class="integration-card">
                    <div class="integration-ico"><i data-icon="fileText" data-icon-size="17"></i></div>
                    <div class="integration-body">
                      <div class="integration-name">Notion</div>
                      <div class="integration-status"><span class="dot"></span> Not connected</div>
                    </div>
                    <button class="btn btn-primary btn-sm">Connect</button>
                  </div>

                  <div class="integration-card">
                    <div class="integration-ico" style="color:#4A154B"><i data-icon="mail" data-icon-size="17"></i></div>
                    <div class="integration-body">
                      <div class="integration-name">Slack</div>
                      <div class="integration-status connected"><span class="dot"></span> Notifications on</div>
                    </div>
                    <button class="btn btn-ghost btn-sm">Manage</button>
                  </div>

                  <div class="integration-card">
                    <div class="integration-ico"><i data-icon="database" data-icon-size="17"></i></div>
                    <div class="integration-body">
                      <div class="integration-name">Amazon S3</div>
                      <div class="integration-status"><span class="dot"></span> Not connected</div>
                    </div>
                    <button class="btn btn-primary btn-sm">Connect</button>
                  </div>

                  <div class="integration-card">
                    <div class="integration-ico"><i data-icon="code" data-icon-size="17"></i></div>
                    <div class="integration-body">
                      <div class="integration-name">GitHub</div>
                      <div class="integration-status"><span class="dot"></span> Not connected</div>
                    </div>
                    <button class="btn btn-primary btn-sm">Connect</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- ══════════════════════
                 PANE: NOTIFICATIONS
                 ══════════════════════ -->
            <div class="settings-pane" data-pane-content="notifications">

              <div class="settings-group">
                <div class="sg-head">
                  <div class="sg-title">
                    <i data-icon="bell" data-icon-size="18"></i>
                    Notification preferences
                  </div>
                  <div class="sg-desc">Choose which events reach you and where.</div>
                </div>
                <div class="sg-body">
                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Upload complete</div>
                      <div class="setting-hint">Notify when a large upload finishes.</div>
                    </div>
                    <div class="setting-control">
                      <label class="switch"><input type="checkbox" checked><span class="track"></span></label>
                    </div>
                  </div>
                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Storage 80% full</div>
                      <div class="setting-hint">Alert when workspace storage nears capacity.</div>
                    </div>
                    <div class="setting-control">
                      <label class="switch"><input type="checkbox" checked><span class="track"></span></label>
                    </div>
                  </div>
                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Failed uploads</div>
                      <div class="setting-hint">Notify when a file fails after all retries.</div>
                    </div>
                    <div class="setting-control">
                      <label class="switch"><input type="checkbox" checked><span class="track"></span></label>
                    </div>
                  </div>
                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">New share links</div>
                      <div class="setting-hint">When another admin creates a public share.</div>
                    </div>
                    <div class="setting-control">
                      <label class="switch"><input type="checkbox"><span class="track"></span></label>
                    </div>
                  </div>
                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Weekly summary email</div>
                      <div class="setting-hint">A digest of activity delivered every Monday.</div>
                    </div>
                    <div class="setting-control">
                      <label class="switch"><input type="checkbox" checked><span class="track"></span></label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- ══════════════════════
                 PANE: DANGER ZONE
                 ══════════════════════ -->
            <div class="settings-pane" data-pane-content="danger">

              <div class="settings-group danger-zone">
                <div class="sg-head">
                  <div class="sg-title">
                    <i data-icon="alert" data-icon-size="18"></i>
                    Danger zone
                  </div>
                  <div class="sg-desc">These actions are permanent and cannot be undone. Please proceed with care.</div>
                </div>
                <div class="sg-body">
                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Empty trash</div>
                      <div class="setting-hint">Permanently delete all 217 files currently in the trash.</div>
                    </div>
                    <div class="setting-control">
                      <button class="btn btn-danger btn-sm" data-danger="empty-trash">
                        <i data-icon="trash" data-icon-size="14"></i>
                        Empty trash
                      </button>
                    </div>
                  </div>

                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Revoke all API keys</div>
                      <div class="setting-hint">Immediately invalidate all API keys. Any integration using them will stop working.</div>
                    </div>
                    <div class="setting-control">
                      <button class="btn btn-danger btn-sm" data-danger="revoke-keys">
                        <i data-icon="key" data-icon-size="14"></i>
                        Revoke all
                      </button>
                    </div>
                  </div>

                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Transfer workspace ownership</div>
                      <div class="setting-hint">Move ownership to another administrator. You'll be demoted to admin.</div>
                    </div>
                    <div class="setting-control">
                      <button class="btn btn-danger btn-sm">
                        <i data-icon="users" data-icon-size="14"></i>
                        Transfer
                      </button>
                    </div>
                  </div>

                  <div class="setting-row">
                    <div class="setting-info">
                      <div class="setting-name">Delete workspace</div>
                      <div class="setting-hint">Permanently delete this workspace and all 24,837 files. There is no recovery.</div>
                    </div>
                    <div class="setting-control">
                      <button class="btn btn-danger btn-sm" data-danger="delete-workspace">
                        <i data-icon="trash" data-icon-size="14"></i>
                        Delete workspace
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        <!-- Sticky save bar -->
        <div class="save-bar" id="saveBar">
          <div class="save-bar-text">
            <span class="dot"></span>
            You have unsaved changes
          </div>
          <div class="save-bar-actions">
            <button class="btn btn-ghost btn-sm" id="discardChanges">Discard</button>
            <button class="btn btn-primary btn-sm" id="saveChanges">
              <i data-icon="save" data-icon-size="14"></i>
              Save changes
            </button>
          </div>
        </div>

      </div>
    </main>
  </div>

  <!-- Scripts -->
  <script src="assets/js/app.js"></script>
  <script src="assets/js/theme.js"></script>
  <script src="assets/js/sidebar.js"></script>

  <!-- Settings page inline logic -->
  <script>
    (function () {
      'use strict';
      const { $, $$, Toast, Modal } = window.AFM;

      // Pane switcher
      $$('.settings-nav-item[data-pane]').forEach(btn => {
        btn.addEventListener('click', () => {
          const target = btn.getAttribute('data-pane');
          $$('.settings-nav-item').forEach(b => b.classList.toggle('is-active', b === btn));
          $$('.settings-pane').forEach(p => {
            p.classList.toggle('is-active', p.getAttribute('data-pane-content') === target);
          });
          // Scroll into view on mobile
          if (window.innerWidth <= 860) {
            document.querySelector('.settings-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      });

      // Deep-link support (?pane=security)
      const params = new URLSearchParams(location.search);
      const paneParam = params.get('pane');
      if (paneParam) {
        const btn = document.querySelector(`.settings-nav-item[data-pane="${paneParam}"]`);
        btn?.click();
      }

      // Save bar visibility on any change
      const saveBar = $('#saveBar');
      let dirty = false;

      function markDirty() {
        if (dirty) return;
        dirty = true;
        saveBar?.classList.add('is-visible');
      }

      function markClean() {
        dirty = false;
        saveBar?.classList.remove('is-visible');
      }

      // Watch inputs
      document.addEventListener('change', e => {
        if (e.target.closest('.settings-content')) markDirty();
      });
      document.addEventListener('input', e => {
        if (e.target.matches('.settings-content input[type="text"], .settings-content textarea')) markDirty();
      });

      // Save / discard
      $('#saveChanges')?.addEventListener('click', () => {
        Toast.success('Settings saved', 'Your preferences have been updated');
        markClean();
      });

      $('#discardChanges')?.addEventListener('click', async () => {
        const ok = await Modal.confirm({
          title: 'Discard changes?',
          message: 'Your unsaved edits will be lost.',
          confirmText: 'Discard',
          danger: true,
        });
        if (ok) {
          markClean();
          Toast.info('Changes discarded');
        }
      });

      // Warn on navigation with unsaved changes
      window.addEventListener('beforeunload', e => {
        if (dirty) {
          e.preventDefault();
          e.returnValue = '';
        }
      });

      // Danger zone actions
      $$('[data-danger]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const action = btn.getAttribute('data-danger');
          const configs = {
            'empty-trash': {
              title: 'Empty trash permanently?',
              message: 'All 217 files in the trash will be permanently deleted. This action cannot be undone.',
              confirmText: 'Empty trash',
              onConfirm: () => Toast.success('Trash emptied', '217 files permanently deleted'),
            },
            'revoke-keys': {
              title: 'Revoke all API keys?',
              message: 'All 3 active API keys will be invalidated immediately. Any integration using them will stop working.',
              confirmText: 'Revoke all',
              onConfirm: () => Toast.success('API keys revoked', 'All 3 keys have been invalidated'),
            },
            'delete-workspace': {
              title: 'Delete this workspace?',
              message: 'This will permanently delete Dimension HQ and all 24,837 files. There is absolutely no recovery from this action.',
              confirmText: 'Delete forever',
              onConfirm: () => Toast.error('Workspace scheduled for deletion', 'Contact support within 24h to cancel'),
            },
          };
          const cfg = configs[action];
          if (!cfg) return;
          const ok = await Modal.confirm({
            title: cfg.title,
            message: cfg.message,
            confirmText: cfg.confirmText,
            danger: true,
          });
          if (ok) cfg.onConfirm();
        });
      });

      // Segmented control demo
      $$('.segmented').forEach(seg => {
        seg.addEventListener('click', e => {
          const btn = e.target.closest('button');
          if (!btn || !seg.contains(btn)) return;
          seg.querySelectorAll('button').forEach(b => b.classList.toggle('is-active', b === btn));
          markDirty();
        });
      });

      // Theme picker also marks dirty? — Actually theme changes are instant, no save needed. Skip.
      // (The theme system already handles persistence directly.)

      // Prevent theme picker from dirtying the form
      $$('.theme-option').forEach(opt => {
        opt.addEventListener('click', e => {
          e.stopPropagation();
        }, true);
      });
    })();
  </script>
</body>
</html>
```

---

<a id="file-4"></a>

### 📄 File 4/4: `uploads.html`

| Property | Value |
|----------|-------|
| **Path** | `uploads.html` |
| **Language** | HTML |
| **Size** | 17.2 KB |
| **Lines** | 406 |

```html
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="description" content="Upload manager — drag, drop, and orchestrate file uploads with real-time progress and presets.">
  <meta name="theme-color" content="#0a0a0a">
  <title>Uploads · Dimension Files Manager</title>

  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='6' fill='%236b62f2'/%3E%3Cpath d='M12 6 6 9v6l6 3 6-3V9z' fill='none' stroke='%23fff' stroke-width='1.5' stroke-linejoin='round'/%3E%3C/svg%3E">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

  <link rel="stylesheet" href="assets/css/tokens.css">
  <link rel="stylesheet" href="assets/css/base.css">
  <link rel="stylesheet" href="assets/css/themes.css">
  <link rel="stylesheet" href="assets/css/layout.css">
  <link rel="stylesheet" href="assets/css/components.css">
  <link rel="stylesheet" href="assets/css/uploads.css">
</head>

<body data-page="uploads">

  <div class="app-shell">

    <!-- ══════════════════════════════════════════
         SIDEBAR
         ══════════════════════════════════════════ -->
    <aside class="sidebar" aria-label="Primary navigation">
      <div class="sidebar-header">
        <a href="index.html" class="brand" aria-label="Dimension home">
          <div class="brand-mark">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M12 3 4 7v10l8 4 8-4V7l-8-4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              <path d="m4 7 8 4 8-4M12 11v10" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="brand-text">
            <span class="brand-name">Dimension</span>
            <span class="brand-sub">Files Manager</span>
          </div>
        </a>
      </div>

      <div class="sidebar-body">
        <div class="nav-group">
          <div class="nav-group-label">Overview</div>
          <a class="nav-item" href="index.html" data-nav="dashboard">
            <span class="nav-icon"><i data-icon="dashboard" data-icon-size="18"></i></span>
            <span class="nav-label">Dashboard</span>
          </a>
          <a class="nav-item" href="files.html" data-nav="files">
            <span class="nav-icon"><i data-icon="folder" data-icon-size="18"></i></span>
            <span class="nav-label">All Files</span>
            <span class="nav-badge is-neutral">24.8K</span>
          </a>
          <a class="nav-item" href="uploads.html" data-nav="uploads">
            <span class="nav-icon"><i data-icon="uploadCloud" data-icon-size="18"></i></span>
            <span class="nav-label">Uploads</span>
            <span class="nav-badge">Live</span>
          </a>
          <a class="nav-item" href="files.html" data-nav="downloads">
            <span class="nav-icon"><i data-icon="download" data-icon-size="18"></i></span>
            <span class="nav-label">Downloads</span>
          </a>
        </div>

        <div class="nav-group">
          <div class="nav-group-label">Library</div>
          <a class="nav-item" href="files.html">
            <span class="nav-icon"><i data-icon="star" data-icon-size="18"></i></span>
            <span class="nav-label">Starred</span>
          </a>
          <a class="nav-item" href="files.html">
            <span class="nav-icon"><i data-icon="users" data-icon-size="18"></i></span>
            <span class="nav-label">Shared</span>
          </a>
          <a class="nav-item" href="files.html">
            <span class="nav-icon"><i data-icon="clock" data-icon-size="18"></i></span>
            <span class="nav-label">Recent</span>
          </a>
          <a class="nav-item" href="files.html">
            <span class="nav-icon"><i data-icon="trash" data-icon-size="18"></i></span>
            <span class="nav-label">Trash</span>
            <span class="nav-badge is-neutral">217</span>
          </a>
        </div>

        <div class="nav-group">
          <div class="nav-group-label">System</div>
          <a class="nav-item" href="#">
            <span class="nav-icon"><i data-icon="activity" data-icon-size="18"></i></span>
            <span class="nav-label">Analytics</span>
          </a>
          <a class="nav-item" href="#">
            <span class="nav-icon"><i data-icon="server" data-icon-size="18"></i></span>
            <span class="nav-label">Server Health</span>
          </a>
          <a class="nav-item" href="settings.html" data-nav="settings">
            <span class="nav-icon"><i data-icon="settings" data-icon-size="18"></i></span>
            <span class="nav-label">Settings</span>
          </a>
        </div>

        <div class="storage-card">
          <div class="storage-head">
            <span class="storage-title">Storage</span>
            <span class="storage-pct">68%</span>
          </div>
          <div class="storage-bar">
            <div class="storage-fill" style="width: 68%"></div>
          </div>
          <div class="storage-meta">342 GB of 500 GB used</div>
        </div>
      </div>

      <div class="sidebar-footer">
        <div class="sidebar-user" role="button" tabindex="0" aria-label="User menu">
          <div class="user-avatar">SC</div>
          <div class="user-info">
            <div class="user-name">Sarah Chen</div>
            <div class="user-role">Administrator</div>
          </div>
          <div class="chev" style="color:var(--text-tertiary)">
            <i data-icon="chevronsUpDown" data-icon-size="14"></i>
          </div>
        </div>
      </div>
    </aside>

    <!-- ══════════════════════════════════════════
         MAIN AREA
         ══════════════════════════════════════════ -->
    <main class="main-area">

      <!-- Topbar -->
      <header class="topbar">
        <div class="topbar-left">
          <button class="mobile-menu-btn" aria-label="Open menu">
            <i data-icon="menu" data-icon-size="18"></i>
          </button>
          <nav class="breadcrumb" aria-label="Breadcrumb">
            <span class="breadcrumb-item">Dimension</span>
            <span class="breadcrumb-sep"><i data-icon="chevronRight" data-icon-size="14"></i></span>
            <span class="breadcrumb-item is-current">Uploads</span>
          </nav>
        </div>

        <div class="topbar-center">
          <div class="search-field">
            <i data-icon="search" data-icon-size="16" class="search-icon"></i>
            <input id="globalSearch" class="search-input" type="search" placeholder="Search files, folders, users…" aria-label="Global search">
            <div class="search-kbd">
              <span class="kbd kbd-mod">⌘</span>
              <span class="kbd">K</span>
            </div>
          </div>
        </div>

        <div class="topbar-right">
          <button class="theme-toggle" data-theme-toggle aria-label="Toggle theme" title="Toggle theme">
            <span class="icon-sun"><i data-icon="sun" data-icon-size="12"></i></span>
            <span class="icon-moon"><i data-icon="moon" data-icon-size="12"></i></span>
          </button>
          <button class="btn-icon" data-tip="Notifications" aria-label="Notifications">
            <i data-icon="bell" data-icon-size="16"></i>
            <span class="notif-dot"></span>
          </button>
          <a class="btn btn-ghost btn-sm" href="files.html">
            <i data-icon="folder" data-icon-size="15"></i>
            <span>Browse files</span>
          </a>
        </div>
      </header>

      <!-- Page -->
      <div class="page">

        <!-- Page header -->
        <div class="page-header">
          <div class="page-title-group">
            <span class="page-eyebrow">
              <span class="dot"></span>
              Upload Manager
            </span>
            <h1 class="page-title">Upload files</h1>
            <p class="page-subtitle">Drop files, orchestrate parallel transfers, and watch every byte land — with real-time progress, pause & resume.</p>
          </div>

          <div class="page-actions">
            <button class="btn btn-ghost btn-sm" id="pauseAll">
              <i data-icon="pause" data-icon-size="15"></i>
              Pause all
            </button>
            <button class="btn btn-ghost btn-sm" id="resumeAll">
              <i data-icon="play" data-icon-size="15"></i>
              Resume all
            </button>
          </div>
        </div>

        <!-- Upload metrics -->
        <div class="upload-metrics" id="uploadMetrics"></div>

        <!-- Dropzone -->
        <div class="dropzone" id="dropzone" role="button" tabindex="0" aria-label="Drop files to upload">
          <div class="dz-icon">
            <i data-icon="uploadCloud" data-icon-size="28"></i>
          </div>
          <div class="dz-title">
            Drop files here or <span class="accent">browse</span>
          </div>
          <div class="dz-desc">
            Files upload in parallel with automatic retries, checksum verification, and instant CDN distribution across 42 edge points-of-presence.
          </div>

          <div class="dz-actions">
            <button class="btn btn-primary btn-sm" id="browseFiles">
              <i data-icon="file" data-icon-size="15"></i>
              Choose files
            </button>
            <button class="btn btn-ghost btn-sm" id="browseFolder">
              <i data-icon="folder" data-icon-size="15"></i>
              Choose folder
            </button>
          </div>

          <div class="dz-specs">
            <span class="spec-pill">
              <i data-icon="package" data-icon-size="12"></i>
              Max 5 GB per file
            </span>
            <span class="spec-pill">
              <i data-icon="zap" data-icon-size="12"></i>
              Up to 8 parallel
            </span>
            <span class="spec-pill">
              <i data-icon="shield" data-icon-size="12"></i>
              Auto-encrypted in transit
            </span>
            <span class="spec-pill">
              <i data-icon="refresh" data-icon-size="12"></i>
              Auto-retry on failure
            </span>
          </div>

          <input type="file" id="fileInput" class="dz-input" multiple aria-hidden="true">
          <input type="file" id="folderInput" class="dz-input" webkitdirectory directory multiple aria-hidden="true">
        </div>

        <!-- Destination strip -->
        <div class="dest-strip">
          <div class="dest-label">
            <i data-icon="folder" data-icon-size="14"></i>
            Destination
          </div>
          <span class="dest-path" id="destPath">
            <i data-icon="folder" data-icon-size="13"></i>
            /releases/2025
          </span>
          <button class="btn btn-subtle btn-sm" id="changeDestination">
            <i data-icon="edit" data-icon-size="13"></i>
            Change
          </button>

          <div class="dest-options">
            <label class="dest-opt">
              <label class="switch">
                <input type="checkbox" data-option="autoStart" checked>
                <span class="track"></span>
              </label>
              Auto-start uploads
            </label>
            <label class="dest-opt">
              <label class="switch">
                <input type="checkbox" data-option="overwrite">
                <span class="track"></span>
              </label>
              Overwrite duplicates
            </label>
            <label class="dest-opt">
              <label class="switch">
                <input type="checkbox" data-option="preservePath" checked>
                <span class="track"></span>
              </label>
              Preserve folder structure
            </label>
          </div>
        </div>

        <!-- Presets section -->
        <section class="section" style="margin-top:var(--spacing-32);">
          <div class="section-header">
            <div>
              <h2 class="section-title">Upload preset</h2>
              <div class="section-desc">Optimize the transfer for your workload</div>
            </div>
          </div>
          <div class="preset-grid" id="presetGrid"></div>
        </section>

        <!-- Upload Queue -->
        <section class="section">
          <div class="queue-panel">

            <!-- Queue header -->
            <div class="queue-head">
              <div class="queue-title-group">
                <h3 class="queue-title">Upload queue</h3>
                <div class="queue-stats" id="queueStats"></div>
              </div>

              <div style="display:flex;align-items:center;gap:var(--spacing-8);flex-wrap:wrap;">
                <button class="btn btn-subtle btn-sm" id="retryFailed">
                  <i data-icon="refresh" data-icon-size="14"></i>
                  Retry failed
                </button>
                <button class="btn btn-ghost btn-sm" id="clearDone">
                  <i data-icon="checkCircle" data-icon-size="14"></i>
                  Clear completed
                </button>
              </div>
            </div>

            <!-- Global progress -->
            <div class="queue-global" id="queueGlobal" style="display:none;"></div>

            <!-- Queue list -->
            <div class="queue-list" id="queueList"></div>

            <!-- Footer -->
            <div class="queue-footer">
              <div style="font-size:var(--text-caption);color:var(--text-tertiary);">
                Uploads resume automatically after network interruptions.
              </div>
              <button class="btn btn-danger btn-sm" id="cancelAll">
                <i data-icon="x" data-icon-size="14"></i>
                Cancel all pending
              </button>
            </div>
          </div>
        </section>

        <!-- Recent uploads strip -->
        <section class="section">
          <div class="section-header">
            <div>
              <h2 class="section-title">Recently uploaded</h2>
              <div class="section-desc">Latest completed transfers · from all admins</div>
            </div>
            <a class="btn btn-subtle btn-sm" href="files.html">
              View all
              <i data-icon="arrowRight" data-icon-size="14"></i>
            </a>
          </div>
          <div class="recent-strip" id="recentUploads"></div>
        </section>

        <!-- Accent divider -->
        <div class="accent-divider"></div>

        <!-- Tips card -->
        <section class="section">
          <div class="card card-accent">
            <div style="display:flex; align-items:flex-start; gap:var(--spacing-20); flex-wrap:wrap;">
              <div style="width:44px; height:44px; border-radius:var(--radius-ui); background:var(--bg-badge); color:var(--accent-primary); display:grid; place-items:center; border:1px solid rgba(107, 98, 242, 0.25); flex-shrink:0;">
                <i data-icon="sparkle" data-icon-size="20"></i>
              </div>

              <div style="flex:1; min-width:260px;">
                <h3 class="card-title" style="margin-bottom:8px;">Pro tips for large uploads</h3>
                <div class="numbered-list" style="margin-top:16px;">
                  <div class="numbered-row">
                    <div class="numbered-name">Use the "Fast Transfer" preset for batches over 10 GB</div>
                    <div class="numbered-index">01</div>
                  </div>
                  <div class="numbered-row">
                    <div class="numbered-name">Enable "Optimize Storage" for archives to save up to 40% space</div>
                    <div class="numbered-index">02</div>
                  </div>
                  <div class="numbered-row">
                    <div class="numbered-name">Drop entire folders — the structure is preserved automatically</div>
                    <div class="numbered-index">03</div>
                  </div>
                  <div class="numbered-row">
                    <div class="numbered-name">Uploads resume from the last checkpoint if the connection drops</div>
                    <div class="numbered-index">04</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

      </div>
    </main>
  </div>

  <!-- Scripts -->
  <script src="assets/js/app.js"></script>
  <script src="assets/js/theme.js"></script>
  <script src="assets/js/sidebar.js"></script>
  <script src="assets/js/uploads.js"></script>
</body>
</html>
```

---

## ✅ End of Project Code

> Total files extracted: **4**
> Total lines of code: **2221**
> Generated by: **Project Code Extractor v2.1**


