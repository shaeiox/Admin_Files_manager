---
title: Health Summary
type: health
language:
  - javascript
  - bash
status: generated
complexity: medium
dependencies: []
related-notes:
  - "[[Limitations]]"
  - "[[Code Review]]"
  - "[[Dependency Map]]"
  - "[[Index]]"
canonical-source: src/
generated-by: code-to-docs
generated-at: 2026-10-14T05:05:10Z
mode: full
tags:
  - code-docs
  - health
---

# Health Summary

88 issues were recorded across 9 modules. Details live in [[Limitations]] (design constraints) and [[Code Review]] (bugs, risks and improvements).

## Issues by Severity

```mermaid
%%{init: {'theme':'base','themeVariables':{'pie1':'#d03b3b','pie2':'#fab219','pie3':'#0ca30c','pieStrokeColor':'#ffffff','pieOuterStrokeColor':'#c3c2b7'}}}%%
pie showData title Issues by Severity
    "High" : 1
    "Medium" : 25
    "Low" : 62
```

| Severity | Count |
|---|---|
| High | 1 |
| Medium | 25 |
| Low | 62 |
| **Total** | **88** |

## Issues by Type

```mermaid
xychart-beta
    title "Issues by Type"
    x-axis ["Limitations", "Bugs/Risks", "Improvements"]
    y-axis "Count" 0 --> 50
    bar [17, 46, 25]
```

> [!note] `xychart-beta` needs a recent Obsidian Mermaid build; the table below carries the same counts.

| Type | Count |
|---|---|
| Limitations | 17 |
| Bugs/Risks | 46 |
| Improvements | 25 |

## Issues by Module

```mermaid
xychart-beta
    title "Issues by Module"
    x-axis ["Server Bootstrap and Config", "HTTP API Layer", "Storage Services", "Metadata and Settings Stores", "Auth and Access Control", "Frontend Core", "Files Page", "Feature Pages", "Deployment Scripts"]
    y-axis "Count" 0 --> 15
    bar [8, 12, 11, 8, 12, 13, 8, 4, 12]
```

| Module | Count |
|---|---|
| [[Server Bootstrap and Config]] | 8 |
| [[HTTP API Layer]] | 12 |
| [[Storage Services]] | 11 |
| [[Metadata and Settings Stores]] | 8 |
| [[Auth and Access Control]] | 12 |
| [[Frontend Core]] | 13 |
| [[Files Page]] | 8 |
| [[Feature Pages]] | 4 |
| [[Deployment Scripts]] | 12 |

## Health Documents

```dataview
TABLE title, type, status
FROM #code-docs AND #health
SORT title ASC
```
