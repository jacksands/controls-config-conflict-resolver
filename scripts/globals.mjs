/**
 * globals.mjs — Controls Configuration Conflict Resolver
 * GM-defined global keybinding policies stored world-side, applied to all users.
 *
 * SETTING_GLOBALS   scope:"world" — stores per-action binding lists. Synced to all clients.
 * SETTING_OVERRIDES scope:"user"  — per-user override flags for suggest-mode bindings.
 * SETTING_MODE      scope:"world" — enforcement mode for the whole module (registered in main.mjs).
 *
 * Storage is server-side: survives browser changes and module disable/re-enable.
 */

const MODULE_ID = "controls-config-conflict-resolver";

export const SETTING_GLOBALS   = "globalBindings";
export const SETTING_OVERRIDES = "userOverrides";
export const SETTING_MODE      = "globalMode";   // registered in main.mjs (needs STATE access)

let _applying = false;

// ---------------------------------------------------------------------------
// Registration — call once from the "init" hook
// ---------------------------------------------------------------------------

export function registerGlobalSettings() {
  // World-scoped: shared, GM-only write, synced to all connected clients via onChange.
  game.settings.register(MODULE_ID, SETTING_GLOBALS, {
    scope:   "world",
    config:  false,
    type:    Object,
    default: {},
    onChange: () => applyGlobalBindings()
  });

  // User-scoped: per user per world, server-side. Tracks overridden suggest bindings.
  game.settings.register(MODULE_ID, SETTING_OVERRIDES, {
    scope:   "user",
    config:  false,
    type:    Object,
    default: {}
  });
  // NOTE: SETTING_MODE is registered in main.mjs because its onChange needs STATE access.
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

export function getGlobalBindings() {
  try { return game.settings.get(MODULE_ID, SETTING_GLOBALS) ?? {}; }
  catch { return {}; }
}

export function getUserOverrides() {
  try { return game.settings.get(MODULE_ID, SETTING_OVERRIDES) ?? {}; }
  catch { return {}; }
}

export function getGlobalMode() {
  try { return game.settings.get(MODULE_ID, SETTING_MODE) ?? "locked"; }
  catch { return "locked"; }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** GM-only: create or replace the global binding for one action.
 *  Mode is NOT stored per-action; it comes from SETTING_MODE globally.
 *  Pass bindings=[] to enforce "no keybinding" for all users. */
export async function setGlobalBinding(actionId, bindings) {
  if (!game.user.isGM) return;
  const all = foundry.utils.deepClone(getGlobalBindings());
  all[actionId] = {
    bindings: bindings.map(b => ({ key: b.key, modifiers: b.modifiers ?? [] }))
  };
  await game.settings.set(MODULE_ID, SETTING_GLOBALS, all);
}

/** GM-only: remove the global policy for one action. */
export async function removeGlobalBinding(actionId) {
  if (!game.user.isGM) return;
  const all = foundry.utils.deepClone(getGlobalBindings());
  delete all[actionId];
  await game.settings.set(MODULE_ID, SETTING_GLOBALS, all);
}

/** Mark that this user has deliberately overridden a suggest-mode binding. */
export async function markUserOverride(actionId) {
  const all = foundry.utils.deepClone(getUserOverrides());
  if (all[actionId]) return;
  all[actionId] = true;
  await game.settings.set(MODULE_ID, SETTING_OVERRIDES, all);
}

/** Clear override flag so the suggest-mode default is re-applied on next login. */
export async function clearUserOverride(actionId) {
  const all = foundry.utils.deepClone(getUserOverrides());
  if (!all[actionId]) return;
  delete all[actionId];
  await game.settings.set(MODULE_ID, SETTING_OVERRIDES, all);
}

// ---------------------------------------------------------------------------
// Application — push global bindings into the current user's keybindings
// ---------------------------------------------------------------------------

export async function applyGlobalBindings() {
  if (_applying || !game.ready) return;
  _applying = true;
  try {
    const globals   = getGlobalBindings();
    const mode      = getGlobalMode();
    const overrides = getUserOverrides();

    for (const [actionId, entry] of Object.entries(globals)) {
      if (!game.keybindings.actions.has(actionId)) continue;
      const [namespace, ...rest] = actionId.split(".");
      const actionName           = rest.join(".");

      try {
        if (mode === "locked") {
          await game.keybindings.set(namespace, actionName, entry.bindings);
        } else if (mode === "suggest" && !overrides[actionId]) {
          await game.keybindings.set(namespace, actionName, entry.bindings);
        }
      } catch (err) {
        console.error(`[CCCR] Failed to apply global binding for ${actionId}:`, err);
      }
    }
  } finally {
    _applying = false;
  }
}
