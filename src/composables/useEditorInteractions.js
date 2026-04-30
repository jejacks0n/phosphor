import { ref, unref } from 'vue';

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

  const isPainting = ref(false);
  const mousePos = ref({ x: 0, y: 0 });
  const isMouseOver = ref(false);

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

  function interpolatedPositions(x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.ceil(dist * 2); // 0.5px steps for smoothness
    if (steps === 0) return [{ x: x1, y: y1 }];
    const positions = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      positions.push({
        x: x0 + t * dx,
        y: y0 + t * dy,
      });
    }
    return positions;
  }

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
    if (tool === 'zoom' && !disableZoom && !_isMiddleClick) {
      _initialZoom = unref(editZoom);
    }
    
    if (event.pointerId !== undefined) {
      event.target.setPointerCapture(event.pointerId);
    }
    window.addEventListener('pointermove', onMouseMove);
    window.addEventListener('pointerup', commitPaint);
  }

  function _startPicking(event, pos) {
    if (event.preventDefault) {
      event.preventDefault();
      event.stopPropagation();
    }
    isPainting.value = true;
    if (workspaceStore) workspaceStore.isPainting = true;

    callbacks.onColorPick(pos);
    if (event.pointerId !== undefined) {
      event.target.setPointerCapture(event.pointerId);
    }
    window.addEventListener('pointermove', onMouseMove);
    window.addEventListener('pointerup', commitPaint);
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
    
    if (event.pointerId !== undefined) {
      event.target.setPointerCapture(event.pointerId);
    }
    window.addEventListener('pointermove', onMouseMove);
    window.addEventListener('pointerup', commitPaint);
  }

  function _updatePointerPos(clientX, clientY) {
    _lastClientX = clientX;
    _lastClientY = clientY;

    const displayEl = unref(displayRef);
    if (!displayEl) return;
    const rect = displayEl.getBoundingClientRect();
    mousePos.value = {
      x: clientX - rect.left,
      y: clientY - rect.top,
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

    if (event.preventDefault) event.preventDefault();
    const tool = unref(activeTool);
    const pos = callbacks.pixelCoordsAt(event);
    _isMiddleClick = (event.type === 'mousedown' || event.type === 'pointerdown') && event.button === 1;

    if (_isMiddleClick) {
      if (event.preventDefault) event.preventDefault();
      if (workspaceStore) workspaceStore.isMiddleClick = true;
      _startNavigation(event);
      return;
    }

    if (tool === 'hand' || tool === 'zoom') {
      _startNavigation(event);
      return;
    }

    if (!pos) return;

    if (tool === 'picker') {
      _startPicking(event, pos);
    } else {
      _startPainting(event, pos);
    }
  }

  function _zoomToPoint(newZoom, clientX, clientY) {
    const scrollEl = _getScrollParent();
    const displayEl = unref(displayRef);

    if (!scrollEl || !displayEl) {
      callbacks.onZoomChange(newZoom);
      return;
    }

    const oldZoom = unref(editZoom);
    const scrollRect = scrollEl.getBoundingClientRect();
    const canvasRect = displayEl.getBoundingClientRect();

    // Cursor position relative to canvas origin and scroll container — read pre-zoom
    // so they stay stable as the reference point across the async correction below.
    const canvasX = clientX - canvasRect.left;
    const canvasY = clientY - canvasRect.top;
    const viewportX = clientX - scrollRect.left;
    const viewportY = clientY - scrollRect.top;
    const zoomRatio = newZoom / oldZoom;

    if (_pendingZoomScroll) _pendingZoomScroll.cancelled = true;
    const pending = { cancelled: false };
    _pendingZoomScroll = pending;

    callbacks.onZoomChange(newZoom);

    // rAF fires after Vue has flushed DOM updates (canvas resized, workspace padding
    // recalculated) AND after the browser has run layout. Reading getBoundingClientRect()
    // here is reliable in all browsers — nextTick (microtask) causes stale layout reads
    // in Safari, leading to accumulated float drift on repeated zooms.
    requestAnimationFrame(() => {
      if (pending.cancelled) return;
      _pendingZoomScroll = null;

      const newCanvasRect = displayEl.getBoundingClientRect();
      const currentScrollRect = scrollEl.getBoundingClientRect();
      // Canvas origin in content space after the zoom change.
      const canvasContentX = scrollEl.scrollLeft + (newCanvasRect.left - currentScrollRect.left);
      const canvasContentY = scrollEl.scrollTop + (newCanvasRect.top - currentScrollRect.top);
      scrollEl.scrollLeft = canvasContentX + canvasX * zoomRatio - viewportX;
      scrollEl.scrollTop = canvasContentY + canvasY * zoomRatio - viewportY;
      _refreshMousePos();
    });
  }

  function onMouseMove(event) {
    const { clientX, clientY } = _getPointerPos(event);
    _updatePointerPos(clientX, clientY);

    const pos = callbacks.pixelCoordsAt(event);

    if (!isPainting.value) return;

    const tool = unref(activeTool);

    if (_isMiddleClick || tool === 'hand' || tool === 'zoom') {
      if (_isMiddleClick || tool === 'hand') {
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
        const cappedZoom = Math.max(1, Math.min(16, newZoom));
        
        _zoomToPoint(cappedZoom, _lastMousePos.clientX, _lastMousePos.clientY);
      }
      return;
    }

    if (!pos) return;

    if (tool === 'picker') {
      callbacks.onColorPick(pos);
      return;
    }

    const prev = _lastPos || pos;
    _lastPos = pos;
    callbacks.onPaintMove(prev, pos);
  }

  function commitPaint() {
    if (!isPainting.value) return;
    isPainting.value = false;
    if (workspaceStore) workspaceStore.isPainting = false;

    _lastPos = null;
    _lastMousePos = null;
    _isMiddleClick = false;
    if (workspaceStore) {
      workspaceStore.isMiddleClick = false;
    }
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', commitPaint);
    window.removeEventListener('pointermove', onMouseMove);
    window.removeEventListener('pointerup', commitPaint);
    callbacks.onPaintEnd();
  }

  function handleTouchStart(event) {
    if (event.touches.length === 1) {
      startPaint(event);
    } else if (event.touches.length === 2) {
      _lastTouchDistance = unref(_getTouchDistance(event.touches));
      _initialPinchZoom = unref(editZoom);
    }
  }

  function handleTouchMove(event) {
    if (event.touches.length === 1) {
      if (isPainting.value) {
        onMouseMove(event);
      }
    } else if (event.touches.length === 2 && _lastTouchDistance !== null && !disableZoom) {
      event.preventDefault();

      const distance = _getTouchDistance(event.touches);
      const ratio = distance / _lastTouchDistance;
      const newZoom = _initialPinchZoom * ratio;
      
      const cappedZoom = Math.max(0.1, Math.min(16, newZoom));
      const center = _getTouchCenter(event.touches);
      
      _updatePointerPos(center.x, center.y);
      _zoomToPoint(cappedZoom, center.x, center.y);
    }
  }

  function handleTouchEnd(event) {
    if (isPainting.value && event.touches.length === 0) {
      commitPaint();
    }
    _lastTouchDistance = null;
  }

  function handleWheel(event) {
    const scrollEl = _getScrollParent();

    if (event.ctrlKey && !disableZoom) {
      event.preventDefault();
      const oldZoom = unref(editZoom) || 1;

      const delta = -event.deltaY * 0.01;
      const newZoom = oldZoom * (1 + delta);
      const cappedZoom = Math.max(1, Math.min(16, newZoom));

      _updatePointerPos(event.clientX, event.clientY);
      _zoomToPoint(cappedZoom, event.clientX, event.clientY);
      return;
    }

    if (scrollEl) {
      event.preventDefault();
      scrollEl.scrollLeft += event.deltaX;
      scrollEl.scrollTop += event.deltaY;

      _updatePointerPos(event.clientX, event.clientY);
    }
  }

  function zoomToViewCenter(newZoom) {
    const scrollEl = _getScrollParent();
    if (!scrollEl) {
      callbacks.onZoomChange(newZoom);
      return;
    }
    const scrollRect = scrollEl.getBoundingClientRect();
    const centerX = scrollRect.left + scrollEl.clientWidth / 2;
    const centerY = scrollRect.top + scrollEl.clientHeight / 2;
    _zoomToPoint(newZoom, centerX, centerY);
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
    isMouseOver,
    interpolatedPositions,
    startPaint,
    onMouseMove,
    commitPaint,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleWheel,
    centerContent,
    zoomToViewCenter,
    updateMousePos,
  };
}
