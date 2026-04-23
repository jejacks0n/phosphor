/**
 * Renders a character buffer to a DOM element using efficient <span> manipulation.
 * State is stored on the element itself to remain instance-safe and resilient to visibility changes.
 */

export function render(context, buffer) {
	const element = context.settings.element;
	if (!element) return;

	// Initialize or retrieve state from the DOM element itself
	if (!element._playState) {
		element._backBuffer = [];
		element._cols = 0;
		element._rows = 0;
		element._playState = true;
	}

	// Detect resize or first run
	if (context.rows !== element._rows || context.cols !== element._cols) {
		element._cols = context.cols;
		element._rows = context.rows;
		element._backBuffer = [];
		element.innerHTML = ''; // Clear for a fresh start
	}

	const cols = element._cols;
	const rows = element._rows;
	const backBuffer = element._backBuffer;

	// Ensure we have enough row containers
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

				let c = currCell.color === context.settings.color ? null : currCell.color;
				let b = currCell.backgroundColor === context.settings.backgroundColor ? null : currCell.backgroundColor;

				let css = '';
				if (c) css += 'color:' + c + ';';
				if (b) css += 'background:' + b + ';';
				if (css) css = ' style="' + css + '"';
				
				html += '<span' + css + '>';
				tagIsOpen = true;
			}
			html += currCell.char;
			prevCell = currCell;
		}
		if (tagIsOpen) html += '</span>';

		if (element.childNodes[j]) {
			element.childNodes[j].innerHTML = html;
		}
	}
}

function isSameCell(cellA, cellB) {
	if (!cellA || !cellB) return false;
	return cellA.char === cellB.char && isSameCellStyle(cellA, cellB);
}

function isSameCellStyle(cellA, cellB) {
	if (!cellA || !cellB) return false;
	return cellA.color === cellB.color && 
		cellA.backgroundColor === cellB.backgroundColor && 
		cellA.bgIndex === cellB.bgIndex;
}
