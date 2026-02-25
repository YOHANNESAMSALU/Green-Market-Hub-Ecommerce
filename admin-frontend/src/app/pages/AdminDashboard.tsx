import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, Edit3, FileText, Package, Plus, Trash2, UserCheck, Users, XCircle, BarChart3 } from 'lucide-react';
import { DashboardSidebar } from '../components/DashboardSidebar';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import {
  AdminAnalysisData,
  AdminCategory,
  AdminDeliveryOrder,
  AdminProduct,
  ProductVariantGroup,
  AdminUserRow,
  SellerRequestRow,
  createAdminCategory,
  createAdminProduct,
  deleteAdminCategory,
  deleteAdminProduct,
  filesToDataUrls,
  getAdminCategories,
  getAdminAnalysis,
  getAdminDeliveryOrders,
  getAdminProducts,
  getAdminReports,
  getAdminSellerRequests,
  getAdminUsers,
  getPromoBannerSettings,
  promoteSelfToAdmin,
  reviewAdminSellerRequest,
  updateAdminCategory,
  updatePromoBannerSettings,
  updateAdminProduct,
  updateAdminUser,
} from '../data/api';

type ReportsData = {
  stats: {
    totalUsers: number;
    totalSellers: number;
    totalProducts: number;
    totalOrders: number;
    totalRevenue: number;
  };
  topProducts: Array<{ id: string; name: string; unitsSold: number; revenue: number }>;
};

