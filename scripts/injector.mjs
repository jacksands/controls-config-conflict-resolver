/**
 * injector.mjs — Controls Configuration Conflict Resolver
 */

import {
  normalizeCombo, formatCombo,
  getActionsForCombo, buildConflictMap, getAllConflictPairs, getActionMeta
} from "./detector.mjs";

import {
  getGlobalBindings, getUserOverrides, getGlobalMode,
  setGlobalBinding, removeGlobalBinding,
  markUserOverride, clearUserOverride
} from "./globals.mjs";

let _stateRef = null;
export function _setStateRef(s) { _stateRef = s; }
function _getState() { return _stateRef; }

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function injectAll(app, element, state, parts) {
  const mainRendered    = !parts.length || parts.includes("main");
  const sidebarRendered = !parts.length || parts.includes("sidebar");

  if (sidebarRendered) {
    _injectComboSearch(app, element, state);
    _injectSidebarBadge(element, state);
  }
  if (mainRendered) {
    _injectContextNote(element, state);
    _watchForConflictIcons(element, state);
    _setupEditObserver(element, state);
    _injectGlobalIcons(element, state);
    if (state.comboFilter) _highlightComboMatches(element, state.comboFilter);
    if (state.pendingHighlight) _processPendingHighlight(element, state);
  }
}

// ---------------------------------------------------------------------------
// 1. Context note
// ---------------------------------------------------------------------------

function _injectContextNote(element, state) {
  if (state.contextNoteDismissed) return;
  if (element.querySelector(".cccr-context-note")) return;
  const main = _main(element);
  if (!main) return;
  const note = document.createElement("div");
  note.className = "cccr-context-note";
  note.innerHTML = `
    <i class="fa-solid fa-circle-info"></i>
    <span>Some conflicts are harmless — many keybindings only activate in specific
    contexts (canvas, text editors, combat). Review before changing anything.</span>
    <button type="button" class="cccr-note-x" title="Dismiss">
      <i class="fa-solid fa-xmark"></i>
    </button>`;
  note.querySelector(".cccr-note-x").addEventListener("click", () => {
    state.contextNoteDismissed = true;
    note.remove();
  });
  main.prepend(note);
}

// ---------------------------------------------------------------------------
// 2. Combo search
// ---------------------------------------------------------------------------

function _injectComboSearch(app, element, state) {
  element.querySelector(".cccr-combo-wrap")?.remove();
  const sidebar = _sidebar(element);
  if (!sidebar) return;

  const wrap = document.createElement("div");
  wrap.className = "cccr-combo-wrap";
  wrap.innerHTML = `
    <div class="cccr-combo-row">
      <i class="fa-solid fa-keyboard"></i>
      <input type="text" class="cccr-combo-input"
             placeholder="Press a key combo…" readonly autocomplete="off">
      <button type="button" class="cccr-combo-clear" style="display:none" title="Clear (Esc)">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <div class="cccr-combo-results" style="display:none"></div>`;

  const nativeSearch = sidebar.querySelector("input[type='search'], input.search, input[name='search']");
  if (nativeSearch) nativeSearch.insertAdjacentElement("afterend", wrap);
  else sidebar.prepend(wrap);

  const input    = wrap.querySelector(".cccr-combo-input");
  const clearBtn = wrap.querySelector(".cccr-combo-clear");
  const results  = wrap.querySelector(".cccr-combo-results");

  if (state.comboFilter) {
    input.value = formatCombo(state.comboFilter);
    clearBtn.style.display = "";
    _renderComboResults(state.comboFilter, results, element, state);
    results.style.display = "";
  }

  input.addEventListener("keydown", e => {
    e.preventDefault(); e.stopPropagation();
    const { code, key, ctrlKey, shiftKey, altKey } = e;
    if (key === "Escape") { _clearFilter(state, element); return; }
    if (["Control","Shift","Alt","Meta"].includes(key)) return;
    const mods = [];
    if (ctrlKey)  mods.push("CONTROL");
    if (shiftKey) mods.push("SHIFT");
    if (altKey)   mods.push("ALT");
    const combo = normalizeCombo(code, mods);
    state.comboFilter = combo;
    input.value = formatCombo(combo);
    clearBtn.style.display = "";
    _renderComboResults(combo, results, element, state);
    results.style.display = "";
    _highlightComboMatches(element, combo);
  });
  clearBtn.addEventListener("click", () => _clearFilter(state, element));
}

function _renderComboResults(combo, container, element, state) {
  const actions = getActionsForCombo(combo);
  if (!actions.length) {
    container.innerHTML = `
      <div class="cccr-results-empty">
        <i class="fa-solid fa-magnifying-glass"></i>
        Nothing uses <kbd class="cccr-badge">${formatCombo(combo)}</kbd>
      </div>`;
    return;
  }
  container.innerHTML = actions.map(a => `
    <div class="cccr-result-row">
      <div class="cccr-result-info">
        <span class="cccr-result-name">${a.label}</span>
        <span class="cccr-result-pkg">${a.packageTitle}</span>
      </div>
      <div class="cccr-result-btns">
        <button type="button" class="cccr-find-btn cccr-go-btn"
                data-action-id="${a.actionId}" data-namespace="${a.namespace}"
                data-combo="${combo}" title="Navigate to this action">
          <i class="fa-solid fa-arrow-right"></i> Go
        </button>
      </div>
    </div>`).join("");

  container.querySelectorAll(".cccr-go-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.pendingHighlight = { actionId: btn.dataset.actionId, combo: btn.dataset.combo, autoEdit: false };
      _navigateToCategory(btn.dataset.namespace, element, state);
    });
  });
}

