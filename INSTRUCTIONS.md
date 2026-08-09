# Controls Configuration Conflict Resolver

Enhances Foundry's native **Controls Configuration** window with exact conflict identification, combo-key search, and one-click navigation to conflicting bindings.

---

## The Problem

Foundry's Controls Configuration shows `⚠` warnings like "Potentially conflicts with Copy" — but:
- "Copy" in the tooltip might refer to the **browser's** Ctrl+C, while the real conflict is with a completely different module's "Copy" action using Shift+C
- There's no way to see exactly which action from which module is the real conflict
- Finding and editing both conflicting bindings requires manually hunting through different categories

---

## Features

### 1. ⚠ Trigger Icon (Pulse Glow)

Next to each ⚠ in the keybinding list, a small pulsing orange icon appears. Click it to expand a panel directly below that action row showing **every other action** using the same key combo:

- **Action name** — the conflicting action
- **Module name** — shown in **amber/yellow** (the key identifier)
- **Key combo badge** — the shared key combination
- **→** (Go) — navigate to that action's module category
- **✎** (Edit) — navigate AND automatically open the edit field for that binding

Click the icon again to close the panel.

### 2. Combo Search

A **"Press a key combo…"** input appears in the sidebar above the category list.

- Click it, then press any key or combo (e.g. `Alt+Left`, `Shift+C`, `Q`)
- The field fills automatically — you never type text
- All actions using that combo are listed with module names in amber
- **→ Go** — navigate to that action's category
- **✎ Edit** — navigate AND open the edit field automatically
- Press `Esc` or click **×** to clear

While the filter is active, matching rows are highlighted and non-matching rows are dimmed.

### 3. Real-Time Edit Warning

When you click the **✎** (edit) icon on any binding:
- Press a new key — the module immediately shows whether it conflicts
- **Red warning**: lists the exact actions and modules that use that key
- **Green confirmation**: confirms the key is free to use
- This is advisory — saving is still controlled by Foundry

### 4. Context Note

A small note at the top of the main panel explains that **some conflicts are harmless**:
- Keybindings are context-specific — a key may only fire when the canvas is active, or only inside a text editor, or only during combat
- Two actions sharing the same key may never actually conflict in practice
- Dismiss with the **×** button (lasts the session)

### 5. Conflict Count Badge

The bottom of the sidebar shows the total number of detected conflicts. Click it to open the **Conflict Overview** window with a full list grouped by key combo.

---

## How to Resolve a Conflict

1. Open **Controls Configuration**
2. Find a **pulsing orange icon** next to a ⚠ badge
3. Click it — the panel expands showing all conflicting actions
4. Click **✎ Edit** on the one you want to change
5. The module navigates to that category and opens the edit field
6. Press the new key — the real-time warning confirms it's safe
7. Save with Foundry's check button

---

## What Counts as a Conflict?

Two or more Foundry keybindings registered via `game.keybindings.register()` using the **exact same key + modifier combination**. Both editable and locked bindings are checked.

> **Note:** Foundry's native "Potentially conflicts with Copy" refers to browser shortcuts (Ctrl+C). This module only detects Foundry-to-Foundry conflicts.

---

## Access

All players can use this module. No GM required.

Open the Conflict Overview any time via **Settings → Module Settings → Controls Configuration Conflict Resolver → Open Conflict Overview**.
