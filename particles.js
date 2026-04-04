/* ============================================
   CS2 ANALYZER — Magma Particle Field (WebGL)
   15,000+ particles at 60fps
   Touch: repel | Release: snap back
   ============================================ */

(function () {
  'use strict';

  const canvas = document.getElementById('particles');
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false });

  if (!gl) {
    console.warn('WebGL not supported');
    return;
  }

  // --- Config (adapt to screen size) ---
  const isMobile = window.innerWidth < 500;
  const PARTICLE_COUNT = isMobile ? 8000 : 15000;
  const REPEL_RADIUS = isMobile ? 0.08 : 0.06;
  const REPEL_FORCE = 0.006;
  const SNAP_BACK = 0.02;
  const FRICTION = 0.94;
  const DRIFT_SPEED = 0.0002;
  const ORANGE_RATIO = 0.35;
  const TRAIL_LENGTH = 12;

  // --- Shaders ---
  const vertexShaderSource = `
    attribute vec2 a_position;
    attribute float a_size;
    attribute float a_alpha;
    attribute vec3 a_color;

    varying float v_alpha;
    varying vec3 v_color;

    void main() {
      gl_Position = vec4(a_position * 2.0 - 1.0, 0.0, 1.0);
      gl_Position.y *= -1.0;
      gl_PointSize = a_size;
      v_alpha = a_alpha;
      v_color = a_color;
    }
  `;

  const fragmentShaderSource = `
    precision mediump float;
    varying float v_alpha;
    varying vec3 v_color;

    void main() {
      vec2 center = gl_PointCoord - vec2(0.5);
      float dist = length(center);
      if (dist > 0.5) discard;

      float softEdge = 1.0 - smoothstep(0.2, 0.5, dist);
      gl_FragColor = vec4(v_color, v_alpha * softEdge);
    }
  `;

  // --- Compile shaders ---
  function createShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
  }

  gl.useProgram(program);

  // --- Attributes ---
  const a_position = gl.getAttribLocation(program, 'a_position');
  const a_size = gl.getAttribLocation(program, 'a_size');
  const a_alpha = gl.getAttribLocation(program, 'a_alpha');
  const a_color = gl.getAttribLocation(program, 'a_color');

  // --- Particle data (CPU arrays) ---
  const positions = new Float32Array(PARTICLE_COUNT * 2);   // x, y (normalized 0-1)
  const origins = new Float32Array(PARTICLE_COUNT * 2);
  const velocities = new Float32Array(PARTICLE_COUNT * 2);
  const sizes = new Float32Array(PARTICLE_COUNT);
  const alphas = new Float32Array(PARTICLE_COUNT);
  const colors = new Float32Array(PARTICLE_COUNT * 3);
  const baseAlphas = new Float32Array(PARTICLE_COUNT);
  const pulseOffsets = new Float32Array(PARTICLE_COUNT);

  // --- Init particles ---
  function initParticles() {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const x = Math.random();
      const y = Math.random();
      positions[i * 2] = x;
      positions[i * 2 + 1] = y;
      origins[i * 2] = x;
      origins[i * 2 + 1] = y;
      velocities[i * 2] = (Math.random() - 0.5) * DRIFT_SPEED;
      velocities[i * 2 + 1] = (Math.random() - 0.5) * DRIFT_SPEED;

      // Size: adapted for screen
      const sizeRand = Math.random();
      if (isMobile) {
        sizes[i] = sizeRand < 0.5 ? 1.5 + Math.random() * 1.5
                 : sizeRand < 0.85 ? 2.5 + Math.random() * 2.0
                 : 4.0 + Math.random() * 2.5;
      } else {
        sizes[i] = sizeRand < 0.5 ? 2.0 + Math.random() * 2.5
                 : sizeRand < 0.85 ? 4.0 + Math.random() * 3.0
                 : 6.0 + Math.random() * 4.0;
      }

      // Alpha
      baseAlphas[i] = 0.15 + Math.random() * 0.55;
      alphas[i] = baseAlphas[i];
      pulseOffsets[i] = Math.random() * Math.PI * 2;

      // Color
      const isOrange = Math.random() < ORANGE_RATIO;
      if (isOrange) {
        // Orange with slight variation
        colors[i * 3] = 0.9 + Math.random() * 0.1;     // R
        colors[i * 3 + 1] = 0.2 + Math.random() * 0.15; // G
        colors[i * 3 + 2] = Math.random() * 0.05;        // B
      } else {
        // White/warm white with slight variation
        const warmth = 0.85 + Math.random() * 0.15;
        colors[i * 3] = warmth;
        colors[i * 3 + 1] = warmth - Math.random() * 0.05;
        colors[i * 3 + 2] = warmth - Math.random() * 0.1;
      }
    }
  }

  // --- GPU Buffers ---
  const positionBuffer = gl.createBuffer();
  const sizeBuffer = gl.createBuffer();
  const alphaBuffer = gl.createBuffer();
  const colorBuffer = gl.createBuffer();

  // Color buffer is static
  function uploadStaticBuffers() {
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.STATIC_DRAW);
  }

  // --- Pointer state ---
  let pointer = { x: -1, y: -1, active: false };
  let width, height;

  // --- Trail (worm) ---
  const trail = [];
  for (let i = 0; i < TRAIL_LENGTH; i++) {
    trail.push({ x: -1, y: -1 });
  }

  // --- Resize ---
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  // --- Update particles (CPU) ---
  function update(time) {
    const pxNorm = pointer.active
      ? pointer.x / width
      : -9;
    const pyNorm = pointer.active
      ? pointer.y / height
      : -9;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const ix = i * 2;
      const iy = i * 2 + 1;

      // Pulse alpha
      alphas[i] = baseAlphas[i] + Math.sin(time * 0.001 + pulseOffsets[i]) * 0.1;

      // Repel from pointer head
      if (pointer.active) {
        const dx = positions[ix] - pxNorm;
        const dy = positions[iy] - pyNorm;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < REPEL_RADIUS && dist > 0.001) {
          const force = (REPEL_RADIUS - dist) / REPEL_RADIUS;
          const invDist = 1.0 / dist;
          velocities[ix] += dx * invDist * force * REPEL_FORCE;
          velocities[iy] += dy * invDist * force * REPEL_FORCE;
          alphas[i] = Math.min(alphas[i] + force * 0.3, 1.0);
        }

        // Also repel from trail segments (worm body pushes particles)
        repelFromTrail(i);
      }

      // Snap back to origin
      velocities[ix] += (origins[ix] - positions[ix]) * SNAP_BACK;
      velocities[iy] += (origins[iy] - positions[iy]) * SNAP_BACK;

      // Friction
      velocities[ix] *= FRICTION;
      velocities[iy] *= FRICTION;

      // Move
      positions[ix] += velocities[ix];
      positions[iy] += velocities[iy];

      // Slow origin drift
      origins[ix] += (Math.random() - 0.5) * 0.00003;
      origins[iy] += (Math.random() - 0.5) * 0.00003;

      // Clamp origins
      if (origins[ix] < 0) origins[ix] = 0;
      if (origins[ix] > 1) origins[ix] = 1;
      if (origins[iy] < 0) origins[iy] = 0;
      if (origins[iy] > 1) origins[iy] = 1;
    }
  }

  // --- Draw ---
  function draw() {
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Upload dynamic data
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(a_position);
    gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuffer);
    gl.enableVertexAttribArray(a_size);
    gl.vertexAttribPointer(a_size, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, alphaBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, alphas, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(a_alpha);
    gl.vertexAttribPointer(a_alpha, 1, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.enableVertexAttribArray(a_color);
    gl.vertexAttribPointer(a_color, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT);
  }

  // --- Trail canvas (2D overlay for worm drawing) ---
  const trailCanvas = document.createElement('canvas');
  trailCanvas.style.cssText = `
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
    pointer-events: none;
  `;
  document.body.appendChild(trailCanvas);
  const tctx = trailCanvas.getContext('2d');

  function resizeTrailCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    trailCanvas.width = window.innerWidth * dpr;
    trailCanvas.height = window.innerHeight * dpr;
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // --- Update trail ---
  function updateTrail() {
    if (pointer.active) {
      trail[0].x = pointer.x;
      trail[0].y = pointer.y;
    }
    // Each segment follows the one before it (worm effect)
    for (let i = trail.length - 1; i > 0; i--) {
      const dx = trail[i - 1].x - trail[i].x;
      const dy = trail[i - 1].y - trail[i].y;
      trail[i].x += dx * 0.35;
      trail[i].y += dy * 0.35;
    }
  }

  // --- Draw trail (just the path, no dot) ---
  function drawTrail() {
    tctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    // Need at least 2 valid points
    let validCount = 0;
    for (const t of trail) {
      if (t.x >= 0) validCount++;
    }
    if (validCount < 2) return;

    // Draw fading line trail
    for (let i = 0; i < trail.length - 1; i++) {
      if (trail[i].x < 0 || trail[i + 1].x < 0) continue;
      const t = 1 - i / trail.length;
      const alpha = t * 0.35;
      const lineWidth = isMobile ? t * 1.5 : t * 3;

      tctx.beginPath();
      tctx.moveTo(trail[i].x, trail[i].y);
      tctx.lineTo(trail[i + 1].x, trail[i + 1].y);
      tctx.strokeStyle = `rgba(255, 85, 0, ${alpha})`;
      tctx.lineWidth = lineWidth;
      tctx.lineCap = 'round';
      tctx.stroke();
    }
  }

  // --- Repel from trail segments too ---
  function repelFromTrail(i) {
    const ix = i * 2;
    const iy = i * 2 + 1;

    for (let t = 0; t < trail.length; t++) {
      if (trail[t].x < 0) continue;
      const txNorm = trail[t].x / width;
      const tyNorm = trail[t].y / height;
      const dx = positions[ix] - txNorm;
      const dy = positions[iy] - tyNorm;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const segmentForce = REPEL_FORCE * (1 - t / trail.length) * 0.6;

      if (dist < REPEL_RADIUS && dist > 0.001) {
        const force = (REPEL_RADIUS - dist) / REPEL_RADIUS;
        const invDist = 1.0 / dist;
        velocities[ix] += dx * invDist * force * segmentForce;
        velocities[iy] += dy * invDist * force * segmentForce;
      }
    }
  }

  // --- Animation loop ---
  function animate(time) {
    requestAnimationFrame(animate);
    updateTrail();
    update(time);
    draw();
    drawTrail();
  }

  // --- Events ---
  function onPointerMove(x, y) {
    pointer.x = x;
    pointer.y = y;
    pointer.active = true;
  }

  function onPointerLeave() {
    pointer.active = false;
  }

  canvas.addEventListener('mousemove', (e) => onPointerMove(e.clientX, e.clientY));
  canvas.addEventListener('mouseleave', onPointerLeave);

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    onPointerLeave();
  }, { passive: false });

  canvas.addEventListener('touchcancel', onPointerLeave);

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resize();
      resizeTrailCanvas();
    }, 100);
  });

  // --- Start ---
  resize();
  resizeTrailCanvas();
  gl.clearColor(0, 0, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  initParticles();
  uploadStaticBuffers();

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!prefersReducedMotion.matches) {
    animate(0);
  } else {
    update(0);
    draw();
  }
})();
