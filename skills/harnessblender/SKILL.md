---
name: harnessblender
description: Working with harnessblender — blend chosen ingredients (skills, agents, guidelines, mcp servers, plugins) from a cookbook into installable Claude Code plugins, and pour them into projects. Use whenever the user asks to install, add, or pull in a skill or plugin — from GitHub, someone's repo, or "the internet" (e.g. "install the grill-me skill from mattpocock") — to turn something from this conversation into a reusable skill, to remove or uninstall a skill/agent/guideline/mcp/plugin, to create or edit a skill/agent/guideline/mcp-server, to make/blend/edit/pour a recipe, or to bootstrap a new cookbook; also for questions like "where does this belong", "why don't I see my change", or "how do I install this in project X". Always route these through harnessblender — never hand-copy files or hand-edit `.claude-plugin`/`.mcp.json` outside of it.
---

# harnessblender

Terminology (deliberate cocktail metaphor):

| term | meaning |
|---|---|
| **ingredients** | anything blendable: skills, agents, guidelines, mcp servers, plugins |
| **pantry** | your own ingredients, inside the cookbook itself (`pantry/`) |
| **store** | external ingredients, declared in `store.yaml`, cloned into `store/<name>/` (gitignored) |
| **recipe** | a chosen selection of ingredients, saved in `recipes/<name>/recipe.yaml` |
| **blend** | the result of building a recipe: real copies in `recipes/<name>/blend/` (self-contained, portable) |
| **cookbook** | the directory holding `pantry/`, `store/`, `recipes/` — recognized by a `cookbook.yaml` marker file |
| **drinker** | a project folder a blend gets installed into |
| **pour** | installing a blend into a drinker (via the Claude Code CLI) |

harnessblender itself (this tool, this skill, the scripts) carries no personal content —
everything specific lives in a cookbook. This skill ships bundled with the tool, so it's usable
the moment harnessblender is installed, even before any cookbook exists yet.

## No cookbook yet?

Run `harnessblender init <path>` to scaffold one: marker file, `pantry/{skills,agents,mcp-servers,
guidelines,plugins}`, `store.yaml`, `recipes/`, plus a `pantry/README.md` documenting the discovery
conventions below.

## Map

| Path | Role | Edit? |
|---|---|---|
| `<cookbook>/pantry/{skills,agents,mcp-servers,guidelines,plugins}` | your own ingredients | ✅ yes, this is where you write |
| `<cookbook>/store/<name>/` | gitignored checkout of an external source | ❌ never — regenerates via `fetch`, changes are lost |
| `<cookbook>/store.yaml` | which external sources exist (name + url) | ✅ yes |
| `<cookbook>/recipes/<name>/recipe.yaml` | a saved selection | ✅ yes (or via the picker) |
| `<cookbook>/recipes/<name>/blend/` | generated plugin copy | ❌ never — `blend` overwrites without warning |
| `<cookbook>/cookbook.yaml` | marker file + name/owner/exclude_dirs | ✅ yes |

## Decision tree

**New own skill** → a directory under `pantry/skills/<namespace>/<skill-name>/` (namespace
conventions are up to each cookbook — see its own documentation if it has one). No required
wrapper folder: any directory with a `SKILL.md` counts, however deeply nested.

**Agent** → `pantry/.../agents/<name>.md` — must sit directly under a directory literally named
`agents` (tool requirement).

