"use strict";

const KINDS = [
  { kind: "skill", label: "Skills" },
  { kind: "agent", label: "Agents" },
  { kind: "richtlijn", label: "Richtlijnen" },
  { kind: "mcp", label: "MCP Servers" },
];

const $ = (sel) => document.querySelector(sel);
const el = (tag, props = {}, kids = []) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of [].concat(kids)) n.append(k);
  return n;
};

let STATE = { items: [], variants: [] };
// current edit context
let ctx = { name: "", isNew: true, selected: new Set() }; // selected = set of source-relpaths

async function load() {
  STATE = await (await fetch("/api/state")).json();
  renderSidebar();
  renderBlacklist();
  if (ctx.isNew && !ctx.name) startNew();
  else renderMain();
}

function renderBlacklist() {
  const box = $("#bl-chips");
  box.replaceChildren();
  for (const name of STATE.exclude_dirs || []) {
    const chip = el("span", { className: "chip", textContent: name });
    const x = el("button", { className: "x", textContent: "×", title: "verwijderen" });
    x.onclick = () => saveBlacklist((STATE.exclude_dirs || []).filter((n) => n !== name));
    chip.append(x);
    box.append(chip);
  }
}

async function saveBlacklist(list) {
  const prevSel = new Set(ctx.selected), prevName = ctx.name, prevNew = ctx.isNew;
  STATE = await (await fetch("/api/config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ exclude_dirs: list }),
  })).json();
  // selectie/context behouden over de re-scan heen
  ctx = { name: prevName, isNew: prevNew, selected: prevSel };
  renderSidebar();
  renderBlacklist();
  renderMain();
}

function startNew() {
  // nieuwe variant: richtlijnen standaard aan
  const pre = new Set(
    STATE.items.filter((i) => i.kind === "richtlijn").map((i) => i.source)
  );
  ctx = { name: "", isNew: true, selected: pre };
  renderSidebar();
  renderMain();
  $("#variant-name").focus();
}

function openVariant(v) {
  ctx = { name: v.name, isNew: false, selected: new Set(v.sources) };
  renderSidebar();
  renderMain();
}

function renderSidebar() {
  const list = $("#variant-list");
  list.replaceChildren();
  for (const v of STATE.variants) {
    const active = !ctx.isNew && v.name === ctx.name;
    const btn = el("button", { className: "variant" + (active ? " active" : "") }, [
      el("div", { className: "vname", textContent: v.name }),
      el("div", {
        className: "vmeta",
        textContent: `s${v.counts.skill} · a${v.counts.agent} · r${v.counts.richtlijn} · m${v.counts.mcp || 0}${v.counts.richtlijn ? " · hook" : ""}`,
      }),
    ]);
    btn.onclick = () => openVariant(v);
    list.append(btn);
  }
}

function renderMain() {
  const nameInput = $("#variant-name");
  nameInput.value = ctx.name;
  nameInput.readOnly = !ctx.isNew;
  const v = STATE.variants.find((x) => x.name === ctx.name);
  $("#variant-desc").value = ctx.isNew ? "" : (v ? v.description : "");

  const root = $("#sections");
  root.replaceChildren();

  for (const { kind, label } of KINDS) {
    const items = STATE.items.filter((i) => i.kind === kind);
    if (!items.length) continue;
    const sec = el("section", { className: "kind" });
    sec.dataset.kind = kind;
    sec.append(el("h2", {}, [
      el("span", { textContent: label }),
      el("span", { className: "kcount", textContent: "" }),
    ]));

    // groepeer per root_label
    const groups = new Map();
    for (const it of items) {
      if (!groups.has(it.root_label)) groups.set(it.root_label, []);
      groups.get(it.root_label).push(it);
    }
    for (const lbl of [...groups.keys()].sort()) {
      sec.append(renderGroup(lbl, groups.get(lbl).sort((a, b) => a.name.localeCompare(b.name))));
    }
    root.append(sec);
  }
  updateCounts();
}

function renderGroup(label, items) {
  const wrap = el("div", { className: "group" });
  const toggleAll = el("span", { className: "ga", textContent: "alles" });
  const head = el("div", { className: "group-head" }, [
    el("span", { className: "label", textContent: label }),
    toggleAll,
  ]);
  const box = el("div", { className: "items" });
  const rows = [];

  for (const it of items) {
    const cb = el("input", { type: "checkbox", checked: ctx.selected.has(it.source) });
    const asTag = it.as && it.as !== it.name ? el("span", { className: "as", textContent: "→ " + it.as }) : "";
    const row = el("label", { className: "item" + (cb.checked ? " checked" : "") }, [
      cb,
      el("span", { textContent: it.name }),
      asTag,
    ]);
    cb.onchange = () => {
      if (cb.checked) ctx.selected.add(it.source);
      else ctx.selected.delete(it.source);
      row.classList.toggle("checked", cb.checked);
      updateCounts();
    };
    rows.push(cb);
    box.append(row);
  }

  toggleAll.onclick = () => {
    const all = rows.every((c) => c.checked);
    for (const c of rows) {
      if (c.checked === all) { c.checked = !all; c.onchange(); }
    }
  };
  wrap.append(head, box);
  return wrap;
}

function updateCounts() {
  const byKind = (k) =>
    STATE.items.filter((i) => i.kind === k && ctx.selected.has(i.source)).length;
  const s = byKind("skill"), a = byKind("agent"), r = byKind("richtlijn"), m = byKind("mcp");
  $("#counts").innerHTML =
    `<b>${s}</b> skills · <b>${a}</b> agents · <b>${r}</b> richtlijnen · <b>${m}</b> mcp` +
    (r ? " <b>+hook</b>" : "");
  for (const sec of document.querySelectorAll("section.kind")) {
    const k = sec.dataset.kind;
    sec.querySelector(".kcount").textContent = `${byKind(k)} gekozen`;
  }
}

function toast(msg, kind) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = kind || "";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), kind === "err" ? 8000 : 3500);
}

async function save() {
  const name = $("#variant-name").value.trim();
  if (!name) return toast("naam verplicht", "err");
  const btn = $("#save-btn");
  btn.disabled = true;
  $("#status").textContent = "opslaan…";
  try {
    const res = await fetch("/api/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        variant: name,
        description: $("#variant-desc").value,
        sources: [...ctx.selected],
        is_new: ctx.isNew,
      }),
    });
    const data = await res.json();
    if (!res.ok) { toast(data.error || "fout", "err"); return; }
    const c = data.counts;
    toast(`'${name}' opgeslagen — skills=${c.skill} agents=${c.agent} richtlijnen=${c.richtlijn} mcp=${c.mcp}${data.hook ? " +hook" : ""}`, "ok");
    ctx.isNew = false; ctx.name = name;
    await load();
  } catch (e) {
    toast(String(e), "err");
  } finally {
    btn.disabled = false;
    $("#status").textContent = "";
  }
}

$("#new-btn").onclick = startNew;
$("#save-btn").onclick = save;
$("#bl-input").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const v = e.target.value.trim();
  e.target.value = "";
  if (!v) return;
  const cur = STATE.exclude_dirs || [];
  if (!cur.includes(v)) saveBlacklist([...cur, v]);
});
load();
