/* ============================================
   CS2 ANALYZER — Telegram Mini App Init
   ============================================ */

(function () {
  'use strict';

  const tg = window.Telegram?.WebApp;

  if (tg) {
    // Expand to full screen
    tg.expand();
    tg.ready();

    // Set header color to match our dark theme
    tg.setHeaderColor('#0a0a0a');
    tg.setBackgroundColor('#0a0a0a');

    // Disable closing confirmation (welcome screen)
    tg.enableClosingConfirmation();
  }

  // Connect button
  const connectBtn = document.getElementById('connectBtn');
  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      if (tg) {
        // In production: redirect to FACEIT OAuth
        // For now: haptic feedback + alert
        tg.HapticFeedback.impactOccurred('medium');
        tg.showAlert('FACEIT авторизация будет доступна в следующем обновлении');
      } else {
        alert('Откройте через Telegram для подключения FACEIT');
      }
    });
  }
})();
