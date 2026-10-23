import { ref, unref } from 'vue';
import { clampZoom } from '@/store/WorkspaceStore';

const TOUCH_DELAY_MS = 150; // Increased to prevent accidental marks during zoom
const TOUCH_MOVE_THRESHOLD = 5; // Pixels to move before immediate paint start


// options.activeTool: a ref to the active tool object (src/tools); its kind/id/instant decide how pointers behave.
export function useEditorInteractions(options) {
  const {
    containerRef,
    displayRef,
    activeTool,
    editZoom,
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
  let _lastClientX = null;
  let _lastClientY = null;
  let _pendingZoomScroll = null;
  let _lastTouchDistance = null;
  let _initialPinchZoom = null;
  let _initialZoom = null;
  let _isMiddleClick = false;
  let _touchStartTimer = null;
  let _pendingTouch = null;

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
    if (tool.id === 'zoom' && !disableZoom && !_isMiddleClick) {
      _initialZoom = unref(editZoom);
    }
    
    if (event.pointerId !== undefined && event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    window.addEventListener('pointermove', onMouseMove);
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
    window.addEventListener('pointermove', onMouseMove);
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
    
    if (event.pointerId !== undefined && event.currentTarget) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    window.addEventListener('pointermove', onMouseMove);
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

    // Safari fix: if focus is stuck in a dropdown/select, the first click on the 
    // canvas might be consumed just to clear focus. Proactively blurring 
    // helps ensure the event is processed immediately. 
    // We also use a debounce to allow both mousedown and pointerdown to be 
    // mapped to this function without double-firing.
    if (Date.now() - _lastInteractionTime < 50) return;
    _lastInteractionTime = Date.now();

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

    if (_pendingZoomScroll) _pendingZoomScroll.cancelled = true;
    const pending = { cancelled: false };
    _pendingZoomScroll = pending;

    callbacks.onZoomChange(newZoom);

    // rAF fires after Vue has flushed DOM updates (canvas resized, workspace padding
    // recalculated) AND after the browser has run layout. Reading getBoundingClientRect()
    // here is reliable in all browsers — nextTick (microtask) causes stale layout reads in Safari.
    requestAnimationFrame(() => {
      if (pending.cancelled) return;
      _pendingZoomScroll = null;

      // Scroll so the anchor lands back under the pointer.
      const { fx, fy, clientX: px, clientY: py } = _zoomAnchor;
      const rect = displayEl.getBoundingClientRect();
      scrollEl.scrollLeft += (rect.left + fx * rect.width) - px;
      scrollEl.scrollTop += (rect.top + fy * rect.height) - py;
      _refreshMousePos();
    });
  }

  function onMouseMove(event) {
    if (event.pointerType === 'touch') return;

    const { clientX, clientY } = _getPointerPos(event);
    _updatePointerPos(clientX, clientY);

    const pos = callbacks.pixelCoordsAt(event);

    if (!isPainting.value) return;

    const tool = unref(activeTool);

    if (_isMiddleClick || tool.kind === 'navigate') {
      if (_isMiddleClick || tool.id === 'hand') {
        const dx = _lastMousePos.clientX - clientX;
        const dy = _lastMousePos.clientY - clientY;

        const scrollEl = _getScrollParent();
        if (scrollEl) {
          scrollEl.scrollLeft += dx;
          scrollEl.scrollTop += dy;
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

    const prev = _lastPos || pos;
    _lastPos = pos;
    callbacks.onPaintMove(prev, pos);
  }

  function commitPaint() {
    if (_touchStartTimer) {
      clearTimeout(_touchStartTimer);
      _touchStartTimer = null;
      _pendingTouch = null;
    }

    if (!isPainting.value) return;
    isPainting.value = false;
    if (workspaceStore) workspaceStore.isPainting = false;

    _lastPos = null;
    _lastMousePos = null;
    _isMiddleClick = false;
    if (workspaceStore) {
      workspaceStore.isMiddleClick = false;
    }
    window.removeEventListener('pointermove', onMouseMove);
    window.removeEventListener('pointerup', commitPaint);
    window.removeEventListener('pointercancel', commitPaint);
    callbacks.onPaintEnd();
  }

  function handleTouchStart(event) {
    const tool = unref(activeTool);

    if (event.touches.length === 1) {
      // Immediate tools (navigation and single-tap actions)
      if (tool.instant) {
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
        commitPaint();
      }
      _lastTouchDistance = _getTouchDistance(event.touches);
      _initialPinchZoom = unref(editZoom);
      _zoomAnchor = null;
      
      if (event.cancelable) event.preventDefault();
    }
  }

  function handleTouchMove(event) {
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
        commitPaint();
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
    if (_touchStartTimer) {
      clearTimeout(_touchStartTimer);
      _touchStartTimer = null;
      _pendingTouch = null;
    }

    if (isPainting.value && event.touches.length === 0) {
      commitPaint();
    }
    _lastTouchDistance = null;
  }

  function handleTouchCancel() {
    commitPaint();
  }

  function handleWheel(event) {
    const scrollEl = _getScrollParent();

    if (event.ctrlKey && !disableZoom) {
      event.preventDefault();
      const oldZoom = unref(editZoom) || 1;

      const delta = -event.deltaY * 0.01;
      const newZoom = oldZoom * (1 + delta);
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
