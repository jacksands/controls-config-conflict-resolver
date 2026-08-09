/**
 * instructions.mjs — Controls Configuration Conflict Resolver
 * ApplicationV2 that fetches and renders INSTRUCTIONS.md as formatted HTML.
 */

const { ApplicationV2 } = foundry.applications.api;
const MODULE_PATH = "modules/controls-config-conflict-resolver";

export class InstructionsViewer extends ApplicationV2 {

  static DEFAULT_OPTIONS = {
    id:      "cccr-instructions",
    classes: ["cccr-app"],
    window: {
      title:     "Controls Configuration Conflict Resolver — Instructions",
      icon:      "fa-solid fa-book-open",
      resizable: true
    },
    position: { width: 660, height: 640 }
  };

  // -------------------------------------------------------------------------

  async _renderHTML(_ctx, _opts) {
    let text = "";
    try {
      const res = await fetch(`${MODULE_PATH}/INSTRUCTIONS.md`);
      if (!res.ok) throw new Error(res.statusText);
      text = await res.text();
    } catch (e) {
      text = "**Error:** Could not load instructions file.";
    }
    return `<div id="cccr-instr-root">
      <div class="cccr-instr-body" id="cccr-instr-body">
        ${_mdToHtml(text)}
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
      const h    = wc?.clientHeight ?? 580;
      const body = el.querySelector("#cccr-instr-body");
      if (body) {
        body.style.setProperty("height",     h + "px", "important");
        body.style.setProperty("max-height", h + "px", "important");
        body.style.setProperty("overflow-y", "auto",   "important");
      }
    };
    requestAnimationFrame(recalc);
    new ResizeObserver(recalc).observe(el);
  }
}

// ---------------------------------------------------------------------------
// Minimal markdown → HTML converter (covers all constructs in INSTRUCTIONS.md)
// ---------------------------------------------------------------------------

function _mdToHtml(md) {
  // 1. Escape HTML chars first so we don't break injected tags
  let s = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 2. Fenced code blocks
  s = s.replace(/```[\w]*\n?([\s\S]*?)```/g,
    (_, code) => `<pre><code>${code.trim()}</code></pre>`);

  // 3. Horizontal rules
  s = s.replace(/^---$/gm, "<hr>");

  // 4. Blockquotes (lines starting with >)
  s = s.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");

  // 5. Headers
  s = s.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  s = s.replace(/^## (.+)$/gm,  "<h2>$1</h2>");
  s = s.replace(/^# (.+)$/gm,   "<h1>$1</h1>");

  // 6. Inline emphasis (order matters: ***bold+italic*** before ** and *)
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  s = s.replace(/\*\*(.+?)\*\*/g,     "<strong>$1</strong>");
  s = s.replace(/\*(.+?)\*/g,         "<em>$1</em>");

  // 7. Inline code
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // 8. Unordered list items (must come before paragraph wrapping)
  s = s.replace(/^- (.+)$/gm, "<li>$1</li>");

  // 9. Wrap consecutive <li> runs in <ul>
  s = s.replace(/(<li>[^\n]*\n?)+/g, match =>
    `<ul>${match.trimEnd()}</ul>\n`);

  // 10. Split by blank lines and wrap loose text in <p>
  const blocks = s.split(/\n{2,}/);
  return blocks.map(block => {
    block = block.trim();
    if (!block) return "";
    if (/^<(h[1-6]|ul|pre|hr|blockquote)/.test(block)) return block;
    return `<p>${block.replace(/\n/g, " ")}</p>`;
  }).filter(Boolean).join("\n");
}
