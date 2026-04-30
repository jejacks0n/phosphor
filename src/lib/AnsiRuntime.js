/**
 * Lean utilities for calculating DOM metrics.
 */

export function calcMetrics(el) {
	const style = getComputedStyle(el);
	const fontFamily = style.fontFamily;
	const fontSize = parseFloat(style.fontSize);
	const lineHeight = parseFloat(style.lineHeight);

	let cellWidth;
	if (el.nodeName === 'CANVAS') {
		const ctx = el.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
		ctx.font = fontSize + 'px ' + fontFamily;
		cellWidth = ctx.measureText(''.padEnd(50, 'X')).width / 50;
	} else {
		const span = document.createElement('span');
		el.appendChild(span);
		span.innerHTML = ''.padEnd(50, 'X');
		cellWidth = span.getBoundingClientRect().width / 50;
		el.removeChild(span);
	}

	return {
		cellWidth,
		lineHeight,
		aspect: cellWidth / lineHeight,
		width: el.getBoundingClientRect().width,
		height: el.getBoundingClientRect().height
	};
}

export function getContext(settings, metrics) {
	const rect = settings.element.getBoundingClientRect();
	const cols = settings.cols || Math.floor(rect.width / metrics.cellWidth);
	const rows = settings.rows || Math.floor(rect.height / metrics.lineHeight);
	return Object.freeze({
		cols,
		rows,
		metrics,
		width: rect.width,
		height: rect.height,
		settings
	});
}
