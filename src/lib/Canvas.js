/**
 * A wrapper for a canvas element providing high-quality downscaling and pixel management.
 */

function drawImageStepped(ctx, source, sx, sy, sw, sh, dx, dy, dw, dh) {
	if (!ctx.imageSmoothingEnabled || (dw >= sw * 0.5 && dh >= sh * 0.5)) {
		ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh)
		return
	}

	let currW = sw
	let currH = sh
	let currSrc = source

	const targetW = dw
	const targetH = dh

	let maxSteps = 10
	if (ctx.imageSmoothingQuality === 'low') maxSteps = 1
	else if (ctx.imageSmoothingQuality === 'medium') maxSteps = 2

	let stepCount = 0

	while ((currW > targetW * 2 || currH > targetH * 2) && stepCount < maxSteps) {
		const nextW = Math.max(targetW, Math.floor(currW * 0.5))
		const nextH = Math.max(targetH, Math.floor(currH * 0.5))
		const temp = document.createElement('canvas')
		temp.width = nextW
		temp.height = nextH
		const tctx = temp.getContext('2d', { willReadFrequently: true })
		tctx.imageSmoothingEnabled = true
		tctx.imageSmoothingQuality = ctx.imageSmoothingQuality
		tctx.drawImage(currSrc, 0, 0, currW, currH, 0, 0, nextW, nextH)
		currW = nextW
		currH = nextH
		currSrc = temp
		stepCount++
	}

	ctx.drawImage(currSrc, 0, 0, currW, currH, dx, dy, dw, dh)
}

function getElementSize(source) {
	return { width: source.width, height: source.height }
}

function toGray(r, g, b) {
	return Math.round(r * 0.2126 + g * 0.7152 + b * 0.0722) / 255.0
}

function paletteQuantize(arrayIn, arrayOut, palette) {
	arrayOut = arrayOut || []
	const palLen = palette ? palette.length : 0
	if (palLen === 0) return arrayOut

	for (let i = 0; i < arrayIn.length; i++) {
		const a = arrayIn[i]; const ar = a.r, ag = a.g, ab = a.b
		let minDist = Infinity; let nearest = palette[0]
		for (let j = 0; j < palLen; j++) {
			const b = palette[j]
			const dr = ar - b.r, dg = ag - b.g, db = ab - b.b
			const d = dr * dr + dg * dg + db * db
			if (d < minDist) { minDist = d; nearest = b }
		}
		const out = arrayOut[i] || {}
		out.r = nearest.r; out.g = nearest.g; out.b = nearest.b; out.c = nearest.c; out.hex = nearest.hex; out.v = a.v
		arrayOut[i] = out
	}
	return arrayOut
}

export default class Canvas {
	constructor(sourceCanvas) {
		this.canvas = sourceCanvas || document.createElement('canvas')
		this.canvas.width = 1
		this.canvas.height = 1
		this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })
		this.ctx.putImageData(this.ctx.createImageData(1, 1), 0, 0);

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
		const srcCtx = (typeof source.getContext === 'function') ? source.getContext('2d', { willReadFrequently: true }) : null;

		if (srcCtx) {
			srcData = srcCtx.getImageData(0, 0, sw, sh).data;
		} else {
			// Source is likely a WebGL canvas. In Safari, drawImage(webglCanvas)
			// is often more reliable than readPixels for capturing the backbuffer.
			const temp = document.createElement('canvas');
			temp.width = sw;
			temp.height = sh;
			const tctx = temp.getContext('2d', { willReadFrequently: true });
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

	fit(source, quality = 'low', aspect = 1) {
		const s = getElementSize(source)
		const sa = s.width / (s.height * aspect)
		const tw = this.canvas.width
		const th = this.canvas.height
		const ta = tw / th
		let dw, dh
		if (sa > ta) {
			dw = tw
			dh = tw / sa
		} else {
			dw = th * sa
			dh = th
		}
		const dx = Math.floor((tw - dw) * 0.5)
		const dy = Math.floor((th - dh) * 0.5)
		this.drawManual(source, dx, dy, Math.floor(dw), Math.floor(dh), quality)
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

	setPixels(data, w, h) {
		this.resize(w, h)
		this.pixels.length = 0
		let idx = 0
		for (let i = 0; i < data.length; i += 4) {
			const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3] / 255.0
			this.pixels[idx++] = { r, g, b, a, v: toGray(r, g, b) }
		}
		this.writePixels()
		return this
	}

	loadPixels() {
		this.pixels.length = 0
		const w = this.canvas.width
		const h = this.canvas.height
		const data = this.ctx.getImageData(0, 0, w, h).data
		let idx = 0
		for (let i = 0; i < data.length; i += 4) {
			const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3] / 255.0
			this.pixels[idx++] = { r, g, b, a, v: toGray(r, g, b) }
		}
		return this
	}

	process(callback) {
		for (let i = 0; i < this.pixels.length; i++) callback(i, this.pixels[i])
	}

	copy(source, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight) {
		sx = sx || 0; sy = sy || 0
		sWidth = sWidth || source.videoWidth || source.width
		sHeight = sHeight || source.videoHeight || source.height
		dx = dx || 0; dy = dy || 0
		dWidth = dWidth || this.canvas.width
		dHeight = dHeight || this.canvas.height

		drawImageStepped(this.ctx, source, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight)
		this.loadPixels()
		return this
	}

	center(source, scaleX = 1, scaleY = 1) {
		const s = getElementSize(source)
		const tw = this.canvas.width
		const th = this.canvas.height
		const dw = s.width * scaleX
		const dh = s.height * scaleY
		const dx = (tw - dw) * 0.5
		const dy = (th - dh) * 0.5

		const ctx = this.ctx
		ctx.fillStyle = 'black'
		ctx.fillRect(0, 0, tw, th)
		drawImageStepped(ctx, source, 0, 0, s.width, s.height, dx, dy, dw, dh)
		this.loadPixels()
		return this
	}
}
