/**
 * Lean utilities for calculating DOM metrics.
 */

export function calcMetrics(el) {
	const style = getComputedStyle(el);
	
	const span = document.createElement('span');
	span.style.fontFamily = style.fontFamily;
	span.style.fontSize = style.fontSize;
	span.style.fontWeight = style.fontWeight;
	span.style.fontVariantNumeric = style.fontVariantNumeric;
	span.style.fontFeatureSettings = style.fontFeatureSettings;
	span.style.lineHeight = style.lineHeight;
	span.style.visibility = 'hidden';
	span.style.position = 'absolute';
	span.style.whiteSpace = 'pre';
	span.style.display = 'block';
	
	// Measure width using a larger sample to average out sub-pixel errors
	span.textContent = ''.padEnd(100, 'X');
	document.body.appendChild(span);
	const widthRect = span.getBoundingClientRect();
	const cellWidth = widthRect.width / 100;
	
	// Measure height using a block element to get the actual line height
	const lineHeight = widthRect.height;
	
	document.body.removeChild(span);

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
