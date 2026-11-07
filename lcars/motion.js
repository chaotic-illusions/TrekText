/*
 * LCARS motion helpers, for the effects in motion.css that need a script:
 *
 *   power-up    elements with an m-in-* class draw on in reading order when
 *               the page loads, if the page (or a container) has data-boot.
 *               LcarsMotion.boot(root) replays it.
 *   readouts    .m-readout numbers update on their own.
 *   meters      <div class="m-meter m-comet" data-segments="12"> gets its
 *               segments written for it. LcarsMotion.meter(el, n) does it by hand.
 *   press flash .m-press elements flare when pressed.
 *   alerts      LcarsMotion.alert("red" | "yellow" | "blue" | null, {sound})
 *               sets the condition on the page; red sounds a klaxon if asked.
 *
 * A plain script (not a module), so pages work when opened from disk.
 */
(() => {
  "use strict";

  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const IN = ".m-in-key, .m-in-wipe-r, .m-in-wipe-l, .m-in-wipe-d, .m-in-wipe-u, .m-in-grow";

  /* ---------------- power-up ---------------- */

  /** Number the entrance elements top to bottom, then left to right, and run them. */
  function boot(root = document.documentElement, { step, delay } = {}) {
    const els = [...root.querySelectorAll(IN)];
    const rows = els.map((el) => {
      const r = el.getBoundingClientRect();
      return { el, top: Math.round(r.top / 12), left: r.left };
    });
    rows.sort((a, b) => a.top - b.top || a.left - b.left);
    rows.forEach(({ el }, i) => el.style.setProperty("--boot-i", i));
    if (step != null) root.style.setProperty("--boot-step", `${step}ms`);
    if (delay != null) root.style.setProperty("--boot-delay", `${delay}ms`);
    root.classList.remove("m-booting");
    void root.offsetWidth; // restart the animations
    root.classList.add("m-booting");
  }

  /* ---------------- segment meters ---------------- */

  function meter(el, n = Number(el.dataset.segments) || 10) {
    n = Math.max(2, Math.min(80, Math.round(n)));
    const mid = (n - 1) / 2;
    el.style.setProperty("--n", n);
    el.innerHTML = Array.from({ length: n }, (_, i) =>
      `<i style="--i:${i};--d:${Math.round(Math.abs(i - mid))}"></i>`).join("");
  }

  /* ---------------- readouts ---------------- */

  const ticking = new WeakSet();

  function digits(len) {
    let s = "";
    for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
    return s;
  }

  /** Keep a readout's number groups changing. Groups are its <span>s (made from its words if it has none). */
  function readout(el) {
    if (ticking.has(el)) return;
    ticking.add(el);
    if (!el.querySelector("span")) {
      el.innerHTML = el.textContent.trim().split(/\s+/).map((w) => `<span>${w}</span>`).join(" ");
    }
    const groups = [...el.querySelectorAll("span")].filter((s) => /\d/.test(s.textContent));
    if (!groups.length) return;
    const tick = () => {
      if (!el.isConnected) return;
      if (!reduced() && !el.closest(".m-still") && !document.hidden) {
        const g = groups[Math.floor(Math.random() * groups.length)];
        g.textContent = g.textContent.replace(/\d+/g, (m) => digits(m.length));
        if (Math.random() < 0.18) {
          g.classList.add("hot");
          setTimeout(() => g.classList.remove("hot"), 500 + Math.random() * 700);
        }
      }
      setTimeout(tick, (90 + Math.random() * 380) * (Number(getComputedStyle(el).getPropertyValue("--m-rate")) || 1));
    };
    tick();
  }

  /* ---------------- press flash ---------------- */

  document.addEventListener("pointerdown", (e) => {
    const el = e.target.closest?.(".m-press");
    if (!el || reduced()) return;
    el.classList.remove("m-flashing");
    void el.offsetWidth;
    el.classList.add("m-flashing");
    clearTimeout(el._mFlash);
    el._mFlash = setTimeout(() => el.classList.remove("m-flashing"), 400);
  });

  /* ---------------- alert conditions ---------------- */

  let audio, klaxonTimer, current = null;

  /** A rising two-stage whoop, made with oscillators (no sound file needed). */
  function whoop(ctx, t) {
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.18, t + 0.06);
    out.gain.setValueAtTime(0.18, t + 0.62);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 1700;
    tone.connect(out).connect(ctx.destination);
    for (const [type, detune] of [["sawtooth", 0], ["square", 7]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = detune;
      o.frequency.setValueAtTime(330, t);
      o.frequency.exponentialRampToValueAtTime(760, t + 0.7);
      o.connect(tone);
      o.start(t);
      o.stop(t + 0.82);
    }
  }

  /** Two short tones, for yellow and blue alerts. */
  function chirp(ctx, t, freqs) {
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const at = t + i * 0.16;
      o.type = "triangle";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.2, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
      o.connect(g).connect(ctx.destination);
      o.start(at);
      o.stop(at + 0.15);
    });
  }

  function stopSound() {
    clearInterval(klaxonTimer);
    klaxonTimer = null;
  }

  /**
   * Set the alert condition on root (default: the whole page). null clears it.
   * sound: true plays the alert's sound (a repeating klaxon for red). Browsers only
   * allow sound after the visitor has clicked or pressed a key.
   */
  function alert(level, { root = document.documentElement, sound = false, repeat = 4 } = {}) {
    stopSound();
    current = level || null;
    if (current) root.dataset.alert = current;
    else delete root.dataset.alert;
    if (!current || !sound) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      audio.resume();
    } catch {
      return;
    }
    if (current === "red") {
      let left = repeat;
      const go = () => {
        whoop(audio, audio.currentTime + 0.02);
        if (--left <= 0 && repeat > 0) stopSound();
      };
      go();
      klaxonTimer = setInterval(go, 1350);
    } else {
      chirp(audio, audio.currentTime + 0.02, current === "yellow" ? [880, 660] : [520, 780]);
    }
  }

  /* ---------------- start up ---------------- */

  function init(root = document) {
    root.querySelectorAll(".m-meter[data-segments]").forEach((el) => meter(el));
    root.querySelectorAll(".m-readout").forEach(readout);
    const boots = root.querySelectorAll("[data-boot]");
    boots.forEach((el) => boot(el));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => init());
  else init();

  window.LcarsMotion = { boot, meter, readout, alert, init, get alertLevel() { return current; } };
})();