export function AdminDashboard() {
  const blankVariantRow = () => ({ value: '', price: '', discountPrice: '', stock: '', sku: '', images: [] as string[] });
  const [activeItem, setActiveItem] = useState('overview');
  const [reports, setReports] = useState<ReportsData | null>(null);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [requests, setRequests] = useState<SellerRequestRow[]>([]);
  const [analysisData, setAnalysisData] = useState<AdminAnalysisData | null>(null);
  const [analysisRange, setAnalysisRange] = useState<'day' | 'week' | 'month' | 'halfyear' | 'year'>('week');
  const [analysisMonth, setAnalysisMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [deliveryOrders, setDeliveryOrders] = useState<AdminDeliveryOrder[]>([]);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const [loadingDeliveryOrders, setLoadingDeliveryOrders] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState({ name: '', image: '' });
  const [promoBannerImage, setPromoBannerImage] = useState('');
  const [savingBanner, setSavingBanner] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: '',
    description: '',
    price: '',
    discountPrice: '',
    stock: '',
    brand: '',
    categoryId: '',
    images: [] as string[],
    variantType: '',
    variants: [blankVariantRow()],
  });
  const autoPromoteAttemptedRef = useRef(false);

  const showMessage = (value: string) => {
    setError('');
    setMessage(value);
    window.setTimeout(() => setMessage(''), 2200);
  };

  const showError = (value: string) => {
    setMessage('');
    setError(value);
    window.setTimeout(() => setError(''), 3000);
  };

  const loadAnalysisData = async (range = analysisRange, month = analysisMonth) => {
    setLoadingAnalysis(true);
    try {
      const data = await getAdminAnalysis(range, range === 'month' ? month : undefined);
      setAnalysisData(data);
    } catch {
      showError('Could not load analysis data.');
    } finally {
      setLoadingAnalysis(false);
    }
  };

  const loadDeliveryOrders = async () => {
    setLoadingDeliveryOrders(true);
    try {
      const rows = await getAdminDeliveryOrders(200);
      setDeliveryOrders(rows);
    } catch {
      showError('Could not load delivery orders.');
    } finally {
      setLoadingDeliveryOrders(false);
    }
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [reportRows, productRows, categoryRows, userRows, requestRows, bannerRows, analysisRows, deliveryRows] = await Promise.all([
        getAdminReports(),
        getAdminProducts(),
        getAdminCategories(),
        getAdminUsers(),
        getAdminSellerRequests(),
        getPromoBannerSettings(),
        getAdminAnalysis(analysisRange, analysisRange === 'month' ? analysisMonth : undefined),
        getAdminDeliveryOrders(200),
      ]);
      setReports(reportRows);
      setProducts(productRows);
      setCategories(categoryRows);
      setUsers(userRows);
      setRequests(requestRows);
      setPromoBannerImage(bannerRows.image || '');
      setAnalysisData(analysisRows);
      setDeliveryOrders(deliveryRows);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (
        !autoPromoteAttemptedRef.current &&
        (message.includes('Admin access required') || message.includes('Authentication required'))
      ) {
        autoPromoteAttemptedRef.current = true;
        try {
          await promoteSelfToAdmin();
          await loadAllData();
          showMessage('Your account was promoted to admin in dev mode.');
          return;
        } catch {
          // fall through to default error below
        }
      }
      showError('Could not load admin data. Make sure you are logged in as admin.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    if (activeItem === 'analysis') {
      loadAnalysisData(analysisRange, analysisMonth);
    }
  }, [activeItem, analysisRange, analysisMonth]);

  useEffect(() => {
    if (activeItem === 'orders') {
      loadDeliveryOrders();
    }
  }, [activeItem]);

  const pendingRequests = useMemo(
    () => requests.filter((row) => String(row.status).toUpperCase() === 'PENDING'),
    [requests],
  );

  const formatRequestMessage = (value?: string | null) => {
    if (!value) return '';
    try {
      const payload = JSON.parse(value);
      const parts = [
        payload.businessName ? `Business: ${payload.businessName}` : '',
        payload.businessType ? `Type: ${payload.businessType}` : '',
        payload.tinNumber ? `TIN: ${payload.tinNumber}` : '',
        payload.contactPhone ? `Phone: ${payload.contactPhone}` : '',
        payload.city ? `City: ${payload.city}` : '',
        payload.address ? `Address: ${payload.address}` : '',
        payload.idDocumentUrl ? `Doc: ${payload.idDocumentUrl}` : '',
        payload.message ? `Note: ${payload.message}` : '',
      ].filter(Boolean);
      return parts.join(' | ');
    } catch {
      return value;
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategory.name.trim()) {
      showError('Category name is required.');
      return;
    }
    try {
      await createAdminCategory({
        name: newCategory.name.trim(),
        image: newCategory.image.trim(),
      });
      setNewCategory({ name: '', image: '' });
      await loadAllData();
      showMessage('Category created.');
    } catch {
      showError('Could not create category.');
    }
  };

  const handleUpdateCategory = async (category: AdminCategory) => {
    try {
      await updateAdminCategory(category.id, {
        name: category.name,
        image: category.image,
      });
      setEditingCategoryId(null);
      await loadAllData();
      showMessage('Category updated.');
    } catch {
      showError('Could not update category.');
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    try {
      await deleteAdminCategory(categoryId);
      await loadAllData();
      showMessage('Category deleted.');
    } catch {
      showError('Could not delete category. It may still contain products.');
    }
  };

  const handleCreateProduct = async () => {
    if (!newProduct.name.trim() || !newProduct.categoryId) {
      showError('Product name and category are required.');
      return;
    }
    const variantValues = newProduct.variants
      .filter((row) => row.value.trim() && row.price !== '')
      .map((row) => ({
        value: row.value.trim(),
        title: `${newProduct.variantType.trim()}: ${row.value.trim()}`,
        sku: row.sku.trim(),
        price: Number(row.price || 0),
        discountPrice: row.discountPrice === '' ? null : Number(row.discountPrice || 0),
        stock: row.stock === '' ? Number(newProduct.stock || 0) : Number(row.stock || 0),
        images: row.images || [],
      }));

    const variantGroups: ProductVariantGroup[] =
      newProduct.variantType.trim() && variantValues.length
        ? [{ type: newProduct.variantType.trim(), values: variantValues }]
        : [];

    try {
      await createAdminProduct({
        name: newProduct.name.trim(),
        description: newProduct.description.trim(),
        price: Number(newProduct.price || 0),
        discountPrice: newProduct.discountPrice ? Number(newProduct.discountPrice) : null,
        stock: Number(newProduct.stock || 0),
        brand: newProduct.brand.trim(),
        categoryId: newProduct.categoryId,
        images: newProduct.images,
        variantGroups,
      });
      setNewProduct({
        name: '',
        description: '',
        price: '',
        discountPrice: '',
        stock: '',
        brand: '',
        categoryId: '',
        images: [],
        variantType: '',
        variants: [blankVariantRow()],
      });
      await loadAllData();
      showMessage('Product created.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not create product.');
    }
  };

  const handleUpdateProduct = async (product: AdminProduct) => {
    const existingImages = Array.isArray(product.images) ? product.images : [];
    const variantGroups = Array.isArray(product.variantGroups)
      ? product.variantGroups.map((group) => ({
          type: String(group.type || '').trim(),
          values: (Array.isArray(group.values) ? group.values : [])
            .map((row) => ({
              id: row.id,
              value: String(row.value || '').trim(),
              title: row.title ? String(row.title) : undefined,
              sku: row.sku ? String(row.sku) : '',
              price: Number(row.price || 0),
              discountPrice:
                row.discountPrice === null || row.discountPrice === undefined || row.discountPrice === ''
                  ? null
                  : Number(row.discountPrice),
              stock: row.stock === undefined ? Number(product.stock || 0) : Number(row.stock || 0),
              images: Array.isArray(row.images) ? row.images : [],
            }))
            .filter((row) => row.value),
        }))
      : [];
    try {
      await updateAdminProduct(product.id, {
        name: product.name,
        description: product.description,
        price: Number(product.price),
        discountPrice: product.discountPrice ? Number(product.discountPrice) : null,
        stock: Number(product.stock),
        brand: product.brand,
        categoryId: product.categoryId,
        images: existingImages,
        variantGroups,
      });
      setEditingProductId(null);
      await loadAllData();
      showMessage('Product updated.');
    } catch {
      showError('Could not update product.');
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      await deleteAdminProduct(productId);
      await loadAllData();
      showMessage('Product deleted.');
    } catch {
      showError('Could not delete product.');
    }
  };

  const handleNewProductImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;

    try {
      const dataUrls = await filesToDataUrls(files);
      setNewProduct((prev) => ({ ...prev, images: [...prev.images, ...dataUrls] }));
    } catch {
      showError('Could not read selected product images.');
    } finally {
      event.target.value = '';
    }
  };

  const handleEditProductImages = async (productId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;

    try {
      const dataUrls = await filesToDataUrls(files);
      setProducts((prev) =>
        prev.map((row) => {
          if (row.id !== productId) return row;
          const currentImages = Array.isArray(row.images) ? row.images : [];
          return { ...row, images: [...currentImages, ...dataUrls] };
        }),
      );
    } catch {
      showError('Could not read selected product images.');
    } finally {
      event.target.value = '';
    }
  };

  const removeNewProductImage = (index: number) => {
    setNewProduct((prev) => ({
      ...prev,
      images: prev.images.filter((_, idx) => idx !== index),
    }));
  };

  const removeEditingProductImage = (productId: string, index: number) => {
    setProducts((prev) =>
      prev.map((row) => {
        if (row.id !== productId) return row;
        const currentImages = Array.isArray(row.images) ? row.images : [];
        return { ...row, images: currentImages.filter((_, idx) => idx !== index) };
      }),
    );
  };

  const addNewVariantImages = async (variantIndex: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;
    try {
      const dataUrls = await filesToDataUrls(files);
      setNewProduct((prev) => ({
        ...prev,
        variants: prev.variants.map((row, idx) =>
          idx === variantIndex ? { ...row, images: [...(row.images || []), ...dataUrls] } : row,
        ),
      }));
    } catch {
      showError('Could not read selected variant images.');
    } finally {
      event.target.value = '';
    }
  };

  const removeNewVariantImage = (variantIndex: number, imageIndex: number) => {
    setNewProduct((prev) => ({
      ...prev,
      variants: prev.variants.map((row, idx) =>
        idx === variantIndex
          ? { ...row, images: (row.images || []).filter((_, currentImageIndex) => currentImageIndex !== imageIndex) }
          : row,
      ),
    }));
  };

  const addEditingVariantImages = async (productId: string, variantIndex: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;
    try {
      const dataUrls = await filesToDataUrls(files);
      setProducts((prev) =>
        prev.map((row) => {
          if (row.id !== productId) return row;
          const groups = Array.isArray(row.variantGroups) ? row.variantGroups : [];
          const firstGroup = groups[0];
          if (!firstGroup) return row;
          const values = Array.isArray(firstGroup.values) ? firstGroup.values : [];
          const updatedValues = values.map((variantRow, idx) =>
            idx === variantIndex
              ? { ...variantRow, images: [...(Array.isArray(variantRow.images) ? variantRow.images : []), ...dataUrls] }
              : variantRow,
          );
          return { ...row, variantGroups: [{ ...firstGroup, values: updatedValues }] };
        }),
      );
    } catch {
      showError('Could not read selected variant images.');
    } finally {
      event.target.value = '';
    }
  };

  const removeEditingVariantImage = (productId: string, variantIndex: number, imageIndex: number) => {
    setProducts((prev) =>
      prev.map((row) => {
        if (row.id !== productId) return row;
        const groups = Array.isArray(row.variantGroups) ? row.variantGroups : [];
        const firstGroup = groups[0];
        if (!firstGroup) return row;
        const values = Array.isArray(firstGroup.values) ? firstGroup.values : [];
        const updatedValues = values.map((variantRow, idx) => {
          if (idx !== variantIndex) return variantRow;
          const existingImages = Array.isArray(variantRow.images) ? variantRow.images : [];
          return { ...variantRow, images: existingImages.filter((_, idxImage) => idxImage !== imageIndex) };
        });
        return { ...row, variantGroups: [{ ...firstGroup, values: updatedValues }] };
      }),
    );
  };

  const handleCategoryImageFile = async (event: React.ChangeEvent<HTMLInputElement>, categoryId?: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const [image] = await filesToDataUrls([file]);
      if (categoryId) {
        setCategories((prev) => prev.map((row) => (row.id === categoryId ? { ...row, image } : row)));
      } else {
        setNewCategory((prev) => ({ ...prev, image }));
      }
    } catch {
      showError('Could not read selected category image.');
    } finally {
      event.target.value = '';
    }
  };

  const handlePromoBannerFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const [image] = await filesToDataUrls([file]);
      setPromoBannerImage(image);
    } catch {
      showError('Could not read selected banner image.');
    } finally {
      event.target.value = '';
    }
  };

  const handleSavePromoBanner = async () => {
    setSavingBanner(true);
    try {
      const response = await updatePromoBannerSettings({ image: promoBannerImage });
      setPromoBannerImage(response.image || '');
      showMessage('Promotional banner updated.');
    } catch {
      showError('Could not update promotional banner.');
    } finally {
      setSavingBanner(false);
    }
  };

  const handleUserRoleChange = async (user: AdminUserRow, role: string) => {
    try {
      await updateAdminUser(user.id, {
        role,
        isApproved: role === 'SELLER' ? 1 : user.isApproved,
      });
      await loadAllData();
      showMessage('User updated.');
    } catch {
      showError('Could not update user.');
    }
  };

  const handleRequestReview = async (requestId: string, action: 'APPROVE' | 'REJECT') => {
    try {
      await reviewAdminSellerRequest(requestId, {
        action,
      });
      await loadAllData();
      showMessage(action === 'APPROVE' ? 'Seller request approved.' : 'Seller request rejected.');
    } catch {
      showError('Could not process seller request.');
    }
  };

  const exportCSV = () => {
    if (!analysisData) return;
    const rows = [['Period', 'Orders', 'Revenue']].concat(
      analysisData.series.map((point) => [point.label, String(point.ordersCount), String(point.revenue)]),
    );
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'analysis.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    if (!analysisData) return;
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) return;
    const html = `
      <html>
      <head>
        <title>Analysis Report (${analysisData.range})</title>
        <style>body{font-family:Arial,Helvetica,sans-serif;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f3f4f6}</style>
      </head>
      <body>
        <h2>Analysis Report (${analysisData.range})</h2>
        <p>Total Orders: ${analysisData.summary.totalOrders}</p>
        <p>Total Revenue: ETB ${analysisData.summary.totalRevenue.toLocaleString()}</p>
        <table>
          <thead><tr><th>Period</th><th>Orders</th><th>Revenue</th></tr></thead>
          <tbody>
            ${analysisData.series.map((point) => `<tr><td>${point.label}</td><td>${point.ordersCount}</td><td>ETB ${point.revenue.toLocaleString()}</td></tr>`).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  if (loading) {
    return <div className="p-8 text-gray-600">Loading admin dashboard...</div>;
  }

  if (!reports) {
    return (
      <div className="p-8">
        <div className="max-w-xl bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-xl text-gray-900 mb-2">Admin dashboard could not load</h2>
          <p className="text-gray-600 mb-4">
            Ensure you are logged in as an admin user, then try again.
          </p>
          <Button variant="primary" onClick={loadAllData}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F9FAFB]">
      <DashboardSidebar type="admin" activeItem={activeItem} onItemClick={setActiveItem} />

      <main className="flex-1 p-8 overflow-x-auto">
        <div className="mb-8">
          <h1 className="text-3xl text-gray-900 mb-2">Admin Dashboard</h1>
          <p className="text-gray-600">Manage products, categories, users, reports, and seller approvals.</p>
        </div>

        {message && (
          <div className="mb-4 bg-[#DCFCE7] text-[#166534] px-4 py-2 rounded-xl">{message}</div>
        )}
        {error && (
          <div className="mb-4 bg-red-100 text-red-700 px-4 py-2 rounded-xl">{error}</div>
        )}

        {activeItem === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <p className="text-gray-600 mb-1">Users</p>
              <p className="text-2xl text-gray-900">{reports.stats.totalUsers.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <p className="text-gray-600 mb-1">Sellers</p>
              <p className="text-2xl text-gray-900">{reports.stats.totalSellers.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <p className="text-gray-600 mb-1">Products</p>
              <p className="text-2xl text-gray-900">{reports.stats.totalProducts.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <p className="text-gray-600 mb-1">Orders</p>
              <p className="text-2xl text-gray-900">{reports.stats.totalOrders.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <p className="text-gray-600 mb-1">Revenue</p>
              <p className="text-2xl text-[#16A34A]">ETB {reports.stats.totalRevenue.toLocaleString()}</p>
            </div>
          </div>
        )}

        {(activeItem === 'products' || activeItem === 'overview') && (
          <section className="mt-8 bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl text-gray-900 flex items-center gap-2">
                <Package className="w-5 h-5" />
                Products
              </h2>
              {activeItem !== 'products' && <Badge variant="info">Quick View</Badge>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <input className="px-3 py-2 border rounded-lg" placeholder="Name" value={newProduct.name} onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))} />
              <input className="px-3 py-2 border rounded-lg" placeholder="Price" value={newProduct.price} onChange={(e) => setNewProduct((p) => ({ ...p, price: e.target.value }))} />
              <input className="px-3 py-2 border rounded-lg" placeholder="Stock" value={newProduct.stock} onChange={(e) => setNewProduct((p) => ({ ...p, stock: e.target.value }))} />
              <select className="px-3 py-2 border rounded-lg" value={newProduct.categoryId} onChange={(e) => setNewProduct((p) => ({ ...p, categoryId: e.target.value }))}>
                <option value="">Select Category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <input className="px-3 py-2 border rounded-lg" placeholder="Brand" value={newProduct.brand} onChange={(e) => setNewProduct((p) => ({ ...p, brand: e.target.value }))} />
              <input className="px-3 py-2 border rounded-lg" placeholder="Discount Price (optional)" value={newProduct.discountPrice} onChange={(e) => setNewProduct((p) => ({ ...p, discountPrice: e.target.value }))} />
              <input className="px-3 py-2 border rounded-lg" type="file" accept="image/*" multiple onChange={handleNewProductImages} />
            </div>
            <div className="border rounded-xl p-4 mb-4">
              <p className="text-sm text-gray-700 mb-3">Variants (optional)</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <input
                  className="px-3 py-2 border rounded-lg"
                  placeholder="Variant Type (e.g. Size, Weight)"
                  value={newProduct.variantType}
                  onChange={(e) => setNewProduct((p) => ({ ...p, variantType: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                {newProduct.variants.map((variantRow, idx) => (
                  <div key={`admin-new-variant-${idx}`} className="grid grid-cols-1 md:grid-cols-5 gap-2">
                    <input className="px-3 py-2 border rounded-lg" placeholder="Value" value={variantRow.value} onChange={(e) => setNewProduct((p) => ({ ...p, variants: p.variants.map((row, rowIdx) => rowIdx === idx ? { ...row, value: e.target.value } : row) }))} />
                    <input className="px-3 py-2 border rounded-lg" placeholder="Price" value={variantRow.price} onChange={(e) => setNewProduct((p) => ({ ...p, variants: p.variants.map((row, rowIdx) => rowIdx === idx ? { ...row, price: e.target.value } : row) }))} />
                    <input className="px-3 py-2 border rounded-lg" placeholder="Discount Price" value={variantRow.discountPrice} onChange={(e) => setNewProduct((p) => ({ ...p, variants: p.variants.map((row, rowIdx) => rowIdx === idx ? { ...row, discountPrice: e.target.value } : row) }))} />
                    <input className="px-3 py-2 border rounded-lg" placeholder="Stock" value={variantRow.stock} onChange={(e) => setNewProduct((p) => ({ ...p, variants: p.variants.map((row, rowIdx) => rowIdx === idx ? { ...row, stock: e.target.value } : row) }))} />
                    <div className="flex gap-2">
                      <input className="flex-1 px-3 py-2 border rounded-lg" placeholder="SKU (optional)" value={variantRow.sku} onChange={(e) => setNewProduct((p) => ({ ...p, variants: p.variants.map((row, rowIdx) => rowIdx === idx ? { ...row, sku: e.target.value } : row) }))} />
                      <button className="px-3 py-2 border rounded-lg" onClick={() => setNewProduct((p) => ({ ...p, variants: p.variants.filter((_, rowIdx) => rowIdx !== idx) }))}>x</button>
                    </div>
                    <div className="md:col-span-5">
                      <input className="px-3 py-2 border rounded-lg w-full" type="file" accept="image/*" multiple onChange={(e) => addNewVariantImages(idx, e)} />
                      {!!(variantRow.images || []).length && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {(variantRow.images || []).map((image, imageIdx) => (
                            <button key={`${image}-${imageIdx}`} className="relative" onClick={() => removeNewVariantImage(idx, imageIdx)}>
                              <img src={image} alt={`Variant ${idx + 1} image ${imageIdx + 1}`} className="w-14 h-14 object-cover rounded-lg border" />
                              <span className="absolute -top-1 -right-1 bg-black text-white w-5 h-5 rounded-full text-xs">x</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button className="mt-3 px-3 py-2 border rounded-lg text-sm" onClick={() => setNewProduct((p) => ({ ...p, variants: [...p.variants, blankVariantRow()] }))}>
                + Add Variant Value
              </button>
            </div>
            {!!newProduct.images.length && (
              <div className="flex flex-wrap gap-2 mb-3">
                {newProduct.images.map((image, idx) => (
                  <button key={`${image}-${idx}`} className="relative" onClick={() => removeNewProductImage(idx)}>
                    <img src={image} alt={`New product ${idx + 1}`} className="w-16 h-16 object-cover rounded-lg border" />
                    <span className="absolute -top-1 -right-1 bg-black text-white w-5 h-5 rounded-full text-xs">x</span>
                  </button>
                ))}
              </div>
            )}
            <textarea className="w-full px-3 py-2 border rounded-lg mb-3" placeholder="Description" value={newProduct.description} onChange={(e) => setNewProduct((p) => ({ ...p, description: e.target.value }))} />
            <Button variant="primary" size="sm" onClick={handleCreateProduct}>
              <Plus className="w-4 h-4 mr-1" />
              Add Product
            </Button>

            {activeItem === 'products' && (
              <div className="mt-6 space-y-3">
                {products.map((product) => (
                  <div key={product.id} className="border rounded-xl p-4">
                    {editingProductId === product.id ? (
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <input className="px-3 py-2 border rounded-lg" value={product.name} onChange={(e) => setProducts((prev) => prev.map((row) => row.id === product.id ? { ...row, name: e.target.value } : row))} />
                        <input className="px-3 py-2 border rounded-lg" value={String(product.price)} onChange={(e) => setProducts((prev) => prev.map((row) => row.id === product.id ? { ...row, price: Number(e.target.value || 0) } : row))} />
                        <input className="px-3 py-2 border rounded-lg" value={String(product.stock)} onChange={(e) => setProducts((prev) => prev.map((row) => row.id === product.id ? { ...row, stock: Number(e.target.value || 0) } : row))} />
                        <select className="px-3 py-2 border rounded-lg" value={product.categoryId} onChange={(e) => setProducts((prev) => prev.map((row) => row.id === product.id ? { ...row, categoryId: e.target.value } : row))}>
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>{category.name}</option>
                          ))}
                        </select>
                        <textarea className="md:col-span-4 px-3 py-2 border rounded-lg" value={product.description} onChange={(e) => setProducts((prev) => prev.map((row) => row.id === product.id ? { ...row, description: e.target.value } : row))} />
                        <div className="md:col-span-4 border rounded-xl p-4">
                          <p className="text-sm text-gray-700 mb-3">Variants (optional)</p>
                          <input
                            className="px-3 py-2 border rounded-lg w-full mb-3"
                            placeholder="Variant Type (e.g. Size, Weight)"
                            value={String((Array.isArray(product.variantGroups) ? product.variantGroups[0]?.type : '') || '')}
                            onChange={(e) =>
                              setProducts((prev) =>
                                prev.map((row) => {
                                  if (row.id !== product.id) return row;
                                  const currentGroup = Array.isArray(row.variantGroups) ? row.variantGroups[0] : undefined;
                                  return {
                                    ...row,
                                    variantGroups: [{ type: e.target.value, values: Array.isArray(currentGroup?.values) ? currentGroup.values : [] }],
                                  };
                                }),
                              )
                            }
                          />
                          <div className="space-y-2">
                            {(Array.isArray(product.variantGroups) ? product.variantGroups[0]?.values || [] : []).map((variantRow, variantIndex) => (
                              <div key={`${product.id}-variant-${variantIndex}`} className="grid grid-cols-1 md:grid-cols-5 gap-2">
                                <input
                                  className="px-3 py-2 border rounded-lg"
                                  placeholder="Value"
                                  value={String(variantRow.value || '')}
                                  onChange={(e) =>
                                    setProducts((prev) =>
                                      prev.map((row) => {
                                        if (row.id !== product.id) return row;
                                        const currentGroup = Array.isArray(row.variantGroups) ? row.variantGroups[0] : undefined;
                                        if (!currentGroup) return row;
                                        const values = Array.isArray(currentGroup.values) ? currentGroup.values : [];
                                        return { ...row, variantGroups: [{ ...currentGroup, values: values.map((valueRow, idx) => idx === variantIndex ? { ...valueRow, value: e.target.value } : valueRow) }] };
                                      }),
                                    )
                                  }
                                />
                                <input
                                  className="px-3 py-2 border rounded-lg"
                                  placeholder="Price"
                                  value={String(variantRow.price ?? '')}
                                  onChange={(e) =>
                                    setProducts((prev) =>
                                      prev.map((row) => {
                                        if (row.id !== product.id) return row;
                                        const currentGroup = Array.isArray(row.variantGroups) ? row.variantGroups[0] : undefined;
                                        if (!currentGroup) return row;
                                        const values = Array.isArray(currentGroup.values) ? currentGroup.values : [];
                                        return { ...row, variantGroups: [{ ...currentGroup, values: values.map((valueRow, idx) => idx === variantIndex ? { ...valueRow, price: Number(e.target.value || 0) } : valueRow) }] };
                                      }),
                                    )
                                  }
                                />
                                <input
                                  className="px-3 py-2 border rounded-lg"
                                  placeholder="Discount Price"
                                  value={variantRow.discountPrice === null || variantRow.discountPrice === undefined ? '' : String(variantRow.discountPrice)}
                                  onChange={(e) =>
                                    setProducts((prev) =>
                                      prev.map((row) => {
                                        if (row.id !== product.id) return row;
                                        const currentGroup = Array.isArray(row.variantGroups) ? row.variantGroups[0] : undefined;
                                        if (!currentGroup) return row;
                                        const values = Array.isArray(currentGroup.values) ? currentGroup.values : [];
                                        return { ...row, variantGroups: [{ ...currentGroup, values: values.map((valueRow, idx) => idx === variantIndex ? { ...valueRow, discountPrice: e.target.value === '' ? null : Number(e.target.value || 0) } : valueRow) }] };
                                      }),
                                    )
                                  }
                                />
                                <input
                                  className="px-3 py-2 border rounded-lg"
                                  placeholder="Stock"
                                  value={String(variantRow.stock ?? '')}
                                  onChange={(e) =>
                                    setProducts((prev) =>
                                      prev.map((row) => {
                                        if (row.id !== product.id) return row;
                                        const currentGroup = Array.isArray(row.variantGroups) ? row.variantGroups[0] : undefined;
                                        if (!currentGroup) return row;
                                        const values = Array.isArray(currentGroup.values) ? currentGroup.values : [];
                                        return { ...row, variantGroups: [{ ...currentGroup, values: values.map((valueRow, idx) => idx === variantIndex ? { ...valueRow, stock: Number(e.target.value || 0) } : valueRow) }] };
                                      }),
                                    )
                                  }
                                />
                                <div className="flex gap-2">
                                  <input
                                    className="flex-1 px-3 py-2 border rounded-lg"
                                    placeholder="SKU (optional)"
                                    value={String(variantRow.sku || '')}
                                    onChange={(e) =>
                                      setProducts((prev) =>
                                        prev.map((row) => {
                                          if (row.id !== product.id) return row;
                                          const currentGroup = Array.isArray(row.variantGroups) ? row.variantGroups[0] : undefined;
                                          if (!currentGroup) return row;
                                          const values = Array.isArray(currentGroup.values) ? currentGroup.values : [];
                                          return { ...row, variantGroups: [{ ...currentGroup, values: values.map((valueRow, idx) => idx === variantIndex ? { ...valueRow, sku: e.target.value } : valueRow) }] };
                                        }),
                                      )
                                    }
                                  />
                                  <button
                                    className="px-3 py-2 border rounded-lg"
                                    onClick={() =>
                                      setProducts((prev) =>
                                        prev.map((row) => {
                                          if (row.id !== product.id) return row;
                                          const currentGroup = Array.isArray(row.variantGroups) ? row.variantGroups[0] : undefined;
                                          if (!currentGroup) return row;
                                          const values = Array.isArray(currentGroup.values) ? currentGroup.values : [];
                                          return { ...row, variantGroups: [{ ...currentGroup, values: values.filter((_, idx) => idx !== variantIndex) }] };
                                        }),
                                      )
                                    }
                                  >
                                    x
                                  </button>
                                </div>
                                <div className="md:col-span-5">
                                  <input className="px-3 py-2 border rounded-lg w-full" type="file" accept="image/*" multiple onChange={(e) => addEditingVariantImages(product.id, variantIndex, e)} />
                                  {!!(Array.isArray(variantRow.images) ? variantRow.images : []).length && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                      {(Array.isArray(variantRow.images) ? variantRow.images : []).map((image, imageIdx) => (
                                        <button key={`${product.id}-${variantIndex}-${imageIdx}`} className="relative" onClick={() => removeEditingVariantImage(product.id, variantIndex, imageIdx)}>
                                          <img src={image} alt={`Variant image ${imageIdx + 1}`} className="w-14 h-14 object-cover rounded-lg border" />
                                          <span className="absolute -top-1 -right-1 bg-black text-white w-5 h-5 rounded-full text-xs">x</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          <button
                            className="mt-3 px-3 py-2 border rounded-lg text-sm"
                            onClick={() =>
                              setProducts((prev) =>
                                prev.map((row) => {
                                  if (row.id !== product.id) return row;
                                  const currentGroup = Array.isArray(row.variantGroups) ? row.variantGroups[0] : undefined;
                                  const nextGroup = currentGroup || { type: '', values: [] };
                                  return {
                                    ...row,
                                    variantGroups: [{
                                      ...nextGroup,
                                      values: [
                                        ...(Array.isArray(nextGroup.values) ? nextGroup.values : []),
                                        { value: '', price: 0, discountPrice: null, stock: Number(product.stock || 0), sku: '', images: [] },
                                      ],
                                    }],
                                  };
                                }),
                              )
                            }
                          >
                            + Add Variant Value
                          </button>
                        </div>
                        <input className="md:col-span-4 px-3 py-2 border rounded-lg" type="file" accept="image/*" multiple onChange={(e) => handleEditProductImages(product.id, e)} />
                        <div className="md:col-span-4 flex flex-wrap gap-2">
                          {(Array.isArray(product.images) ? product.images : []).map((image, idx) => (
                            <button key={`${product.id}-${idx}`} className="relative" onClick={() => removeEditingProductImage(product.id, idx)}>
                              <img src={image} alt={`Product ${idx + 1}`} className="w-16 h-16 object-cover rounded-lg border" />
                              <span className="absolute -top-1 -right-1 bg-black text-white w-5 h-5 rounded-full text-xs">x</span>
                            </button>
                          ))}
                        </div>
                        <div className="md:col-span-4 flex gap-2">
                          <Button size="sm" onClick={() => handleUpdateProduct(product)}>Save</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingProductId(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <img src={(Array.isArray(product.images) ? product.images[0] : '') || ''} alt={product.name} className="w-12 h-12 rounded-lg object-cover border" />
                          <div>
                            <p className="text-gray-900">{product.name}</p>
                            <p className="text-sm text-gray-600">{product.categoryName} | ETB {Number(product.price).toLocaleString()} | Stock {product.stock}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setEditingProductId(product.id)}>
                            <Edit3 className="w-4 h-4 mr-1" />
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleDeleteProduct(product.id)}>
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {(activeItem === 'sellers' || activeItem === 'overview') && (
          <section className="mt-8 bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5" />
                Categories
              </h2>
              {activeItem !== 'sellers' && <Badge variant="info">Quick View</Badge>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <input className="px-3 py-2 border rounded-lg" placeholder="Category Name" value={newCategory.name} onChange={(e) => setNewCategory((c) => ({ ...c, name: e.target.value }))} />
              <input className="px-3 py-2 border rounded-lg" type="file" accept="image/*" onChange={(e) => handleCategoryImageFile(e)} />
              <Button size="sm" onClick={handleCreateCategory}>
                <Plus className="w-4 h-4 mr-1" />
                Add Category
              </Button>
            </div>
            {!!newCategory.image && (
              <img src={newCategory.image} alt="New category" className="w-20 h-20 object-cover rounded-lg border mb-4" />
            )}

            {activeItem === 'sellers' && (
              <div className="space-y-3">
                {categories.map((category) => (
                  <div key={category.id} className="border rounded-xl p-4 flex items-center justify-between">
                    {editingCategoryId === category.id ? (
                      <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input className="px-3 py-2 border rounded-lg" value={category.name} onChange={(e) => setCategories((prev) => prev.map((row) => row.id === category.id ? { ...row, name: e.target.value } : row))} />
                        <input className="px-3 py-2 border rounded-lg" type="file" accept="image/*" onChange={(e) => handleCategoryImageFile(e, category.id)} />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleUpdateCategory(category)}>Save</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingCategoryId(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <img src={category.image || ''} alt={category.name} className="w-12 h-12 rounded-lg object-cover border" />
                          <div>
                            <p className="text-gray-900">{category.name}</p>
                            <p className="text-sm text-gray-600">Products: {category.productsCount || 0}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setEditingCategoryId(category.id)}>Edit</Button>
                          <Button size="sm" variant="outline" onClick={() => handleDeleteCategory(category.id)}>Delete</Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeItem === 'users' && (
          <section className="mt-8 bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-xl text-gray-900 mb-4 flex items-center gap-2">
              <UserCheck className="w-5 h-5" />
              Users Management
            </h2>
            <div className="space-y-3">
              {users.map((user) => (
                <div key={user.id} className="border rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="text-gray-900">{user.name}</p>
                    <p className="text-sm text-gray-600">{user.email} | {user.phone || 'No phone'}</p>
                    <p className="text-xs text-gray-500">Joined {new Date(user.createdAt).toISOString().slice(0, 10)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={user.role === 'ADMIN' ? 'danger' : user.role === 'SELLER' ? 'info' : 'success'}>{user.role}</Badge>
                    <select className="px-3 py-2 border rounded-lg" value={user.role} onChange={(e) => handleUserRoleChange(user, e.target.value)}>
                      <option value="CUSTOMER">CUSTOMER</option>
                      <option value="SELLER">SELLER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeItem === 'orders' && (
          <section className="mt-8 bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-xl text-gray-900 mb-4 flex items-center gap-2">
              <Package className="w-5 h-5" />
              Paid Orders For Delivery
            </h2>
            {loadingDeliveryOrders ? (
              <p className="text-gray-600">Loading paid orders...</p>
            ) : deliveryOrders.length === 0 ? (
              <p className="text-gray-600">No paid orders found yet.</p>
            ) : (
              <div className="space-y-4">
                {deliveryOrders.map((order) => (
                  <div key={order.id} className="border rounded-xl p-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div>
                        <p className="text-gray-900">Order #{order.id.slice(0, 8)}</p>
                        <p className="text-sm text-gray-600">
                          {new Date(order.createdAt).toISOString().slice(0, 10)} | {order.customer.name} | {order.customer.phone || order.shippingAddress.phone}
                        </p>
                        <p className="text-sm text-gray-600">
                          {order.shippingAddress.city}
                          {order.shippingAddress.subCity ? `, ${order.shippingAddress.subCity}` : ''}
                          {order.shippingAddress.region ? `, ${order.shippingAddress.region}` : ''}
                          {order.shippingAddress.details ? ` | ${order.shippingAddress.details}` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-700">Payment: {order.payment.method} ({order.payment.status})</p>
                        <p className="text-sm text-gray-700">Tx: {order.payment.transactionId || '-'}</p>
                        <p className="text-sm text-[#16A34A]">Total ETB {order.totalAmount.toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {order.items.map((item) => (
                        <div key={item.id} className="bg-gray-50 rounded-lg p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <img src={item.productImage || ''} alt={item.productName} className="w-12 h-12 rounded-lg border object-cover" />
                            <div>
                              <p className="text-sm text-gray-900">{item.productName}</p>
                              <p className="text-xs text-gray-600">SKU: {item.productSku || '-'}</p>
                              <p className="text-xs text-gray-600">
                                Qty: {item.quantity} | Unit: ETB {item.unitPrice.toLocaleString()} | Total: ETB {item.totalPrice.toLocaleString()}
                              </p>
                              {item.selectedVariant ? (
                                <p className="text-xs text-blue-700">
                                  Variant: {item.selectedVariant.title || item.selectedVariant.sku || item.selectedVariant.id}
                                  {(item.selectedVariant as any).type && (item.selectedVariant as any).value
                                    ? ` (${(item.selectedVariant as any).type}: ${(item.selectedVariant as any).value})`
                                    : ''}
                                </p>
                              ) : item.variantOptions.length ? (
                                <p className="text-xs text-amber-700">
                                  Variant options: {item.variantOptions.map((variant) => variant.title || variant.sku).filter(Boolean).slice(0, 3).join(', ')}
                                </p>
                              ) : (
                                <p className="text-xs text-gray-500">No variant recorded.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeItem === 'approvals' && (
          <section className="mt-8 bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-xl text-gray-900 mb-4">Seller Upgrade Requests</h2>
            {pendingRequests.length === 0 ? (
              <p className="text-gray-600">No pending requests.</p>
            ) : (
              <div className="space-y-3">
                {pendingRequests.map((request) => (
                  <div key={request.id} className="border rounded-xl p-4">
                    <p className="text-gray-900">{request.name}</p>
                    <p className="text-sm text-gray-600">{request.email} {request.phone ? `| ${request.phone}` : ''}</p>
                    {request.message && <p className="text-sm text-gray-700 mt-2">{formatRequestMessage(request.message)}</p>}
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" onClick={() => handleRequestReview(request.id, 'APPROVE')}>
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleRequestReview(request.id, 'REJECT')}>
                        <XCircle className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeItem === 'reports' && (
          <section className="mt-8 bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-xl text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Top Products Report
            </h2>
            <div className="space-y-3">
              {reports.topProducts.map((row) => (
                <div key={row.id} className="border rounded-xl p-4 flex items-center justify-between">
                  <p className="text-gray-900">{row.name}</p>
                  <div className="text-right">
                    <p className="text-sm text-gray-700">Sold: {row.unitsSold}</p>
                    <p className="text-sm text-[#16A34A]">ETB {row.revenue.toLocaleString()}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeItem === 'analysis' && (
          <section className="mt-8 bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl text-gray-900 flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Analysis
              </h2>
              <div className="flex gap-2">
                <Button size="sm" onClick={exportCSV}>Export CSV</Button>
                <Button size="sm" variant="outline" onClick={exportPDF}>Print / PDF</Button>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <label className="text-xs text-gray-600 block mb-1">Range</label>
                <select
                  className="px-3 py-2 border rounded-lg"
                  value={analysisRange}
                  onChange={(e) => setAnalysisRange(e.target.value as 'day' | 'week' | 'month' | 'halfyear' | 'year')}
                >
                  <option value="day">1 Day</option>
                  <option value="week">1 Week</option>
                  <option value="month">1 Month</option>
                  <option value="halfyear">Half Year</option>
                  <option value="year">1 Year</option>
                </select>
              </div>
              {analysisRange === 'month' && (
                <div>
                  <label className="text-xs text-gray-600 block mb-1">Month</label>
                  <input
                    type="month"
                    className="px-3 py-2 border rounded-lg"
                    value={analysisMonth}
                    onChange={(e) => setAnalysisMonth(e.target.value)}
                  />
                </div>
              )}
              <Button size="sm" variant="outline" onClick={() => loadAnalysisData()}>
                Refresh
              </Button>
            </div>

            {loadingAnalysis ? (
              <p className="text-gray-600">Loading analysis...</p>
            ) : !analysisData ? (
              <p className="text-gray-600">No analysis data available.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-white p-4 rounded-lg border">
                    <p className="text-sm text-gray-600">Paid Orders</p>
                    <p className="text-2xl text-gray-900">{analysisData.summary.totalOrders.toLocaleString()}</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg border">
                    <p className="text-sm text-gray-600">Revenue</p>
                    <p className="text-2xl text-[#16A34A]">ETB {analysisData.summary.totalRevenue.toLocaleString()}</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg border">
                    <p className="text-sm text-gray-600">Avg Order Value</p>
                    <p className="text-2xl text-gray-900">ETB {analysisData.summary.avgOrderValue.toLocaleString()}</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg border">
                    <p className="text-sm text-gray-600">Points</p>
                    <p className="text-2xl text-gray-900">{analysisData.series.length}</p>
                  </div>
                </div>

                <div className="w-full h-56 bg-gray-50 rounded-lg p-4 mb-6">
                  <svg width="100%" height="100%" viewBox="0 0 700 220" preserveAspectRatio="none">
                    {(() => {
                      const points = analysisData.series || [];
                      if (!points.length) return null;
                      const maxRevenue = Math.max(...points.map((point) => point.revenue), 1);
                      const barWidth = 700 / points.length;
                      return points.map((point, idx) => {
                        const h = (point.revenue / maxRevenue) * 160;
                        const x = idx * barWidth + 8;
                        const y = 180 - h;
                        return (
                          <g key={point.key}>
                            <rect x={x} y={y} width={Math.max(6, barWidth - 14)} height={h} fill="#16A34A" rx="4" />
                            <text x={x + Math.max(6, barWidth - 14) / 2} y={196} fontSize="9" textAnchor="middle" fill="#555">
                              {point.label.length > 10 ? `${point.label.slice(0, 10)}…` : point.label}
                            </text>
                          </g>
                        );
                      });
                    })()}
                  </svg>
                </div>

                <div className="overflow-x-auto mb-6">
                  <table className="w-full text-left">
                    <thead>
                      <tr>
                        <th className="px-3 py-2 text-sm text-gray-600">Period</th>
                        <th className="px-3 py-2 text-sm text-gray-600">Orders</th>
                        <th className="px-3 py-2 text-sm text-gray-600">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysisData.series.map((point) => (
                        <tr key={point.key} className="border-t">
                          <td className="px-3 py-2">{point.label}</td>
                          <td className="px-3 py-2">{point.ordersCount}</td>
                          <td className="px-3 py-2">ETB {point.revenue.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h3 className="text-lg text-gray-900 mb-3">Top Paid Products</h3>
                <div className="space-y-2">
                  {analysisData.topProducts.map((row) => (
                    <div key={row.id} className="border rounded-xl p-3 flex items-center justify-between">
                      <p className="text-gray-900">{row.name}</p>
                      <div className="text-right">
                        <p className="text-sm text-gray-700">Sold: {row.unitsSold}</p>
                        <p className="text-sm text-[#16A34A]">ETB {row.revenue.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {activeItem === 'settings' && (
          <section className="mt-8 bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-xl text-gray-900 mb-4">Promotional Banner</h2>
            <p className="text-sm text-gray-600 mb-4">
              Update the hero background image shown on the home page.
            </p>
            <input className="px-3 py-2 border rounded-lg mb-4" type="file" accept="image/*" onChange={handlePromoBannerFile} />
            {!!promoBannerImage && (
              <img src={promoBannerImage} alt="Promo banner preview" className="w-full max-w-xl h-52 object-cover rounded-xl border mb-4" />
            )}
            <Button onClick={handleSavePromoBanner} disabled={savingBanner || !promoBannerImage}>
              {savingBanner ? 'Saving...' : 'Save Banner'}
            </Button>
          </section>
        )}
      </main>
    </div>
  );
}
