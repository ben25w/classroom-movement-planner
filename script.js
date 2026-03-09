/* ===========================
   Room Planner — script.js
   Phase 1: Room Canvas
   =========================== */

(function () {
  'use strict';

  // ── Canvas setup ──────────────────────────────────────
  const canvas = document.getElementById('room-canvas');
  const ctx    = canvas.getContext('2d');

  // ── State ─────────────────────────────────────────────
  let editMode = false;   // true when handles are visible / draggable

  // Room corners — stored as fractions of canvas size so they
  // survive a resize.  Order: TL, TR, BR, BL
  let room = null;        // set after first resize

  // Active drag: { type: 'corner'|'edge', index, startX, startY, origRoom }
  let drag = null;

  // Handle geometry (pixel coords, recalculated each draw)
  let cornerHandles = [];   // 4 items: { x, y, index }
  let edgeHandles   = [];   // 4 items: { x, y, index } — midpoints of each wall

  const HANDLE_R   = 7;     // radius of handle circle
  const MIN_SIZE   = 80;    // minimum room width / height in px

  // ── Initialise ────────────────────────────────────────
  function init () {
    resizeCanvas();
    window.addEventListener('resize', onWindowResize);

    // Pointer events (covers mouse + touch)
    canvas.addEventListener('pointerdown',  onPointerDown);
    canvas.addEventListener('pointermove',  onPointerMove);
    canvas.addEventListener('pointerup',    onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);

    // Header buttons
    document.getElementById('btn-edit-room').addEventListener('click', toggleEditMode);
    document.getElementById('btn-save').addEventListener('click', saveRoom);
    document.getElementById('btn-print').addEventListener('click', () => window.print());

    loadRoom();   // restore from localStorage if available
    draw();
  }

  // ── Canvas sizing ─────────────────────────────────────
  function resizeCanvas () {
    const area = document.getElementById('canvas-area');
    const w = area.clientWidth;
    const h = area.clientHeight;

    // Save fractional corners before resize
    let frac = null;
    if (room) {
      frac = cornersToFractions(room, canvas.width, canvas.height);
    }

    canvas.width  = w;
    canvas.height = h;

    if (frac) {
      room = fractionsToCorners(frac, w, h);
    } else {
      room = defaultRoom(w, h);
    }
    draw();
  }

  function onWindowResize () {
    resizeCanvas();
  }

  // ── Default room (centred square, 60% of smallest dimension) ──
  function defaultRoom (w, h) {
    const size   = Math.min(w, h) * 0.60;
    const left   = (w - size) / 2;
    const top    = (h - size) / 2;
    const right  = left + size;
    const bottom = top  + size;
    return [
      { x: left,  y: top    },   // 0 TL
      { x: right, y: top    },   // 1 TR
      { x: right, y: bottom },   // 2 BR
      { x: left,  y: bottom }    // 3 BL
    ];
  }

  // ── Fraction helpers (for resize-safe storage) ────────
  function cornersToFractions (corners, w, h) {
    return corners.map(c => ({ fx: c.x / w, fy: c.y / h }));
  }
  function fractionsToCorners (fracs, w, h) {
    return fracs.map(f => ({ x: f.fx * w, y: f.fy * h }));
  }

  // ── Build handle arrays from current room ─────────────
  function buildHandles () {
    // Corner handles
    cornerHandles = room.map((c, i) => ({ x: c.x, y: c.y, index: i }));

    // Edge midpoint handles (between consecutive corners)
    edgeHandles = room.map((c, i) => {
      const next = room[(i + 1) % 4];
      return {
        x:     (c.x + next.x) / 2,
        y:     (c.y + next.y) / 2,
        index: i   // index of the "from" corner for this edge
      };
    });
  }

  // ── Drawing ───────────────────────────────────────────
  function draw () {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRoom();
    if (editMode) {
      buildHandles();
      drawHandles();
    }
  }

  function drawRoom () {
    if (!room) return;
    ctx.beginPath();
    ctx.moveTo(room[0].x, room[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(room[i].x, room[i].y);
    ctx.closePath();

    // Floor fill
    ctx.fillStyle   = '#ffffff';
    ctx.fill();

    // Walls
    ctx.strokeStyle = '#222222';
    ctx.lineWidth   = 3;
    ctx.lineJoin    = 'round';
    ctx.stroke();
  }

  function drawHandles () {
    // Corner handles — blue
    cornerHandles.forEach(h => {
      drawCircleHandle(h.x, h.y, '#1a73e8', '#fff');
    });

    // Edge handles — lighter teal
    edgeHandles.forEach(h => {
      drawCircleHandle(h.x, h.y, '#0d9488', '#fff');
    });
  }

  function drawCircleHandle (x, y, fill, stroke) {
    ctx.beginPath();
    ctx.arc(x, y, HANDLE_R, 0, Math.PI * 2);
    ctx.fillStyle   = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth   = 2;
    ctx.stroke();
  }

  // ── Edit mode toggle ──────────────────────────────────
  function toggleEditMode () {
    editMode = !editMode;
    const btn = document.getElementById('btn-edit-room');
    btn.classList.toggle('active', editMode);
    draw();
  }

  // ── Hit testing ───────────────────────────────────────
  function hitHandle (px, py, handles) {
    for (let i = handles.length - 1; i >= 0; i--) {
      const h  = handles[i];
      const dx = px - h.x;
      const dy = py - h.y;
      if (dx * dx + dy * dy <= (HANDLE_R + 4) * (HANDLE_R + 4)) return i;
    }
    return -1;
  }

  // ── Pointer events ────────────────────────────────────
  function getPos (e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    if (e.touches && e.touches.length) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top)  * scaleY
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY
    };
  }

  function onPointerDown (e) {
    if (!editMode) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);

    const { x, y } = getPos(e);

    // Check corner handles first
    const ci = hitHandle(x, y, cornerHandles);
    if (ci !== -1) {
      drag = {
        type:     'corner',
        index:    cornerHandles[ci].index,
        startX:   x,
        startY:   y,
        origRoom: room.map(c => ({ ...c }))
      };
      return;
    }

    // Then edge handles
    const ei = hitHandle(x, y, edgeHandles);
    if (ei !== -1) {
      drag = {
        type:     'edge',
        index:    edgeHandles[ei].index,
        startX:   x,
        startY:   y,
        origRoom: room.map(c => ({ ...c }))
      };
    }
  }

  function onPointerMove (e) {
    if (!drag) {
      // Update cursor
      if (editMode) {
        const { x, y } = getPos(e);
        const onCorner = hitHandle(x, y, cornerHandles) !== -1;
        const onEdge   = hitHandle(x, y, edgeHandles)   !== -1;
        canvas.style.cursor = (onCorner || onEdge) ? 'grab' : 'default';
      }
      return;
    }
    e.preventDefault();

    const { x, y } = getPos(e);
    const dx = x - drag.startX;
    const dy = y - drag.startY;
    const orig = drag.origRoom;

    if (drag.type === 'corner') {
      // Move just that corner
      room[drag.index] = {
        x: orig[drag.index].x + dx,
        y: orig[drag.index].y + dy
      };
    } else {
      // Edge drag — push the two corners that share this edge
      const i    = drag.index;
      const next = (i + 1) % 4;

      // Determine if edge is primarily horizontal or vertical
      const edgeDX = orig[next].x - orig[i].x;
      const edgeDY = orig[next].y - orig[i].y;
      const horiz  = Math.abs(edgeDX) > Math.abs(edgeDY);

      if (horiz) {
        // Move both corners vertically
        room[i]    = { x: orig[i].x,    y: orig[i].y    + dy };
        room[next] = { x: orig[next].x, y: orig[next].y + dy };
      } else {
        // Move both corners horizontally
        room[i]    = { x: orig[i].x    + dx, y: orig[i].y    };
        room[next] = { x: orig[next].x + dx, y: orig[next].y };
      }
    }

    draw();
  }

  function onPointerUp (e) {
    if (drag) {
      drag = null;
      canvas.style.cursor = 'default';
    }
  }

  // ── Persistence ───────────────────────────────────────
  const STORAGE_KEY = 'room-planner-v1';

  function saveRoom () {
    try {
      const data = {
        room: cornersToFractions(room, canvas.width, canvas.height)
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      flashSaveButton();
    } catch (err) {
      console.warn('Save failed:', err);
    }
  }

  function loadRoom () {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.room && data.room.length === 4) {
        room = fractionsToCorners(data.room, canvas.width, canvas.height);
      }
    } catch (err) {
      console.warn('Load failed:', err);
    }
  }

  function flashSaveButton () {
    const btn = document.getElementById('btn-save');
    const orig = btn.textContent;
    btn.textContent = 'Saved ✓';
    btn.style.color = '#1a73e8';
    setTimeout(() => {
      btn.textContent = orig;
      btn.style.color = '';
    }, 1500);
  }

  // ── Go ────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
