import React, { useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { FrontendAuthUser, createSellerRequest, getMySellerRequestStatus } from '../data/api';

interface SellerApplicationProps {
  authUser: FrontendAuthUser | null;
  onNavigate: (page: string) => void;
}

const defaultForm = {
  businessName: '',
  businessType: '',
  tinNumber: '',
  contactPhone: '',
  city: '',
  address: '',
  idDocumentUrl: '',
  message: '',
};

export function SellerApplication({ authUser, onNavigate }: SellerApplicationProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getMySellerRequestStatus();
      const latest = data.latestRequest;
      setStatus(String(latest?.status || '').toUpperCase());

      if (latest?.payload?.contactPhone) {
        setForm((prev) => ({
          ...prev,
          contactPhone: latest.payload?.contactPhone || prev.contactPhone,
        }));
      } else if (authUser?.phone) {
        setForm((prev) => ({
          ...prev,
          contactPhone: prev.contactPhone || authUser.phone || '',
        }));
      }
    } catch {
      setError('Could not load your seller application status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authUser) {
      setLoading(false);
      return;
    }
    loadStatus();
  }, [authUser?.id]);

  const updateField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async () => {
    setError('');
    setMessage('');
    if (!form.businessName.trim() || !form.contactPhone.trim() || !form.city.trim() || !form.address.trim()) {
      setError('Business name, phone, city, and address are required.');
      return;
    }

    setSubmitting(true);
    try {
      await createSellerRequest({
        businessName: form.businessName.trim(),
        businessType: form.businessType.trim(),
        tinNumber: form.tinNumber.trim(),
        contactPhone: form.contactPhone.trim(),
        city: form.city.trim(),
        address: form.address.trim(),
        idDocumentUrl: form.idDocumentUrl.trim(),
        message: form.message.trim(),
      });
      setMessage('Seller request submitted. Admin will review it.');
      await loadStatus();
    } catch {
      setError('Could not submit seller request. If you already have a pending request, wait for admin review.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!authUser) {
    return (
      <div className="max-w-[760px] mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <h1 className="text-2xl text-gray-900 mb-2">Become a Seller</h1>
          <p className="text-gray-600 mb-6">Please login first to submit a seller request.</p>
          <Button variant="primary" onClick={() => onNavigate('login')}>Go To Login</Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="max-w-[760px] mx-auto px-6 py-12 text-gray-600">Loading seller application...</div>;
  }

  const isApprovedSeller = String(authUser.role || '').toUpperCase() === 'SELLER' && Number(authUser.isApproved || 0) === 1;
  const pending = status === 'PENDING';

  return (
    <div className="max-w-[760px] mx-auto px-6 py-12">
      <div className="bg-white rounded-2xl shadow-sm p-8 space-y-4">
        <h1 className="text-2xl text-gray-900">Become a Seller</h1>
        <p className="text-gray-600">Submit your business information. Admin must approve before seller features are enabled.</p>

        {isApprovedSeller && (
          <div className="bg-green-100 text-green-700 px-4 py-3 rounded-xl">
            You are already an approved seller.
          </div>
        )}

        {pending && (
          <div className="bg-yellow-100 text-yellow-800 px-4 py-3 rounded-xl">
            Your seller request is pending admin approval.
          </div>
        )}

        {error && <div className="bg-red-100 text-red-700 px-4 py-3 rounded-xl">{error}</div>}
        {message && <div className="bg-green-100 text-green-700 px-4 py-3 rounded-xl">{message}</div>}

        {!isApprovedSeller && !pending && (
          <div className="space-y-3">
            <Input label="Business Name *" value={form.businessName} onChange={(e) => updateField('businessName', e.target.value)} />
            <Input label="Business Type" value={form.businessType} onChange={(e) => updateField('businessType', e.target.value)} />
            <Input label="TIN Number" value={form.tinNumber} onChange={(e) => updateField('tinNumber', e.target.value)} />
            <Input label="Contact Phone (Ethiopia) *" value={form.contactPhone} onChange={(e) => updateField('contactPhone', e.target.value)} />
            <Input label="City *" value={form.city} onChange={(e) => updateField('city', e.target.value)} />
            <Input label="Business Address *" value={form.address} onChange={(e) => updateField('address', e.target.value)} />
            <Input label="ID/License URL" value={form.idDocumentUrl} onChange={(e) => updateField('idDocumentUrl', e.target.value)} />
            <Input label="Additional Notes" value={form.message} onChange={(e) => updateField('message', e.target.value)} />

            <Button variant="primary" onClick={submit} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Seller Request'}
            </Button>
          </div>
        )}

        {isApprovedSeller && (
          <Button variant="primary" onClick={() => onNavigate('seller-dashboard')}>
            Open Seller Dashboard
          </Button>
        )}
      </div>
    </div>
  );
}

