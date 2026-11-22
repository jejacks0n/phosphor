# Plugins

A plugin adds something to Phosphor: color themes, a script, or both. A script can add ways to choose characters
(solvers), brushes, shapes for the Shape tool and filters for the picture. A plugin is a folder (or a .zip of one)
holding its manifest, `phosphor-plugin.json`, and the script the manifest names.
A plugin with only themes is just the manifest and runs no code. A plugin with a script runs code in Phosphor, so it asks
you before it's installed ([Installing](#installing-a-plugin)). A plugin is kept in the browser you installed it in (or
in the desktop app), and nowhere else: another browser or computer doesn't have it until you install it there too.

## The Plugins dialog

**Plugins**, under the language and theme at the bottom of the settings panel, opens the dialog (on the desktop app,
**Plugins…** in the Phosphor menu on macOS, in Help elsewhere). It has two tabs, **Marketplace** and **Installed**. It
opens on Installed when you have any plugins, and on Marketplace when you have none; the tab you used last stays for the
rest of the visit. The dialog is 860 pixels wide, and on a screen 700 pixels wide or less it fills the window.

**Installed** lists each plugin you have: its name and version, who made it, what it adds ("1 theme", and once its
script is loaded "1 solver", "1 brush", "1 shape" or "1 filter"), its homepage, its description, and a line saying where
it came from ("From a folder", "From the marketplace"). An Official badge marks Phosphor's own.

- **Install from a file…** asks for a `.zip` or a `phosphor-plugin.json`.
- **Install from a folder…** asks for a folder.
- You can also drop a folder, a `.zip` or a manifest on the dialog.

- **Replacing**: installing a plugin you already have asks "Replace Midnight 1.2.0 with 1.3.0?". The new version keeps
  the old one's On or Off.
- **On and Off**: each plugin has a switch. A plugin that's off keeps its place in the list, but nothing of it is
  offered: its themes, solvers, brushes, shapes and filters.
- **The trash can** (Remove) asks first ("Remove Midnight?"), then forgets the plugin.

If the theme you're using belongs to a plugin you switch off or remove, or to a new version that no longer has it,
Phosphor goes to that theme's base: Dark or Light.

## The Marketplace