function _highlightComboMatches(element, combo) {
  const matchIds = new Set(getActionsForCombo(combo).map(a => a.actionId));
  for (const row of _actionRows(element)) {
    const id = _actionId(row, element);
    if (!id) continue;
    row.classList.toggle("cccr-filter-match", matchIds.has(id));
    row.classList.toggle("cccr-filter-dim",   !matchIds.has(id));
  }
}

function _clearFilter(state, element) {
  state.comboFilter = null;
  const input    = element?.querySelector(".cccr-combo-input");
  const clearBtn = element?.querySelector(".cccr-combo-clear");
  const results  = element?.querySelector(".cccr-combo-results");
  if (input)    input.value = "";
  if (clearBtn) clearBtn.style.display = "none";
  if (results)  { results.innerHTML = ""; results.style.display = "none"; }
  element?.querySelectorAll(".cccr-filter-match,.cccr-filter-dim").forEach(el =>
    el.classList.remove("cccr-filter-match","cccr-filter-dim"));
}

// ---------------------------------------------------------------------------
// 3. Conflict trigger icons
// ---------------------------------------------------------------------------

function _watchForConflictIcons(element, state) {
  state.iconObserver?.disconnect();
  const main = _main(element);
  if (!main) return;
  const cm = buildConflictMap();
  if (!cm.size) return;

  main.querySelectorAll(".cccr-trigger, .cccr-expand-panel").forEach(el => el.remove());
  main.querySelectorAll("i.fa-triangle-exclamation").forEach(icon =>
    _processWarningIcon(icon, element, cm));

  state.iconObserver = new MutationObserver(mutations => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.classList.contains("cccr-expand-panel") ||
            node.classList.contains("cccr-trigger")      ||
            node.classList.contains("cccr-edit-warning")) continue;
        const icons = node.matches("i.fa-triangle-exclamation")
          ? [node] : [...node.querySelectorAll("i.fa-triangle-exclamation")];
        const fresh = buildConflictMap();
        icons.forEach(i => _processWarningIcon(i, element, fresh));
      }
    }
  });
  state.iconObserver.observe(main, { childList: true, subtree: true });
}

function _processWarningIcon(icon, element, conflictMap) {
  if (icon.classList.contains("cccr-trigger-icon")) return;
  if (icon.closest(".cccr-expand-panel, .cccr-trigger")) return;
  if (icon.nextElementSibling?.classList.contains("cccr-trigger")) return;

  let row = icon.parentElement, actionId = null;
  for (let d = 0; d < 10 && row; d++) {
    actionId = _tryActionId(row, element);
    if (actionId && conflictMap.has(actionId)) break;
    actionId = null; row = row.parentElement;
  }
  if (!actionId || !row) return;

  const conflicts = conflictMap.get(actionId);
  if (!conflicts?.length) return;

  const byCombo = new Map();
  for (const c of conflicts) {
    if (!byCombo.has(c.combo)) byCombo.set(c.combo, []);
    byCombo.get(c.combo).push(c);
  }

  let combo = [...byCombo.keys()][0];
  const badgeEl  = icon.closest("kbd, abbr, span") ?? icon.parentElement;
  const badgeRaw = (badgeEl?.textContent ?? "").replace(/\s+/g, "").toLowerCase();
  for (const [c] of byCombo) {
    if (badgeRaw.includes(formatCombo(c).replace(/\s+/g, "").toLowerCase())) { combo = c; break; }
  }

  const trigger = _buildTrigger(actionId, combo, byCombo.get(combo) ?? [], row, element);
  icon.insertAdjacentElement("afterend", trigger);
}

function _buildTrigger(actionId, combo, conflictsForCombo, row, element) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cccr-trigger";
  btn.title = `${conflictsForCombo.length} conflict${conflictsForCombo.length !== 1 ? "s" : ""} — click to expand`;
  btn.innerHTML = '<i class="fa-solid fa-circle-exclamation cccr-trigger-icon"></i>';
  btn.dataset.actionId = actionId;
  btn.dataset.combo    = combo;
  btn.addEventListener("click", e => {
    e.preventDefault(); e.stopPropagation();
    _toggleExpansion(btn, row, actionId, combo, conflictsForCombo, element);
  });
  return btn;
}

// ---------------------------------------------------------------------------
// 4. Expansion panel
// ---------------------------------------------------------------------------

