# Business Glossary — Oracle APEX Module

A full-stack, bilingual (English & Arabic) business term management system built on Oracle APEX. It provides a hierarchical glossary browser, full-text search, term submission/editing with an approval workflow, and bilingual RTL/LTR rendering.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [File Reference](#file-reference)
4. [Database Layer](#database-layer)
5. [Frontend Layer](#frontend-layer)
6. [APEX Ajax Callbacks](#apex-ajax-callbacks)
7. [Data Flows](#data-flows)
8. [Configuration Constants](#configuration-constants)
9. [Setup & Deployment](#setup--deployment)
10. [Workflow: New Term Submission](#workflow-new-term-submission)
11. [Key Gotchas](#key-gotchas)

---

## Overview

| Property | Value |
|----------|-------|
| Platform | Oracle APEX (page 167 "Business Glossary") |
| Database | Oracle 19c — schema `SC_QAWS` |
| Languages | English + Arabic (bilingual) |
| Term count | 6,000+ across 100+ themes |
| Hierarchy | Glossary → Topic → Theme → [Dataset →] Term |

### What it does

- **Browse** — hierarchical left-nav tree (Topic → Theme → Terms with Prev/Next pagination)
- **View** — term card with EN & AR name, definitions, code, source, parent reference
- **Search** — full-text search across EN/AR names, definitions, code, and term ref
- **Submit New Term** — auto-generated code, bilingual form, approval workflow
- **Edit Term** — modify existing terms; edit creates a draft fork pending review
- **Workflow** — submitted terms are routed to the Methodology Team for approval

---

## Architecture

```
Browser (APEX Page 167)
  └── glossary.js  +  glossary.css
        │
        │  apex.server.process() — AJAX calls
        │
  ┌─────▼──────────────────────────────────────────────┐
  │             APEX Ajax Callbacks                     │
  │  GET_THEME_TERMS  │  SEARCH_GLOSSARY_TERMS          │
  │  GET_NEW_TERM_CODE│  GET_PARENT_TERMS               │
  │  SAVE_DRAFT_TERM  │  GET_GLOSSARY_CODES             │
  └─────┬──────────────────────────────────────────────┘
        │
  ┌─────▼──────────────────────────────────────────────┐
  │            Oracle DB  (SC_QAWS schema)              │
  │                                                     │
  │  Materialized View: BUSINESS_GLOSSARY               │
  │    (flattens glossary + custom_field tables)        │
  │    Indexes: topic_theme, viewing, status            │
  │                                                     │
  │  PL/SQL Functions:                                  │
  │    F_BUSINESS_GLOSSARY_TREE()  → HTML nav tree      │
  │    F_GLOSSARY_THEME_TERMS()    → JSON term object   │
  │                                                     │
  │  Base Tables:                                       │
  │    glossary, custom_field, status,                  │
  │    security_classification, involved_party …        │
  │                                                     │
  │  Workflow Queue:                                     │
  │    SEC_T_PROCESSES_LANDING                          │
  └─────────────────────────────────────────────────────┘
```

---

## File Reference

```
Business_Glossary/
│
├── glossary.js                        Frontend app (Vanilla JS IIFE module)
├── glossary.css                       Styling — grid, RTL, bilingual, responsive
│
├── V_BUSINESS_GLOSSARY.sql            CREATE MATERIALIZED VIEW definition
├── F_BUSINESS_GLOSSARY_TREE.sql       PL/SQL function → HTML nav tree (CLOB)
├── F_GLOSSARY_THEME_TERMS.sql         PL/SQL function → single term JSON
│
├── apex_callback_GET_GLOSSARY_CODES.sql    Returns all distinct term codes
├── apex_callback_GET_NEW_TERM_CODE.sql     Generates next code (MAX + 1)
├── apex_callback_GET_PARENT_TERMS.sql      Returns parent nodes for dropdown
├── apex_callback_SEARCH_GLOSSARY_TERMS.sql Full-text search (max 50 results)
├── apex_callback_SAVE_DRAFT_TERM.sql       Insert draft term + workflow ticket
│
├── glossary_oracle.sql                27 MB Oracle dump — base tables + seed data
├── load_glossary.py                   Python loader for glossary_oracle.sql
├── generate_glossary_template.py      Generates Excel bulk-import template
└── Business_Glossary_Import_Template.xlsx  Pre-filled Excel template
```

---

## Database Layer

### Materialized View: `BUSINESS_GLOSSARY`

Joins the `glossary` (hierarchy) and `custom_field` (Arabic fields + source) tables into a single flat view. This is the source for all read queries.

**Key columns:**

| Column | Description |
|--------|-------------|
| `term_name_en` / `term_name_ar` | English and Arabic term names |
| `term_definition_en` / `term_definition_ar` | Bilingual definitions |
| `term_ref` | Unique reference like `GLOS-123` |
| `code` | Short numeric code (C#) |
| `parent_term_ref` | Reference to parent term |
| `"Axon Viewing"` | `'Public'` = visible in UI, `'Private'` = hidden |
| `term_status` | Active / Pending Review / Draft |
| `topic_name`, `theme_name` | Hierarchy navigation keys |

**Refresh:**
```sql
EXEC DBMS_MVIEW.REFRESH('SC_QAWS.BUSINESS_GLOSSARY', 'C');
```
Must be run manually after bulk inserts or approval of new terms.

**Indexes:**
- `idx_bg_topic_theme` — fast theme-based browsing
- `idx_bg_viewing` — filters Public/Private + glossary name
- `idx_bg_status` — status-based queries

---

### Base Tables

| Table | Purpose |
|-------|---------|
| `glossary` | Hierarchical nodes (6,000+ rows). Node types: 1=Topic, 2/5=Theme, 3=Term, 9=Dataset |
| `custom_field` | Bilingual metadata. Field IDs: 120=AR name, 121=AR definition, 146=Source |
| `status` | Lookup: 1=Active, 3=Pending Review |
| `security_classification` | Classification lookup |
| `SEC_T_PROCESSES_LANDING` | Workflow queue — one row per submitted draft |

---

### PL/SQL Functions

#### `F_BUSINESS_GLOSSARY_TREE()`
- Returns a `CLOB` of HTML for the left-nav tree
- Rendered server-side on page load (static tree)
- Sorts "Others" and "Generic" themes to the end
- Output structure: `<div class="gls-tree-wrap">` → `<topic-btn>` → `<theme-btn>`

#### `F_GLOSSARY_THEME_TERMS(p_topic_name, p_theme_name, p_term_seq)`
- Returns JSON for a single term at position `p_term_seq` within a theme
- Uses `ROW_NUMBER() OVER (ORDER BY term_name_en, id)` for deterministic pagination
- JSON shape:
  ```json
  {
    "seq": 1, "total": 42,
    "id": 123, "code": "1", "term_ref": "GLOS-1",
    "name_en": "...", "name_ar": "...",
    "def_en": "...", "def_ar": "...",
    "dataset_en": "...", "dataset_ar": "...",
    "source": "...", "parent_ref": "..."
  }
  ```

---

## Frontend Layer

### `glossary.js` — `GlossaryApp` IIFE Module

**State:**

| Variable | Purpose |
|----------|---------|
| `termCache` | Client-side cache of loaded terms (key = `topic|theme|seq`) |
| `curTopic`, `curTheme`, `curSeq` | Current navigation position |
| `isDirty` | `true` when unsaved edits exist |

**Core functions:**

| Function | Description |
|----------|-------------|
| `init()` | Entry point — binds events, sets up search |
| `loadTerm(topic, theme, seq)` | Ajax fetch + render term card |
| `fillCard(container, data)` | Injects JSON into fixed HTML card template |
| `loadNewTermCard()` | Renders blank form + fetches auto code + parents |
| `saveDraft()` | Validates form, POSTs to `SAVE_DRAFT_TERM` |
| `doSearch(query)` | Calls `SEARCH_GLOSSARY_TERMS`, renders result list |
| `bindTopics()` | Click handlers for topic expand/collapse |
| `bindThemes()` | Click handlers for theme selection |

**APEX element IDs used:**

| ID | Element |
|----|---------|
| `gls-search-input` | Search text input |
| `gls-right-content` | Term card display area |
| `gls-left-panel` | Navigation tree container |
| `gls-hdr-edit` | Edit button |
| `gls-hdr-submit` | Submit/Save button |
| `gls-hdr-new-term` | "+ New Term" button |

---

### `glossary.css`

- **Layout:** 300px fixed left nav + flexible right content, 680px fixed card height
- **Responsive:** ≤900px → single column; ≤640px → mobile stack
- **RTL:** `.gls-rtl` class sets `direction: rtl; text-align: right` for Arabic fields
- **Modes:** `.gls-view-mode` (read-only) vs `.gls-edit-mode` (editable inputs)

---

## APEX Ajax Callbacks

All callbacks communicate via `apex.server.process()` on the JS side and `HTP.P()` on the PL/SQL side.

| Callback | JS Input | Returns | Used for |
|----------|----------|---------|----------|
| `GET_THEME_TERMS` | `x01`=topic, `x02`=theme, `x03`=seq | JSON term object | Navigate terms in a theme |
| `SEARCH_GLOSSARY_TERMS` | `x01`=query string | JSON array of results | Search bar |
| `GET_NEW_TERM_CODE` | — | `{code, term_ref}` | Auto-code new term form |
| `GET_PARENT_TERMS` | — | `[{ref, label}, ...]` | Parent dropdown |
| `GET_GLOSSARY_CODES` | — | `["1","2", ...]` | Code lookup (if used) |
| `SAVE_DRAFT_TERM` | `x01`=JSON payload | `{status, id, ...}` | Submit new / edited term |

---

## Data Flows

### Browse & View Term

```
User clicks theme
  → JS bindThemes() → loadTerm(topic, theme, 1)
  → apex.server.process('GET_THEME_TERMS', {x01, x02, x03})
  → F_GLOSSARY_THEME_TERMS() queries BUSINESS_GLOSSARY MV
  → JSON returned → fillCard() renders term
  → Prev/Next buttons update seq and re-call loadTerm()
```

### Search

```
User types + clicks Search
  → doSearch(query)
  → apex.server.process('SEARCH_GLOSSARY_TERMS', {x01: query})
  → SQL: LIKE '%QUERY%' on name_en, name_ar, def_en, code, term_ref (max 50)
  → showSearchResults() renders clickable list
  → Click result → activate theme + loadTerm()
```

### Submit New Term

```
User clicks "+ New Term"
  → loadNewTermCard() renders blank form
  → GET_NEW_TERM_CODE → auto fills code & term_ref
  → GET_PARENT_TERMS → populates parent dropdown
  → User fills form → clicks "Submit for Approval"
  → saveDraft() collects + validates → POST to SAVE_DRAFT_TERM
  → PL/SQL: INSERT glossary (ispublic=0, status=3)
           INSERT custom_field rows (AR name, AR def, source)
           INSERT workflow ticket → SEC_T_PROCESSES_LANDING (type='SCAD-BG')
  → Returns {status: "ok", id: ...}
  → JS shows success message
```

### Edit Existing Term

```
User clicks "Edit"
  → JS unlocks .gls-user-field inputs (removes readonly)
  → User edits → isDirty = true → "Submit Changes" enabled
  → saveDraft() (type="UPDATE") → SAVE_DRAFT_TERM
  → PL/SQL creates NEW draft (fork), original stays Active
  → Methodology Team reviews → approves/rejects
```

---

## Configuration Constants

These are hardcoded in SQL and JS — change with care:

| Constant | Location | Value | Meaning |
|----------|----------|-------|---------|
| Custom field ID — AR name | SQL | `120` | Arabic term name field |
| Custom field ID — AR def | SQL | `121` | Arabic definition field |
| Custom field ID — Source | SQL | `146` | Source/reference field |
| Node type — Topic | SQL | `1` | glossary.type = Topic |
| Node type — Theme | SQL | `2`, `5` | glossary.type = Theme |
| Node type — Term | SQL | `3` | glossary.type = Standard term |
| Node type — Dataset | SQL | `9` | glossary.type = Dataset container |
| Status — Active | SQL | `1` | Approved, publicly visible |
| Status — Pending Review | SQL | `3` | Draft awaiting approval |
| Workflow type | SQL | `'SCAD-BG'` | Routes to Methodology Team |
| Excluded glossary | SQL/JS | `'National Standards for Statistical Data (NSSD)'` | Never shown |
| Search result limit | SQL | `50` | Max rows returned per search |
| MV name | SQL | `'SC_QAWS.BUSINESS_GLOSSARY'` | Materialized view to refresh |

---

## Setup & Deployment

### 1. Load Base Data

```bash
# Install dependencies
pip install oracledb openpyxl

# Edit connection in load_glossary.py (line ~15):
# user="SC_QAWS", password="...", dsn="10.40.76.233:1535/APEXREPO"

python load_glossary.py
```

This script:
- Parses `glossary_oracle.sql` (27 MB)
- Creates tables and indexes
- Inserts data in 500-row batches with duplicate handling

### 2. Create Database Objects

Run in order (as SC_QAWS or DBA):

```sql
-- 1. Materialized View
@V_BUSINESS_GLOSSARY.sql

-- 2. PL/SQL Functions
@F_BUSINESS_GLOSSARY_TREE.sql
@F_GLOSSARY_THEME_TERMS.sql

-- 3. APEX Callbacks (create via APEX Shared Components > Dynamic Actions > AJAX Callbacks)
-- Paste content from each apex_callback_*.sql file
```

### 3. Refresh Materialized View

```sql
EXEC DBMS_MVIEW.REFRESH('SC_QAWS.BUSINESS_GLOSSARY', 'C');
```

### 4. APEX Page Setup (Page 167)

- Add `glossary.css` to page CSS files
- Add `glossary.js` to page JS files
- Add `F_BUSINESS_GLOSSARY_TREE()` output to left panel region
- Register all 6 APEX Ajax Callbacks (names must match exactly)

### 5. Generate Excel Import Template (optional)

```bash
python generate_glossary_template.py
# Outputs: Business_Glossary_Import_Template.xlsx
```

---

## Workflow: New Term Submission

```
1. User submits term via UI
       ↓
2. SAVE_DRAFT_TERM inserts:
   - glossary row (ispublic = 0, status = 3 "Pending Review")
   - custom_field rows for AR name, AR def, source
   - SEC_T_PROCESSES_LANDING row (type = 'SCAD-BG')
       ↓
3. Methodology Team receives workflow task
       ↓
4. Team reviews, edits if needed, APPROVES:
   - UPDATE glossary SET ispublic = 1, status = 1 (Active)
       ↓
5. MV refresh:
   EXEC DBMS_MVIEW.REFRESH('SC_QAWS.BUSINESS_GLOSSARY', 'C');
       ↓
6. Term now visible to all users in the glossary
```

---

## Key Gotchas

1. **MV must be refreshed manually** — new/approved terms do NOT appear until `DBMS_MVIEW.REFRESH` is run. Consider scheduling this with a DBMS_SCHEDULER job.

2. **`"Axon Viewing"` controls visibility** — the MV column `"Axon Viewing"` must equal `'Public'` for a term to appear. This is derived from `glossary.ispublic`.

3. **Arabic fields are in `custom_field`** — not in the `glossary` table. Always INSERT corresponding rows with field IDs 120 (AR name), 121 (AR def), 146 (source) alongside each glossary row.

4. **Edit creates a fork** — editing an existing term does NOT update it in place. A new draft row is created. The original remains active until the Methodology Team handles the workflow.

5. **APEX callback names are case-sensitive** — `apex.server.process('GET_THEME_TERMS', ...)` must exactly match the APEX Shared Components callback name.

6. **Excluded glossary** — `'National Standards for Statistical Data (NSSD)'` is hardcoded in SQL and JS. Terms under this glossary are filtered out everywhere.

7. **Search uses LIKE, not full-text index** — performance degrades at very high row counts. If the dataset grows significantly, consider an Oracle Text index on BUSINESS_GLOSSARY.

8. **`termCache` is session-scoped** — refreshing the page clears the JS cache. This is intentional (no stale data).
