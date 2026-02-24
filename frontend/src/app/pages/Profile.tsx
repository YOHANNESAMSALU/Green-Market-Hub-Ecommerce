import React, { useState } from 'react';
import { Button } from '../components/Button';
import {
  AUTH_USER_KEY,
  FrontendAuthUser,
  fileToDataUrl,
  updateMyProfile,
} from '../data/api';

interface ProfileProps {
  authUser: FrontendAuthUser | null;
  onNavigate: (page: string) => void;
  onAuthUserUpdated: (user: FrontendAuthUser) => void;
}

export function Profile({ authUser, onNavigate, onAuthUserUpdated }: ProfileProps) {
  const [name, setName] = useState(authUser?.name || '');
  const [phone, setPhone] = useState(authUser?.phone || '');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (!authUser) {
    return (
      <div className="max-w-[760px] mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <h1 className="text-2xl text-gray-900 mb-2">Profile</h1>
          <p className="text-gray-600 mb-6">Please login first.</p>
          <Button variant="primary" onClick={() => onNavigate('login')}>Go To Login</Button>
        </div>
      </div>
    );
  }

  const saveProfile = async () => {
    setSaving(true);
    setMessage('');
    try {
      const result = await updateMyProfile({
        name: name.trim(),
        phone: phone.trim(),
      });
      onAuthUserUpdated(result.user);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(result.user));
      window.dispatchEvent(new Event('markethub-auth-changed'));
      setMessage('Profile updated.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update profile.');
    } finally {
      setSaving(false);
    }
  };

  const uploadProfileImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage('');
    try {
      const image = await fileToDataUrl(file);
      const result = await updateMyProfile({ image });
      onAuthUserUpdated(result.user);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(result.user));
      window.dispatchEvent(new Event('markethub-auth-changed'));
      setMessage('Profile image updated.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not update profile image.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <div className="max-w-[960px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8">
          <h1 className="text-2xl text-gray-900 mb-6">Personal Profile</h1>

          <div className="flex flex-col sm:flex-row gap-6 sm:items-center mb-8">
            <img
              src={authUser.image || 'https://via.placeholder.com/120?text=User'}
              alt={authUser.name}
              className="w-24 h-24 rounded-full object-cover border"
            />
            <label className="inline-flex">
              <input type="file" accept="image/*" className="hidden" onChange={uploadProfileImage} />
              <span className="px-4 py-2 border rounded-xl cursor-pointer hover:bg-gray-50">
                {uploading ? 'Uploading...' : 'Change Profile Image'}
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div>
              <p className="text-sm text-gray-600 mb-1">Name</p>
              <input
                className="w-full px-3 py-2 border rounded-lg"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Phone</p>
              <input
                className="w-full px-3 py-2 border rounded-lg"
                value={phone || ''}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Email</p>
              <input className="w-full px-3 py-2 border rounded-lg bg-gray-50" value={authUser.email || ''} disabled />
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Role</p>
              <input className="w-full px-3 py-2 border rounded-lg bg-gray-50" value={authUser.role || ''} disabled />
            </div>
          </div>

          {message && <p className="text-sm text-gray-700 mb-4">{message}</p>}

          <div className="flex flex-wrap gap-3">
            <Button variant="primary" onClick={saveProfile} disabled={saving}>
              {saving ? 'Saving...' : 'Save Profile'}
            </Button>
            <Button variant="outline" onClick={() => onNavigate('orders')}>My Orders</Button>
            <Button variant="outline" onClick={() => onNavigate('checkout')}>Go To Checkout</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