function _toggleExpansion(trigger, row, actionId, combo, conflictsForCombo, element) {
  const next = row.nextElementSibling;
  if (next?.classList.contains("cccr-expand-panel") &&
      next.dataset.forAction === actionId && next.dataset.combo === combo) {
    next.remove();
    trigger.classList.remove("cccr-trigger-active");
    return;
  }

  const list = row.closest("ol,ul,section,div");
  list?.querySelectorAll(".cccr-expand-panel").forEach(p => p.remove());
  list?.querySelectorAll(".cccr-trigger-active").forEach(t => t.classList.remove("cccr-trigger-active"));
  trigger.classList.add("cccr-trigger-active");

  const ownMeta      = getActionMeta(actionId);
  const comboDisplay = formatCombo(combo);

  const actionList = [
    { ...ownMeta, isSelf: true },
    ...conflictsForCombo.map(c => ({
      actionId:     c.conflictingActionId,
      label:        c.label,
      namespace:    c.conflictingActionId.split(".")[0],
      packageTitle: c.packageTitle,
      isSelf:       false,
      editable:     _isBindingEditable(c.conflictingActionId, combo)
    }))
  ];

  const rowsHTML = actionList.map(a => {
    const badgeHTML = `<kbd class="cccr-badge cccr-badge-warn">
      ${comboDisplay} <i class="fa-solid fa-triangle-exclamation"></i>
    </kbd>`;
    const controlsHTML = a.isSelf
      ? `<span class="cccr-expand-self-label">this</span>`
      : a.editable
        ? `<button type="button" class="cccr-expand-go cccr-find-btn"
                   data-namespace="${a.namespace}" data-action-id="${a.actionId}"
                   title="Navigate to this action">
             <i class="fa-solid fa-arrow-right"></i>
           </button>
           <button type="button" class="cccr-expand-edit cccr-find-btn cccr-btn-edit"
                   title="Edit this binding inline">
             <i class="fa-solid fa-pen-to-square"></i>
           </button>`
        : `<span class="cccr-locked-badge" title="This binding is locked">
             <i class="fa-solid fa-lock"></i>
           </span>`;

    return `<div class="cccr-expand-row${a.isSelf ? " cccr-expand-self" : ""}"
                 data-action-id="${a.actionId}" data-combo="${combo}">
      <div class="cccr-expand-left">
        <span class="cccr-expand-name">${a.label}</span>
        <span class="cccr-expand-module">${a.packageTitle}</span>
      </div>
      <div class="cccr-expand-badge-area">
        ${badgeHTML}
        ${controlsHTML}
      </div>
    </div>`;
  }).join("");

  const panel = document.createElement("li");
  panel.className          = "cccr-expand-panel";
  panel.dataset.forAction  = actionId;
  panel.dataset.combo      = combo;
  panel.innerHTML = `<div class="cccr-expand-content">${rowsHTML}</div>`;

  panel.querySelectorAll(".cccr-expand-edit").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const expandRow = btn.closest(".cccr-expand-row");
      _startInlineEdit(expandRow, element);
    });
  });

  panel.querySelectorAll(".cccr-expand-go").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const state = _getState();
      if (state) state.pendingHighlight = { actionId: btn.dataset.actionId, combo, autoEdit: false };
      const appEl = btn.closest(".window-app, .application") ?? element;
      _navigateToCategory(btn.dataset.namespace, appEl, state);
    });
  });

  row.insertAdjacentElement("afterend", panel);
}

// ---------------------------------------------------------------------------
// 5. Inline edit
// ---------------------------------------------------------------------------

function _isBindingEditable(actionId, combo) {
  const bindings = game.keybindings.bindings.get(actionId) ?? [];
  return bindings.some(b => normalizeCombo(b.key, b.modifiers ?? []) === combo);
}

