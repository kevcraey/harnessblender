# harnessblender

Blend ingredients (skills, agents, richtlijnen, mcp servers) from a **cookbook** into installable
Claude Code plugins ("blends"), and pour them into projects. harnessblender itself is generic and
carries no personal content — everything specific lives in a separate cookbook repo.

Terminology: **ingredients** (pantry = your own, store = external, fetched) → **recipe** (a chosen
selection) → **blend** (the built plugin) → **pour** (install it into a **drinker**, a project
folder).

## Requirements

- Python ≥3.11 + [`uv`](https://docs.astral.sh/uv/) (deps resolved automatically via the script's PEP 723 shebang)
- `claude` CLI on PATH (for `pour`)
- A cookbook: a directory with a `cookbook.yaml` marker file, `pantry/`, `store.yaml`, `recipes/`

## Commands

```bash
./harnessblender new-recipe <naam>          # picker → recipe.yaml → blend
./harnessblender edit-recipe <naam>         # picker, pre-checked → re-blend
./harnessblender blend <naam>               # rebuild blend/ from recipe.yaml, no picker
./harnessblender list                       # all recipes + blended status
./harnessblender fetch                      # clone-if-missing + ff-only pull every store.yaml source
./harnessblender pour <naam> <drinker...>   # install a blend into project folder(s)
./harnessblender web                        # browser picker
```

All commands resolve the cookbook by walking up from the current directory for a `cookbook.yaml`
marker file. Pass `--cookbook <path>` to run from anywhere (e.g. from inside a drinker, for `pour`).

Full documentation (cookbook layout, manifests, conventions) lives as a skill inside each cookbook
(`pantry/skills/general-purpose/harnessblender/`), not in this repo — that's where the tool's
behavior is explained to Claude in the context it's actually being used.
