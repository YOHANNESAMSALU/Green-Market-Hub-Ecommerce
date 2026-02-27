const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const DEFAULT_USER_ID = '11111111-1111-1111-1111-111111111111';
export const DEFAULT_SELLER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
export const AUTH_SESSION_TOKEN_KEY = 'marketHubSessionToken';
export const AUTH_USER_KEY = 'marketHubAuthUser';

export interface FrontendCategory {
  id: string;
  name: string;
  image: string;
}

export interface FrontendProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  rating: number;
  reviews: number;
  image: string;
  images: string[];
  category: string;
  brand: string;
  seller: string;
  stock: number;
  variantGroups?: ProductVariantGroup[];
}

export interface FrontendCartItem {
  id: string;
  productId: string;
  quantity: number;
  name: string;
  price: number;
  image: string;
  selectedVariant?: FrontendSelectedVariant | null;
}

export interface FrontendSelectedVariant {
  id?: string;
  sku?: string;
  title?: string;
  type?: string;
  value?: string;
  price?: number;
  discountPrice?: number | null;
  unitPrice?: number;
  attributes?: Record<string, unknown>;
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

export interface FrontendOrder {
  id: string;
  userId: string;
  totalAmount: number;
  status: string;
  shippingCost: number;
  trackingNumber: string | null;
  createdAt: string;
}

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

export interface SellerApplicationInput {
  businessName: string;
  businessType?: string;
  tinNumber?: string;
  contactPhone: string;
  city: string;
  address: string;
  idDocumentUrl?: string;
  message?: string;
}

const parseImages = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((v) => typeof v === 'string');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((v) => typeof v === 'string');
    } catch {
      return [];
    }
  }
  return [];
};

const parseVariantGroups = (value: unknown): ProductVariantGroup[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((group) => {
      const type = String((group as any)?.type || '').trim();
      const values = Array.isArray((group as any)?.values) ? (group as any).values : [];
      if (!type || !values.length) return null;
      const parsedValues = values
        .map((row: any) => {
          const variantValue = String(row?.value || row?.title || '').trim();
          const price = Number(row?.price);
          if (!variantValue || !Number.isFinite(price)) return null;
          return {
            id: row?.id ? String(row.id) : undefined,
            value: variantValue,
            title: row?.title ? String(row.title) : undefined,
            sku: row?.sku ? String(row.sku) : undefined,
            price,
            discountPrice:
              row?.discountPrice === null || row?.discountPrice === undefined || row?.discountPrice === ''
                ? null
                : Number(row.discountPrice),
            stock: row?.stock === undefined ? undefined : Number(row.stock || 0),
            images: parseImages(row?.images),
          };
        })
        .filter(Boolean) as ProductVariantValue[];
      if (!parsedValues.length) return null;
      return { type, values: parsedValues };
    })
    .filter(Boolean) as ProductVariantGroup[];
};

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

const mapProduct = (row: any): FrontendProduct => {
  const images = parseImages(row.images);
  const currentPrice = Number(row.discountPrice || row.price || 0);
  const basePrice = Number(row.price || 0);
  const discount = basePrice > currentPrice && currentPrice > 0
    ? Math.round(((basePrice - currentPrice) / basePrice) * 100)
    : 0;

  return {
    id: String(row.id),
    name: row.name || '',
    description: row.description || '',
    price: currentPrice,
    originalPrice: basePrice > currentPrice ? basePrice : undefined,
    discount: discount || undefined,
    rating: 4.5,
    reviews: 0,
    image: images[0] || '',
    images,
    category: row.categoryName || '',
    brand: row.brand || '',
    seller: row.sellerName || 'Unknown Seller',
    stock: Number(row.stock || 0),
    variantGroups: parseVariantGroups(row.variantGroups),
  };
};

async function apiGet<T>(path: string): Promise<T> {
  const token = localStorage.getItem(AUTH_SESSION_TOKEN_KEY) || '';
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token
      ? {
          'x-session-token': token,
        }
      : undefined,
  });
  if (!response.ok) {
    let message = `Failed request: ${path}`;
    try {
      const body = await response.json();
      if (typeof body?.error === 'string') message = body.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
  return response.json();
}

async function apiSend<T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  const token = localStorage.getItem(AUTH_SESSION_TOKEN_KEY) || '';
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'x-session-token': token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let message = `Failed request: ${method} ${path} (${response.status})`;
    try {
      const body = await response.json();
      if (typeof body?.error === 'string') message = body.error;
    } catch {
      // ignore parse errors and keep status-aware fallback
    }
    throw new Error(message);
  }

  return response.json();
}

