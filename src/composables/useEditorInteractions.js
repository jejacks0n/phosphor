import { ref, unref, nextTick } from 'vue';

export function useEditorInteractions(options) {
  const {
    containerRef,
    displayRef,
    activeTool,
    editZoom,
    callbacks
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
  let lastTouchDistance = null;
  let lastTouchCenter = null;
  let _initialPinchZoom = null;

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
    const pos = callbacks.pixelCoordsAt(event);
    if (!pos) return;

    const tool = unref(activeTool);

    if (tool === 'hand') {
      isPainting.value = true;
      _lastMousePos = {
        x: event.touches ? event.touches[0].clientX : event.clientX,
        y: event.touches ? event.touches[0].clientY : event.clientY
      };
      if (event.type === 'mousedown') {
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', commitPaint);
      }
      return;
    }

    if (tool === 'picker') {
      if (event.type === 'mousedown') {
        event.preventDefault();
        event.stopPropagation();
      }
      isPainting.value = true;
      callbacks.onColorPick(pos);
      if (event.type === 'mousedown') {
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
    _lastPos = pos;
    
    if (event.type === 'mousedown') {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', commitPaint);
    }
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

    if (tool === 'hand') {
      const dx = _lastMousePos.x - clientX;
      const dy = _lastMousePos.y - clientY;

      const scrollEl = getScrollParent();
      if (scrollEl) {
        scrollEl.scrollLeft += dx;
        scrollEl.scrollTop += dy;
      }

      _lastMousePos = { x: clientX, y: clientY };
      refreshMousePos();
      return;
    }

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
    _lastPos = null;
    _lastMousePos = null;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', commitPaint);
    callbacks.onPaintEnd();
  }

  function handleTouchStart(event) {
    if (event.touches.length === 1) {
      startPaint(event);
    } else if (event.touches.length === 2) {
      lastTouchDistance = getTouchDistance(event.touches);
      lastTouchCenter = getTouchCenter(event.touches);
      _initialPinchZoom = unref(editZoom);
    }
  }

  function handleTouchMove(event) {
    if (event.touches.length === 1) {
      if (isPainting.value) {
        onMouseMove(event);
      }
    } else if (event.touches.length === 2 && lastTouchDistance !== null) {
      event.preventDefault();

      const scrollEl = getScrollParent();

      const distance = getTouchDistance(event.touches);
      const ratio = distance / lastTouchDistance;
      const newZoom = _initialPinchZoom * ratio;
      
      const cappedZoom = Math.max(0.1, Math.min(16, newZoom));
      callbacks.onZoomChange(cappedZoom);

      const center = getTouchCenter(event.touches);
      _lastClientX = center.x;
      _lastClientY = center.y;

      if (scrollEl) {
        const displayEl = unref(displayRef);
        const scrollRect = scrollEl.getBoundingClientRect();
        const viewportX = center.x - scrollRect.left;
        const viewportY = center.y - scrollRect.top;
        const canvasRect = displayEl ? displayEl.getBoundingClientRect() : null;

        const canvasContentX = canvasRect ? scrollEl.scrollLeft + canvasRect.left - scrollRect.left : scrollEl.scrollLeft + viewportX;
        const canvasContentY = canvasRect ? scrollEl.scrollTop + canvasRect.top - scrollRect.top : scrollEl.scrollTop + viewportY;
        const fractionX = canvasRect && canvasRect.width > 0 ? (center.x - canvasRect.left) / canvasRect.width : 0.5;
        const fractionY = canvasRect && canvasRect.height > 0 ? (center.y - canvasRect.top) / canvasRect.height : 0.5;

        const dx = lastTouchCenter ? (lastTouchCenter.x - center.x) : 0;
        const dy = lastTouchCenter ? (lastTouchCenter.y - center.y) : 0;

        if (_pendingZoomScroll) _pendingZoomScroll.cancelled = true;
        const pending = { cancelled: false };
        _pendingZoomScroll = pending;

        nextTick(() => {
          if (pending.cancelled) return;
          _pendingZoomScroll = null;
          const newCanvasRect = displayEl ? displayEl.getBoundingClientRect() : null;
          if (newCanvasRect) {
            scrollEl.scrollLeft = canvasContentX + fractionX * newCanvasRect.width - viewportX + dx;
            scrollEl.scrollTop = canvasContentY + fractionY * newCanvasRect.height - viewportY + dy;
          }
          refreshMousePos();
        });
      }
      
      lastTouchCenter = center;
    }
  }

  function handleTouchEnd(event) {
    if (isPainting.value && event.touches.length === 0) {
      commitPaint();
    }
    lastTouchDistance = null;
    lastTouchCenter = null;
  }

  function handleWheel(event) {
    const scrollEl = getScrollParent();

    if (event.ctrlKey) {
      event.preventDefault();
      const oldZoom = unref(editZoom) || 1;

      const delta = -event.deltaY * 0.01;
      const newZoom = oldZoom * (1 + delta);
      const cappedZoom = Math.max(1, Math.min(16, newZoom));

      _lastClientX = event.clientX;
      _lastClientY = event.clientY;

      if (scrollEl) {
        const displayEl = unref(displayRef);
        const scrollRect = scrollEl.getBoundingClientRect();
        const mouseX = event.clientX - scrollRect.left;
        const mouseY = event.clientY - scrollRect.top;
        const canvasRect = displayEl ? displayEl.getBoundingClientRect() : null;

        const canvasContentX = canvasRect ? scrollEl.scrollLeft + canvasRect.left - scrollRect.left : scrollEl.scrollLeft + mouseX;
        const canvasContentY = canvasRect ? scrollEl.scrollTop + canvasRect.top - scrollRect.top : scrollEl.scrollTop + mouseY;

        const fractionX = canvasRect && canvasRect.width > 0 ? (event.clientX - canvasRect.left) / canvasRect.width : 0.5;
        const fractionY = canvasRect && canvasRect.height > 0 ? (event.clientY - canvasRect.top) / canvasRect.height : 0.5;

        if (_pendingZoomScroll) _pendingZoomScroll.cancelled = true;
        const pending = { cancelled: false };
        _pendingZoomScroll = pending;

        callbacks.onZoomChange(cappedZoom);

        nextTick(() => {
          if (pending.cancelled) return;
          _pendingZoomScroll = null;
          const newCanvasRect = displayEl ? displayEl.getBoundingClientRect() : null;
          if (newCanvasRect) {
            scrollEl.scrollLeft = canvasContentX + fractionX * newCanvasRect.width - mouseX;
            scrollEl.scrollTop = canvasContentY + fractionY * newCanvasRect.height - mouseY;
          }
          refreshMousePos();
        });
      } else {
        callbacks.onZoomChange(cappedZoom);
      }
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
    const displayEl = unref(displayRef);

    if (!scrollEl || !displayEl) {
      callbacks.onZoomChange(newZoom);
      return;
    }

    const scrollRect = scrollEl.getBoundingClientRect();
    const canvasRect = displayEl.getBoundingClientRect();
    const canvasContentX = scrollEl.scrollLeft + canvasRect.left - scrollRect.left;
    const canvasContentY = scrollEl.scrollTop + canvasRect.top - scrollRect.top;
    const viewportCenterX = scrollEl.clientWidth / 2;
    const viewportCenterY = scrollEl.clientHeight / 2;
    const fractionX = canvasRect.width > 0 ? (viewportCenterX - (canvasRect.left - scrollRect.left)) / canvasRect.width : 0.5;
    const fractionY = canvasRect.height > 0 ? (viewportCenterY - (canvasRect.top - scrollRect.top)) / canvasRect.height : 0.5;

    if (_pendingZoomScroll) _pendingZoomScroll.cancelled = true;
    const pending = { cancelled: false };
    _pendingZoomScroll = pending;

    callbacks.onZoomChange(newZoom);

    nextTick(() => {
      if (pending.cancelled) return;
      _pendingZoomScroll = null;
      const newCanvasRect = displayEl.getBoundingClientRect();
      scrollEl.scrollLeft = canvasContentX + fractionX * newCanvasRect.width - viewportCenterX;
      scrollEl.scrollTop = canvasContentY + fractionY * newCanvasRect.height - viewportCenterY;
      refreshMousePos();
    });
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
    zoomToViewCenter
  };
}
