# Plugins

A plugin adds something to Phosphor: color themes, a script that adds ways to choose characters (a solver), or both. A
plugin is a folder (or a .zip of one) holding its manifest, `phosphor-plugin.json`, and the script the manifest names.
A plugin with only themes is just the manifest and runs no code. A plugin with a script runs code in Phosphor, so it asks
you before it's installed ([Installing](#installing-a-plugin)). A plugin is kept in the browser you installed it in (or
in the desktop app), and nowhere else: another browser or computer doesn't have it until you install it there too.

## The Plugins dialog

**Plugins**, under the language and theme at the bottom of the settings panel, opens the dialog (on the desktop app,
**Plugins…** in the Phosphor menu on macOS, in Help elsewhere). It lists each plugin installed: its name and version,
who made it, what it adds ("1 theme"), its homepage, and its description.

- **Install from a file…** asks for a `.zip` or a `phosphor-plugin.json`.
- **Install from a folder…** asks for a folder.
- You can also drop a folder, a `.zip` or a manifest on the dialog.

- **Replacing**: installing a plugin you already have asks "Replace Midnight 1.0.0 with 1.1.0?". The new version keeps
  the old one's On or Off.
- **On and Off**: each plugin has a switch. A plugin that's off keeps its place in the list, but its themes aren't
  offered.
- **Remove** asks first ("Remove Midnight?"), then forgets the plugin.

If the theme you're using belongs to a plugin you switch off or remove, or to a new version that no longer has it,
Phosphor goes to that theme's base: Dark or Light.

A browser that won't keep anything (some private windows) says "This browser isn't keeping plugins, so none can be
installed."

## Installing a plugin

Before anything is installed it asks, for example "Install Midnight 1.0.0?", by whom, and what it adds. A plugin with
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
  ("The plugin's script has a problem at “…”."), or that has two solvers with one id.
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

