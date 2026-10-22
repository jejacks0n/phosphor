/**
 * A wrapper for a canvas element providing high-quality downscaling and pixel management.
 */
import { toGray, paletteIndex } from './ColorUtils.js'

// 2D context with the settings every canvas in the app uses: CPU-backed for getImageData,
// explicit sRGB so Safari doesn't hand back Display P3 values.
export function ctx2d(canvas) {
	return canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })
}

function paletteQuantize(arrayIn, arrayOut, palette) {
	arrayOut = arrayOut || []
	const palLen = palette ? palette.length : 0
	if (palLen === 0) return arrayOut

	for (let i = 0; i < arrayIn.length; i++) {
		const a = arrayIn[i]
		const nearest = palette[paletteIndex(a.r, a.g, a.b, palette)]
		if (!arrayOut[i]) arrayOut[i] = { r: 0, g: 0, b: 0, a: 1, v: 0 };
		const out = arrayOut[i];
		out.r = nearest.r; out.g = nearest.g; out.b = nearest.b; out.c = nearest.c; out.hex = nearest.hex; out.v = a.v;
	}
	return arrayOut
}

// Letterbox sw x sh into tw x th. Shared by the pipeline and the store so they agree exactly.
// Rounds (not floors) dw/dh so a grid-aspect image (e.g. a flattened one) fits as identity.
export function fitRect(sw, sh, tw, th) {
	const sa = sw / sh, ta = tw / th
	let dw, dh
	if (sa > ta) {
		dw = tw
		dh = tw / sa
	} else {
		dw = th * sa
		dh = th
	}
	dw = Math.max(1, Math.round(dw))
	dh = Math.max(1, Math.round(dh))
	return { dx: Math.floor((tw - dw) * 0.5), dy: Math.floor((th - dh) * 0.5), dw, dh }
}

export default class Canvas {
	constructor(sourceCanvas) {
		this.canvas = sourceCanvas || document.createElement('canvas')
		if (!sourceCanvas) {
			this.canvas.width = 1
			this.canvas.height = 1
		}
		this.ctx = ctx2d(this.canvas)
		if (!sourceCanvas) {
			this.ctx.putImageData(this.ctx.createImageData(1, 1), 0, 0);
		}

		this.pixels = []
		this.loadPixels()
	}

	get width() { return this.canvas.width }
	get height() { return this.canvas.height }

	resize(dWidth, dHeight) {
		const w = Math.max(1, Math.floor(dWidth) || 1);
		const h = Math.max(1, Math.floor(dHeight) || 1);
		this.canvas.width = w
		this.canvas.height = h
		this.pixels.length = 0
		// Initialize pixels array to correct size with black
		for (let i = 0; i < w * h; i++) {
			this.pixels[i] = { r: 0, g: 0, b: 0, a: 1, v: 0 }
		}
		return this
	}

	// Draws and downscales using a manual box filter into the current canvas size
	// dx, dy, dw, dh define the area to draw INTO.
	drawManual(source, dx, dy, dw, dh, quality) {
		const tw = this.canvas.width
		const th = this.canvas.height
		const sw = source.width
		const sh = source.height

		// For 'low', skip averaging and just do nearest-neighbor
		if (quality === 'low') {
			this.ctx.imageSmoothingEnabled = false
			this.ctx.fillStyle = 'black'
			this.ctx.fillRect(0, 0, tw, th)
			this.ctx.drawImage(source, 0, 0, sw, sh, dx, dy, dw, dh)
			this.loadPixels()
			return this
		}

		let srcData;
		const srcCtx = (typeof source.getContext === 'function') ? ctx2d(source) : null;

		if (srcCtx) {
			srcData = srcCtx.getImageData(0, 0, sw, sh).data;
		} else {
			// Source is likely a WebGL canvas. In Safari, drawImage(webglCanvas)
			// is often more reliable than readPixels for capturing the backbuffer.
			const temp = document.createElement('canvas');
			temp.width = sw;
			temp.height = sh;
			const tctx = ctx2d(temp);
			tctx.drawImage(source, 0, 0);
			srcData = tctx.getImageData(0, 0, sw, sh).data;
		}

		// For 'medium' and 'high', we do manual box averaging
		const pixels = this.pixels
		const xRatio = sw / dw
		const yRatio = sh / dh

		let step = (quality === 'medium') ? 2 : 1;

		// Fill with black first
		for (let i = 0; i < pixels.length; i++) {
			pixels[i] = { r: 0, g: 0, b: 0, a: 1, v: 0 }
		}

		for (let y = 0; y < dh; y++) {
			const targetY = y + dy
			if (targetY < 0 || targetY >= th) continue

			for (let x = 0; x < dw; x++) {
				const targetX = x + dx
				if (targetX < 0 || targetX >= tw) continue

				let r = 0, g = 0, b = 0, a = 0
				let count = 0

				const syStart = Math.floor(y * yRatio)
				const syEnd = Math.floor((y + 1) * yRatio)
				const sxStart = Math.floor(x * xRatio)
				const sxEnd = Math.floor((x + 1) * xRatio)

				for (let sy = syStart; sy < syEnd; sy += step) {
					for (let sx = sxStart; sx < sxEnd; sx += step) {
						const idx = (sy * sw + sx) * 4
						r += srcData[idx]
						g += srcData[idx + 1]
						b += srcData[idx + 2]
						a += srcData[idx + 3]
						count++
					}
				}

				if (count === 0) {
					const idx = (Math.floor(syStart) * sw + Math.floor(sxStart)) * 4
					r = srcData[idx]; g = srcData[idx + 1]; b = srcData[idx + 2]; a = srcData[idx + 3];
					count = 1;
				}

				const oIdx = targetY * tw + targetX
				const p = pixels[oIdx]
				p.r = Math.round(r / count)
				p.g = Math.round(g / count)
				p.b = Math.round(b / count)
				p.a = (a / count) / 255.0
				p.v = toGray(p.r, p.g, p.b)
			}
		}

		this.writePixels()
		return this
	}

	quantize(palette) {
		paletteQuantize(this.pixels, this.pixels, palette)
		return this
	}

	getImageData() {
		return this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data;
	}

	writePixels() {
		const w = this.canvas.width
		const h = this.canvas.height
		const imageData = this.ctx.createImageData(w, h)
		const data = imageData.data
		for (let i = 0; i < this.pixels.length; i++) {
			const p = this.pixels[i]
			const i4 = i * 4
			data[i4] = p.r; data[i4 + 1] = p.g; data[i4 + 2] = p.b; data[i4 + 3] = (p.a || 1.0) * 255
		}
		this.ctx.putImageData(imageData, 0, 0)
		return this
	}

	loadPixels() {
		const w = this.canvas.width
		const h = this.canvas.height
		const data = this.ctx.getImageData(0, 0, w, h).data
		
		// Pre-allocate or truncate pixels array to match dimensions
		const targetLen = w * h;
		if (this.pixels.length !== targetLen) {
			this.pixels.length = targetLen;
		}

		for (let i = 0; i < data.length; i += 4) {
			const idx = i / 4;
			const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3] / 255.0
			
			// Reuse object if it exists to avoid GC pressure
			if (!this.pixels[idx]) {
				this.pixels[idx] = { r, g, b, a, v: toGray(r, g, b) };
			} else {
				const p = this.pixels[idx];
				p.r = r; p.g = g; p.b = b; p.a = a; p.v = toGray(r, g, b);
			}
		}
		return this
	}
}
