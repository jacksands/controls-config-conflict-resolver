/**
 * main.mjs — Controls Configuration Conflict Resolver
 */

import { getAllConflictPairs                        } from "./detector.mjs";
import { injectAll, _setStateRef                   } from "./injector.mjs";
import { ConflictViewer                            } from "./viewer.mjs";
import { InstructionsViewer                        } from "./instructions.mjs";
import {
  registerGlobalSettings, applyGlobalBindings, SETTING_MODE
} from "./globals.mjs";

const MODULE_ID = "controls-config-conflict-resolver";

const STATE = {
  comboFilter:          null,
  contextNoteDismissed: false,
  editObserver:         null,
  iconObserver:         null,
  controlsConfigApp:    null,
  pendingHighlight:     null,
  openConflictViewer: () => new ConflictViewer().render({ force: true })
};

_setStateRef(STATE);

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

Hooks.once("init", () => {

  // Global keybinding world-side storage settings
  registerGlobalSettings();

  // Global enforcement mode: one setting for the whole module, GM-only.
  // Registered here (not in globals.mjs) so onChange can access STATE.
  game.settings.register(MODULE_ID, SETTING_MODE, {
    name:       "Global Keybinding Enforcement",
    hint:       "Whether GM-defined global keybindings are locked (players cannot change) or set as default (players can override). Applies to all global keybindings in this world.",
    scope:      "world",
    config:     true,
    restricted: true,
    type:       String,
    choices: {
      "locked":  "Locked — players cannot change GM keybindings",
      "suggest": "Default — players receive GM keybindings but can override them"
    },
    default:  "locked",
    onChange: () => {
      STATE.controlsConfigApp?.render({ force: true });
      applyGlobalBindings();
    }
  });

  // -- Instructions viewer --
  game.settings.registerMenu(MODULE_ID, "openInstructions", {
    name:       "Instructions",
    label:      "How to Use",
    hint:       "Learn about conflict detection, combo search, inline editing, and global keybindings.",
    icon:       "fa-solid fa-book-open",
    type:       InstructionsViewer,
    restricted: false
  });

  // -- Conflict overview --
  game.settings.registerMenu(MODULE_ID, "openViewer", {
    name:       "Conflict Overview",
    label:      "Open Conflict Overview",
    hint:       "Full list of keybinding conflicts with exact action names and module sources.",
    icon:       "fa-solid fa-triangle-exclamation",
    type:       ConflictViewer,
    restricted: false
  });

  // -- Color theme --
  game.settings.register(MODULE_ID, "colorTheme", {
    name:   "Color Theme",
    hint:   "Visual color palette for all module windows and panels.",
    scope:  "client",
    config: true,
    type:   String,
    choices: {
      default: "Amber & Dark (default)",
      navy:    "Midnight Navy & Warm Sand"
    },
    default:  "default",
    onChange: (value) => _applyTheme(value)
  });
});

Hooks.once("ready", () => {
  _applyTheme(game.settings.get(MODULE_ID, "colorTheme"));
  applyGlobalBindings();
});

function _applyTheme(theme) {
  document.body.classList.toggle("cccr-theme-navy", theme === "navy");
}

// ---------------------------------------------------------------------------
// ControlsConfig injection
// ---------------------------------------------------------------------------

Hooks.on("renderApplicationV2", (app, element, _ctx, options) => {
  if (app.constructor.name !== "ControlsConfig") return;
  STATE.controlsConfigApp = app;
  const parts = options?.parts ?? [];
  try {
    injectAll(app, element, STATE, parts);
  } catch (err) {
    console.error(`[${MODULE_ID}] injection error:`, err);
  }
});

Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
  if (app.constructor.name !== "ControlsConfig") return;
  const count = getAllConflictPairs().length;
  controls.unshift({
    action:   "cccr-show-conflicts",
    icon:     count > 0 ? "fa-solid fa-triangle-exclamation" : "fa-solid fa-circle-check",
    name:     count > 0 ? `Show Conflicts (${count})` : "No Conflicts Detected",
    callback: () => new ConflictViewer().render({ force: true })
  });
});
