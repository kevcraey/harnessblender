"use strict";

const KINDS = [
  { kind: "skill", label: "Skills" },
  { kind: "agent", label: "Agents" },
  { kind: "guideline", label: "Guidelines" },
  { kind: "mcp", label: "MCP Servers" },
  { kind: "plugin", label: "Plugins (standalone)" },
];

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, kids = []) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of [].concat(kids)) n.append(k);
  return n;
};

let STATE = { items: [], variants: [], exclude_dirs: [] };
let selections = new Map();   // recipe name -> Set(source relpath)
let descriptions = new Map(); // recipe name -> description
let drinkersMap = new Map();  // recipe name -> [{path, scope}]
let recipeOrder = [];         // display order of recipe (column) names
let filterText = "";

// DOM refs kept across in-place updates (avoid a full re-render, and the
// scroll-position reset that comes with it, on every single checkbox click).
let columnCountsEls = new Map(); // recipe name -> counts <div>
let groupToggleEls = new Map();  // "kind|root_label|recipe" -> group toggle <input>

const saveChains = new Map(); // recipe name -> promise chain, serializes its saves

async function load() {
  STATE = await (await fetch("/api/state")).json();
  selections = new Map(STATE.variants.map((v) => [v.name, new Set(v.sources)]));
  descriptions = new Map(STATE.variants.map((v) => [v.name, v.description || ""]));
  drinkersMap = new Map(STATE.variants.map((v) => [v.name, v.drinkers || []]));
  recipeOrder = STATE.variants.map((v) => v.name);
  renderBlacklist();
  renderTable();
  if (!$("#drinkers-view").classList.contains("hidden")) renderDrinkersView();
}

function toast(msg, kind) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = kind || "";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), kind === "err" ? 8000 : 3000);
}

// ── excluded directories ─────────────────────────────────────────────────

function renderBlacklist() {
  const box = $("#bl-chips");
  box.replaceChildren();
  for (const name of STATE.exclude_dirs || []) {
    const chip = el("span", { className: "chip", textContent: name });
    const x = el("button", { className: "x", textContent: "×", title: "remove" });
    x.onclick = () => saveBlacklist((STATE.exclude_dirs || []).filter((n) => n !== name));
    chip.append(x);
    box.append(chip);
  }
}

async function saveBlacklist(list) {
  STATE = await (await fetch("/api/config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ exclude_dirs: list }),
  })).json();
  selections = new Map(STATE.variants.map((v) => [v.name, new Set(v.sources)]));
  descriptions = new Map(STATE.variants.map((v) => [v.name, v.description || ""]));
  drinkersMap = new Map(STATE.variants.map((v) => [v.name, v.drinkers || []]));
  recipeOrder = STATE.variants.map((v) => v.name);
  renderBlacklist();
  renderTable();
}

// ── store sources ────────────────────────────────────────────────────────

