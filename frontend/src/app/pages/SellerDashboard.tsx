import React, { useEffect, useMemo, useState } from 'react';
import { DollarSign, ShoppingBag, Package, Clock, Trash2 } from 'lucide-react';
import { DashboardSidebar } from '../components/DashboardSidebar';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import {
  AdminProduct,
  FrontendAuthUser,
  FrontendCategory,
  ProductVariantGroup,
  createSellerProduct,
  deleteSellerProduct,
  filesToDataUrls,
  getCategories,
  getMySellerDashboard,
  getSellerProducts,
  updateSellerProduct,
} from '../data/api';

interface SellerDashboardProps {
  authUser: FrontendAuthUser | null;
  onNavigate: (page: string) => void;
}

export function SellerDashboard({ authUser, onNavigate }: SellerDashboardProps) {
  const blankVariantRow = () => ({ value: '', price: '', discountPrice: '', stock: '', sku: '', images: [] as string[] });
  const [activeItem, setActiveItem] = useState('overview');
  const [dashboard, setDashboard] = useState<any>(null);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<FrontendCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
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

  const isApprovedSeller =
    !!authUser &&
    String(authUser.role || '').toUpperCase() === 'SELLER' &&
    Number(authUser.isApproved || 0) === 1;

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

  const loadData = async () => {
    setLoading(true);
    try {
      const [dashboardRows, productRows, categoryRows] = await Promise.all([
        getMySellerDashboard(),
        getSellerProducts(),
        getCategories(),
      ]);
      setDashboard(dashboardRows);
      setProducts(productRows);
      setCategories(categoryRows);
    } catch {
      showError('Could not load seller dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isApprovedSeller) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [authUser?.id, isApprovedSeller]);

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

    setSubmitting(true);
    try {
      await createSellerProduct({
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
      await loadData();
      showMessage('Product added.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not add product.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      await deleteSellerProduct(productId);
      await loadData();
      showMessage('Product deleted.');
    } catch {
      showError('Could not delete product.');
    }
  };

  const handleUpdateProduct = async (product: AdminProduct) => {
    const images = Array.isArray(product.images) ? product.images : [];
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
      await updateSellerProduct(product.id, {
        name: product.name,
        description: product.description,
        price: Number(product.price || 0),
        discountPrice: product.discountPrice ? Number(product.discountPrice) : null,
        stock: Number(product.stock || 0),
        brand: product.brand,
        categoryId: product.categoryId,
        images,
        variantGroups,
      });
      setEditingProductId(null);
      await loadData();
      showMessage('Product updated.');
    } catch {
      showError('Could not update product.');
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
          return {
            ...row,
            variantGroups: [{ ...firstGroup, values: updatedValues }],
          };
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
        return {
          ...row,
          variantGroups: [{ ...firstGroup, values: updatedValues }],
        };
      }),
    );
  };

  const stats = useMemo(
    () => [
      {
        title: 'Total Sales',
        value: `ETB ${Number(dashboard?.stats?.totalSales || 0).toLocaleString()}`,
        icon: <DollarSign className="w-6 h-6" />,
        bgColor: 'bg-green-100',
        iconColor: 'text-[#16A34A]',
      },
      {
        title: 'Total Orders',
        value: Number(dashboard?.stats?.totalOrders || 0).toLocaleString(),
        icon: <ShoppingBag className="w-6 h-6" />,
        bgColor: 'bg-blue-100',
        iconColor: 'text-blue-600',
      },
      {
        title: 'Total Products',
        value: Number(dashboard?.stats?.totalProducts || 0).toLocaleString(),
        icon: <Package className="w-6 h-6" />,
        bgColor: 'bg-purple-100',
        iconColor: 'text-purple-600',
      },
      {
        title: 'Pending Orders',
        value: Number(dashboard?.stats?.pendingOrders || 0).toLocaleString(),
        icon: <Clock className="w-6 h-6" />,
        bgColor: 'bg-orange-100',
        iconColor: 'text-orange-600',
      },
    ],
    [dashboard],
  );

  if (!authUser) {
    return (
      <div className="max-w-[760px] mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <h1 className="text-2xl text-gray-900 mb-2">Seller Dashboard</h1>
          <p className="text-gray-600 mb-6">Please login first.</p>
          <Button variant="primary" onClick={() => onNavigate('login')}>Go To Login</Button>
        </div>
      </div>
    );
  }

  if (!isApprovedSeller) {
    return (
      <div className="max-w-[760px] mx-auto px-6 py-12">
        <div className="bg-white rounded-2xl shadow-sm p-8">
          <h1 className="text-2xl text-gray-900 mb-2">Seller Dashboard</h1>
          <p className="text-gray-600 mb-6">You need admin approval before using seller tools.</p>
          <Button variant="primary" onClick={() => onNavigate('become-seller')}>Become A Seller</Button>
        </div>
      </div>
    );
  }

  if (loading || !dashboard) {
    return <div className="p-8 text-gray-600">Loading seller dashboard...</div>;
  }

  return (
    <div className="flex min-h-screen bg-[#F9FAFB]">
      <DashboardSidebar type="seller" activeItem={activeItem} onItemClick={setActiveItem} />

      <main className="flex-1 p-8 overflow-x-auto">
        <div className="mb-8">
          <h1 className="text-3xl text-gray-900 mb-2">Seller Dashboard</h1>
          <p className="text-gray-600">Track insights and manage your products.</p>
        </div>

        {message && <div className="mb-4 bg-green-100 text-green-700 px-4 py-2 rounded-xl">{message}</div>}
        {error && <div className="mb-4 bg-red-100 text-red-700 px-4 py-2 rounded-xl">{error}</div>}

        {(activeItem === 'overview' || activeItem === 'analytics') && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {stats.map((stat) => (
                <div key={stat.title} className="bg-white rounded-2xl shadow-sm p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`${stat.bgColor} ${stat.iconColor} p-3 rounded-xl`}>{stat.icon}</div>
                  </div>
                  <p className="text-gray-600 mb-1">{stat.title}</p>
                  <p className="text-2xl text-gray-900">{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl shadow-sm">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl text-gray-900">Recent Orders</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase">Order</th>
                      <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase">Customer</th>
                      <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase">Amount</th>
                      <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {dashboard.recentOrders.map((order: any) => (
                      <tr key={order.id}>
                        <td className="px-6 py-4 text-gray-900">{order.id.slice(0, 10)}</td>
                        <td className="px-6 py-4 text-gray-900">{order.customer}</td>
                        <td className="px-6 py-4 text-[#16A34A]">ETB {Number(order.totalAmount).toLocaleString()}</td>
                        <td className="px-6 py-4">
                          <Badge variant="info">{order.status}</Badge>
                        </td>
                      </tr>
                    ))}
                    {!dashboard.recentOrders.length && (
                      <tr>
                        <td className="px-6 py-4 text-gray-600" colSpan={4}>No orders yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {(activeItem === 'products' || activeItem === 'overview') && (
          <div className="mt-8 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="text-xl text-gray-900 mb-4">Add Product</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input className="px-3 py-2 border rounded-lg" placeholder="Name" value={newProduct.name} onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))} />
                <input className="px-3 py-2 border rounded-lg" placeholder="Brand" value={newProduct.brand} onChange={(e) => setNewProduct((p) => ({ ...p, brand: e.target.value }))} />
                <input className="px-3 py-2 border rounded-lg" placeholder="Price" value={newProduct.price} onChange={(e) => setNewProduct((p) => ({ ...p, price: e.target.value }))} />
                <input className="px-3 py-2 border rounded-lg" placeholder="Discount Price" value={newProduct.discountPrice} onChange={(e) => setNewProduct((p) => ({ ...p, discountPrice: e.target.value }))} />
                <input className="px-3 py-2 border rounded-lg" placeholder="Stock" value={newProduct.stock} onChange={(e) => setNewProduct((p) => ({ ...p, stock: e.target.value }))} />
                <select className="px-3 py-2 border rounded-lg" value={newProduct.categoryId} onChange={(e) => setNewProduct((p) => ({ ...p, categoryId: e.target.value }))}>
                  <option value="">Select Category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
                <input className="px-3 py-2 border rounded-lg md:col-span-2" type="file" accept="image/*" multiple onChange={handleNewProductImages} />
                <textarea className="px-3 py-2 border rounded-lg md:col-span-2" placeholder="Description" value={newProduct.description} onChange={(e) => setNewProduct((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="mt-4 border rounded-xl p-4">
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
                    <div key={`new-variant-${idx}`} className="grid grid-cols-1 md:grid-cols-5 gap-2">
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
                <div className="flex flex-wrap gap-2 mt-3">
                  {newProduct.images.map((image, idx) => (
                    <button key={`${image}-${idx}`} className="relative" onClick={() => removeNewProductImage(idx)}>
                      <img src={image} alt={`New product ${idx + 1}`} className="w-16 h-16 object-cover rounded-lg border" />
                      <span className="absolute -top-1 -right-1 bg-black text-white w-5 h-5 rounded-full text-xs">x</span>
                    </button>
                  ))}
                </div>
              )}
              <Button variant="primary" className="mt-4" disabled={submitting} onClick={handleCreateProduct}>
                {submitting ? 'Adding...' : 'Add Product'}
              </Button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl text-gray-900">My Products</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase">Product</th>
                      <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase">Category</th>
                      <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase">Price</th>
                      <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase">Stock</th>
                      <th className="px-6 py-3 text-right text-xs text-gray-600 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {products.map((product) => {
                      const images = Array.isArray(product.images) ? product.images : [];
                      return (
                        <tr key={product.id}>
                          {editingProductId === product.id ? (
                            <td className="px-6 py-4" colSpan={5}>
                              {(() => {
                                const primaryVariantGroup = Array.isArray(product.variantGroups) ? product.variantGroups[0] : undefined;
                                const variantType = String(primaryVariantGroup?.type || '');
                                const variantValues = Array.isArray(primaryVariantGroup?.values) ? primaryVariantGroup.values : [];
                                return (
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
                                <input className="md:col-span-4 px-3 py-2 border rounded-lg" type="file" accept="image/*" multiple onChange={(e) => handleEditProductImages(product.id, e)} />
                                <div className="md:col-span-4 border rounded-xl p-4">
                                  <p className="text-sm text-gray-700 mb-3">Variants (optional)</p>
                                  <input
                                    className="px-3 py-2 border rounded-lg w-full mb-3"
                                    placeholder="Variant Type (e.g. Size, Weight)"
                                    value={variantType}
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
                                    {variantValues.map((variantRow, variantIndex) => (
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
                                                return {
                                                  ...row,
                                                  variantGroups: [{
                                                    ...currentGroup,
                                                    values: values.map((valueRow, idx) => idx === variantIndex ? { ...valueRow, value: e.target.value } : valueRow),
                                                  }],
                                                };
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
                                                return {
                                                  ...row,
                                                  variantGroups: [{
                                                    ...currentGroup,
                                                    values: values.map((valueRow, idx) => idx === variantIndex ? { ...valueRow, price: Number(e.target.value || 0) } : valueRow),
                                                  }],
                                                };
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
                                                return {
                                                  ...row,
                                                  variantGroups: [{
                                                    ...currentGroup,
                                                    values: values.map((valueRow, idx) => idx === variantIndex ? { ...valueRow, discountPrice: e.target.value === '' ? null : Number(e.target.value || 0) } : valueRow),
                                                  }],
                                                };
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
                                                return {
                                                  ...row,
                                                  variantGroups: [{
                                                    ...currentGroup,
                                                    values: values.map((valueRow, idx) => idx === variantIndex ? { ...valueRow, stock: Number(e.target.value || 0) } : valueRow),
                                                  }],
                                                };
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
                                                  return {
                                                    ...row,
                                                    variantGroups: [{
                                                      ...currentGroup,
                                                      values: values.map((valueRow, idx) => idx === variantIndex ? { ...valueRow, sku: e.target.value } : valueRow),
                                                    }],
                                                  };
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
                                                  return {
                                                    ...row,
                                                    variantGroups: [{ ...currentGroup, values: values.filter((_, idx) => idx !== variantIndex) }],
                                                  };
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
                                <div className="md:col-span-4 flex flex-wrap gap-2">
                                  {images.map((image, idx) => (
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
                                );
                              })()}
                            </td>
                          ) : (
                            <>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <img src={images[0] || ''} alt={product.name} className="w-10 h-10 rounded-lg object-cover" />
                                  <span className="text-gray-900">{product.name}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-gray-900">{product.categoryName || '-'}</td>
                              <td className="px-6 py-4 text-[#16A34A]">
                                ETB {Number(product.discountPrice || product.price).toLocaleString()}
                              </td>
                              <td className="px-6 py-4 text-gray-900">{Number(product.stock || 0)}</td>
                              <td className="px-6 py-4">
                                <div className="flex justify-end gap-2">
                                  <button className="p-2 hover:bg-gray-50 rounded-lg" onClick={() => setEditingProductId(product.id)}>
                                    Edit
                                  </button>
                                  <button className="p-2 hover:bg-red-50 rounded-lg" onClick={() => handleDeleteProduct(product.id)}>
                                    <Trash2 className="w-4 h-4 text-red-600" />
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                    {!products.length && (
                      <tr>
                        <td className="px-6 py-4 text-gray-600" colSpan={5}>No products yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
