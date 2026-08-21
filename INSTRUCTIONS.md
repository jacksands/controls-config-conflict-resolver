# Controls Configuration Conflict Resolver

Enhances Foundry's native **Controls Configuration** window with exact conflict identification, combo-key search, one-click navigation to conflicting bindings, and GM-defined global keybinding policies.

---

## The Problem

Foundry's Controls Configuration shows `⚠` warnings like "Potentially conflicts with Copy" — but:
- "Copy" in the tooltip might refer to the **browser's** Ctrl+C, while the real conflict is with a completely different module's "Copy" action using Shift+C
- There's no way to see exactly which action from which module is the real conflict
- Finding and editing both conflicting bindings requires manually hunting through different categories
- There is no built-in way for a GM to enforce consistent keybindings across all players

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

### 6. Global Keybindings *(GM only to configure)*

A small **world + lock icon** appears at the start of every action row. GMs use this to define world-wide keybinding policies. Non-GM players see the icon as a visual indicator only.

**Settings are stored server-side** (scope: world for policies, scope: user for per-player overrides). They are not tied to any browser — switching browsers or computers does not lose settings. They also survive module disable/re-enable cycles.

#### How to set a global keybinding (GM)

1. In Controls Configuration, change an action's binding to the value you want all users to have.
2. Click the **world + lock icon** at the start of that action row.
3. A dialog opens:
   - **Binding to apply**: shows the current binding that will be stored and distributed.
   - **Enforcement mode**: choose one of:
     - **Locked** — the binding is forced on all users. They cannot edit or delete it. If they try, a warning message is shown: *"This keybinding has been locked by the GM and cannot be changed."*
     - **Default** — the binding is applied to users who have not customized it. Users who later edit the binding see: *"This keybinding was set as default by the GM. Your changes will be saved for your account only."* They can override it, and their preference is remembered for future sessions.
4. Click **Apply Globally**. The policy takes effect immediately for all connected users via the world setting sync. Users who are not currently connected receive it on their next login.

#### Managing an existing global policy (GM)

Click the active (colored, pulsing) icon on a row that already has a global policy. A management dialog appears:

- View the currently stored binding and mode.
- **Change mode**: switch between Locked and Default.
- **Update stored binding**: if you changed the binding in your current session, a checkbox lets you push that new value to all users.
- **Remove Global Policy**: clears the policy. Users keep whatever binding they currently have; no enforcement is applied going forward.

#### Icon states

| Icon appearance | Meaning |
|---|---|
| Muted gray, no glow | No global policy for this action |
| Amber, pulsing (Locked) | Binding is locked — users cannot change it |
| Blue, pulsing (Default) | Binding is set as default — users can override |
| Dashed border, amber-brown *(non-GM only)* | You have overridden a GM default — click to reset |

#### Resetting to GM default (non-GM players)

If a GM has set a binding as **Default** and you later change it, the icon changes to a dashed amber-brown state. Click it and choose **Reset to Default** to re-apply the GM's suggested binding and clear your override flag.

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

All players can use conflict detection, combo search, and inline editing. No GM required.

Open the Conflict Overview any time via **Settings → Module Settings → Controls Configuration Conflict Resolver → Open Conflict Overview**.

The **Global Keybindings** feature (world + lock icons) is visible to all users but configurable only by GMs.
