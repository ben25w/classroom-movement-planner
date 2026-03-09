/* ===========================
   Room Planner — script.js
   Phase 1+2+3 + 3.5: Full-room default, Zoom/Pan, Delete shape
   =========================== */

(function () {
  'use strict';

  const canvas = document.getElementById('room-canvas');
  const ctx    = canvas.getContext('2d');

  // ── Viewport / zoom state ─────────────────────────────
  let zoom    = 1.0;
  let panX    = 0;
  let panY    = 0;
  const MIN_ZOOM = 0.2;
  const MAX_ZOOM = 5.0;

  // pan drag
  let isPanning   = false;
  let panStartX   = 0;
  let panStartY   = 0;
  let panOriginX  = 0;
  let panOriginY  = 0;

  // ── App state ─────────────────────────────────────────
  let editMode        = false;
  let room            = null;
  let shapes          = [];
  let selectedShape   = null;
  let activeShapeTool = null;
  let drag            = null;

  let cornerHandles = [];
  let edgeHandles   = [];

  const ROOM_HANDLE_R  = 7;
  const SEL_HANDLE_R   = 6;
  const ROT_HANDLE_R   = 6;
  const ROT_OFFSET     = 28;
  const MIN_SHAPE_SIZE = 20;

  const SHAPE_DEFAULTS = {
    square: { w: 80,  h: 80  },
    rect:   { w: 120, h: 70  },
    circle: { w: 80,  h: 80  }
  };

  // ── Init ──────────────────────────────────────────────
  function init () {
    resizeCanvas();
    window.addEventListener('resize', onWindowResize);

    canvas.addEventListener('pointerdown',  onPointerDown);
    canvas.addEventListener('pointermove',  onPointerMove);
    canvas.addEventListener('pointerup',    onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);
    canvas.addEventListener('wheel',        onWheel, { passive: false });

    document.addEventListener('keydown', onKeyDown);

    document.getElementById('btn-edit-room').addEventListener('click', toggleEditMode);
    document.getElementById('btn-save').addEventListener('click', saveRoom);
    document.getElementById('btn-print').addEventListener('click', () => window.print());

    document.getElementById('btn-square').addEventListener('click', () => activateShapeTool('square'));
    document.getElementById('btn-rect').addEventListener('click',   () => activateShapeTool('rect'));
    document.getElementById('btn-circle').addEventListener('click', () => activateShapeTool('circle'));

    document.getElementById('btn-zoom-in').addEventListener('click',    () => zoomBy(1.25));
    document.getElementById('btn-zoom-out').addEventListener('click',   () => zoomBy(0.8));
    document.getElementById('btn-zoom-reset').addEventListener('click', resetZoom);
    document.getElementById('btn-delete-shape').addEventListener('click', deleteSelected);

    loadRoom();
    draw();
  }

  // ── Canvas / resize ───────────────────────────────────
  function resizeCanvas () {
    const area = document.getElementById('canvas-area');
    canvas.width  = area.clientWidth;
    canvas.height = area.clientHeight;
    if (!room) {
      room = defaultRoom(canvas.width, canvas.height);
    }
    draw();
  }
  function onWindowResize () { resizeCanvas(); }

  // Room fills the canvas with a small margin
  function defaultRoom (w, h) {
    const margin = 32;
    return [
      { x: margin,     y: margin     },
      { x: w - margin, y: margin     },
      { x: w - margin, y: h - margin },
      { x: margin,     y: h - margin }
    ];
  }

  function cornersToFractions (c, w, h) { return c.map(p => ({ fx: p.x/w, fy: p.y/h })); }
  function fractionsToCorners (f, w, h) { return f.map(p => ({ x: p.fx*w, y: p.fy*h })); }

  // ── Zoom / Pan ────────────────────────────────────────
  function zoomBy (factor, cx, cy) {
    // cx/cy = canvas pixel coords to zoom around (defaults to canvas centre)
    cx = cx ?? canvas.width  / 2;
    cy = cy ?? canvas.height / 2;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    const scale   = newZoom / zoom;
    panX = cx - scale * (cx - panX);
    panY = cy - scale * (cy - panY);
    zoom = newZoom;
    updateZoomLabel();
    draw();
  }

  function resetZoom () {
    zoom = 1; panX = 0; panY = 0;
    updateZoomLabel();
    draw();
  }

  function updateZoomLabel () {
    const el = document.getElementById('zoom-label');
    if (el) el.textContent = Math.round(zoom * 100) + '%';
  }

  function onWheel (e) {
    e.preventDefault();
    const rect  = canvas.getBoundingClientRect();
    const cx    = (e.clientX - rect.left) * (canvas.width  / rect.width);
    const cy    = (e.clientY - rect.top)  * (canvas.height / rect.height);
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    zoomBy(delta, cx, cy);
  }

  // ── Coordinate helpers ────────────────────────────────
  // Convert canvas pixel → world coords
  function toWorld (px, py) {
    return { x: (px - panX) / zoom, y: (py - panY) / zoom };
  }
  // Convert world → canvas pixel
  function toCanvas (wx, wy) {
    return { x: wx * zoom + panX, y: wy * zoom + panY };
  }

  // get pointer position in WORLD coords
  function getPos (e) {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const src    = e.touches ? e.touches[0] : e;
    const px = (src.clientX - rect.left) * scaleX;
    const py = (src.clientY - rect.top)  * scaleY;
    return toWorld(px, py);
  }

  // get pointer position in RAW canvas px (for pan)
  function getRawPos (e) {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const src    = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top)  * scaleY
    };
  }

  // ── Room handles ──────────────────────────────────────
  function buildRoomHandles () {
    cornerHandles = room.map((c, i) => ({ x: c.x, y: c.y, index: i }));
    edgeHandles   = room.map((c, i) => {
      const n = room[(i+1)%4];
      return { x: (c.x+n.x)/2, y: (c.y+n.y)/2, index: i };
    });
  }

  // ── Shape tool ────────────────────────────────────────
  function activateShapeTool (type) {
    activeShapeTool = type;
    selectedShape   = null;
    updateDeleteBtn();
    ['btn-square','btn-rect','btn-circle'].forEach(id =>
      document.getElementById(id).classList.remove('active'));
    document.getElementById({ square:'btn-square', rect:'btn-rect', circle:'btn-circle' }[type])
      .classList.add('active');
    canvas.style.cursor = 'crosshair';
    draw();
  }
  function clearShapeTool () {
    activeShapeTool = null;
    ['btn-square','btn-rect','btn-circle'].forEach(id =>
      document.getElementById(id).classList.remove('active'));
    canvas.style.cursor = 'default';
  }

  function addShape (type, cx, cy) {
    const d = SHAPE_DEFAULTS[type];
    const s = { id: Date.now(), type,
                x: cx - d.w/2, y: cy - d.h/2,
                w: d.w, h: d.h, angle: 0, fill: '#ffffff' };
    shapes.push(s);
    selectedShape = s;
    updateDeleteBtn();
    return s;
  }

  // ── Delete ────────────────────────────────────────────
  function deleteSelected () {
    if (!selectedShape) return;
    shapes = shapes.filter(s => s !== selectedShape);
    selectedShape = null;
    updateDeleteBtn();
    draw();
  }

  function onKeyDown (e) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Don't fire if user is typing in an input
      if (document.activeElement.tagName === 'INPUT' ||
          document.activeElement.tagName === 'TEXTAREA') return;
      deleteSelected();
    }
  }

  function updateDeleteBtn () {
    const btn = document.getElementById('btn-delete-shape');
    if (!btn) return;
    btn.style.display = selectedShape ? 'block' : 'none';
  }

  // ── Room bounds & clamp ───────────────────────────────
  function roomBounds () {
    const xs = room.map(c => c.x), ys = room.map(c => c.y);
    return { left: Math.min(...xs), top: Math.min(...ys),
             right: Math.max(...xs), bottom: Math.max(...ys) };
  }
  function clampShapeToRoom (s) {
    const b = roomBounds();
    s.x = Math.max(b.left, Math.min(b.right  - s.w, s.x));
    s.y = Math.max(b.top,  Math.min(b.bottom - s.h, s.y));
  }

  // ── Selection handles ─────────────────────────────────
  function getSelHandles (s) {
    const cx = s.x + s.w/2, cy = s.y + s.h/2;
    const hw = s.w/2, hh = s.h/2;
    const cos = Math.cos(s.angle), sin = Math.sin(s.angle);
    const localCorners = [
      { lx: -hw, ly: -hh, index: 0 },
      { lx:  hw, ly: -hh, index: 1 },
      { lx:  hw, ly:  hh, index: 2 },
      { lx: -hw, ly:  hh, index: 3 }
    ];
    const corners = localCorners.map(({ lx, ly, index }) => ({
      x: cx + lx*cos - ly*sin,
      y: cy + lx*sin + ly*cos,
      index
    }));
    const rotLocal = { lx: 0, ly: -hh - ROT_OFFSET };
    return {
      corners,
      rotate: {
        x: cx + rotLocal.lx*cos - rotLocal.ly*sin,
        y: cy + rotLocal.lx*sin + rotLocal.ly*cos
      }
    };
  }

  // ── Hit testing (all in WORLD coords) ────────────────
  function hitCircleW (wx, wy, hx, hy, r) {
    // r is in world units — but handles are drawn at fixed screen size
    // so we hit-test in screen space by converting handle pos to canvas px
    const hp = toCanvas(hx, hy);
    const pp = toCanvas(wx, wy);  // actually we receive world, so same
    const screenR = (r + 4) / zoom;   // expand hit radius to screen equiv
    const dx = wx-hx, dy = wy-hy;
    return dx*dx + dy*dy <= screenR*screenR;
  }

  function hitRoomHandle (wx, wy, handles) {
    for (let i = handles.length-1; i >= 0; i--) {
      if (hitCircleW(wx, wy, handles[i].x, handles[i].y, ROOM_HANDLE_R)) return i;
    }
    return -1;
  }

  function hitSelHandle (wx, wy) {
    if (!selectedShape) return null;
    const h = getSelHandles(selectedShape);
    if (hitCircleW(wx, wy, h.rotate.x, h.rotate.y, ROT_HANDLE_R)) return { type:'rotate' };
    for (const c of h.corners) {
      if (hitCircleW(wx, wy, c.x, c.y, SEL_HANDLE_R)) return { type:'resize', index: c.index };
    }
    return null;
  }

  function hitShape (wx, wy) {
    for (let i = shapes.length-1; i >= 0; i--) {
      const s = shapes[i];
      const cx = s.x + s.w/2, cy = s.y + s.h/2;
      const cos = Math.cos(-s.angle), sin = Math.sin(-s.angle);
      const lx = (wx-cx)*cos - (wy-cy)*sin;
      const ly = (wx-cx)*sin + (wy-cy)*cos;
      if (s.type === 'circle') {
        if ((lx/(s.w/2))*(lx/(s.w/2)) + (ly/(s.h/2))*(ly/(s.h/2)) <= 1) return s;
      } else {
        if (lx >= -s.w/2 && lx <= s.w/2 && ly >= -s.h/2 && ly <= s.h/2) return s;
      }
    }
    return null;
  }

  // ── Pointer events ────────────────────────────────────
  function onPointerDown (e) {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const raw = getRawPos(e);
    const { x, y } = toWorld(raw.x, raw.y);

    // ── Place shape ──────────────────────────────────────
    if (activeShapeTool) {
      const s = addShape(activeShapeTool, x, y);
      clampShapeToRoom(s);
      clearShapeTool();
      draw();
      return;
    }

    // ── Middle mouse or space+drag = pan (also 2-finger) ─
    if (e.button === 1 || e.altKey) {
      isPanning = true;
      panStartX = raw.x; panStartY = raw.y;
      panOriginX = panX; panOriginY = panY;
      canvas.style.cursor = 'grabbing';
      return;
    }

    // ── Room edit handles ────────────────────────────────
    if (editMode) {
      const ci = hitRoomHandle(x, y, cornerHandles);
      if (ci !== -1) {
        drag = { type:'corner', index: cornerHandles[ci].index,
                 startX:x, startY:y, origRoom: room.map(c=>({...c})) };
        return;
      }
      const ei = hitRoomHandle(x, y, edgeHandles);
      if (ei !== -1) {
        drag = { type:'edge', index: edgeHandles[ei].index,
                 startX:x, startY:y, origRoom: room.map(c=>({...c})) };
        return;
      }
    }

    // ── Resize / rotate handles ──────────────────────────
    const sh = hitSelHandle(x, y);
    if (sh) {
      const s = selectedShape;
      if (sh.type === 'rotate') {
        const cx = s.x + s.w/2, cy = s.y + s.h/2;
        drag = { type:'rotate', shape:s, startAngle:s.angle,
                 startAtan: Math.atan2(y-cy, x-cx) };
      } else {
        const h   = getSelHandles(s);
        const opp = h.corners[(sh.index + 2) % 4];
        drag = { type:'resize', shape:s, cornerIndex:sh.index,
                 startX:x, startY:y,
                 origX:s.x, origY:s.y, origW:s.w, origH:s.h,
                 origAngle:s.angle, anchorX:opp.x, anchorY:opp.y };
      }
      return;
    }

    // ── Shape drag / select ──────────────────────────────
    const hit = hitShape(x, y);
    if (hit) {
      selectedShape = hit;
      shapes = shapes.filter(s => s !== hit); shapes.push(hit);
      drag = { type:'shape', shape:hit, startX:x, startY:y,
               origX:hit.x, origY:hit.y };
      updateDeleteBtn();
      draw();
      return;
    }

    // ── Click empty = deselect or start pan ──────────────
    selectedShape = null;
    updateDeleteBtn();
    // Start pan on empty canvas
    isPanning = true;
    panStartX = raw.x; panStartY = raw.y;
    panOriginX = panX; panOriginY = panY;
    canvas.style.cursor = 'grabbing';
    draw();
  }

  function onPointerMove (e) {
    const raw = getRawPos(e);
    const { x, y } = toWorld(raw.x, raw.y);

    // ── Pan ──────────────────────────────────────────────
    if (isPanning) {
      panX = panOriginX + (raw.x - panStartX);
      panY = panOriginY + (raw.y - panStartY);
      canvas.style.cursor = 'grabbing';
      draw();
      return;
    }

    if (!drag) {
      // cursor hints
      if (activeShapeTool) { canvas.style.cursor = 'crosshair'; return; }
      const sh = hitSelHandle(x, y);
      if (sh) { canvas.style.cursor = sh.type === 'rotate' ? 'grab' : 'nwse-resize'; return; }
      if (editMode) {
        const onH = hitRoomHandle(x, y, cornerHandles) !== -1 ||
                    hitRoomHandle(x, y, edgeHandles)   !== -1;
        canvas.style.cursor = onH ? 'grab' : 'default';
      } else {
        canvas.style.cursor = hitShape(x, y) ? 'grab' : 'default';
      }
      return;
    }

    e.preventDefault();
    const dx = x - drag.startX, dy = y - drag.startY;

    if (drag.type === 'corner') {
      room[drag.index] = { x: drag.origRoom[drag.index].x+dx,
                           y: drag.origRoom[drag.index].y+dy };
    } else if (drag.type === 'edge') {
      const i = drag.index, n = (i+1)%4;
      const horiz = Math.abs(drag.origRoom[n].x-drag.origRoom[i].x) >
                    Math.abs(drag.origRoom[n].y-drag.origRoom[i].y);
      if (horiz) {
        room[i] = { x:drag.origRoom[i].x,    y:drag.origRoom[i].y+dy };
        room[n] = { x:drag.origRoom[n].x,    y:drag.origRoom[n].y+dy };
      } else {
        room[i] = { x:drag.origRoom[i].x+dx, y:drag.origRoom[i].y };
        room[n] = { x:drag.origRoom[n].x+dx, y:drag.origRoom[n].y };
      }
    } else if (drag.type === 'shape') {
      drag.shape.x = drag.origX + dx;
      drag.shape.y = drag.origY + dy;
      clampShapeToRoom(drag.shape);
    } else if (drag.type === 'rotate') {
      const s = drag.shape;
      const cx = s.x + s.w/2, cy = s.y + s.h/2;
      s.angle = drag.startAngle + (Math.atan2(y-cy, x-cx) - drag.startAtan);
    } else if (drag.type === 'resize') {
      const s   = drag.shape;
      const cos = Math.cos(-s.angle), sin = Math.sin(-s.angle);
      const wxm = x - drag.anchorX, wym = y - drag.anchorY;
      const lxm = wxm*cos - wym*sin;
      const lym = wxm*sin + wym*cos;
      const ci   = drag.cornerIndex;
      const signX = (ci === 0 || ci === 3) ? -1 : 1;
      const signY = (ci === 0 || ci === 1) ? -1 : 1;
      const newW  = Math.max(MIN_SHAPE_SIZE, Math.abs(lxm));
      const newH  = Math.max(MIN_SHAPE_SIZE, Math.abs(lym));
      s.w = newW; s.h = newH;
      const cosA = Math.cos(s.angle), sinA = Math.sin(s.angle);
      const oppLx = -signX * newW/2, oppLy = -signY * newH/2;
      s.x = drag.anchorX + (-oppLx*cosA + oppLy*sinA) - newW/2;
      s.y = drag.anchorY + (-oppLx*sinA - oppLy*cosA) - newH/2;
    }

    draw();
  }

  function onPointerUp () {
    if (isPanning) {
      isPanning = false;
      canvas.style.cursor = 'default';
    }
    drag = null;
  }

  // ── Drawing ───────────────────────────────────────────
  function draw () {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    drawRoom();
    shapes.forEach(drawShape);
    if (editMode) { buildRoomHandles(); drawRoomHandlesOnCanvas(); }

    ctx.restore();

    // Draw selection handles AFTER restoring, so they're always fixed pixel size
    if (selectedShape) drawSelHandles(selectedShape);
  }

  function drawRoom () {
    if (!room) return;
    ctx.beginPath();
    ctx.moveTo(room[0].x, room[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(room[i].x, room[i].y);
    ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.strokeStyle = '#222222'; ctx.lineWidth = 3/zoom; ctx.lineJoin = 'round'; ctx.stroke();
  }

  function drawShape (s) {
    const cx = s.x + s.w/2, cy = s.y + s.h/2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(s.angle);
    ctx.fillStyle   = s.fill || '#ffffff';
    ctx.strokeStyle = '#222222';
    ctx.lineWidth   = 2/zoom;
    if (s.type === 'circle') {
      ctx.beginPath();
      ctx.ellipse(0, 0, s.w/2, s.h/2, 0, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.rect(-s.w/2, -s.h/2, s.w, s.h);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  // Room handles drawn inside the zoom transform
  function drawRoomHandlesOnCanvas () {
    const r = ROOM_HANDLE_R / zoom;
    cornerHandles.forEach(h => drawWorldCircle(h.x, h.y, r, '#1a73e8', '#fff'));
    edgeHandles.forEach(h   => drawWorldCircle(h.x, h.y, r, '#0d9488', '#fff'));
  }

  function drawWorldCircle (x, y, r, fill, stroke) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 2/zoom; ctx.stroke();
  }

  // Selection handles drawn in SCREEN space (after ctx.restore)
  function drawSelHandles (s) {
    const h = getSelHandles(s);

    // dashed outline — draw in screen space by converting world→screen
    ctx.save();
    const cx_s = toCanvas(s.x + s.w/2, s.y + s.h/2);
    ctx.translate(cx_s.x, cx_s.y);
    ctx.rotate(s.angle);
    ctx.strokeStyle = '#1a73e8';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 3]);
    if (s.type === 'circle') {
      ctx.beginPath();
      ctx.ellipse(0, 0, s.w/2*zoom+6, s.h/2*zoom+6, 0, 0, Math.PI*2);
      ctx.stroke();
    } else {
      ctx.strokeRect(-s.w/2*zoom-5, -s.h/2*zoom-5, s.w*zoom+10, s.h*zoom+10);
    }
    ctx.setLineDash([]);
    ctx.restore();

    // corner resize handles
    h.corners.forEach(c => {
      const sc = toCanvas(c.x, c.y);
      drawScreenCircle(sc.x, sc.y, SEL_HANDLE_R, '#1a73e8', '#fff');
    });

    // rotation handle + stem
    const sr = toCanvas(h.rotate.x, h.rotate.y);
    // top-centre in screen space
    const tcw = {
      x: s.x + s.w/2 - Math.sin(s.angle) * (-s.h/2),
      y: s.y + s.h/2 + Math.cos(s.angle) * (-s.h/2)
    };
    const tc = toCanvas(tcw.x, tcw.y);
    ctx.beginPath();
    ctx.moveTo(tc.x, tc.y);
    ctx.lineTo(sr.x, sr.y);
    ctx.strokeStyle = '#1a73e8'; ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]);

    drawScreenCircle(sr.x, sr.y, ROT_HANDLE_R, '#fff', '#1a73e8');
    // rotation arrow
    ctx.save();
    ctx.translate(sr.x, sr.y);
    ctx.rotate(s.angle);
    ctx.strokeStyle = '#1a73e8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 3, -Math.PI*0.7, Math.PI*0.7); ctx.stroke();
    ctx.restore();
  }

  function drawScreenCircle (x, y, r, fill, stroke) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke();
  }

  // ── Edit mode ─────────────────────────────────────────
  function toggleEditMode () {
    editMode = !editMode;
    clearShapeTool();
    document.getElementById('btn-edit-room').classList.toggle('active', editMode);
    draw();
  }

  // ── Persistence ───────────────────────────────────────
  const STORAGE_KEY = 'room-planner-v4';

  function saveRoom () {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        room: cornersToFractions(room, canvas.width, canvas.height),
        shapes,
        zoom, panX, panY
      }));
      flashSaveButton();
    } catch (err) { console.warn('Save failed:', err); }
  }

  function loadRoom () {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.room && data.room.length === 4)
        room = fractionsToCorners(data.room, canvas.width, canvas.height);
      if (data.shapes && Array.isArray(data.shapes))
        shapes = data.shapes.map(s => ({ angle: 0, ...s }));
      if (data.zoom)  { zoom = data.zoom; panX = data.panX||0; panY = data.panY||0; }
      updateZoomLabel();
    } catch (err) { console.warn('Load failed:', err); }
  }

  function flashSaveButton () {
    const btn = document.getElementById('btn-save');
    const orig = btn.textContent;
    btn.textContent = 'Saved ✓'; btn.style.color = '#1a73e8';
    setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1500);
  }

  // ── Go ────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