**Guideline** → `pantry/guidelines/<name>.md` — directory must be literally named `guidelines`
(external sources you don't control may also use `richtlijnen` — recognized as a legacy alias).

**Own MCP-server wrapper** (e.g. pulls credentials from a keychain, calls an upstream `uvx`/`npx`
package) → a directory under `pantry/mcp-servers/<name>/`: wrapper script +
`.claude-plugin/.mcp.json` + a `README.md` documenting the upstream origin. `command` is an
absolute path, so not portable to another machine without reprovisioning.

**Bring in an external skill/repo** → add an entry to `store.yaml` (name + git url), run
`harnessblender fetch` (clones if not already present). Reference the path inside that checkout
from a recipe, e.g. `store/caveman/skills/caveman`. Never edit inside `store/` directly.

**Drop an external source entirely** → `harnessblender remove-store <name>`. Removes the
`store.yaml` entry, deletes `store/<name>/`, and scrubs it from every recipe's selections
(re-blending affected recipes). There's no per-item removal inside a store checkout — dropping
the whole source is the only supported way; deleting one file inside it would just leave that
checkout dirty and permanently un-refreshable by `fetch`.

**A standalone plugin you already have** (own `.claude-plugin/plugin.json`) → drop it anywhere
under `pantry/` or `store/<name>/` (commonly `pantry/plugins/<name>/`). Never merged into a blend:
copied verbatim and registered as its own marketplace entry — avoids all naming/collision risk
regardless of its internal content.

**New recipe** → `harnessblender new-recipe <name>` (picker) or create `recipes/<name>/recipe.yaml`
by hand, then `harnessblender blend <name>`.

**Edit an existing recipe** → `harnessblender edit-recipe <name>` (picker, current selection
pre-checked), or edit `recipe.yaml` by hand + `harnessblender blend <name>`.

**Delete a recipe** → `harnessblender delete-recipe <name>`. Only removes the recipe itself
(`recipe.yaml` + `blend/`) — never touches drinkers it's already poured into.

**Install into a project (pour)** → `harnessblender pour <recipe> <drinker-path...> [--scope
local|project|user]`. Shells out to `claude plugin marketplace add <cookbook>` followed by one
`claude plugin install <id>@<cookbook-name> --scope ... -y` per install id (the main blend, plus
each plugin ingredient separately) — verified to work fully non-interactively.

## Common requests

- **"Install `<skill>` from `<person/repo>`"** → find or add a `store.yaml` entry for that source
  (name + git url), `harnessblender fetch`, locate `<skill>` inside the fresh checkout (e.g.
  `store/<name>/skills/<skill>`), add it to the right recipe's `selections`, then `harnessblender
  blend <recipe>`. Already poured elsewhere? Claude Code caches an installed plugin's content
  per **version** (`~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`) — re-blending
  alone does NOT refresh an already-poured drinker. Bump `version:` in the recipe.yaml, then
  `harnessblender pour <recipe> <drinker...>` again (it runs `install` + `update`, which is what
  actually pulls the new version into the cache) — a Claude Code restart is still needed to apply
  it, that part is a `claude` limitation.
- **"Turn this into a skill"** → create `pantry/skills/<namespace>/<name>/SKILL.md` capturing the
  approach just used, add it to a recipe's selections, `harnessblender blend <recipe>`.
- **"Remove `<ingredient>`"** → drop it from the recipe's `selections` (via `harnessblender
  edit-recipe <recipe>`, unchecking it, or by hand), then `harnessblender blend <recipe>`. Leaves
  the ingredient itself (in `pantry/` or `store/`) untouched — only the recipe's selection changes.
- **"Uninstall this from project X entirely"** → in X: `claude plugin uninstall
  <recipe>@<cookbook-name> --scope <scope>`.
- **"Delete recipe `<name>`"** → `harnessblender delete-recipe <name>` (removes `recipe.yaml` +
  `blend/`, drops it from `marketplace.json`). Drinkers that already installed it keep working
  until explicitly uninstalled there (see above).

## Skill anatomy

```
<skill-name>/
├── SKILL.md         # required — the instructions for Claude
├── README.md        # optional — explanation for humans
├── assets/          # optional — templates, scripts
├── references/      # optional — deeper detail, lazy-loaded
└── examples/         # optional
```

`description` is the only thing Claude sees before it loads the skill — write it as a trigger,
concrete verbs and nouns. Keep deterministic work in a script under `assets/`; keep `SKILL.md`
short.

## Commands

```bash
harnessblender init <path>                    # scaffold a new, empty cookbook
harnessblender new-recipe <name>              # picker, writes recipe.yaml + blends immediately
harnessblender edit-recipe <name>             # picker, current selection pre-checked
harnessblender delete-recipe <name>           # remove recipe.yaml + blend/ (confirms unless -y)
harnessblender blend <name>                   # rebuild blend/ from recipe.yaml, no picker
harnessblender list                           # all recipes + their status
harnessblender fetch                          # clone-if-missing + ff-only pull of store.yaml sources
harnessblender remove-store <name>            # drop a store.yaml source (checkout + entry + refs)
harnessblender pour <name> <drinker...>       # install a blend into project(s)
harnessblender web                            # browser picker
harnessblender --cookbook <path> <cmd> ...    # explicit cookbook, instead of marker-file lookup
```

Without `--cookbook`, harnessblender walks up from the current directory looking for a
`cookbook.yaml`.

## Pitfalls

- **"My change isn't showing up"** → check in order: `blend` wasn't run; the recipe's `version:`
  wasn't bumped (Claude Code caches plugin content per version — same version = no-op, see above);
  it wasn't re-poured (`pour` again after the bump); or Claude Code wasn't restarted after that.
- **Never edit inside `recipes/<name>/blend/`** — it's a copy, `blend` overwrites without warning.
- **`fetch` deliberately skips dirty/detached/diverged store checkouts** — resolve those by hand
  first, it never force-merges or auto-stashes.
- Absolute paths in your own mcp-server `.mcp.json`'s aren't portable to another machine (the
  binary/uvx/npx must be on PATH locally) — `${CLAUDE_PLUGIN_ROOT}`-based bundling is a known
  limitation, not yet solved.