**Marketplace** is a grid of cards, one for each plugin on the list. A card has a band of art at the top (the plugin's
`preview`, or its theme's colors, or nothing), then its name, version, author (or Official), a description cut to two
lines, what it adds, and a button. Type in **Search plugins** to narrow the cards, and use the **Show** menu to see All,
Official, Themes or Scripts. Scripts is every plugin with a script: a card is made from the manifest alone, which names
the script but not what's in it, so it can't tell a solver from a brush.

The list is loaded once a visit, the first time you open the dialog. If it can't be loaded, the tab says so and offers
**Try again**. A list made for a newer Phosphor than yours says "This marketplace needs a newer Phosphor. Update Phosphor
to see it."

The button depends on what you have:

- **Install** asks the same question as any install ([Installing](#installing-a-plugin)). Its question says who made the plugin and where it comes
  from. Official plugins that run code still warn that they run code. While Phosphor reads the plugin's files to ask, the
  button says **Reading…** and can't be pressed again; the other cards can.
- **Installed** (dimmed) means you have this plugin at this version or a newer one.
- **Update** shows when the list has a higher version than yours. Raising `version` is the only thing that makes an Update;
  a changed file at the same version isn't one. The Installed tab marks the row "Update to 1.1.0".
- **Replace** shows when you have a plugin with the same id that came from somewhere else (a file, a folder or another
  repository). The question names where the new one comes from ("by Kim, from the marketplace, kim/phosphor-fog"), so you can tell
  it isn't the plugin you have.

A plugin that leaves the list stays installed and keeps working. Its row on Installed says **No longer listed**.
Nothing says that, or offers an Update, until the list has loaded.

Phosphor installs from the list only the files the list was built from. Each entry is pinned to the commit seen when the list
was built, with a hash of each file. If a file has changed since, is gone (its repository deleted or made private) or
has grown past its size limit, the install is refused: "This plugin changed after it was listed." Phosphor says "The
marketplace couldn't be reached." only when the connection fails. Updates an author pushes show after the next refresh
of the list, which happens when the wiki page changes, once a day, and with each release. The pin covers what's
installed, not what runs later: a plugin's script can fetch more code after it's installed, and nothing checks that.

A browser that won't keep anything (some private windows) says "This browser isn't keeping plugins, so none can be
installed."

## Installing a plugin

Before anything is installed it asks, for example "Install Midnight 1.2.0?", by whom, and what it adds. A plugin with
only themes says "Adds 1 theme. Runs no code." A plugin with a script says "Adds 1 theme and a script." (or "Adds a
script.") and, under it, "⚠ This plugin runs code in Phosphor. Install it only if you trust where it came from." Nothing
of the plugin runs before you press Install: Phosphor reads the manifest and the script's text to ask, and nothing more.
Cancel leaves nothing behind. A script that fails its checks when it's loaded keeps nothing, and an older version of the
plugin stays as it was.

- **A folder**: `phosphor-plugin.json` at its top, and the script it names, relative to the folder. Nothing else in the
  folder is read.
- **A .zip**: the manifest at its top, or one folder down, which is how GitHub's Download ZIP makes it (`phosphor-outlines-main/`).
  Only the manifest and the script it names are read.
- **A file**: a `phosphor-plugin.json` alone installs a theme-only plugin. One that names a script needs the script
  beside it, so install it as a folder or a .zip.
- **Replacing** works as above, for a folder or a .zip too.

What's refused, and what the dialog says:

- A .zip that isn't one ("That file isn't a readable .zip."), is password protected, or uses the large-archive (zip64)
  format.
- A folder or .zip with no manifest ("There is no phosphor-plugin.json at the top of that, or one folder down.").
- A manifest over 64 KB or a script over 1 MB ("That file is too big for a plugin.").
- A script the manifest names that isn't there ("The plugin names a script, outlines.js, that isn't in it.").
- A script that doesn't load ("The plugin's script couldn't be loaded: …"), or whose export isn't the shape
  ("The plugin's script has a problem at “…”.", naming the field), or that has two solvers with one id ("The plugin's
  script has two solvers with the id “…”."). Two brushes, two shapes or two filters with one id are a problem at the
  second one's `id`, and a script that adds none of the four kinds is a problem at “default”.
- Any plugin with a script while Phosphor is started with `plugins=off`: "Plugins are off for this visit, so a plugin
  that runs code can't be installed now."

Where the browser can link a page to a folder (Chrome and Edge), a plugin installed with **Install from a folder…** keeps
the link: its row says "From a folder", with **Reload** and **Follow file** as for a file ([Trying it as you write](#trying-it-as-you-write)).
A Reload, or a followed save, that turns a plugin with no script into one with a script asks first: "Jane's plugin now
runs code. Allow?", with **Allow** and **Not now**. Follow pauses until you answer, then goes on. A changed script of a
plugin that already runs code is taken as it comes.

A plugin you remove, switch off or replace has its code gone from use at once: nothing calls it. The browser keeps it in
memory until the page reloads, which does no harm.

### When a script stops Phosphor

Before a plugin's script is loaded, the first time in a visit a solver works out a drawing, the cells under paint or
the cells of a layer above the others, and the first time in a visit a brush moves, a shape gives its outline or a
filter runs, Phosphor marks that plugin as running (in your browser's local storage, tied to
the page that runs it) and takes the mark off when that's done. If a page froze there, the mark stays, and the next visit that finds the mark of a page that's gone starts that
plugin off and says "Outlines stopped Phosphor responding last time, so it's off." You can switch it on again from the
Plugins dialog, or remove it. `plugins=off` ([Starting with plugins off](#starting-with-plugins-off)) stays the last
resort.

## Picking a plugin's theme

Once a plugin with a theme is on, a select appears under the language and the Dark, Light and System icons at the
bottom of the settings panel. It reads **Themes (from plugins)…** until you pick one of the plugins' themes from it; while one is in use, none of the
icons is checked. Pick an icon to go back to Phosphor's own themes. Your choice is saved in your browser, and a reload
shows the theme from the first moment, before the app has started.

## Starting with plugins off

If a theme makes Phosphor hard to read, load it with `plugins=off` in its address. Phosphor then starts with its own
colors (the theme's base, Dark or Light), keeps your choice of theme, and the Plugins dialog says "Plugins are off for
this visit." There you can switch the plugin off or remove it; then load Phosphor again without `plugins=off`.

- On the web: `https://phosphor.work/?plugins=off` or, on a tab, `https://phosphor.work/ansi?plugins=off`.
- On the desktop app: **Help > Troubleshooting > Reload with Plugins Off**. With unsaved work it asks first, as any
  reload does. That window stays without plugins; once you've switched the plugin off or removed it, open a new window
  (**File > New Window**), which starts with them.

## Writing a plugin

A plugin is a file named `phosphor-plugin.json`. This one is Midnight, a deep blue theme (one of the official plugins in Phosphor's
`plugins/` folder, `plugins/midnight/phosphor-plugin.json`), shortened: the real file sets every color slot. Your own plugin's id is yours, `author.name`, like `jane.rain`;
ids starting `phosphor.` are kept for the official plugins:

```json
{
  "phosphor": 1,
  "id": "phosphor.midnight",
  "name": "Midnight",
  "version": "1.2.0",
  "author": "Phosphor",
  "description": "A deep blue theme for late nights.",
  "homepage": "https://github.com/jejacks0n/phosphor/tree/main/plugins/midnight",
  "license": "MIT",
  "themes": [
    {
      "id": "midnight",
      "name": "Midnight",
      "base": "dark",
      "colors": { "background": "#0b1020", "accent": "#7aa2f7", "surface-0": "#10162b" }
    }
  ]
}
```

The fields:

| Field | What it is | Rules |
|---|---|---|
| `phosphor` | The manifest's format. | `1`. A higher number is refused: "This plugin was made for a newer Phosphor." |
| `id` | Who made it and what it is: `author.name`. The same id installed again replaces the plugin. | Lowercase letters, digits and hyphens on each side of one dot; 64 characters at most. |
| `name` | The plugin's name, as the dialog shows it. | Required; 60 characters at most. |
| `version` | Its version, in [semver](https://semver.org) (`1.0.0`, `1.1.0-beta`). | Required, without a `v`. |
| `author` | Who made it. | Required; 60 characters at most. |
| `description` | A line about it. | Optional; 300 characters at most. |
| `homepage` | Where to read about it, linked from the dialog. | Optional; `https://` only; 200 characters at most. |
| `license` | Its license, for example `MIT`. | Optional; 40 characters at most. |
| `preview` | Up to three short lines shown as text on the art band of its Marketplace card. | Optional; 3 lines at most (split on a new line), 24 characters each, no control characters. Shown as text, never as markup. |
| `themes` | The themes it adds. | At most 20. A plugin has themes, a script, or both; with neither it's refused ("This plugin adds nothing this Phosphor can use."). |
| `script` | The script that adds solvers, brushes, shapes and filters ([Writing a script](#writing-a-script)). | Optional; a relative path to a `.js` or `.mjs` file inside the plugin's folder (or .zip), going up (`..`), `.` and empty folders (`a//b.js`) not allowed; 1 MB at most. |

Each theme:

| Field | What it is | Rules |
|---|---|---|
| `id` | The theme's own name in the plugin. | Lowercase letters, digits and hyphens; 40 characters at most; one of its kind in the plugin. |
| `name` | The theme's name, as the select shows it. | Required; 40 characters at most. |
| `base` | `dark` or `light`: Phosphor's own theme under it, which gives every color it doesn't set, and the theme Phosphor goes to when this one isn't there. | `dark` or `light`. |
| `colors` | The colors it sets. | Each key is one of the color slots below; each value a hex color: `#rgb`, `#rrggbb` or `#rrggbbaa`. |

The color slots, and what each colors (a theme that sets them all changes the whole interface, as the official Midnight, a dark one, and Rain, a light one, do; the
art's own colors aren't a theme's):

| Slot | What it colors |
|---|---|
| `background`, `background-highlight` | The area around the art, and the glow over its top left corner. |
| `accent` | Headings, the tab shown, a hovered button's border, the close button's ring, focus, links. |
| `accent-hot`, `accent-hover` | A primary button (Install, Export) and its border; the chosen tool or option; the close button on hover. |
| `accent-faint` | The drop box under a file being dragged in. |
| `danger`, `danger-hover` | Remove and other danger buttons, and the words that say something failed. |
| `warning`, `success` | Notes that warn, and ones that say something worked. |
| `surface-0` … `surface-4` | The page behind everything (`surface-0`), then panels, buttons, fields and menus, each a step up. |
| `surface-dark`, `surface-light` | The checkerboard behind see-through art; a primary button on hover. |
| `border`, `border-subtle`, `border-light` | Borders, from a button's to a list's lines to the dialogs' edges. (`border-dark` is a slot nothing uses yet.) |
| `text`, `text-dim`, `text-muted`, `text-faint` | Words, from the brightest to hints and placeholders. |
| `text-inverted` | Words on a primary button. |
| `white`, `black` | Words and icons on a chosen button or tab (`white`). Tooltips' ground and the rings around color swatches (`black`). |
| `accent-glow` | The glow around a focused field and behind a chosen tab's words. Left out, it's worked out from `accent`. |
| `shadow` | Every drop shadow: under buttons, menus, panels, dialogs and the toast. Each keeps its own strength, so give the color whole (`#rrggbb`). |
| `guide` | The guides, their ticks on the rulers, and the label while one is dragged. |
| `toast`, `toast-text` | The toast's ground and its words. |
| `wand-fill` | The Magic Wand's tint over what it selected. Its see-through is its own, so give it as `#rrggbbaa`. |

The last eight slots (from `white` down) are newer than the rest. A copy of Phosphor from before a slot was added
refuses a theme that sets it, and leaves it out of its Marketplace, so a theme meant for older copies too leaves the
newer slots out.

Not slots: the backdrops behind dialogs, what's drawn over the art to show on any art (the Brush's circle, a selection's
dashes, the dark rings around a guide and another person's cursor), the black behind a Marketplace preview and a room's
picture, the logo and the fonts.

A key that isn't a slot, or a value that isn't hex, refuses the whole manifest, and the dialog names it. Fields Phosphor
doesn't know are left out, except that a manifest from a format newer than Phosphor's is refused. The file can be 64 KB at most. Every word in it is shown as you wrote it, as text: never as
markup, and never translated.

## Writing a script

A script is a JavaScript module that imports nothing: everything it needs comes in its calls. Its default export lists
what it adds, in four lists. Each is optional, and at least one has something in it:

```js
export default {
  solvers: [ /* … */ ],
  brushes: [ /* … */ ],
  shapes: [ /* … */ ],
  filters: [ /* … */ ],
};
```

| List | Each one is | Where it shows | Written in |
|---|---|---|---|
| `solvers` | A way to choose each cell's character. | **Choose characters**, after the built-ins. | JavaScript, and GLSL if you like ([Writing a solver](#writing-a-solver)). |
| `brushes` | A tool that lays paint. | The toolbar in PIXEL and ANSI, after the built-in tools. | JavaScript ([Writing a brush](#writing-a-brush)). |
| `shapes` | A shape for the Shape tool, drawn from its outline. | The Shape tool's row on VECTOR, after Polygon. | JavaScript ([Writing a shape](#writing-a-shape)). |
| `filters` | An effect on the picture. | A group of its own in the settings column, after Image filters. | GLSL only ([Writing a filter](#writing-a-filter)). |

A script holds 8 of each kind at most. Each has an `id` (lowercase letters, digits and hyphens, 40 characters at most,
one of its kind in the script: a brush and a shape may share one) and a `name` (40 characters at most). Everything is
read once, when the script is loaded, and anything that isn't the shape refuses the plugin, naming the field ("The
plugin's script has a problem at “brushes[0].icon”."). A plugin's words are shown as you wrote them, as text, and never
translated.

While a plugin is off, or Phosphor is started with `plugins=off`, nothing of its script is offered. In a room none of it
is: rooms don't use plugin solvers, brushes, shapes or filters ([In a room](#in-a-room)).

### Options

Each of the four kinds can have up to 12 options: what the person can set, drawn with Phosphor's own controls in your
words. Each has an `id` (a lowercase letter first, then up to 31 lowercase letters, digits and underscores, never two
underscores together: it's the end of a shader's uniform name, `opt_<id>`; one of its kind among the item's options), a
`name` and a `kind`:

- `slider`: `min`, `max`, `step` and `default`.
- `checkbox`: `default`, true or false.
- `choice`: `choices` (up to 20, each 40 characters at most) and `default`, the number of the choice (the first is 0).
- `color`: `default`, a color as `'#rrggbb'` (kept in lowercase). JavaScript gets it as `{ r, g, b }`, each 0 to 255,
  and a shader as a `vec3`, each channel 0 to 1. It shows as a swatch; in the settings column the colors that come right
  after a slider, one after another, sit beside it, as Edges has its color (both of Aberration's sit by Distance).

Where the values are kept depends on the kind: a solver's for each layer, saved with the drawing; a filter's with the
drawing; a brush's and a shape's in this browser, for each brush and each shape, and not in the drawing. A value kept
that no longer fits (a new version changed a range or the choices) is the option's default.

### Icons

A brush and a shape each have an `icon`, an SVG as a string, 8 KB (8,192 characters) at most. Phosphor never puts your
markup on the page: it reads the SVG, keeps only what's listed here, checks each value, and writes the icon again from
what it read. Anything else refuses the plugin ("The plugin's script has a problem at “brushes[0].icon”.").

- The root is an `svg` with a `viewBox` at least 16 by 16. Its `width` and `height` are dropped (the toolbar sizes
  icons), and so is `xmlns`.
- Inside it: `g`, `path`, `circle`, `ellipse`, `rect`, `line`, `polyline` and `polygon`.
- Their attributes: the geometry (`d`, `points`, `cx`, `cy`, `r`, `rx`, `ry`, `x`, `y`, `width`, `height`, `x1`,
  `y1`, `x2`, `y2`), `stroke-width` and `opacity` as plain numbers (no units), `fill` and `stroke` as `currentColor` or
  `none`, `fill-rule` and `clip-rule` (`nonzero`, `evenodd`), `stroke-linecap` and `stroke-linejoin`.
- Comments are fine, and so is an `<?xml …?>` line at the very start. Text, styles, classes, `transform`, links (`use`,
  `xlink:href`), entities, scripts and colors of their own aren't.

Draw it in `currentColor`, so it takes the toolbar's colors in every theme.

## Writing a solver

A solver is a way to choose each cell's character, added to the **Choose characters** list. It's a kind of **By shape**
([Characters](characters.md#how-the-converter-picks-characters)): Phosphor hands it each cell the way By shape sees it
(32 samples of the picture, 4 across and 8 down, with the palette, the style and the layer's set), and it gives back a
character and two colors. The example is Outlines, which draws `- | / \` along a picture's outlines and leaves the rest
to By shape. It's one of the official plugins in Phosphor's `plugins/` folder, as `plugins/outlines/` (and `tests/fixtures/plugins/outlines.zip`,
as GitHub's Download ZIP makes it). Install it from either to try it, and copy the folder to start your own.

Its manifest names the script:

```json
{
  "phosphor": 1,
  "id": "phosphor.outlines",
  "name": "Outlines",
  "version": "1.0.0",
  "author": "Phosphor",
  "script": "outlines.js"
}
```

### The solver

A solver is one entry of the script's `solvers`:

```js
export default {
  solvers: [{
    id: 'outlines',
    name: 'Outlines',
    styles: ['ansi', 'colorAscii', 'ascii'],
    reach: 1,
    chars: '-|/\\─│╱╲',
    options: [
      { id: 'threshold', kind: 'slider', name: 'Threshold', min: 0, max: 100, step: 1, default: 40 },
      { id: 'lines', kind: 'choice', name: 'Lines', choices: ['ASCII', 'Box drawing'], default: 0 },
      { id: 'clean_up', kind: 'checkbox', name: 'Clean up', default: true },
    ],
    solve,    // pass 1: one cell
    refine,   // pass 2, optional: one cell again, after pass 1
    shader: { solve: '…', refine: '…' },   // optional: the same passes for the graphics card
  }],
};
```

| Field | What it is | Rules |
|---|---|---|
| `id` | The solver's own name in the plugin. | Required; one of its kind in the script. |
| `name` | What the **Choose characters** list shows. | Required; 40 characters at most. |
| `styles` | The art styles it works in. | Any of `ansi`, `colorAscii`, `ascii`. In another style the layer shows By shape instead. |
| `reach` | How many cells away it reads (see below). | A whole number, 0 to 4. |
| `chars` | Characters of its own, added to the layer's set for it, so it can draw one the set doesn't hold. | 32 at most; no control characters, combining marks or two-column characters. |
| `options` | What the person can set, up to 12. | Below. |
| `solve`, `refine` | The passes. | `solve` is required. |
| `shader` | The passes for the graphics card. | Optional; each string 64 KB at most. |

**Options** ([Options](#options)) show under the Characters section when the solver is chosen, and are kept for each
layer and saved with the drawing. A new drawing (a picture or a blank canvas) keeps them as it keeps the choice of
solver; a project opened brings its own.

### The two passes

Both are called as plain functions, so `this` is undefined: keep what they share in module-level helpers, as Outlines
does. `solve(cell, look)` is pass 1, for each cell of the drawing. `refine(cell, look)` is pass 2, run after pass 1 has
chosen for every cell, and it can read what pass 1 chose around it.

`cell` is the cell being worked on:

- `cell.col` and `cell.line`: where it is.
- `cell.sample(dx, dy, i)`: sample `i` (0 to 31) of the cell `dx` across and `dy` down from it, as `[r, g, b]`, 0 to 255.
  The array is one that every call overwrites, so copy what you keep. A cell past the border gives the edge cell's
  samples, and an offset past `reach` throws. With Floyd–Steinberg dither, only the cell's own samples carry its
  error; its neighbors' have Ordered (Bayer)'s nudge or none.
- In pass 2, `cell.char(dx, dy)`: the character pass 1 chose for the cell `dx`, `dy` away, or `null` past the border.

`look` is what the layer is set to:

- `look.glyphs`: the characters it may use, each `{ char, mask, own }`: its 32 numbers of ink (0 to 1), and `own`
  true for the solver's own `chars`. The layer's set comes first, then the solver's own.
- `look.palette` (`null` when any color will do), `look.style`, `look.options` (by id), `look.light` and `look.solids`
  (Pattern light and Solids).
- `look.mix(bg, fg, ink)` blends one color channel as By shape does, `look.nearest(color)` gives the palette's nearest
  color, and `look.gray(color)` a color's brightness, 0 to 255.
- `look.byShape()` gives the cell as By shape would pick it from the layer's set alone, so a solver can do its own
  thing in some cells and leave the rest to By shape.

A pass returns `{ char, fg, bg }`. A color is a palette index or `{ r, g, b }`, 0 to 255, and gets the palette's nearest
color when there is one. The result is held to the layer's set and the style: a character the layer's set and your
`chars` don't hold is the first character of the set (a fault: where your JavaScript draws, the plugin's row in the
Plugins dialog says the solver returned a character it doesn't draw with), Color ASCII's background is black and
Monochrome ASCII is white on black. `refine` may return `null` to keep pass 1's cell, as Outlines does where Clean up
changes nothing. A pass that throws stands the layer in with By shape, and the row says why.

Here is the heart of Outlines: a cell's nine neighbors' brightness gives a gradient, and where it's at least Threshold,
the cell takes a line along the edge:

```js
function solve(cell, look) {
  readWindow(cell);              // 9 cells x 32 samples, added up by cell.sample
  const k = lineOf(look);        // which line (0 -, 1 |, 2 /, 3 \), or -1 for none, by look.options.threshold
  return k < 0 ? elsewhere(cell, look) : lineCell(look, k);
}

function refine(cell, look) {
  if (!look.options.clean_up) return null;       // pass 1's cell, kept
  // read cell.char(dx, dy) around: a line with no line beside it goes, and a line between two of another kind takes theirs
}
```

### Reach and what it costs

`reach` is how far a solver reads, and both passes use it. A solver that reads only its own cell has reach 0. When part of
the drawing changes (a brush stroke, say), Phosphor works out again the changed area grown by `reach` cells for pass 1, and by
twice that for pass 2, so a larger reach costs more every time anything changes under it. Choose the smallest that does the job.

Reach covers the picture and the layers drawn with it as one block: the base, the vector layers directly above it and the
next cells layer, while they share the base's character settings (the lower group, in [Cells and paint](model.md)). Where paint is drawn over the picture,
and on any layer above that block, a solver sees its own cell only: reach 0, and no pass 2. That's what keeps a drawing
the same when its layers are merged (rule R12 there).

While a stroke is open on Floyd–Steinberg dither, the cells within reach of it lose their dither until the stroke ends,
as By shape's edited cells do, over a wider area.

### The shader

A solver may also give each pass as a shader, so the graphics card does a large drawing's cells. Each string is the body
of a GLSL ES 3.00 function (`void solve()`, `void refine()`) that Phosphor puts after a prelude of its own:

- `sampleAt(ivec2 d, int i)`: the sample, as `cell.sample` gives it, as a `vec3` of 0 to 255.
- `glyphCount`, `glyphMask(int g, int i)` (a character's ink at sample `i`), `paletteCount` and `paletteColor(int i)`: the
  set and the palette, as `look` has them.
- `ownGlyph[k]`: the index of the solver's k-th own character in the set (only where the solver has `chars`). A glyph is
  named by its index, so use this where the JavaScript uses a character.
- `uLight` (Pattern light), `uTolerance` (Solids), `uStyle`, and `opt_<id>` for each option: a `float` for a slider, a
  `bool` for a checkbox, an `int` for a choice and a `vec3` (0 to 1) for a color.
- `snap(vec3 v, out vec3 c)` (rounds `v` to bytes into `c` and returns the palette's nearest index, or -1 with no
  palette), `mixed(bg, fg, lb, lf, ink)` (By shape's blend, `lb` and `lf` the linear light of the colors), and
  `toLinear` and `toSrgb`: the helpers By shape uses.
- `byShape()`: By shape's pick for the cell, put as the result.
- `charAt(ivec2 d)` (pass 2): pass 1's glyph index for the cell `d` away, or -1 past the border.
- `put(vec3 fg, vec3 bg, int glyph)`: the result. Glyph 255 means a solid cell.

The JavaScript is the reference, and the shader has to agree with it. The first time a shader would be used for a set of
characters in a visit, Phosphor runs both on a test picture of 8 x 8 cells and compares them, with the layer's
characters, palette and options. A quarter of the picture holds stripes with hard edges at each of 0°, 90°, 45° and 135°
(in that order, left to right and top to bottom), light over a colored gradient, so the cells a solver draws its own way
are checked even when the drawing's are plain. If more than 1 in 16 differ (a few near-ties in 32-bit floats are
expected), the shader is off for the visit and the plugin's row says why. A shader that doesn't compile shows the
compiler's log, and one that stops the graphics card is switched off. The check runs again when the set changes, not
when an option, the palette or the style does. A shader is used only where By shape's is: no Floyd–Steinberg, at most
255 characters and 256 colors. Everywhere else, and on upper layers, the JavaScript runs, so write both to agree.
Outlines writes its tables once and builds the shader from them for that reason.

### Limits, and a drawing without the plugin

A solver is chosen from the **Choose characters** list, under the built-ins and only where it does the drawing's
style. It isn't used in rooms. A drawing that uses a solver whose plugin isn't there keeps the choice and its options,
and shows By shape until the plugin is back; see [Characters](characters.md#plugin-solvers).

## Writing a brush

A brush is a tool that lays paint, in PIXEL and in ANSI. Brushes show in the toolbar after the built-in tools, past a
divider, one button each, in the Plugins dialog's order and then each script's (on a narrow screen, what doesn't fit
goes into ⋯, as the built-in tools do). A brush's tooltip is its name and its plugin's, "Smear (Smear)", with its key.
Chosen, its options show in the options row: a slider, a checkbox, a choice as a menu and a color as a swatch. The
example is Smear (`plugins/smear/`), which smudges the colors under it along the way it moves:

```js
export default {
  brushes: [{
    id: 'smear',
    name: 'Smear',
    icon: '<svg viewBox="0 0 16 16">…</svg>',
    key: 'J',
    size: 'size',
    options: [
      { id: 'size', kind: 'slider', name: 'Size', min: 1, max: 20, step: 1, default: 6 },
      { id: 'strength', kind: 'slider', name: 'Strength', min: 0, max: 100, step: 1, default: 60 },
      { id: 'reads', kind: 'choice', name: 'Reads', choices: ['All layers', 'This layer'], default: 0 },
    ],
    begin,   // optional: the press, before its first move
    move,    // the pointer from one place to the next
    // end,  // optional: the release (Smear has none)
  }],
};
```

| Field | What it is | Rules |
|---|---|---|
| `id`, `name` | Its own name in the plugin, and the name its tooltip and the Shortcuts dialog show. | Required ([Writing a script](#writing-a-script)). |
| `icon` | Its button's icon. | Required ([Icons](#icons)). |
| `key` | The key that picks it ([Keys](#keys)). | Optional; a letter, or Shift and a letter: `'J'`, `'shift+j'`. |
| `size` | The `id` of the slider that is its size: it gets the Brush's circle under the pointer, and `]` and `[` step it. | Optional; one of its own sliders. |
| `options` | What the person can set. | Up to 12 ([Options](#options)). |
| `begin`, `move`, `end` | The calls a stroke makes. | `move` is required. |

Around the brush's own work, Phosphor does what it does for the Brush: Shift-click draws a straight line from where the
last stroke ended, Alt picks a color, a selection limits where it paints, a hidden layer refuses it, the base in an
animation says once that it's on every frame, and a stroke is one undo step.

### A stroke

A position is `{ x, y }` in grid pixels, fractional as the pointer gives it. A press calls `begin(at, paint)`, then
`move(from, to, paint)` for the press itself (`from` and `to` the same place, or with Shift, `from` where the last
stroke ended), then `move` for each move of the pointer, and `end(paint)` at the release. They're called as plain
functions, so `this` is undefined. `paint` is made once a stroke, and is the same object in each call:

- `paint.cols`, `paint.rows`: the grid's size in grid pixels.
- `paint.options`: the brush's values, by id.
- `paint.fg`, `paint.bg`: the foreground and background colors, as `{ r, g, b }`.
- `paint.shown(x, y)`: the color of a grid pixel as it shows, up to and including the picked layer, as `{ r, g, b }`, or
  `null` off the grid. That's paint and cells both: a block of colored spaces typed on the layer, or on one under it, is
  its color, and a letter is its ink over its background as its shape covers that half of the cell.
- `paint.own(x, y)`: the picked layer's own paint there, as `{ r, g, b, a }` (`a` from 0 to 1), or `null` where it has
  none. With the base picked it's what `shown` gives: `{ r, g, b }`, with no `a`.
- `paint.put(x, y, color, alpha)`: paints a grid pixel with `color` (`{ r, g, b }`, 0 to 255) at `alpha` (0 to 1) over
  what the picked layer had there when the stroke began.
- `paint.set(x, y, color, alpha)`: makes the picked layer's paint at a grid pixel exactly `color` at `alpha`, whatever
  was there; at 0 it clears the pixel, and needs no color. It's how a brush thins or removes paint, which a put can't.
  On the base, where every pixel is opaque, it's a put. A copy of Phosphor from before it has no `set`, so a brush for
  those too checks `typeof paint.set === 'function'`, as Smear does.
- `paint.dab(from, to, size, hardness)`: the grid pixels a round brush of that size and hardness (0 to 1) covers moving
  from `from` to `to`, as `[{ x, y, alpha }]`, laid as the Brush lays them, so a brush needn't work out its own
  footprint. The size is held to the Brush's largest, 20, and a hardness that isn't given is 1. A pixel can come more
  than once along a long move.

What a stroke reads is the drawing as it was when the stroke began: `shown` and `own` never give back the stroke's own
paint. They take a fractional position to the pixel it's in, and give a copy each time, so changing it changes nothing.
A put or a set needs whole numbers on the grid, inside the selection when there is one; any other is ignored, as is one
whose color or alpha isn't a number. Colors are rounded and held to 0 to 255, and alpha to 0 to 1. A later write to a
pixel in the same stroke replaces the earlier one, whichever of the two it is: puts don't build up, so a brush that
wants them to keeps its own account, as Smear keeps what each pixel it has changed is now, to drag a color further than
one pixel. A write that leaves a pixel as it was changes nothing. The writes of one call are laid together when it
returns.

A brush reads and lays paint, never characters. On a drawing layer it's the layer's paint; on the base, the base's own
pixels, opaque (the color at its alpha over what shows there). In ANSI, the cells show it as the Brush's paint shows with
**Draw with: Colors only** (rule R5 in [Cells and paint](model.md)). A letter typed on the layer isn't paint: `own`
reads the paint over it (`null` when there's none), a write lays paint over it, and the letter stays, tinted by that
paint as the Brush's tints it: its background from the paint on the cell's top pixel, its ink from the bottom one, so a
brush that paints whole cells (as `dab` covers them) gets what it would over paint. A blank cell of the layer's own in
a color is paint: `own` reads its color, and a write makes paint of it.

A brush that throws stops its stroke: what the stroke laid is taken back, a toast says "Smear failed: …" with its
error's message, and the plugin's row in the Plugins dialog says so until you Reload the plugin or the page.

### Keys

A brush may ask for one key: a letter, or Shift and a letter (`'J'` or `'shift+j'`, in either case). If a built-in tool
has that key, or a brush earlier in the Plugins dialog's order asked for it, they keep it and this brush has no key:
it's picked from the toolbar. The editor's own keys are never given: X (which swaps the colors; Shift+X is free), and L
and N with or without Shift (which play and add a frame with Animate on). Smear asks for J, as M is Select's. The
Shortcuts dialog lists the brushes that have keys
under **Plugin tools**. Shapes and filters have no keys.

## Writing a shape

A shape is one more kind in the Shape tool's row on VECTOR, after Rectangle, Ellipse and Polygon: its icon, titled with
its name and its plugin's ("Superformula (Superformula)"). Chosen, its options follow the row, as Polygon's Sides does.
A drag draws it live in the next shape's style: Shift makes its box square, and Snap to snaps the box's corners. Let go
and it's a path, one undo step, which Vector select and the Node tool change like any other, and which draws without
the plugin (in a room, or where it isn't installed). It keeps its options' values, so while it's selected and
its kind is the one chosen they show, and a change draws it again, until its points are edited by hand; with nothing
of its kind selected, the options shape the next drag. The example
is Superformula (`plugins/superformula/`), Johan Gielis's superformula, a soft five-pointed star at its defaults:

```js
export default {
  shapes: [{
    id: 'superformula',
    name: 'Superformula',
    icon: '<svg viewBox="0 0 16 16">…</svg>',
    options: [
      { id: 'points', kind: 'slider', name: 'Points', min: 1, max: 20, step: 1, default: 5 },
      { id: 'pinch', kind: 'slider', name: 'Pinch', min: 0.1, max: 1, step: 0.1, default: 0.3 },
      { id: 'round', kind: 'slider', name: 'Round', min: 0.1, max: 4, step: 0.1, default: 1.7 },
    ],
    outline,   // the shape in a box of its own, 0 to 1 across and down
  }],
};
```

`id`, `name`, `icon` and `options` are as a brush's; `outline` is required.

`outline(options)` is called once for each drag, at its first move, with the shape's values by id, and again whenever
an option changes on a drawn shape that's selected (a slider's drag calls it at every step), so it should give the same
outlines for the same values. The shape keeps its values and the box it was drawn in, so it's drawn again in that box
until its points are edited by hand ([Shape](vector.md#shape-u)). It gives back the shape in a box of its own, 0 to 1
across and 0 to 1 down, which Phosphor stretches over the box you drag (so a shape that fills its box fills the drag, as
the built-in shapes do). A shape that should stay where it is as its values change is best placed about the box's
middle, as Superformula is, not fitted to its own bounds, which move with the values. That's a list of 1 to 200
outlines, each
`{ closed, points }`: `closed` true or false (a boolean, not just truthy), with at least 2 points, and 500 points in
all:

```js
function outline({ points, pinch, round }) {
  return [{ closed: true, points: [[1, 0.5], [0.62, 0.38], /* … */] }];
}
```

A point is `[x, y]`, a corner, or `[x, y, inX, inY, outX, outY]`, a point with handles. As in Phosphor's own paths, the
handles are relative to their point: `inX, inY` is the way from the point to the handle before it, `outX, outY` to the
one after, and they're stretched with the box. Two or more outlines are one path. Numbers that aren't finite, too many
outlines or points, a `closed` that isn't a boolean, or anything that isn't this shape draw nothing for that drag: a
toast says "Superformula couldn't draw: …" with why, and the plugin's row says so. An `outline` that throws does the
same. When an option changes on a drawn shape, a failure leaves the shape as it was, and a slider's drag says so once.

## Writing a filter

A filter is an effect on the picture, written for the graphics card. Filters show in the settings column after **Image
filters**, and only where Image filters show, with the base picked and a picture
([The Left Column](layers.md#the-left-column)): a group each, with its name, a PLUGIN chip, its own fold and Reset, and
its options, drawn as the Image filters' are. Folded, a group says how many of its options are on. The example is Aberration
(`plugins/aberration/`), which splits the picture's colors sideways, as a cheap lens does:

```js
const PASS = `
  vec3 C = pixel(vec2(0.0));
  vec3 L = pixel(vec2(-opt_distance, 0.0));
  vec3 R = pixel(vec2(opt_distance, 0.0));
  vec3 scale = 1.0 / max(vec3(1.0), opt_left_color + opt_right_color);
  return C + opt_left_color * scale * (L - C) + opt_right_color * scale * (R - C);`;

export default {
  filters: [{
    id: 'aberration',
    name: 'Aberration',
    options: [
      { id: 'distance', kind: 'slider', name: 'Distance', min: 0, max: 10, step: 1, default: 0 },
      { id: 'left_color', kind: 'color', name: 'Left color', default: '#ff0000' },
      { id: 'right_color', kind: 'color', name: 'Right color', default: '#00ffff' },
    ],
    passes: [PASS],
  }],
};
```

`id`, `name` and `options` are as a brush's. `passes` is required: 1 to 4 strings, each 64 KB at most.

### When a filter runs

A filter runs only while one of its options is off its default, so installing one changes no drawing, and its Reset
puts it back. Make each option's default the setting that changes nothing, as Aberration's Distance 0 is. Its values are
part of the drawing: each change is an undo step, as a slider's is, and they go wherever the drawing's settings go
(autosave, Versions and the file). Image filters' Reset leaves them; Reset all clears them.

Filters work on the picture after Blur, Simplify and Edges, one after another in the order their groups show (the
Plugins dialog's order, then each script's), and then come the color sliders, Sharpen and the palette. Sharpen works on
the filtered picture, each pixel against its filtered neighbors. With Simplify or Edges on as well, that can look a
little different from Sharpen with no plugin filter running, which compares a pixel after those effects with its
neighbors from before them. A filter runs wherever the picture's effects do: the canvas, exports, Bake. It changes the
picture only: not paint, typed cells or a layer's characters. A pass that changes nothing (`return pixel(vec2(0.0));`)
leaves the picture as it was, up to rounding; with no filter running, the picture is made exactly as it is without
plugins.

### The passes

Each pass is the body of a GLSL ES 1.00 function, `vec3 filter()`, that returns the pixel's new color (0 to 1 a channel,
clamped after). Phosphor puts it after a prelude of its own:

- `pixel(vec2 d)`: the color of the pixel `d` pixels away from this one (the edge's past the border), as the pass before
  left it, as a `vec3` of 0 to 1. The first pass reads the picture after Blur, Simplify and Edges.
- `uv`: this pixel's place in the picture, 0 to 1 each way, and `uResolution`: the picture's size in pixels, as the
  effects work on it.
- `luma(vec3 c)`: a color's brightness, with the weights Edges uses.
- `opt_<id>` for each option: a `float` for a slider, a `bool` for a checkbox, an `int` for a choice, and a `vec3` (0 to
  1) for a color.

Passes run in order, each reading what the one before left. There's no JavaScript twin: the picture is made only on the
graphics card.

A pass that doesn't build is skipped, with the rest of its filter, and the group and the plugin's row show the
compiler's log ("Aberration's filter didn't build: …"). A filter that loses the graphics card is off until you reload
("Aberration's filter lost the graphics card, and is off until you reload.").

### A drawing without the filter

A drawing whose filter isn't there keeps its values, shows the picture without it, and shows its group dimmed, saying
why. The name is the one saved with the values:

- "Aberration isn't installed. The picture shows without it." The plugin was removed, or this browser never had it.
- "Aberration is off. The picture shows without it." The plugin is switched off, or Phosphor was started with
  `plugins=off`.

Reset clears the values. The Export dialog names each filter that's set but left out (not there, off or failed):
"Left out: the plugin filter Aberration." **Bake** bakes in, and clears, only the filters that are running, and keeps
the values of one that isn't there, is off or failed; with nothing else to bake, a drawing whose only set filter isn't
running has nothing to bake. **Flatten** clears every filter's values, and undo brings them back.

## In a room

Rooms don't use plugins' scripts. In a room, as the host or an artist, plugin solvers aren't offered, plugin brushes
aren't in the toolbar (one in use is swapped for the Brush), plugin shapes aren't in the Shape tool's row (one chosen
draws a Rectangle), and the plugin filter groups don't show, so no filter can be set and none runs.

Hosting is refused while the drawing holds a plugin filter's values, running or not: **Go live**, and on the desktop app
**Start a room**, are off and say so, naming it ("This drawing holds settings for the plugin filter Aberration, which rooms don't
use. Reset it first."). Reset (or Reset all) lifts it: a filter whose plugin is off or missing still holds its values. A
layer on a plugin solver is refused the same way ([Characters](characters.md#plugin-solvers)). Joining a room isn't
affected.

## Trying it as you write

You don't need to build Phosphor to try a plugin: install your file in the app as it is.

- **Chrome and Edge** keep a link to the file you install with **Install from a file…**: its row says "From a file",
  with **Reload** and **Follow file**. Reload reads the file again. Follow file looks at it every second and takes each
  save as you make it, with the dialog open or shut. A save that isn't a good manifest is left: the last good version
  stays, and the row says why until a good save comes. A file that's moved or deleted stops being followed, and the row
  says "That file can't be read anymore." After a reload of the page, Follow file is off, and the browser may ask
  again before Phosphor can read the file. A file you drop on the dialog has no link.
- **Safari and Firefox** don't link a page to a file: install the file again after each change. It asks to replace the
  version you have.
- **A folder** installed with **Install from a folder…** in Chrome or Edge is followed the same way: **Reload** and
  **Follow file** read the manifest and the script again, so a save to the script shows at once. Its row says "From a
  folder". A script you save that fails its checks is left, and the last good one stays.
- **The desktop app** doesn't link to files: write your plugin in Chrome or Edge.

## Listing a plugin

Official plugins live in Phosphor's repository, one folder each directly under `plugins/` (Midnight, Rain, Outlines, Smear,
Superformula and Aberration are there), each with a `phosphor-plugin.json`. They aren't part of Phosphor's build: people
install them from the Marketplace. The ids starting `phosphor.` are kept for them, and a community listing that uses one
is left out.

To list yours, put it on GitHub with `phosphor-plugin.json` and its script, and add a line to the wiki page **Plugins** in
jejacks0n/phosphor (collaborators can edit it). The line is a link in one of two forms:

- `https://github.com/<owner>/<repo>`: the manifest is at the top of the repository's default branch.
- `https://github.com/<owner>/<repo>/tree/<branch>/<path>`: the manifest is in that folder of that branch.

Anything else on the page is ignored. If two listings have one id, the first wins: official plugins, then the wiki's in
page order. The manifest's and the script's size limits are the same as for installing. The list is built from the page
at the next refresh. It takes the commit it sees then, so a later push shows only after the next refresh, and it makes an
Update only if you raise `version`. Take the line off the page and the plugin leaves the list; people who have it keep it.
