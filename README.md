# TrekText

An LCARS-style PADD text display for the web, inspired by the computer displays in *Star Trek: The Next Generation*. Text types onto a black screen one line at a time, with a computer beep and color codes for each word or letter.

TrekText began in 2002 as a Java applet. This is a rebuild as a single, dependency-free [web component](https://developer.mozilla.org/en-US/docs/Web/API/Web_components) that runs in any modern browser. It needs no plugins or build step. The timing, colors and beep were recovered from the original compiled applet.

**[Demo](index.html)** · **[Font specimens](fonts.html)**

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
    ##pSUBSPACE COMMUNICATIONS OPEN - ##yDOWNLOADING FILE
    ##bWELCOME ABOARD.
  </script>
</trek-padd>
```

Browsers won't let a page opened from disk (`file://`) fetch other files, so `src="..."` needs the folder to be served over HTTP. For example:

```sh
python -m http.server
# then open http://localhost:8000
```

## Color codes

`##` followed by a letter switches the color until the next code. Lowercase letters are the light shade and uppercase letters the dark shade.

| Code | Color | Hex | CSS variable |
|---|---|---|---|
| `##r` | Red | `#CC6666` | `--padd-red` |
| `##o` | Light orange | `#FF9966` | `--padd-light-orange` |
| `##O` | Orange | `#FF9900` | `--padd-orange` |
| `##y` | Yellow | `#FFCC99` | `--padd-yellow` |
| `##b` | Light blue *(default)* | `#9999FF` | `--padd-light-blue` |
| `##B` | Dark blue | `#9999CC` | `--padd-dark-blue` |
| `##p` | Light purple | `#CC99CC` | `--padd-light-purple` |
| `##P` | Dark purple | `#CC6699` | `--padd-dark-purple` |

Unknown codes are ignored, which matches the original applet.

## Behavior

- Lines appear every 65 ms. The beep is limited to one every 96 ms, so it plays on about every other line.
- When a page is full, **Next** (or a click or tap on the screen) moves on. If nothing is clicked, the page advances on its own after 16 seconds. The countdown pauses while the pointer is over the display. On the last page, **Restart** goes back to the beginning.
- Clicking **Next** while a page is still typing finishes the page right away.
- Keyboard: <kbd>→</kbd>, <kbd>Space</kbd>, <kbd>Enter</kbd> or <kbd>PgDn</kbd> go to the next page. <kbd>←</kbd> or <kbd>PgUp</kbd> go back, and <kbd>Home</kbd> restarts.
- Browsers block sound until the visitor interacts with the page, so the beep starts after the first click or key press.
- With *reduced motion* turned on in the operating system, each page appears all at once.

### Stardates

A stardate header is shown at the top of the text. TNG's convention is that 2364 began at stardate 41000.0 and each year adds 1000. Extending that backwards and letting the five-digit counter roll over (99999.9 → 00000.0) means the counter last reset on **January 1, 2023**. Partway through 2026 the stardate is in the 03xxx range.

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

## Styling

Size the element like any block element (`width`, `height`). Its appearance is controlled by CSS custom properties:

```css
trek-padd {
  height: 420px;
  --padd-font: "Antonio", sans-serif;
  --padd-font-size: 22px;
  --padd-font-weight: 400;
  --padd-line-height: 1.25;
  --padd-bg: #000;
  --padd-padding: 12px 16px 10px;
  --padd-orange: #FF9900;  /* any color variable from the table above */
}
```

You can also style the internals with `::part()`, using `frame`, `screen`, `text`, `controls`, `page` and `button` (plus `prev`, `sound` and `next`).

## JavaScript API

```js
const padd = document.querySelector("trek-padd");
padd.text = "##OPRIORITY ONE MESSAGE"; // replace the text and restart
padd.next(); padd.prev(); padd.restart();
padd.page; padd.pageCount;
padd.addEventListener("pagecomplete", (e) => console.log(e.detail));
```

`window.TrekPadd` also exposes `COLORS`, `TIMING`, `stardate()`, `parse()` and `toFragment()` (renders marked-up text without animation).

## History

The original *TrekText* applet (v1.44, 2002–2003) ran on the author's site *Crymson's Illusion*. It was built on a small Java game toolkit from a Northern Arizona University course, which isn't included here. Its source code was lost, so the behavior was recovered by decompiling the surviving `.jar`. [`trek.txt`](trek.txt) is the applet's original text file.

---

*Star Trek* and related marks are trademarks of CBS Studios Inc. This is an unofficial fan project and is not affiliated with or endorsed by CBS or Paramount.
