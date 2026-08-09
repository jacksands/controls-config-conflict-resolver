/**
 * viewer.mjs — Controls Configuration Conflict Resolver
 * Standalone ApplicationV2 showing the full conflict overview.
 * Opened by clicking the sidebar badge in ControlsConfig.
 */

import { getAllConflictPairs } from "./detector.mjs";

const { ApplicationV2 } = foundry.applications.api;

export class ConflictViewer extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id:      "cccr-conflict-viewer",
    classes: ["cccr-app"],
    window: {
      title:     "Keybinding Conflicts",
      icon:      "fa-solid fa-triangle-exclamation",
      resizable: true
    },
    position: { width: 700, height: 520 }
  };

  async _renderHTML(_ctx, _opts) {
    const pairs = getAllConflictPairs();

    if (!pairs.length) {
      return `<div id="cccr-viewer-root">
        <div class="cccr-viewer-empty">
          <i class="fa-solid fa-circle-check"></i>
          <span>No keybinding conflicts detected!</span>
        </div>
      </div>`;
    }

    const rows = pairs.map(p => `
      <div class="cccr-vrow">
        <div class="cccr-vcol-combo">
          <kbd class="cccr-badge">${p.comboDisplay}</kbd>
        </div>
        <div class="cccr-vcol-action">
          <div class="cccr-vname" title="${p.action1.label}">${p.action1.label}</div>
          <div class="cccr-vpkg"  title="${p.action1.packageTitle}">${p.action1.packageTitle}</div>
        </div>
        <div class="cccr-vcol-vs">vs</div>
        <div class="cccr-vcol-action">
          <div class="cccr-vname" title="${p.action2.label}">${p.action2.label}</div>
          <div class="cccr-vpkg"  title="${p.action2.packageTitle}">${p.action2.packageTitle}</div>
        </div>
      </div>`).join("");

    return `
      <div id="cccr-viewer-root">
        <div class="cccr-vtoolbar">
          <span class="cccr-vcount">
            <i class="fa-solid fa-triangle-exclamation"></i>
            ${pairs.length} conflict${pairs.length !== 1 ? "s" : ""} detected
          </span>
          <button type="button" id="cccr-vopen-controls">
            <i class="fa-solid fa-keyboard"></i> Open Controls Config
          </button>
        </div>
        <div class="cccr-vlist-wrap">
          <div class="cccr-vlist-header">
            <div class="cccr-vcol-combo">Key Combo</div>
            <div class="cccr-vcol-action">Action A</div>
            <div class="cccr-vcol-vs"></div>
            <div class="cccr-vcol-action">Action B</div>
          </div>
          <div class="cccr-vlist" id="cccr-vlist">${rows}</div>
        </div>
      </div>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  async _onRender(_ctx, _opts) {
    const el = this.element;

    // Scroll fix — LEARNINGS #002
    const wc = el.querySelector(".window-content");
    if (wc) {
      wc.style.setProperty("padding",  "0",      "important");
      wc.style.setProperty("overflow", "hidden", "important");
    }

    const recalc = () => {
      const wcEl      = el.querySelector(".window-content");
      const barEl     = el.querySelector(".cccr-vtoolbar");
      const headEl    = el.querySelector(".cccr-vlist-header");
      const listEl    = el.querySelector("#cccr-vlist");
      if (!wcEl || !listEl) return;
      const h = Math.max(wcEl.clientHeight - (barEl?.offsetHeight ?? 0) - (headEl?.offsetHeight ?? 0), 60);
      listEl.style.setProperty("height",     h + "px", "important");
      listEl.style.setProperty("max-height", h + "px", "important");
      listEl.style.setProperty("overflow-y", "auto",   "important");
    };
    requestAnimationFrame(recalc);
    new ResizeObserver(recalc).observe(el);

    // Open Controls Config button
    el.querySelector("#cccr-vopen-controls")?.addEventListener("click", () => {
      for (const app of ApplicationV2.instances()) {
        if (app.constructor.name === "ControlsConfig") {
          app.render({ force: true });
          return;
        }
      }
      // None open — try to open fresh (may need the class reference)
      ui.notifications?.info("Open Controls Configuration from the Settings menu.");
    });
  }
}
