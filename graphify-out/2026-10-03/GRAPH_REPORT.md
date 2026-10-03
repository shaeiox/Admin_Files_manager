# Graph Report - Admin-Files-Manager-fixed  (2026-10-03)

## Corpus Check
- 160 files · ~274,324 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 15 file(s) not represented in the graph (top: .css 8, (none) 6, .corrupt-backup 1)

## Summary
- 2429 nodes · 3153 edges · 140 communities (135 shown, 5 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 412 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `13d40586`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ADDED Requirements
- FileSystemService.js
- /graphify (knowledge graph pipeline)
- Hardening Patterns
- Refinement and Evaluation Criteria
- /opsx-apply (Implement tasks from an OpenSpec change)
- Planning and Task Breakdown
- openspec-propose SKILL
- Observability and Instrumentation
- app.js
- Optimization Patterns
- package.json
- ADDED Requirements
- Documentation and ADRs
- Code Review and Quality
- MetadataService
- server.js
- Constraint-Driven Development
- Performance Optimization
- Context Engineering
- Git Workflow and Versioning
- Frontend UI Engineering
- stats
- Incremental Re-extraction (--update): detect_incremental diffs the corpus, code-only changes skip semantic subagents entirely
- ADDED Requirements
- dependencies
- Requirements
- fs.routes.js
- env.js
- ADDED Requirements
- ADDED Requirements
- Requirement: Every Regressed Defect Has A Failing-First Test
- scripts
- repository
- idea-refine.sh
- ADDED Requirements
- Requirement: Separator-Boundary Path Containment
- live-server.test.js
- dashboard.test.js
- ADDED Requirements
- .resolveSecurePath
- api.js
- PathService.test.js
- FileSystemService
- Test-Driven Development
- ADDED Requirements
- ref_node_test
- Shipping and Launch
- AGENTS.md - Dimension Files Manager operating rules
- dashboard.contract.test.js
- FileSystemService.volume.test.js
- FileSystemService.tree.test.js
- FileSystemService.rename.test.js
- MetadataService.dashboard.test.js
- ref_node_path
- CI/CD and Automation
- ADDED Requirements
- Requirement: Internal Paths Are Not Disclosed
- Interview Me
- Skill Discovery Map
- AppError
- ADDED Requirements
- Requirement: Every Removed Defect Has A Failing-Then-Passing Check
- Source-Driven Development
- dashboard.routes.js
- opencode.json
- Requirement: Capability Claims Match Server Behaviour
- Requirement: Download Ranking Is Computed Server-Side
- API and Interface Design
- ADDED Requirements
- ADDED Requirements
- ADDED Requirements
- index.html - Dashboard SPA page (data-page="dashboard")
- ADDED Requirements
- Requirements
- Incremental Implementation
- error-disclosure.test.js
- ADDED Requirements
- ADDED Requirements
- fs.contract.test.js
- ADDED Requirements
- fs.controller.js
- ADDED Requirements
- UploadService.js
- ADDED Requirements
- Requirement: File And Folder Counting
- ADDED Requirements
- Requirements
- ADDED Requirements
- ADDED Requirements
- Requirements
- Requirements
- files.test.js
- Phase 6 — Shared Frontend Contract
- ADDED Requirements
- fileTypes.test.js
- Decisions
- PreviewService.js
- Decision
- escapeHtml
- ADDED Requirements
- Requirements
- escaping.test.js
- Acceptance Criteria
- Acceptance Criteria
- dashboard.controller.js
- FakeEl
- Decisions
- Decisions
- Tasks
- validateClientPath
- Caching Layer Selection
- Phase 7 — Verified Facts (normative for all P7 agents)
- .innerHTML
- Tasks
- file
- Tasks
- Design
- loadFiles
- classifyFile
- Proposal
- ADDED Requirements
- Requirement: Queue Items Have A Closed, Observable Lifecycle
- sandbox
- Requirement: Bare Response Envelope
- Requirement: Partial Capability Failure
- Requirement: Rendering Cost Does Not Scale With Queue Size Per Update
- Requirement: Summary Tiles Measure A Surviving Source
- Requirement: Bare Response Envelope
- Requirement: Partial Capability Failure
- Requirement: Filesystem Router Separation
- Requirement: Failure Reasons Are Distinguishable
- Requirement: Global Progress Reflects Only Accounted Work
- Requirement: Presets Affect Only What They Advertise
- Requirement: Progress Is Computed Defensively Against Degenerate Sizes
- Requirement: Remaining Time Is Unavailable When Speed Is Unknown
- Requirement: Retrying Is Idempotent And Resets Progress
- Requirement: Route Registration Precedes Catch-All
- Requirement: Option Toggles Reach The Server
- Seam 7 — Escaping

## God Nodes (most connected - your core abstractions)
1. `MetadataService` - 26 edges
2. `Decisions` - 19 edges
3. `Decisions` - 19 edges
4. `/graphify (knowledge graph pipeline)` - 19 edges
5. `FileSystemService` - 18 edges
6. `validateClientPath()` - 18 edges
7. `classifyFile()` - 17 edges
8. `FakeEl` - 17 edges
9. `Constraint-Driven Development` - 17 edges
10. `AGENTS.md - Dimension Files Manager operating rules` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Security` --references--> `escapeHtml()`  [INFERRED]
  openspec/changes/files-page-correctness/proposal.md → public/assets/js/app.js
- `D7 — Reuse `_extKey` in place` --references--> `FileSystemService`  [INFERRED]
  openspec/changes/archive/2026-10-03-dashboard-real-data/design.md → src/services/FileSystemService.js
- `Migration Plan` --references--> `AppError`  [INFERRED]
  openspec/changes/upload-pipeline-correctness/design.md → src/utils/AppError.js
- `3. One taxonomy, reconciled upward` --references--> `classifyFile()`  [INFERRED]
  docs/decisions/ADR-003-files-page-integrity.md → src/utils/fileTypes.js
- `Truthfulness` --references--> `classifyFile()`  [INFERRED]
  openspec/changes/files-page-correctness/proposal.md → src/utils/fileTypes.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Define Phase Dialogue Chain** — _agents_skills_interview_me_skill, _agents_skills_idea_refine_skill, _agents_skills_doubt_driven_development_skill [EXTRACTED 1.00]
- **graphify pipeline stages (detect, extract, merge, cluster, label, manifest)** — _opencode_skills_graphify_skill_step_2_detect_files, _opencode_skills_graphify_skill_step_3_structural_ast_extraction, _opencode_skills_graphify_skill_step_3_semantic_extraction_subagents, _opencode_skills_graphify_skill_step_c_merge_ast_semantic, _opencode_skills_graphify_skill_step_4_build_cluster_analyze, _opencode_skills_graphify_skill_step_5_label_communities, _opencode_skills_graphify_skill_step_9_manifest_and_cost_tracker [EXTRACTED 1.00]
- **Layered request path: routes -> controller -> services -> secured path resolution** — src_routes_fs_routes, src_controllers_fs_controller, src_services_pathservice_pathservice_resolvesecurepath, src_services_filesystemservice, agents_md_layered_architecture, docs_repo_map_module_boundaries [EXTRACTED 1.00]
- **No-build frontend asset chain: HTML pages -> api.js/app.js/theme.js/sidebar.js with script load order as contract** — agents_md_no_build_frontend, public_index, public_files, public_uploads, public_settings, public_assets_js_api, public_assets_js_app [EXTRACTED 1.00]
- **OpenSpec change artifact lifecycle: propose -> apply -> update/sync -> archive** — _opencode_skills_openspec_propose_skill, _opencode_skills_openspec_apply_change_skill, _opencode_skills_openspec_update_change_skill, _opencode_skills_openspec_sync_specs_skill, _opencode_skills_openspec_archive_change_skill, openspec_config_spec_driven_schema [EXTRACTED 1.00]
- **opsx experimental OpenSpec workflow family** — _opencode_commands_opsx_explore_opsx_explore, _opencode_commands_opsx_propose_opsx_propose, _opencode_commands_opsx_apply_opsx_apply, _opencode_commands_opsx_update_opsx_update, _opencode_commands_opsx_sync_opsx_sync, _opencode_commands_opsx_archive_opsx_archive [EXTRACTED 1.00]
- **Inspect the real repository state before assuming defaults** — _agents_skills_test_driven_development_skill_discover_stack_first, _agents_skills_source_driven_development_skill_detect_stack_and_versions, _opencode_skills_graphify_skill_fast_path_existing_graph, _agents_skills_using_agent_skills_skill_core_operating_behaviors [INFERRED 0.75]
- **Agent Quality Bar Enforcement Stack** — _agents_skills_constraint_driven_development_skill, _agents_skills_constraint_driven_development_references_floor_guard, _agents_skills_ci_cd_and_automation_skill, _agents_skills_code_review_and_quality_skill, _agents_skills_git_workflow_and_versioning_skill [INFERRED 0.85]
- **Untrusted Input Boundary Discipline** — _agents_skills_api_and_interface_design_skill_validate_at_boundaries, _agents_skills_browser_testing_with_devtools_skill_untrusted_browser_content, _agents_skills_debugging_and_error_recovery_skill_error_output_as_untrusted_data, _agents_skills_context_engineering_skill_trust_levels [INFERRED 0.85]

## Communities (140 total, 5 thin omitted)

### Community 0 - "ADDED Requirements"
Cohesion: 0.04
Nodes (48): ADDED Requirements, Files Accessibility, Purpose, Regression Requirements, Requirement: Breadcrumb Segments Are Interactive Elements, Requirement: Dynamic Updates Are Announced, Requirement: Escape Is Scoped, Requirement: Every Control Has An Accessible Name (+40 more)

### Community 1 - "FileSystemService.js"
Cohesion: 0.12
Nodes (12): IMPORTANT: keep the reminder string free of backticks and $(...) constructs., ref_fs, ref_os, ref_path, AppError, { classifyFile, emptyBreakdown }, fs, os (+4 more)

### Community 2 - "/graphify (knowledge graph pipeline)"
Cohesion: 0.06
Nodes (48): Discover the Stack First, Watch Debounce, /graphify add <url> (ingest), --watch Background Folder Watcher, FalkorDB Export (--falkordb), MCP Server Export (--mcp), Neo4j Export (--neo4j), SVG and GraphML Exports (+40 more)

### Community 3 - "Hardening Patterns"
Cohesion: 0.09
Nodes (29): assertSafeUrl (SSRF allowlist resolver), Broken Access Control Prevention Pattern, Broken Authentication Prevention Pattern, Data Classification Table, Dependency Audit Triage Decision Tree, Destructive Path Controls (Allowlisted Root, Depth, Ownership), File Upload Safety, Hardening Patterns (+21 more)

### Community 4 - "Refinement and Evaluation Criteria"
Cohesion: 0.13
Nodes (27): Ideation Session Examples, Case Study: Real-Time Collaboration Feature, Case Study: ReOrder Direct-Ordering Engine, Case Study: Team Retrospectives, What to Notice in These Examples, Ideation Frameworks Reference, Analogous Inspiration, Constraint-Based Ideation (+19 more)

### Community 5 - "/opsx-apply (Implement tasks from an OpenSpec change)"
Cohesion: 0.06
Nodes (37): Apply Loop (Implement Tasks, Mark Complete), Fluid Workflow Integration, OpenSpec Root Project Check, /opsx-apply (Implement tasks from an OpenSpec change), OpenSpec Store Selection, Artifact and Task Completion Check, Delta Spec Sync State Assessment, Inline /opsx-sync Invocation (+29 more)

### Community 6 - "Planning and Task Breakdown"
Cohesion: 0.26
Nodes (12): Dependency Graph Mapping, Never Overwrite an Incomplete Plan, Plan Mode (Read-Only Planning), Planning and Task Breakdown, Task List Target, Task Sizing Guidelines, Task Structure with Acceptance Criteria, Vertical Slicing (+4 more)

### Community 7 - "openspec-propose SKILL"
Cohesion: 0.09
Nodes (31): openspec-apply-change SKILL, Blocked State Handling (state: blocked pauses implementation; select the next ready artifact, never bypass the gate), context vs operationGuidance Contract (prompt-level inputs, never evidence of task completion, never copied into artifacts), Task Checkbox Completion (- [ ] -> - [x] only when the specified behavior is fully implemented), openspec-archive-change SKILL, Archive Target Naming (YYYY-MM-DD-<change>; never stack a second date prefix), Delta Spec Sync State Assessment (existingOutputPaths is the only delta-spec source; MODIFIED/RENAMED on a missing main spec is sync-blocked), Never Archive While a Spec Sync Is In Flight (step 5 would move changeRoot out from under a running sync, so the sync must run inline and synchronously) (+23 more)

### Community 8 - "Observability and Instrumentation"
Cohesion: 0.18
Nodes (17): Debugging and Error Recovery, Error-Specific Patterns, Instrumentation Guidelines, The Stop-the-Line Rule, The Triage Checklist, Observability and Instrumentation, Cardinality Is the Failure Mode, Mandatory Correlation IDs (+9 more)

### Community 9 - "app.js"
Cohesion: 0.16
Nodes (19): attachRipples(), ContextMenu, copyToClipboard(), Dropdown, el(), FileTypes, Format, hydrateIcons() (+11 more)

### Community 10 - "Optimization Patterns"
Cohesion: 0.28
Nodes (9): Bundle Size and Code Splitting, Connection Pool Exhaustion, When an Index Will Not Help, N+1 Query Anti-Pattern, Optimization Patterns, Query-Plan-Driven Indexing, Responsive Image Optimization (Art Direction + Resolution Switching), Unbounded Data Fetching (+1 more)

### Community 11 - "package.json"
Cohesion: 0.12
Nodes (15): description, devDependencies, nodemon, directories, doc, keywords, main, name (+7 more)

### Community 12 - "ADDED Requirements"
Cohesion: 0.05
Nodes (41): ADDED Requirements, Files UI Quality, Purpose, Regression Requirements, Requirement: Dense Controls Fit Narrow Viewports, Requirement: Destructive Actions State Their Scope, Requirement: Detail Views Are Consistent, Requirement: States Are Visually Distinct (+33 more)

### Community 13 - "Documentation and ADRs"
Cohesion: 0.12
Nodes (19): Change Descriptions, Code Simplification, Chesterton's Fence, Claude Code Simplifier Plugin, The Five Principles, Follow Project Conventions, Maintain Balance, Prefer Clarity Over Cleverness (+11 more)

### Community 14 - "Code Review and Quality"
Cohesion: 0.20
Nodes (14): Code Review and Quality, Change Sizing, Finding Severity Labels, Multi-Model Review Pattern, Structural Remedies, Restartable Session Boundaries, Doubt-Driven Development, Step 3 DOUBT: Adversarial Fresh-Context Reviewer (+6 more)

### Community 15 - "MetadataService"
Cohesion: 0.15
Nodes (16): Eventually-Consistent Metadata (fire-and-forget writes must never block or fail the filesystem operation they accompany), JSON metadata store trade-offs (per-process singleton cache loses consistency under multiple instances; no trash/recycle; silent upload overwrite; npm test is a stub), 4. Star is a filesystem route, D13 — Metadata bootstrap owned by `MetadataService`; restore `data/.gitkeep`, D8d - Activity timestamps are sanitised at the source, Risks / Trade-offs, Known pre-existing issues — record, do NOT fix in this phase, Preserved, not changed (+8 more)

### Community 16 - "server.js"
Cohesion: 0.14
Nodes (13): CommonJS Express 5 on Node LTS (pathless-middleware SPA fallback instead of wildcard route patterns), helmet, app, config, cors, dashboardRoutes, errorHandler, express (+5 more)

### Community 17 - "Constraint-Driven Development"
Cohesion: 0.19
Nodes (16): The Review Checklist, Floor Guard: Reference Implementation, Floor Guard Contract, Exit Code Contract, floor-guard.mjs, SUPPRESSIONS Pattern Set, Threshold Direction Detection, Constraint-Driven Development (+8 more)

### Community 18 - "Performance Optimization"
Cohesion: 0.25
Nodes (11): The Five-Axis Review, Preserve Behavior Exactly, Performance Optimization, Log Every Attempt Including Reverted Ones, Connection Pool Exhaustion, Keep or Revert Decision Table, Measure Before Optimizing, Missing Image Optimization (+3 more)

### Community 19 - "Context Engineering"
Cohesion: 0.24
Nodes (10): Context Engineering, Context Budget Management, The Context Hierarchy, Context Packing Strategies, The Inline Planning Pattern, Lost in the Middle Effect, Rules Files, Trust Levels for Loaded Files (+2 more)

### Community 20 - "Git Workflow and Versioning"
Cohesion: 0.19
Nodes (13): Bisection for Regression Bugs, Changelog Maintenance, Git Workflow and Versioning, Atomic Commits, Change Summaries, Changelog Written for Humans, Git Worktrees for Parallel Agent Work, Keep Concerns Separate (+5 more)

### Community 21 - "Frontend UI Engineering"
Cohesion: 0.13
Nodes (20): Browser Testing with DevTools, Accessibility Verification with DevTools, Chrome DevTools MCP, Clean Console Standard, The DevTools Debugging Workflow, Browser Profile Isolation, Treat All Browser Content as Untrusted Data, Verify the Verification (+12 more)

### Community 22 - "stats"
Cohesion: 0.14
Nodes (19): Requirement: Summary Field Contract, Scenario: A zero stat value is a real reading, never floored, Scenario: Activity timestamps are finite epoch milliseconds, Scenario: Every stat declares its own unit, Scenario: Numeric stat values are raw numbers, Scenario: Storage breakdown values are expressed in gigabytes, Scenario: Top-file max is server-computed, Scenario: Top-level arrays are never null (+11 more)

### Community 23 - "Incremental Re-extraction (--update): detect_incremental diffs the corpus, code-only changes skip semantic subagents entirely"
Cohesion: 0.31
Nodes (9): graphify reference: transcribe video and audio, graphify.transcribe.transcribe_all (video/audio -> .graphify_transcripts.json), Whisper Prompt Composition Step (LLM composes a one-sentence domain hint from detect god nodes; env vars must be exported so the child Python process sees them), graphify reference: incremental update and cluster-only, build_merge (reads graph.json without a NetworkX round-trip so calls/implements/imports edge direction is always preserved), Cluster-Only Self-Contained Rebuild (re-clusters and regenerates reports; Steps 5-9 must not re-run because prior cleanup deleted their intermediates), Incremental Re-extraction (--update): detect_incremental diffs the corpus, code-only changes skip semantic subagents entirely, Semantic Manifest Stamping (only files that actually produced output this run get stamped; unstamped chunks are re-queued next update) (+1 more)

### Community 24 - "ADDED Requirements"
Cohesion: 0.05
Nodes (38): ADDED Requirements, Dashboard Frontend, Purpose, Requirement: Backend-Owned Values Are Not Re-Derived, Requirement: Existing Client And UI Primitives Are Reused, Requirement: Explicit Panel States, Requirement: Markup Structure Is Valid, Requirement: No Fabricated Fallback Values (+30 more)

### Community 25 - "dependencies"
Cohesion: 0.25
Nodes (8): dependencies, archiver, cors, dotenv, express, helmet, morgan, multer

### Community 26 - "Requirements"
Cohesion: 0.05
Nodes (38): dashboard-frontend Specification, Purpose, Requirement: Backend-Owned Values Are Not Re-Derived, Requirement: Existing Client And UI Primitives Are Reused, Requirement: Explicit Panel States, Requirement: Markup Structure Is Valid, Requirement: No Fabricated Fallback Values, Requirement: Polling Is Bounded And Self-Termating (+30 more)

### Community 27 - "fs.routes.js"
Cohesion: 0.22
Nodes (8): backend-checklist.md - Node.js Backend Build Checklist, Eight-Phase Backend Plan (setup, security/FS services, metadata, read APIs, mutation APIs, streaming upload, telemetry, settings), Layered backend with framework-free services (rationale: a monolithic route file would scatter path validation exactly where traversal bugs breed), Where to Add Things (endpoint, disk operation, metadata entity, validation rule, shared UI, page module, page style), express, fsController, previewController, router

### Community 28 - "env.js"
Cohesion: 0.40
Nodes (4): dotenv, config, dotenv, path

### Community 29 - "ADDED Requirements"
Cohesion: 0.05
Nodes (37): ADDED Requirements, Navigation State Consistency, Purpose, Regression Requirements, Requirement: Deep Paths Remain Navigable, Requirement: Folder Creation Is Scoped To Its Target, Requirement: One Owner For Navigation State, Requirement: Pending Search Is Cancelled By Navigation (+29 more)

### Community 30 - "ADDED Requirements"
Cohesion: 0.06
Nodes (35): ADDED Requirements, Filesystem Security, Purpose, Requirement: Filesystem-Derived Strings Are Escaped Before Markup Insertion, Requirement: No Absolute Path In Any Response, Requirement: Reverse Client-Path Conversion Is Consistent, Requirement: Separator-Boundary Path Containment, Requirement: Single Resolution Basis (+27 more)

### Community 31 - "Requirement: Every Regressed Defect Has A Failing-First Test"
Cohesion: 0.06
Nodes (35): ADDED Requirements, Purpose, Regression Guardrails, Regression Requirements, Requirement: Documentation Reflects The Shipped Contract, Requirement: Every Regressed Defect Has A Failing-First Test, Requirement: Source-Level Guards For Structural Defects, Requirement: The Files Page Module Has Automated Coverage (+27 more)

### Community 32 - "scripts"
Cohesion: 0.50
Nodes (4): scripts, dev, start, test

### Community 33 - "repository"
Cohesion: 0.67
Nodes (3): repository, type, url

### Community 35 - "ADDED Requirements"
Cohesion: 0.06
Nodes (35): ADDED Requirements, Purpose, Requirement: Bulk Queue Actions Are Predictable, Requirement: Drag Highlighting Is Accurate, Requirement: Files Enter The Queue Through Every Advertised Route, Requirement: Option Controls Are Well Formed And Labelled, Requirement: The Dropzone Is Operable By Keyboard, Requirement: The Page-Wide Drop Contract Matches Its Copy (+27 more)

### Community 36 - "Requirement: Separator-Boundary Path Containment"
Cohesion: 0.06
Nodes (35): filesystem-security Specification, Purpose, Requirement: Filesystem-Derived Strings Are Escaped Before Markup Insertion, Requirement: No Absolute Path In Any Response, Requirement: Reverse Client-Path Conversion Is Consistent, Requirement: Separator-Boundary Path Containment, Requirement: Single Resolution Basis, Requirement: Storage Root Deletion Remains Blocked (+27 more)

### Community 37 - "live-server.test.js"
Cohesion: 0.12
Nodes (13): ref_node_child_process, assert, { execFileSync }, fs, fsp, http, MetadataService, os (+5 more)

### Community 38 - "dashboard.test.js"
Cohesion: 0.11
Nodes (14): ref_node_vm, assert, createFormatStub(), DASHBOARD_SRC, dashboardSource, fs, INDEX_SRC, indexSource (+6 more)

### Community 39 - "ADDED Requirements"
Cohesion: 0.06
Nodes (32): ADDED Requirements, Purpose, Regression Requirements, Requirement: Destination Must Exist and Be a Directory, Requirement: Destination Precedes the File Part, Requirement: Dropped Directories Are Uploaded, Requirement: Existing Files Are Never Silently Destroyed, Requirement: The Reported Path Is the Path Actually Written (+24 more)

### Community 40 - ".resolveSecurePath"
Cohesion: 0.18
Nodes (14): PathService as the Single Path Boundary (client paths only cross the API; absolute securePath never leaves the services layer), A single, mandatory path boundary (rationale: the API accepts arbitrary client paths, so path containment is centralized to be auditable in one function), Context, D11 — `node:test`, no dependency, no `engines`, D5 — `PathService` separator boundary, single resolution basis, Design, Goals / Non-Goals, Human Approval Points (+6 more)

### Community 41 - "api.js"
Cohesion: 0.20
Nodes (12): Downloads Never Navigate the Main Frame (hidden iframe for files, hidden form POST for ZIP), checklist..md - Linux File-System Migration Checklist, Static-Prototype-to-Backed-UI Migration Checklist (API bridge, global data injection, dashboard, file browser, mutations, XHR upload, settings), /api/fs Endpoint Table (tree, list, download, folder, upload, rename, delete, download-zip), No-build vanilla frontend (rationale: trades DX niceties for zero toolchain; internal admin UI needs no framework, SEO, or CDN pipeline), Module Boundary Diagram (browser -> window.API -> HTTP -> routes -> controllers -> services), Files, Uploads (+4 more)

### Community 42 - "PathService.test.js"
Cohesion: 0.13
Nodes (12): AppError, assert, ENV_MODULE, fs, NORMALIZED_ROOT_SPELLINGS, os, path, SERVICE_MODULE (+4 more)

### Community 43 - "FileSystemService"
Cohesion: 0.20
Nodes (10): ADR-002 — Dashboard Data Architecture: Real Aggregates, Typed Absences, Bounded Walks, Consequences, Context, Decision, References, D8c - Where stale-metadata filtering lives, Service responsibilities, 5. Metadata aggregation and contract freeze (+2 more)

### Community 44 - "Test-Driven Development"
Cohesion: 0.43
Nodes (7): DAMP Over DRY in Tests, Prefer Real Implementations Over Mocks, The Prove-It Pattern, RED-GREEN-REFACTOR Cycle, Subagent Reproduction Test, Test-Driven Development, Test State, Not Interactions

### Community 45 - "ADDED Requirements"
Cohesion: 0.06
Nodes (31): ADDED Requirements, Purpose, Regression Requirements, Requirement: Bulk Action Inputs Are Derived From What Is Sent, Requirement: Navigation And Mutation Clear Selection Deliberately, Requirement: Pagination Survives A Shrinking Result Set, Requirement: Select-All States Its Scope, Requirement: Selection Reflects Rendered State In Both View Modes (+23 more)

### Community 46 - "ref_node_test"
Cohesion: 0.16
Nodes (10): ref_node_test, APP_PATH, APP_SOURCE, assert, fs, mountSidebar(), path, sidebarNodes() (+2 more)

### Community 47 - "Shipping and Launch"
Cohesion: 0.22
Nodes (11): Definition of Done, Verification Checkpoints, Error Budget Release Gate, Feature Flag Strategy, Monitoring and Observability, Post-Launch Verification, Pre-Launch Checklist, Rollback Strategy (+3 more)

### Community 48 - "AGENTS.md - Dimension Files Manager operating rules"
Cohesion: 0.15
Nodes (23): AGENTS.md - Dimension Files Manager operating rules, Layered Flow routes -> controllers -> services -> fs (controllers never bypass services; routes never register filesystem calls), No-Build Frontend (IIFE modules on window; script tag load order is part of the contract), Response Envelope Contract ({ success: true, data } / { success: false, error }), architecture.md - Legacy Deep-Dive Architecture Document, Dimension Design System Rules (violet #6b62f2 only as gradient wash, pill CTAs, weight 500 max, 1px hairline borders, 2% colorfulness is intentional), Global Namespace Map (window.AFM, Theme, Sidebar, Dashboard, Files, Uploads - no other globals), Mock Data Extension Points (replace dashboard.js arrays, files.js makeFiles(), uploads.js tick() with real API/XHR calls) (+15 more)

### Community 49 - "dashboard.contract.test.js"
Cohesion: 0.14
Nodes (12): ref_node_http, assert, fs, http, MetadataService, os, path, NOTE: an unreadable subtree cannot be provoked portably on Windows (chmod is (+4 more)

### Community 50 - "FileSystemService.volume.test.js"
Cohesion: 0.17
Nodes (9): assert, ENV_MODULE, fs, os, path, PATHSERVICE_MODULE, SERVICE_MODULE, { test, describe, after } (+1 more)

### Community 51 - "FileSystemService.tree.test.js"
Cohesion: 0.17
Nodes (9): assert, ENV_MODULE, fs, os, path, PATHSERVICE_MODULE, SERVICE_MODULE, { test, describe, after } (+1 more)

### Community 52 - "FileSystemService.rename.test.js"
Cohesion: 0.15
Nodes (10): AppError, assert, ENV_MODULE, fs, os, path, PATHSERVICE_MODULE, SERVICE_MODULE (+2 more)

### Community 53 - "MetadataService.dashboard.test.js"
Cohesion: 0.17
Nodes (10): ref_node_os, assert, freshStore(), fs, fsp, MetadataServiceSingleton, os, path (+2 more)

### Community 54 - "ref_node_path"
Cohesion: 0.20
Nodes (9): ref_node_path, AppError, assert, fs, fsp, MetadataServiceSingleton, os, path (+1 more)

### Community 55 - "CI/CD and Automation"
Cohesion: 0.22
Nodes (13): CI/CD and Automation, Build Cop Role, Feeding CI Failures Back to Agents, CI Optimization, Faster is Safer, GitHub Actions CI Configuration, The Quality Gate Pipeline, Rollback Plan (+5 more)

### Community 56 - "ADDED Requirements"
Cohesion: 0.06
Nodes (30): ADDED Requirements, Dashboard Metadata, Purpose, Requirement: Activity Retrieval Is Exposed, Requirement: Activity Shape Is Reused, Not Redesigned, Requirement: Activity Timestamps Are Explicit And Finite, Requirement: Download Ranking Is Computed Server-Side, Requirement: Metadata Failures Never Block Filesystem Operations (+22 more)

### Community 57 - "Requirement: Internal Paths Are Not Disclosed"
Cohesion: 0.06
Nodes (30): ADDED Requirements, Purpose, Requirement: Failure Bodies Are Of A Known Shape, Requirement: Failure Messages Are Displayable And Non-Volatile, Requirement: Internal Paths Are Not Disclosed, Requirement: Stack Traces Are Never Disclosed, Requirement: Upload Failures Carry A Machine-Readable Kind, Scenario: A collision is distinguishable (+22 more)

### Community 58 - "Interview Me"
Cohesion: 0.27
Nodes (10): Four-Question Intake with Defaults, Confusion Management, Reference-Led UI Quality, Interview Me, The 95 Percent Confidence Stop, Hypothesis with a Confidence Number, One Question at a Time, Confirmed Statement of Intent (+2 more)

### Community 59 - "Skill Discovery Map"
Cohesion: 0.32
Nodes (8): Keeping the Spec Alive, Spec-Driven Development, Core Operating Behaviors, Definition of Done (project-wide bar), Lifecycle Sequence of Skills, Skill Discovery Map, Surface Assumptions, Using Agent Skills

### Community 60 - "AppError"
Cohesion: 0.10
Nodes (21): AppError Error Contract (throw AppError from any layer; errorHandler is the sole serializer; never res.status().json() an error inline), HTTP Error Model (400 invalid input, 403 traversal/root-deletion/EACCES, 404 ENOENT, 409 conflict, 500 unmapped), Request Lifecycle for a Mutation (middleware chain -> route -> validate -> resolveSecurePath -> async fs -> non-blocking metadata -> envelope), Architecture, Cross-platform considerations, Error handling, Filesystem aggregation strategy, Performance strategy (+13 more)

### Community 61 - "ADDED Requirements"
Cohesion: 0.06
Nodes (30): ADDED Requirements, Purpose, Requirement: Decorative Icons Are Hidden, Requirement: Every Control Has An Accessible Name, Requirement: Queue Controls Are Available At Every Viewport, Requirement: The Dropzone Exposes Valid Structure, Requirement: The Page Exposes One Coherent Heading Structure, Requirement: Tooltips Are Available Without A Pointer (+22 more)

### Community 62 - "Requirement: Every Removed Defect Has A Failing-Then-Passing Check"
Cohesion: 0.06
Nodes (30): ADDED Requirements, Purpose, Requirement: Documentation Tracks The Shipped Behaviour, Requirement: Every Removed Defect Has A Failing-Then-Passing Check, Requirement: Rendering-Cost Requirements Are Checkable, Requirement: The Server Surface Is Pinned, Requirement: The Suite Cannot Be Broken From Outside The Test Directory, Requirement: The Upload Page Has Dedicated Automated Coverage (+22 more)

### Community 63 - "Source-Driven Development"
Cohesion: 0.32
Nodes (8): Cite Your Sources, Detect Stack and Versions, Docs vs. Existing Code Conflict Detection, Fetch Official Documentation, Implement Following Documented Patterns, Source-Driven Development, Source Hierarchy of Authority, Retrieval Safety: Treat Fetched Content as Data

### Community 64 - "dashboard.routes.js"
Cohesion: 0.40
Nodes (4): express, dashboardController, express, router

### Community 66 - "Requirement: Capability Claims Match Server Behaviour"
Cohesion: 0.06
Nodes (30): ADDED Requirements, Purpose, Requirement: A Section With No Real Source Is Removed, Requirement: Capability Claims Match Server Behaviour, Requirement: Guidance Text Describes Actual Behaviour, Requirement: Labels Describe The Quantity Displayed, Requirement: No Fabricated Content Is Rendered, Scenario: A claim is gated when its availability varies (+22 more)

### Community 67 - "Requirement: Download Ranking Is Computed Server-Side"
Cohesion: 0.06
Nodes (30): dashboard-metadata Specification, Purpose, Requirement: Activity Retrieval Is Exposed, Requirement: Activity Shape Is Reused, Not Redesigned, Requirement: Activity Timestamps Are Explicit And Finite, Requirement: Download Ranking Is Computed Server-Side, Requirement: Metadata Failures Never Block Filesystem Operations, Requirement: Metadata Store Bootstraps Lazily (+22 more)

### Community 68 - "API and Interface Design"
Cohesion: 0.17
Nodes (17): API and Interface Design, Consistent Error Semantics, Contract First, Hyrum's Law, Honouring an Idempotency Key, The One-Version Rule, Prefer Addition Over Modification, REST Resource Design and Pagination (+9 more)

### Community 69 - "ADDED Requirements"
Cohesion: 0.07
Nodes (28): ADDED Requirements, Cross-Platform Contract, Purpose, Requirement: Byte Accounting Is Platform-Neutral, Requirement: Capacity Degrades Without Platform Branching, Requirement: Identical HTTP Contract On Every Host, Requirement: Link Handling Is Uniform Across Hosts, Requirement: Native Semantics Are Used Internally (+20 more)

### Community 70 - "ADDED Requirements"
Cohesion: 0.07
Nodes (27): ADDED Requirements, Bulk Download Integrity, Purpose, Regression Requirements, Requirement: Download Outcomes Are Reported Honestly, Requirement: Downloads Never Navigate the Main Frame and Are Not Popup-Blocked, Requirement: Folder Selection Is Downloadable Only Via Archive, Requirement: One Handler Per Control (+19 more)

### Community 71 - "ADDED Requirements"
Cohesion: 0.07
Nodes (28): ADDED Requirements, Files List Resilience, Purpose, Regression Requirements, Requirement: A Route Is Registered Once, Requirement: Folder Size Is Null, Requirement: Listing Survives Entries That Vanish Mid-Request, Requirement: Pagination Bounds Are Validated (+20 more)

### Community 72 - "index.html - Dashboard SPA page (data-page="dashboard")"
Cohesion: 0.20
Nodes (10): Known Gaps: frontend calls without a backend (dashboard.js, settings.js, app.js hit the /api 404 catch-all), Dashboard, Settings, Sidebar, Theme, index.html - Dashboard SPA page (data-page="dashboard"), Dashboard Shell (sidebar, topbar, storage-card, hero panel, stats grid, traffic chart, storage donut, quick actions, activity feed, top downloads, capabilities, server health), settings.html - Settings SPA page (data-page="settings", 8 panes, external settings.js) (+2 more)

### Community 73 - "ADDED Requirements"
Cohesion: 0.07
Nodes (28): ADDED Requirements, Purpose, Regression Requirements, Requirement: Dead Code Is Removed, Requirement: Navigation Entries Lead To Distinct Content, Requirement: No Control Renders Without A Working Handler, Requirement: No Handler Reports An Outcome It Did Not Produce, Requirement: Search Fields Are Wired Or Absent (+20 more)

### Community 74 - "Requirements"
Cohesion: 0.07
Nodes (28): cross-platform-contract Specification, Purpose, Requirement: Byte Accounting Is Platform-Neutral, Requirement: Capacity Degrades Without Platform Branching, Requirement: Identical HTTP Contract On Every Host, Requirement: Link Handling Is Uniform Across Hosts, Requirement: Native Semantics Are Used Internally, Requirement: No Platform-Specific Detail In Responses (+20 more)

### Community 75 - "Incremental Implementation"
Cohesion: 0.15
Nodes (16): Feature Flags, Adapter Pattern, The Churn Rule, Expand/Contract Schema Migration, Feature Flag Migration, The Migration Process, Strangler Pattern, ADR Lifecycle (+8 more)

### Community 76 - "error-disclosure.test.js"
Cohesion: 0.11
Nodes (14): data/metadata.json Schema (downloads map, starred array, activities array capped at 50, ms-epoch times), Node's filesystem is the database (rationale: zero infrastructure, backup = copy two directories; SQLite/Postgres rejected as drift-prone over-engineering), fs, path, assert, fs, http, MetadataService (+6 more)

### Community 77 - "ADDED Requirements"
Cohesion: 0.07
Nodes (27): ADDED Requirements, Mutation Result Truthfulness, Purpose, Regression Requirements, Requirement: Error And Empty Are Distinct States, Requirement: Mutation Failures Are Recoverable By Reload, Requirement: No Fabricated Fallback Data, Requirement: Partial Failure Is Reported As Partial Failure (+19 more)

### Community 78 - "ADDED Requirements"
Cohesion: 0.07
Nodes (27): ADDED Requirements, Purpose, Requirement: A Missing Destination Can Be Created, Requirement: Destination Paths Speak Only The Client Path Form, Requirement: Destination State Survives Interaction With The Queue, Requirement: The Destination Is Chosen From Real Folders, Requirement: The Destination Is Validated Before Bytes Are Sent, Requirement: The Displayed Destination Is The Real One (+19 more)

### Community 79 - "fs.contract.test.js"
Cohesion: 0.08
Nodes (19): allClientFiles(), assert, { emptyBreakdown }, FileSystemService, fs, getJson(), http, maxDepth() (+11 more)

### Community 80 - "ADDED Requirements"
Cohesion: 0.07
Nodes (26): ADDED Requirements, Markup Escaping And Security Boundary, Purpose, Regression Requirements, Requirement: A Content Security Policy Is A Recorded Decision, Requirement: Cross-Origin Access Is A Recorded Decision, Requirement: Filesystem-Derived Strings Are Escaped Before Insertion, Requirement: Response Messages Do Not Disclose Filesystem Detail (+18 more)

### Community 81 - "fs.controller.js"
Cohesion: 0.10
Nodes (23): Streaming as the default for I/O-heavy endpoints (rationale: uploads/download/ZIP are piped, never buffered whole in memory), D13 - Thumbnails: a real endpoint with a hard size cap, D2 - Uncomment the ZIP route; do not remount the filesystem router, API, AppError, { classifyFile, emptyBreakdown }, compareEntries(), deleteItems() (+15 more)

### Community 82 - "ADDED Requirements"
Cohesion: 0.08
Nodes (25): ADDED Requirements, Purpose, Regression Requirements, Requirement: Aggregate And Listing Breakdowns Keep Their Own Contracts, Requirement: Classification Is Counted, Not Inferred From Display, Requirement: One Server-Side Classifier, Requirement: Server And Client Agree Exactly, Requirement: Unclassified Files Are Counted And Surfaced (+17 more)

### Community 83 - "UploadService.js"
Cohesion: 0.10
Nodes (15): ref_crypto, AppError, crypto, formatLimit(), fs, fsp, joinClient(), multer (+7 more)

### Community 84 - "ADDED Requirements"
Cohesion: 0.08
Nodes (24): ADDED Requirements, Filesystem Aggregation, Purpose, Requirement: Bounded Traversal, Requirement: Byte Totals Exclude Directory Entry Size, Requirement: File And Folder Counting, Requirement: File-Type Breakdown Reuses The Existing Taxonomy, Requirement: Inaccessible Subtrees Degrade Gracefully (+16 more)

### Community 85 - "Requirement: File And Folder Counting"
Cohesion: 0.08
Nodes (24): filesystem-aggregation Specification, Purpose, Requirement: Bounded Traversal, Requirement: Byte Totals Exclude Directory Entry Size, Requirement: File And Folder Counting, Requirement: File-Type Breakdown Reuses The Existing Taxonomy, Requirement: Inaccessible Subtrees Degrade Gracefully, Requirements (+16 more)

### Community 86 - "ADDED Requirements"
Cohesion: 0.08
Nodes (23): ADDED Requirements, Dashboard Historical Metrics, Purpose, Requirement: Absence Of Retained History Is Acknowledged, Requirement: Instantaneous Figures Are Labelled Honestly, Requirement: Period-Ranged Traffic Chart Is Removed, Requirement: Period Selector Is Removed Or Made Functional, Requirement: Sparklines Are Removed (+15 more)

### Community 87 - "Requirements"
Cohesion: 0.08
Nodes (23): dashboard-historical-metrics Specification, Purpose, Requirement: Absence Of Retained History Is Acknowledged, Requirement: Instantaneous Figures Are Labelled Honestly, Requirement: Period-Ranged Traffic Chart Is Removed, Requirement: Period Selector Is Removed Or Made Functional, Requirement: Sparklines Are Removed, Requirement: Trend Percentages Are Not Fabricated (+15 more)

### Community 88 - "ADDED Requirements"
Cohesion: 0.09
Nodes (22): ADDED Requirements, Dashboard Health, Purpose, Requirement: Dashboard Health Is A Separate Endpoint From Liveness, Requirement: Health Failures Do Not Corrupt The Summary, Requirement: Health Reflects Real Platform Data, Requirement: Health Response Is A Bare Metric Array, Requirement: Metrics Are Honest About Units (+14 more)

### Community 89 - "ADDED Requirements"
Cohesion: 0.09
Nodes (22): ADDED Requirements, Purpose, Requirement: Capacity Is Nullable And Declared Unavailable, Requirement: Storage Root Containment Determines The Volume, Requirement: Three Distinct Quantities, Requirement: Volume Availability Reflects A Real Reading, Requirement: Volume Usage Uses Available-Block Semantics, Scenario: Available volume is declared available (+14 more)

### Community 90 - "Requirements"
Cohesion: 0.09
Nodes (22): dashboard-health Specification, Purpose, Requirement: Dashboard Health Is A Separate Endpoint From Liveness, Requirement: Health Failures Do Not Corrupt The Summary, Requirement: Health Reflects Real Platform Data, Requirement: Health Response Is A Bare Metric Array, Requirement: Metrics Are Honest About Units, Requirements (+14 more)

### Community 91 - "Requirements"
Cohesion: 0.09
Nodes (22): Purpose, Requirement: Capacity Is Nullable And Declared Unavailable, Requirement: Storage Root Containment Determines The Volume, Requirement: Three Distinct Quantities, Requirement: Volume Availability Reflects A Real Reading, Requirement: Volume Usage Uses Available-Block Semantics, Requirements, Scenario: Available volume is declared available (+14 more)

### Community 92 - "files.test.js"
Cohesion: 0.11
Nodes (19): activeTreePaths(), APP_SRC, assert, booted(), dirtied(), expectAt(), FILES_CSS, FILES_HTML (+11 more)

### Community 93 - "Phase 6 — Shared Frontend Contract"
Cohesion: 0.10
Nodes (21): D15 - Frontend findings (Phase 6), File ownership (no two agents touch the same file), Non-negotiables, Phase 6 — Shared Frontend Contract, Seam 1 — Sidebar storage (Agent A implements; B and C only empty the markup), Seam 2 — Sidebar identity (Agent A implements; B and C only empty the markup), Seam 3 — Data source for the sidebar, Seam 4 — Exported helpers (Agent A adds; Agent B consumes) (+13 more)

### Community 94 - "ADDED Requirements"
Cohesion: 0.10
Nodes (20): ADDED Requirements, Purpose, Requirement: Escaping Is Applied At Every Interpolation Site, Requirement: Escaping Is Verified, Not Assumed, Requirement: File Names Are Escaped Before Insertion, Requirement: Server-Derived Text Is Escaped Before Insertion, Scenario: A name containing markup characters renders as text, Scenario: A name that would otherwise execute does not execute (+12 more)

### Community 95 - "fileTypes.test.js"
Cohesion: 0.11
Nodes (16): ref_node_assert, ref_node_fs, assert, fs, gitignore, path, pkg, ROOT (+8 more)

### Community 96 - "Decisions"
Cohesion: 0.13
Nodes (14): D10 - No new endpoints, and now no shared-file edits either, D11 - Test the page's exported derivations, not its DOM, D12 - Scope test discovery to the test directory, D1 - Consume the server upload contract; do not re-specify or re-implement it, D3 - One delegated listener on the queue container, D4 - Map server failures to kinds from a machine-readable signal, D6 - Unavailable is a value, not an absence, D7 - Fix well-formedness at the source, not with a click handler (+6 more)

### Community 97 - "PreviewService.js"
Cohesion: 0.17
Nodes (8): AppError, { classifyFile }, FileSystemService, path, PathService, PREVIEW_FORMATS, PreviewService, transformer

### Community 98 - "Decision"
Cohesion: 0.14
Nodes (13): 1. Upload placement is decided after the body is parsed, 2. The ZIP route is enabled (closes the ADR-001 follow-up), 3. One taxonomy, reconciled upward, 5. Remove what cannot work; do not stub it, 6. Select-all is page-scoped and says so, 7. Previews are real or explicitly unavailable, 8. The list is a grid with a roving tab index, 9. Security posture — escalated, recorded, not fixed here (+5 more)

### Community 99 - "escapeHtml"
Cohesion: 0.16
Nodes (13): Frontend state model, Concurrent-change coordination, Impact, Context, D2 - Make queue derivations pure and export them for testing, 1. Escaping — close the reflected DOM XSS, clamp(), countUp() (+5 more)

### Community 100 - "ADDED Requirements"
Cohesion: 0.14
Nodes (13): ADDED Requirements, Dashboard API, Purpose, Requirement: No Operating-System Path Leakage, Requirement: Route Registration Precedes Catch-All, Requirement: Summary Health Mirrors the Health Endpoint, Scenario: Both endpoints offer the same metric row set, Scenario: Dashboard routes are reachable (+5 more)

### Community 101 - "Requirements"
Cohesion: 0.14
Nodes (13): dashboard-api Specification, Purpose, Requirement: Filesystem Router Separation, Requirement: No Operating-System Path Leakage, Requirement: Summary Health Mirrors the Health Endpoint, Requirements, Scenario: Both endpoints offer the same metric row set, Scenario: Dedicated route module (+5 more)

### Community 102 - "escaping.test.js"
Cohesion: 0.14
Nodes (10): assert, fs, http, MetadataService, os, path, ROOT, { test, describe, before, after } (+2 more)

### Community 103 - "Acceptance Criteria"
Cohesion: 0.15
Nodes (12): Acceptance Criteria, Accessibility, Capabilities, Data integrity, Guardrails, Modified Capabilities, New Capabilities, Proposal (+4 more)

### Community 104 - "Acceptance Criteria"
Cohesion: 0.15
Nodes (12): Acceptance Criteria, Capabilities, Data integrity and truthfulness, Guardrails, Honesty, Impact, Interaction and accessibility, Modified Capabilities (+4 more)

### Community 105 - "dashboard.controller.js"
Cohesion: 0.19
Nodes (10): BREAKDOWN_COLORS, buildStats(), buildStorageBreakdown(), { CATEGORIES }, FileSystemService, getSummary(), MetadataService, CATEGORIES (+2 more)

### Community 107 - "Decisions"
Cohesion: 0.17
Nodes (12): D10 — Remove historical affordances; record no history, D12 — Self-terminating polling; adopt the existing pattern, D14 — Sidebar scope is all four pages, D1 — Mount `/api/dashboard` before the `/api` catch-all, D2 — Bare responses, not `{success, data}`, D3 — No `DashboardService`, D4 — Skip links entirely; do not resolve-then-check, D6 — `bavail`-pinned capacity; nullable; HTTP 200 (+4 more)

### Community 108 - "Decisions"
Cohesion: 0.17
Nodes (12): D10 - Optimistic update only where it is visible, D11 - Drawer becomes a real modal dialog, D12 - Escape is scoped, not global, D14 - Error state is a first-class render path, not a message variant, D16 - Scope `npm test` to `test/`, D17 - `count= 0` is a reading; an unknown is a flag, D18 - CORS, CSP and `.env` are escalated with a recorded decision, not silently absorbed, D5 - Remove unbuildable capabilities rather than stub them (+4 more)

### Community 109 - "Tasks"
Cohesion: 0.17
Nodes (11): 0. Gate — verify the server contract, and record shared-file ownership, 3. Queue derivations and correctness, 5. Honesty and copy, 6. Interaction, 7. Accessibility and responsive density, 8. Documentation, 9. Integration and browser verification, Definition of Done (+3 more)

### Community 110 - "validateClientPath"
Cohesion: 0.26
Nodes (9): createFolder(), renameItem(), getThumbnail(), PreviewService, { validateClientPath }, storage, AppError, validateClientPath() (+1 more)

### Community 111 - "Caching Layer Selection"
Cohesion: 0.20
Nodes (11): Cache Invalidation Strategy, Cache Key Correctness, Cache Stampede Guard, Caching Layer Selection, LLM Output Handling, Model Output Is Untrusted Input, OWASP Top 10 for LLM Applications (2025), Browser Testing with Chrome DevTools (+3 more)

### Community 112 - "Phase 7 — Verified Facts (normative for all P7 agents)"
Cohesion: 0.18
Nodes (10): `/api/health` vs `/api/dashboard/health` — two different things, File ownership, Load average is deliberately absent, New files that REPO_MAP must list, No history is retained, Phase 7 — Verified Facts (normative for all P7 agents), Response envelope convention — correct the current documentation, Stale claims you must fix (all verified) (+2 more)

### Community 113 - ".innerHTML"
Cohesion: 0.20
Nodes (10): D15 - Escape everything derived from the filesystem, Goals, Goals / Non-Goals, Non-Goals, Functional and structural defects, Honesty defects in the numbers, Reflected DOM XSS in the queue, The two security defects (+2 more)

### Community 114 - "Tasks"
Cohesion: 0.20
Nodes (9): D8b - Health metrics: what could honestly be measured (Phase 5 findings), 0. Prerequisites — green suite, scoped discovery, ZIP availability, 3. Navigation and selection state, 4. Accessibility, 5. UI quality, 6. Documentation and guardrails, Tasks, Traceability (+1 more)

### Community 115 - "file"
Cohesion: 0.22
Nodes (10): Live payload — `GET /api/dashboard/summary`, Two corrections made during P6 — document these, they are easy to get wrong, D1 - Order multipart fields before the file, and derive the response path from the resolved destination, Preserved, not changed, What Changes, Why, 2. Truthfulness and dead surface, The four reproduced data-loss defects (+2 more)

### Community 116 - "Tasks"
Cohesion: 0.22
Nodes (8): 2. Dashboard API — route and controller skeleton, 4. Storage capacity, 7. Documentation, 8. Integration verification, 9. Final review, Definition of Done, Dependency chain, Tasks

### Community 117 - "Design"
Cohesion: 0.22
Nodes (8): Context, Design, Human Approval Points, Migration Plan, Open Questions, Risks / Trade-offs, getTree(), scanFolders()

### Community 118 - "loadFiles"
Cohesion: 0.28
Nodes (8): Architecture, D8 - Keep selection across reloads by pruning, not by clearing, Data and control flow changes, Error handling, Exact components affected, Root cause per defect, loadFiles(), makeDocument()

### Community 119 - "classifyFile"
Cohesion: 0.54
Nodes (7): 3. Filesystem aggregation, D3 - One server-side classifier; reconcile the map upward, not downward, Existing architecture involved, 1. Server contract — upload, taxonomy, listing resilience, star, getList(), classifyFile(), emptyBreakdown()

### Community 120 - "Proposal"
Cohesion: 0.29
Nodes (6): Capabilities, Impact, Modified Capabilities, New Capabilities, Proposal, Why

### Community 121 - "ADDED Requirements"
Cohesion: 0.29
Nodes (6): ADDED Requirements, Purpose, Requirement: Aborting A Transfer Leaves No Orphan File, Scenario: An aborted transfer leaves nothing behind, Scenario: The destination listing reflects only completed transfers, Upload Queue Integrity

### Community 122 - "Requirement: Queue Items Have A Closed, Observable Lifecycle"
Cohesion: 0.33
Nodes (6): Requirement: Queue Items Have A Closed, Observable Lifecycle, Scenario: A file that cannot be queued is named, not merely counted, Scenario: Adding a file yields a queued item, Scenario: Cancelling removes the item from the queue, Scenario: Clearing completed rows is distinct from cancelling, Scenario: Pause and resume return an item to the queue

### Community 124 - "Requirement: Bare Response Envelope"
Cohesion: 0.40
Nodes (5): Requirement: Bare Response Envelope, Scenario: Bare shape matches read-endpoint precedent, Scenario: Enveloped response is rejected by contract, Scenario: Health response is a bare array, Scenario: Summary response is a bare object

### Community 125 - "Requirement: Partial Capability Failure"
Cohesion: 0.40
Nodes (5): Requirement: Partial Capability Failure, Scenario: Metadata store unavailable, Scenario: Partial-failure convention is documented, Scenario: Storage capacity unavailable, Scenario: Storage root unreadable

### Community 126 - "Requirement: Rendering Cost Does Not Scale With Queue Size Per Update"
Cohesion: 0.40
Nodes (5): Requirement: Rendering Cost Does Not Scale With Queue Size Per Update, Scenario: A large queue remains operable, Scenario: A single-row update touches only that row, Scenario: Row actions are dispatched through a single listener, Scenario: The interval update mutates values rather than replacing markup

### Community 127 - "Requirement: Summary Tiles Measure A Surviving Source"
Cohesion: 0.40
Nodes (5): Requirement: Summary Tiles Measure A Surviving Source, Scenario: A counter derived from the live queue is labelled as such, Scenario: A tile never claims a time scope that no source provides, Scenario: A tile reflects only completed work, Scenario: Clearing completed rows does not reset the tiles

### Community 128 - "Requirement: Bare Response Envelope"
Cohesion: 0.40
Nodes (5): Requirement: Bare Response Envelope, Scenario: Bare shape matches read-endpoint precedent, Scenario: Enveloped response is rejected by contract, Scenario: Health response is a bare array, Scenario: Summary response is a bare object

### Community 129 - "Requirement: Partial Capability Failure"
Cohesion: 0.40
Nodes (5): Requirement: Partial Capability Failure, Scenario: Metadata store unavailable, Scenario: Partial-failure convention is documented, Scenario: Storage capacity unavailable, Scenario: Storage root unreadable

### Community 130 - "Requirement: Filesystem Router Separation"
Cohesion: 0.50
Nodes (4): Requirement: Filesystem Router Separation, Scenario: Dedicated route module, Scenario: No new service tier, Scenario: Route module contains no business logic

### Community 131 - "Requirement: Failure Reasons Are Distinguishable"
Cohesion: 0.50
Nodes (4): Requirement: Failure Reasons Are Distinguishable, Scenario: An unrecognised failure is still reported, Scenario: Distinct server outcomes produce distinct failure kinds, Scenario: The failure kind is not derived from parsing prose

### Community 132 - "Requirement: Global Progress Reflects Only Accounted Work"
Cohesion: 0.50
Nodes (4): Requirement: Global Progress Reflects Only Accounted Work, Scenario: A failed item does not reduce the completed fraction, Scenario: A stranded percentage is explained, Scenario: An empty queue reports no progress

### Community 133 - "Requirement: Presets Affect Only What They Advertise"
Cohesion: 0.50
Nodes (4): Requirement: Presets Affect Only What They Advertise, Scenario: A preset effect that is not transmitted is not advertised, Scenario: Concurrency selection changes the observable slot count, Scenario: The default preset is reflected in the interface

### Community 134 - "Requirement: Progress Is Computed Defensively Against Degenerate Sizes"
Cohesion: 0.50
Nodes (4): Requirement: Progress Is Computed Defensively Against Degenerate Sizes, Scenario: A zero-byte file produces a defined percentage, Scenario: An aborted transfer does not report more bytes than were sent, Scenario: Transferred bytes never exceed the item size

### Community 135 - "Requirement: Remaining Time Is Unavailable When Speed Is Unknown"
Cohesion: 0.50
Nodes (4): Requirement: Remaining Time Is Unavailable When Speed Is Unknown, Scenario: A measured speed yields a computed estimate, Scenario: The unavailable marker matches the project's convention, Scenario: Zero measured speed yields an unavailable indicator

### Community 136 - "Requirement: Retrying Is Idempotent And Resets Progress"
Cohesion: 0.50
Nodes (4): Requirement: Retrying Is Idempotent And Resets Progress, Scenario: Bulk retry leaves non-failed items untouched, Scenario: Retry enqueues exactly one copy, Scenario: Retry resets transferred bytes

### Community 137 - "Requirement: Route Registration Precedes Catch-All"
Cohesion: 0.50
Nodes (4): Requirement: Route Registration Precedes Catch-All, Scenario: Dashboard routes are reachable, Scenario: Filesystem router is not remounted under the dashboard prefix, Scenario: Unknown API paths still reach the catch-all

### Community 138 - "Requirement: Option Toggles Reach The Server"
Cohesion: 0.67
Nodes (3): Requirement: Option Toggles Reach The Server, Scenario: A presented option is transmitted, Scenario: An option with no server behaviour is removed

## Ambiguous Edges - Review These
- `The Review Checklist` → `CONSTRAINTS.md`  [AMBIGUOUS]
  .agents/skills/code-review-and-quality/SKILL.md · relation: conceptually_related_to
- `architecture.md - Legacy Deep-Dive Architecture Document` → `STRUCTURE.md - Frontend-Era Project Structure Map`  [AMBIGUOUS]
  docs/STRUCTURE.md · relation: references

## Knowledge Gaps
- **1255 isolated node(s):** `idea-refine.sh script`, `$schema`, `plugin`, `name`, `version` (+1250 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1413 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `The Review Checklist` and `CONSTRAINTS.md`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `architecture.md - Legacy Deep-Dive Architecture Document` and `STRUCTURE.md - Frontend-Era Project Structure Map`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **Why does `stats()` connect `stats` to `Requirement: Bare Response Envelope`, `FileSystemService`, `file`, `FileSystemService.tree.test.js`, `Requirement: Bare Response Envelope`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `MetadataService` connect `MetadataService` to `.resolveSecurePath`, `FileSystemService`, `error-disclosure.test.js`, `file`, `MetadataService.dashboard.test.js`, `Proposal`, `AppError`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `5. Metadata aggregation and contract freeze` connect `FileSystemService` to `Tasks`, `stats`, `MetadataService`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `MetadataService` (e.g. with `Context` and `D13 — Metadata bootstrap owned by `MetadataService`; restore `data/.gitkeep``) actually correct?**
  _`MetadataService` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `FileSystemService` (e.g. with `Context` and `D7 — Reuse `_extKey` in place`) actually correct?**
  _`FileSystemService` has 6 INFERRED edges - model-reasoned connections that need verification._