async function removeStore(name) {
  if (!confirm(`remove store source '${name}'? This deletes store/${name}/, the store.yaml `
    + `entry, and drops it from every recipe that uses it.`)) return;
  const res = await fetch("/api/remove-store", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  if (!res.ok) return toast(data.error || "error", "err");
  toast(`store '${name}' removed`, "ok");
  await load();
}

// ── save (one recipe/column at a time, serialized) ───────────────────────

function queueSave(name) {
  const prev = saveChains.get(name) || Promise.resolve();
  const next = prev.then(() => doSave(name)).catch(() => {});
  saveChains.set(name, next);
  return next;
}

async function doSave(name) {
  const body = {
    variant: name,
    description: descriptions.get(name) || "",
    sources: [...(selections.get(name) || [])],
  };
  const res = await fetch("/api/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    toast(`${name}: ${data.error || "error"}`, "err");
    await load(); // resync the table with what's actually on disk
    throw new Error("save failed");
  }
}

// ── table ─────────────────────────────────────────────────────────────────

function itemMatchesFilter(it) {
  if (!filterText) return true;
  return (it.name + " " + it.root_label).toLowerCase().includes(filterText);
}

function recipeCounts(name) {
  const set = selections.get(name) || new Set();
  const c = { skill: 0, agent: 0, guideline: 0, mcp: 0, plugin: 0 };
  for (const it of STATE.items) if (set.has(it.source)) c[it.kind]++;
  return c;
}

function countsText(c) {
  return `s${c.skill}·a${c.agent}·r${c.guideline}·m${c.mcp}·p${c.plugin}${c.guideline ? " ·hook" : ""}`;
}

function updateColumnCounts(name) {
  const node = columnCountsEls.get(name);
  if (node) node.textContent = countsText(recipeCounts(name));
}

function groupState(groupItems, name) {
  const set = selections.get(name) || new Set();
  let all = groupItems.length > 0, any = false;
  for (const it of groupItems) {
    if (set.has(it.source)) any = true;
    else all = false;
  }
  return { all, any };
}

function afterCellToggle(kind, rootLabel, name) {
  const groupItems = STATE.items.filter((i) => i.kind === kind && i.root_label === rootLabel);
  const st = groupState(groupItems, name);
  const groupCb = groupToggleEls.get(`${kind}|${rootLabel}|${name}`);
  if (groupCb) {
    groupCb.checked = st.all;
    groupCb.indeterminate = !st.all && st.any;
  }
  updateColumnCounts(name);
}

function renderTable() {
  columnCountsEls = new Map();
  groupToggleEls = new Map();
  const table = $("#matrix");
  table.replaceChildren(renderHead(), renderBody());
}

function renderHead() {
  const thead = el("thead");
  const tr = el("tr");
  tr.append(el("th", { className: "name-col", textContent: "ingredient" }));
  for (const name of recipeOrder) tr.append(renderRecipeHeadCell(name));
  tr.append(renderAddColHead());
  thead.append(tr);
  return thead;
}

async function saveDrinkers(name) {
  const res = await fetch("/api/set-drinkers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ variant: name, drinkers: drinkersMap.get(name) || [] }),
  });
  const data = await res.json();
  if (!res.ok) toast(data.error || "error", "err");
}

// ── drinkers tab ─────────────────────────────────────────────────────────

function isUserLevel(name) {
  return (drinkersMap.get(name) || []).some((d) => d.scope === "user");
}

function folderLines(name) {
  return (drinkersMap.get(name) || [])
    .filter((d) => d.scope !== "user")
    .map((d) => d.path)
    .join("\n");
}

function parseFolderLines(text) {
  return [...new Set(text.split("\n").map((l) => l.trim()).filter(Boolean))];
}

function renderDrinkersView() {
  const box = $("#drinkers-cards");
  box.replaceChildren();
  for (const name of recipeOrder) box.append(renderDrinkerCard(name));
}

async function renameRecipe(oldName, newName, nameInput) {
  const trimmed = newName.trim();
  if (!trimmed || trimmed === oldName) { nameInput.value = oldName; return; }
  if (!confirm(`rename '${oldName}' to '${trimmed}'? Drinkers that already have it installed `
    + `keep the OLD name until you pour again there.`)) { nameInput.value = oldName; return; }
  const res = await fetch("/api/rename-recipe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ old: oldName, new: trimmed }),
  });
  const data = await res.json();
  if (!res.ok) { toast(data.error || "error", "err"); nameInput.value = oldName; return; }
  toast(`renamed '${oldName}' → '${trimmed}'`, "ok");
  await load();
}

