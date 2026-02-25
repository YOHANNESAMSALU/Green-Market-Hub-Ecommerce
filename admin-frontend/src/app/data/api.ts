/// <reference types="vite/client" />

// Extend ImportMeta interface for Vite env support
// (No need to redeclare ImportMeta or ImportMetaEnv, Vite provides them)

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const AUTH_SESSION_TOKEN_KEY = 'marketHubSessionToken';
export const AUTH_USER_KEY = 'marketHubAuthUser';

export interface FrontendAuthUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  image?: string | null;
  role: string;
  isApproved?: number;
}

export interface AdminCategory {
  id: string;
  name: string;
  image: string;
  productsCount?: number;
}

export interface AdminProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  discountPrice?: number | null;
  stock: number;
  sku: string;
  images: string[] | string;
  brand: string;
  sellerId: string;
  categoryId: string;
  categoryName?: string;
  sellerName?: string;
  variantGroups?: ProductVariantGroup[];
}

export interface ProductVariantValue {
  id?: string;
  value: string;
  title?: string;
  sku?: string;
  price: number;
  discountPrice?: number | null;
  stock?: number;
  images?: string[];
}

export interface ProductVariantGroup {
  type: string;
  values: ProductVariantValue[];
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isApproved: number;
  createdAt: string;
}

export interface SellerRequestRow {
  id: string;
  userId: string;
  status: string;
  message?: string | null;
  reviewNote?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  name: string;
  email: string;
  phone?: string | null;
}

export type AnalysisRange = 'day' | 'week' | 'month' | 'halfyear' | 'year';

export interface AdminAnalysisPoint {
  key: string;
  label: string;
  ordersCount: number;
  revenue: number;
}

export interface AdminAnalysisData {
  range: AnalysisRange;
  selectedMonth: string | null;
  start: string;
  end: string;
  summary: {
    totalOrders: number;
    totalRevenue: number;
    avgOrderValue: number;
  };
  series: AdminAnalysisPoint[];
  topProducts: Array<{ id: string; name: string; unitsSold: number; revenue: number }>;
}

export interface AdminDeliveryVariant {
  id: string;
  sku: string;
  title: string;
  price: number;
  discountPrice: number | null;
  stock: number;
  attributes: unknown;
  images: string[];
}

export interface AdminDeliveryItem {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  productImage: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  selectedVariant: AdminDeliveryVariant | null;
  variantOptions: AdminDeliveryVariant[];
}

export interface AdminDeliveryOrder {
  id: string;
  userId: string;
  createdAt: string;
  status: string;
  totalAmount: number;
  shippingCost: number;
  trackingNumber: string;
  payment: {
    method: string;
    status: string;
    transactionId: string;
    createdAt: string;
  };
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  shippingAddress: {
    fullName: string;
    phone: string;
    city: string;
    subCity: string;
    region: string;
    details: string;
  };
  items: AdminDeliveryItem[];
}

function toRequestError(path: string, method: string, error: unknown): Error {
  if (error instanceof TypeError) {
    return new Error(
      `Cannot reach admin API at ${API_BASE_URL}${path}. Make sure admin-backend is running and VITE_API_URL is correct.`,
    );
  }
  if (error instanceof Error) return error;
  return new Error(`Failed request: ${method} ${path}`);
}