function _startInlineEdit(expandRow, element) {
  const actionId   = expandRow.dataset.actionId;
  const combo      = expandRow.dataset.combo;
  const badgeArea  = expandRow.querySelector(".cccr-expand-badge-area");
  if (!badgeArea || !actionId || !combo) return;

  const [namespace, ...rest] = actionId.split(".");
  const actionName           = rest.join(".");

  let newKey  = null;
  let newMods = [];

  badgeArea.innerHTML = `
    <div class="cccr-inline-edit">
      <input type="text" class="cccr-key-input" placeholder="Press a key…" readonly>
      <button type="button" class="cccr-save-key" title="Save" disabled>
        <i class="fa-solid fa-check"></i>
      </button>
      <button type="button" class="cccr-clear-key" title="Remove binding">
        <i class="fa-solid fa-trash-can"></i>
      </button>
      <button type="button" class="cccr-cancel-key" title="Cancel">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
    <div class="cccr-inline-warning" style="display:none"></div>`;

  const input     = badgeArea.querySelector(".cccr-key-input");
  const saveBtn   = badgeArea.querySelector(".cccr-save-key");
  const clearBtn  = badgeArea.querySelector(".cccr-clear-key");
  const cancelBtn = badgeArea.querySelector(".cccr-cancel-key");
  const warning   = badgeArea.querySelector(".cccr-inline-warning");

  requestAnimationFrame(() => input.focus());

  input.addEventListener("keydown", e => {
    e.preventDefault(); e.stopPropagation();
    const { code, key, ctrlKey, shiftKey, altKey } = e;
    if (key === "Escape") { cancelBtn.click(); return; }
    if (["Control","Shift","Alt","Meta"].includes(key)) return;
    const mods = [];
    if (ctrlKey)  mods.push("CONTROL");
    if (shiftKey) mods.push("SHIFT");
    if (altKey)   mods.push("ALT");
    newKey  = code;
    newMods = mods;
    const newCombo = normalizeCombo(code, mods);
    input.value    = formatCombo(newCombo);
    saveBtn.disabled = false;
    const conflicting = getActionsForCombo(newCombo).filter(a => a.actionId !== actionId);
    if (conflicting.length) {
      const names = conflicting.map(a => `<strong>${a.label}</strong> <em>(${a.packageTitle})</em>`).join(", ");
      warning.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Also used by: ${names}`;
      warning.className = "cccr-inline-warning cccr-inline-warn";
    } else {
      warning.innerHTML = `<i class="fa-solid fa-circle-check"></i> <kbd class="cccr-badge">${formatCombo(newCombo)}</kbd> — no conflicts`;
      warning.className = "cccr-inline-warning cccr-inline-ok";
    }
    warning.style.display = "";
  });

  saveBtn.addEventListener("click", async () => {
    if (!newKey) return;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    const current = game.keybindings.bindings.get(actionId) ?? [];
    let replaced  = false;
    const updated = current.map(b => {
      if (normalizeCombo(b.key, b.modifiers ?? []) === combo) { replaced = true; return { key: newKey, modifiers: newMods }; }
      return b;
    });
    if (!replaced) updated.push({ key: newKey, modifiers: newMods });
    try {
      await game.keybindings.set(namespace, actionName, updated);
      const app = _getState()?.controlsConfigApp;
      if (app) setTimeout(() => app.render(), 100);
    } catch (err) {
      console.error("[CCCR] Failed to save binding:", err);
      warning.innerHTML = `<i class="fa-solid fa-xmark"></i> Save failed: ${err.message}`;
      warning.className = "cccr-inline-warning cccr-inline-warn";
      warning.style.display = "";
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
    }
  });

  cancelBtn.addEventListener("click", () => _restoreBadgeArea(badgeArea, actionId, combo));

  clearBtn.addEventListener("click", async () => {
    clearBtn.disabled = true;
    clearBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    const current  = game.keybindings.bindings.get(actionId) ?? [];
    const filtered = current.filter(b => normalizeCombo(b.key, b.modifiers ?? []) !== combo);
    try {
      await game.keybindings.set(namespace, actionName, filtered);
      const app = _getState()?.controlsConfigApp;
      if (app) setTimeout(() => app.render(), 100);
    } catch (err) {
      console.error("[CCCR] Failed to remove binding:", err);
      warning.innerHTML = `<i class="fa-solid fa-xmark"></i> Failed: ${err.message}`;
      warning.className = "cccr-inline-warning cccr-inline-warn";
      warning.style.display = "";
      clearBtn.disabled = false;
      clearBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
    }
  });
}

function _restoreBadgeArea(badgeArea, actionId, combo) {
  const editable     = _isBindingEditable(actionId, combo);
  const comboDisplay = formatCombo(combo);
  const [namespace]  = actionId.split(".");

  badgeArea.innerHTML = `
    <kbd class="cccr-badge cccr-badge-warn">
      ${comboDisplay} <i class="fa-solid fa-triangle-exclamation"></i>
    </kbd>
    ${editable
      ? `<button type="button" class="cccr-expand-go cccr-find-btn"
                 data-namespace="${namespace}" data-action-id="${actionId}">
           <i class="fa-solid fa-arrow-right"></i>
         </button>
         <button type="button" class="cccr-expand-edit cccr-find-btn cccr-btn-edit">
           <i class="fa-solid fa-pen-to-square"></i>
         </button>`
      : `<span class="cccr-locked-badge"><i class="fa-solid fa-lock"></i></span>`}`;

  badgeArea.querySelector(".cccr-expand-edit")?.addEventListener("click", e => {
    e.stopPropagation();
    const expandRow = badgeArea.closest(".cccr-expand-row");
    if (expandRow) _startInlineEdit(expandRow, null);
  });
  badgeArea.querySelector(".cccr-expand-go")?.addEventListener("click", e => {
    e.stopPropagation();
    const state = _getState();
    if (state) state.pendingHighlight = { actionId, combo, autoEdit: false };
    _navigateToCategory(namespace, badgeArea.closest(".window-app, .application") ?? document, state);
  });
}

// ---------------------------------------------------------------------------
// 6. Pending highlight
// ---------------------------------------------------------------------------

function _processPendingHighlight(element, state) {
  const { actionId, combo, autoEdit } = state.pendingHighlight;
  state.pendingHighlight = null;
  let attempts = 0;
  const tryHighlight = () => {
    attempts++;
    for (const row of _actionRows(element)) {
      if (_actionId(row, element) !== actionId) continue;
      _scrollToRow(row);
      row.classList.add("cccr-highlight-action");
      setTimeout(() => row.classList.remove("cccr-highlight-action"), 2500);
      if (autoEdit) {
        setTimeout(() => {
          const btns = [...row.querySelectorAll(
            "a.control.edit, button[data-action='editBinding'], .fa-pen, .fa-edit, .fa-pen-to-square, button[title*='dit'], a[title*='dit']"
          )];
          (btns[0]?.closest("button,a") ?? btns[0])?.click();
        }, 400);
      }
      return;
    }
    if (attempts < 8) setTimeout(tryHighlight, 150);
  };
  setTimeout(tryHighlight, 120);
}

function _scrollToRow(row) {
  let container = row.parentElement;
  while (container && container !== document.body) {
    const { overflow, overflowY } = window.getComputedStyle(container);
    if (/auto|scroll/.test(overflow + overflowY) && container.scrollHeight > container.clientHeight) break;
    container = container.parentElement;
  }
  if (container && container !== document.body) {
    const center = row.offsetTop - container.offsetTop - (container.clientHeight / 2) + (row.offsetHeight / 2);
    container.scrollTo({ top: Math.max(0, center), behavior: "smooth" });
  } else {
    row.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

// ---------------------------------------------------------------------------
// 7. Navigation
// ---------------------------------------------------------------------------

function _navigateToCategory(namespace, element, state) {
  if (!namespace) return;
  const nativeSearch = element?.querySelector("input[type='search'], input.search, input[name='search']");
  if (nativeSearch?.value) {
    nativeSearch.value = "";
    nativeSearch.dispatchEvent(new Event("input",  { bubbles: true }));
    nativeSearch.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const app = state?.controlsConfigApp ?? _getState()?.controlsConfigApp;
  if (app) {
    for (const method of ["changeTab","selectCategory","_activateTab"]) {
      if (typeof app[method] === "function") { try { app[method](namespace); return; } catch(_) {} }
    }
  }
  const sidebar = _sidebar(element);
  if (!sidebar) return;
  for (const sel of [`[data-id="${namespace}"]`,`[data-tab="${namespace}"]`,`[data-category="${namespace}"]`]) {
    const el = sidebar.querySelector(sel);
    if (el) { (el.querySelector("button, a") ?? el).click(); return; }
  }
  const meta = getActionMeta(`${namespace}.__x__`);
  for (const item of sidebar.querySelectorAll("li, button, [role='tab'], a")) {
    if (item.textContent.replace(/\s*\[.*?\]/g,"").trim() === meta.packageTitle) { item.click(); return; }
  }
}

// ---------------------------------------------------------------------------
// 8. Sidebar badge
// ---------------------------------------------------------------------------

function _injectSidebarBadge(element, state) {
  element.querySelector(".cccr-sidebar-badge")?.remove();
  const sidebar = _sidebar(element);
  if (!sidebar) return;
  const count = getAllConflictPairs().length;
  const badge = document.createElement("div");
  badge.className = "cccr-sidebar-badge";
  if (count > 0) {
    badge.innerHTML = `
      <button type="button" class="cccr-badge-btn cccr-badge-conflicts">
        <i class="fa-solid fa-triangle-exclamation"></i>
        ${count} Conflict${count !== 1 ? "s" : ""}
      </button>`;
    badge.querySelector("button").addEventListener("click", () => state.openConflictViewer?.());
  } else {
    badge.innerHTML = `<div class="cccr-badge-btn cccr-badge-ok">
      <i class="fa-solid fa-circle-check"></i> No Conflicts
    </div>`;
  }
  sidebar.appendChild(badge);
}

// ---------------------------------------------------------------------------
// 9. Real-time edit warning (Foundry native edit input)
// ---------------------------------------------------------------------------

function _setupEditObserver(element, state) {
  state.editObserver?.disconnect();
  const main = _main(element);
  if (!main) return;

  let currentWarning      = null;
  let currentSuggestNote  = null;
  let currentEditActionId = null;
  let currentEditSnapshot = null;

  state.editObserver = new MutationObserver(mutations => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.classList.contains("cccr-expand-panel") ||
            node.classList.contains("cccr-trigger")      ||
            node.classList.contains("cccr-edit-warning") ||
            node.classList.contains("cccr-inline-edit")) continue;
        const inputs = node.matches("input") ? [node] : [...node.querySelectorAll("input")];
        for (const inp of inputs) {
          if (inp.dataset.cccrWatched) continue;
          inp.dataset.cccrWatched = "1";
          const actionRow = inp.closest(
            "li[data-id],li[data-action-id],li.entry.keybinding,li.keybinding-action,li.action,li.entry,[data-keybinding]"
          );
          currentEditActionId = actionRow ? _actionId(actionRow, element) : null;
          if (currentEditActionId) {
            currentEditSnapshot = foundry.utils.deepClone(game.keybindings.bindings.get(currentEditActionId) ?? []);
          }
          const result = _watchEditInput(inp, element, currentEditActionId);
          currentWarning    = result.warning;
          currentSuggestNote = result.suggestNote;
        }
      }
      for (const node of mut.removedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (currentWarning && (node.matches("input") || node.querySelector?.("input"))) {
          currentWarning.remove();
          currentSuggestNote?.remove();
          currentWarning = currentSuggestNote = null;

          // Detect suggest-mode override: binding changed while editing
          if (currentEditActionId && currentEditSnapshot !== null) {
            const globals = getGlobalBindings();
            const isGlobal = !!globals[currentEditActionId];
            if (isGlobal && getGlobalMode() === "suggest") {
              const newBindings = game.keybindings.bindings.get(currentEditActionId) ?? [];
              const oldNorm = currentEditSnapshot.map(b => normalizeCombo(b.key, b.modifiers ?? [])).sort().join("|");
              const newNorm = newBindings.map(b => normalizeCombo(b.key, b.modifiers ?? [])).sort().join("|");
              if (oldNorm !== newNorm) markUserOverride(currentEditActionId);
            }
          }
          currentEditActionId = null;
          currentEditSnapshot = null;
        }
      }
    }
  });
  state.editObserver.observe(main, { childList: true, subtree: true });
}

function _watchEditInput(input, element, ownActionId) {
  if (ownActionId === undefined || ownActionId === null) {
    const actionRow = input.closest(
      "li[data-id],li[data-action-id],li.entry.keybinding,li.keybinding-action,li.action,li.entry,[data-keybinding]"
    );
    ownActionId = actionRow ? _actionId(actionRow, element) : null;
  }

  const globals     = getGlobalBindings();
  const globalMode  = getGlobalMode();
  const isGlobal    = ownActionId ? !!globals[ownActionId] : false;

  // Dynamic conflict warning (hidden until user presses a key)
  const warning = document.createElement("div");
  warning.className = "cccr-edit-warning";
  warning.style.display = "none";
  input.insertAdjacentElement("afterend", warning);

  // Static GM-policy note shown immediately when edit input opens
  let suggestNote = null;
  if (isGlobal) {
    suggestNote = document.createElement("div");
    if (globalMode === "locked") {
      suggestNote.className = "cccr-edit-warning cccr-edit-locked-note";
      suggestNote.innerHTML = `<i class="fa-solid fa-lock"></i> This keybinding has been locked by the GM. Changes will not be saved.`;
    } else {
      suggestNote.className = "cccr-edit-warning cccr-edit-suggest-note";
      suggestNote.innerHTML = `<i class="fa-solid fa-lock-open"></i> This keybinding was set as default by the GM. Your changes will be saved for your account only.`;
    }
    warning.insertAdjacentElement("afterend", suggestNote);
  }

  input.addEventListener("keydown", e => {
    const { code, key, ctrlKey, shiftKey, altKey } = e;
    if (["Control","Shift","Alt","Meta","Escape"].includes(key)) return;
    const mods = [];
    if (ctrlKey)  mods.push("CONTROL");
    if (shiftKey) mods.push("SHIFT");
    if (altKey)   mods.push("ALT");
    const combo       = normalizeCombo(code, mods);
    const conflicting = getActionsForCombo(combo).filter(a => a.actionId !== ownActionId);
    if (conflicting.length) {
      const list = conflicting.map(a => `<strong>${a.label}</strong> <em>(${a.packageTitle})</em>`).join(", ");
      warning.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Conflicts with: ${list}`;
      warning.className = "cccr-edit-warning cccr-edit-conflict";
    } else {
      warning.innerHTML = `<i class="fa-solid fa-circle-check"></i> <kbd class="cccr-badge">${formatCombo(combo)}</kbd> — no conflicts`;
      warning.className = "cccr-edit-warning cccr-edit-ok";
    }
    warning.style.display = "";
  });

  return { warning, suggestNote };
}