export async function getCategories(): Promise<FrontendCategory[]> {
  const rows = await apiGet<any[]>('/categories');
  return rows.map((row) => ({
    id: String(row.id),
    name: row.name || '',
    image: row.image || '',
  }));
}

export async function getProducts(): Promise<FrontendProduct[]> {
  const rows = await apiGet<any[]>('/products');
  return rows.map(mapProduct);
}

export async function getProductById(productId: string): Promise<FrontendProduct> {
  const row = await apiGet<any>(`/products/${productId}`);
  return mapProduct(row);
}

export async function getCartItems(userId?: string): Promise<FrontendCartItem[]> {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  const rows = await apiGet<any[]>(`/cart-items${query}`);

  return rows.map((row) => {
    const currentPrice = Number(row.price || row.discountPrice || 0);
    const images = parseImages(row.images);

    return {
      id: String(row.id),
      productId: String(row.productId),
      quantity: Number(row.quantity || 1),
      name: row.name || '',
      price: currentPrice,
      image: row.image || images[0] || '',
      selectedVariant: row.selectedVariant && typeof row.selectedVariant === 'object' ? row.selectedVariant : null,
    };
  });
}

export async function addToCart(productId: string, quantity = 1, userId?: string, selectedVariant?: FrontendSelectedVariant | null) {
  return apiSend<{ ok: boolean }>('/cart-items', 'POST', {
    userId,
    productId,
    quantity,
    selectedVariant: selectedVariant || null,
  });
}

export async function updateCartItemQuantity(cartItemId: string, quantity: number) {
  return apiSend<{ ok: boolean }>(`/cart-items/${encodeURIComponent(cartItemId)}`, 'PATCH', {
    quantity,
  });
}

export async function removeCartItem(cartItemId: string) {
  return apiSend<{ ok: boolean }>(`/cart-items/${encodeURIComponent(cartItemId)}`, 'DELETE');
}

export async function placeOrder(input: {
  userId?: string;
  shippingMethod: string;
  paymentMethod: string;
  shippingAddress: {
    fullName: string;
    email?: string;
    phone: string;
    city: string;
    subCity?: string;
    region?: string;
    details: string;
  };
}) {
  return apiSend<{
    ok: boolean;
    orderId: string;
    totalAmount: number;
    shippingCost: number;
    status: string;
    payment?: {
      provider: string;
      txRef: string;
      checkoutUrl?: string | null;
    };
  }>('/checkout', 'POST', {
    ...input,
  });
}

export async function getOrders(userId?: string): Promise<FrontendOrder[]> {
  const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  const rows = await apiGet<any[]>(`/orders${query}`);
  return rows.map((row) => ({
    id: String(row.id),
    userId: String(row.userId),
    totalAmount: Number(row.totalAmount || 0),
    status: String(row.status || 'PENDING'),
    shippingCost: Number(row.shippingCost || 0),
    trackingNumber: row.trackingNumber ? String(row.trackingNumber) : null,
    createdAt: String(row.createdAt || ''),
  }));
}

export async function signup(input: {
  name: string;
  email?: string;
  phone?: string;
  password: string;
  confirmPassword?: string;
}) {
  return apiSend<{
    ok: boolean;
    user: FrontendAuthUser;
    sessionToken: string;
  }>('/auth/signup', 'POST', input);
}

export async function login(input: {
  email?: string;
  phone?: string;
  password: string;
}) {
  return apiSend<{
    ok: boolean;
    user: FrontendAuthUser;
    sessionToken: string;
  }>('/auth/login', 'POST', input);
}

export async function startSignupOtp(input: {
  name: string;
  email?: string;
  phone?: string;
  password: string;
}) {
  return apiSend<{
    ok: boolean;
    challengeId: string;
    notification: string;
  }>('/auth/signup/start', 'POST', input);
}