async function apiGet<T>(path: string): Promise<T> {
  const token = localStorage.getItem(AUTH_SESSION_TOKEN_KEY) || '';
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: token ? { 'x-session-token': token } : undefined,
    });
  } catch (error) {
    throw toRequestError(path, 'GET', error);
  }

  if (!response.ok) {
    let message = `Failed request: GET ${path} (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body?.error === 'string') message = body.error;
    } catch {
      // keep fallback message
    }
    throw new Error(message);
  }

  return response.json();
}

async function apiSend<T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  const token = localStorage.getItem(AUTH_SESSION_TOKEN_KEY) || '';
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'x-session-token': token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw toRequestError(path, method, error);
  }

  if (!response.ok) {
    let message = `Failed request: ${method} ${path} (${response.status})`;
    try {
      const data = await response.json();
      if (typeof data?.error === 'string') message = data.error;
    } catch {
      // keep fallback message
    }
    throw new Error(message);
  }

  return response.json();
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export async function filesToDataUrls(files: FileList | File[]): Promise<string[]> {
  const list = Array.from(files || []);
  return Promise.all(list.map((file) => fileToDataUrl(file)));
}

export async function login(input: { email?: string; phone?: string; password: string }) {
  return apiSend<{ ok: boolean; user: FrontendAuthUser; sessionToken: string }>('/auth/login', 'POST', input);
}

export async function getSessionUser() {
  return apiGet<{ ok: boolean; user: FrontendAuthUser }>('/auth/me');
}

export async function logout() {
  return apiSend<{ ok: boolean }>('/auth/logout', 'POST');
}

export async function promoteSelfToAdmin() {
  return apiSend<{ ok: boolean; user: FrontendAuthUser }>('/auth/dev/promote-admin', 'POST');
}

export async function getAdminReports() {
  return apiGet<{
    stats: {
      totalUsers: number;
      totalSellers: number;
      totalProducts: number;
      totalOrders: number;
      totalRevenue: number;
    };
    topProducts: Array<{ id: string; name: string; unitsSold: number; revenue: number }>;
  }>('/admin/reports');
}

export async function getAdminAnalysis(range: AnalysisRange, month?: string) {
  const params = new URLSearchParams({ range });
  if (range === 'month' && month) params.set('month', month);
  return apiGet<AdminAnalysisData>(`/admin/analysis?${params.toString()}`);
}

export async function getAdminDeliveryOrders(limit = 100) {
  return apiGet<AdminDeliveryOrder[]>(`/admin/delivery-orders?limit=${encodeURIComponent(String(limit))}`);
}

export async function getAdminCategories(): Promise<AdminCategory[]> {
  return apiGet<AdminCategory[]>('/admin/categories');
}

export async function createAdminCategory(input: { name: string; image?: string }) {
  return apiSend<{ ok: boolean; id: string }>('/admin/categories', 'POST', input);
}

export async function updateAdminCategory(categoryId: string, input: { name?: string; image?: string }) {
  return apiSend<{ ok: boolean }>(`/admin/categories/${encodeURIComponent(categoryId)}`, 'PATCH', input);
}

export async function deleteAdminCategory(categoryId: string) {
  return apiSend<{ ok: boolean }>(`/admin/categories/${encodeURIComponent(categoryId)}`, 'DELETE');
}

export async function getAdminProducts(): Promise<AdminProduct[]> {
  return apiGet<AdminProduct[]>('/admin/products');
}

export async function createAdminProduct(input: {
  name: string;
  description?: string;
  price: number;
  discountPrice?: number | null;
  stock?: number;
  sku?: string;
  images?: string[];
  brand?: string;
  sellerId?: string;
  categoryId: string;
  variantGroups?: ProductVariantGroup[];
}) {
  return apiSend<{ ok: boolean; id: string }>('/admin/products', 'POST', input);
}

export async function updateAdminProduct(
  productId: string,
  input: Partial<{
    name: string;
    description: string;
    price: number;
    discountPrice: number | null;
    stock: number;
    sku: string;
    images: string[];
    brand: string;
    sellerId: string;
    categoryId: string;
    variantGroups: ProductVariantGroup[];
  }>,
) {
  return apiSend<{ ok: boolean }>(`/admin/products/${encodeURIComponent(productId)}`, 'PATCH', input);
}

export async function deleteAdminProduct(productId: string) {
  return apiSend<{ ok: boolean }>(`/admin/products/${encodeURIComponent(productId)}`, 'DELETE');
}

export async function getAdminUsers(): Promise<AdminUserRow[]> {
  return apiGet<AdminUserRow[]>('/admin/users');
}

export async function updateAdminUser(
  userId: string,
  input: Partial<{ name: string; email: string; phone: string; role: string; isApproved: number }>,
) {
  return apiSend<{ ok: boolean }>(`/admin/users/${encodeURIComponent(userId)}`, 'PATCH', input);
}

export async function getAdminSellerRequests(): Promise<SellerRequestRow[]> {
  return apiGet<SellerRequestRow[]>('/admin/seller-requests');
}

export async function reviewAdminSellerRequest(
  requestId: string,
  input: { action: 'APPROVE' | 'REJECT'; reviewNote?: string },
) {
  return apiSend<{ ok: boolean; status: string }>(
    `/admin/seller-requests/${encodeURIComponent(requestId)}`,
    'PATCH',
    input,
  );
}

export async function getPromoBannerSettings() {
  return apiGet<{ image: string }>('/settings/promo-banner');
}

export async function updatePromoBannerSettings(input: { image: string }) {
  return apiSend<{ ok: boolean; image: string }>('/admin/settings/promo-banner', 'PATCH', input);
}
