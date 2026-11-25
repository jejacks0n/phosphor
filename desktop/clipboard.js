// What the system clipboard holds, for File > New from Clipboard: read here, in the main process, at the menu's click,
// and handed to the page with the command. The page itself is given no leave to read the clipboard (main.js: no
// permission but writing to it), so nothing in it, a plugin's script included, can read what was copied at any other time.
//   clipboard   Electron's clipboard (its read(): items with types and getType, as the web's)
// { html, text, png }: its HTML, its text, and its picture as PNG bytes, each null when there's none.
export async function clipboardParts(clipboard) {
  const items = await clipboard.read();
  const part = async (type) => {
    for (const item of items) if (item.types.includes(type)) return item.getType(type);
    return null;
  };
  const [html, text, png] = await Promise.all(['text/html', 'text/plain', 'image/png'].map(part));
  return { html: (await html?.text()) || null, text: (await text?.text()) || null, png: png ? new Uint8Array(await png.arrayBuffer()) : null };
}
