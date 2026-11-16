// Development preview (D27): renders Cockpit.js with a minimal HTML imitation of Scriptable's
// widget API, fed with the invented mock state, and screenshots all sizes in light and dark.
// Approximation only (fonts and SF Symbols differ); the device remains the reference.
// Usage: node widgets/preview.mjs  ->  private/previews/widget-<size>-<theme>.png
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Script } from "node:vm";

const require = createRequire(new URL("../web/package.json", import.meta.url));
const { chromium } = require("@playwright/test");
const L = require("../backend/test/load.js");
const out = new URL("../private/previews/", import.meta.url);
mkdirSync(out, { recursive: true });

const mock = JSON.parse(readFileSync(new URL("../docs/mock-state.json", import.meta.url), "utf8"));
const now = new Date("2026-11-16T07:12:00+01:00");
const full = L.buildState({
  now, health: mock.health, events: mock.events, exams: mock.exams, todos: mock.todos,
  mails: mock.mails.map(mail => ({ mail, dismissed: false })), briefing: mock.briefing,
  settings: mock.settings, subjects: mock.subjects,
});
const widgetState = JSON.parse(JSON.stringify(L.buildWidget(full, now)));

const esc = s => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const GLYPH = { checklist: "☰", calendar: "▦", "envelope.fill": "✉", circle: "○" };

function host(theme) {
  // "tinted" imitates the tinted Home Screen: every view becomes a white silhouette of its alpha.
  const pick = c => {
    const v = c && c.light ? (theme === "light" ? c.light : c.dark) : c;
    if (!v) return undefined;
    return theme === "tinted" ? `rgba(255,255,255,${v.alpha})` : v.css;
  };
  class Node {
    constructor(tag) { this.tag = tag; this.children = []; this.vertical = false; this.align = null; }
    addStack() { const s = new Node("stack"); this.children.push(s); return s; }
    addText(text) { const t = { tag: "text", text, font: { size: 12, weight: 400 } }; this.children.push(t); return t; }
    addImage(image) { const i = { tag: "image", glyph: image.glyph }; this.children.push(i); return i; }
    addSpacer(n) { this.children.push({ tag: "spacer", n }); }
    layoutVertically() { this.vertical = true; }
    centerAlignContent() { this.align = "center"; }
    topAlignContent() { this.align = "flex-start"; }
    setPadding(t, l, b, r) { this.padding = [t, r, b, l]; }
  }
  function html(node, vertical) {
    if (node.tag === "spacer") {
      return node.n === undefined ? `<div style="flex:1"></div>`
        : `<div style="flex:none;${vertical ? "height" : "width"}:${node.n}px"></div>`;
    }
    if (node.tag === "text") {
      const color = pick(node.textColor) ?? (theme === "light" ? "#000" : "#fff");
      return `<span style="font-size:${node.font.size}px;font-weight:${node.font.weight};color:${color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;max-width:100%;line-height:1.2">${esc(node.text)}</span>`;
    }
    if (node.tag === "image") {
      const color = pick(node.tintColor) ?? "#888";
      const s = node.imageSize ?? { width: 14, height: 14 };
      return `<span style="flex:none;width:${s.width}px;height:${s.height}px;font-size:${s.height}px;line-height:${s.height}px;text-align:center;color:${color}">${GLYPH[node.glyph] ?? "•"}</span>`;
    }
    const st = [`display:flex`, `flex-direction:${node.vertical ? "column" : "row"}`, `box-sizing:border-box`, `min-width:0`];
    st.push(`align-items:${node.align ?? (node.vertical ? "flex-start" : "center")}`);
    if (node.size?.width) st.push(`width:${node.size.width}px;flex:none`);
    else if (!vertical) st.push("flex:0 1 auto");
    else st.push("align-self:stretch");
    if (node.size?.height) st.push(`height:${node.size.height}px`);
    if (node.tag === "widget" && theme === "tinted") st.push("background:rgba(30,40,60,.55)");
    else if (node.backgroundColor) st.push(`background:${pick(node.backgroundColor)}`);
    if (node.cornerRadius) st.push(`border-radius:${node.cornerRadius}px`);
    if (node.padding) st.push(`padding:${node.padding.map(p => p + "px").join(" ")}`);
    return `<div style="${st.join(";")}">${node.children.map(c => html(c, node.vertical)).join("")}</div>`;
  }
  const weight = w => size => ({ size, weight: w });
  return {
    context: {
      ListWidget: class extends Node { constructor() { super("widget"); this.vertical = true; } },
      Size: class { constructor(width, height) { this.width = width; this.height = height; } },
      Color: class {
        constructor(hex, alpha = 1) {
          const n = parseInt(hex.slice(1), 16);
          this.alpha = alpha;
          this.css = `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
        }
        static dynamic(light, dark) { return { light, dark }; }
        static white() { return new this("#ffffff"); }
      },
      Font: { systemFont: weight(400), regularSystemFont: weight(400), semiboldSystemFont: weight(600), boldSystemFont: weight(700) },
      SFSymbol: { named: glyph => ({ applyFont() {}, image: { glyph } }) },
    },
    html,
  };
}

const SIZES = { small: [158, 158], medium: [338, 158], large: [338, 354], accessoryRectangular: [158, 72] };
const source = readFileSync(new URL("./Cockpit.js", import.meta.url), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
const variants = [["", "Standard"], ["termine", "termine"]];
for (const theme of ["light", "dark", "tinted"]) {
  const h = host(theme);
  const api = await new Script(`(async () => { ${source}\n return { widgetModel, renderWidget }; })()`).runInNewContext(h.context);
  let body = "";
  for (const [family, [w, hgt]] of Object.entries(SIZES)) {
    for (const [param, label] of family === "large" ? variants : [["", "Standard"]]) {
      const widget = api.renderWidget(api.widgetModel(widgetState, family, param, now, null), null, now);
      const lock = family === "accessoryRectangular";
      body += `<figure><figcaption>${family} · ${label}</figcaption><div style="width:${w}px;height:${hgt}px;border-radius:${lock ? 12 : 22}px;overflow:hidden;background:${lock ? "#555" : h.context.Color ? "" : ""};${lock ? "color:#fff" : ""}">${h.html(widget, true).replace("<div style=\"", `<div style="height:100%;`)}</div></figure>`;
    }
  }
  const bg = theme === "dark" ? "#000" : theme === "tinted" ? "linear-gradient(135deg,#1d3b2a,#2d2d4a)" : "linear-gradient(135deg,#a9c4ef,#b7b0e8)";
  writeFileSync(new URL(`widget-${theme}.html`, out), `<!doctype html><meta charset="utf-8"><body style="margin:0;padding:20px;background:${bg};font-family:-apple-system,system-ui,'Segoe UI',sans-serif;display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start">${body}<style>figure{margin:0}figcaption{font:12px system-ui;color:${theme === "light" ? "#222" : "#ccc"};margin-bottom:6px}</style>`);
  await page.goto(new URL(`widget-${theme}.html`, out).href);
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.screenshot({ path: new URL(`widget-${theme}.png`, out).pathname.slice(1), fullPage: true });
}
await browser.close();
console.log("written to private/previews/widget-{light,dark,tinted}.png");
