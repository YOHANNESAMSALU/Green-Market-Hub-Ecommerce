import React, { useEffect, useState } from 'react';
import { PackageOpen } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import {
  AUTH_USER_KEY,
  FrontendAuthUser,
  FrontendOrder,
  fileToDataUrl,
  getOrders,
  updateMyProfile,
} from '../data/api';

interface OrdersProps {
  onNavigate: (page: string) => void;
  authUser: FrontendAuthUser | null;
  onAuthUserUpdated: (user: FrontendAuthUser) => void;
}

const getStatusVariant = (status: string): 'success' | 'warning' | 'danger' | 'info' => {
  const normalized = status.toUpperCase();
  if (normalized === 'DELIVERED') return 'success';
  if (normalized === 'CANCELLED' || normalized === 'FAILED') return 'danger';
  if (normalized === 'PENDING') return 'warning';
  return 'info';
};

export function Orders({ onNavigate, authUser, onAuthUserUpdated }: OrdersProps) {
  const [orders, setOrders] = useState<FrontendOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    getOrders()
      .then((rows) => setOrders(rows))
      .finally(() => setLoading(false));
  }, []);

  const handleProfileImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
    } catch {
      setMessage('Could not update profile image.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  if (loading) {
    return <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-12 text-gray-600">Loading orders...</div>;
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-8">
          <button onClick={() => onNavigate('home')} className="hover:text-[#16A34A]">Home</button>
          <span>/</span>
          <span className="text-gray-900">My Orders</span>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl text-gray-900">My Orders ({orders.length})</h1>
          <Button variant="outline" onClick={() => onNavigate('products')}>Continue Shopping</Button>
        </div>

        {authUser && (
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <img
                  src={authUser.image || 'https://via.placeholder.com/80?text=User'}
                  alt={authUser.name}
                  className="w-16 h-16 rounded-full object-cover border"
                />
                <div>
                  <p className="text-gray-900">{authUser.name}</p>
                  <p className="text-sm text-gray-600">{authUser.email || authUser.phone || 'No contact info'}</p>
                </div>
              </div>
              <label className="inline-flex">
                <input type="file" accept="image/*" className="hidden" onChange={handleProfileImageChange} />
                <span className="px-4 py-2 border rounded-xl cursor-pointer hover:bg-gray-50">
                  {uploading ? 'Uploading...' : 'Change Profile Image'}
                </span>
              </label>
            </div>
            {message && <p className="text-sm text-gray-700 mt-3">{message}</p>}
          </div>
        )}

        {orders.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 sm:p-16 text-center">
            <PackageOpen className="w-24 h-24 text-gray-300 mx-auto mb-4" />
            <h2 className="text-2xl text-gray-900 mb-2">No orders yet</h2>
            <p className="text-gray-600 mb-8">Place your first order to see it here.</p>
            <Button variant="primary" onClick={() => onNavigate('products')}>Start Shopping</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="bg-white rounded-2xl shadow-sm p-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <p className="text-gray-900">
                      Order #{order.id.slice(0, 8)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {new Date(order.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <Badge variant={getStatusVariant(order.status)}>
                      {order.status}
                    </Badge>
                    <div className="text-left sm:text-right">
                      <p className="text-[#16A34A] text-lg">ETB {order.totalAmount.toLocaleString()}</p>
                      <p className="text-sm text-gray-600">Shipping: ETB {order.shippingCost.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
                {order.trackingNumber && (
                  <p className="text-sm text-gray-600 mt-3">
                    Tracking Number: <span className="text-gray-900">{order.trackingNumber}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