// ---------------------------------------------------------------------------
// 10. Global keybinding icons
// ---------------------------------------------------------------------------

function _injectGlobalIcons(element, state) {
  const globals    = getGlobalBindings();
  const globalMode = getGlobalMode();
  const isGM       = game.user.isGM;
  const overrides  = isGM ? {} : getUserOverrides();

  for (const row of _actionRows(element)) {
    // Skip rows that already have our button (partial re-render guard)
    if (row.querySelector(".cccr-global-btn")) continue;

    const actionId = _actionId(row, element);
    if (!actionId) continue;

    const entry = globals[actionId] ?? null;
    const btn   = _buildGlobalBtn(actionId, entry, isGM, overrides, globalMode);

    // V14 ControlsConfig: action name lives in span.label inside div.form-group.
    // Fallback chain: span.label > header > h3/h4 > label element > row itself.
    const target = row.querySelector("span.label")
      ?? row.querySelector("header, .entry-header, .action-header")
      ?? row.querySelector("h3, h4, label.entry-label, label, .action-name, .name")
      ?? row;
    target.appendChild(btn);
  }

  _interceptLockedEdits(element, globals, globalMode);
}

function _buildGlobalBtn(actionId, entry, isGM, overrides, globalMode) {
  const isActive = !!entry;

  const btn = document.createElement("button");
  btn.type  = "button";
  btn.dataset.actionId   = actionId;
  btn.dataset.cccrGlobal = "1";

  const classes = ["cccr-global-btn"];
  if (isActive) classes.push("cccr-global-active", `cccr-global-${globalMode}`);
  btn.className = classes.join(" ");

  // Closed lock = locked mode (red). Open lock = inactive or suggest (white).
  const lockClass = (isActive && globalMode === "locked") ? "fa-lock" : "fa-lock-open";
  btn.innerHTML = `<i class="fa-solid ${lockClass}"></i>`;

  if (isGM) {
    btn.title = isActive
      ? `Global keybinding (${globalMode === "locked" ? "Locked" : "Default"}) — click to manage`
      : "Set as global keybinding for all users";
    btn.addEventListener("click", e => {
      e.preventDefault(); e.stopPropagation();
      _openGlobalDialog(actionId, entry);
    });
  } else if (isActive && globalMode === "suggest" && overrides[actionId]) {
    // User has overridden a suggest binding: clickable for reset
    btn.classList.add("cccr-global-overridden");
    btn.title = "GM-suggested keybinding (you have a custom binding) — click to reset";
    btn.addEventListener("click", e => {
      e.preventDefault(); e.stopPropagation();
      _openResetDialog(actionId, entry);
    });
  } else {
    btn.title = isActive
      ? (globalMode === "locked"
          ? "This keybinding has been locked by the GM"
          : "This keybinding was set as default by the GM")
      : "";
    btn.style.pointerEvents = "none";
    btn.style.cursor = "default";
  }

  return btn;
}

