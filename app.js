/* ============================================
   CS2 ANALYZER — Welcome Screen Logic
   Split text + Magnetic button + Live stats + Ripple
   ============================================ */

(function () {
  'use strict';

  const tg = window.Telegram?.WebApp;

  if (tg) {
    tg.expand();
    tg.ready();
    tg.setHeaderColor('#0a0a0a');
    tg.setBackgroundColor('#0a0a0a');
    tg.enableClosingConfirmation();
  }

  // ============================================
  // 1. SPLIT TEXT ANIMATION
  // ============================================
  const titleLines = document.querySelectorAll('[data-split]');
  let totalCharDelay = 0.3;

  titleLines.forEach((line) => {
    const text = line.dataset.split;
    line.innerHTML = '';
    for (let i = 0; i < text.length; i++) {
      const span = document.createElement('span');
      span.className = 'char';
      span.textContent = text[i] === ' ' ? '\u00A0' : text[i];
      span.style.animationDelay = `${totalCharDelay}s`;
      totalCharDelay += 0.05;
      line.appendChild(span);
    }
    totalCharDelay += 0.1; // pause between lines
  });

  // ============================================
  // 2. BUTTON CLICK
  // ============================================
  const btn = document.getElementById('connectBtn');

  btn.addEventListener('click', () => {
    if (tg) {
      tg.HapticFeedback.impactOccurred('medium');
      tg.showAlert('FACEIT авторизация будет доступна в следующем обновлении');
    } else {
      console.log('FACEIT connect clicked');
    }
  });

  // ============================================
  // 3. LIVE STATS ROTATION
  // ============================================
  const stats = [
    '1.42 K/D',
    '73% HS',
    'ADR 98.2',
    '1923 ELO',
    'RATING 1.34',
    '58% WR',
    'FIRST KILL 42%',
    'CLUTCH 67%',
    'TRADE 87%',
    'LEVEL 8',
  ];

  const statValueEl = document.getElementById('statValue');
  let statIndex = 0;

  function scrambleText(el, target, duration = 400) {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ%/.';
    const startTime = performance.now();

    function update() {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      let result = '';
      for (let i = 0; i < target.length; i++) {
        if (progress * target.length > i) {
          result += target[i];
        } else {
          result += chars[Math.floor(Math.random() * chars.length)];
        }
      }
      el.textContent = result;

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }
    update();
  }

  function rotateStat() {
    statIndex = (statIndex + 1) % stats.length;
    scrambleText(statValueEl, stats[statIndex]);
  }

  // Start rotation after initial fade-in
  setTimeout(() => {
    setInterval(rotateStat, 2200);
  }, 2500);

  // ============================================
  // 4. RIPPLE EFFECT (dispatches to particles.js)
  // ============================================
  function emitRipple(x, y) {
    window.dispatchEvent(new CustomEvent('particle-ripple', {
      detail: { x, y }
    }));
  }

  document.addEventListener('click', (e) => {
    // Don't ripple on button click
    if (e.target.closest('.btn-connect')) return;
    emitRipple(e.clientX, e.clientY);
  });

  document.addEventListener('touchstart', (e) => {
    if (e.target.closest('.btn-connect')) return;
    const t = e.touches[0];
    emitRipple(t.clientX, t.clientY);
  }, { passive: true });
})();
