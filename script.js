/* ===========================
   Room Planner — script.js
   Phase 1 + 2 + 3: Canvas, Shapes, Resize & Rotate
   =========================== */

(function () {
  'use strict';

  // ── Canvas setup ──────────────────────────────────────
  const canvas = document.getElementById('room-canvas');
  const ctx    = canvas.getContext('2d');

  // ── State ─────────────────────────────────────────────
  let editMode      = false;
  let room          = null;
  let shapes        = [];
  let selectedShape = null;
  let activeShapeTool = null;
  let drag          = null;

  // room edit handles
  let cornerHandles = [];
  let edgeHandles   = [];

  // constants
  const ROOM_HANDLE_R  = 7;
  const SEL_HANDLE_R   = 6;   // resize corner handle radius
  const ROT_HANDLE_R   = 6;   // rotation handle radius
  const ROT_OFFSET     = 28;  // px above shape bounding box
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

    document.getElementById('btn-edit-room').addEventListener('click', toggleEditMode);
    document.getElementById('btn-save').addEventListener('click', saveRoom);
    document.getElementById('btn-print').addEventListener('click', () => window.print());

    document.getElementById('btn-square').addEventListener('click', () => activateShapeTool('square'));
    document.getElementById('btn-rect').addEventListener('click',   () => activateShapeTool('rect'));
    document.getElementById('btn-circle').addEventListener('click', () => activateShapeTool('circle'));

    loadRoom();
    draw();
  }

  // ── Canvas resize ─────────────────────────────────────
  function resizeCanvas () {
    const area = document.getElementById('canvas-area');
    const w = area.clientWidth, h = area.clientHeight;
    let frac = null;
    if (room) frac = cornersToFractions(room, canvas.width, canvas.height);
    canvas.width = w; canvas.height = h;
    room = frac ? fractionsToCorners(frac, w, h) : defaultRoom(w, h);
    draw();
  }
  function onWindowResize () { resizeCanvas(); }

  function defaultRoom (w, h) {
    const size = Math.min(w, h) * 0.60;
    const left = (w - size) / 2, top = (h - size) / 2;
    return [
      { x: left,        y: top        },
      { x: left + size, y: top        },
      { x: left + size, y: top + size },
      { x: left,        y: top + size }
    ];
  }
  function cornersToFractions (c, w, h) { return c.map(p => ({ fx: p.x/w, fy: p.y/h })); }
  function fractionsToCorners (f, w, h) { return f.map(p => ({ x: p.fx*w, y: p.fy*h })); }

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
    const s = { id: Date.now(), type, x: cx - d.w/2, y: cy - d.h/2,
                w: d.w, h: d.h, angle: 0, fill: '#ffffff' };
    shapes.push(s);
    selectedShape = s;
    return s;
  }

  // ── Room bounds & clamping ────────────────────────────
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

  // ── Selection handle geometry ─────────────────────────
  // Returns { corners: [{x,y,cursor,index}x4], rotate: {x,y} }
  function getSelHandles (s) {
    // unrotated corners in world space (relative to shape centre)
    const cx = s.x + s.w/2, cy = s.y + s.h/2;
    const hw = s.w/2, hh = s.h/2;
    const localCorners = [
      { lx: -hw, ly: -hh, index: 0 },   // TL
      { lx:  hw, ly: -hh, index: 1 },   // TR
      { lx:  hw, ly:  hh, index: 2 },   // BR
      { lx: -hw, ly:  hh, index: 3 }    // BL
    ];
    const cursors = ['nwse-resize','nesw-resize','nwse-resize','nesw-resize'];
    const cos = Math.cos(s.angle), sin = Math.sin(s.angle);

    const corners = localCorners.map(({ lx, ly, index }) => ({
      x: cx + lx*cos - ly*sin,
      y: cy + lx*sin + ly*cos,
      cursor: cursors[index],
      index
    }));

    // rotation handle: above TL-TR midpoint in local space → top-centre
    const rotLocal = { lx: 0, ly: -hh - ROT_OFFSET };
    return {
      corners,
      rotate: {
        x: cx + rotLocal.lx*cos - rotLocal.ly*sin,
        y: cy + rotLocal.lx*sin + rotLocal.ly*cos
      }
    };
  }

  // ── Hit testing ───────────────────────────────────────
  function hitCircle (px, py, hx, hy, r) {
    const dx = px-hx, dy = py-hy;
    return dx*dx + dy*dy <= (r+4)*(r+4);
  }

  function hitRoomHandle (px, py, handles) {
    for (let i = handles.length-1; i >= 0; i--) {
      if (hitCircle(px, py, handles[i].x, handles[i].y, ROOM_HANDLE_R)) return i;
    }
    return -1;
  }

  // Hit-test resize/rotate handles on selected shape
  // Returns { type:'resize'|'rotate', index? } or null
  function hitSelHandle (px, py) {
    if (!selectedShape) return null;
    const h = getSelHandles(selectedShape);
    if (hitCircle(px, py, h.rotate.x, h.rotate.y, ROT_HANDLE_R+4)) {
      return { type: 'rotate' };
    }
    for (const c of h.corners) {
      if (hitCircle(px, py, c.x, c.y, SEL_HANDLE_R+4)) {
        return { type: 'resize', index: c.index };
      }
    }
    return null;
  }

  // Point-in-shape hit test (accounts for rotation)
  function hitShape (px, py) {
    for (let i = shapes.length-1; i >= 0; i--) {
      const s = shapes[i];
      const cx = s.x + s.w/2, cy = s.y + s.h/2;
      // rotate point into shape-local space
      const cos = Math.cos(-s.angle), sin = Math.sin(-s.angle);
      const lx = (px-cx)*cos - (py-cy)*sin;
      const ly = (px-cx)*sin + (py-cy)*cos;
      if (s.type === 'circle') {
        if ((lx/(s.w/2))*(lx/(s.w/2)) + (ly/(s.h/2))*(ly/(s.h/2)) <= 1) return s;
      } else {
        if (lx >= -s.w/2 && lx <= s.w/2 && ly >= -s.h/2 && ly <= s.h/2) return s;
      }
    }
    return null;
  }

  // ── Pointer events ────────────────────────────────────
  function getPos (e) {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width/r.width, sy = canvas.height/r.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left)*sx, y: (src.clientY - r.top)*sy };
  }

  function onPointerDown (e) {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = getPos(e);

    // ── Place shape ──────────────────────────────────────
    if (activeShapeTool) {
      const s = addShape(activeShapeTool, x, y);
      clampShapeToRoom(s);
      clearShapeTool();
      draw();
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

    // ── Shape selection handles (resize / rotate) ────────
    const sh = hitSelHandle(x, y);
    if (sh) {
      const s = selectedShape;
      if (sh.type === 'rotate') {
        const cx = s.x + s.w/2, cy = s.y + s.h/2;
        drag = { type:'rotate', shape:s,
                 startAngle: s.angle,
                 startAtan: Math.atan2(y-cy, x-cx) };
      } else {
        // resize: record which corner is "opposite" (anchor)
        const h = getSelHandles(s);
        const opp = h.corners[(sh.index + 2) % 4];
        drag = { type:'resize', shape:s, cornerIndex: sh.index,
                 startX:x, startY:y,
                 origX:s.x, origY:s.y, origW:s.w, origH:s.h,
                 origAngle: s.angle,
                 anchorX: opp.x, anchorY: opp.y };
      }
      return;
    }

    // ── Shape drag ───────────────────────────────────────
    const hit = hitShape(x, y);
    if (hit) {
      selectedShape = hit;
      shapes = shapes.filter(s => s !== hit); shapes.push(hit);
      drag = { type:'shape', shape:hit, startX:x, startY:y,
               origX:hit.x, origY:hit.y };
      draw();
      return;
    }

    selectedShape = null;
    draw();
  }

  function onPointerMove (e) {
    const { x, y } = getPos(e);

    if (!drag) {
      // cursor hints
      if (activeShapeTool) { canvas.style.cursor = 'crosshair'; return; }
      const sh = hitSelHandle(x, y);
      if (sh) {
        canvas.style.cursor = sh.type === 'rotate' ? 'grab' : sh.type === 'resize'
          ? getSelHandles(selectedShape).corners.find((c,i) => {
              const h = getSelHandles(selectedShape); return false;
            }) || 'nwse-resize'
          : 'nwse-resize';
        // simplify: just show crosshair for resize, grab for rotate
        canvas.style.cursor = sh.type === 'rotate' ? 'grab' : 'nwse-resize';
        return;
      }
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
        room[i] = { x:drag.origRoom[i].x, y:drag.origRoom[i].y+dy };
        room[n] = { x:drag.origRoom[n].x, y:drag.origRoom[n].y+dy };
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
      const currentAtan = Math.atan2(y-cy, x-cx);
      s.angle = drag.startAngle + (currentAtan - drag.startAtan);
    } else if (drag.type === 'resize') {
      const s = drag.shape;
      // Vector from anchor to current mouse, in world space
      const cos = Math.cos(-s.angle), sin = Math.sin(-s.angle);
      // anchor to mouse in local shape space
      const wxm = x - drag.anchorX, wym = y - drag.anchorY;
      const lxm = wxm*cos - wym*sin;
      const lym = wxm*sin + wym*cos;

      // Determine which corner is being dragged (0=TL,1=TR,2=BR,3=BL)
      const ci = drag.cornerIndex;
      // Signs: TL pulls left+up, TR pulls right+up, etc.
      const signX = (ci === 0 || ci === 3) ? -1 : 1;
      const signY = (ci === 0 || ci === 1) ? -1 : 1;

      const newW = Math.max(MIN_SHAPE_SIZE, Math.abs(lxm));
      const newH = Math.max(MIN_SHAPE_SIZE, Math.abs(lym));

      s.w = newW;
      s.h = newH;

      // Reposition so anchor stays fixed
      // anchor is at (ax, ay) in world — we want the opposite corner of the
      // new bounding box to stay at the anchor point
      const newHW = newW/2, newHH = newH/2;
      const cosA = Math.cos(s.angle), sinA = Math.sin(s.angle);
      // opposite corner local coords are -signX*newHW, -signY*newHH
      const oppLx = -signX * newHW, oppLy = -signY * newHH;
      // new centre so that opposite corner lands on anchor
      s.x = drag.anchorX + (-oppLx*cosA + oppLy*sinA) - newHW;
      s.y = drag.anchorY + (-oppLx*sinA - oppLy*cosA) - newHH;
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
    if (editMode) { buildRoomHandles(); drawRoomHandles(); }
  }

  function drawRoom () {
    if (!room) return;
    ctx.beginPath();
    ctx.moveTo(room[0].x, room[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(room[i].x, room[i].y);
    ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.strokeStyle = '#222222'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
  }

  function drawShape (s) {
    const sel = s === selectedShape;
    const cx = s.x + s.w/2, cy = s.y + s.h/2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(s.angle);

    ctx.fillStyle   = s.fill || '#ffffff';
    ctx.strokeStyle = '#222222';
    ctx.lineWidth   = 2;

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

    // draw selection handles in world space
    if (sel) drawSelHandles(s);
  }

  function drawSelHandles (s) {
    const h = getSelHandles(s);
    const cx = s.x + s.w/2, cy = s.y + s.h/2;

    // dashed outline
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(s.angle);
    ctx.strokeStyle = '#1a73e8';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([5, 3]);
    if (s.type === 'circle') {
      ctx.beginPath();
      ctx.ellipse(0, 0, s.w/2+6, s.h/2+6, 0, 0, Math.PI*2);
      ctx.stroke();
    } else {
      ctx.strokeRect(-s.w/2-5, -s.h/2-5, s.w+10, s.h+10);
    }
    ctx.setLineDash([]);
    ctx.restore();

    // corner resize handles
    h.corners.forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, SEL_HANDLE_R, 0, Math.PI*2);
      ctx.fillStyle   = '#1a73e8';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    });

    // line from shape top-centre to rotation handle
    const topCentre = {
      x: cx + Math.cos(s.angle) * 0    - Math.sin(s.angle) * (-s.h/2),
      y: cy + Math.sin(s.angle) * 0    + Math.cos(s.angle) * (-s.h/2)
    };
    ctx.beginPath();
    ctx.moveTo(topCentre.x, topCentre.y);
    ctx.lineTo(h.rotate.x, h.rotate.y);
    ctx.strokeStyle = '#1a73e8';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([3, 2]);
    ctx.stroke();
    ctx.setLineDash([]);

    // rotation handle circle
    ctx.beginPath();
    ctx.arc(h.rotate.x, h.rotate.y, ROT_HANDLE_R, 0, Math.PI*2);
    ctx.fillStyle   = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#1a73e8';
    ctx.lineWidth   = 2;
    ctx.stroke();
    // rotation arrow icon inside
    ctx.save();
    ctx.translate(h.rotate.x, h.rotate.y);
    ctx.rotate(s.angle);
    ctx.strokeStyle = '#1a73e8';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 3, -Math.PI*0.7, Math.PI*0.7);
    ctx.stroke();
    ctx.restore();
  }

  function drawRoomHandles () {
    cornerHandles.forEach(h => drawCircleHandle(h.x, h.y, '#1a73e8', '#fff', ROOM_HANDLE_R));
    edgeHandles.forEach(h   => drawCircleHandle(h.x, h.y, '#0d9488', '#fff', ROOM_HANDLE_R));
  }

  function drawCircleHandle (x, y, fill, stroke, r) {
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
  const STORAGE_KEY = 'room-planner-v3';

  function saveRoom () {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        room: cornersToFractions(room, canvas.width, canvas.height),
        shapes
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
