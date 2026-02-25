import React, { useState } from 'react';
import { Button } from '../components/Button';
import { AUTH_SESSION_TOKEN_KEY, AUTH_USER_KEY, login } from '../data/api';

interface AdminLoginProps {
  onLoggedIn: () => void;
}

export function AdminLogin({ onLoggedIn }: AdminLoginProps) {
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const identity = emailOrPhone.trim();
      const payload = identity.includes('@')
        ? { email: identity, password: password.trim() }
        : { phone: identity, password: password.trim() };

      const result = await login(payload);
      localStorage.setItem(AUTH_SESSION_TOKEN_KEY, result.sessionToken);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(result.user));
      window.dispatchEvent(new Event('markethub-auth-changed'));
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm p-8">
        <h1 className="text-2xl text-gray-900 mb-2">Admin Login</h1>
        <p className="text-sm text-gray-600 mb-6">Use your existing MarketHub account credentials.</p>

        <form className="space-y-4" onSubmit={onSubmit}>
          <input
            className="w-full px-3 py-2 border rounded-lg"
            placeholder="Email or phone"
            value={emailOrPhone}
            onChange={(e) => setEmailOrPhone(e.target.value)}
          />
          <input
            className="w-full px-3 py-2 border rounded-lg"
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
            />
            Show password
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </Button>
        </form>
      </div>
    </div>
  );
}
