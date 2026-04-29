import { ref, unref, nextTick } from 'vue';

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

  function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getTouchCenter(touches) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  }

  function refreshMousePos() {
    if (_lastClientX === null || _lastClientY === null) return;
    const displayEl = unref(displayRef);
    if (!displayEl) return;
    const rect = displayEl.getBoundingClientRect();
    mousePos.value = {
      x: _lastClientX - rect.left,
      y: _lastClientY - rect.top,
    };
  }

  function getScrollParent() {
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
    const scrollEl = getScrollParent();
    if (!scrollEl) return;
    scrollEl.scrollLeft = (scrollEl.scrollWidth - scrollEl.clientWidth) / 2;
    scrollEl.scrollTop = (scrollEl.scrollHeight - scrollEl.clientHeight) / 2;
  }

  function startPaint(event) {
    const tool = unref(activeTool);
    const pos = callbacks.pixelCoordsAt(event);
    _isMiddleClick = (event.type === 'mousedown' || event.type === 'pointerdown') && event.button === 1;
    if (_isMiddleClick) {
      event.preventDefault();
      if (workspaceStore) {
        workspaceStore.isMiddleClick = true;
      }
    }

    if (_isMiddleClick || tool === 'hand' || tool === 'zoom') {
      isPainting.value = true;
      if (workspaceStore) workspaceStore.isPainting = true;

      _lastMousePos = {
        x: event.touches ? event.touches[0].clientX : event.clientX,
        y: event.touches ? event.touches[0].clientY : event.clientY
      };
      if (tool === 'zoom' && !disableZoom && !_isMiddleClick) {
        _initialZoom = unref(editZoom);
      }
      
      if (event.type === 'pointerdown') {
        event.target.setPointerCapture(event.pointerId);
        window.addEventListener('pointermove', onMouseMove);
        window.addEventListener('pointerup', commitPaint);
      } else if (event.type === 'mousedown') {
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', commitPaint);
      }
      return;
    }

    if (!pos) return;

    if (tool === 'picker') {
      if (event.type === 'mousedown' || event.type === 'pointerdown') {
        event.preventDefault();
        event.stopPropagation();
      }
      isPainting.value = true;
      if (workspaceStore) workspaceStore.isPainting = true;

      callbacks.onColorPick(pos);
      if (event.type === 'pointerdown') {
        event.target.setPointerCapture(event.pointerId);
        window.addEventListener('pointermove', onMouseMove);
        window.addEventListener('pointerup', commitPaint);
      } else if (event.type === 'mousedown') {
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', commitPaint);
      }
      return;
    }

    const shouldContinue = callbacks.onPaintStart(event, pos);
    if (shouldContinue === false) {
      _lastPos = null;
      return;
    }

    isPainting.value = true;
    if (workspaceStore) workspaceStore.isPainting = true;

    _lastPos = pos;
    
    if (event.type === 'pointerdown') {
      event.target.setPointerCapture(event.pointerId);
      window.addEventListener('pointermove', onMouseMove);
      window.addEventListener('pointerup', commitPaint);
    } else if (event.type === 'mousedown') {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', commitPaint);
    }
  }

  function zoomToPoint(newZoom, clientX, clientY) {
    const scrollEl = getScrollParent();
    const displayEl = unref(displayRef);

    if (!scrollEl || !displayEl) {
      callbacks.onZoomChange(newZoom);
      return;
    }

    const scrollRect = scrollEl.getBoundingClientRect();
    const canvasRect = displayEl.getBoundingClientRect();
    
    // Position of the point relative to the scroll container's viewport
    const viewportX = clientX - scrollRect.left;
    const viewportY = clientY - scrollRect.top;

    // Current position of the canvas content relative to the scroll container's content
    const canvasContentX = scrollEl.scrollLeft + canvasRect.left - scrollRect.left;
    const canvasContentY = scrollEl.scrollTop + canvasRect.top - scrollRect.top;

    // Where the point is on the canvas (0-1 fraction)
    const fractionX = canvasRect.width > 0 ? (clientX - canvasRect.left) / canvasRect.width : 0.5;
    const fractionY = canvasRect.height > 0 ? (clientY - canvasRect.top) / canvasRect.height : 0.5;

    if (_pendingZoomScroll) _pendingZoomScroll.cancelled = true;
    const pending = { cancelled: false };
    _pendingZoomScroll = pending;

    callbacks.onZoomChange(newZoom);

    nextTick(() => {
      if (pending.cancelled) return;
      _pendingZoomScroll = null;
      const newCanvasRect = displayEl.getBoundingClientRect();
      if (newCanvasRect) {
        scrollEl.scrollLeft = canvasContentX + fractionX * newCanvasRect.width - viewportX;
        scrollEl.scrollTop = canvasContentY + fractionY * newCanvasRect.height - viewportY;
      }
      refreshMousePos();
    });
  }

  function onMouseMove(event) {
    const displayEl = unref(displayRef);
    if (!displayEl) return;

    const rect = displayEl.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;

    _lastClientX = clientX;
    _lastClientY = clientY;

    const pos = callbacks.pixelCoordsAt(event);

    mousePos.value = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };

    if (!isPainting.value) return;

    const tool = unref(activeTool);

    if (_isMiddleClick || tool === 'hand' || tool === 'zoom') {
      if (_isMiddleClick || tool === 'hand') {
        const dx = _lastMousePos.x - clientX;
        const dy = _lastMousePos.y - clientY;

        const scrollEl = getScrollParent();
        if (scrollEl) {
          scrollEl.scrollLeft += dx;
          scrollEl.scrollTop += dy;
        }

        _lastMousePos = { x: clientX, y: clientY };
        refreshMousePos();
      } else if (!disableZoom) {
        const dx = clientX - _lastMousePos.x;
        const sensitivity = 0.01;
        const newZoom = _initialZoom + (dx * sensitivity);
        const cappedZoom = Math.max(1, Math.min(16, newZoom));
        
        zoomToPoint(cappedZoom, _lastMousePos.x, _lastMousePos.y);
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
      _lastTouchDistance = unref(getTouchDistance(event.touches));
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

      const distance = getTouchDistance(event.touches);
      const ratio = distance / _lastTouchDistance;
      const newZoom = _initialPinchZoom * ratio;
      
      const cappedZoom = Math.max(0.1, Math.min(16, newZoom));
      const center = getTouchCenter(event.touches);
      
      _lastClientX = center.x;
      _lastClientY = center.y;

      zoomToPoint(cappedZoom, center.x, center.y);
    }
  }

  function handleTouchEnd(event) {
    if (isPainting.value && event.touches.length === 0) {
      commitPaint();
    }
    _lastTouchDistance = null;
  }

  function handleWheel(event) {
    const scrollEl = getScrollParent();

    if (event.ctrlKey && !disableZoom) {
      event.preventDefault();
      const oldZoom = unref(editZoom) || 1;

      const delta = -event.deltaY * 0.01;
      const newZoom = oldZoom * (1 + delta);
      const cappedZoom = Math.max(1, Math.min(16, newZoom));

      _lastClientX = event.clientX;
      _lastClientY = event.clientY;

      zoomToPoint(cappedZoom, event.clientX, event.clientY);
      return;
    }

    if (scrollEl) {
      event.preventDefault();
      scrollEl.scrollLeft += event.deltaX;
      scrollEl.scrollTop += event.deltaY;

      _lastClientX = event.clientX;
      _lastClientY = event.clientY;
      refreshMousePos();
    }
  }

  function zoomToViewCenter(newZoom) {
    const scrollEl = getScrollParent();
    if (!scrollEl) {
      callbacks.onZoomChange(newZoom);
      return;
    }
    const scrollRect = scrollEl.getBoundingClientRect();
    const centerX = scrollRect.left + scrollEl.clientWidth / 2;
    const centerY = scrollRect.top + scrollEl.clientHeight / 2;
    zoomToPoint(newZoom, centerX, centerY);
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
    _initialZoom,
  };
}
