---
title: Dependency Map
type: architecture
language:
  - javascript
  - bash
status: generated
complexity: medium
dependencies: []
related-notes:
  - "[[System Overview]]"
  - "[[Health Summary]]"
  - "[[Index]]"
canonical-source: server.js
generated-by: code-to-docs
generated-at: 2026-10-14T05:05:10Z
mode: full
tags:
  - code-docs
  - architecture
---

# Dependency Map

Module-level dependency graph for Dimension Files Manager. An arrow points from a module to the module it depends on. The same graph is laid out spatially in `Architecture/System Map.canvas`; the narrative is in [[System Overview]].

```mermaid
%%{init: {'theme':'base','flowchart':{'padding':10},'themeVariables':{'fontSize':'14px','lineColor':'#8a8a8a','edgeLabelBackground':'#ffffff','clusterBkg':'#f7f7f5','clusterBorder':'#d9d9d4'}}}%%
graph TD
    M0["Server Bootstrap and Config"]
    M1["HTTP API Layer"]
    M2["Storage Services"]
    M3["Metadata and Settings Stores"]
    M4["Auth and Access Control"]
    M5["Frontend Core"]
    M6["Files Page"]
    M7["Feature Pages"]
    M8["Deployment Scripts"]
    M0 -->|mounts| M1
    M0 -->|initialises| M4
    M1 -->|calls| M2
    M1 -->|reads/writes| M3
    M1 -->|authenticates via| M4
    M2 -->|reads config| M0
    M3 -->|reads config| M0
    M3 -->|uses| M2
    M4 -->|reads config| M0
    M4 -->|uses| M2
    M5 -->|calls| M1
    M6 -->|uses| M5
    M6 -->|calls| M1
    M6 -->|session/CSRF| M4
    M7 -->|uses| M5
    M7 -->|calls| M1
    M7 -->|session/CSRF| M4
    M8 -->|configures/boots| M0
    M8 -->|health-checks| M1
```

> [!warning] Dependency cycle
> [[Server Bootstrap and Config]] → [[HTTP API Layer]] → [[Storage Services]] → [[Server Bootstrap and Config]]. The bootstrap mounts the API, the API calls the services, and the services read configuration owned by the bootstrap module (`src/config/env.js`). [[Metadata and Settings Stores]] and [[Auth and Access Control]] close the same loop by reading config. It is a configuration read rather than a runtime call back into the server, but it means the config module is not a pure leaf. The System Map canvas breaks the cycle for layout by placing the bootstrap ahead of the API and drawing the config-read edges as back edges.

## Dependency Table

| Module | Depends on | Depended on by |
|---|---|---|
| [[Server Bootstrap and Config]] | [[HTTP API Layer]], [[Auth and Access Control]] | [[Storage Services]], [[Metadata and Settings Stores]], [[Auth and Access Control]], [[Deployment Scripts]] |
| [[HTTP API Layer]] | [[Storage Services]], [[Metadata and Settings Stores]], [[Auth and Access Control]] | [[Server Bootstrap and Config]], [[Frontend Core]], [[Files Page]], [[Feature Pages]], [[Deployment Scripts]] |
| [[Storage Services]] | [[Server Bootstrap and Config]] | [[HTTP API Layer]], [[Metadata and Settings Stores]], [[Auth and Access Control]] |
| [[Metadata and Settings Stores]] | [[Server Bootstrap and Config]], [[Storage Services]] | [[HTTP API Layer]] |
| [[Auth and Access Control]] | [[Server Bootstrap and Config]], [[Storage Services]] | [[Server Bootstrap and Config]], [[HTTP API Layer]], [[Files Page]], [[Feature Pages]] |
| [[Frontend Core]] | [[HTTP API Layer]] | [[Files Page]], [[Feature Pages]] |
| [[Files Page]] | [[Frontend Core]], [[HTTP API Layer]], [[Auth and Access Control]] | (none) |
| [[Feature Pages]] | [[Frontend Core]], [[HTTP API Layer]], [[Auth and Access Control]] | (none) |
| [[Deployment Scripts]] | [[Server Bootstrap and Config]], [[HTTP API Layer]] | (none) |
