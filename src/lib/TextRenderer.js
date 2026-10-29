/**
 * Renders a character buffer to a DOM element using efficient <span> manipulation.
 * State is stored on the element itself to remain instance-safe and resilient to visibility changes.
 */

import { VGA_COLORS_STR } from './ColorUtils.js';

const VGA_PALETTE = VGA_COLORS_STR.split(' ');

export function render(context, buffer) {
  const element = context.settings.element;
  if (!element) return;

  if (!element._playState) {
    element._backBuffer = [];
    element._cols = 0;
    element._rows = 0;
    element._playState = true;
  }

  // A new size (or the first run) starts over
  if (context.rows !== element._rows || context.cols !== element._cols) {
    element._cols = context.cols;
    element._rows = context.rows;
    element._backBuffer = [];
    element.innerHTML = '';
  }

  const cols = element._cols;
  const rows = element._rows;
  const backBuffer = element._backBuffer;

  // A span per row
  while (element.childElementCount < rows) {
    const span = document.createElement('span');
    span.style.display = 'block';
    element.appendChild(span);
  }

  // Remove excess row containers
  while (element.childElementCount > rows) {
    element.removeChild(element.lastChild);
  }

  for (let j = 0; j < rows; j++) {
    const offs = j * cols;
    let rowNeedsUpdate = false;

    for (let i = 0; i < cols; i++) {
      const idx = i + offs;
      const newCell = buffer[idx] || { char: ' ' };
      const oldCell = backBuffer[idx];

      if (!isSameCell(newCell, oldCell)) {
        rowNeedsUpdate = true;
        backBuffer[idx] = { ...newCell };
      }
    }

    if (!rowNeedsUpdate) continue;

    let html = '';
    let prevCell = {};
    let tagIsOpen = false;

    for (let i = 0; i < cols; i++) {
      const currCell = buffer[i + offs] || { char: ' ' };

      if (!isSameCellStyle(currCell, prevCell)) {
        if (tagIsOpen) html += '</span>';

        let c = currCell.color || (typeof currCell.fgIndex === 'number' ? VGA_PALETTE[currCell.fgIndex] : null);
        let b = currCell.backgroundColor || (typeof currCell.bgIndex === 'number' ? VGA_PALETTE[currCell.bgIndex] : null);

        if (c === context.settings.color) c = null;
        if (b === context.settings.backgroundColor) b = null;

        let css = '';
        if (c) css += 'color:' + c + ';';
        if (b) css += 'background:' + b + ';';
        if (css) css = ' style="' + css + '"';

        html += '<span' + css + '>';
        tagIsOpen = true;
      }
      // A character that doesn't draw exactly its columns wide is held to them (fit), as a terminal
      // keeps its grid: the row stays in line, and a wider shape draws over what follows.
      html += currCell.fit ? '<span class="fit" style="width:' + currCell.fit + 'ch">' + escapeChar(currCell.char) + '</span>' : escapeChar(currCell.char);
      prevCell = currCell;
    }
    if (tagIsOpen) html += '</span>';

    if (element.childNodes[j]) {
      element.childNodes[j].innerHTML = html;
    }
  }
}

// A cell's character as HTML text (rows are written with innerHTML, and characters can be typed or
// come from a project file). One character is looked up; anything longer is escaped throughout.
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
export function escapeChar(char) {
  return char.length === 1 ? ESCAPES[char] ?? char : char.replace(/[&<>]/g, (ch) => ESCAPES[ch]);
}

function isSameCell(cellA, cellB) {
  if (!cellA || !cellB) return false;
  return cellA.char === cellB.char && cellA.fit === cellB.fit && isSameCellStyle(cellA, cellB);
}

function isSameCellStyle(cellA, cellB) {
  if (!cellA || !cellB) return false;
  return cellA.color === cellB.color &&
    cellA.backgroundColor === cellB.backgroundColor &&
    cellA.bgIndex === cellB.bgIndex;
}
