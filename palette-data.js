/*
 * LCARS colors: the one source for every color name in TrekText.
 *
 * Used directly by picks.html, palette.html and the builder. Run
 * `python tools/build_palette.py` after editing to regenerate
 * lcars/palette.css and the color list inside trek-padd.js.
 *
 * Values are fan-sampled from screen captures; LCARS colors were never published.
 */
(() => {
  const TREKCOLORS = '<a href="https://github.com/leonawicz/trekcolors">trekcolors</a>';
  const THELCARS = '<a href="https://www.thelcars.com/colors.php">thelcars.com</a>';

  /** [name, hex] grouped by source palette. A name always means one color. */
  const ERAS = [
    {
      title: "LCARS 2369: TNG and early DS9",
      src: `${TREKCOLORS}, palette "lcars_2369". The original 2002 TrekText applet used eight of these.`,
      colors: [
        ["blue-bell", "#9999CC"], ["melrose", "#9999FF"], ["lilac", "#CC99CC"], ["hopbush", "#CC6699"],
        ["chestnut-rose", "#CC6666"], ["orange-peel", "#FF9966"], ["atomic-tangerine", "#FF9900"],
        ["tanoi", "#FFCC99"], ["golden-tanoi", "#FFCC66"],
      ],
    },
    {
      title: "LCARS 2357: early TNG",
      src: `${TREKCOLORS}, palette "lcars_2357".`,
      colors: [
        ["pale-canary", "#FFFF99"], ["tanoi", "#FFCC99"], ["golden-tanoi", "#FFCC66"], ["neon-carrot", "#FF9933"],
        ["eggplant", "#664466"], ["lilac", "#CC99CC"], ["anakiwa", "#99CCFF"], ["mariner", "#3366CC"],
        ["bahama-blue", "#006699"],
      ],
    },
    {
      title: "LCARS 2375: late DS9 and VOY",
      src: `${TREKCOLORS}, palette "lcars_2375".`,
      colors: [
        ["danub", "#6688CC"], ["indigo", "#4455BB"], ["lavender-purple", "#9977AA"], ["cosmic", "#774466"],
        ["red-damask", "#DD6644"], ["medium-carmine", "#AA5533"], ["bourbon", "#BB6622"], ["sandy-brown", "#EE9955"],
      ],
    },
    {
      title: "Voyager",
      src: `${THELCARS}, "Voyager" theme.`,
      colors: [
        ["andorian-blue", "#55A7FF"], ["autumn-leaves", "#FB9004"], ["command-gold", "#FFBB33"], ["flat-dark-earth", "#CC9966"],
        ["frost", "#99CCFF"], ["frozen-pond", "#E6F2FF"], ["green-apple", "#94B300"], ["luna", "#BEC2CF"],
        ["pewter", "#74788B"], ["pumpkin-seed", "#FFE1CA"], ["red-alert", "#FF3300"], ["rust", "#994400"],
        ["salmon", "#E98181"], ["science-blue", "#2288FF"], ["silver", "#828CAD"], ["sky", "#70B5FF"], ["smoke", "#585A68"],
      ],
    },
    {
      title: "First Contact (1996)",
      src: `${TREKCOLORS}, palette "lcars_first_contact". The Enterprise-E's muted, earthier look.`,
      colors: [
        ["fc-mauve", "#C198B0"], ["fc-terracotta", "#B46757"], ["fc-rose", "#AE697D"], ["fc-plum", "#97567B"],
        ["fc-amber", "#C67825"], ["fc-tan", "#B28452"], ["fc-olive", "#C2B74B"], ["fc-lavender", "#BEBCDF"],
      ],
    },
    {
      title: "LCARS 2379: Nemesis",
      src: `${TREKCOLORS}, palettes "lcars_2379" and "lcars_nemesis". The film's blue-heavy look.`,
      colors: [
        ["periwinkle", "#CCDDFF"], ["dodger-pale", "#5599FF"], ["dodger-soft", "#3366FF"], ["near-blue", "#0011EE"],
        ["navy-blue", "#000088"], ["husk", "#BBAA55"], ["nemesis-rust", "#BB4411"], ["tamarillo", "#882211"],
        ["nemesis-blue", "#3786FF"], ["nemesis-sky", "#4BB0FF"], ["nemesis-ice", "#87EEFF"], ["nemesis-orange", "#D45F10"],
        ["nemesis-sand", "#DFAF71"],
      ],
    },
    {
      title: "Nemesis Blue",
      src: `${THELCARS}, "Nemesis Blue" theme.`,
      colors: [
        ["ghost", "#88BBFF"], ["cool", "#6699FF"], ["evening", "#2266FF"], ["midnight", "#0048F0"], ["moonbeam", "#EBF0FF"],
        ["honey", "#FFCC99"], ["tangerine", "#FF8833"], ["washed-pumpkin", "#FF7744"], ["pumpkin", "#E63D00"],
        ["cardinal", "#DA2537"], ["red-copper", "#CC6666"], ["martian", "#99CC33"], ["sand", "#D29270"], ["wheat", "#D1A16C"],
      ],
    },
    {
      title: "Alert conditions",
      src: `${TREKCOLORS}, palettes "red_alert" and "yellow_alert".`,
      colors: [
        ["red-alert-1", "#CD0000"], ["red-alert-2", "#FE0000"], ["red-alert-pale", "#FF9190"],
        ["yellow-alert-1", "#CD870E"], ["yellow-alert-2", "#FFA90E"], ["yellow-alert-pale", "#FFDA67"],
      ],
    },
  ];

  /** The colors chosen for TrekText: the builder's default set. */
  const PICKS = [
    "blue-bell", "melrose", "lilac", "hopbush", "chestnut-rose", "atomic-tangerine",
    "golden-tanoi", "tanoi", "indigo", "cosmic", "bourbon", "sandy-brown", "frozen-pond",
    "green-apple", "silver", "andorian-blue", "pewter", "red-alert-2", "yellow-alert-2",
    "cardinal", "tangerine", "red-damask", "flat-dark-earth", "nemesis-blue", "ghost", "lavender-purple",
  ];

  /* ------------------------------------------------------------------ *
   * Grouping by color family (lightest first within each family)
   * ------------------------------------------------------------------ */

  const GROUPS = [
    ["red", "Reds"], ["orange", "Oranges"], ["tan", "Tans and peaches"], ["brown", "Browns and rust"],
    ["gold", "Golds and yellows"], ["green", "Greens"], ["sky", "Sky and electric blues"],
    ["periwinkle", "Periwinkles and indigos"], ["purple", "Purples and mauves"],
    ["grey", "Greys"], ["white", "Whites and ices"],
  ];
  // A few colors read differently to the eye than their numbers suggest.
  const OVERRIDES = { eggplant: "purple", "red-alert": "red", silver: "grey" };

  function hsl(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    let h = 0;
    if (d) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    return { h, s, l, max, chroma: d };
  }

  function family(names, hex) {
    for (const n of names) if (OVERRIDES[n]) return OVERRIDES[n];
    const { h, s, l, max, chroma } = hsl(hex);
    if (l > 0.88) return "white";
    if (s < 0.22) return "grey";
    if (h < 12 || h >= 345) return "red";
    if (h < 40) {
      if (max < 0.75) return "brown";
      if (chroma < 0.45 && l > 0.55) return "tan";
      return "orange";
    }
    if (h < 70) return "gold";
    if (h < 170) return "green";
    if (h < 228) return "sky";
    if (h < 285) return "periwinkle";
    return "purple";
  }

  /**
   * Every distinct color: { hex, name (the first name seen), names, sources,
   * family, light, picked }, sorted by family and then lightest first.
   */
  function allColors() {
    const byHex = new Map();
    for (const era of ERAS) {
      for (const [name, hex] of era.colors) {
        const key = hex.toUpperCase();
        if (!byHex.has(key)) byHex.set(key, { hex: key, names: [], sources: [] });
        const c = byHex.get(key);
        if (!c.names.includes(name)) c.names.push(name);
        if (!c.sources.includes(era.title)) c.sources.push(era.title);
      }
    }
    const order = new Map(GROUPS.map(([key], i) => [key, i]));
    return [...byHex.values()]
      .map((c) => ({
        ...c,
        name: c.names[0],
        family: family(c.names, c.hex),
        light: hsl(c.hex).l,
        picked: c.names.some((n) => PICKS.includes(n)),
      }))
      .sort((a, b) => order.get(a.family) - order.get(b.family) || b.light - a.light);
  }

  window.LCARS_PALETTES = Object.freeze({ ERAS, PICKS, GROUPS, hsl, family, allColors });
})();
