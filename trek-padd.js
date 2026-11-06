/*!
 * <trek-padd> — an LCARS-style PADD text display web component.
 *
 * A modern rebuild of TrekText, a Java applet written in 2002–2003.
 * Text is revealed one line at a time with the original timing and beep,
 * coloured with the original "##x" codes.
 *
 *   <script src="trek-padd.js"></script>
 *   <trek-padd src="trek.txt"></trek-padd>
 *
 * Plain script (not an ES module) so pages work when opened from disk.
 */
(() => {
  "use strict";

  /** The original applet's colour codes: lowercase = light, uppercase = dark. */
  const COLORS = Object.freeze({
    r: { name: "red", hex: "#CC6666" },
    o: { name: "light-orange", hex: "#FF9966" },
    O: { name: "orange", hex: "#FF9900" },
    y: { name: "yellow", hex: "#FFCC99" },
    b: { name: "light-blue", hex: "#9999FF" },
    B: { name: "dark-blue", hex: "#9999CC" },
    p: { name: "light-purple", hex: "#CC99CC" },
    P: { name: "dark-purple", hex: "#CC6699" },
  });
  const DEFAULT_COLOR = "b";

  /** Timing recovered from the original applet. */
  const TIMING = Object.freeze({
    lineDelayMs: 65, // one line revealed per tick
    beepIntervalMs: 96, // beep throttle (also the clip's exact length)
    pageHoldS: 16, // pause on a full page before moving on
  });

  /* ------------------------------------------------------------------ *
   * Stardate
   * ------------------------------------------------------------------ */

  /**
   * TNG-era stardate. 2364 began at 41000.0 and each year adds 1000, so
   * stardate = (year - 2323) * 1000 + (fraction of year elapsed) * 1000.
   * The five-digit counter rolls over every 100 years (99999.9 -> 00000.0),
   * so 2023 and 2323 both began at 00000.0.
   */
  function stardate(date = new Date()) {
    const year = date.getFullYear();
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    const yearTenths = Math.floor(((date - start) / (end - start)) * 10000);
    const CYCLE = 1000000; // 100000.0 in tenths
    const tenths = ((((year - 2323) * 10000 + yearTenths) % CYCLE) + CYCLE) % CYCLE;
    return `${String(Math.floor(tenths / 10)).padStart(5, "0")}.${tenths % 10}`;
  }

  /* ------------------------------------------------------------------ *
   * Markup
   * ------------------------------------------------------------------ */

  /**
   * Split marked-up text into paragraphs of { text, colors[] }.
   * "##x" switches colour; unknown codes are swallowed, as in the original.
   */
  function parse(source) {
    const text = String(source).replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
    const paragraphs = [];
    let para = { text: "", colors: [] };
    let color = DEFAULT_COLOR;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === "#" && text[i + 1] === "#" && i + 2 < text.length) {
        const code = text[i + 2];
        if (Object.hasOwn(COLORS, code)) color = code;
        i += 2;
      } else if (ch === "\n") {
        paragraphs.push(para);
        para = { text: "", colors: [] };
      } else {
        para.text += ch;
        para.colors.push(color);
      }
    }
    paragraphs.push(para);
    return paragraphs;
  }

  function colorValue(code) {
    const { name, hex } = COLORS[code];
    return `var(--padd-${name}, ${hex})`;
  }

  /** Append coloured spans for para.text[start, end) to parent. */
  function appendRuns(parent, para, start, end) {
    let i = start;
    while (i < end) {
      const code = para.colors[i];
      let j = i + 1;
      while (j < end && para.colors[j] === code) j++;
      const span = document.createElement("span");
      span.style.color = colorValue(code);
      span.textContent = para.text.slice(i, j);
      parent.append(span);
      i = j;
    }
  }

  /** Render marked-up text statically (no animation), one div per paragraph. */
  function toFragment(source) {
    const frag = document.createDocumentFragment();
    for (const para of parse(source)) {
      const div = document.createElement("div");
      if (para.text) appendRuns(div, para, 0, para.text.length);
      else div.textContent = " ";
      frag.append(div);
    }
    return frag;
  }

  /** Strip surrounding blank lines and common indentation from inline text. */
  function dedent(source) {
    const lines = String(source).replace(/\r\n?/g, "\n").split("\n");
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    const indents = lines.filter((l) => l.trim()).map((l) => /^[ \t]*/.exec(l)[0].length);
    const cut = indents.length ? Math.min(...indents) : 0;
    return lines.map((l) => l.slice(cut)).join("\n");
  }

  /**
   * Greedy word wrap. Returns [start, end) ranges into text. Words longer
   * than a line are broken by character. Spaces at a wrap point are dropped.
   */
  function wrap(text, maxWidth, measure) {
    const n = text.length;
    const lines = [];
    let start = 0;
    let end = 0;
    let pos = 0;
    while (pos < n) {
      let ws = pos;
      while (ws < n && text[ws] === " ") ws++;
      if (ws >= n) break;
      let we = ws;
      while (we < n && text[we] !== " ") we++;

      if (measure(text.slice(start, we)) <= maxWidth) {
        end = pos = we;
      } else if (end > start) {
        lines.push([start, end]);
        start = end = pos = ws;
      } else {
        let k = start + 1;
        while (k < we && measure(text.slice(start, k + 1)) <= maxWidth) k++;
        lines.push([start, k]);
        start = end = pos = k;
      }
    }
    if (end > start || !lines.length) lines.push([start, end]);
    return lines;
  }

  /* ------------------------------------------------------------------ *
   * Audio
   * ------------------------------------------------------------------ */

  const audio = {
    ctx: null,
    buffers: new Map(), // url ("" = built-in) -> { buffer }

    context() {
      if (this.ctx) return this.ctx;
      if (!window.AudioContext) return null;
      // Browsers block sound until the visitor interacts with the page.
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return null;
      this.ctx = new AudioContext();
      return this.ctx;
    },

    buffer(ctx, url) {
      const key = url || "";
      let entry = this.buffers.get(key);
      if (!entry) {
        entry = { buffer: null };
        this.buffers.set(key, entry);
        const bytes = url
          ? fetch(url).then((r) => {
              if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
              return r.arrayBuffer();
            })
          : Promise.resolve(base64ToBuffer(BEEP_WAV));
        bytes
          .then((data) => ctx.decodeAudioData(data))
          .then((buffer) => (entry.buffer = buffer))
          .catch((err) => console.warn("trek-padd: could not load beep", url, err));
      }
      return entry.buffer;
    },

    play(url, volume) {
      const ctx = this.context();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const buffer = this.buffer(ctx, url);
      if (!buffer) return;
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      src.buffer = buffer;
      gain.gain.value = volume;
      src.connect(gain).connect(ctx.destination);
      src.start();
    },
  };

  function warmAudio() {
    const ctx = audio.context();
    if (!ctx) return;
    ctx.resume().catch(() => {});
    audio.buffer(ctx, "");
    removeEventListener("pointerup", warmAudio, true);
    removeEventListener("keydown", warmAudio, true);
  }
  addEventListener("pointerup", warmAudio, true);
  addEventListener("keydown", warmAudio, true);

  function base64ToBuffer(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  /* ------------------------------------------------------------------ *
   * Component
   * ------------------------------------------------------------------ */

  const TEMPLATE = document.createElement("template");
  TEMPLATE.innerHTML = `
<style>
  :host {
    display: block;
    height: 360px;
    background: var(--padd-bg, #000);
    color: var(--padd-light-blue, #9999FF);
    font-family: var(--padd-font, "Antonio", "Arial Narrow", sans-serif);
    font-size: var(--padd-font-size, 22px);
    font-weight: var(--padd-font-weight, 400);
    letter-spacing: var(--padd-letter-spacing, normal);
    line-height: var(--padd-line-height, 1.25);
    overflow: hidden;
  }
  :host([hidden]) { display: none; }
  :host(:focus-visible) { outline: 2px solid var(--padd-orange, #FF9900); outline-offset: 2px; }
  .frame {
    display: flex; flex-direction: column; gap: 8px;
    height: 100%; box-sizing: border-box;
    padding: var(--padd-padding, 12px 16px 10px);
  }
  .screen { flex: 1; min-height: 0; cursor: pointer; }
  .text { height: 100%; overflow: hidden; }
  .line { white-space: pre; overflow: hidden; }
  .pending { visibility: hidden; }
  .bar { display: flex; align-items: center; gap: 6px; font-size: 0.72em; line-height: 1; }
  .page { flex: 1; color: var(--padd-dark-blue, #9999CC); letter-spacing: 0.06em; white-space: nowrap; }
  button {
    font: inherit; letter-spacing: 0.06em; text-transform: uppercase;
    color: #000; border: 0; border-radius: 999px; padding: 0.45em 1.2em; cursor: pointer;
  }
  button:hover { filter: brightness(1.15); }
  button:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  .prev { background: var(--padd-light-purple, #CC99CC); }
  .prev:disabled { visibility: hidden; }
  .sound { background: var(--padd-light-blue, #9999FF); }
  .sound[aria-pressed="false"] { background: #444; color: #aaa; }
  .next { background: var(--padd-orange, #FF9900); min-width: 6.5em; }
  .next.ready { animation: ready 1.2s ease-in-out infinite alternate; }
  @keyframes ready { from { filter: brightness(0.7); } to { filter: brightness(1.2); } }
  @media (prefers-reduced-motion: reduce) { .next.ready { animation: none; } }
</style>
<div class="frame" part="frame">
  <div class="screen" part="screen"><div class="text" part="text"></div></div>
  <div class="bar" part="controls">
    <span class="page" part="page" aria-live="polite"></span>
    <button type="button" class="prev" part="button prev">Back</button>
    <button type="button" class="sound" part="button sound" aria-pressed="true">Audio</button>
    <button type="button" class="next" part="button next">Next</button>
  </div>
</div>`;

  const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pad2 = (n) => String(n).padStart(2, "0");

  class TrekPadd extends HTMLElement {
    static observedAttributes = ["src", "no-stardate", "muted", "hold"];

    #source = null; // raw marked-up text
    #paras = []; // parsed paragraphs
    #pages = []; // pages of { p, s, e, offset } lines
    #page = 0;
    #shown = 0; // lines revealed on the current page
    #anchor = 0; // char offset of the current page's first line (survives resize)
    #lineEls = [];
    #typeTimer = 0;
    #holdTimer = 0;
    #nextBeep = 0;
    #hover = false;
    #connected = false;
    #needsRestart = false;
    #layoutFrame = 0;
    #loadToken = 0;
    #resizeObserver = null;
    #canvas = null;
    $ = {};

    constructor() {
      super();
      const root = this.attachShadow({ mode: "open" });
      root.append(TEMPLATE.content.cloneNode(true));
      for (const key of ["text", "screen", "page", "prev", "sound", "next"]) {
        this.$[key] = root.querySelector(`.${key}`);
      }
      this.$.screen.addEventListener("click", () => this.next());
      this.$.next.addEventListener("click", () => this.next());
      this.$.prev.addEventListener("click", () => this.prev());
      this.$.sound.addEventListener("click", () => this.toggleAttribute("muted"));
      this.addEventListener("keydown", this.#onKey);
      this.addEventListener("pointerenter", () => {
        this.#hover = true;
        clearTimeout(this.#holdTimer);
      });
      this.addEventListener("pointerleave", () => {
        this.#hover = false;
        this.#scheduleHold();
      });
    }

    connectedCallback() {
      this.#connected = true;
      if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
      if (!this.hasAttribute("role")) this.setAttribute("role", "region");
      if (!this.hasAttribute("aria-label")) this.setAttribute("aria-label", "PADD display");
      this.#resizeObserver = new ResizeObserver(() => this.#scheduleLayout());
      this.#resizeObserver.observe(this.$.text);
      document.fonts?.addEventListener("loadingdone", this.#onFontsChanged);
      this.#syncSound();
      if (this.#source === null) this.#load();
      else this.#scheduleLayout();
    }

    disconnectedCallback() {
      this.#connected = false;
      this.#clearTimers();
      cancelAnimationFrame(this.#layoutFrame);
      this.#layoutFrame = 0;
      this.#resizeObserver?.disconnect();
      document.fonts?.removeEventListener("loadingdone", this.#onFontsChanged);
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue || !this.#connected) return;
      if (name === "src") this.#load();
      else if (name === "no-stardate") this.#build(true);
      else if (name === "muted") this.#syncSound();
      else if (name === "hold") this.#scheduleHold();
    }

    /* ---- public API ---- */

    /** The marked-up source text. Setting it restarts the display. */
    get text() {
      return this.#source ?? "";
    }
    set text(value) {
      this.#loadToken++;
      this.#source = String(value);
      this.#build(true);
    }

    get page() {
      return this.#page;
    }
    get pageCount() {
      return this.#pages.length;
    }

    /** Finish typing the current page, or advance (wrapping to the start). */
    next() {
      const lines = this.#pages[this.#page];
      if (!lines) return;
      if (this.#shown < lines.length) {
        clearTimeout(this.#typeTimer);
        this.#shown = lines.length;
        for (const el of this.#lineEls) el.classList.remove("pending");
        this.#complete();
        return;
      }
      this.#startPage((this.#page + 1) % this.#pages.length);
    }

    prev() {
      if (this.#page > 0) this.#startPage(this.#page - 1, true);
    }

    restart() {
      if (this.#pages.length) this.#startPage(0);
    }

    /* ---- loading & layout ---- */

    async #load() {
      const token = ++this.#loadToken;
      const src = this.getAttribute("src");
      let text;
      if (src) {
        try {
          const res = await fetch(src);
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
          text = await res.text();
        } catch (err) {
          text = loadError(src, err);
        }
      } else {
        // Inline text: wait for the parser to finish adding our children.
        if (document.readyState === "loading") {
          await new Promise((r) => document.addEventListener("DOMContentLoaded", r, { once: true }));
        }
        text = dedent(this.textContent);
      }
      if (token !== this.#loadToken) return;
      this.#source = text;
      this.#build(true);
    }

    #build(restart) {
      if (this.#source === null) return;
      const header = this.hasAttribute("no-stardate") ? "" : `STARDATE ${stardate()}\n\n`;
      this.#paras = parse(header + this.#source);
      this.#layout(restart);
    }

    #onFontsChanged = () => this.#scheduleLayout();

    #scheduleLayout() {
      if (this.#layoutFrame) return;
      this.#layoutFrame = requestAnimationFrame(() => {
        this.#layoutFrame = 0;
        this.#layout(false);
      });
    }

    #lineHeight() {
      const probe = document.createElement("div");
      probe.className = "line";
      probe.textContent = " ";
      this.$.text.append(probe);
      const h = probe.getBoundingClientRect().height;
      probe.remove();
      return h || 1;
    }

    #layout(restart) {
      restart ||= this.#needsRestart;
      const box = this.$.text;
      const width = box.clientWidth;
      const height = box.clientHeight;
      if (!width || !height || !this.#paras.length) {
        this.#needsRestart = restart; // retry when we become visible
        return;
      }
      this.#needsRestart = false;

      const style = getComputedStyle(box);
      const ctx = (this.#canvas ||= document.createElement("canvas")).getContext("2d");
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      if ("letterSpacing" in ctx) {
        ctx.letterSpacing = style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
      }
      const measure = (s) => ctx.measureText(s).width;
      const perPage = Math.max(1, Math.floor((height + 0.5) / this.#lineHeight()));

      const lines = [];
      let offset = 0;
      this.#paras.forEach((para, p) => {
        for (const [s, e] of wrap(para.text, width - 1, measure)) {
          lines.push({ p, s, e, offset: offset + s });
        }
        offset += para.text.length + 1;
      });

      const pages = [];
      let page = [];
      for (const line of lines) {
        if (!page.length && pages.length && line.s === line.e) continue; // no blank page tops
        page.push(line);
        if (page.length === perPage) {
          pages.push(page);
          page = [];
        }
      }
      if (page.length) pages.push(page);

      const wasComplete = this.#isComplete();
      const shown = this.#shown;
      this.#pages = pages;
      if (restart) {
        this.#startPage(0);
        return;
      }

      // Re-flow (resize / font load): stay on the page holding the same text.
      let index = 0;
      pages.forEach((pg, i) => {
        if (pg[0].offset <= this.#anchor) index = i;
      });
      this.#page = index;
      this.#shown = wasComplete ? pages[index].length : Math.min(shown, pages[index].length);
      this.#renderPage();
      this.#updateBar();
    }

    /* ---- paging ---- */

    #isComplete() {
      const lines = this.#pages[this.#page];
      return !!lines && this.#shown >= lines.length;
    }

    #renderPage() {
      const lines = this.#pages[this.#page];
      this.#lineEls = lines.map((line, i) => {
        const div = document.createElement("div");
        div.className = i < this.#shown ? "line" : "line pending";
        if (line.e > line.s) appendRuns(div, this.#paras[line.p], line.s, line.e);
        else div.textContent = " ";
        return div;
      });
      this.$.text.replaceChildren(...this.#lineEls);
    }

    #startPage(index, instant = false) {
      this.#clearTimers();
      this.#page = index;
      const lines = this.#pages[index];
      this.#anchor = lines[0].offset;
      const skip = instant || reducedMotion();
      this.#shown = skip ? lines.length : 0;
      this.#renderPage();
      this.$.next.classList.remove("ready");
      this.#updateBar();
      if (skip) this.#complete();
      else this.#typeTimer = setTimeout(this.#tick, this.#num("line-delay", TIMING.lineDelayMs));
    }

    #tick = () => {
      this.#typeTimer = 0;
      const lines = this.#pages[this.#page];
      if (this.#shown < lines.length) {
        this.#lineEls[this.#shown]?.classList.remove("pending");
        this.#shown++;
        this.#beep();
      }
      if (this.#shown < lines.length) {
        this.#typeTimer = setTimeout(this.#tick, this.#num("line-delay", TIMING.lineDelayMs));
      } else {
        this.#complete();
      }
    };

    #complete() {
      this.$.next.classList.add("ready");
      this.#scheduleHold();
      this.dispatchEvent(
        new CustomEvent("pagecomplete", { detail: { page: this.#page, pageCount: this.#pages.length } }),
      );
    }

    /** Auto-advance after `hold` seconds (0 = manual only). Paused while hovered. */
    #scheduleHold() {
      clearTimeout(this.#holdTimer);
      const hold = this.#num("hold", TIMING.pageHoldS);
      if (hold > 0 && !this.#hover && this.#isComplete()) {
        this.#holdTimer = setTimeout(() => this.next(), hold * 1000);
      }
    }

    #clearTimers() {
      clearTimeout(this.#typeTimer);
      clearTimeout(this.#holdTimer);
      this.#typeTimer = this.#holdTimer = 0;
    }

    #updateBar() {
      const count = this.#pages.length;
      this.$.page.textContent = count ? `PAGE ${pad2(this.#page + 1)} / ${pad2(count)}` : "";
      this.$.prev.disabled = this.#page === 0;
      this.$.next.textContent = this.#page === count - 1 ? "Restart" : "Next";
    }

    #onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.composedPath()[0] instanceof HTMLButtonElement) return; // buttons handle themselves
      if (["ArrowRight", "PageDown", " ", "Enter"].includes(e.key)) {
        e.preventDefault();
        this.next();
      } else if (["ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        this.prev();
      } else if (e.key === "Home") {
        e.preventDefault();
        this.restart();
      }
    };

    /* ---- sound ---- */

    #beep() {
      const now = performance.now();
      if (now < this.#nextBeep) return;
      this.#nextBeep = now + TIMING.beepIntervalMs;
      if (this.hasAttribute("muted") || document.hidden) return;
      audio.play(this.getAttribute("beep"), Math.min(1, this.#num("volume", 0.5)));
    }

    #syncSound() {
      this.$.sound.setAttribute("aria-pressed", String(!this.hasAttribute("muted")));
    }

    #num(name, fallback) {
      const value = parseFloat(this.getAttribute(name));
      return Number.isFinite(value) && value >= 0 ? value : fallback;
    }
  }

  function loadError(src, err) {
    const hint =
      location.protocol === "file:"
        ? "PAGES OPENED DIRECTLY FROM DISK CANNOT READ OTHER FILES. SERVE THIS FOLDER OVER HTTP, FOR EXAMPLE WITH ##ypython -m http.server"
        : String(err?.message || err).toUpperCase();
    return `##rERROR ##o- UNABLE TO ACCESS FILE ##y${src}\n\n##b${hint}`;
  }

  // Original tBeep.au (8-bit mu-law, 22.05 kHz stereo), converted to 16-bit PCM WAV.
  const BEEP_WAV = "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/P78/vz+AAD8/gAA/P78/gAA/P4AAPz+AAAAAAAAAAAAAPz+/P4AAAAAAAD8/vT9AADk+wQBAAAEAQwDAAAAAPz+AAD0/QAA/P4AAPz+/P78/vT9AAD0/AQBAAAEAQAAAAAAAAAA5PsAAPz+BAEAAAQB9PwAAOT6BAH0/QwCAAAMAgAAAAD8/vz+AAAAAPz+AAAAAAAA9P0AAPT8AAD0/QQB/P4EAfT9BAH8/gQBBAEAAPz+AADk+wAA5PsEAfz+DAL8/gQB9P0EAQAABAEAAAAAAAD8/vz+/P78/gAA9P0AAPT9AAD0/QQB9PwEAQAABAH8/gQB/P4EAfT8BAH0/AQB9PwMAuT6DAL0/QwDAAAMAgQBBAEAAPz+9P38/vT8AAD8/gQB/P4EAfT8BAH0/QQB/P4EAfT9BAH0/QQB/P4EAfT9BAH0/AQB5PoMAvT9DAMAAAwCAAAEAfT9AAD0/AQBBAEEAQAAAAD0/fz+9PwAAPz+BAH0/AQB9P0EAfT9BAH8/gwCAAAEAQAAAADk+wAA5PoEAfz+DAIAAAwC/P4EAQAAAAAAAAAAAAAAAPT9AAAAAAAAAAD8/vT8/P7k+wQB/P4MAgAABAEAAAAA5PsAAPT8BAH8/gwCAAAEAeT7AADk+gwCAAAMAgAABAEAAAAAAAD8/gAAAAAAAAAA9PwAAPz+AAD0/AQB9P0EAfz+BAEAAAQBAAAAAAAAAAD0/QAA5PsEAfT8DAIAAAwCAAAEAQAAAAAEAfz+DAL0/QAA9P38/vT99P38/gAAAAAAAAAA9P0AAAAAAAAMAgAAAAD8/vT9/P70/AAA9P0EAfT9BAH8/gQBAAAAAAAAAAAAAAAADAL8/gQB9P30/PT99Pz8/uT7BAEAAAwCBAEEAQQB/P4AAPz+9P38/vT9AAD8/gAA9PwAAPT8BAEAAAwCHAQAAAwD9P38/vT8/P70/QAA/P4AAPz+AAD8/gAA/P4EAfz+BAH0/QAA9P38/vz+BAH8/gAA/P78/vz+AAD8/gAAAAAAAAAAAAAAAAwC/P4MA/T9AAD0/AAA9P0AAPz+AAD8/gAA/P78/vz+AAAAAAwC/P4EAfT9/P70/fT8/P4AAAAA9P0AAAAAAAAAAAAADAP8/gQB9P0AAPT9AAD0/QAA/P4AAPz+AAD8/gQB/P4EAfz+DAL0/fz+9P3k+/z+AAAEAQAAAAAAAPz+/P78/gAAAAAEAfz+AAD0/fz+/P4AAAAAHAT8/hwE9PwEAeT79P30/AAA9P0AAPz+9P0AAAwCAAAcBPz+AAD0/PT89P3k+wAA/P4EAQAABAEEAfz+BAH8/gAA/P4MAvT9AAD0/QAA9P0AAPT9AAD8/vT9/P70/QAAAAAAAPz+AAD8/gQBAAAEAQAAAAD8/vz+5PgAAOT7DAIMAgwDHAUAAAQB9PwAAPT8BAH0/QAA9P0EAfz+AAD0/QAA9PwcBPT9DAIAAPz+9Pz0/eT5xPUAAATvPAz8GhwGfDoE7wToBOiEmhwExPZ8IHxp/A98LATphM2E3wTnxPbk+jwPhNn8FPwSPAx8YcTyPAgE4YSGxPSEz/wbfFH8Hnw05PkE5ATkBO/E8MT0PAiEyfwVAAD8FHxt9Px8MITfhJoE5YS2PA98NnwgfDgcB8T1BOocBQTqAADk+YS6PA0E4vwXfGU8CXxJBOaEroTfhKYcBfwefCB8MPwQDAPE8fwYBOc8DwTuhLYEAYTF/BZ8VfwSfF0E74TNhNuEqsT3PAn8GHwg/BUEAfT9fCQE7fwdBOqEsuT5hKb8F3w8/B58ceT7xPOE24SyBOrE9TwNPA38FuT4PAh8KsT1fDwE6ITJBO2EljwM/Bd8IHxtPAk8DATkhMEE5ATsDAPk+PwWBOj8E3wsDAJ8VQTqBOEE44SKAADk+XwgfGX8E3wkBOyE2YTfxPHE9ATtPA2E0fwVfCA8DnxtxPEAAITdhIrE8YTX/Bp8SfwdfCjk+wTwBOUcBQTuxPAEAYTB/A88CPwSfG3k+3wghN+EmgTohMP8D3w0fCB8KhwG9P0E7PwPBOrE9cT3hK48DQTn/Bt8ZTwMfDwE6YS2BOOEuhwE/Bn8G/wdPA8MAsT1fCAE7DwJBPCEsgQBhM38F3xN/BN8TcTxhNME4YS+5PgcBfwUPA78Evz+BAF8KMTy/BwE7YS6xPeEuvwRfDT8GHxV5PvE8QTjhMsE7uT6PAn8/vwRxPY8CXwo5Pl8LgTthM3E8ISuPAr8F/wafEk8CAwDBOyE2QTtxPQMAsTx/A8E6TwPfCYcBHxBxPAE5gTqhK78/vT9/BV8OjwPPA3E9AToBO78/uT7xPA8CITdPA78FTwJfEHE9+T4BOuEtuT4BO38EXws/BL8E/T85PoE8DwIxPPE8fz+hNM8ChwGPA18Qfz+PA0E7oTFxPIE5TwJ/Br8EDwOHAQAAMT1/A/E88T25PmEyxwHxPf8D3w8HAb8HMTwhNUE7gTiBAE8DTwOHAccBwwC5Pv8FsT1BAHE9oTRAAAE5zwOfCo8DHwi5PgE6gTwBOPk+gAAPAr8/jwLAAAMA/wc5Pk8DsTzhNnk+YTfPAn8HjwMfCb0/MT1xPAE6cT29PwcBcT3PArk+RwG/Bz0/fwXxPUE5MT1hNkcBDwMPAz8HRwE/P7E9sT2xPYMAvT9xPYMA8TzHAX8FwAAfCDE9gTvxPKE2fT9AAA8C/wYPAgcBuT69PzE9gQB5PrE8QwCBOwcBzwOHAb8HOT75PjE9QTi9Pz0/BwH/BMcBhwG5Pv0/cT3HAXk+sT3/P4E6hwEAAAcB/wXDAIcBeT5BOzk+sT2DAMcBxwGAAAMAuT79P08CPT9AAD0/QTvAAD0/BwE/BMMAjwL5PnE9cT3xPX0/QAAHAQMAwwCAAD0/QAA9P30/QAA9PwEAfz+BAEAAAQBAAAAAPz+AAD0/QAA9PwEAQQBBAEEAfz+AAA=";

  window.TrekPadd = Object.freeze({ COLORS, TIMING, stardate, parse, toFragment, dedent, Element: TrekPadd });
  if (!customElements.get("trek-padd")) customElements.define("trek-padd", TrekPadd);
})();
