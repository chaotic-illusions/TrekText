# TrekText

An LCARS-style PADD text display for the web, inspired by the computer displays in *Star Trek: The Next Generation*. Text types onto a black screen one line at a time, with a computer beep and color codes for each word or letter.

TrekText began in 2002 as a Java applet. This is a rebuild as a single, dependency-free [web component](https://developer.mozilla.org/en-US/docs/Web/API/Web_components) that runs in any modern browser. It needs no plugins or build step. The timing, colors and beep were recovered from the original compiled applet.

**[Demo](index.html)** · **[Font specimens](fonts.html)** · **[Motion review](motion.html)**

## Quick start

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Antonio&display=swap">
<script src="trek-padd.js"></script>

<trek-padd src="trek.txt" style="height: 400px"></trek-padd>
```

You can also put the text inline, which works even when a page is opened straight from disk:

```html
<trek-padd>
  <script type="text/plain">
    ##{lilac}SUBSPACE COMMUNICATIONS OPEN - ##{tanoi}DOWNLOADING FILE
    ##{melrose}WELCOME ABOARD.
  </script>
</trek-padd>
```

Browsers won't let a page opened from disk (`file://`) fetch other files, so `src="..."` needs the folder to be served over HTTP. For example:

```sh
python -m http.server
# then open http://localhost:8000
```

## Color codes

`##{name}` switches the color until the next code. For example, `##{chestnut-rose}RED ALERT ##{melrose}ALL HANDS` shows "RED ALERT" in chestnut rose and the rest in melrose.

- `##{}` goes back to the default color, melrose (`#9999FF`).
- `##{#RRGGBB}` uses any hex color.
- An unknown name is ignored.

Any of the 78 LCARS colors in [`palette-data.js`](palette-data.js) can be used by name. **[picks.html](picks.html)** shows them all grouped by color family, with the 26 colors picked for TrekText highlighted:

| Family | Picks |
|---|---|
| Reds | `red-alert-2`, `cardinal`, `chestnut-rose`, `red-damask` |
| Oranges | `tangerine`, `atomic-tangerine`, `yellow-alert-2`, `sandy-brown` |
| Browns and tans | `bourbon`, `flat-dark-earth`, `tanoi`, `golden-tanoi` |
| Green | `green-apple` |
| Blues | `frozen-pond`, `ghost`, `andorian-blue`, `nemesis-blue`, `melrose`, `blue-bell`, `indigo` |
| Purples | `lilac`, `lavender-purple`, `hopbush`, `cosmic` |
| Greys | `silver`, `pewter` |

A page can restyle any color with its CSS variable, `--lcars-<name>`.

### Converting old text files

The original applet used one-letter codes (`##r`, `##b`, …). To convert old files to color names:

```sh
python tools/convert_codes.py --dry-run path/to/folder   # list what would change
python tools/convert_codes.py path/to/folder             # convert every .txt, keeping .bak copies
```

| Old | New | Old | New |
|---|---|---|---|
| `##r` | `##{chestnut-rose}` | `##b` | `##{melrose}` |
| `##o` | `##{sandy-brown}` | `##B` | `##{blue-bell}` |
| `##O` | `##{atomic-tangerine}` | `##p` | `##{lilac}` |
| `##y` | `##{tanoi}` | `##P` | `##{hopbush}` |

`##o` was orange peel (`#FF9966`), which isn't a pick, so it becomes sandy brown, the closest picked color.

### Changing the palette

Colors are defined once, in `palette-data.js`. After editing it, run `python tools/build_palette.py` to regenerate `lcars/palette.css` and the color list inside `trek-padd.js`.

## Behavior

- Lines appear every 65 ms. The beep is limited to one every 96 ms, so it plays on about every other line.
- When a page is full, **Next** (or a click or tap on the screen) moves on. If nothing is clicked, the page advances on its own after 16 seconds. The countdown pauses while the pointer is over the display. On the last page, **Restart** goes back to the beginning.
- Clicking **Next** while a page is still typing finishes the page right away.
- Keyboard: <kbd>→</kbd>, <kbd>Space</kbd>, <kbd>Enter</kbd> or <kbd>PgDn</kbd> go to the next page. <kbd>←</kbd> or <kbd>PgUp</kbd> go back, and <kbd>Home</kbd> restarts.
- Browsers block sound until the visitor interacts with the page, so the beep starts after the first click or key press.
- With *reduced motion* turned on in the operating system, each page appears all at once.

### Stardates

A stardate header is shown at the top of the text. TNG's convention is that 2364 began at stardate 41000.0 and each year adds 1000. Extending that backwards and letting the five-digit counter roll over (99999.9 → 00000.0) means the counter last reset on **January 1, 2023**. Partway through 2026 the stardate is in the 03xxx range.

Each whole stardate unit is 1/1000 of a year (about 8.76 hours), and each tenth is about 52.6 minutes. The header updates on screen whenever the last digit changes.

```js
TrekPadd.stardate(new Date(2364, 0, 1)); // "41000.0"
TrekPadd.stardate();                     // today, e.g. "03847.8"
```

## Attributes

| Attribute | Default | Description |
|---|---|---|
| `src` | | URL of a text file. If it's missing, the element's inline text is used. |
| `hold` | `16` | Seconds before a finished page advances by itself. `0` means it only advances when clicked. |
| `line-delay` | `65` | Milliseconds between lines. |
| `muted` | | Starts with sound off. The **Audio** button toggles it. |
| `volume` | `0.5` | Beep volume, from 0 to 1. |
| `beep` | built-in | URL of a different sound file. |
| `no-stardate` | | Leaves out the stardate header. |
| `color` | `melrose` | Text color before any code, as a color name or `#RRGGBB`. `##{}` returns to it. |

## Styling

Size the element like any block element (`width`, `height`). Its appearance is controlled by CSS custom properties:

```css
trek-padd {
  height: 420px;
  --padd-font: "Helvetica Ultra Compressed", "Antonio", sans-serif;
  --padd-font-size: 26px;
  --padd-font-weight: 400;
  --padd-line-height: 1.1;
  --padd-bg: #000;
  --padd-padding: 12px 16px 10px;
  --lcars-atomic-tangerine: #FF9900;  /* restyle any color by name */
}
```

### Fonts

TrekText uses **Helvetica Ultra Compressed**, the face Michael Okuda used for TNG's LCARS displays, when it's available. That font is commercial, so it isn't included here. To use it, install your own licensed copy, or place it in `fonts/` (which git ignores). The demo pages' `site.css` shows the `@font-face` rule to use. Without it, the display falls back to [Antonio](https://fonts.google.com/specimen/Antonio), a free Google font. [fonts.html](fonts.html) compares several free alternatives.

You can also style the internals with `::part()`, using `frame`, `screen`, `text`, `controls`, `page` and `button` (plus `prev`, `sound` and `next`).

## JavaScript API

```js
const padd = document.querySelector("trek-padd");
padd.text = "##{red-alert-2}PRIORITY ONE MESSAGE"; // replace the text and restart
padd.next(); padd.prev(); padd.restart();
padd.page; padd.pageCount;
padd.addEventListener("pagecomplete", (e) => console.log(e.detail));
```

`window.TrekPadd` also exposes `NAMED` (every color name and its hex value), `TIMING`, `stardate()`, `parse()` and `toFragment()` (renders marked-up text without animation).

## History

The original *TrekText* applet (v1.44, 2002–2003) ran on the author's site *Crymson's Illusion*. It was built on a small Java game toolkit from a Northern Arizona University course, which isn't included here. Its source code was lost, so the behavior was recovered by decompiling the surviving `.jar`. [`trek.txt`](trek.txt) is the applet's original text file.

---

*Star Trek* and related marks are trademarks of CBS Studios Inc. This is an unofficial fan project and is not affiliated with or endorsed by CBS or Paramount.