export async function verifySignupOtp(input: {
  challengeId: string;
  otp: string;
}) {
  return apiSend<{
    ok: boolean;
    user: FrontendAuthUser;
    sessionToken: string;
    notification: string;
  }>('/auth/signup/verify', 'POST', input);
}

export async function startLoginOtp(input: {
  email?: string;
  phone?: string;
  password: string;
}) {
  return apiSend<{
    ok: boolean;
    challengeId: string;
    notification: string;
  }>('/auth/login/start', 'POST', input);
}

export async function verifyLoginOtp(input: {
  challengeId: string;
  otp: string;
}) {
  return apiSend<{
    ok: boolean;
    user: FrontendAuthUser;
    sessionToken: string;
    notification: string;
  }>('/auth/login/verify', 'POST', input);
}

export async function getSessionUser() {
  return apiGet<{ ok: boolean; user: FrontendAuthUser }>('/auth/me');
}

export async function updateMyProfile(input: Partial<{ name: string; phone: string; image: string }>) {
  return apiSend<{ ok: boolean; user: FrontendAuthUser }>('/auth/profile', 'PATCH', input);
}

export async function changeMyPassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  return apiSend<{ ok: boolean }>('/auth/change-password', 'POST', input);
}

export async function promoteSelfToAdmin() {
  return apiSend<{ ok: boolean; user: FrontendAuthUser }>('/auth/dev/promote-admin', 'POST');
}

export async function logout() {
  return apiSend<{ ok: boolean }>('/auth/logout', 'POST');
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

export async function getPromoBannerSettings() {
  return apiGet<{ image: string }>('/settings/promo-banner');
}

export async function updatePromoBannerSettings(input: { image: string }) {
  return apiSend<{ ok: boolean; image: string }>('/admin/settings/promo-banner', 'PATCH', input);
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

export async function createSellerRequest(input: SellerApplicationInput) {
  return apiSend<{ ok: boolean; requestId: string }>('/seller-requests', 'POST', input);
}

export async function getMySellerRequestStatus() {
  return apiGet<{
    ok: boolean;
    user: FrontendAuthUser;
    latestRequest: (SellerRequestRow & { payload?: SellerApplicationInput | null }) | null;
  }>('/seller-requests/me');
}

export async function getMySellerDashboard() {
  return apiGet<{
    stats: {
      totalSales: number;
      totalOrders: number;
      totalProducts: number;
      pendingOrders: number;
      totalStock: number;
    };
    recentProducts: Array<{ id: string; name: string; price: number; discountPrice?: number; stock: number; image: string }>;
    recentOrders: Array<{ id: string; customer: string; totalAmount: number; status: string; createdAt: string }>;
  }>('/dashboard/seller-self');
}

export async function getSellerProducts() {
  return apiGet<AdminProduct[]>('/seller/products');
}

export async function createSellerProduct(input: {
  name: string;
  description?: string;
  price: number;
  discountPrice?: number | null;
  stock?: number;
  sku?: string;
  images?: string[];
  brand?: string;
  categoryId: string;
  variantGroups?: ProductVariantGroup[];
}) {
  return apiSend<{ ok: boolean; id: string }>('/seller/products', 'POST', input);
}

export async function deleteSellerProduct(productId: string) {
  return apiSend<{ ok: boolean }>(`/seller/products/${encodeURIComponent(productId)}`, 'DELETE');
}

export async function updateSellerProduct(
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
    categoryId: string;
    variantGroups: ProductVariantGroup[];
  }>,
) {
  return apiSend<{ ok: boolean }>(`/seller/products/${encodeURIComponent(productId)}`, 'PATCH', input);
}

export async function getSellerDashboard(sellerId = DEFAULT_SELLER_ID) {
  return apiGet<{
    stats: {
      totalSales: number;
      totalOrders: number;
      totalProducts: number;
      pendingOrders: number;
      totalStock: number;
    };
    recentProducts: Array<{ id: string; name: string; price: number; discountPrice?: number; stock: number; image: string }>;
    recentOrders: Array<{ id: string; customer: string; totalAmount: number; status: string; createdAt: string }>;
  }>(`/dashboard/seller/${encodeURIComponent(sellerId)}`);
}