// ---------------------------------------------------------------------------
// 11. GM dialog — create or manage global policy
//     Mode comes from module settings, NOT selected per-action.
//     Empty bindings (no hotkey) are allowed.
// ---------------------------------------------------------------------------

async function _openGlobalDialog(actionId, entry) {
  const { DialogV2 } = foundry.applications.api;
  const meta       = getActionMeta(actionId);
  const bindings   = game.keybindings.bindings.get(actionId) ?? [];
  const globalMode = getGlobalMode();

  const currentDisplay = bindings.length
    ? bindings.map(b => formatCombo(normalizeCombo(b.key, b.modifiers ?? []))).join(", ")
    : "(no binding)";

  const modeLabel = globalMode === "locked"
    ? "Locked — users cannot change this binding"
    : "Default — users can override this binding";

  if (!entry) {
    // ---- Create: no existing global policy ----
    const bindingLine = bindings.length
      ? `<p>Binding to apply: <kbd class="cccr-badge">${currentDisplay}</kbd></p>`
      : `<p>Policy: remove any existing binding for this action on all users.</p>`;

    await DialogV2.wait({
      window: { title: `Set Global Keybinding: ${meta.label}` },
      content: `
        <div class="cccr-global-dialog">
          <p>Apply a global keybinding policy for <strong>${meta.label}</strong>
             <em>(${meta.packageTitle})</em> to all users in this world?</p>
          ${bindingLine}
          <p class="cccr-global-hint">Enforcement mode: <strong>${modeLabel}</strong><br>
             (Change via Module Settings to affect all global keybindings)</p>
        </div>`,
      buttons: [
        {
          label:    "Apply Globally",
          action:   "apply",
          callback: async (event, button) => {
            await setGlobalBinding(actionId, bindings);
            setTimeout(() => _getState()?.controlsConfigApp?.render({ force: true }), 200);
          }
        },
        { label: "Cancel", action: "cancel" }
      ]
    });

  } else {
    // ---- Manage: existing global policy ----
    const storedDisplay = entry.bindings.length
      ? entry.bindings.map(b => formatCombo(normalizeCombo(b.key, b.modifiers ?? []))).join(", ")
      : "(no binding)";

    const sessionDiffers = currentDisplay !== storedDisplay;
    const updateRow = sessionDiffers
      ? `<div class="cccr-global-field">
           <label>
             <input type="checkbox" name="updateBinding">
             Update to current session value
             (<kbd class="cccr-badge">${currentDisplay}</kbd>)
           </label>
         </div>`
      : "";

    await DialogV2.wait({
      window: { title: `Manage Global: ${meta.label}` },
      content: `
        <div class="cccr-global-dialog">
          <p>Global policy for <strong>${meta.label}</strong>
             <em>(${meta.packageTitle})</em>:</p>
          <p>Stored binding: <kbd class="cccr-badge">${storedDisplay}</kbd></p>
          <p class="cccr-global-hint">Mode: <strong>${modeLabel}</strong><br>
             (Change via Module Settings)</p>
          ${sessionDiffers ? `<hr class="cccr-global-hr">` : ""}
          ${updateRow}
        </div>`,
      buttons: [
        {
          label:    "Update",
          action:   "update",
          callback: async (event, button) => {
            // Read checkbox via button.closest — works regardless of V14 dialog arg type
            const root     = button.closest("form") ?? button.closest(".application, dialog");
            const doUpdate = root?.querySelector("input[name='updateBinding']")?.checked ?? false;
            const newBinds = doUpdate ? bindings : entry.bindings;
            await setGlobalBinding(actionId, newBinds);
            setTimeout(() => _getState()?.controlsConfigApp?.render({ force: true }), 200);
          }
        },
        {
          label:    "Remove Policy",
          action:   "remove",
          callback: async () => {
            await removeGlobalBinding(actionId);
            setTimeout(() => _getState()?.controlsConfigApp?.render({ force: true }), 200);
          }
        },
        { label: "Cancel", action: "cancel" }
      ]
    });
  }
}

