# Plugins

A plugin adds something to Phosphor. For now that's color themes: a plugin is one file, its manifest
(`phosphor-plugin.json`), and it runs no code. A plugin is kept in the browser you installed it in (or in the desktop
app), and nowhere else: another browser or computer doesn't have it until you install it there too.

## The Plugins dialog

**Plugins**, under the language and theme at the bottom of the settings panel, opens the dialog (on the desktop app,
**Plugins…** in the Phosphor menu on macOS, in Help elsewhere). It lists each plugin installed: its name and version,
who made it, what it adds ("1 theme"), its homepage, and its description.

- **Install from a file…** asks for a plugin's `phosphor-plugin.json`. You can also drop the file on the dialog. Before
  anything is installed it asks, for example "Install Midnight 1.0.0?", by whom, and what it adds: "Adds 1 theme. Runs
  no code." A file that isn't a good manifest is refused, and the dialog says why (for example "The theme “Midnight”
  sets “accent” to “red”, which isn't a hex color.").
- **Replacing**: installing a plugin you already have asks "Replace Midnight 1.0.0 with 1.1.0?". The new version keeps
  the old one's On or Off.
- **On and Off**: each plugin has a switch. A plugin that's off keeps its place in the list, but its themes aren't
  offered.
- **Remove** asks first ("Remove Midnight?"), then forgets the plugin.

If the theme you're using belongs to a plugin you switch off or remove, or to a new version that no longer has it,
Phosphor goes to that theme's base: Dark or Light.

A browser that won't keep anything (some private windows) says "This browser isn't keeping plugins, so none can be
installed."

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
| `themes` | The themes it adds. | At least 1 and at most 20. |

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
doesn't know are left out, except `script`: a manifest with one is refused ("This plugin needs a newer Phosphor."). The file can be 64 KB at most. Every word in it is shown as you wrote it, as text: never as
markup, and never translated.

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
- **The desktop app** doesn't link to files: write your plugin in Chrome or Edge.
