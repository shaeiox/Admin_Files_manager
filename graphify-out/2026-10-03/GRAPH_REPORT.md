# Graph Report - Admin-Files-Manager-fixed  (2026-10-03)

## Corpus Check
- 112 files · ~191,021 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 15 file(s) not represented in the graph (top: .css 8, (none) 6, .tmp 1)

## Summary
- 1175 nodes · 1725 edges · 73 communities (70 shown, 3 thin omitted)
- Extraction: 83% EXTRACTED · 17% INFERRED · 0% AMBIGUOUS · INFERRED: 299 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7f24a7e9`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Phase 7 — Verified Facts (normative for all P7 agents)
- fs.controller.js
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
- API and Interface Design
- Code Review and Quality
- MetadataService
- server.js
- Constraint-Driven Development
- Performance Optimization
- Context Engineering
- Git Workflow and Versioning
- Frontend UI Engineering
- Requirement: Summary Field Contract
- Incremental Re-extraction (--update): detect_incremental diffs the corpus, code-only changes skip semantic subagents entirely
- ADDED Requirements
- dependencies
- ADDED Requirements
- fs.routes.js
- env.js
- ADDED Requirements
- ADDED Requirements
- ADDED Requirements
- scripts
- repository
- idea-refine.sh
- ADDED Requirements
- ADDED Requirements
- FileSystemService.js
- dashboard.test.js
- Decisions
- .resolveSecurePath
- AGENTS.md - Dimension Files Manager operating rules
- PathService.test.js
- FileSystemService
- Test-Driven Development
- dashboard.controller.js
- app.test.js
- Shipping and Launch
- MetadataService.js
- dashboard.contract.test.js
- FileSystemService.volume.test.js
- FileSystemService.tree.test.js
- FileSystemService.rename.test.js
- MetadataService.dashboard.test.js
- MetadataService.test.js
- CI/CD and Automation
- ADDED Requirements
- Proposal
- Interview Me
- Skill Discovery Map
- Architecture
- Tasks
- Three-Tier Boundary System (Always / Ask First / Never)
- Source-Driven Development
- dashboard.routes.js
- opencode.json
- Requirement: Bare Response Envelope
- Requirement: Partial Capability Failure
- PathService.js
- Requirement: Filesystem Router Separation
- Requirement: No Operating-System Path Leakage
- Requirement: Route Registration Precedes Catch-All
- scanFolders

## God Nodes (most connected - your core abstractions)
1. `MetadataService` - 24 edges
2. `Decisions` - 19 edges
3. `/graphify (knowledge graph pipeline)` - 19 edges
4. `FileSystemService` - 18 edges
5. `AGENTS.md - Dimension Files Manager operating rules` - 17 edges
6. `Constraint-Driven Development` - 17 edges
7. `Performance Optimization` - 16 edges
8. `CONTRACTS.md - API & Data Contracts` - 16 edges
9. `Hardening Patterns` - 15 edges
10. `Phase 6 — Shared Frontend Contract` - 14 edges

## Surprising Connections (you probably didn't know these)
- `D13 — Metadata bootstrap owned by `MetadataService`; restore `data/.gitkeep`` --references--> `MetadataService`  [INFERRED]
  openspec/changes/dashboard-real-data/design.md → src/services/MetadataService.js
- `Why` --references--> `validateClientPath()`  [INFERRED]
  openspec/changes/dashboard-real-data/proposal.md → src/utils/validators.js
- `Scenario: Summary response is a bare object` --references--> `stats()`  [INFERRED]
  openspec/changes/dashboard-real-data/specs/dashboard-api/spec.md → test/services/FileSystemService.tree.test.js
- `Seam 3 — Data source for the sidebar` --references--> `loadGlobalData()`  [INFERRED]
  openspec/changes/dashboard-real-data/p6-contract.md → public/assets/js/app.js
- `Decision` --references--> `getSummary()`  [INFERRED]
  docs/decisions/ADR-002-dashboard-data-architecture.md → src/controllers/dashboard.controller.js

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

## Communities (73 total, 3 thin omitted)

### Community 0 - "Phase 7 — Verified Facts (normative for all P7 agents)"
Cohesion: 0.15
Nodes (12): `/api/health` vs `/api/dashboard/health` — two different things, File ownership, Live payload — `GET /api/dashboard/summary`, Load average is deliberately absent, New files that REPO_MAP must list, No history is retained, Phase 7 — Verified Facts (normative for all P7 agents), Response envelope convention — correct the current documentation (+4 more)

### Community 1 - "fs.controller.js"
Cohesion: 0.15
Nodes (22): Streaming as the default for I/O-heavy endpoints (rationale: uploads/download/ZIP are piped, never buffered whole in memory), API, AppError, archiver, createFolder(), deleteItems(), downloadFile(), downloadZip() (+14 more)

### Community 2 - "/graphify (knowledge graph pipeline)"
Cohesion: 0.06
Nodes (48): Discover the Stack First, Watch Debounce, /graphify add <url> (ingest), --watch Background Folder Watcher, FalkorDB Export (--falkordb), MCP Server Export (--mcp), Neo4j Export (--neo4j), SVG and GraphML Exports (+40 more)

### Community 3 - "Hardening Patterns"
Cohesion: 0.11
Nodes (22): assertSafeUrl (SSRF allowlist resolver), Broken Access Control Prevention Pattern, Broken Authentication Prevention Pattern, Dependency Audit Triage Decision Tree, Destructive Path Controls (Allowlisted Root, Depth, Ownership), File Upload Safety, Hardening Patterns, Injection Prevention (Parameterized Queries) (+14 more)

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
Cohesion: 0.17
Nodes (18): Feeding CI Failures Back to Agents, Debugging and Error Recovery, Error-Specific Patterns, Instrumentation Guidelines, The Stop-the-Line Rule, The Triage Checklist, Observability and Instrumentation, Cardinality Is the Failure Mode (+10 more)

### Community 9 - "app.js"
Cohesion: 0.06
Nodes (47): D15 - Frontend findings (Phase 6), Frontend state model, File ownership (no two agents touch the same file), Non-negotiables, Phase 6 — Shared Frontend Contract, Seam 1 — Sidebar storage (Agent A implements; B and C only empty the markup), Seam 2 — Sidebar identity (Agent A implements; B and C only empty the markup), Seam 3 — Data source for the sidebar (+39 more)

### Community 10 - "Optimization Patterns"
Cohesion: 0.18
Nodes (13): Bundle Size and Code Splitting, Cache Invalidation Strategy, Cache Key Correctness, Cache Stampede Guard, Caching Layer Selection, Connection Pool Exhaustion, When an Index Will Not Help, N+1 Query Anti-Pattern (+5 more)

### Community 11 - "package.json"
Cohesion: 0.12
Nodes (15): description, devDependencies, nodemon, directories, doc, keywords, main, name (+7 more)

### Community 12 - "ADDED Requirements"
Cohesion: 0.05
Nodes (38): ADDED Requirements, Dashboard Frontend, Purpose, Requirement: Backend-Owned Values Are Not Re-Derived, Requirement: Existing Client And UI Primitives Are Reused, Requirement: Explicit Panel States, Requirement: Markup Structure Is Valid, Requirement: No Fabricated Fallback Values (+30 more)

### Community 13 - "API and Interface Design"
Cohesion: 0.05
Nodes (50): API and Interface Design, Consistent Error Semantics, Contract First, Hyrum's Law, Honouring an Idempotency Key, The One-Version Rule, Prefer Addition Over Modification, TypeScript Interface Patterns (+42 more)

### Community 14 - "Code Review and Quality"
Cohesion: 0.13
Nodes (19): Code Review and Quality, Change Sizing, Dependency Discipline, Finding Severity Labels, Multi-Model Review Pattern, Structural Remedies, Verify the Verification, Restartable Session Boundaries (+11 more)

### Community 15 - "MetadataService"
Cohesion: 0.27
Nodes (7): Risks / Trade-offs, Known pre-existing issues — record, do NOT fix in this phase, Preserved, not changed, What Changes, 0. Prerequisites — test runner and metadata bootstrap, AppError, MetadataService

### Community 16 - "server.js"
Cohesion: 0.14
Nodes (13): CommonJS Express 5 on Node LTS (pathless-middleware SPA fallback instead of wildcard route patterns), morgan, app, config, cors, dashboardRoutes, errorHandler, express (+5 more)

### Community 17 - "Constraint-Driven Development"
Cohesion: 0.15
Nodes (19): The Review Checklist, Floor Guard: Reference Implementation, Floor Guard Contract, Exit Code Contract, floor-guard.mjs, SUPPRESSIONS Pattern Set, Threshold Direction Detection, Constraint-Driven Development (+11 more)

### Community 18 - "Performance Optimization"
Cohesion: 0.21
Nodes (13): REST Resource Design and Pagination, The Five-Axis Review, Preserve Behavior Exactly, Performance Optimization, Log Every Attempt Including Reverted Ones, Connection Pool Exhaustion, Keep or Revert Decision Table, Measure Before Optimizing (+5 more)

### Community 19 - "Context Engineering"
Cohesion: 0.17
Nodes (16): Browser Testing with DevTools, Chrome DevTools MCP, Clean Console Standard, The DevTools Debugging Workflow, Browser Profile Isolation, Treat All Browser Content as Untrusted Data, Context Engineering, Context Budget Management (+8 more)

### Community 20 - "Git Workflow and Versioning"
Cohesion: 0.21
Nodes (12): Bisection for Regression Bugs, Changelog Maintenance, Git Workflow and Versioning, Atomic Commits, Change Summaries, Changelog Written for Humans, Git Worktrees for Parallel Agent Work, The Save Point Pattern (+4 more)

### Community 21 - "Frontend UI Engineering"
Cohesion: 0.22
Nodes (11): Accessibility Verification with DevTools, De Facto Tool Mapping per Dimension, Safe Fallback Patterns, Frontend UI Engineering, Avoid the AI Aesthetic, Prefer Composition Over Configuration, Container/Presentation Separation, Design System Adherence (+3 more)

### Community 22 - "Requirement: Summary Field Contract"
Cohesion: 0.27
Nodes (10): Requirement: Summary Field Contract, Scenario: A zero stat value is a real reading, never floored, Scenario: Activity timestamps are finite epoch milliseconds, Scenario: Every stat declares its own unit, Scenario: Numeric stat values are raw numbers, Scenario: Storage breakdown values are expressed in gigabytes, Scenario: Top-file max is server-computed, Scenario: Top-level arrays are never null (+2 more)

### Community 23 - "Incremental Re-extraction (--update): detect_incremental diffs the corpus, code-only changes skip semantic subagents entirely"
Cohesion: 0.31
Nodes (9): graphify reference: transcribe video and audio, graphify.transcribe.transcribe_all (video/audio -> .graphify_transcripts.json), Whisper Prompt Composition Step (LLM composes a one-sentence domain hint from detect god nodes; env vars must be exported so the child Python process sees them), graphify reference: incremental update and cluster-only, build_merge (reads graph.json without a NetworkX round-trip so calls/implements/imports edge direction is always preserved), Cluster-Only Self-Contained Rebuild (re-clusters and regenerates reports; Steps 5-9 must not re-run because prior cleanup deleted their intermediates), Incremental Re-extraction (--update): detect_incremental diffs the corpus, code-only changes skip semantic subagents entirely, Semantic Manifest Stamping (only files that actually produced output this run get stamped; unstamped chunks are re-queued next update) (+1 more)

### Community 24 - "ADDED Requirements"
Cohesion: 0.06
Nodes (35): ADDED Requirements, Filesystem Security, Purpose, Requirement: Filesystem-Derived Strings Are Escaped Before Markup Insertion, Requirement: No Absolute Path In Any Response, Requirement: Reverse Client-Path Conversion Is Consistent, Requirement: Separator-Boundary Path Containment, Requirement: Single Resolution Basis (+27 more)

### Community 25 - "dependencies"
Cohesion: 0.25
Nodes (8): dependencies, archiver, cors, dotenv, express, helmet, morgan, multer

### Community 26 - "ADDED Requirements"
Cohesion: 0.06
Nodes (30): ADDED Requirements, Dashboard Metadata, Purpose, Requirement: Activity Retrieval Is Exposed, Requirement: Activity Shape Is Reused, Not Redesigned, Requirement: Activity Timestamps Are Explicit And Finite, Requirement: Download Ranking Is Computed Server-Side, Requirement: Metadata Failures Never Block Filesystem Operations (+22 more)

### Community 27 - "fs.routes.js"
Cohesion: 0.25
Nodes (7): Layered Flow routes -> controllers -> services -> fs (controllers never bypass services; routes never register filesystem calls), Layered backend with framework-free services (rationale: a monolithic route file would scatter path validation exactly where traversal bugs breed), Dependency Rules (services never import Express/req/res; page modules must not duplicate API calls), Where to Add Things (endpoint, disk operation, metadata entity, validation rule, shared UI, page module, page style), express, fsController, router

### Community 28 - "env.js"
Cohesion: 0.29
Nodes (5): dotenv, config, dotenv, path, config

### Community 29 - "ADDED Requirements"
Cohesion: 0.07
Nodes (28): ADDED Requirements, Cross-Platform Contract, Purpose, Requirement: Byte Accounting Is Platform-Neutral, Requirement: Capacity Degrades Without Platform Branching, Requirement: Identical HTTP Contract On Every Host, Requirement: Link Handling Is Uniform Across Hosts, Requirement: Native Semantics Are Used Internally (+20 more)

### Community 30 - "ADDED Requirements"
Cohesion: 0.08
Nodes (24): ADDED Requirements, Filesystem Aggregation, Purpose, Requirement: Bounded Traversal, Requirement: Byte Totals Exclude Directory Entry Size, Requirement: File And Folder Counting, Requirement: File-Type Breakdown Reuses The Existing Taxonomy, Requirement: Inaccessible Subtrees Degrade Gracefully (+16 more)

### Community 31 - "ADDED Requirements"
Cohesion: 0.08
Nodes (23): ADDED Requirements, Dashboard Historical Metrics, Purpose, Requirement: Absence Of Retained History Is Acknowledged, Requirement: Instantaneous Figures Are Labelled Honestly, Requirement: Period-Ranged Traffic Chart Is Removed, Requirement: Period Selector Is Removed Or Made Functional, Requirement: Sparklines Are Removed (+15 more)

### Community 32 - "scripts"
Cohesion: 0.50
Nodes (4): scripts, dev, start, test

### Community 33 - "repository"
Cohesion: 0.67
Nodes (3): repository, type, url

### Community 35 - "ADDED Requirements"
Cohesion: 0.09
Nodes (22): ADDED Requirements, Dashboard Health, Purpose, Requirement: Dashboard Health Is A Separate Endpoint From Liveness, Requirement: Health Failures Do Not Corrupt The Summary, Requirement: Health Reflects Real Platform Data, Requirement: Health Response Is A Bare Metric Array, Requirement: Metrics Are Honest About Units (+14 more)

### Community 36 - "ADDED Requirements"
Cohesion: 0.09
Nodes (22): ADDED Requirements, Purpose, Requirement: Capacity Is Nullable And Declared Unavailable, Requirement: Storage Root Containment Determines The Volume, Requirement: Three Distinct Quantities, Requirement: Volume Availability Reflects A Real Reading, Requirement: Volume Usage Uses Available-Block Semantics, Scenario: Available volume is declared available (+14 more)

### Community 37 - "FileSystemService.js"
Cohesion: 0.20
Nodes (10): ref_os, { classifyFile, emptyBreakdown }, fs, os, PathService, CATEGORIES, classifyFile(), emptyBreakdown() (+2 more)

### Community 38 - "dashboard.test.js"
Cohesion: 0.11
Nodes (14): ref_node_vm, assert, createFormatStub(), DASHBOARD_SRC, dashboardSource, fs, INDEX_SRC, indexSource (+6 more)

### Community 39 - "Decisions"
Cohesion: 0.14
Nodes (14): D10 — Remove historical affordances; record no history, D12 — Self-terminating polling; adopt the existing pattern, D13 — Metadata bootstrap owned by `MetadataService`; restore `data/.gitkeep`, D14 — Sidebar scope is all four pages, D1 — Mount `/api/dashboard` before the `/api` catch-all, D2 — Bare responses, not `{success, data}`, D3 — No `DashboardService`, D4 — Skip links entirely; do not resolve-then-check (+6 more)

### Community 40 - ".resolveSecurePath"
Cohesion: 0.27
Nodes (10): PathService as the Single Path Boundary (client paths only cross the API; absolute securePath never leaves the services layer), A single, mandatory path boundary (rationale: the API accepts arbitrary client paths, so path containment is centralized to be auditable in one function), Context, D11 — `node:test`, no dependency, no `engines`, D5 — `PathService` separator boundary, single resolution basis, Security boundary, Testing strategy, Security boundary (+2 more)

### Community 41 - "AGENTS.md - Dimension Files Manager operating rules"
Cohesion: 0.06
Nodes (52): AGENTS.md - Dimension Files Manager operating rules, AppError Error Contract (throw AppError from any layer; errorHandler is the sole serializer; never res.status().json() an error inline), Downloads Never Navigate the Main Frame (hidden iframe for files, hidden form POST for ZIP), No-Build Frontend (IIFE modules on window; script tag load order is part of the contract), Response Envelope Contract ({ success: true, data } / { success: false, error }), architecture.md - Legacy Deep-Dive Architecture Document, Dimension Design System Rules (violet #6b62f2 only as gradient wash, pill CTAs, weight 500 max, 1px hairline borders, 2% colorfulness is intentional), Global Namespace Map (window.AFM, Theme, Sidebar, Dashboard, Files, Uploads - no other globals) (+44 more)

### Community 42 - "PathService.test.js"
Cohesion: 0.13
Nodes (12): AppError, assert, ENV_MODULE, fs, NORMALIZED_ROOT_SPELLINGS, os, path, SERVICE_MODULE (+4 more)

### Community 43 - "FileSystemService"
Cohesion: 0.17
Nodes (13): ADR-002 — Dashboard Data Architecture: Real Aggregates, Typed Absences, Bounded Walks, Consequences, Context, Decision, References, D7 — Reuse `_extKey` in place, D8c - Where stale-metadata filtering lives, Service responsibilities (+5 more)

### Community 44 - "Test-Driven Development"
Cohesion: 0.25
Nodes (11): Browser Testing with Chrome DevTools, DAMP Over DRY in Tests, Prefer Real Implementations Over Mocks, The Prove-It Pattern, RED-GREEN-REFACTOR Cycle, Subagent Reproduction Test, Test-Driven Development, Test Pyramid (+3 more)

### Community 45 - "dashboard.controller.js"
Cohesion: 0.28
Nodes (7): BREAKDOWN_COLORS, buildStats(), buildStorageBreakdown(), { CATEGORIES }, FileSystemService, getSummary(), MetadataService

### Community 46 - "app.test.js"
Cohesion: 0.16
Nodes (10): ref_node_fs, APP_PATH, APP_SOURCE, assert, fs, mountSidebar(), path, sidebarNodes() (+2 more)

### Community 47 - "Shipping and Launch"
Cohesion: 0.22
Nodes (11): Definition of Done, Verification Checkpoints, Error Budget Release Gate, Feature Flag Strategy, Monitoring and Observability, Post-Launch Verification, Pre-Launch Checklist, Rollback Strategy (+3 more)

### Community 48 - "MetadataService.js"
Cohesion: 0.20
Nodes (8): Eventually-Consistent Metadata (fire-and-forget writes must never block or fail the filesystem operation they accompany), Node's filesystem is the database (rationale: zero infrastructure, backup = copy two directories; SQLite/Postgres rejected as drift-prone over-engineering), JSON metadata store trade-offs (per-process singleton cache loses consistency under multiple instances; no trash/recycle; silent upload overwrite; npm test is a stub), IMPORTANT: keep the reminder string free of backticks and $(...) constructs., ref_fs, ref_path, fs, path

### Community 49 - "dashboard.contract.test.js"
Cohesion: 0.15
Nodes (11): ref_node_http, assert, fs, http, os, path, NOTE: an unreadable subtree cannot be provoked portably on Windows (chmod is, request() (+3 more)

### Community 50 - "FileSystemService.volume.test.js"
Cohesion: 0.15
Nodes (10): ref_node_os, assert, ENV_MODULE, fs, os, path, PATHSERVICE_MODULE, SERVICE_MODULE (+2 more)

### Community 51 - "FileSystemService.tree.test.js"
Cohesion: 0.15
Nodes (10): ref_node_path, assert, ENV_MODULE, fs, os, path, PATHSERVICE_MODULE, SERVICE_MODULE (+2 more)

### Community 52 - "FileSystemService.rename.test.js"
Cohesion: 0.15
Nodes (10): AppError, assert, ENV_MODULE, fs, os, path, PATHSERVICE_MODULE, SERVICE_MODULE (+2 more)

### Community 53 - "MetadataService.dashboard.test.js"
Cohesion: 0.17
Nodes (10): ref_node_assert, assert, freshStore(), fs, fsp, MetadataServiceSingleton, os, path (+2 more)

### Community 54 - "MetadataService.test.js"
Cohesion: 0.18
Nodes (10): ref_node_test, AppError, assert, freshInstance(), fs, fsp, MetadataServiceSingleton, os (+2 more)

### Community 55 - "CI/CD and Automation"
Cohesion: 0.31
Nodes (10): CI/CD and Automation, Build Cop Role, CI Optimization, Faster is Safer, GitHub Actions CI Configuration, The Quality Gate Pipeline, Rollback Plan, Shift Left (+2 more)

### Community 56 - "ADDED Requirements"
Cohesion: 0.33
Nodes (5): ADDED Requirements, Dashboard API, Purpose, Requirement: Summary Health Mirrors the Health Endpoint, Scenario: Both endpoints offer the same metric row set

### Community 57 - "Proposal"
Cohesion: 0.29
Nodes (6): Capabilities, Impact, Modified Capabilities, New Capabilities, Proposal, Why

### Community 58 - "Interview Me"
Cohesion: 0.36
Nodes (8): Four-Question Intake with Defaults, Confusion Management, Interview Me, The 95 Percent Confidence Stop, Hypothesis with a Confidence Number, One Question at a Time, Confirmed Statement of Intent, Terminal Turn and Stop Rule

### Community 59 - "Skill Discovery Map"
Cohesion: 0.32
Nodes (8): Keeping the Spec Alive, Spec-Driven Development, Core Operating Behaviors, Definition of Done (project-wide bar), Lifecycle Sequence of Skills, Skill Discovery Map, Surface Assumptions, Using Agent Skills

### Community 60 - "Architecture"
Cohesion: 0.14
Nodes (13): Architecture, Cross-platform considerations, Design, Filesystem aggregation strategy, Goals / Non-Goals, Human Approval Points, Migration Plan, Open Questions (+5 more)

### Community 61 - "Tasks"
Cohesion: 0.25
Nodes (7): 2. Dashboard API — route and controller skeleton, 7. Documentation, 8. Integration verification, 9. Final review, Definition of Done, Dependency chain, Tasks

### Community 62 - "Three-Tier Boundary System (Always / Ask First / Never)"
Cohesion: 0.29
Nodes (7): Data Classification Table, Schema Validation at Boundaries, Data Classification, Data Minimization and Privacy, Three-Tier Boundary System (Always / Ask First / Never), Spec Document Six Core Areas, Boundaries (Always / Ask First / Never)

### Community 63 - "Source-Driven Development"
Cohesion: 0.24
Nodes (11): LLM Output Handling, Model Output Is Untrusted Input, OWASP Top 10 for LLM Applications (2025), Cite Your Sources, Detect Stack and Versions, Docs vs. Existing Code Conflict Detection, Fetch Official Documentation, Implement Following Documented Patterns (+3 more)

### Community 64 - "dashboard.routes.js"
Cohesion: 0.40
Nodes (4): express, dashboardController, express, router

### Community 66 - "Requirement: Bare Response Envelope"
Cohesion: 0.40
Nodes (5): Requirement: Bare Response Envelope, Scenario: Bare shape matches read-endpoint precedent, Scenario: Enveloped response is rejected by contract, Scenario: Health response is a bare array, Scenario: Summary response is a bare object

### Community 67 - "Requirement: Partial Capability Failure"
Cohesion: 0.40
Nodes (5): Requirement: Partial Capability Failure, Scenario: Metadata store unavailable, Scenario: Partial-failure convention is documented, Scenario: Storage capacity unavailable, Scenario: Storage root unreadable

### Community 68 - "PathService.js"
Cohesion: 0.40
Nodes (3): AppError, config, path

### Community 69 - "Requirement: Filesystem Router Separation"
Cohesion: 0.50
Nodes (4): Requirement: Filesystem Router Separation, Scenario: Dedicated route module, Scenario: No new service tier, Scenario: Route module contains no business logic

### Community 70 - "Requirement: No Operating-System Path Leakage"
Cohesion: 0.50
Nodes (4): Requirement: No Operating-System Path Leakage, Scenario: Filenames are basenames only, Scenario: No drive letter reaches the client, Scenario: Server error messages carry no filesystem detail

### Community 71 - "Requirement: Route Registration Precedes Catch-All"
Cohesion: 0.50
Nodes (4): Requirement: Route Registration Precedes Catch-All, Scenario: Dashboard routes are reachable, Scenario: Filesystem router is not remounted under the dashboard prefix, Scenario: Unknown API paths still reach the catch-all

## Ambiguous Edges - Review These
- `architecture.md - Legacy Deep-Dive Architecture Document` → `STRUCTURE.md - Frontend-Era Project Structure Map`  [AMBIGUOUS]
  docs/STRUCTURE.md · relation: references
- `The Review Checklist` → `CONSTRAINTS.md`  [AMBIGUOUS]
  .agents/skills/code-review-and-quality/SKILL.md · relation: conceptually_related_to

## Knowledge Gaps
- **456 isolated node(s):** `idea-refine.sh script`, `$schema`, `plugin`, `name`, `version` (+451 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 536 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `architecture.md - Legacy Deep-Dive Architecture Document` and `STRUCTURE.md - Frontend-Era Project Structure Map`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `The Review Checklist` and `CONSTRAINTS.md`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `stats()` connect `Requirement: Summary Field Contract` to `Phase 7 — Verified Facts (normative for all P7 agents)`, `FileSystemService.tree.test.js`, `Requirement: Bare Response Envelope`, `FileSystemService`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `Performance Optimization` connect `Performance Optimization` to `Observability and Instrumentation`, `Constraint-Driven Development`, `Optimization Patterns`, `CI/CD and Automation`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `Test-Driven Development` connect `Test-Driven Development` to `/graphify (knowledge graph pipeline)`, `Skill Discovery Map`, `Planning and Task Breakdown`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Are the 9 inferred relationships involving `MetadataService` (e.g. with `Context` and `D13 — Metadata bootstrap owned by `MetadataService`; restore `data/.gitkeep``) actually correct?**
  _`MetadataService` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Are the 6 inferred relationships involving `FileSystemService` (e.g. with `Context` and `D7 — Reuse `_extKey` in place`) actually correct?**
  _`FileSystemService` has 6 INFERRED edges - model-reasoned connections that need verification._