function renderDrinkerCard(name) {
  const card = el("div", { className: "drinker-card" });
  const nameInput = el("input", { className: "dname", type: "text", value: name });
  nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); nameInput.blur(); } });
  nameInput.addEventListener("change", () => renameRecipe(name, nameInput.value, nameInput));
  card.append(nameInput);
  card.append(el("div", { className: "ddesc", textContent: descriptions.get(name) || "" }));

  const userLevel = isUserLevel(name);
  const checkbox = el("input", { type: "checkbox", checked: userLevel });
  card.append(el("label", { className: "duser-row" }, [
    checkbox,
    document.createTextNode(" install at user level (global — no folder needed)"),
  ]));

  const textarea = el("textarea", {
    placeholder: "one project folder per line, e.g.\n~/code/my-project\n~/code/other-project",
    value: folderLines(name),
    disabled: userLevel,
  });
  card.append(textarea);

  const pickBtn = el("button", { className: "dpick-btn", type: "button", textContent: "+ pick folder…", disabled: userLevel });
  const pourBtn = el("button", { className: "dpour-btn", type: "button", textContent: "Pour now" });
  card.append(el("div", { className: "dactions" }, [pickBtn, pourBtn]));

  const status = el("div", { className: "dstatus" });
  card.append(status);

  const persistFolders = async () => {
    const drinkers = parseFolderLines(textarea.value).map((p) => ({ path: p, scope: "local" }));
    drinkersMap.set(name, drinkers);
    await saveDrinkers(name);
  };

  checkbox.onchange = async () => {
    textarea.disabled = checkbox.checked;
    pickBtn.disabled = checkbox.checked;
    if (checkbox.checked) {
      drinkersMap.set(name, [{ path: "~", scope: "user" }]);
      await saveDrinkers(name);
    } else {
      await persistFolders();
    }
  };

  textarea.addEventListener("blur", () => { if (!checkbox.checked) persistFolders(); });

  pickBtn.onclick = async () => {
    pickBtn.disabled = true;
    try {
      const res = await fetch("/api/pick-folder", { method: "POST" });
      const data = await res.json();
      if (!res.ok) return; // cancelled
      const lines = parseFolderLines(textarea.value);
      if (!lines.includes(data.path)) lines.push(data.path);
      textarea.value = lines.join("\n");
      await persistFolders();
    } finally {
      pickBtn.disabled = checkbox.checked;
    }
  };

  pourBtn.onclick = async () => {
    const targets = drinkersMap.get(name) || [];
    if (!targets.length) { status.textContent = "no folders / user-level set"; return; }
    pourBtn.disabled = true;
    status.textContent = "pouring…";
    try {
      const lines = [];
      for (const d of targets) {
        const res = await fetch("/api/pour-one", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ variant: name, path: d.path, scope: d.scope }),
        });
        const data = await res.json();
        lines.push(`${d.path} [${d.scope}]: ${data.ok ? "poured" : (data.log || data.error || "failed")}`);
      }
      status.textContent = lines.join("\n");
    } finally {
      pourBtn.disabled = false;
    }
  };

  return card;
}

function switchTab(tab) {
  for (const btn of document.querySelectorAll("#tabs .tab")) {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  }
  $("#table-wrap").classList.toggle("hidden", tab !== "recipes");
  $("#drinkers-view").classList.toggle("hidden", tab !== "drinkers");
  $("#filter").classList.toggle("hidden", tab !== "recipes");
  $("#blacklist").classList.toggle("hidden", tab !== "recipes");
  if (tab === "drinkers") renderDrinkersView();
}

async function confirmDeleteRecipe(name) {
  if (!confirm(`delete recipe '${name}'? This removes its recipe.yaml and blend/.\n(drinkers it's already poured into keep working until uninstalled there)`)) return;
  const res = await fetch("/api/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ variant: name }),
  });
  const data = await res.json();
  if (!res.ok) return toast(data.error || "error", "err");
  toast(`recipe '${name}' deleted`, "ok");
  await load();
}

function renderRecipeHeadCell(name) {
  const th = el("th", { className: "recipe-col" });
  const wrap = el("div", { className: "recipe-head" });

  const delBtn = el("button", { className: "rdel", type: "button", textContent: "×", title: `delete '${name}'` });
  delBtn.onclick = () => confirmDeleteRecipe(name);
  wrap.append(el("div", { className: "rtop" }, [
    el("span", { className: "rname", textContent: name }),
    delBtn,
  ]));

  const descInput = el("input", {
    className: "rdesc",
    type: "text",
    value: descriptions.get(name) || "",
    placeholder: "description…",
  });
  descInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); descInput.blur(); }
  });
  descInput.addEventListener("change", () => {
    descriptions.set(name, descInput.value);
    queueSave(name);
  });
  wrap.append(descInput);

  const countsEl = el("div", { className: "rcounts", textContent: countsText(recipeCounts(name)) });
  columnCountsEls.set(name, countsEl);
  wrap.append(countsEl);

  th.append(wrap);
  return th;
}

