import React, { useState } from 'react';
import { Button } from '../components/Button';
import {
  AUTH_USER_KEY,
  changeMyPassword,
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
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');

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

  const savePassword = async () => {
    setPasswordMessage('');
    if (!currentPassword.trim() || !newPassword.trim() || !confirmNewPassword.trim()) {
      setPasswordMessage('All password fields are required.');
      return;
    }
    if (newPassword.trim().length < 8) {
      setPasswordMessage('New password must be at least 8 characters.');
      return;
    }
    if (newPassword.trim() !== confirmNewPassword.trim()) {
      setPasswordMessage('New password confirmation does not match.');
      return;
    }

    setPasswordSaving(true);
    try {
      await changeMyPassword({
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
        confirmPassword: confirmNewPassword.trim(),
      });
      setPasswordMessage('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      setPasswordMessage(err instanceof Error ? err.message : 'Could not update password.');
    } finally {
      setPasswordSaving(false);
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

          <div className="mt-8 border border-gray-200 rounded-2xl p-5">
            <h2 className="text-lg text-gray-900 mb-4">Change Password</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Current Password</p>
                <input
                  type="password"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">New Password</p>
                <input
                  type="password"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Confirm New Password</p>
                <input
                  type="password"
                  className="w-full px-3 py-2 border rounded-lg"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                />
              </div>
            </div>
            {passwordMessage && <p className="text-sm text-gray-700 mt-3">{passwordMessage}</p>}
            <div className="mt-4">
              <Button variant="primary" onClick={savePassword} disabled={passwordSaving}>
                {passwordSaving ? 'Updating...' : 'Update Password'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
