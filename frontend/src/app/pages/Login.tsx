import React, { useMemo, useState } from 'react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { AUTH_SESSION_TOKEN_KEY, AUTH_USER_KEY, FrontendAuthUser, login, signup } from '../data/api';

interface LoginProps {
  onNavigate: (page: string) => void;
  onAuthSuccess?: (user: FrontendAuthUser) => void;
  redirectTo?: string;
}

const ETHIOPIAN_PHONE_REGEX = /^(?:\+251|0)?9\d{8}$/;

type AuthMode = 'login' | 'signup';
type Method = 'email' | 'phone';

export function Login({ onNavigate, onAuthSuccess, redirectTo = 'home' }: LoginProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [method, setMethod] = useState<Method>('phone');
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const identifierLabel = useMemo(
    () => (method === 'phone' ? 'Ethiopian Phone Number' : 'Email Address'),
    [method],
  );

  const validate = () => {
    if (mode === 'signup' && !name.trim()) {
      return 'Full name is required.';
    }

    if (method === 'phone') {
      if (!ETHIOPIAN_PHONE_REGEX.test(identifier.trim())) {
        return 'Enter a valid Ethiopian phone number (e.g. +2519XXXXXXXX).';
      }
    } else if (!identifier.trim().includes('@')) {
      return 'Enter a valid email address.';
    }

    if (!password.trim()) {
      return 'Password is required.';
    }

    if (mode === 'signup' && password.trim() !== confirmPassword.trim()) {
      return 'Password confirmation does not match.';
    }

    return '';
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const payload =
        method === 'phone'
          ? { phone: identifier.trim(), password: password.trim() }
          : { email: identifier.trim(), password: password.trim() };

      if (mode === 'signup') {
        const result = await signup({
          name: name.trim(),
          confirmPassword: confirmPassword.trim(),
          ...payload,
        });
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(result.user));
        localStorage.setItem(AUTH_SESSION_TOKEN_KEY, result.sessionToken);
        window.dispatchEvent(new Event('markethub-auth-changed'));
        onAuthSuccess?.(result.user);
        setMessage('Signup successful. Logged in.');
      } else {
        const result = await login(payload);
        localStorage.setItem(AUTH_USER_KEY, JSON.stringify(result.user));
        localStorage.setItem(AUTH_SESSION_TOKEN_KEY, result.sessionToken);
        window.dispatchEvent(new Event('markethub-auth-changed'));
        onAuthSuccess?.(result.user);
        setMessage('Login successful.');
      }
      if (!onAuthSuccess) {
        window.setTimeout(() => onNavigate(redirectTo), 900);
      }
    } catch {
      setError(mode === 'signup' ? 'Could not sign up. Try another email/phone.' : 'Could not login. Check your details.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <div className="max-w-[640px] mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl text-gray-900">{mode === 'login' ? 'Login' : 'Sign Up'}</h1>
            <Badge variant="success">Default Role: CUSTOMER</Badge>
          </div>

          <div className="flex gap-2 mb-6">
            <Button
              variant={method === 'phone' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => {
                setMethod('phone');
              }}
            >
              Ethiopian Phone
            </Button>
            <Button
              variant={method === 'email' ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => {
                setMethod('email');
              }}
            >
              Email
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <Input
                label="Full Name"
                placeholder="Your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}

            <Input
              label={identifierLabel}
              placeholder={method === 'phone' ? '+2519XXXXXXXX' : 'name@example.com'}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />

            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === 'signup' && (
              <Input
                label="Confirm Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            )}
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
              />
              Show password
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {message && <p className="text-sm text-[#166534]">{message}</p>}

            <div className="pt-2 space-y-2">
              <Button type="submit" variant="primary" className="w-full" disabled={submitting}>
                {submitting ? 'Please wait...' : mode === 'signup' ? 'Create Account' : 'Login'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full border border-gray-200"
                onClick={() => {
                  setMode(mode === 'login' ? 'signup' : 'login');
                  setError('');
                  setMessage('');
                  setConfirmPassword('');
                }}
              >
                {mode === 'login' ? 'Need an account? Sign Up' : 'Already have an account? Login'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