function renderAddColHead() {
  const th = el("th", { className: "add-col" });
  const showButton = () => {
    th.replaceChildren();
    const btn = el("button", { textContent: "+ recipe", type: "button" });
    btn.onclick = showInput;
    th.append(btn);
  };
  const showInput = () => {
    th.replaceChildren();
    const input = el("input", { type: "text", placeholder: "name + enter", autocomplete: "off" });
    th.append(input);
    input.focus();
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); confirmAddRecipe(input.value); }
      if (e.key === "Escape") showButton();
    });
    input.addEventListener("blur", () => { if (!input.value.trim()) showButton(); });
  };
  showButton();
  return th;
}

async function confirmAddRecipe(rawName) {
  const name = rawName.trim();
  if (!name) return;
  if (recipeOrder.includes(name)) return toast(`recipe '${name}' already exists`, "err");
  // new recipes start with every guideline pre-selected, same convention as the old picker.
  const guidelineSources = STATE.items.filter((i) => i.kind === "guideline").map((i) => i.source);
  const res = await fetch("/api/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ variant: name, description: "", sources: guidelineSources, is_new: true }),
  });
  const data = await res.json();
  if (!res.ok) return toast(data.error || "error", "err");
  toast(`recipe '${name}' created`, "ok");
  await load();
}

const collapsedKinds = new Set();  // kind names currently collapsed
const collapsedGroups = new Set(); // "kind|root_label" keys currently collapsed

function renderBody() {
  const tbody = el("tbody");
  const ncols = recipeOrder.length;

  for (const { kind, label } of KINDS) {
    const items = STATE.items.filter((i) => i.kind === kind);
    if (!items.length) continue;
    if (!items.some(itemMatchesFilter)) continue;

    const kindCollapsed = collapsedKinds.has(kind);
    tbody.append(renderKindRow(kind, label, ncols, kindCollapsed));
    if (kindCollapsed) continue;

    const groups = new Map();
    for (const it of items) {
      if (!groups.has(it.root_label)) groups.set(it.root_label, []);
      groups.get(it.root_label).push(it);
    }
    for (const rootLabel of [...groups.keys()].sort()) {
      const groupItems = groups.get(rootLabel).sort((a, b) => a.name.localeCompare(b.name));
      const visible = groupItems.filter(itemMatchesFilter);
      if (!visible.length) continue;
      const groupCollapsed = collapsedGroups.has(`${kind}|${rootLabel}`);
      tbody.append(renderGroupRow(kind, rootLabel, groupItems, groupCollapsed));
      if (groupCollapsed) continue;
      for (const it of visible) tbody.append(renderItemRow(it));
    }
  }
  return tbody;
}

function renderKindRow(kind, label, ncols, collapsed) {
  const tr = el("tr", { className: "kind-row" });
  tr.dataset.kind = kind;
  const arrow = collapsed ? "▸" : "▾";
  const td = el("td", { className: "kind-toggle", colSpan: ncols + 2, textContent: `${arrow} ${label}` });
  td.onclick = () => {
    if (collapsed) collapsedKinds.delete(kind);
    else collapsedKinds.add(kind);
    renderTable();
  };
  tr.append(td);
  return tr;
}

function storeNameOf(rootLabel) {
  const parts = rootLabel.split("/");
  return parts[0] === "store" && parts[1] ? parts[1] : null;
}

