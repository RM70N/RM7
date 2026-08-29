import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { AppShell } from '@/components/AppShell';
import { Spinner } from '@/components/Spinner';
import { LoginPage } from '@/pages/LoginPage';
import { ChatPage } from '@/pages/ChatPage';
import { MemoryPage } from '@/pages/MemoryPage';
import { SkillsPage } from '@/pages/SkillsPage';
import { SearchPage } from '@/pages/SearchPage';
import { SitesPage } from '@/pages/SitesPage';
import { StudioPage } from '@/pages/StudioPage';
import { SettingsPage } from '@/pages/SettingsPage';

function Gate() {
  const { owner, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink-50 dark:bg-ink-950">
        <Spinner label="نجهّز احسمها AI…" />
      </div>
    );
  }

  if (!owner) return <LoginPage />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<ChatPage />} />
        <Route path="memory" element={<MemoryPage />} />
        <Route path="skills" element={<SkillsPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="sites" element={<SitesPage />} />
        <Route path="studio" element={<StudioPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  );
}
