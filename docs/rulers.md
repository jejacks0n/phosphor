# Rulers and Guides

Rulers measure characters along the top and left edges of the PIXEL, ANSI, and VECTOR workspaces. Guides are reference lines you drag from the rulers to align your artwork. Guides and rulers help you measure and align art, but they are never part of it or included in exported files.

## Turning Rulers On and Off

1. Select the **Hand** tool (**H**).
2. In the tool options bar at the top, check the **Rulers** checkbox (off at first). Your choice is saved in your browser.
3. When rulers are enabled, adjust the **Opacity** slider (10% to 100%, also saved in your browser) to make the rulers semi-transparent so you can see artwork underneath. Guide lines and pointer measurements always stay fully visible.
4. Click **Clear guides** to remove all guides from the drawing, including any hidden past its edge. The zero origins stay where they are. If there are no guides, this button is disabled.

Turning off Rulers hides the rulers and guides without deleting them.

### Ruler Markings

- The **top ruler** measures columns (horizontal width).
- The **left ruler** measures rows (vertical height).
- Tick marks appear at every character edge (unless you're zoomed too far out to tell them apart), with longer marks every 5 and 10 characters from zero. Numbers appear at zero and every 10 characters (or every 20, 50, 100, or more characters when zoomed out, so the numbers don't crowd).
- A label follows your mouse pointer over the art on each ruler, showing the count of the column and row under your cursor.
- A triangle marker on each ruler indicates the zero origin point.

## Adding and Moving Guides

You can only move rulers and guides using the **Hand** tool, or by holding **Space** while using any other tool. This prevents accidental changes while painting or drawing.

- **Create a horizontal guide**: Click and drag downward from the top ruler.
- **Create a vertical guide**: Click and drag rightward from the left ruler.
- **Move a guide**: Click and drag the guide line to a new position. While you drag, a label beside the pointer shows the guide's distance from zero.
- **Delete a guide**: Drag the guide line back onto either ruler, or off the view, and release. The label says **Remove** before you let go.
- **Move the zero origin**: Drag the triangle marker on either ruler. Drag the square in the top-left corner to move both rulers' origins together. While you drag, a label says where zero is (for example, "0 on column 21" or "0 between columns 14 and 15").
- **Reset origin**: Double-click a ruler's triangle marker to reset that ruler's zero origin to the drawing's edge. Double-click the corner square to reset both origins to the top-left corner.

Guides and origin markers automatically snap to character cell edges and cell centers.

## How Measurements Work

- **Origin on an edge**: When the zero origin sits between two cells, the cells on either side measure as 1 and −1.
- **Origin on a cell center**: When the zero origin sits in the middle of a cell, that cell is 0, and the neighboring cells are 1 and −1.
- A guide's measurement represents its distance from zero (for example, 12 or 12½).

### Examples

- **Symmetrical emblem (41 characters wide)**: With the origin placed on the center character, cells read from −20 to 20. A guide through the center of each outer character measures 20 and −20. A guide on each outer edge measures 20½ and −20½.
- **Even-width platform (28 characters wide)**: An even width has no single center cell. The center falls on the boundary between columns 14 and 15, 14 characters in from either outer edge.

## Saved Settings

Your guides and origin positions are saved automatically in your browser for each drawing. They return when you reload the page, open the drawing again from your recent work, restore a version, or reopen its saved `.pho` project file (every save of a drawing carries the same id).

- Guides and origin positions are never included in exported files or sent to shared rooms.
- Moving a guide or origin does not count as an artwork edit (it does not mark the drawing as unsaved or create an undo step).
- If a drawing becomes smaller, guides outside the canvas area are hidden until it grows back. An origin past the edge counts from the edge.
