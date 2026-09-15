import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { db } from './firebase-config.js';
import { logout } from './auth.js';

const LINKS = [
  { href: 'dashboard.html', label: 'لوحة التحكم' },
  { href: 'shop.html', label: 'متجر التركيز' },
  { href: 'profile.html', label: 'ملفي' },
];

/**
 * يرسم شريط التنقل داخل #nav-root ويربط النقاط/السلسلة الحية بمستند المستخدم.
 * @param {import('firebase/auth').User} user
 * @param {string} activePage - اسم الملف الحالي، مثل 'dashboard.html'
 */
export function renderNav(user, activePage) {
  const root = document.getElementById('nav-root');
  if (!root) return;

  const initial = (user.displayName || user.email || '?').trim()[0]?.toUpperCase() || '؟';

  root.innerHTML = `
    <div class="nav">
      <div class="nav-inner">
        <a href="dashboard.html" class="nav-logo">لخّصلي 📚</a>
        <div class="nav-links">
          ${LINKS.map(
            (l) => `<a href="${l.href}" style="${l.href === activePage ? 'color:var(--primary);font-weight:700' : ''}">${l.label}</a>`
          ).join('')}
        </div>
        <div class="nav-stats">
          <span class="badge badge-accent" id="nav-streak">🔥 0</span>
          <span class="badge" id="nav-points">⭐ 0</span>
          <div class="nav-user" id="nav-user" title="تسجيل خروج">${initial}</div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('nav-user').addEventListener('click', async () => {
    if (confirm('تسجيل الخروج؟')) {
      await logout();
      window.location.href = 'login.html';
    }
  });

  onSnapshot(doc(db, 'users', user.uid), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    document.getElementById('nav-streak').textContent = `🔥 ${data.streakCount || 0}`;
    document.getElementById('nav-points').textContent = `⭐ ${data.points || 0}`;
  });
}
