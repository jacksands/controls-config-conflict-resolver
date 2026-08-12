/**
 * injector.mjs — Controls Configuration Conflict Resolver
 */

import {
  normalizeCombo, formatCombo,
  getActionsForCombo, buildConflictMap, getAllConflictPairs, getActionMeta
} from "./detector.mjs";

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
// 3. Conflict trigger icons — MutationObserver from i.fa-triangle-exclamation
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
// 4. Expansion panel — inline edit within the panel
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

  // Build rows: self first (dimmed, no edit), then each conflict
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
      ? `<span class="cccr-expand-self-label">← this</span>`
      : a.editable
        ? `<button type="button" class="cccr-expand-go cccr-find-btn"
                   data-namespace="${a.namespace}" data-action-id="${a.actionId}"
                   title="Navigate to this action's category">
             <i class="fa-solid fa-arrow-right"></i>
           </button>
           <button type="button" class="cccr-expand-edit cccr-find-btn cccr-btn-edit"
                   title="Edit this binding here — no navigation needed">
             <i class="fa-solid fa-pen-to-square"></i>
           </button>`
        : `<span class="cccr-locked-badge" title="This binding is locked and cannot be changed">
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

  // Wire up Edit buttons
  panel.querySelectorAll(".cccr-expand-edit").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const expandRow = btn.closest(".cccr-expand-row");
      _startInlineEdit(expandRow, element);
    });
  });

  // Wire up → Go buttons (navigate to that action's category)
  panel.querySelectorAll(".cccr-expand-go").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const state = _getState();
      if (state) state.pendingHighlight = {
        actionId: btn.dataset.actionId, combo, autoEdit: false
      };
      const appEl = btn.closest(".window-app, .application") ?? element;
      _navigateToCategory(btn.dataset.namespace, appEl, state);
    });
  });

  row.insertAdjacentElement("afterend", panel);
}

// ---------------------------------------------------------------------------
// 5. Inline edit — edit a binding directly inside the expansion row
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
      <button type="button" class="cccr-save-key" title="Save new binding" disabled>
        <i class="fa-solid fa-check"></i>
      </button>
      <button type="button" class="cccr-clear-key" title="Remove this binding (leave action unassigned)">
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

  // Focus the input so keydown events reach it
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

    // Real-time conflict check
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

    // Replace the old binding with the new one in the current bindings list
    const current = game.keybindings.bindings.get(actionId) ?? [];
    let replaced  = false;
    const updated = current.map(b => {
      if (normalizeCombo(b.key, b.modifiers ?? []) === combo) {
        replaced = true;
        return { key: newKey, modifiers: newMods };
      }
      return b;
    });
    if (!replaced) updated.push({ key: newKey, modifiers: newMods });

    try {
      await game.keybindings.set(namespace, actionName, updated);
      // Re-render Controls Configuration to reflect the change
      const app = _getState()?.controlsConfigApp;
      if (app) {
        // Small delay to let Foundry process the change
        setTimeout(() => app.render(), 100);
      }
    } catch (err) {
      console.error("[CCCR] Failed to save binding:", err);
      warning.innerHTML = `<i class="fa-solid fa-xmark"></i> Save failed: ${err.message}`;
      warning.className = "cccr-inline-warning cccr-inline-warn";
      warning.style.display = "";
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
    }
  });

  cancelBtn.addEventListener("click", () => {
    _restoreBadgeArea(badgeArea, actionId, combo);
  });

  // 🗑 Remove the binding entirely (leaves action unassigned for that combo)
  clearBtn.addEventListener("click", async () => {
    clearBtn.disabled = true;
    clearBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

    const current  = game.keybindings.bindings.get(actionId) ?? [];
    const filtered = current.filter(b =>
      normalizeCombo(b.key, b.modifiers ?? []) !== combo
    );

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
  const meta         = getActionMeta(actionId);

  badgeArea.innerHTML = `
    <kbd class="cccr-badge cccr-badge-warn">
      ${comboDisplay} <i class="fa-solid fa-triangle-exclamation"></i>
    </kbd>
    ${editable
      ? `<button type="button" class="cccr-expand-go cccr-find-btn"
                 data-namespace="${namespace}" data-action-id="${actionId}"
                 title="Navigate to this action's category">
           <i class="fa-solid fa-arrow-right"></i>
         </button>
         <button type="button" class="cccr-expand-edit cccr-find-btn cccr-btn-edit"
                 title="Edit this binding here">
           <i class="fa-solid fa-pen-to-square"></i>
         </button>`
      : `<span class="cccr-locked-badge" title="This binding is locked">
           <i class="fa-solid fa-lock"></i>
         </span>`
    }`;

  badgeArea.querySelector(".cccr-expand-edit")?.addEventListener("click", e => {
    e.stopPropagation();
    const expandRow = badgeArea.closest(".cccr-expand-row");
    if (expandRow) _startInlineEdit(expandRow, null);
  });

  badgeArea.querySelector(".cccr-expand-go")?.addEventListener("click", e => {
    e.stopPropagation();
    const state = _getState();
    if (state) state.pendingHighlight = { actionId, combo, autoEdit: false };
    const appEl = badgeArea.closest(".window-app, .application") ?? document;
    _navigateToCategory(namespace, appEl, state);
  });
}

// ---------------------------------------------------------------------------
// 6. Pending highlight (navigate + scroll/flash)
// ---------------------------------------------------------------------------

function _processPendingHighlight(element, state) {
  const { actionId, combo, autoEdit } = state.pendingHighlight;
  state.pendingHighlight = null;

  let attempts = 0;
  const MAX_ATTEMPTS = 8;
  const INTERVAL_MS  = 150;

  const tryHighlight = () => {
    attempts++;
    for (const row of _actionRows(element)) {
      if (_actionId(row, element) !== actionId) continue;

      // Scroll using the real scrollable container, not the window
      _scrollToRow(row);

      row.classList.add("cccr-highlight-action");
      setTimeout(() => row.classList.remove("cccr-highlight-action"), 2500);

      if (autoEdit) {
        setTimeout(() => {
          const btns = [...row.querySelectorAll(
            "a.control.edit, button[data-action='editBinding'], " +
            ".fa-pen, .fa-edit, .fa-pen-to-square, button[title*='dit'], a[title*='dit']"
          )];
          (btns[0]?.closest("button,a") ?? btns[0])?.click();
        }, 400);
      }
      return; // success — stop retrying
    }

    if (attempts < MAX_ATTEMPTS) setTimeout(tryHighlight, INTERVAL_MS);
    // silently give up after max attempts
  };

  // Initial small delay so the DOM has time to render the new category
  setTimeout(tryHighlight, 120);
}

/**
 * Scroll a row into view using its real scrollable ancestor.
 * scrollIntoView() on large lists often scrolls the window instead of the
 * panel's inner scroll container, so the row never becomes visible.
 */
function _scrollToRow(row) {
  // Walk up to find the first scrollable ancestor
  let container = row.parentElement;
  while (container && container !== document.body) {
    const { overflow, overflowY } = window.getComputedStyle(container);
    if (/auto|scroll/.test(overflow + overflowY) &&
        container.scrollHeight > container.clientHeight) break;
    container = container.parentElement;
  }

  if (container && container !== document.body) {
    // Center the row inside the scrollable container
    const targetTop = row.offsetTop - container.offsetTop;
    const center    = targetTop - (container.clientHeight / 2) + (row.offsetHeight / 2);
    container.scrollTo({ top: Math.max(0, center), behavior: "smooth" });
  } else {
    // Fallback for edge cases
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
      if (typeof app[method] === "function") {
        try { app[method](namespace); return; } catch(_) {}
      }
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
    if (item.textContent.replace(/\s*\[.*?\]/g,"").trim() === meta.packageTitle) {
      item.click(); return;
    }
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
// 9. Real-time edit warning (Foundry's native edit input)
// ---------------------------------------------------------------------------

function _setupEditObserver(element, state) {
  state.editObserver?.disconnect();
  const main = _main(element);
  if (!main) return;
  let currentWarning = null;
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
          currentWarning = _watchEditInput(inp, element);
        }
      }
      for (const node of mut.removedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (currentWarning && (node.matches("input") || node.querySelector("input"))) {
          currentWarning.remove(); currentWarning = null;
        }
      }
    }
  });
  state.editObserver.observe(main, { childList: true, subtree: true });
}

function _watchEditInput(input, element) {
  const actionRow   = input.closest("li[data-id],li[data-action-id],li.entry,[data-keybinding]");
  const ownActionId = actionRow ? _actionId(actionRow, element) : null;
  const warning     = document.createElement("div");
  warning.className = "cccr-edit-warning"; warning.style.display = "none";
  input.insertAdjacentElement("afterend", warning);
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
  return warning;
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function _main(el)    { return el.querySelector("[data-application-part='main'], .category-browser-main, .entry-list-container, section.main, .entries-wrapper"); }
function _sidebar(el) { return el.querySelector("[data-application-part='sidebar'], .category-browser-sidebar, .sidebar, aside"); }

function _actionRows(element) {
  const main = _main(element);
  if (!main) return [];
  const p = [...main.querySelectorAll(
    "li[data-id],li[data-action-id],li[data-entry-id],li.entry.keybinding,li.keybinding-action,li.action,li.entry,div[data-id],div[data-action-id]"
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
