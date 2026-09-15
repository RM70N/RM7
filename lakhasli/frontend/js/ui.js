export function showToast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast${type === 'error' ? ' error' : ''}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

export function watchOfflineState() {
  const banner = document.createElement('div');
  banner.className = 'offline-banner';
  banner.textContent = 'ما فيه اتصال بالإنترنت حاليًا — بعض الميزات قد ما تشتغل.';
  banner.hidden = navigator.onLine;
  document.body.prepend(banner);

  window.addEventListener('online', () => {
    banner.hidden = true;
  });
  window.addEventListener('offline', () => {
    banner.hidden = false;
  });
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
