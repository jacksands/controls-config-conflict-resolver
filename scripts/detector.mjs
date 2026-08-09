/**
 * detector.mjs — Controls Configuration Conflict Resolver
 * Pure conflict detection logic. No DOM access, no side effects.
 */

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Normalize ANY modifier string to a canonical uppercase token.
 * Foundry may store modifiers as "Shift", "SHIFT", "shift", "Control", etc.
 * depending on version and context. We always compare in uppercase.
 * @param {string} m
 * @returns {string}  "CONTROL" | "SHIFT" | "ALT" | m.toUpperCase()
 */
function _canonMod(m) {
  const u = (m ?? "").toUpperCase();
  if (u === "CONTROL" || u === "CTRL") return "CONTROL";
  if (u === "SHIFT")                   return "SHIFT";
  if (u === "ALT")                     return "ALT";
  return u;
}

/**
 * Normalize key + modifiers into a canonical comparison string.
 * Modifiers are normalised to uppercase and sorted, so order and
 * capitalisation differences never cause false mismatches.
 * @param {string}   key
 * @param {string[]} [modifiers]
 * @returns {string}  e.g. "CONTROL+SHIFT+KeyC"
 */
export function normalizeCombo(key, modifiers = []) {
  return [...modifiers].map(_canonMod).sort().concat([key]).join("+");
}

/**
 * Format a single KeyboardEvent.code into a readable label.
 * @param {string} code  e.g. "KeyC", "Digit1", "NumpadAdd", "ArrowUp"
 * @returns {string}
 */
export function formatKey(code) {
  const SPECIAL = {
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
    Space: "Space", Enter: "Enter", Escape: "Esc",
    Backspace: "⌫", Delete: "Del", Tab: "Tab",
    Home: "Home", End: "End", PageUp: "PgUp", PageDown: "PgDn",
    NumpadDecimal: "Num.", NumpadEnter: "NumEnter",
    NumpadAdd: "Num+", NumpadSubtract: "Num−",
    NumpadMultiply: "Num×", NumpadDivide: "Num÷",
    BracketLeft: "[", BracketRight: "]",
    Semicolon: ";", Quote: "'", Backquote: "`",
    Backslash: "\\", Slash: "/", Comma: ",", Period: ".",
    Minus: "−", Equal: "=",
  };
  if (SPECIAL[code]) return SPECIAL[code];
  if (code.startsWith("Key"))    return code.slice(3);
  if (code.startsWith("Digit"))  return code.slice(5);
  if (code.startsWith("Numpad")) return "Num" + code.slice(6);
  return code; // F1–F12, etc.
}

/**
 * Format a normalized combo string into a readable label.
 * @param {string} combo  e.g. "CONTROL+SHIFT+KeyC"
 * @returns {string}      e.g. "Ctrl + Shift + C"
 */
export function formatCombo(combo) {
  const MOD_LABELS = { CONTROL: "Ctrl", SHIFT: "Shift", ALT: "Alt" };
  const parts = combo.split("+");
  const key   = parts[parts.length - 1];
  const mods  = parts.slice(0, -1);
  return [
    ...mods.map(m => MOD_LABELS[m] ?? m),
    formatKey(key)
  ].join(" + ");
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/**
 * Return display metadata for an action ID ("namespace.actionName").
 * @param {string} actionId
 * @returns {{ actionId:string, label:string, namespace:string, packageTitle:string }}
 */
export function getActionMeta(actionId) {
  const config    = game.keybindings.actions.get(actionId);
  const [namespace] = actionId.split(".");

  let packageTitle = namespace;
  if (namespace === "core") {
    packageTitle = "Core Keybindings";
  } else if (game.system?.id === namespace) {
    packageTitle = game.system.title ?? namespace;
  } else {
    const mod = game.modules.get(namespace);
    if (mod) packageTitle = mod.title ?? namespace;
  }

  const rawLabel = config?.name ?? actionId;
  const label    = rawLabel.includes(".") ? game.i18n.localize(rawLabel) : rawLabel;

  return { actionId, label, namespace, packageTitle };
}

// ---------------------------------------------------------------------------
// Internal: collect all active bindings into Map<combo, [{actionId,binding}]>
// ---------------------------------------------------------------------------

function collectAllBindings() {
  const comboToActions = new Map();

  const add = (actionId, binding) => {
    if (!binding?.key) return;
    const combo = normalizeCombo(binding.key, binding.modifiers ?? []);
    if (!comboToActions.has(combo)) comboToActions.set(combo, []);
    const list = comboToActions.get(combo);
    if (!list.find(e => e.actionId === actionId)) {
      list.push({ actionId, binding });
    }
  };

  // Editable (user-customized or default) bindings
  for (const [id, bindings] of game.keybindings.bindings) {
    for (const b of (bindings ?? [])) add(id, b);
  }
  // Uneditable (locked) bindings from action config
  for (const [id, cfg] of game.keybindings.actions) {
    for (const b of (cfg.uneditable ?? [])) add(id, b);
  }

  return comboToActions;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return all actions that currently use a given combo.
 * @param {string} combo  normalized combo from normalizeCombo()
 * @returns {Array<{actionId, label, namespace, packageTitle}>}
 */
export function getActionsForCombo(combo) {
  const all = collectAllBindings();
  return (all.get(combo) ?? []).map(e => getActionMeta(e.actionId));
}

/**
 * Build Map<actionId, ConflictInfo[]>.
 * ConflictInfo: { combo, comboDisplay, conflictingActionId, label, packageTitle }
 * Used for inline conflict row injection and tooltip enhancement.
 * @returns {Map<string, Array>}
 */
export function buildConflictMap() {
  const comboToActions = collectAllBindings();
  const result = new Map();

  for (const [combo, entries] of comboToActions) {
    if (entries.length < 2) continue;
    for (const entry of entries) {
      if (!result.has(entry.actionId)) result.set(entry.actionId, []);
      for (const other of entries) {
        if (other.actionId === entry.actionId) continue;
        const meta = getActionMeta(other.actionId);
        result.get(entry.actionId).push({
          combo,
          comboDisplay:       formatCombo(combo),
          conflictingActionId: other.actionId,
          label:              meta.label,
          packageTitle:       meta.packageTitle
        });
      }
    }
  }

  return result;
}

/**
 * Return all unique conflict pairs sorted by combo.
 * Each: { combo, comboDisplay, action1, action2 }
 * @returns {Array}
 */
export function getAllConflictPairs() {
  const comboToActions = collectAllBindings();
  const pairs = [];
  const seen  = new Set();

  for (const [combo, entries] of comboToActions) {
    if (entries.length < 2) continue;
    const ids = entries.map(e => e.actionId);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = [ids[i], ids[j]].sort().join("|||");
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({
          combo,
          comboDisplay: formatCombo(combo),
          action1: getActionMeta(ids[i]),
          action2: getActionMeta(ids[j])
        });
      }
    }
  }

  return pairs.sort((a, b) => a.combo.localeCompare(b.combo));
}
