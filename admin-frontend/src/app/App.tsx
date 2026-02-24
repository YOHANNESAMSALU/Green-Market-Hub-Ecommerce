import React, { useEffect, useState } from 'react';
import { Button } from './components/Button';
import { AdminDashboard } from './pages/AdminDashboard';
import { AdminLogin } from './pages/AdminLogin';
import { AUTH_SESSION_TOKEN_KEY, AUTH_USER_KEY, FrontendAuthUser, getSessionUser, logout } from './data/api';

export default function App() {
  const [authUser, setAuthUser] = useState<FrontendAuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const syncUser = async () => {
    const token = localStorage.getItem(AUTH_SESSION_TOKEN_KEY);
    if (!token) {
      setAuthUser(null);
      setLoading(false);
      return;
    }

    try {
      const me = await getSessionUser();
      setAuthUser(me.user);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(me.user));
    } catch {
      localStorage.removeItem(AUTH_SESSION_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
      setAuthUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    syncUser();
    const onAuthChanged = () => syncUser();
    window.addEventListener('markethub-auth-changed', onAuthChanged);
    return () => window.removeEventListener('markethub-auth-changed', onAuthChanged);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // ignore
    }
    localStorage.removeItem(AUTH_SESSION_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    setAuthUser(null);
  };

  if (loading) {
    return <div className="p-8 text-gray-600">Loading...</div>;
  }

  if (!authUser) {
    return <AdminLogin onLoggedIn={syncUser} />;
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-gray-900">MarketHub Admin</p>
          <p className="text-xs text-gray-500">{authUser.name} ({String(authUser.role || '').toUpperCase()})</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleLogout}>Logout</Button>
      </header>
      <AdminDashboard />
    </div>
  );
}