Before a plugin's script is loaded, and before a solver's first whole resolve of a drawing in a visit, Phosphor marks that
plugin as running (in your browser's local storage, tied to the page that runs it) and takes the mark off when it's
done. If a page froze there, the mark stays, and the next visit that finds the mark of a page that's gone starts that
plugin off and says "Outlines stopped Phosphor responding last time, so it's off." You can switch it on again from the
Plugins dialog, or remove it. `plugins=off` ([Starting with plugins off](#starting-with-plugins-off)) stays the last
resort.

## Picking a plugin's theme

Once a plugin with a theme is on, a select appears under the language and the Dark, Light and System icons at the
bottom of the settings panel. It reads **Themes…** until you pick one of the plugins' themes from it; while one is in use, none of the
icons is checked. Pick an icon to go back to Phosphor's own themes. Your choice is saved in your browser, and a reload
shows the theme from the first moment, before the app has started.

## Starting with plugins off

If a theme makes Phosphor hard to read, load it with `plugins=off` in its address. Phosphor then starts with its own
colors (the theme's base, Dark or Light), keeps your choice of theme, and the Plugins dialog says "Plugins are off for
this visit." There you can switch the plugin off or remove it; then load Phosphor again without `plugins=off`.

- With hash addresses (the default): `https://phosphor.work/?plugins=off` or, on a tab,
  `https://phosphor.work/?plugins=off#/ansi`.
- With path addresses: `https://phosphor.work/ansi?plugins=off`.
- On the desktop app: **Help > Troubleshooting > Reload with Plugins Off**. With unsaved work it asks first, as any
  reload does. That window stays without plugins; once you've switched the plugin off or removed it, open a new window
  (**File > New Window**), which starts with them.

## Writing a plugin

A plugin is a file named `phosphor-plugin.json`. This one is Midnight, a deep blue theme (it's in Phosphor's repository
as `tests/fixtures/plugins/midnight/phosphor-plugin.json`):

```json
{
  "phosphor": 1,
  "id": "jane.midnight",
  "name": "Midnight",
  "version": "1.0.0",
  "author": "Jane",
  "description": "A deep blue theme for late nights.",
  "homepage": "https://github.com/jane/phosphor-midnight",
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
| `themes` | The themes it adds. | At most 20. A plugin has themes, a script, or both; with neither it's refused ("This plugin adds nothing this Phosphor can use."). |
| `script` | The script that adds solvers ([Writing a solver](#writing-a-solver)). | Optional; a relative path to a `.js` or `.mjs` file inside the plugin's folder (or .zip), going up (`..`) not allowed; 1 MB at most. |

Each theme:

| Field | What it is | Rules |
|---|---|---|
| `id` | The theme's own name in the plugin. | Lowercase letters, digits and hyphens; 40 characters at most; one of its kind in the plugin. |
| `name` | The theme's name, as the select shows it. | Required; 40 characters at most. |
| `base` | `dark` or `light`: Phosphor's own theme under it, which gives every color it doesn't set, and the theme Phosphor goes to when this one isn't there. | `dark` or `light`. |
| `colors` | The colors it sets. | Each key is one of the color slots below; each value a hex color: `#rgb`, `#rrggbb` or `#rrggbbaa`. |

The color slots: `background`, `background-highlight`, `accent`, `accent-hot`, `accent-hover`, `accent-faint`,
`danger`, `danger-hover`, `warning`, `success`, `surface-dark`, `surface-0`, `surface-1`, `surface-2`, `surface-3`,
`surface-4`, `surface-light`, `border`, `border-dark`, `border-subtle`, `border-light`, `text`, `text-dim`,
`text-muted`, `text-faint` and `text-inverted`. `surface-0` is the page behind everything; the art's own colors aren't
a theme's.

A key that isn't a slot, or a value that isn't hex, refuses the whole manifest, and the dialog names it. Fields Phosphor
doesn't know are left out, except that a manifest from a format newer than Phosphor's is refused. The file can be 64 KB at most. Every word in it is shown as you wrote it, as text: never as
markup, and never translated.

## Writing a solver

A solver is a way to choose each cell's character, added to the **Choose characters** list. It's a kind of **By shape**
([Characters](characters.md#how-the-converter-picks-characters)): Phosphor hands it each cell the way By shape sees it
(32 samples of the picture, 4 across and 8 down, with the palette, the style and the layer's set), and it gives back a
character and two colors. The example is Outlines, which draws `- | / \` along a picture's outlines and leaves the rest
to By shape. It's in Phosphor's repository as `tests/fixtures/plugins/outlines/` (and `tests/fixtures/plugins/outlines.zip`,
as GitHub's Download ZIP makes it). Install it from either to try it, and copy the folder to start your own.

Its manifest names the script:

```json
{
  "phosphor": 1,
  "id": "jane.outlines",
  "name": "Outlines",
  "version": "1.0.0",
  "author": "Phosphor",
  "script": "outlines.js"
}
```

### The script

A script is a JavaScript module that imports nothing: everything a solver needs comes in its calls. It exports the
solvers it adds:

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

A script holds 8 solvers at most. A name, an option's name and a choice are 40 characters at most, and a plugin's words
are shown as you wrote them, as text, and never translated.

**Options** show under the Characters section when the solver is chosen, in your words, and are kept for each layer and
saved with the drawing. Each has an `id` (lowercase letters, digits and single underscores, starting with a letter, 32
characters at most), a `name` and a `kind`:

- `slider`: `min`, `max`, `step` and `default`.
- `checkbox`: `default`, true or false.
- `choice`: `choices` (up to 20) and `default`, the number of the choice (the first is 0).

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
`chars` don't hold is the first character of the set (and counts as a fault), Color ASCII's background is black and
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
  `bool` for a checkbox, an `int` for a choice.
- `snap(vec3 v, out vec3 c)` (rounds `v` to bytes into `c` and returns the palette's nearest index, or -1 with no
  palette), `mixed(bg, fg, lb, lf, ink)` (By shape's blend, `lb` and `lf` the linear light of the colors), and
  `toLinear` and `toSrgb`: the helpers By shape uses.
- `byShape()`: By shape's pick for the cell, put as the result.
- `charAt(ivec2 d)` (pass 2): pass 1's glyph index for the cell `d` away, or -1 past the border.
- `put(vec3 fg, vec3 bg, int glyph)`: the result. Glyph 255 means a solid cell.

The JavaScript is the reference, and the shader has to agree with it. The first time a shader would be used for a set of
characters in a visit, Phosphor also runs your JavaScript on the drawing's first 8 x 8 cells and compares. If more than 1
in 16 differ (a few near-ties in 32-bit floats are expected), the shader is off for the visit and the plugin's row says
why. A shader that doesn't compile shows the compiler's log, and one that stops the graphics card is switched off. The
check runs again when the set changes, not when an option, the palette or the style does. A shader is used only where
By shape's is: no Floyd–Steinberg, at most 255 characters and 256 colors. Everywhere else, and on upper layers, the
JavaScript runs, so write both to agree. Outlines writes its tables once and builds the shader from them for that reason.

### Limits, and a drawing without the plugin

A solver is chosen from the **Choose characters** list, under the built-ins and only where it does the drawing's
style. It isn't used in rooms. A drawing that uses a solver whose plugin isn't there keeps the choice and its options,
and shows By shape until the plugin is back; see [Characters](characters.md#plugin-solvers).

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
