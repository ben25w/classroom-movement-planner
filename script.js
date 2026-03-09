/* ===========================
   Room Planner — script.js
   Phase 1 + Phase 2: Room Canvas + Shapes (add, drag, select)
   =========================== */

(function () {
  'use strict';

  // ── Canvas setup ──────────────────────────────────────
  const canvas = document.getElementById('room-canvas');
  const ctx    = canvas.getContext('2d');

  // ── State ─────────────────────────────────────────────
  let editMode    = false;
  let room        = null;
  let shapes      = [];
  let selectedShape = null;
  let activeShapeTool = null;

  let drag = null;
  let cornerHandles = [];
  let edgeHandles   = [];

  const HANDLE_R = 7;

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

    document.getElementById('btn-edit-room').addEventListener('click', toggleEditMode);
    document.getElementById('btn-save').addEventListener('click', saveRoom);
    document.getElementById('btn-print').addEventListener('click', () => window.print());

    document.getElementById('btn-square').addEventListener('click', () => activateShapeTool('square'));
    document.getElementById('btn-rect').addEventListener('click',   () => activateShapeTool('rect'));
    document.getElementById('btn-circle').addEventListener('click', () => activateShapeTool('circle'));

    loadRoom();
    draw();
  }

  // ── Canvas sizing ─────────────────────────────────────
  function resizeCanvas () {
    const area = document.getElementById('canvas-area');
    const w = area.clientWidth;
    const h = area.clientHeight;
    let frac = null;
    if (room) frac = cornersToFractions(room, canvas.width, canvas.height);
    canvas.width  = w;
    canvas.height = h;
    room = frac ? fractionsToCorners(frac, w, h) : defaultRoom(w, h);
    draw();
  }

  function onWindowResize () { resizeCanvas(); }

  function defaultRoom (w, h) {
    const size = Math.min(w, h) * 0.60;
    const left = (w - size) / 2;
    const top  = (h - size) / 2;
    return [
      { x: left,        y: top        },
      { x: left + size, y: top        },
      { x: left + size, y: top + size },
      { x: left,        y: top + size }
    ];
  }

  function cornersToFractions (corners, w, h) {
    return corners.map(c => ({ fx: c.x / w, fy: c.y / h }));
  }
  function fractionsToCorners (fracs, w, h) {
    return fracs.map(f => ({ x: f.fx * w, y: f.fy * h }));
  }

  // ── Room handles ──────────────────────────────────────
  function buildHandles () {
    cornerHandles = room.map((c, i) => ({ x: c.x, y: c.y, index: i }));
    edgeHandles   = room.map((c, i) => {
      const next = room[(i + 1) % 4];
      return { x: (c.x + next.x) / 2, y: (c.y + next.y) / 2, index: i };
    });
  }

  // ── Shape tool ────────────────────────────────────────
  function activateShapeTool (type) {
    activeShapeTool = type;
    selectedShape   = null;
    ['btn-square', 'btn-rect', 'btn-circle'].forEach(id =>
      document.getElementById(id).classList.remove('active'));
    const map = { square: 'btn-square', rect: 'btn-rect', circle: 'btn-circle' };
    document.getElementById(map[type]).classList.add('active');
    canvas.style.cursor = 'crosshair';
    draw();
  }

  function clearShapeTool () {
    activeShapeTool = null;
    ['btn-square', 'btn-rect', 'btn-circle'].forEach(id =>
      document.getElementById(id).classList.remove('active'));
    canvas.style.cursor = 'default';
  }

  function addShape (type, cx, cy) {
    const d = SHAPE_DEFAULTS[type];
    const shape = {
      id: Date.now(), type,
      x: cx - d.w / 2, y: cy - d.h / 2,
      w: d.w, h: d.h,
      fill: '#ffffff'
    };
    shapes.push(shape);
    selectedShape = shape;
    return shape;
  }

  function roomBounds () {
    const xs = room.map(c => c.x);
    const ys = room.map(c => c.y);
    return { left: Math.min(...xs), top: Math.min(...ys),
             right: Math.max(...xs), bottom: Math.max(...ys) };
  }

  function clampShapeToRoom (shape) {
    const b = roomBounds();
    shape.x = Math.max(b.left, Math.min(b.right  - shape.w, shape.x));
    shape.y = Math.max(b.top,  Math.min(b.bottom - shape.h, shape.y));
  }

  // ── Hit testing ───────────────────────────────────────
  function hitHandle (px, py, handles) {
    for (let i = handles.length - 1; i >= 0; i--) {
      const h = handles[i];
      const dx = px - h.x, dy = py - h.y;
      if (dx * dx + dy * dy <= (HANDLE_R + 4) * (HANDLE_R + 4)) return i;
    }
    return -1;
  }

  function hitShape (px, py) {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (s.type === 'circle') {
        const dx = (px - (s.x + s.w / 2)) / (s.w / 2);
        const dy = (py - (s.y + s.h / 2)) / (s.h / 2);
        if (dx * dx + dy * dy <= 1) return s;
      } else {
        if (px >= s.x && px <= s.x + s.w &&
            py >= s.y && py <= s.y + s.h) return s;
      }
    }
    return null;
  }

  // ── Pointer events ────────────────────────────────────
  function getPos (e) {
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const src    = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scaleX,
             y: (src.clientY - rect.top)  * scaleY };
  }

  function onPointerDown (e) {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = getPos(e);

    if (activeShapeTool) {
      const shape = addShape(activeShapeTool, x, y);
      clampShapeToRoom(shape);
      clearShapeTool();
      draw();
      return;
    }

    if (editMode) {
      const ci = hitHandle(x, y, cornerHandles);
      if (ci !== -1) {
        drag = { type: 'corner', index: cornerHandles[ci].index,
                 startX: x, startY: y, origRoom: room.map(c => ({ ...c })) };
        return;
      }
      const ei = hitHandle(x, y, edgeHandles);
      if (ei !== -1) {
        drag = { type: 'edge', index: edgeHandles[ei].index,
                 startX: x, startY: y, origRoom: room.map(c => ({ ...c })) };
        return;
      }
    }

    const hit = hitShape(x, y);
    if (hit) {
      selectedShape = hit;
      shapes = shapes.filter(s => s !== hit);
      shapes.push(hit);
      drag = { type: 'shape', shape: hit,
               startX: x, startY: y,
               origShape: { x: hit.x, y: hit.y } };
      draw();
      return;
    }

    selectedShape = null;
    draw();
  }

  function onPointerMove (e) {
    if (!drag) {
      if (activeShapeTool) return;
      const { x, y } = getPos(e);
      if (editMode) {
        const onH = hitHandle(x, y, cornerHandles) !== -1 ||
                    hitHandle(x, y, edgeHandles)   !== -1;
        canvas.style.cursor = onH ? 'grab' : 'default';
      } else {
        canvas.style.cursor = hitShape(x, y) ? 'grab' : 'default';
      }
      return;
    }

    e.preventDefault();
    const { x, y } = getPos(e);
    const dx = x - drag.startX;
    const dy = y - drag.startY;

    if (drag.type === 'corner') {
      room[drag.index] = { x: drag.origRoom[drag.index].x + dx,
                           y: drag.origRoom[drag.index].y + dy };
    } else if (drag.type === 'edge') {
      const i = drag.index, next = (i + 1) % 4;
      const horiz = Math.abs(drag.origRoom[next].x - drag.origRoom[i].x) >
                    Math.abs(drag.origRoom[next].y - drag.origRoom[i].y);
      if (horiz) {
        room[i]    = { x: drag.origRoom[i].x,    y: drag.origRoom[i].y    + dy };
        room[next] = { x: drag.origRoom[next].x, y: drag.origRoom[next].y + dy };
      } else {
        room[i]    = { x: drag.origRoom[i].x    + dx, y: drag.origRoom[i].y    };
        room[next] = { x: drag.origRoom[next].x + dx, y: drag.origRoom[next].y };
      }
    } else if (drag.type === 'shape') {
      drag.shape.x = drag.origShape.x + dx;
      drag.shape.y = drag.origShape.y + dy;
      clampShapeToRoom(drag.shape);
    }

    draw();
  }

  function onPointerUp () {
    drag = null;
    canvas.style.cursor = 'default';
  }

  // ── Drawing ───────────────────────────────────────────
  function draw () {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRoom();
    shapes.forEach(drawShape);
    if (editMode) { buildHandles(); drawHandles(); }
  }

  function drawRoom () {
    if (!room) return;
    ctx.beginPath();
    ctx.moveTo(room[0].x, room[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(room[i].x, room[i].y);
    ctx.closePath();
    ctx.fillStyle   = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#222222';
    ctx.lineWidth   = 3;
    ctx.lineJoin    = 'round';
    ctx.stroke();
  }

  function drawShape (s) {
    const sel = s === selectedShape;
    ctx.save();
    ctx.fillStyle   = s.fill || '#ffffff';
    ctx.strokeStyle = '#222222';
    ctx.lineWidth   = 2;

    if (s.type === 'circle') {
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, s.w / 2, s.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.rect(s.x, s.y, s.w, s.h);
      ctx.fill();
      ctx.stroke();
    }

    if (sel) {
      ctx.strokeStyle = '#1a73e8';
      ctx.lineWidth   = 2;
      ctx.setLineDash([5, 3]);
      if (s.type === 'circle') {
        const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, s.w / 2 + 5, s.h / 2 + 5, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(s.x - 5, s.y - 5, s.w + 10, s.h + 10);
      }
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawHandles () {
    cornerHandles.forEach(h => drawCircleHandle(h.x, h.y, '#1a73e8', '#fff'));
    edgeHandles.forEach(h   => drawCircleHandle(h.x, h.y, '#0d9488', '#fff'));
  }

  function drawCircleHandle (x, y, fill, stroke) {
    ctx.beginPath();
    ctx.arc(x, y, HANDLE_R, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke();
  }

  // ── Edit mode toggle ──────────────────────────────────
  function toggleEditMode () {
    editMode = !editMode;
    clearShapeTool();
    document.getElementById('btn-edit-room').classList.toggle('active', editMode);
    draw();
  }

  // ── Persistence ───────────────────────────────────────
  const STORAGE_KEY = 'room-planner-v2';

  function saveRoom () {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        room:   cornersToFractions(room, canvas.width, canvas.height),
        shapes: shapes
      }));
      flashSaveButton();
    } catch (err) { console.warn('Save failed:', err); }
  }

  function loadRoom () {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.room   && data.room.length === 4)
        room   = fractionsToCorners(data.room, canvas.width, canvas.height);
      if (data.shapes && Array.isArray(data.shapes))
        shapes = data.shapes;
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