// ---------------------------------------------------------------------------
// 12. Non-GM reset dialog
// ---------------------------------------------------------------------------

async function _openResetDialog(actionId, entry) {
  const { DialogV2 } = foundry.applications.api;
  const meta    = getActionMeta(actionId);
  const display = entry.bindings.length
    ? entry.bindings.map(b => formatCombo(normalizeCombo(b.key, b.modifiers ?? []))).join(", ")
    : "(no binding)";

  const result = await DialogV2.wait({
    window: { title: `Reset to GM Default: ${meta.label}` },
    content: `
      <div class="cccr-global-dialog">
        <p>Reset <strong>${meta.label}</strong> to the GM-suggested binding?</p>
        <p>GM default: <kbd class="cccr-badge">${display}</kbd></p>
        <p>Your custom binding will be replaced.</p>
      </div>`,
    buttons: [
      { label: "Reset to Default", action: "reset"  },
      { label: "Keep My Binding",  action: "cancel" }
    ]
  });

  if (result === "reset") {
    const [namespace, ...rest] = actionId.split(".");
    try {
      await clearUserOverride(actionId);
      await game.keybindings.set(namespace, rest.join("."), entry.bindings);
      setTimeout(() => _getState()?.controlsConfigApp?.render({ force: true }), 200);
    } catch (err) {
      console.error("[CCCR] Failed to reset binding:", err);
      ui.notifications.error(`Failed to reset "${meta.label}": ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// 13. Locked-edit interceptor (only active when global mode is "locked")
// ---------------------------------------------------------------------------

function _interceptLockedEdits(element, globals, globalMode) {
  // Remove previous listener first (element reference is reused across re-renders)
  if (element._cccrLockHandler) {
    element.removeEventListener("click", element._cccrLockHandler, true);
    delete element._cccrLockHandler;
  }

  // In suggest mode users are allowed to edit — no interception needed
  if (globalMode !== "locked") return;

  const lockedIds = new Set(Object.keys(globals));
  if (!lockedIds.size) return;

  element._cccrLockHandler = (ev) => {
    if (ev.target.closest(
      ".cccr-global-btn, .cccr-expand-panel, .cccr-trigger, .cccr-inline-edit"
    )) return;

    const control = ev.target.closest("a.control, button[data-action], button[type='button']");
    if (!control || control.dataset.cccrGlobal) return;

    const row = control.closest(
      "div.form-group[data-action-id], div[data-action-id], " +
      "li[data-id], li[data-action-id], li.entry, li.keybinding-action"
    );
    if (!row) return;

    const actionId = _tryActionId(row, element);
    if (!actionId || !lockedIds.has(actionId)) return;

    ev.preventDefault();
    ev.stopPropagation();

    const meta = getActionMeta(actionId);
    ui.notifications.warn(
      `"${meta.label}" — This keybinding has been locked by the GM and cannot be changed.`
    );
  };

  element.addEventListener("click", element._cccrLockHandler, true);
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function _main(el)    {
  return el.querySelector(
    "[data-application-part='main'], .category-browser-main, " +
    ".entry-list-container, section.main, .entries-wrapper"
  );
}
function _sidebar(el) {
  return el.querySelector(
    "[data-application-part='sidebar'], .category-browser-sidebar, .sidebar, aside"
  );
}

function _actionRows(element) {
  const main = _main(element);
  if (!main) return [];
  const p = [...main.querySelectorAll(
    "li[data-id],li[data-action-id],li[data-entry-id],li.entry.keybinding," +
    "li.keybinding-action,li.action,li.entry,div[data-id],div[data-action-id]"
  )].filter(el => !el.classList.contains("cccr-expand-panel"));
  if (p.length) return p;
  return [...main.querySelectorAll("li")].filter(el =>
    !el.classList.contains("cccr-expand-panel") &&
    el.querySelector("label, kbd, i.fa-triangle-exclamation, button")
  );
}

function _actionId(el, element) { return _tryActionId(el, element); }

function _tryActionId(el, element) {
  if (!el?.dataset) return null;
  const direct = el.dataset.id ?? el.dataset.actionId ?? el.dataset.entryId
               ?? el.dataset.key ?? el.dataset.action ?? el.dataset.name;
  if (direct) {
    if (direct.includes(".")) return direct;
    const ns = _currentNamespace(element);
    if (ns) { const f = `${ns}.${direct}`; if (game.keybindings.actions.has(f)) return f; }
    for (const [id] of game.keybindings.actions) { if (id.endsWith(`.${direct}`)) return id; }
    return direct;
  }
  const norm = s => s.replace(/[^\p{L}\p{N}\s\-\/]/gu," ").replace(/\s+/g," ").trim().toLowerCase();
  const labelEl = el.querySelector?.("label,.entry-name,.action-name,h3,h4,.name,span.name");
  const t = norm(labelEl?.textContent ?? el.firstChild?.textContent ?? "");
  if (!t) return null;
  for (const [id, cfg] of game.keybindings.actions) {
    const raw = cfg.name ?? id;
    const lbl = raw.includes(".") ? game.i18n.localize(raw) : raw;
    if (norm(lbl) === t) return id;
  }
  return null;
}

function _currentNamespace(element) {
  const sidebar = _sidebar(element);
  if (!sidebar) return null;
  const active = sidebar.querySelector(
    "li.active[data-id],li.selected[data-id],[aria-selected='true'][data-id],.active[data-id],.selected[data-id]"
  );
  return active?.dataset?.id ?? null;
}
