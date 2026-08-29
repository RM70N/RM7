import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { Wordmark } from './Logo';
import { ThemeToggle } from './ThemeToggle';
import {
  ChatIcon,
  CloseIcon,
  LogoutIcon,
  MemoryIcon,
  MenuIcon,
  SearchIcon,
  SettingsIcon,
  SiteIcon,
  SkillIcon,
  StudioIcon,
} from './Icons';

interface NavItem {
  to: string;
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
  end?: boolean;
}

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'المحادثة',
    items: [{ to: '/', label: 'الشات', icon: ChatIcon, end: true }],
  },
  {
    title: 'المعرفة',
    items: [
      { to: '/memory', label: 'الذاكرة', icon: MemoryIcon },
      { to: '/skills', label: 'المهارات والملفات', icon: SkillIcon },
      { to: '/search', label: 'البحث', icon: SearchIcon },
    ],
  },
  {
    title: 'الإنتاج',
    items: [
      { to: '/sites', label: 'المواقع المرفوعة', icon: SiteIcon },
      { to: '/studio', label: 'الاستوديو البصري', icon: StudioIcon },
    ],
  },
  {
    title: 'النظام',
    items: [{ to: '/settings', label: 'الإعدادات', icon: SettingsIcon }],
  },
];

export function AppShell() {
  const { logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // نقفل قائمة الجوال مع كل تنقّل
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh bg-ink-50 dark:bg-ink-950">
      {menuOpen ? (
        <div
          className="fixed inset-0 z-30 bg-ink-950/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        className={[
          'fixed inset-y-0 right-0 z-40 flex w-72 flex-col border-l bg-white transition-transform duration-200',
          'border-ink-200 dark:border-ink-800 dark:bg-ink-900',
          'lg:static lg:translate-x-0',
          menuOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <div className="flex items-center justify-between border-b border-ink-200 p-4 dark:border-ink-800">
          <Wordmark subtitle="مساعدك الخاص" />
          <button
            type="button"
            className="btn-ghost !px-2 lg:hidden"
            onClick={() => setMenuOpen(false)}
            aria-label="إغلاق القائمة"
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto p-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-2 px-3 text-xs font-bold uppercase tracking-wide text-ink-400 dark:text-ink-500">
                {group.title}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      isActive ? 'nav-link nav-link-active' : 'nav-link'
                    }
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="flex items-center justify-between gap-2 border-t border-ink-200 p-4 dark:border-ink-800">
          <button type="button" className="btn-ghost" onClick={() => void logout()}>
            <LogoutIcon className="h-4 w-4" />
            خروج
          </button>
          <ThemeToggle />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-ink-200 bg-ink-50/85 px-4 py-3 backdrop-blur dark:border-ink-800 dark:bg-ink-950/85 lg:hidden">
          <Wordmark />
          <button
            type="button"
            className="btn-ghost !px-2"
            onClick={() => setMenuOpen(true)}
            aria-label="فتح القائمة"
          >
            <MenuIcon />
          </button>
        </header>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
