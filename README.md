# harnessblender

Blend ingredients (skills, agents, guidelines, mcp servers) from a **cookbook** into installable
Claude Code plugins ("blends"), and pour them into projects. harnessblender itself is generic and
carries no personal content — everything specific lives in a separate cookbook repo.

Terminology: **ingredients** (pantry = your own, store = external, fetched) → **recipe** (a chosen
selection) → **blend** (the built plugin) → **pour** (install it into a **drinker**, a project
folder).

## Install the skill (no cookbook needed)

This repo bundles a Claude Code plugin with one skill — everything above, explained to Claude —
so it's usable before you've even created a cookbook:

```bash
claude plugin marketplace add /path/to/harnessblender
claude plugin install harnessblender@harnessblender --scope user -y
```

## Requirements

- Python ≥3.11 + [`uv`](https://docs.astral.sh/uv/) (deps resolved automatically via the script's PEP 723 shebang)
- `claude` CLI on PATH (for `pour`)
- A cookbook: a directory with a `cookbook.yaml` marker file, `pantry/`, `store.yaml`, `recipes/`
  — run `./harnessblender init <path>` to scaffold one

## Commands

```bash
./harnessblender init <path>                # scaffold a new, empty cookbook
./harnessblender new-recipe <name>          # picker → recipe.yaml → blend
./harnessblender edit-recipe <name>         # picker, pre-checked → re-blend
./harnessblender delete-recipe <name>       # remove recipe.yaml + blend/ (confirms unless -y)
./harnessblender blend <name>               # rebuild blend/ from recipe.yaml, no picker
./harnessblender list                       # all recipes + blended status
./harnessblender fetch                      # clone-if-missing + ff-only pull every store.yaml source
./harnessblender remove-store <name>        # drop a store.yaml source (checkout + entry + recipe refs)
./harnessblender pour <name> <drinker...>   # install a blend into project folder(s)
./harnessblender web                        # browser picker
```

All commands except `init` resolve the cookbook by walking up from the current directory for a
`cookbook.yaml` marker file. Pass `--cookbook <path>` to run from anywhere (e.g. from inside a
drinker, for `pour`).

## Cookbook layout

```
my-cookbook/
├── cookbook.yaml          # marker file: name, owner, exclude_dirs
├── store.yaml             # declared external sources (name + git url)
├── store/                 # gitignored checkouts of store.yaml sources (`harnessblender fetch`)
├── pantry/                # your own ingredients — see pantry/README.md after `init`
│   ├── skills/            #   any dir with SKILL.md, anywhere — "skills/" is just a convention
│   ├── agents/            #   REQUIRED name — direct .md files become agents
│   ├── guidelines/        #   REQUIRED name (`richtlijnen` also matches, as a legacy alias for
│   │                      #   external sources you don't control) — direct .md files become
│   │                      #   guidelines (README.md → CLAUDE.md)
│   ├── mcp-servers/       #   REQUIRED name — subdirs declaring mcpServers become mcp ingredients
│   └── plugins/           #   convention only — a plugin is any dir with .claude-plugin/plugin.json
└── recipes/
    └── <name>/
        ├── recipe.yaml    # tracked: description, version, selections
        └── blend/         # gitignored: generated output of `blend`/`pour` — real copies, no symlinks
```

`store/<name>/` is scanned exactly like `pantry/` (same discovery rules), so an external source
becomes a valid ingredient the moment it's fetched.

### `cookbook.yaml`

```yaml
name: my-cookbook
owner:
  name: "Your Name"
  url: ""
exclude_dirs:
  - archived
```

### `store.yaml`

```yaml
sources:
  - name: some-skill-repo
    url: git@github.com:someone/some-skill-repo.git
```

### `recipes/<name>/recipe.yaml`

```yaml
description: "what this recipe is for"
version: 0.1.0
selections:
  skills:
    - source: pantry/skills/writing/my-skill
      as: my-skill
  agents: []
  guidelines: []
  mcps: []
  plugins:
    - source: pantry/plugins/quiet
      as: quiet
```

`source` is a path relative to the cookbook root (`pantry/...` or `store/<name>/...`); `as` is the
name it installs under. `blend`/`new-recipe`/`edit-recipe` write this file for you — hand-editing
is only needed for scripted setups.

Full behavioral documentation (namespace conventions, how to grow a pantry, etc.) is a matter of
personal taste and belongs in a skill inside each cookbook, not in this repo — harnessblender
itself stays generic and opinion-free about what a cookbook should contain.
