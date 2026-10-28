import { ref, unref } from 'vue';

const TOUCH_DELAY_MS = 150; // a touch waits this long before drawing, in case a second finger makes it a pinch
const TOUCH_MOVE_THRESHOLD = 5; // Pixels to move before immediate paint start
// A pen's tap wobbles: its moves count once it's this many pixels from where it touched down, so a
// tap that crosses a cell edge still places the Edit Mode cursor instead of selecting two cells.
const PEN_SLOP = 6;
// A drag with a tool that asks for it (autoScroll: Select) scrolls the view when it nears an edge:
// from EDGE_PX inside it, faster the further in or past, up to EDGE_MAX_SPEED px a 60 Hz frame. Each
// step covers the time since the last (at most EDGE_MAX_STEP_MS, so a stall doesn't jump), so it's as
// fast on a slow machine or a 120 Hz display.
const EDGE_PX = 24;
const EDGE_MAX_SPEED = 40;
const EDGE_MAX_STEP_MS = 100;
const edgeSpeed = (p, lo, hi) => {
  const into = p < lo + EDGE_PX ? p - (lo + EDGE_PX) : p > hi - EDGE_PX ? p - (hi - EDGE_PX) : 0;
  return Math.sign(into) * Math.min(EDGE_MAX_SPEED, Math.ceil(Math.abs(into) / 2));
};
// Whole pixels to scroll for a step ms after the last; a quick frame near the edge still moves one.
export const edgeStep = (p, lo, hi, ms) => {
  const px = edgeSpeed(p, lo, hi) * Math.min(ms, EDGE_MAX_STEP_MS) * 60 / 1000;
  return Math.sign(px) * Math.max(1, Math.round(Math.abs(px)));
};
// iPad Safari sends an Apple Pencil's touches (touchType 'stylus') alongside its pen pointer events.
// The pointer events are its stroke; its touches would start it a second time (a Select drag would
// then grab the cell or two it had just selected and move them).
const isStylus = (event) => Array.prototype.some.call(event.changedTouches ?? [], (t) => t.touchType === 'stylus');


