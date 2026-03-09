/* ===========================
   Room Planner — script.js
   Phase 1+2+3+3.5+4: Colours
   =========================== */

(function () {
  'use strict';

  const canvas = document.getElementById('room-canvas');
  const ctx    = canvas.getContext('2d');

  // ── Colour palette (Phase 4) ──────────────────────────
  const COLOURS = [
    { hex: '#ffffff', label: 'White'     },
    { hex: '#f0f0f0', label: 'Light Grey'},
    { hex: '#4a4a4a', label: 'Dark Grey' },
    { hex: '#e74c3c', label: 'Red'       },
    { hex: '#e67e22', label: 'Orange'    },
    { hex: '#f1c40f', label: 'Yellow'    },
    { hex: '#2ecc71', label: 'Green'     },
    { hex: '#3498db', label: 'Blue'      },
    { hex: '#9b59b6', label: 'Purple'    },
    { hex: '#e91e8c', label: 'Pink'      },
    { hex: '#795548', label: 'Brown'     },
    { hex: '#000000', label: 'Black'     },
  ];

  // ── Viewport ──────────────────────────────────────────
  let zoom = 1.0, panX = 0, panY = 0;
  const MIN_ZOOM = 0.2, MAX_ZOOM = 5.0;
  let isPanning = false, panStartX = 0, panStartY = 0, panOriginX = 0, panOriginY = 0;

  // ── App state ─────────────────────────────────────────
  let editMode = false, room = null, shapes = [], selectedShape = null;
  let activeShapeTool = null, drag = null;
  let cornerHandles = [], edgeHandles = [];

  const ROOM_HANDLE_R = 7, SEL_HANDLE_R = 6, ROT_HANDLE_R = 6;
  const ROT_OFFSET = 28, MIN_SHAPE_SIZE = 20;

  const SHAPE_DEFAULTS = {
    square: { w: 80, h: 80 },
    rect:   { w: 120, h: 70 },
    circle: { w: 80, h: 80 }
  };

  // ── Init ──────────────────────────────────────────────
  function init () {
    resizeCanvas();
    window.addEventListener('resize', onWindowResize);

    canvas.addEventListener('pointerdown',  onPointerDown);
    canvas.addEventListener('pointermove',  onPointerMove);
    canvas.addEventListener('pointerup',    onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
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

    buildColourPalette();
    loadRoom();
    draw();
  }

  // ── Colour palette DOM ────────────────────────────────
  function buildColourPalette () {
    const grid = document.getElementById('colour-grid');
    if (!grid) return;
    grid.innerHTML = '';
    COLOURS.forEach(c => {
      const btn = document.createElement('button');
      btn.className   = 'colour-swatch';
      btn.title       = c.label;
      btn.style.background = c.hex;
      if (c.hex === '#ffffff' || c.hex === '#f0f0f0' || c.hex === '#f1c40f') {
        btn.style.border = '2px solid #ccc';
      } else {
        btn.style.border = '2px solid transparent';
      }
      btn.addEventListener('click', () => applyColour(c.hex));
      grid.appendChild(btn);
    });
  }

  function applyColour (hex) {
    if (!selectedShape) return;
    selectedShape.fill = hex;
    updateColourUI();
    draw();
  }

  function updateColourUI () {
    // highlight the active swatch
    const grid = document.getElementById('colour-grid');
    if (!grid) return;
    const swatches = grid.querySelectorAll('.colour-swatch');
    swatches.forEach((btn, i) => {
      const active = selectedShape && COLOURS[i].hex === selectedShape.fill;
      btn.classList.toggle('active', active);
      btn.style.border = active
        ? '2px solid #1a73e8'
        : (COLOURS[i].hex === '#ffffff' || COLOURS[i].hex === '#f0f0f0' || COLOURS[i].hex === '#f1c40f')
          ? '2px solid #ccc'
          : '2px solid transparent';
    });
  }

  // ── Canvas resize ─────────────────────────────────────
  function resizeCanvas () {
    const area = document.getElementById('canvas-area');
    canvas.width = area.clientWidth; canvas.height = area.clientHeight;
    if (!room) room = defaultRoom(canvas.width, canvas.height);
    draw();
  }
  function onWindowResize () { resizeCanvas(); }

  function defaultRoom (w, h) {
    const m = 32;
    return [{ x:m, y:m }, { x:w-m, y:m }, { x:w-m, y:h-m }, { x:m, y:h-m }];
  }
  function cornersToFractions (c, w, h) { return c.map(p => ({ fx:p.x/w, fy:p.y/h })); }
  function fractionsToCorners (f, w, h) { return f.map(p => ({ x:p.fx*w, y:p.fy*h })); }

  // ── Zoom / Pan ────────────────────────────────────────
  function zoomBy (factor, cx, cy) {
    cx = cx ?? canvas.width/2; cy = cy ?? canvas.height/2;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    const scale = newZoom / zoom;
    panX = cx - scale*(cx - panX); panY = cy - scale*(cy - panY);
    zoom = newZoom; updateZoomLabel(); draw();
  }
  function resetZoom () { zoom=1; panX=0; panY=0; updateZoomLabel(); draw(); }
  function updateZoomLabel () {
    const el = document.getElementById('zoom-label');
    if (el) el.textContent = Math.round(zoom*100)+'%';
  }
  function onWheel (e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    zoomBy(e.deltaY < 0 ? 1.1 : 0.9,
           (e.clientX - rect.left)*(canvas.width/rect.width),
           (e.clientY - rect.top)*(canvas.height/rect.height));
  }

  // ── Coord helpers ─────────────────────────────────────
  function toWorld  (px, py) { return { x:(px-panX)/zoom, y:(py-panY)/zoom }; }
  function toCanvas (wx, wy) { return { x:wx*zoom+panX,   y:wy*zoom+panY   }; }
  function getPos (e) {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width/r.width, sy = canvas.height/r.height;
    const src = e.touches ? e.touches[0] : e;
    return toWorld((src.clientX-r.left)*sx, (src.clientY-r.top)*sy);
  }
  function getRawPos (e) {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width/r.width, sy = canvas.height/r.height;
    const src = e.touches ? e.touches[0] : e;
    return { x:(src.clientX-r.left)*sx, y:(src.clientY-r.top)*sy };
  }

  // ── Room handles ──────────────────────────────────────
  function buildRoomHandles () {
    cornerHandles = room.map((c,i) => ({ x:c.x, y:c.y, index:i }));
    edgeHandles   = room.map((c,i) => {
      const n = room[(i+1)%4];
      return { x:(c.x+n.x)/2, y:(c.y+n.y)/2, index:i };
    });
  }

  // ── Shape tool ────────────────────────────────────────
  function activateShapeTool (type) {
    activeShapeTool = type; selectedShape = null;
    updateSelectionUI();
    ['btn-square','btn-rect','btn-circle'].forEach(id =>
      document.getElementById(id).classList.remove('active'));
    document.getElementById({square:'btn-square',rect:'btn-rect',circle:'btn-circle'}[type])
      .classList.add('active');
    canvas.style.cursor = 'crosshair'; draw();
  }
  function clearShapeTool () {
    activeShapeTool = null;
    ['btn-square','btn-rect','btn-circle'].forEach(id =>
      document.getElementById(id).classList.remove('active'));
    canvas.style.cursor = 'default';
  }

  function addShape (type, cx, cy) {
    const d = SHAPE_DEFAULTS[type];
    const s = { id:Date.now(), type, x:cx-d.w/2, y:cy-d.h/2,
                w:d.w, h:d.h, angle:0, fill:'#ffffff' };
    shapes.push(s); selectedShape = s; updateSelectionUI(); return s;
  }

  // ── Selection UI (delete btn + colour palette) ────────
  function updateSelectionUI () {
    const del = document.getElementById('btn-delete-shape');
    const col = document.getElementById('colour-section');
    if (del) del.style.display = selectedShape ? 'block' : 'none';
    if (col) col.style.display = selectedShape ? 'block' : 'none';
    updateColourUI();
  }

  function deleteSelected () {
    if (!selectedShape) return;
    shapes = shapes.filter(s => s !== selectedShape);
    selectedShape = null; updateSelectionUI(); draw();
  }
  function onKeyDown (e) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (document.activeElement.tagName === 'INPUT' ||
          document.activeElement.tagName === 'TEXTAREA') return;
      deleteSelected();
    }
  }

  // ── Room bounds / clamp ───────────────────────────────
  function roomBounds () {
    const xs = room.map(c=>c.x), ys = room.map(c=>c.y);
    return { left:Math.min(...xs), top:Math.min(...ys),
             right:Math.max(...xs), bottom:Math.max(...ys) };
  }
  function clampShapeToRoom (s) {
    const b = roomBounds();
    s.x = Math.max(b.left, Math.min(b.right -s.w, s.x));
    s.y = Math.max(b.top,  Math.min(b.bottom-s.h, s.y));
  }

  // ── Selection handles ─────────────────────────────────
  function getSelHandles (s) {
    const cx=s.x+s.w/2, cy=s.y+s.h/2, hw=s.w/2, hh=s.h/2;
    const cos=Math.cos(s.angle), sin=Math.sin(s.angle);
    const corners = [
      {lx:-hw,ly:-hh,index:0},{lx:hw,ly:-hh,index:1},
      {lx:hw,ly:hh,index:2},{lx:-hw,ly:hh,index:3}
    ].map(({lx,ly,index}) => ({
      x: cx+lx*cos-ly*sin, y: cy+lx*sin+ly*cos, index
    }));
    return { corners, rotate: {
      x: cx - Math.sin(s.angle)*(-(hh+ROT_OFFSET)),
      y: cy + Math.cos(s.angle)*(-(hh+ROT_OFFSET))
    }};
  }

  // ── Hit testing ───────────────────────────────────────
  function hitCircleW (wx, wy, hx, hy, r) {
    const sr = (r+4)/zoom, dx=wx-hx, dy=wy-hy;
    return dx*dx+dy*dy <= sr*sr;
  }
  function hitRoomHandle (wx, wy, handles) {
    for (let i=handles.length-1; i>=0; i--)
      if (hitCircleW(wx,wy,handles[i].x,handles[i].y,ROOM_HANDLE_R)) return i;
    return -1;
  }
  function hitSelHandle (wx, wy) {
    if (!selectedShape) return null;
    const h = getSelHandles(selectedShape);
    if (hitCircleW(wx,wy,h.rotate.x,h.rotate.y,ROT_HANDLE_R)) return {type:'rotate'};
    for (const c of h.corners)
      if (hitCircleW(wx,wy,c.x,c.y,SEL_HANDLE_R)) return {type:'resize',index:c.index};
    return null;
  }
  function hitShape (wx, wy) {
    for (let i=shapes.length-1; i>=0; i--) {
      const s=shapes[i], cx=s.x+s.w/2, cy=s.y+s.h/2;
      const cos=Math.cos(-s.angle), sin=Math.sin(-s.angle);
      const lx=(wx-cx)*cos-(wy-cy)*sin, ly=(wx-cx)*sin+(wy-cy)*cos;
      if (s.type==='circle') {
        if ((lx/(s.w/2))*(lx/(s.w/2))+(ly/(s.h/2))*(ly/(s.h/2))<=1) return s;
      } else {
        if (lx>=-s.w/2&&lx<=s.w/2&&ly>=-s.h/2&&ly<=s.h/2) return s;
      }
    }
    return null;
  }

  // ── Pointer events ────────────────────────────────────
  function onPointerDown (e) {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const raw = getRawPos(e);
    const {x,y} = toWorld(raw.x, raw.y);

    if (activeShapeTool) {
      const s = addShape(activeShapeTool, x, y);
      clampShapeToRoom(s); clearShapeTool(); draw(); return;
    }
    if (e.button===1 || e.altKey) {
      isPanning=true; panStartX=raw.x; panStartY=raw.y;
      panOriginX=panX; panOriginY=panY;
      canvas.style.cursor='grabbing'; return;
    }
    if (editMode) {
      const ci = hitRoomHandle(x,y,cornerHandles);
      if (ci!==-1) { drag={type:'corner',index:cornerHandles[ci].index,startX:x,startY:y,origRoom:room.map(c=>({...c}))}; return; }
      const ei = hitRoomHandle(x,y,edgeHandles);
      if (ei!==-1) { drag={type:'edge',index:edgeHandles[ei].index,startX:x,startY:y,origRoom:room.map(c=>({...c}))}; return; }
    }
    const sh = hitSelHandle(x,y);
    if (sh) {
      const s = selectedShape;
      if (sh.type==='rotate') {
        const cx=s.x+s.w/2, cy=s.y+s.h/2;
        drag={type:'rotate',shape:s,startAngle:s.angle,startAtan:Math.atan2(y-cy,x-cx)};
      } else {
        const h=getSelHandles(s), opp=h.corners[(sh.index+2)%4];
        drag={type:'resize',shape:s,cornerIndex:sh.index,startX:x,startY:y,
              origX:s.x,origY:s.y,origW:s.w,origH:s.h,origAngle:s.angle,
              anchorX:opp.x,anchorY:opp.y};
      }
      return;
    }
    const hit = hitShape(x,y);
    if (hit) {
      selectedShape=hit; shapes=shapes.filter(s=>s!==hit); shapes.push(hit);
      drag={type:'shape',shape:hit,startX:x,startY:y,origX:hit.x,origY:hit.y};
      updateSelectionUI(); draw(); return;
    }
    selectedShape=null; updateSelectionUI();
    isPanning=true; panStartX=raw.x; panStartY=raw.y;
    panOriginX=panX; panOriginY=panY; canvas.style.cursor='grabbing'; draw();
  }

  function onPointerMove (e) {
    const raw = getRawPos(e);
    const {x,y} = toWorld(raw.x, raw.y);
    if (isPanning) {
      panX=panOriginX+(raw.x-panStartX); panY=panOriginY+(raw.y-panStartY);
      canvas.style.cursor='grabbing'; draw(); return;
    }
    if (!drag) {
      if (activeShapeTool) { canvas.style.cursor='crosshair'; return; }
      const sh=hitSelHandle(x,y);
      if (sh) { canvas.style.cursor=sh.type==='rotate'?'grab':'nwse-resize'; return; }
      if (editMode) {
        canvas.style.cursor=(hitRoomHandle(x,y,cornerHandles)!==-1||hitRoomHandle(x,y,edgeHandles)!==-1)?'grab':'default';
      } else {
        canvas.style.cursor=hitShape(x,y)?'grab':'default';
      }
      return;
    }
    e.preventDefault();
    const dx=x-drag.startX, dy=y-drag.startY;
    if (drag.type==='corner') {
      room[drag.index]={x:drag.origRoom[drag.index].x+dx,y:drag.origRoom[drag.index].y+dy};
    } else if (drag.type==='edge') {
      const i=drag.index, n=(i+1)%4;
      const horiz=Math.abs(drag.origRoom[n].x-drag.origRoom[i].x)>Math.abs(drag.origRoom[n].y-drag.origRoom[i].y);
      if (horiz) {
        room[i]={x:drag.origRoom[i].x,y:drag.origRoom[i].y+dy};
        room[n]={x:drag.origRoom[n].x,y:drag.origRoom[n].y+dy};
      } else {
        room[i]={x:drag.origRoom[i].x+dx,y:drag.origRoom[i].y};
        room[n]={x:drag.origRoom[n].x+dx,y:drag.origRoom[n].y};
      }
    } else if (drag.type==='shape') {
      drag.shape.x=drag.origX+dx; drag.shape.y=drag.origY+dy; clampShapeToRoom(drag.shape);
    } else if (drag.type==='rotate') {
      const s=drag.shape, cx=s.x+s.w/2, cy=s.y+s.h/2;
      s.angle=drag.startAngle+(Math.atan2(y-cy,x-cx)-drag.startAtan);
    } else if (drag.type==='resize') {
      const s=drag.shape;
      const cos=Math.cos(-s.angle), sin=Math.sin(-s.angle);
      const wxm=x-drag.anchorX, wym=y-drag.anchorY;
      const lxm=wxm*cos-wym*sin, lym=wxm*sin+wym*cos;
      const ci=drag.cornerIndex;
      const signX=(ci===0||ci===3)?-1:1, signY=(ci===0||ci===1)?-1:1;
      s.w=Math.max(MIN_SHAPE_SIZE,Math.abs(lxm)); s.h=Math.max(MIN_SHAPE_SIZE,Math.abs(lym));
      const cosA=Math.cos(s.angle), sinA=Math.sin(s.angle);
      const oppLx=-signX*s.w/2, oppLy=-signY*s.h/2;
      s.x=drag.anchorX+(-oppLx*cosA+oppLy*sinA)-s.w/2;
      s.y=drag.anchorY+(-oppLx*sinA-oppLy*cosA)-s.h/2;
    }
    draw();
  }

  function onPointerUp () {
    if (isPanning) { isPanning=false; canvas.style.cursor='default'; }
    drag=null;
  }

  // ── Drawing ───────────────────────────────────────────
  function draw () {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save();
    ctx.translate(panX,panY); ctx.scale(zoom,zoom);
    drawRoom(); shapes.forEach(drawShape);
    if (editMode) { buildRoomHandles(); drawRoomHandlesOnCanvas(); }
    ctx.restore();
    if (selectedShape) drawSelHandles(selectedShape);
  }

  function drawRoom () {
    if (!room) return;
    ctx.beginPath(); ctx.moveTo(room[0].x,room[0].y);
    for (let i=1;i<4;i++) ctx.lineTo(room[i].x,room[i].y);
    ctx.closePath();
    ctx.fillStyle='#ffffff'; ctx.fill();
    ctx.strokeStyle='#222222'; ctx.lineWidth=3/zoom; ctx.lineJoin='round'; ctx.stroke();
  }

  function drawShape (s) {
    const cx=s.x+s.w/2, cy=s.y+s.h/2;
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(s.angle);
    ctx.fillStyle=s.fill||'#ffffff'; ctx.strokeStyle='#222222'; ctx.lineWidth=2/zoom;
    if (s.type==='circle') {
      ctx.beginPath(); ctx.ellipse(0,0,s.w/2,s.h/2,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.rect(-s.w/2,-s.h/2,s.w,s.h); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  function drawRoomHandlesOnCanvas () {
    const r=ROOM_HANDLE_R/zoom;
    cornerHandles.forEach(h=>drawWorldCircle(h.x,h.y,r,'#1a73e8','#fff'));
    edgeHandles.forEach(h=>drawWorldCircle(h.x,h.y,r,'#0d9488','#fff'));
  }
  function drawWorldCircle (x,y,r,fill,stroke) {
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fillStyle=fill; ctx.fill(); ctx.strokeStyle=stroke; ctx.lineWidth=2/zoom; ctx.stroke();
  }

  function drawSelHandles (s) {
    const h=getSelHandles(s);
    const csc=toCanvas(s.x+s.w/2, s.y+s.h/2);
    ctx.save(); ctx.translate(csc.x,csc.y); ctx.rotate(s.angle);
    ctx.strokeStyle='#1a73e8'; ctx.lineWidth=1.5; ctx.setLineDash([5,3]);
    if (s.type==='circle') {
      ctx.beginPath(); ctx.ellipse(0,0,s.w/2*zoom+6,s.h/2*zoom+6,0,0,Math.PI*2); ctx.stroke();
    } else {
      ctx.strokeRect(-s.w/2*zoom-5,-s.h/2*zoom-5,s.w*zoom+10,s.h*zoom+10);
    }
    ctx.setLineDash([]); ctx.restore();

    h.corners.forEach(c => {
      const sc=toCanvas(c.x,c.y);
      drawScreenCircle(sc.x,sc.y,SEL_HANDLE_R,'#1a73e8','#fff');
    });

    const sr=toCanvas(h.rotate.x,h.rotate.y);
    const tcw={x:s.x+s.w/2-Math.sin(s.angle)*(-s.h/2), y:s.y+s.h/2+Math.cos(s.angle)*(-s.h/2)};
    const tc=toCanvas(tcw.x,tcw.y);
    ctx.beginPath(); ctx.moveTo(tc.x,tc.y); ctx.lineTo(sr.x,sr.y);
    ctx.strokeStyle='#1a73e8'; ctx.lineWidth=1.5; ctx.setLineDash([3,2]); ctx.stroke(); ctx.setLineDash([]);
    drawScreenCircle(sr.x,sr.y,ROT_HANDLE_R,'#fff','#1a73e8');
    ctx.save(); ctx.translate(sr.x,sr.y); ctx.rotate(s.angle);
    ctx.strokeStyle='#1a73e8'; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(0,0,3,-Math.PI*0.7,Math.PI*0.7); ctx.stroke();
    ctx.restore();
  }

  function drawScreenCircle (x,y,r,fill,stroke) {
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fillStyle=fill; ctx.fill(); ctx.strokeStyle=stroke; ctx.lineWidth=2; ctx.stroke();
  }

  // ── Edit mode ─────────────────────────────────────────
  function toggleEditMode () {
    editMode=!editMode; clearShapeTool();
    document.getElementById('btn-edit-room').classList.toggle('active',editMode); draw();
  }

  // ── Persistence ───────────────────────────────────────
  const STORAGE_KEY = 'room-planner-v5';
  function saveRoom () {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        room:cornersToFractions(room,canvas.width,canvas.height),
        shapes, zoom, panX, panY
      }));
      flashSaveButton();
    } catch(e) { console.warn(e); }
  }
  function loadRoom () {
    try {
      const raw=localStorage.getItem(STORAGE_KEY); if(!raw) return;
      const data=JSON.parse(raw);
      if(data.room&&data.room.length===4) room=fractionsToCorners(data.room,canvas.width,canvas.height);
      if(data.shapes&&Array.isArray(data.shapes)) shapes=data.shapes.map(s=>({angle:0,fill:'#ffffff',...s}));
      if(data.zoom) { zoom=data.zoom; panX=data.panX||0; panY=data.panY||0; }
      updateZoomLabel();
    } catch(e) { console.warn(e); }
  }
  function flashSaveButton () {
    const btn=document.getElementById('btn-save'), orig=btn.textContent;
    btn.textContent='Saved ✓'; btn.style.color='#1a73e8';
    setTimeout(()=>{ btn.textContent=orig; btn.style.color=''; },1500);
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();
