# controls config-conflict resolver
controls-config-conflict-resolver


# Controls Configuration Conflict Resolver

> A Foundry VTT module that Helps with the Controls Configuration window — showing you **exactly** what conflicts with what, letting you resolve it more easely.

---

## The Problem

Foundry's native Controls Configuration shows vague warnings like *"Potentially conflicts with Copy"* — but "Copy" might refer to the browser's `Ctrl+C`, while the real conflict is a completely different action from another module using the exact same key combo. There is no way to see which module is responsible, and resolving the conflict requires manually hunting through every category.

---

## Features

### Inline Conflict Expansion

Every conflicting key badge gets a **pulsing orange icon** next to it. Click it to expand a panel directly below the action row, showing every other action that uses the same key combo — with the responsible **module name in amber**.

From the expansion panel you can **edit the conflicting binding right there**, without navigating anywhere:

- Press a new key — an instant warning shows if it also conflicts
- Click **✓** to save — Foundry updates the binding and refreshes the list
- Click **✗** to cancel — the row returns to its original state
- Locked (uneditable) bindings show a 🔒 instead of an edit button

### Combo Search

A **"Press a key combo…"** input appears in the sidebar, above the category list.

- Click the field and press any key or combo (`Alt+Left`, `Shift+C`, `Q`, `Ctrl+V`, …)
- The field fills automatically — you never type text manually
- Every action using that exact combo is listed, with its module name in amber
- **→ Go** navigates to that action's category in the list
- Press `Esc` or click **×** to clear
- While the filter is active, matching rows are highlighted and non-matching ones are dimmed

### Real-Time Edit Warning

When you click the native ✎ (edit) button on any binding in the Controls Configuration:

- Press the candidate new key — the module instantly checks for conflicts
- **Red**: lists every action and module that already uses that key
- **Green**: confirms the key is free

### Conflict Count Badge

The bottom of the sidebar always shows the total number of detected conflicts. Clicking it opens the **Conflict Overview** — a standalone window listing every conflict pair sorted by key combo.

### Context Note

A dismissable banner at the top of the main panel reminds you that some conflicts are harmless — many keybindings only fire in specific contexts (canvas only, text editor only, combat only), so two actions sharing a key may never actually collide in practice.

### Color Themes

The module ships with two visual themes, switchable per-client from module settings with no reload required:

| Theme | Description |
|---|---|
| **Amber & Dark** *(default)* | Warm amber accents on a dark background |
| **Midnight Navy & Warm Sand** | Deep navy backgrounds with sand/gold accents |

---

## What Counts as a Conflict?

Two or more Foundry keybindings registered via `game.keybindings.register()` using the **exact same key + modifier combination**. Both editable and locked bindings are checked.

> Foundry's own *"Potentially conflicts with Copy"* tooltip refers to browser-native shortcuts (`Ctrl+C`, etc.). That is a separate system — this module only detects Foundry-to-Foundry binding collisions.

---

## Installation

**Method 1 — Manifest URL**

Paste the following URL into Foundry's *Install Module* dialog:

```
https://raw.githubusercontent.com/jacksands/controls-config-conflict-resolver/main/module.json
```

**Method 2 — Manual**

1. Download the latest release zip from the [Releases](../../releases) page
2. Extract it into your `Data/modules/` folder
3. The resulting path should be `Data/modules/controls-config-conflict-resolver/module.json`

---

## Compatibility

| Property | Value |
|---|---|
| Foundry VTT | V14 (tested on 14.360) |
| Minimum | 14 |
| Game systems | All (system-agnostic) |
| Dependencies | None |

---

## Usage

1. Enable the module in your world
2. Open **Game Settings → Controls Configuration** (or press the keyboard shortcut if bound)
3. Look for the **pulsing orange icon** next to any ⚠ badge — click it to expand the conflict panel
4. Use the combo search input in the sidebar to find all actions sharing a specific key
5. Click **✎** in the expansion panel to edit the conflicting binding without navigating away
6. Access **Game Settings → Module Settings → Controls Configuration Conflict Resolver** for theme and overview options

The **Conflict Overview** and **Instructions** are accessible to all players — no GM required.

---

## Screenshots

*(Coming soon)*

---

## Development Notes

- Written in vanilla ES Modules (`.mjs`) — no build step required
- All CSS scoped to `.cccr-*` / `#cccr-*` — zero style leakage into the Foundry UI
- Conflict triggers are injected via `MutationObserver` starting from Foundry's own `⚠` icons, making the injection resilient to changes in the ControlsConfig DOM structure
- Inline edit calls `game.keybindings.set()` directly, replacing only the conflicting binding while preserving all others for that action

---

## License

[MIT](LICENSE)

---

*Made for Foundry VTT V14 — by Jack Sands*