// options.activeTool: a ref to the active tool object (src/tools); its kind and id decide how pointers behave.
export function useEditorInteractions(options) {
  const {
    containerRef,
    displayRef,
    activeTool,
    editZoom,
    clampZoom,
    callbacks,
    workspaceStore,
    disableZoom = false
  } = options;

  const isIOS = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );

  const isPainting = ref(false);
  const mousePos = ref(null);

  // Internal state
  let _lastPos = null;
  let _lastMousePos = null;
  // A Hand (or middle-button) drag: where it began, the pointer and the scroll then, and the scroll it
  // last set. Each step sets the scroll from the start, not by adding the step's move to the scroll:
  // the browser rounds a scroll position (to whole or half pixels), and that rounding added up over a
  // drag's many small steps, so the picture didn't follow the pointer (a trackpad's tiny sideways
  // moves on a straight up-and-down drag walked it across).
  let _pan = null; // { el, clientX, clientY, left, top, setLeft, setTop }
  let _lastClientX = null;
  let _lastClientY = null;
  let _pendingZoomScroll = null;
  let _lastTouchDistance = null;
  let _initialPinchZoom = null;
  let _initialZoom = null;
  let _isMiddleClick = false;
  let _touchStartTimer = null;
  let _pendingTouch = null;
  let _edgeFrame = null; // the next edge-scroll step, while a drag is at an edge
  let _edgeTime = null;  // when the last edge-scroll step ran, while they run
  let _penDown = null;   // { clientX, clientY } where a pen stroke began, until it moves past PEN_SLOP

  function _getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function _getTouchCenter(touches) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  }

  function _getPointerPos(event) {
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    return { clientX, clientY };
  }

  function _startNavigation(event) {
    const tool = unref(activeTool);
    isPainting.value = true;
    if (workspaceStore) workspaceStore.isPainting = true;

    _lastMousePos = _getPointerPos(event);
    _pan = null;
    if (tool.id === 'zoom' && !disableZoom && !_isMiddleClick) {
      _initialZoom = unref(editZoom);
    }

    if (event.pointerId !== undefined && event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    window.addEventListener('pointerup', commitPaint);
    window.addEventListener('pointercancel', commitPaint);
  }

  function _startPicking(event, pos) {
    if (event.preventDefault) {
      event.preventDefault();
      event.stopPropagation();
    }
    isPainting.value = true;
    if (workspaceStore) workspaceStore.isPainting = true;

    callbacks.onColorPick(pos, event);
    if (event.pointerId !== undefined && event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    window.addEventListener('pointerup', commitPaint);
    window.addEventListener('pointercancel', commitPaint);
  }

  function _startPainting(event, pos) {
    const shouldContinue = callbacks.onPaintStart(event, pos);
    if (shouldContinue === false) {
      _lastPos = null;
      return;
    }

    isPainting.value = true;
    if (workspaceStore) workspaceStore.isPainting = true;

    _lastPos = pos;
    _penDown = event.pointerType === 'pen' ? _getPointerPos(event) : null;

    if (event.pointerId !== undefined && event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    window.addEventListener('pointerup', commitPaint);
    window.addEventListener('pointercancel', commitPaint);
  }

  function _updatePointerPos(clientX, clientY) {
    _lastClientX = clientX;
    _lastClientY = clientY;

    const displayEl = unref(displayRef);
    if (!displayEl) return;
    const rect = displayEl.getBoundingClientRect();
    // From inside the display's border (the ANSI view's pre has one), where the content starts.
    mousePos.value = {
      x: clientX - rect.left - displayEl.clientLeft,
      y: clientY - rect.top - displayEl.clientTop,
    };
  }

  function _refreshMousePos() {
    if (_lastClientX === null || _lastClientY === null) return;
    _updatePointerPos(_lastClientX, _lastClientY);
  }

  function _getScrollParent() {
    let el = unref(containerRef);
    if (el && el.$el) el = el.$el;

    if (el && (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)) {
      return el;
    }
    let scrollEl = el ? el.parentElement : null;
    while (scrollEl) {
      const style = window.getComputedStyle(scrollEl);
      if (/(auto|scroll)/.test(style.overflow + style.overflowX + style.overflowY)) {
        return scrollEl;
      }
      if (scrollEl.tagName === 'BODY') break;
      scrollEl = scrollEl.parentElement;
    }
    return null;
  }

  function centerContent() {
    const scrollEl = _getScrollParent();
    if (!scrollEl) return;
    scrollEl.scrollLeft = (scrollEl.scrollWidth - scrollEl.clientWidth) / 2;
    scrollEl.scrollTop = (scrollEl.scrollHeight - scrollEl.clientHeight) / 2;
  }

  let _lastInteractionTime = 0;
  function startPaint(event) {
    // Ignore touch-based pointer events to let handleTouchStart manage them
    // with the appropriate delay and multi-touch logic.
    if (event.pointerType === 'touch') return;
    if (event.button === 2) return; // the right button draws nothing

    // Safari fix: if focus is stuck in a dropdown/select, the first click on the
    // canvas might be consumed just to clear focus. Proactively blurring
    // helps ensure the event is processed immediately.
    // Both mousedown and pointerdown are mapped to this function: the mousedown a browser sends right
    // after a pointerdown (the same press) is dropped; two pointerdowns are two presses, however quick.
    if (event.type === 'mousedown' && Date.now() - _lastInteractionTime < 50) return;
    if (event.type === 'pointerdown') _lastInteractionTime = Date.now();

    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }

    // Explicitly focus the container if it's focusable (helps Safari/keyboard sync)
    if (event.currentTarget && typeof event.currentTarget.focus === 'function') {
      event.currentTarget.focus();
    }

    const tool = unref(activeTool);

    if (event.preventDefault) event.preventDefault();
    const pos = callbacks.pixelCoordsAt(event);
    _isMiddleClick = (event.type === 'mousedown' || event.type === 'pointerdown') && event.button === 1;

    if (_isMiddleClick) {
      if (event.preventDefault) event.preventDefault();
      if (workspaceStore) workspaceStore.isMiddleClick = true;
      _startNavigation(event);
      return;
    }

    if (tool.kind === 'navigate') {
      _startNavigation(event);
      return;
    }

    if (!pos) return;

    if (tool.kind === 'pick') {
      _startPicking(event, pos);
    } else {
      _startPainting(event, pos);
    }
  }

  // The point on the content (as a fraction of the display element) that stays under the pointer for a
  // whole zoom gesture. Re-reading it from the layout on every step would compound scroll rounding (WebKit
  // stores whole-pixel scroll offsets) into a steady drift of the content toward the bottom-right.
  let _zoomAnchor = null; // { fx, fy, clientX, clientY, time }
  const ZOOM_GESTURE_GAP_MS = 300;

  // follow: keep the gesture's anchor even though the pointer moved (a pinch's midpoint pans the content)
  function _zoomToPoint(newZoom, clientX, clientY, { follow = false } = {}) {
    const scrollEl = _getScrollParent();
    const displayEl = unref(displayRef);

    if (!scrollEl || !displayEl) {
      callbacks.onZoomChange(newZoom);
      return;
    }

    const now = performance.now();
    const anchor = _zoomAnchor;
    // While a correction is still pending the layout is half-applied, so it can't supply a new anchor:
    // the gesture continues (the anchor follows the pointer) until that correction lands.
    const sameGesture = anchor && (_pendingZoomScroll || (now - anchor.time < ZOOM_GESTURE_GAP_MS &&
      (follow || (Math.abs(anchor.clientX - clientX) < 2 && Math.abs(anchor.clientY - clientY) < 2))));
    if (!sameGesture) {
      const rect = displayEl.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        _zoomAnchor = null;
        callbacks.onZoomChange(newZoom);
        return;
      }
      _zoomAnchor = { fx: (clientX - rect.left) / rect.width, fy: (clientY - rect.top) / rect.height };
    }
    Object.assign(_zoomAnchor, { clientX, clientY, time: now });

    if (_pendingZoomScroll) _pendingZoomScroll.canceled = true;
    const pending = { canceled: false };
    _pendingZoomScroll = pending;

    callbacks.onZoomChange(newZoom);

    // rAF fires after Vue has flushed DOM updates (canvas resized, workspace padding
    // recalculated) AND after the browser has run layout. Reading getBoundingClientRect()
    // here is reliable in all browsers — nextTick (microtask) causes stale layout reads in Safari.
    requestAnimationFrame(() => {
      if (pending.canceled) return;
      _pendingZoomScroll = null;

      // Scroll so the anchor lands back under the pointer.
      const { fx, fy, clientX: px, clientY: py } = _zoomAnchor;
      const rect = displayEl.getBoundingClientRect();
      scrollEl.scrollLeft += (rect.left + fx * rect.width) - px;
      scrollEl.scrollTop += (rect.top + fy * rect.height) - py;
      _refreshMousePos();
    });
  }

  // The viewport's pointermove. A stroke captures the pointer, so its moves come here even off the
  // viewport, once each.
  function onMouseMove(event) {
    if (event.pointerType === 'touch') return;

    const { clientX, clientY } = _getPointerPos(event);
    _updatePointerPos(clientX, clientY);

    const pos = callbacks.pixelCoordsAt(event);

    if (!isPainting.value) return;

    const tool = unref(activeTool);

    if (_isMiddleClick || tool.kind === 'navigate') {
      if (_isMiddleClick || tool.id === 'hand') {
        const scrollEl = _getScrollParent();
        if (scrollEl) {
          // Something else moved the view (a zoom, a resize): go on from where it is now.
          if (_pan?.el !== scrollEl || scrollEl.scrollLeft !== _pan.setLeft || scrollEl.scrollTop !== _pan.setTop) {
            _pan = { el: scrollEl, clientX: _lastMousePos.clientX, clientY: _lastMousePos.clientY, left: scrollEl.scrollLeft, top: scrollEl.scrollTop };
          }
          scrollEl.scrollLeft = _pan.left + _pan.clientX - clientX;
          scrollEl.scrollTop = _pan.top + _pan.clientY - clientY;
          _pan.setLeft = scrollEl.scrollLeft;
          _pan.setTop = scrollEl.scrollTop;
        }

        _lastMousePos = { clientX, clientY };
        _refreshMousePos();
      } else if (!disableZoom) {
        const dx = clientX - _lastMousePos.clientX;
        const sensitivity = 0.01;
        const newZoom = _initialZoom + (dx * sensitivity);
        _zoomToPoint(clampZoom(newZoom), _lastMousePos.clientX, _lastMousePos.clientY);
      }
      return;
    }

    if (!pos) return;

    if (tool.kind === 'pick') {
      callbacks.onColorPick(pos, event);
      return;
    }

    if (_penDown) {
      if (Math.hypot(clientX - _penDown.clientX, clientY - _penDown.clientY) < PEN_SLOP) return;
      _penDown = null; // a drag: it goes on from where it began
    }
    const prev = _lastPos || pos;
    _lastPos = pos;
    callbacks.onPaintMove(prev, pos);
    if (tool.autoScroll && !_edgeFrame) _edgeFrame = requestAnimationFrame(_edgeScroll);
  }

  // A frame of scrolling at the edge, and the tool told where the pointer now is over the content.
  // It stops when the pointer leaves the edge, the view can't scroll further, or the drag ends.
  function _edgeScroll(now) {
    _edgeFrame = null;
    const ms = _edgeTime === null ? 1000 / 60 : now - _edgeTime;
    _edgeTime = null;
    const scrollEl = _getScrollParent();
    if (!isPainting.value || !scrollEl || _lastClientX === null) return;
    const r = scrollEl.getBoundingClientRect();
    const { scrollLeft, scrollTop } = scrollEl;
    scrollEl.scrollLeft += edgeStep(_lastClientX, r.left, r.right, ms);
    scrollEl.scrollTop += edgeStep(_lastClientY, r.top, r.bottom, ms);
    if (scrollEl.scrollLeft === scrollLeft && scrollEl.scrollTop === scrollTop) return;
    _refreshMousePos();
    const pos = callbacks.pixelCoordsAt({ clientX: _lastClientX, clientY: _lastClientY });
    if (pos) {
      callbacks.onPaintMove(_lastPos || pos, pos);
      _lastPos = pos;
    }
    _edgeTime = now;
    _edgeFrame = requestAnimationFrame(_edgeScroll);
  }

  // Ends the stroke: the tool applies it (its end), or with cancel drops what it can (onPaintCancel).
  function commitPaint(event, { cancel = false } = {}) {
    if (_touchStartTimer) {
      clearTimeout(_touchStartTimer);
      _touchStartTimer = null;
      _pendingTouch = null;
    }

    if (!isPainting.value) return;
    isPainting.value = false;
    if (workspaceStore) workspaceStore.isPainting = false;
    cancelAnimationFrame(_edgeFrame);
    _edgeFrame = null;
    _edgeTime = null;

    _lastPos = null;
    _lastMousePos = null;
    _penDown = null;
    _isMiddleClick = false;
    if (workspaceStore) {
      workspaceStore.isMiddleClick = false;
    }
    window.removeEventListener('pointerup', commitPaint);
    window.removeEventListener('pointercancel', commitPaint);
    if (cancel) callbacks.onPaintCancel();
    else callbacks.onPaintEnd();
  }

  function handleTouchStart(event) {
    if (isStylus(event)) return;
    const tool = unref(activeTool);

    if (event.touches.length === 1) {
      // Navigation starts at once; every other tool waits, so a second finger (a pinch) can arrive first.
      if (tool.kind === 'navigate') {
        startPaint(event);
        return;
      }

      const touch = event.touches[0];
      _pendingTouch = {
        type: 'touchstart',
        touches: [{ clientX: touch.clientX, clientY: touch.clientY }],
        target: event.target,
        currentTarget: event.currentTarget,
        preventDefault: () => { if (event.cancelable) event.preventDefault(); },
        stopPropagation: () => event.stopPropagation(),
      };

      if (_touchStartTimer) clearTimeout(_touchStartTimer);
      _touchStartTimer = setTimeout(() => {
        _touchStartTimer = null;
        if (_pendingTouch) {
          startPaint(_pendingTouch);
          _pendingTouch = null;
        }
      }, TOUCH_DELAY_MS);

      // Prevent native scroll initiation for drawing tools
      if (!(isIOS && tool.id === 'hand')) {
        if (event.cancelable) event.preventDefault();
      }
    } else if (event.touches.length === 2) {
      if (_touchStartTimer) {
        clearTimeout(_touchStartTimer);
        _touchStartTimer = null;
        _pendingTouch = null;
      }

      // If we were painting with one finger and a second one goes down,
      // cancel the paint to avoid accidental marks during pinch/zoom.
      if (isPainting.value) {
        commitPaint(null, { cancel: true });
      }
      _lastTouchDistance = _getTouchDistance(event.touches);
      _initialPinchZoom = unref(editZoom);
      _zoomAnchor = null;

      if (event.cancelable) event.preventDefault();
    }
  }

  function handleTouchMove(event) {
    if (isStylus(event)) return;
    if (event.touches.length === 1) {
      if (_touchStartTimer && _pendingTouch) {
        // If finger moved significantly, start painting immediately
        const touch = event.touches[0];
        const dx = touch.clientX - _pendingTouch.touches[0].clientX;
        const dy = touch.clientY - _pendingTouch.touches[0].clientY;
        if (Math.sqrt(dx*dx + dy*dy) > TOUCH_MOVE_THRESHOLD) {
          clearTimeout(_touchStartTimer);
          _touchStartTimer = null;
          startPaint(_pendingTouch);
          _pendingTouch = null;
        } else {
          // Even before starting paint, prevent scrolling if it's a drawing tool
          const tool = unref(activeTool);
          if (!(isIOS && tool.id === 'hand')) {
            if (event.cancelable) event.preventDefault();
          }
        }
      }

      if (isPainting.value) {
        if (event.cancelable) event.preventDefault();
        onMouseMove(event);
      }
    } else if (event.touches.length >= 2) {
      // If we transitioned to multi-touch while painting, ensure we stop
      if (isPainting.value) {
        commitPaint(null, { cancel: true });
      }

      if (event.touches.length === 2 && _lastTouchDistance !== null && !disableZoom) {
        event.preventDefault();

        const distance = _getTouchDistance(event.touches);
        const ratio = distance / _lastTouchDistance;
        const newZoom = _initialPinchZoom * ratio;

        const cappedZoom = clampZoom(newZoom);
        const center = _getTouchCenter(event.touches);

        _updatePointerPos(center.x, center.y);
        _zoomToPoint(cappedZoom, center.x, center.y, { follow: true });
      }
    }
  }

  function handleTouchEnd(event) {
    if (isStylus(event)) return;
    if (_touchStartTimer) {
      clearTimeout(_touchStartTimer);
      _touchStartTimer = null;
      // A tap shorter than the delay: its stroke starts (and ends, below) now.
      if (_pendingTouch && event.touches.length === 0) startPaint(_pendingTouch);
      _pendingTouch = null;
    }

    if (isPainting.value && event.touches.length === 0) {
      commitPaint();
    }
    _lastTouchDistance = null;
  }

  function handleTouchCancel(event) {
    if (isStylus(event)) return;
    commitPaint();
  }

  function handleWheel(event) {
    const scrollEl = _getScrollParent();

    if (event.ctrlKey && !disableZoom) {
      event.preventDefault();
      const oldZoom = unref(editZoom) || 1;

      // Exponential, so a notch out undoes a notch in (and never reaches zero).
      const newZoom = oldZoom * Math.exp(-event.deltaY * 0.01);
      _updatePointerPos(event.clientX, event.clientY);
      _zoomToPoint(clampZoom(newZoom), event.clientX, event.clientY);
      return;
    }

    if (scrollEl) {
      event.preventDefault();
      scrollEl.scrollLeft += event.deltaX;
      scrollEl.scrollTop += event.deltaY;

      _updatePointerPos(event.clientX, event.clientY);
    }
  }

  function updateMousePos(event) {
    if (!event) return;
    const { clientX, clientY } = _getPointerPos(event);
    if (clientX === undefined || clientY === undefined) return;
    _updatePointerPos(clientX, clientY);
  }

  return {
    isPainting,
    mousePos,
    startPaint,
    onMouseMove,
    commitPaint,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    handleWheel,
    centerContent,
    updateMousePos,
  };
}