function renderGroupRow(kind, rootLabel, groupItems, collapsed) {
  const tr = el("tr", { className: "group-row" });
  const arrow = collapsed ? "▸" : "▾";
  const labelText = el("span", { className: "glabel-text", textContent: `${arrow} ${rootLabel}` });
  labelText.onclick = () => {
    const key = `${kind}|${rootLabel}`;
    if (collapsed) collapsedGroups.delete(key);
    else collapsedGroups.add(key);
    renderTable();
  };
  const labelCell = el("td", { className: "glabel" }, [labelText]);
  const storeName = storeNameOf(rootLabel);
  if (storeName) {
    const delBtn = el("button", {
      className: "sdel", type: "button", textContent: "×",
      title: `remove store '${storeName}' (store.yaml + store/${storeName}/ + every recipe reference)`,
    });
    delBtn.onclick = (e) => { e.stopPropagation(); removeStore(storeName); };
    labelCell.append(delBtn);
  }
  tr.append(labelCell);
  for (const name of recipeOrder) {
    const td = el("td", { className: "gtoggle-cell" });
    const cb = el("input", { type: "checkbox", title: `toggle all of ${rootLabel} for ${name}` });
    const st = groupState(groupItems, name);
    cb.checked = st.all;
    cb.indeterminate = !st.all && st.any;
    cb.onchange = () => {
      const set = selections.get(name);
      const turnOn = !st.all;
      for (const it of groupItems) {
        if (turnOn) set.add(it.source);
        else set.delete(it.source);
      }
      queueSave(name);
      renderTable();
    };
    groupToggleEls.set(`${kind}|${rootLabel}|${name}`, cb);
    td.append(cb);
    tr.append(td);
  }
  tr.append(el("td")); // under the add-col header
  return tr;
}

async function openSource(it) {
  const res = await fetch("/api/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: it.source, kind: it.kind }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    toast(data.error || "could not open", "err");
  }
}

async function deleteSource(it) {
  if (!confirm(`delete '${it.name}'? This removes the actual file/folder from ${it.root_label}, `
    + `and drops it from every recipe that uses it.`)) return;
  const res = await fetch("/api/delete-source", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: it.source, kind: it.kind, root_label: it.root_label, name: it.name }),
  });
  const data = await res.json();
  if (!res.ok) return toast(data.error || "error", "err");
  toast(`'${it.name}' deleted`, "ok");
  await load();
}

function updateUnusedState(tr, it) {
  const used = recipeOrder.some((name) => (selections.get(name) || new Set()).has(it.source));
  tr.classList.toggle("unused", !used);
}

function renderItemRow(it) {
  const tr = el("tr", { className: "item-row" });
  const openBtn = el("button", { className: "iopen", type: "button", textContent: "↗", title: "open in default app" });
  openBtn.onclick = () => openSource(it);
  const delBtn = el("button", { className: "idel", type: "button", textContent: "×", title: "delete file/folder" });
  delBtn.onclick = () => deleteSource(it);
  const nameCell = el("td", { className: "item-name" }, [openBtn, delBtn, el("span", { textContent: it.name })]);
  if (it.as && it.as !== it.name) {
    nameCell.append(el("span", { className: "as", textContent: " → " + it.as }));
  }
  tr.append(nameCell);
  updateUnusedState(tr, it);
  for (const name of recipeOrder) {
    const td = el("td", { className: "cell" });
    const set = selections.get(name);
    const cb = el("input", { type: "checkbox", checked: set.has(it.source) });
    cb.onchange = () => {
      if (cb.checked) set.add(it.source);
      else set.delete(it.source);
      afterCellToggle(it.kind, it.root_label, name);
      updateUnusedState(tr, it);
      queueSave(name);
    };
    td.append(cb);
    tr.append(td);
  }
  tr.append(el("td")); // under the add-col header
  return tr;
}

// ── wiring ────────────────────────────────────────────────────────────────

for (const btn of document.querySelectorAll("#tabs .tab")) {
  btn.onclick = () => switchTab(btn.dataset.tab);
}
$("#filter").addEventListener("input", (e) => {
  filterText = e.target.value.trim().toLowerCase();
  renderTable();
});
$("#bl-input").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const v = e.target.value.trim();
  e.target.value = "";
  if (!v) return;
  const cur = STATE.exclude_dirs || [];
  if (!cur.includes(v)) saveBlacklist([...cur, v]);
});

load();
