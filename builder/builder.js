/* LCARS Builder: place LCARS pieces on a snapping grid and export a page. */
(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   * Palette and piece types
   * ------------------------------------------------------------------ */

  /*
   * Every LCARS color comes from ../palette-data.js. All of them can be used by
   * name; the color pickers show the ones enabled in Preferences (your picks
   * unless you change them). Aliases such as "honey" resolve to the first name.
   */
  const { PICKS, GROUPS } = window.LCARS_PALETTES;
  const ALL_COLORS = window.LCARS_PALETTES.allColors();
  const HEX = new Map();
  for (const c of ALL_COLORS) for (const n of c.names) HEX.set(n, c.hex);
  const NAMES = new Set(HEX.keys());

  const PREFS_KEY = "trektext-builder:colors";
  let enabled = loadEnabled();
  function loadEnabled() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY));
      if (Array.isArray(saved)) return new Set(saved.filter((n) => NAMES.has(n)));
    } catch { /* storage unavailable */ }
    return new Set(PICKS);
  }
  function saveEnabled() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify([...enabled])); } catch { /* storage unavailable */ }
  }
  const isOn = (c) => c.names.some((n) => enabled.has(n));
  /** [name, hex] for each enabled color, grouped by family. */
  const palette = () => ALL_COLORS.filter(isOn).map((c) => [c.name, c.hex]);

  /** The 2002 applet's letter codes, converted when a page from an older version is opened. */
  const LEGACY = {
    r: "chestnut-rose", o: "sandy-brown", O: "atomic-tangerine", y: "tanoi",
    b: "melrose", B: "blue-bell", p: "lilac", P: "hopbush",
  };
  /** Before version 2, the builder's alert reds and yellows had these short names. */
  const RENAMED = { "red-alert": "red-alert-2", "yellow-alert": "yellow-alert-2" };
  const DOC_VERSION = 3;

  const LABELLED = { label: "", tcolor: "", fs: 17, halign: "center", valign: "middle", fit: false };
  const TYPES = {
    block: { w: 20, h: 4, color: "blue-bell", ends: "none", ...LABELLED, halign: "right", valign: "bottom" },
    button: { w: 11, h: 4, color: "atomic-tangerine", ends: "both", ...LABELLED, label: "000-000", href: "", hover: "", active: "", beep: true },
    elbow: { w: 38, h: 16, color: "chestnut-rose", corner: "tl", side: 25, bar: 4, rx: 11, ry: 8, ri: 4, ...LABELLED, halign: "right", valign: "bottom" },
    text: { w: 12, h: 4, ...LABELLED, tcolor: "atomic-tangerine", label: "Title", fs: 22, halign: "left", fit: true, wrap: false },
    padd: { w: 60, h: 30, fs: 24, hold: 16, tcolor: "", text: "##{melrose}INCOMING TRANSMISSION\n\n##{tanoi}TYPE YOUR TEXT IN THE PROPERTIES PANEL." },
    image: { w: 40, h: 20, src: "", alt: "", imgMode: "fit", zoom: 1, px: 50, py: 50, ratio: 0, border: "", caption: "", tcolor: "melrose", fs: 15 },
    frame: {
      w: 70, h: 44, variant: "bracket-left", title: "U.S.S. Enterprise", caption: "NCC-1701-D", color: "sandy-brown",
      color2: "tanoi", color3: "chestnut-rose", tcolor: "", fs: 24, bar: 3,
      src: "", alt: "", imgMode: "crop", zoom: 1, px: 50, py: 50, ratio: 0,
    },
    quote: {
      w: 60, h: 8, color: "lilac", tcolor: "melrose", fs: 16,
      text: "\"THE FIRST DUTY OF EVERY STARFLEET OFFICER IS TO THE TRUTH.\"\n##{tanoi}- CAPTAIN JEAN-LUC PICARD",
    },
    textbar: { w: 60, h: 4, label: "Hello World", titlePos: "start", color: "sandy-brown", color2: "chestnut-rose", tcolor: "golden-tanoi", fs: 24 },
    list: { w: 40, h: 8, color: "lilac", tcolor: "melrose", fs: 16, text: "First item in a list\nSecond list item\n##{tanoi}Third item" },
    cascade: { w: 50, h: 14, columns: 12, color: "sandy-brown", color2: "frozen-pond", fs: 11, animate: true, seed: 47 },
  };
  const HAS_LABEL = new Set(["block", "button", "elbow", "text"]);

  const STORAGE_KEY = "trektext-builder:v1";
  const LIB_FILES = { "lcars/palette.css": "../lcars/palette.css", "lcars/pieces.css": "../lcars/pieces.css", "lcars/trek-padd.js": "../trek-padd.js" };

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const colorValue = (c) => (!c ? "" : c.startsWith("#") ? c : `var(--lcars-${c})`);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const num = (n) => Math.round(n * 1000) / 1000;

  /* ------------------------------------------------------------------ *
   * Label markup
   *
   *   ##{name}  an LCARS color     ##{#RRGGBB}  any color     ##{}  default
   *   *         a small dot (\* for a real asterisk); newlines are kept
   * ------------------------------------------------------------------ */

  const LITERAL_STAR = "";
  const DOT = '<i class="lcars-dot"></i>';

  function parseLabel(markup) {
    const s = String(markup ?? "");
    const runs = [];
    let color = "";
    let buf = "";
    const flush = () => {
      if (buf) runs.push({ text: buf, color });
      buf = "";
    };
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "\\" && s[i + 1] === "*") { buf += LITERAL_STAR; i++; continue; }
      if (s.startsWith("##{", i) && s.indexOf("}", i) > 0) {
        const end = s.indexOf("}", i);
        const name = s.slice(i + 3, end).trim().toLowerCase();
        flush();
        color = NAMES.has(name) || /^#[0-9a-f]{6}$/.test(name) ? name : "";
        i = end;
        continue;
      }
      buf += s[i];
    }
    flush();
    return runs;
  }

  /** Runs to HTML. In edit mode dots stay as "*" so the text can be typed naturally. */
  function runsHTML(runs, { edit = false } = {}) {
    return runs.map(({ text, color }) => {
      let html = esc(text);
      html = edit
        ? html.replace(new RegExp(LITERAL_STAR, "g"), "\\*")
        : html.replace(/ ?\* ?/g, DOT).replace(new RegExp(LITERAL_STAR, "g"), "*");
      if (!color) return html;
      const attrs = color.startsWith("#") ? `style="color:${color}"` : `class="t-${color}"`;
      return `<span ${attrs}${edit ? ` data-c="${color}"` : ""}>${html}</span>`;
    }).join("");
  }

  const labelHTML = (markup) => runsHTML(parseLabel(markup));
  const stripCodes = (markup) => String(markup ?? "").replace(/##\{[^}]*\}/g, "");

  /** Read an edited label back into markup. */
  function serialize(root) {
    let out = "";
    let current = "";
    const walk = (node, color) => {
      for (const n of node.childNodes) {
        if (n.nodeType === Node.TEXT_NODE) {
          const t = n.data.replace(/​/g, "");
          if (!t) continue;
          if (color !== current) { out += `##{${color}}`; current = color; }
          out += t;
        } else if (n.nodeName === "BR") {
          out += "\n";
        } else if (n.nodeType === Node.ELEMENT_NODE) {
          if (/^(DIV|P)$/.test(n.nodeName) && out && !out.endsWith("\n")) out += "\n";
          walk(n, n.hasAttribute("data-c") ? n.getAttribute("data-c") : color);
        }
      }
    };
    walk(root, "");
    return out.replace(/\n+$/, "");
  }

  /* ------------------------------------------------------------------ *
   * Rendering (shared by the canvas, preview and export)
   * ------------------------------------------------------------------ */

  /** The unrotated size of a piece's body, in cells. */
  const dims = (p) => ((p.rot || 0) % 180 ? { iw: p.h, ih: p.w } : { iw: p.w, ih: p.h });

  function pieceClasses(p) {
    const cls = ["piece", `p-${p.type}`];
    if (p.ends && p.ends !== "none") cls.push(`ends-${p.ends}`);
    if (p.type === "elbow") cls.push(`corner-${p.corner}`);
    if (p.rot) cls.push(`rot-${p.rot}`);
    if (p.halign && p.halign !== "center") cls.push(`h-${p.halign}`);
    if (p.valign && p.valign !== "middle") cls.push(`v-${p.valign}`);
    if (p.type === "image" && !p.src) cls.push("empty");
    if (p.type === "image" && p.border) cls.push("bordered");
    if (p.type === "image" || p.type === "frame") cls.push(`img-${p.imgMode || "fit"}`);
    if (p.type === "frame") cls.push(`f-${p.variant}`);
    if (p.type === "cascade" && p.animate) cls.push("animate");
    if (p.type === "text" && p.wrap) cls.push("wrap");
    if (p.blink && p.blink !== "none") cls.push(`blink-${p.blink}`);
    return cls.join(" ");
  }

  function pieceVars(p) {
    const { iw, ih } = dims(p);
    const v = { "--x": p.x, "--y": p.y, "--w": p.w, "--h": p.h };
    if (p.rot) Object.assign(v, { "--iw": iw, "--ih": ih, "--rot": p.rot });
    if (p.color) v["--c"] = colorValue(p.color);
    if (p.hover) v["--c-hover"] = colorValue(p.hover);
    if (p.active) v["--c-active"] = colorValue(p.active);
    if (p.fs) v["--fs"] = p.fs;
    if (p.type === "elbow") Object.assign(v, { "--S": p.side, "--B": p.bar });
    if ((p.type === "image" || p.type === "frame") && p.imgMode === "crop") {
      Object.assign(v, { "--zoom": p.zoom ?? 1, "--px": p.px ?? 50, "--py": p.py ?? 50 });
    }
    if (p.color3) v["--c3"] = colorValue(p.color3);
    if (p.tcolor) v["--tc"] = colorValue(p.tcolor);
    if (p.color2) v["--c2"] = colorValue(p.color2);
    if (p.border) v["--bc"] = colorValue(p.border);
    if (p.type === "frame") v["--fb"] = p.bar;
    return v;
  }

  function elbowSVG(p, cell) {
    const { iw, ih } = dims(p);
    const W = iw * cell, H = ih * cell;
    const S = clamp(p.side, 1, iw - 1) * cell;
    const B = clamp(p.bar, 1, ih - 1) * cell;
    const rx = clamp(p.rx * cell, 0, S);
    const ry = clamp(p.ry * cell, 0, H - B);
    const ri = clamp(p.ri * cell, 0, Math.min(W - S, H - B));
    const d = `M${num(rx)},0 H${W} V${B} H${num(S + ri)} A${num(ri)},${num(ri)} 0 0 0 ${S},${num(B + ri)} ` +
      `V${H} H0 V${num(ry)} A${num(rx)},${num(ry)} 0 0 1 ${num(rx)},0 Z`;
    const flip = { tl: "", tr: `matrix(-1 0 0 1 ${W} 0)`, bl: `matrix(1 0 0 -1 0 ${H})`, br: `matrix(-1 0 0 -1 ${W} ${H})` }[p.corner];
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"${flip ? ` transform="${flip}"` : ""}/></svg>`;
  }

  /** Where the two elbow handles sit, in body cells. */
  function elbowHandlePoints(p) {
    const { iw, ih } = dims(p);
    const S = clamp(p.side, 1, iw - 1), B = clamp(p.bar, 1, ih - 1);
    const left = p.corner[1] === "l", top = p.corner[0] === "t";
    return {
      side: { x: left ? S : iw - S, y: top ? (B + ih) / 2 : (ih - B) / 2 },
      bar: { x: left ? (S + iw) / 2 : (iw - S) / 2, y: top ? B : ih - B },
    };
  }

  /** An image frame in one of four layouts. Its inside holds the picture. */
  function frameHTML(p, ctx) {
    const src = (ctx.imageURL && ctx.imageURL(p)) || p.src;
    const alt = p.alt || stripCodes(p.title);
    const img = `<span class="f-outline"></span><div class="f-img${src ? "" : " empty"}">` +
      `${src ? `<img src="${esc(src)}" alt="${esc(alt)}">` : ""}</div>`;
    const text = (t) => (t ? `<span class="f-text">${labelHTML(t)}</span>` : "");
    const seg = (cls) => `<span class="f-seg${cls ? ` ${cls}` : ""}"></span>`;
    const detail = seg("c3") + seg("c2") + seg("sliver") + seg("sliver"); // accents along the bottom
    switch (p.variant) {
      case "bracket-right":
        return `<span class="f-bracket r"></span><span class="f-notch r"></span>` +
          `<div class="f-row top"><span class="f-cap l"></span>${text(p.title)}${seg()}</div>` +
          `<div class="f-row bottom"><span class="f-cap l"></span>${text(p.caption)}${seg()}` +
          `${seg("sliver")}${seg("sliver")}${seg("c2")}${seg("c3")}</div>${img}`;
      case "twin":
        return `<span class="f-bracket l"></span><span class="f-bracket r"></span><span class="f-notch l"></span><span class="f-notch r"></span>` +
          `<div class="f-row top">${text(p.title)}${seg()}</div>` +
          `<div class="f-row bottom">${detail}${seg()}${text(p.caption)}</div>${img}`;
      case "viewscreen":
        return `<span class="f-corner tl"></span><span class="f-corner tr"></span><span class="f-corner bl"></span><span class="f-corner br"></span>` +
          `<div class="f-row top">${text(p.title)}${seg()}${seg("c2")}</div>` +
          `<div class="f-row bottom">${detail}${seg()}${text(p.caption)}</div>${img}`;
      default: // bracket-left
        return `<span class="f-bracket l"></span><span class="f-notch l"></span>` +
          `<div class="f-row top">${seg()}${text(p.title)}<span class="f-cap r"></span></div>` +
          `<div class="f-row bottom">${detail}${seg()}${text(p.caption)}<span class="f-cap r"></span></div>${img}`;
    }
  }

  /** How far the picture sits from each edge of an Image or Frame piece, in cells (matches pieces.css). */
  function imageInsets(p) {
    if (p.type === "image") return { l: 0, r: 0, t: 0, b: p.caption ? (p.fs || 15) / doc.cell + 0.5 : 0 };
    const near = (p.bar || 3) + 1.75, far = 1.75;
    switch (p.variant) {
      case "bracket-right": return { l: far, r: near, t: near, b: near };
      case "twin":
      case "viewscreen": return { l: near, r: near, t: near, b: near };
      default: return { l: near, r: far, t: near, b: near };
    }
  }

  /**
   * "Keep image shape": size the piece so its picture area matches the image's
   * proportions. anchor "w" keeps the width (and the bottom edge if fromTop),
   * "h" keeps the height. Returns true if anything changed.
   */
  function applyAspect(p, anchor = "w", fromTop = false) {
    if (p.imgMode !== "keep" || !p.ratio) return false;
    const i = imageInsets(p);
    const before = `${p.x},${p.y},${p.w},${p.h}`;
    if (anchor === "h") {
      p.w = Math.max(1, Math.round((p.h - i.t - i.b) * p.ratio + i.l + i.r));
    } else {
      const bottom = p.y + p.h;
      p.h = Math.max(1, Math.round((p.w - i.l - i.r) / p.ratio + i.t + i.b));
      if (fromTop) p.y = Math.max(0, bottom - p.h);
    }
    return `${p.x},${p.y},${p.w},${p.h}` !== before;
  }

  /** Small seeded random generator, so a cascade looks the same in the builder and on the page. */
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Columns of numbers. When animated each column holds two copies and scrolls (pure CSS). */
  function cascadeHTML(p, cell) {
    const { ih } = dims(p);
    const rows = Math.max(1, Math.ceil((ih * cell) / ((p.fs || 11) * 1.2)) + 1);
    const cols = [];
    for (let c = 0; c < Math.max(1, p.columns || 12); c++) {
      const r = seeded((p.seed || 1) * 1009 + c * 31);
      const width = 1 + Math.floor(r() * 7);
      const cells = [];
      for (let i = 0; i < rows; i++) {
        const len = Math.max(1, width - Math.floor(r() * 3));
        const n = String(Math.floor(r() * 10 ** len)).padStart(r() < 0.35 ? len : 1, "0");
        cells.push(r() < 0.08 ? `<span class="hl">${n}</span>` : `<span>${n}</span>`);
      }
      const list = cells.join("");
      cols.push(`<div class="cc">${list}${p.animate ? list : ""}</div>`);
    }
    return cols.join("");
  }

  /** Inner HTML for a piece: its rotating body and content. */
  function pieceInner(p, cell, ctx = {}) {
    const label = HAS_LABEL.has(p.type) && (p.label || ctx.editingId === p.id)
      ? `<span class="label"><span class="lt">${labelHTML(p.label)}</span></span>` : "";
    let body;
    switch (p.type) {
      case "elbow": {
        body = elbowSVG(p, cell) + label;
        if (ctx.handlesFor === p.id) {
          const pts = elbowHandlePoints(p);
          body += Object.entries(pts).map(([h, pt]) =>
            `<span class="hd ehd" data-h="${h}" title="${h === "side" ? "Sidebar width" : "Bar thickness"}" ` +
            `style="left:calc(${num(pt.x)} * var(--k));top:calc(${num(pt.y)} * var(--k))"></span>`).join("");
        }
        break;
      }
      case "padd": {
        const attrs = [`hold="${esc(p.hold)}"`, p.tcolor ? `color="${esc(p.tcolor)}"` : "", ctx.editing ? "muted" : ""].filter(Boolean).join(" ");
        const text = String(p.text ?? "").replace(/<\/script/gi, "<\\/script");
        body = `<trek-padd ${attrs}><script type="text/plain">\n${text}\n</script></trek-padd>`;
        break;
      }
      case "image": {
        const src = (ctx.imageURL && ctx.imageURL(p)) || p.src;
        body = `<div class="img-box">${src ? `<img src="${esc(src)}" alt="${esc(p.alt)}">` : ""}</div>` +
          (p.caption ? `<div class="caption">${labelHTML(p.caption)}</div>` : "");
        break;
      }
      case "frame":
        body = frameHTML(p, ctx);
        break;
      case "quote":
        body = `<span class="q-bar"></span><div class="q-text">${labelHTML(p.text)}</div>`;
        break;
      case "textbar": {
        const title = p.label ? `<span class="tb-text">${labelHTML(p.label)}</span>` : "";
        const bar = `<span class="tb-bar"></span>`;
        body = `<span class="tb-cap l"></span>${p.titlePos === "end" ? bar + title : title + bar}<span class="tb-cap r"></span>`;
        break;
      }
      case "list":
        body = String(p.text ?? "").split("\n").filter((l) => l.trim()).map((l) => `<div class="li">${labelHTML(l)}</div>`).join("");
        break;
      case "cascade":
        body = cascadeHTML(p, cell);
        break;
      default:
        body = label;
    }
    return `<div class="body">${body}</div>`;
  }

  /* ------------------------------------------------------------------ *
   * Document state, history and storage
   * ------------------------------------------------------------------ */

  let doc = null;
  let selectedId = null;
  let editing = null; // { id, el, original } while a label is edited on the board
  const undoStack = [];
  const redoStack = [];
  const attached = new Map(); // piece id -> { file, url } for images picked from disk

  const snapshot = () => JSON.stringify(doc);
  const blankDoc = () => ({ version: DOC_VERSION, title: "LCARS Page", cols: 166, rows: 108, cell: 6, nextId: 1, pieces: [] });

  function load(json) {
    const d = typeof json === "string" ? JSON.parse(json) : json;
    if (!d || !Array.isArray(d.pieces)) throw new Error("Not a builder file");
    doc = Object.assign(blankDoc(), structuredClone(d));
    const version = doc.version || 1;
    for (const p of doc.pieces) {
      if (version < 2) upgradePiece(p);
      if (version < 3 && p.type === "text" && p.color && !p.tcolor) p.tcolor = p.color;
      // Older saves: labels used "•"/"·" for dots and had no rotation.
      if (typeof p.label === "string") p.label = p.label.replace(/\s*[•·]\s*/g, " * ");
      p.rot ||= 0;
      if ((p.type === "image" || p.type === "frame") && !p.imgMode) p.imgMode = p.fit === "contain" ? "fit" : "crop";
      if (p.type === "frame") p.color3 ||= "chestnut-rose";
    }
    doc.version = DOC_VERSION;
    doc.nextId = Math.max(doc.nextId || 1, ...doc.pieces.map((p) => parseInt(String(p.id).slice(1), 10) + 1 || 1));
    selectedId = null;
    editing = null;
    renderAll();
    fitAll();
  }

  /** Bring a piece from a version-1 page up to date. */
  function upgradePiece(p) {
    const markup = (t) => String(t)
      .replace(/##([roOybBpP])/g, (_, c) => `##{${LEGACY[c]}}`)
      .replace(/##\{(red-alert|yellow-alert)\}/g, (_, n) => `##{${RENAMED[n]}}`);
    for (const key of ["label", "text", "title", "caption"]) if (typeof p[key] === "string") p[key] = markup(p[key]);
    for (const key of ["color", "color2", "color3", "tcolor", "hover", "active", "border"]) if (RENAMED[p[key]]) p[key] = RENAMED[p[key]];
  }

  function commit() {
    const snap = snapshot();
    if (undoStack[undoStack.length - 1] === snap) return;
    undoStack.push(snap);
    if (undoStack.length > 200) undoStack.shift();
    redoStack.length = 0;
    try { localStorage.setItem(STORAGE_KEY, snap); } catch { /* storage unavailable */ }
  }

  function undo() {
    if (undoStack.length < 2) return;
    redoStack.push(undoStack.pop());
    restore(undoStack[undoStack.length - 1]);
  }
  function redo() {
    if (!redoStack.length) return;
    const snap = redoStack.pop();
    undoStack.push(snap);
    restore(snap);
  }
  function restore(snap) {
    const keep = selectedId;
    doc = JSON.parse(snap);
    editing = null;
    selectedId = doc.pieces.some((p) => p.id === keep) ? keep : null;
    renderAll();
    try { localStorage.setItem(STORAGE_KEY, snap); } catch { /* storage unavailable */ }
  }

  const piece = (id) => doc.pieces.find((p) => p.id === id);
  const selected = () => piece(selectedId);

  function addPiece(type, at) {
    const p = { id: `p${doc.nextId++}`, type, x: 0, y: 0, rot: 0, ...structuredClone(TYPES[type]) };
    const x = at ? at.x : Math.round((doc.cols - p.w) / 2);
    const y = at ? at.y : Math.round((doc.rows - p.h) / 2);
    p.x = clamp(x, 0, Math.max(0, doc.cols - p.w));
    p.y = clamp(y, 0, Math.max(0, doc.rows - p.h));
    doc.pieces.push(p);
    selectedId = p.id;
    renderAll();
    fitToText(p);
    commit();
  }

  /* ------------------------------------------------------------------ *
   * Canvas
   * ------------------------------------------------------------------ */

  const $ = (sel) => document.querySelector(sel);
  const board = $("#board");
  const stage = $("#stage");
  const inspector = $("#inspector");
  const els = new Map(); // piece id -> element
  let selBox = null;

  const ctx = {
    editing: true,
    imageURL: (p) => attached.get(p.id)?.url,
    get handlesFor() { return selectedId; },
    get editingId() { return editing?.id; },
  };

  function applyVars(el, vars) {
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, String(v));
  }

  function renderPiece(p, { inner = true } = {}) {
    let el = els.get(p.id);
    if (!el) {
      el = document.createElement("div");
      el.dataset.id = p.id;
      els.set(p.id, el);
    }
    el.className = pieceClasses(p) + (p.id === selectedId ? " is-selected" : "");
    el.removeAttribute("style");
    applyVars(el, pieceVars(p));
    if (inner && editing?.id !== p.id) {
      el.innerHTML = pieceInner(p, doc.cell, ctx);
      if (p.type === "frame" || p.type === "image") watchImage(p, el);
    }
    return el;
  }

  /** Record the picture's proportions once it loads, and re-shape the piece if it keeps them. */
  function watchImage(p, el) {
    const img = el.querySelector("img");
    if (!img) return;
    const onLoad = () => {
      const ratio = img.naturalWidth / img.naturalHeight;
      if (!ratio || piece(p.id) !== p || Math.abs((p.ratio || 0) - ratio) < 1e-4) return;
      p.ratio = ratio;
      if (applyAspect(p)) {
        renderPiece(p, { inner: false });
        syncSelection();
        syncFields(p);
      }
      commit();
    };
    if (img.complete && img.naturalWidth) onLoad();
    else img.addEventListener("load", onLoad, { once: true });
  }

  /** Refresh the position and size boxes in the panel without rebuilding it. */
  function syncFields(p, keys = ["x", "y", "w", "h"]) {
    for (const key of keys) {
      const input = inspector.querySelector(`[data-key="${key}"]`);
      if (input && document.activeElement !== input) input.value = p[key];
    }
  }

  function renderAll() {
    applyVars(board, { "--cols": doc.cols, "--rows": doc.rows, "--cell": doc.cell });
    els.clear();
    board.replaceChildren(...doc.pieces.map((p) => renderPiece(p)));
    renderSelection();
    renderInspector();
  }

  function renderSelection() {
    selBox?.remove();
    selBox = null;
    const p = selected();
    if (!p) return;
    selBox = document.createElement("div");
    selBox.className = "sel";
    selBox.innerHTML = ["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((h) => `<span class="hd" data-h="${h}"></span>`).join("") +
      `<span class="dims"></span>`;
    board.append(selBox);
    syncSelection();
  }

  function syncSelection() {
    const p = selected();
    if (!p || !selBox) return;
    applyVars(selBox, { "--x": p.x, "--y": p.y, "--w": p.w, "--h": p.h });
    const extra = p.type === "elbow" ? `  side ${p.side} · bar ${p.bar}` : "";
    selBox.querySelector(".dims").textContent = `${p.x},${p.y}  ${p.w}×${p.h}${p.rot ? `  ${p.rot}°` : ""}${extra}`;
  }

  const cellPx = () => board.getBoundingClientRect().width / doc.cols;

  function cellAt(clientX, clientY) {
    const r = board.getBoundingClientRect();
    const k = r.width / doc.cols;
    return { x: Math.floor((clientX - r.left) / k), y: Math.floor((clientY - r.top) / k) };
  }

  function select(id) {
    if (editing && editing.id !== id) finishEdit(true);
    const prev = selected();
    selectedId = id;
    if (prev) els.get(prev.id)?.classList.remove("is-selected");
    if (id) els.get(id)?.classList.add("is-selected");
    if (prev?.type === "elbow") renderPiece(prev); // drop its handles
    const p = selected();
    if (p?.type === "elbow") renderPiece(p);
    renderSelection();
    renderInspector();
  }

  /** Map a screen drag into the piece body's own (unrotated) axes. */
  function toBody(dx, dy, rot) {
    switch (rot || 0) {
      case 90: return [dy, -dx];
      case 180: return [-dx, -dy];
      case 270: return [-dy, dx];
      default: return [dx, dy];
    }
  }

  // Move, resize, or drag an elbow's inner edges, snapping to whole cells.
  board.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (editing && editing.el.contains(e.target)) return; // selecting text in a label
    if (startPan(e)) return;
    const handle = e.target.closest(".hd");
    const pieceEl = e.target.closest(".piece");
    if (!handle) {
      if (!pieceEl) { select(null); return; }
      if (pieceEl.dataset.id !== selectedId) select(pieceEl.dataset.id);
      else if (editing) finishEdit(true);
    }
    const p = selected();
    if (!p) return;
    e.preventDefault();
    const mode = handle ? handle.dataset.h : "move";
    const start = { x: e.clientX, y: e.clientY, p: { ...p } };
    const k = cellPx();
    board.setPointerCapture(e.pointerId);
    let changed = false;

    const onMove = (ev) => {
      const dx = (ev.clientX - start.x) / k;
      const dy = (ev.clientY - start.y) / k;
      const o = start.p;
      const next = { x: o.x, y: o.y, w: o.w, h: o.h, side: o.side, bar: o.bar };
      if (mode === "side" || mode === "bar") {
        const [bx, by] = toBody(dx, dy, o.rot);
        const { iw, ih } = dims(o);
        if (mode === "side") next.side = clamp(o.side + Math.round(bx) * (o.corner[1] === "l" ? 1 : -1), 1, iw - 1);
        else next.bar = clamp(o.bar + Math.round(by) * (o.corner[0] === "t" ? 1 : -1), 1, ih - 1);
      } else {
        const rx = Math.round(dx), ry = Math.round(dy);
        // Resize handles are named by compass points (n, ne, e, ...). Check those
        // only for a handle: the word "move" itself contains an "e".
        const dir = mode === "move" ? "" : mode;
        if (mode === "move") { next.x = o.x + rx; next.y = o.y + ry; }
        if (dir.includes("e")) next.w = o.w + rx;
        if (dir.includes("s")) next.h = o.h + ry;
        if (dir.includes("w")) { next.w = o.w - rx; next.x = o.x + rx; }
        if (dir.includes("n")) { next.h = o.h - ry; next.y = o.y + ry; }
        if (next.w < 1) { if (dir.includes("w")) next.x -= 1 - next.w; next.w = 1; }
        if (next.h < 1) { if (dir.includes("n")) next.y -= 1 - next.h; next.h = 1; }
        next.x = Math.max(0, next.x);
        next.y = Math.max(0, next.y);
      }
      if (["x", "y", "w", "h", "side", "bar"].every((key) => next[key] === p[key])) return;
      const resized = next.w !== p.w || next.h !== p.h || next.side !== p.side || next.bar !== p.bar;
      Object.assign(p, p.type === "elbow" ? next : { x: next.x, y: next.y, w: next.w, h: next.h });
      if (mode !== "move" && mode !== "side" && mode !== "bar") applyAspect(p, mode === "n" || mode === "s" ? "h" : "w", mode.includes("n"));
      changed = true;
      renderPiece(p, { inner: p.type === "elbow" && resized });
      syncSelection();
    };
    const onUp = () => {
      board.removeEventListener("pointermove", onMove);
      board.removeEventListener("pointerup", onUp);
      board.removeEventListener("pointercancel", onUp);
      if (changed) {
        renderPiece(p);
        renderInspector();
        commit();
      }
    };
    board.addEventListener("pointermove", onMove);
    board.addEventListener("pointerup", onUp);
    board.addEventListener("pointercancel", onUp);
  });

  /* ---- Fill and crop: drag the picture to position it, scroll to zoom ---- */

  /** The selected piece's picture under the pointer, if it can be panned. */
  function panTarget(target) {
    const p = selected();
    if (!p || p.imgMode !== "crop" || (p.type !== "frame" && p.type !== "image")) return null;
    const box = target.closest(".f-img, .img-box");
    const img = box?.querySelector("img");
    if (!img || !img.naturalWidth || box.closest(".piece")?.dataset.id !== p.id) return null;
    return { p, box, img };
  }

  /**
   * With object-position p% and the zoom anchored at the same point, the picture's
   * left edge sits at p * (box - shown) from the box's left edge. Dragging by dx
   * therefore changes p by dx / (box - shown).
   */
  function startPan(e) {
    const t = panTarget(e.target);
    if (!t) return false;
    e.preventDefault();
    const { p, box, img } = t;
    const r = box.getBoundingClientRect();
    const cover = Math.max(r.width / img.naturalWidth, r.height / img.naturalHeight) * (p.zoom || 1);
    const spareX = r.width - img.naturalWidth * cover;
    const spareY = r.height - img.naturalHeight * cover;
    const start = { x: e.clientX, y: e.clientY, px: p.px ?? 50, py: p.py ?? 50 };
    board.setPointerCapture(e.pointerId);
    box.classList.add("panning");
    let changed = false;
    const onMove = (ev) => {
      const pct = (d, spare, from) => (Math.abs(spare) < 0.5 ? from : clamp(from + (d / spare) * 100, 0, 100));
      const px = Math.round(pct(ev.clientX - start.x, spareX, start.px) * 10) / 10;
      const py = Math.round(pct(ev.clientY - start.y, spareY, start.py) * 10) / 10;
      if (px === p.px && py === p.py) return;
      Object.assign(p, { px, py });
      changed = true;
      renderPiece(p, { inner: false });
      syncFields(p, ["px", "py"]);
    };
    const onUp = () => {
      board.removeEventListener("pointermove", onMove);
      board.removeEventListener("pointerup", onUp);
      board.removeEventListener("pointercancel", onUp);
      box.classList.remove("panning");
      if (changed) commit();
    };
    board.addEventListener("pointermove", onMove);
    board.addEventListener("pointerup", onUp);
    board.addEventListener("pointercancel", onUp);
    return true;
  }

  let zoomCommit = 0;
  board.addEventListener("wheel", (e) => {
    const t = panTarget(e.target);
    if (!t) return;
    e.preventDefault();
    const { p } = t;
    p.zoom = Math.round(clamp((p.zoom || 1) * Math.exp(-e.deltaY * 0.0015), 1, 6) * 100) / 100;
    renderPiece(p, { inner: false });
    syncFields(p, ["zoom"]);
    clearTimeout(zoomCommit);
    zoomCommit = setTimeout(commit, 400);
  }, { passive: false });

  // Double-click a piece to edit its label right on the board.
  board.addEventListener("dblclick", (e) => {
    const el = e.target.closest(".piece");
    const p = el && piece(el.dataset.id);
    if (p && HAS_LABEL.has(p.type)) startEdit(p);
  });

  // Tools: click to add in the middle, or drag onto the board.
  for (const tool of document.querySelectorAll(".tool")) {
    tool.addEventListener("click", () => addPiece(tool.dataset.type));
    tool.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/x-lcars-piece", tool.dataset.type);
      e.dataTransfer.effectAllowed = "copy";
    });
  }
  stage.addEventListener("dragover", (e) => {
    if (!e.dataTransfer.types.includes("text/x-lcars-piece")) return;
    e.preventDefault();
    stage.classList.add("drop-target");
  });
  stage.addEventListener("dragleave", () => stage.classList.remove("drop-target"));
  stage.addEventListener("drop", (e) => {
    stage.classList.remove("drop-target");
    const type = e.dataTransfer.getData("text/x-lcars-piece");
    if (!TYPES[type]) return;
    e.preventDefault();
    addPiece(type, cellAt(e.clientX, e.clientY));
  });

  $("#grid-toggle").addEventListener("change", (e) => document.body.classList.toggle("show-grid", e.target.checked));

  /* ------------------------------------------------------------------ *
   * Fit to text, and editing labels on the board
   * ------------------------------------------------------------------ */

  /** Resize a piece to its label when "Fit to text" is on. Returns true if it changed. */
  function fitToText(p) {
    if (!p || !p.fit || !HAS_LABEL.has(p.type)) return false;
    const label = els.get(p.id)?.querySelector(".label > .lt");
    if (!label || !label.textContent.trim()) return false;
    const range = document.createRange();
    range.selectNodeContents(label);
    const box = range.getBoundingClientRect();
    const k = cellPx();
    if (!box.width || !k) return false;
    const sideways = (p.rot || 0) % 180 !== 0;
    const textW = (sideways ? box.height : box.width) / k;
    // Height from the line count: labels are set solid (line-height 1).
    const lines = serialize(label).split("\n").length;
    const textH = p.wrap ? box.height / k : (lines * (p.fs || 17)) / doc.cell;
    const pad = p.type === "text" ? 0.8 : 1.6;
    const iw = p.wrap ? dims(p).iw : Math.max(1, Math.ceil(textW + pad - 0.05));
    const ih = Math.max(p.type === "text" ? 1 : dims(p).ih, Math.ceil(textH - 0.05));
    const [w, h] = sideways ? [ih, iw] : [iw, ih];
    if (w === p.w && h === p.h) return false;
    Object.assign(p, { w, h });
    renderPiece(p, { inner: false });
    syncSelection();
    return true;
  }

  function startEdit(p) {
    if (editing?.id === p.id) return;
    if (editing) finishEdit(true);
    if (selectedId !== p.id) select(p.id);
    editing = { id: p.id, original: p.label };
    const el = els.get(p.id);
    el.innerHTML = pieceInner(p, doc.cell, ctx); // ensures a label element exists
    const label = el.querySelector(".label > .lt");
    label.innerHTML = runsHTML(parseLabel(p.label), { edit: true }) || "​";
    label.contentEditable = "true";
    label.spellcheck = false;
    editing.el = label;
    label.addEventListener("input", onEditInput);
    label.addEventListener("keydown", onEditKey);
    label.addEventListener("paste", onEditPaste);
    label.addEventListener("blur", onEditBlur);
    label.focus();
    const sel = getSelection();
    sel.selectAllChildren(label);
    renderInspector();
  }

  function onEditInput() {
    const p = piece(editing.id);
    p.label = serialize(editing.el);
    fitToText(p);
    syncEditors(p, "label");
    syncSelection();
  }

  function onEditKey(e) {
    if (e.key === "Escape") { e.preventDefault(); finishEdit(false); }
    else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finishEdit(true); }
    else if (e.key === "Enter") { e.preventDefault(); document.execCommand("insertLineBreak"); }
  }

  function onEditPaste(e) {
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  }

  function onEditBlur() {
    // Clicking a text-color swatch keeps focus; anything else ends the edit.
    setTimeout(() => { if (editing && document.activeElement !== editing.el) finishEdit(true); }, 0);
  }

  function finishEdit(keep) {
    if (!editing) return;
    const { id, el, original } = editing;
    const p = piece(id);
    editing = null;
    el.removeEventListener("blur", onEditBlur);
    if (p) {
      p.label = keep ? serialize(el) : original;
      renderPiece(p);
      fitToText(p);
      syncEditors(p, "label");
      syncSelection();
      if (keep) commit();
    }
  }

  /* ------------------------------------------------------------------ *
   * Coloring text
   *
   * Text is edited as it will look, in rich-text editors (in the panel, or a
   * label on the board). Color codes stay behind the scenes in the markup.
   * ------------------------------------------------------------------ */

  /** The editor holding a non-empty text selection, if any. */
  function selectionEditor() {
    const sel = getSelection();
    if (!sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return null;
    let node = range.commonAncestorContainer;
    if (node.nodeType !== Node.ELEMENT_NODE) node = node.parentElement;
    const host = node?.closest('.rt-edit, .lt[contenteditable="true"]');
    return host ? { host, range, sel } : null;
  }

  /** Wrap the selected letters in one color (an empty color returns them to the default). */
  function wrapRange(range, sel, color) {
    const frag = range.extractContents();
    const span = document.createElement("span");
    span.setAttribute("data-c", color);
    if (color.startsWith("#")) span.style.color = color;
    else if (color) span.className = `t-${color}`;
    const flatten = (node) => {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === Node.TEXT_NODE || n.nodeName === "BR") span.append(n);
        else flatten(n);
      }
    };
    flatten(frag);
    range.insertNode(span);
    sel.selectAllChildren(span);
  }

  /** A Text color swatch: color the selected letters, or else set the piece's text color. */
  function colorText(color) {
    const p = selected();
    if (!p) return;
    const target = selectionEditor();
    if (target) {
      wrapRange(target.range, target.sel, color);
      target.host.dispatchEvent(new Event("input", { bubbles: true }));
      commit();
      return;
    }
    if (editing) finishEdit(true);
    p.tcolor = color;
    renderPiece(p);
    fitToText(p);
    syncSelection();
    renderInspector();
    commit();
  }

  const FILLED = new Set(["block", "button", "elbow"]);

  /** How a piece's text looks by default, for painting the panel's editors. */
  function textLook(p) {
    const filled = FILLED.has(p.type);
    const plain = { text: "atomic-tangerine", padd: "melrose", quote: "melrose", list: "melrose", image: "melrose" }[p.type];
    const fg = p.tcolor ? colorValue(p.tcolor) : filled ? "#000" : colorValue(plain || p.color || "atomic-tangerine");
    return { fg, bg: filled ? colorValue(p.color) : "#000" };
  }

  const fillEditor = (ed, markup) => { ed.innerHTML = runsHTML(parseLabel(markup), { edit: true }); };

  function paintEditor(ed, p) {
    const { fg, bg } = textLook(p);
    ed.style.setProperty("--ed-fg", fg);
    ed.style.setProperty("--ed-bg", bg);
  }

  /** Refresh the panel's editors after a change made elsewhere (e.g. on the board). */
  function syncEditors(p, key) {
    for (const ed of inspector.querySelectorAll(".rt-edit")) {
      paintEditor(ed, p);
      if ((!key || ed.dataset.key === key) && document.activeElement !== ed) fillEditor(ed, p[ed.dataset.key]);
    }
  }

  /**
   * A rich-text editor for one text property of a piece. The board updates as
   * you type (a PADD waits for a pause, since it re-types its text).
   */
  function richEditor(p, key, { multiline = true, later = false } = {}) {
    const ed = document.createElement("div");
    ed.className = "rt-edit" + (multiline ? " multi" : "") + (key === "text" && p.type === "padd" ? " padd" : "");
    ed.contentEditable = "true";
    ed.spellcheck = false;
    ed.dataset.key = key;
    ed.setAttribute("role", "textbox");
    if (multiline) ed.setAttribute("aria-multiline", "true");
    paintEditor(ed, p);
    fillEditor(ed, p[key]);
    let timer = 0;
    const show = () => {
      renderPiece(p);
      fitToText(p);
      if (applyAspect(p)) renderPiece(p, { inner: false });
      syncSelection();
    };
    ed.addEventListener("focus", () => { if (editing) finishEdit(true); });
    ed.addEventListener("input", () => {
      p[key] = serialize(ed);
      clearTimeout(timer);
      if (later) timer = setTimeout(show, 450);
      else show();
    });
    ed.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); ed.blur(); return; }
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (multiline && !(e.ctrlKey || e.metaKey)) document.execCommand("insertLineBreak");
      else ed.blur();
    });
    ed.addEventListener("paste", onEditPaste);
    ed.addEventListener("blur", () => {
      if (later && timer) { clearTimeout(timer); timer = 0; show(); }
      commit();
    });
    return ed;
  }

  /* ------------------------------------------------------------------ *
   * Inspector: grouped, collapsible sections
   * ------------------------------------------------------------------ */

  const BLINK = ["blink", "Blink", ["none", "slow", "normal", "fast"]];
  const CROP = { when: (p) => p.imgMode === "crop" };
  const ALIGN = [["halign", "Align", ["left", "center", "right"]], ["valign", "Vertical", ["top", "middle", "bottom"]]];
  const TEXT_COLOR = ["tcolor", "Text color · select letters first to color just those", "textcolor"];
  const FIT = ["fit", "Fit to text (shrinks and grows as you type)", "check"];

  const POSITION = ["Position and size", [["x", "X", "int"], ["y", "Y", "int"], ["w", "Width", "int"], ["h", "Height", "int"]], { row: true }];
  const LABEL = ["Text", [TEXT_COLOR, ["label", "Label · * = dot", "rich"], ["fs", "Text size", "num"], ...ALIGN, FIT]];
  const EFFECTS = ["Effects", [BLINK]];
  const IMAGE = ["Image", [["src", "Image (path or URL)", "text"], ["file", "Or choose a file", "file"],
    ["imgMode", "Sizing", ["keep", "crop", "fit"]],
    ["zoom", "Zoom (1 = just fills) · or scroll over the picture", "zoom", CROP],
    ["px", "Horizontal position % · or drag the picture", "pct", CROP], ["py", "Vertical position % (0 = top)", "pct", CROP],
    ["alt", "Description for screen readers", "text"]]];

  /** Each piece type's panel: [section title, fields, options]. */
  const SECTIONS = {
    block: [POSITION, ["Fill", [["color", "Color", "color"], ["ends", "Rounded ends", ["none", "left", "right", "both", "top", "bottom"]]]], LABEL, EFFECTS],
    button: [POSITION,
      ["Fill", [["color", "Color", "color"], ["hover", "Hover color", "color-auto"], ["active", "Pressed color", "color-auto"],
        ["ends", "Shape", ["both", "left", "right", "none"]]]],
      LABEL,
      ["Action", [["href", "Link (URL or page)", "text"], ["beep", "Beep when clicked", "check"]]],
      EFFECTS],
    elbow: [POSITION, ["Fill", [["color", "Color", "color"]]],
      ["Shape", [["flip", "Flip", "flip"], ["side", "Sidebar width (the wide part)", "num"], ["bar", "Bar thickness (the narrow arm)", "num"],
        ["rx", "Outer curve width", "num"], ["ry", "Outer curve height", "num"], ["ri", "Inner curve", "num"]]],
      LABEL, EFFECTS],
    text: [POSITION,
      ["Text", [TEXT_COLOR, ["label", "Text · * = dot", "rich"], ["fs", "Text size", "num"], ...ALIGN, FIT,
        ["wrap", "Wrap lines to the box (for paragraphs)", "check"]]],
      EFFECTS],
    padd: [POSITION,
      ["Text", [TEXT_COLOR, ["text", "PADD text", "rich-later"], ["fs", "Text size", "num"]]],
      ["Playback", [["hold", "Seconds per page (0 = manual)", "num"]]]],
    image: [POSITION, IMAGE, ["Border", [["border", "Border color", "color-none"]]],
      ["Caption", [TEXT_COLOR, ["caption", "Caption", "rich1"], ["fs", "Caption size", "num"]]]],
    frame: [POSITION, IMAGE,
      ["Layout", [["variant", "Layout", ["bracket-left", "bracket-right", "twin", "viewscreen"]], ["bar", "Thickness (side and bars)", "num"]]],
      ["Fill", [["color", "Main color", "color"], ["color2", "Accent color", "color"], ["color3", "Second accent", "color"]]],
      ["Text", [TEXT_COLOR, ["title", "Title (header)", "rich1"], ["caption", "Description (footer)", "rich1"], ["fs", "Text size", "num"]]]],
    quote: [POSITION, ["Fill", [["color", "Bar color", "color"]]],
      ["Text", [TEXT_COLOR, ["text", "Quote", "rich"], ["fs", "Text size", "num"]]], EFFECTS],
    textbar: [POSITION, ["Fill", [["color", "Bar color", "color"], ["color2", "End cap color", "color-auto"]]],
      ["Text", [TEXT_COLOR, ["label", "Text", "rich1"], ["titlePos", "Text position", ["start", "end"]], ["fs", "Text size", "num"]]], EFFECTS],
    list: [POSITION, ["Fill", [["color", "Bullet color", "color"]]],
      ["Text", [TEXT_COLOR, ["text", "Items, one per line", "rich"], ["fs", "Text size", "num"]]], EFFECTS],
    cascade: [POSITION,
      ["Numbers", [["color", "Number color", "color"], ["color2", "Highlight color", "color"], ["fs", "Text size", "num"],
        ["columns", "Columns", "int"], ["animate", "Flowing numbers", "check"], ["seed", "Pattern (any number)", "int"]]]],
  };
  const OPTION_NAMES = {
    imgMode: { keep: "Keep image shape (frame follows the picture)", crop: "Fill and crop (zoom and position)", fit: "Show whole image" },
    variant: { "bracket-left": "Bracket on the left", "bracket-right": "Bracket on the right", twin: "Twin brackets", viewscreen: "Viewscreen corners" },
  };

  const SECTIONS_KEY = "trektext-builder:closed-sections";
  const closedSections = (() => {
    try { return new Set(JSON.parse(localStorage.getItem(SECTIONS_KEY)) || []); } catch { return new Set(); }
  })();

  /** A collapsible panel section; which ones are closed is remembered. */
  function section(title, nodes, { row = false } = {}) {
    const box = document.createElement("details");
    box.className = "section";
    box.open = !closedSections.has(title);
    const head = document.createElement("summary");
    head.textContent = title;
    const body = document.createElement("div");
    body.className = row ? "section-body row" : "section-body";
    body.append(...nodes);
    box.append(head, body);
    box.addEventListener("toggle", () => {
      if (box.open) closedSections.delete(title);
      else closedSections.add(title);
      try { localStorage.setItem(SECTIONS_KEY, JSON.stringify([...closedSections])); } catch { /* storage unavailable */ }
    });
    return box;
  }

  function renderInspector() {
    const p = selected();
    inspector.replaceChildren();
    if (!p) return renderPageSettings();

    const h = document.createElement("h2");
    h.textContent = `${p.type} ${p.id}`;
    inspector.append(h);

    for (const [title, fields, opts] of SECTIONS[p.type]) {
      const shown = fields.filter(([, , , o]) => !o?.when || o.when(p));
      inspector.append(section(title, shown.map(([key, text, kind]) => field(p, key, text, kind)), opts));
    }

    const actions = document.createElement("div");
    actions.className = "actions";
    if (p.rot) actions.append(actionButton("Clear rotation", "orange", clearRotation));
    actions.append(
      actionButton("Duplicate", "blue", duplicate),
      actionButton("Forward", "dkblue", () => restack(1)),
      actionButton("Back", "dkblue", () => restack(-1)),
      actionButton("Delete", "rose", remove),
    );
    const note = document.createElement("p");
    note.className = "note";
    note.innerHTML = "Drag to move, white handles to resize" +
      (p.type === "elbow" ? ", orange handles to set the sidebar width and bar thickness" : "") +
      ". <kbd>Double-click</kbd> a label to edit it on the board. <kbd>Arrows</kbd> nudge (<kbd>Shift</kbd> = 4), " +
      (p.type === "elbow" ? "<kbd>H</kbd> / <kbd>V</kbd> flip, " : "") + "<kbd>Ctrl+D</kbd> duplicates, <kbd>Del</kbd> deletes, <kbd>Ctrl+Z</kbd> undoes.";
    inspector.append(section("Arrange", [actions, note]));
  }

  function renderPageSettings() {
    inspector.innerHTML = `<h2>Page</h2>`;
    const row = document.createElement("div");
    row.className = "row three";
    row.append(field(doc, "cols", "Columns", "int", { page: true }), field(doc, "rows", "Rows", "int", { page: true }),
      field(doc, "cell", "Cell size", "int", { page: true }));
    const note = document.createElement("p");
    note.className = "note";
    note.innerHTML = `The board is ${doc.cols * doc.cell} × ${doc.rows * doc.cell} design pixels and scales to fit any screen. ` +
      `Bars and buttons are usually 4 cells high, with 1-cell gaps.<br><br>Select a piece to edit it, or drag one in from the left.`;
    inspector.append(section("Page", [field(doc, "title", "Page title", "text", { page: true }), row]), section("Help", [note]));
  }

  function actionButton(text, color, fn) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `pill ${color}`;
    b.textContent = text;
    b.addEventListener("click", fn);
    return b;
  }

  function field(target, key, text, kind, opts = {}) {
    const block = kind === "textcolor" || kind === "flip" || String(kind).startsWith("rich") || String(kind).startsWith("color");
    const wrap = document.createElement(block ? "div" : "label");
    wrap.className = kind === "check" ? "check" : "field";

    const update = (value, final) => {
      target[key] = value;
      if (opts.page) {
        // Resize the board in place; rebuilding the panel would steal focus mid-typing.
        if (key !== "title") applyVars(board, { "--cols": doc.cols, "--rows": doc.rows, "--cell": doc.cell });
        if (key === "cell") for (const p of doc.pieces) if (p.type === "elbow") renderPiece(p);
      } else {
        renderPiece(target);
        if (key === "fs" || key === "fit") fitToText(target);
        if (["imgMode", "bar", "variant", "caption", "fs"].includes(key) && applyAspect(target)) renderPiece(target, { inner: false });
        syncSelection();
        if (key === "color") syncEditors(target); // filled pieces' editors show the fill
        if (key === "imgMode") renderInspector(); // show or hide the crop controls
      }
      if (final) commit();
    };

    if (kind === "check") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = !!target[key];
      input.addEventListener("change", () => update(input.checked, true));
      wrap.append(input, document.createTextNode(text));
      return wrap;
    }

    if (kind === "flip") {
      wrap.className = "actions tight";
      wrap.append(actionButton("Flip horizontal", "orange", () => flip("h")), actionButton("Flip vertical", "orange", () => flip("v")));
      return wrap;
    }

    const cap = document.createElement("span");
    cap.textContent = text;
    wrap.append(cap);

    if (kind === "textcolor") {
      const autoTitle = FILLED.has(target.type) ? "Default (black)" : "Default";
      wrap.append(swatches(target[key], true, colorText, { autoTitle }));
      return wrap;
    }
    if (kind === "color" || kind === "color-auto" || kind === "color-none") {
      const autoTitle = kind === "color-none" ? "None" : undefined;
      wrap.append(swatches(target[key], kind !== "color", (v) => update(v, true), { autoTitle }));
      return wrap;
    }
    if (String(kind).startsWith("rich")) {
      wrap.append(richEditor(target, key, { multiline: kind !== "rich1", later: kind === "rich-later" }));
      return wrap;
    }
    if (kind === "file") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.addEventListener("change", () => {
        const file = input.files[0];
        if (!file) return;
        const prev = attached.get(target.id);
        if (prev) URL.revokeObjectURL(prev.url);
        attached.set(target.id, { file, url: URL.createObjectURL(file) });
        target.src = `images/${file.name}`;
        renderPiece(target);
        renderInspector();
        commit();
      });
      wrap.append(input);
      return wrap;
    }

    let input;
    if (Array.isArray(kind)) {
      input = document.createElement("select");
      for (const v of kind) input.add(new Option(OPTION_NAMES[key]?.[v] ?? v, v));
      input.value = target[key] ?? kind[0];
      input.addEventListener("change", () => update(input.value, true));
    } else {
      input = document.createElement("input");
      input.type = kind === "text" ? "text" : "number";
      if (kind === "int") { input.step = "1"; input.min = key === "x" || key === "y" ? "0" : "1"; }
      if (kind === "num") { input.step = "0.5"; input.min = "0"; }
      if (kind === "pct") { input.step = "1"; input.min = "0"; input.max = "100"; }
      if (kind === "zoom") { input.step = "0.05"; input.min = "1"; input.max = "6"; }
      input.value = target[key] ?? "";
      const read = () => (kind === "text" ? input.value : Number(input.value));
      input.addEventListener("input", () => {
        const v = read();
        if (kind !== "text" && !Number.isFinite(v)) return;
        update(kind === "int" ? Math.round(v) : v, false);
      });
      input.addEventListener("change", () => commit());
    }
    input.dataset.key = key;
    wrap.append(input);
    return wrap;
  }

  function swatches(current, allowAuto, onPick, { autoTitle } = {}) {
    const box = document.createElement("div");
    box.className = "swatches";
    const add = (value, title, bg) => {
      const b = document.createElement("button");
      b.type = "button";
      b.title = title;
      if (bg) b.style.setProperty("--sw", bg);
      else b.className = "auto";
      b.setAttribute("aria-pressed", String((current || "") === value));
      // Keep any text selection when a swatch is clicked.
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", () => onPick(value));
      box.append(b);
    };
    if (allowAuto) add("", autoTitle || "Automatic", null);
    const list = palette();
    if (current && HEX.has(current) && !list.some(([n]) => n === current)) list.unshift([current, HEX.get(current)]);
    for (const [name, hex] of list) add(name, name.replace(/-/g, " "), hex);
    return box;
  }

  /* ------------------------------------------------------------------ *
   * Editing commands
   * ------------------------------------------------------------------ */

  /** Mirror an elbow left-right ("h") or top-bottom ("v"). */
  function flip(axis) {
    const p = selected();
    if (!p || p.type !== "elbow") return;
    if (editing) finishEdit(true);
    const [v, h] = p.corner;
    p.corner = axis === "h" ? v + (h === "l" ? "r" : "l") : (v === "t" ? "b" : "t") + h;
    renderPiece(p);
    syncSelection();
    renderInspector();
    commit();
  }

  /** Pages saved while rotation existed: turn a piece back to upright. */
  function clearRotation() {
    const p = selected();
    if (!p || !p.rot) return;
    if (p.rot % 180) [p.w, p.h] = [p.h, p.w];
    p.rot = 0;
    renderPiece(p);
    syncSelection();
    renderInspector();
    commit();
  }

  function remove() {
    const i = doc.pieces.findIndex((p) => p.id === selectedId);
    if (i < 0) return;
    editing = null;
    doc.pieces.splice(i, 1);
    attached.delete(selectedId);
    selectedId = null;
    renderAll();
    commit();
  }

  function duplicate() {
    const p = selected();
    if (!p) return;
    if (editing) finishEdit(true);
    const copy = { ...structuredClone(p), id: `p${doc.nextId++}`, x: p.x + 2, y: p.y + 2 };
    doc.pieces.push(copy);
    selectedId = copy.id;
    renderAll();
    commit();
  }

  function restack(dir) {
    const i = doc.pieces.findIndex((p) => p.id === selectedId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= doc.pieces.length) return;
    if (editing) finishEdit(true);
    [doc.pieces[i], doc.pieces[j]] = [doc.pieces[j], doc.pieces[i]];
    renderAll();
    commit();
  }

  document.addEventListener("keydown", (e) => {
    const typing = e.target.closest?.("input, textarea, select") || e.target.isContentEditable;
    const mod = e.ctrlKey || e.metaKey;
    if (typing) return;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    const p = selected();
    if (!p) return;
    const step = e.shiftKey ? 4 : 1;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) {
      e.preventDefault();
      p.x = Math.max(0, p.x + moves[e.key][0]);
      p.y = Math.max(0, p.y + moves[e.key][1]);
      renderPiece(p, { inner: false });
      syncSelection();
      renderInspector();
      commit();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      remove();
    } else if (mod && e.key.toLowerCase() === "d") {
      e.preventDefault();
      duplicate();
    } else if (!mod && p.type === "elbow" && ["h", "v"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      flip(e.key.toLowerCase());
    } else if ((e.key === "Enter" || e.key === "F2") && HAS_LABEL.has(p.type)) {
      e.preventDefault();
      startEdit(p);
    } else if (e.key === "Escape") {
      select(null);
    }
  });

  /* ------------------------------------------------------------------ *
   * Save, open, preview and export
   * ------------------------------------------------------------------ */

  function pageCSS() {
    const lines = [`/* Generated by the TrekText LCARS Builder. */`,
      `.lcars-board { --cols: ${doc.cols}; --rows: ${doc.rows}; --cell: ${doc.cell}; }`];
    for (const p of doc.pieces) {
      const vars = Object.entries(pieceVars(p)).map(([k, v]) => `${k}: ${v};`).join(" ");
      lines.push(`#${p.id} { ${vars} }`);
    }
    return lines.join("\n") + "\n";
  }

  function pageHTML({ preview = false } = {}) {
    const lib = (path) => (preview ? new URL(LIB_FILES[path], location.href).href : path);
    const pieces = doc.pieces.map((p) => {
      const isLink = p.type === "button" && p.href;
      const tag = isLink ? "a" : "div";
      const href = isLink ? ` href="${esc(p.href)}"` : "";
      const beep = p.type === "button" && p.beep ? " data-beep" : "";
      const inner = pieceInner(p, doc.cell, preview ? { imageURL: ctx.imageURL } : {});
      return `      <${tag} id="${p.id}" class="${pieceClasses(p)}"${href}${beep}>${inner}</${tag}>`;
    }).join("\n");
    const css = preview ? `<style>\n${pageCSS()}</style>` : `<link rel="stylesheet" href="page.css">`;
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(doc.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Antonio&display=swap">
  <link rel="stylesheet" href="${lib("lcars/palette.css")}">
  <link rel="stylesheet" href="${lib("lcars/pieces.css")}">
  ${css}
  <script src="${lib("lcars/trek-padd.js")}"></script>
</head>
<body class="lcars-body">
  <main class="lcars-screen">
    <div class="lcars-board">
${pieces}
    </div>
  </main>
</body>
</html>
`;
  }

  function download(name, content, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const slug = () => (doc.title || "lcars-page").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lcars-page";

  async function exportFolder() {
    if (editing) finishEdit(true);
    const files = { "index.html": pageHTML(), "page.css": pageCSS(), "page.json": JSON.stringify(doc, null, 2) };
    try {
      for (const [dest, src] of Object.entries(LIB_FILES)) {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`${src}: ${res.status}`);
        files[dest] = await res.text();
      }
    } catch (err) {
      toast("Export needs the builder served over HTTP (python -m http.server)");
      console.error(err);
      return;
    }
    for (const [id, { file }] of attached) {
      const p = piece(id);
      if (p && p.src === `images/${file.name}`) files[p.src] = file;
    }

    if (!window.showDirectoryPicker) {
      download("index.html", files["index.html"], "text/html");
      download("page.css", files["page.css"], "text/css");
      toast("Saved index.html and page.css. Copy lcars/ and trek-padd.js beside them.");
      return;
    }
    let dir;
    try {
      dir = await window.showDirectoryPicker({ id: "lcars-export", mode: "readwrite" });
    } catch {
      return; // cancelled
    }
    for (const [path, content] of Object.entries(files)) {
      const parts = path.split("/");
      let folder = dir;
      for (const part of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(part, { create: true });
      const handle = await folder.getFileHandle(parts[parts.length - 1], { create: true });
      const out = await handle.createWritable();
      await out.write(content);
      await out.close();
    }
    toast(`Exported ${Object.keys(files).length} files to "${dir.name}"`);
  }

  function preview() {
    if (editing) finishEdit(true);
    const url = URL.createObjectURL(new Blob([pageHTML({ preview: true })], { type: "text/html" }));
    window.open(url, "_blank");
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3500);
  }

  const fileInput = $("#open-file");
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    try {
      load(await file.text());
      commit();
      toast(`Opened ${file.name}`);
    } catch (err) {
      toast(`Could not open ${file.name}: ${err.message}`);
    }
  });

  /* ------------------------------------------------------------------ *
   * Preferences: which colors the pickers offer
   * ------------------------------------------------------------------ */

  const prefsDialog = $("#prefs");

  function setOn(c, on) {
    for (const n of c.names) enabled.delete(n);
    if (on) enabled.add(c.name);
  }

  function prefsChanged() {
    saveEnabled();
    renderPrefs();
    renderInspector();
  }

  function renderPrefs() {
    const box = $("#prefs-colors");
    box.replaceChildren();
    for (const [key, title] of GROUPS) {
      const list = ALL_COLORS.filter((c) => c.family === key);
      if (!list.length) continue;
      const sec = document.createElement("section");
      sec.className = "prefs-group";
      const allOn = list.every(isOn);
      sec.innerHTML = `<h3><span></span><small>${list.filter(isOn).length} of ${list.length}</small>` +
        `<button type="button" class="pill dkblue">${allOn ? "None" : "All"}</button></h3><div class="prefs-grid"></div>`;
      sec.querySelector("h3 span").textContent = title;
      sec.querySelector("h3 button").addEventListener("click", () => {
        for (const c of list) setOn(c, !allOn);
        prefsChanged();
      });
      const grid = sec.querySelector(".prefs-grid");
      for (const c of list) {
        const chip = document.createElement("label");
        chip.className = "prefs-chip" + (c.picked ? " picked" : "");
        chip.title = `${c.names.join(" / ")}  ${c.hex}${c.picked ? "  (one of your picks)" : ""}`;
        chip.innerHTML = `<input type="checkbox"${isOn(c) ? " checked" : ""}><span class="sw"></span><span class="nm"></span>`;
        chip.querySelector(".sw").style.background = c.hex;
        chip.querySelector(".nm").textContent = c.names.join(" / ");
        chip.querySelector("input").addEventListener("change", (e) => {
          setOn(c, e.target.checked);
          prefsChanged();
        });
        grid.append(chip);
      }
      box.append(sec);
    }
    $("#prefs-count").textContent = `${palette().length} of ${ALL_COLORS.length} colors in the pickers`;
  }

  for (const b of document.querySelectorAll("[data-prefs]")) {
    b.addEventListener("click", () => {
      if (b.dataset.prefs === "picks") enabled = new Set(PICKS);
      else if (b.dataset.prefs === "all") enabled = new Set(ALL_COLORS.map((c) => c.name));
      else enabled = new Set();
      prefsChanged();
    });
  }

  const COMMANDS = {
    prefs: () => { renderPrefs(); prefsDialog.showModal(); },
    new: () => { if (doc.pieces.length && !confirm("Start a new page? Unsaved changes will be lost.")) return; load(blankDoc()); commit(); },
    template: () => { if (doc.pieces.length && !confirm("Replace this page with the classic frame template?")) return; load(classicTemplate()); fitAll(); commit(); },
    open: () => fileInput.click(),
    save: () => { if (editing) finishEdit(true); download(`${slug()}.json`, JSON.stringify(doc, null, 2), "application/json"); },
    preview,
    export: exportFolder,
  };
  for (const b of document.querySelectorAll("[data-cmd]")) b.addEventListener("click", () => COMMANDS[b.dataset.cmd]());

  /* ------------------------------------------------------------------ *
   * Starter template: a classic two-frame LCARS page
   * ------------------------------------------------------------------ */

  function classicTemplate() {
    const d = blankDoc();
    d.title = "Classic Frame";
    const P = (type, x, y, w, h, props = {}) =>
      d.pieces.push({ id: `p${d.nextId++}`, type, rot: 0, ...structuredClone(TYPES[type]), x, y, w, h, ...props });
    const cap = (x, y, ends) => P("block", x, y, 4, 4, { color: "lilac", ends, halign: "center", valign: "middle" });
    const bar = (x, y, w, color) => P("block", x, y, w, 4, { color, halign: "center", valign: "middle" });

    // Header and footer bars
    cap(0, 0, "left");
    P("text", 5, 0, 24, 4, { label: "LCARS Page", tcolor: "atomic-tangerine", fit: false });
    bar(30, 0, 82, "blue-bell");
    P("text", 113, 0, 48, 4, { label: "23801 Subspace Communications * Active", tcolor: "tanoi", halign: "right", fit: false });
    cap(162, 0, "right");
    cap(0, 104, "left");
    bar(5, 104, 100, "blue-bell");
    P("text", 106, 104, 55, 4, { label: "LCARS * Historical File", tcolor: "hopbush", halign: "right", fit: false });
    cap(162, 104, "right");

    // Buttons
    const btn = (x, y, label, color) => P("button", x, y, 11, 4, { label, color });
    btn(0, 12, "416-101", "atomic-tangerine");
    btn(0, 17, "088-281", "melrose");
    btn(12, 17, "088-151", "atomic-tangerine");
    btn(12, 22, "088-332", "chestnut-rose");
    btn(0, 27, "088-834", "atomic-tangerine");
    btn(12, 27, "088-964", "blue-bell");
    const colors = ["lilac", "atomic-tangerine", "atomic-tangerine", "lilac", "hopbush", "sandy-brown"];
    for (let i = 0; i < 12; i++) btn((i % 2) * 12, 50 + Math.floor(i / 2) * 5, `088-${String(i + 1).padStart(3, "0")}`, colors[i % colors.length]);

    // Upper frame with an image
    P("elbow", 25, 6, 38, 16, { corner: "tl", color: "chestnut-rose", label: "Online" });
    P("elbow", 25, 23, 38, 17, { corner: "bl", color: "sandy-brown" });
    bar(64, 6, 102, "lilac");
    bar(64, 36, 102, "blue-bell");
    P("image", 55, 11, 111, 24);

    // Lower frame with a PADD
    P("elbow", 25, 42, 38, 16, { corner: "tl", color: "blue-bell", label: "Mode Select" });
    P("block", 25, 59, 25, 20, { color: "lilac", label: "Accessing\n088-647" });
    P("elbow", 25, 80, 38, 22, { corner: "bl", color: "sandy-brown" });
    bar(64, 42, 102, "hopbush");
    bar(64, 98, 102, "chestnut-rose");
    P("padd", 55, 47, 111, 50, {
      text: "##{melrose}WELCOME TO THE LCARS BUILDER.\n\n##{tanoi}DRAG PIECES FROM THE LEFT, STRETCH THEM WITH THE HANDLES, AND EDIT THEM IN THE PANEL ON THE RIGHT.\n\n" +
        "##{atomic-tangerine}DOUBLE-CLICK ##{melrose}ANY LABEL TO EDIT IT ON THE BOARD, AND SELECT LETTERS TO ##{green-apple}COLOR ##{andorian-blue}THEM.",
    });
    return d;
  }

  /* ------------------------------------------------------------------ *
   * Start
   * ------------------------------------------------------------------ */

  function fitAll() {
    let changed = false;
    for (const p of doc.pieces) changed = fitToText(p) || changed;
    return changed;
  }

  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* storage unavailable */ }
  try {
    load(saved ? JSON.parse(saved) : classicTemplate());
  } catch {
    load(classicTemplate());
  }
  commit();
  // Text sizes depend on the font, so re-fit once it has loaded.
  document.fonts?.ready.then(() => { if (fitAll()) commit(); });

  window.lcarsBuilder = {
    get doc() { return doc; }, pageHTML, pageCSS, load, select, flip, startEdit: (id) => startEdit(piece(id)),
    colorText, parseLabel, serialize,
  };
})();
