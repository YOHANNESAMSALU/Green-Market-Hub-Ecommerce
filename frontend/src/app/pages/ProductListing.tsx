import React, { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { addToCart, FrontendProduct, getProducts } from '../data/api';

interface ProductListingProps {
  onNavigate: (page: string, data?: any) => void;
  onCartChange?: () => void;
  initialFilters?: {
    search?: string;
    category?: string;
  };
}

const WISHLIST_KEY = 'marketHubWishlist';

export function ProductListing({ onNavigate, onCartChange, initialFilters }: ProductListingProps) {
  const [priceRange, setPriceRange] = useState([0, 50000]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [minRating, setMinRating] = useState(0);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [sortBy, setSortBy] = useState('popularity');
  const [products, setProducts] = useState<FrontendProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    getProducts()
      .then((rows) => setProducts(rows))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(WISHLIST_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setWishlist(parsed.filter((id) => typeof id === 'string'));
      }
    } catch {
      setWishlist([]);
    }
  }, []);

  useEffect(() => {
    if (!initialFilters) return;
    if (initialFilters.search !== undefined) {
      setSearchTerm(initialFilters.search);
    }
    if (initialFilters.category) {
      setSelectedCategories([initialFilters.category]);
    }
  }, [initialFilters]);

  const brands = useMemo(() => [...new Set(products.map((p) => p.brand).filter(Boolean))], [products]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))], [products]);

  const filteredProducts = useMemo(() => {
    let rows = [...products];

    if (searchTerm.trim()) {
      const query = searchTerm.trim().toLowerCase();
      rows = rows.filter(
        (product) =>
          product.name.toLowerCase().includes(query) ||
          product.description.toLowerCase().includes(query) ||
          String(product.brand || '').toLowerCase().includes(query) ||
          String(product.category || '').toLowerCase().includes(query),
      );
    }

    rows = rows.filter((product) => product.price >= priceRange[0] && product.price <= priceRange[1]);

    if (selectedBrands.length) {
      rows = rows.filter((product) => selectedBrands.includes(product.brand));
    }

    if (selectedCategories.length) {
      rows = rows.filter((product) => selectedCategories.includes(product.category));
    }

    if (onlyAvailable) {
      rows = rows.filter((product) => product.stock > 0);
    }

    if (minRating > 0) {
      rows = rows.filter((product) => product.rating >= minRating);
    }

    if (sortBy === 'price-low') rows.sort((a, b) => a.price - b.price);
    if (sortBy === 'price-high') rows.sort((a, b) => b.price - a.price);
    if (sortBy === 'rating') rows.sort((a, b) => b.rating - a.rating);

    return rows;
  }, [minRating, onlyAvailable, priceRange, products, searchTerm, selectedBrands, selectedCategories, sortBy]);

  const showMessage = (value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(''), 1800);
  };

  const handleAddToCart = async (productId: string) => {
    try {
      await addToCart(productId, 1);
      onCartChange?.();
      showMessage('Added to cart');
    } catch {
      showMessage('Could not add to cart');
    }
  };

  const toggleWishlist = (productId: string) => {
    const next = wishlist.includes(productId)
      ? wishlist.filter((id) => id !== productId)
      : [...wishlist, productId];
    setWishlist(next);
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(next));
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-8">
          <button onClick={() => onNavigate('home')} className="hover:text-[#16A34A]">Home</button>
          <span>/</span>
          <span className="text-gray-900">Products</span>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="w-full lg:w-72 flex-shrink-0">
            <div className="bg-white rounded-2xl shadow-sm p-6 lg:sticky lg:top-24">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-gray-900">Filters</h3>
                <SlidersHorizontal className="w-5 h-5 text-gray-400" />
              </div>

              <div className="mb-6">
                <h4 className="text-gray-900 mb-3">Category</h4>
                <div className="space-y-2 max-h-52 overflow-auto">
                  {categories.map((category) => (
                    <label key={category} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-[#16A34A] rounded focus:ring-[#16A34A]"
                        checked={selectedCategories.includes(category)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCategories([...selectedCategories, category]);
                          } else {
                            setSelectedCategories(selectedCategories.filter((c) => c !== category));
                          }
                        }}
                      />
                      <span className="text-gray-700">{category}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <h4 className="text-gray-900 mb-3">Max Price</h4>
                <div className="space-y-3">
                  <input
                    type="range"
                    min="0"
                    max="50000"
                    value={priceRange[1]}
                    onChange={(e) => setPriceRange([0, parseInt(e.target.value, 10)])}
                    className="w-full accent-[#16A34A]"
                  />
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>ETB {priceRange[0]}</span>
                    <span>ETB {priceRange[1].toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h4 className="text-gray-900 mb-3">Brand</h4>
                <div className="space-y-2 max-h-52 overflow-auto">
                  {brands.map((brand) => (
                    <label key={brand} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-[#16A34A] rounded focus:ring-[#16A34A]"
                        checked={selectedBrands.includes(brand)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedBrands([...selectedBrands, brand]);
                          } else {
                            setSelectedBrands(selectedBrands.filter((b) => b !== brand));
                          }
                        }}
                      />
                      <span className="text-gray-700">{brand}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <h4 className="text-gray-900 mb-3">Rating</h4>
                <select
                  value={minRating}
                  onChange={(e) => setMinRating(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-[#DCFCE7]"
                >
                  <option value={0}>All ratings</option>
                  <option value={4}>4★ & up</option>
                  <option value={3}>3★ & up</option>
                  <option value={2}>2★ & up</option>
                </select>
              </div>

              <label className="mb-6 flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-[#16A34A] rounded focus:ring-[#16A34A]"
                  checked={onlyAvailable}
                  onChange={(e) => setOnlyAvailable(e.target.checked)}
                />
                <span className="text-gray-700">In stock only</span>
              </label>

              <Button variant="primary" className="w-full" onClick={() => {
                setSelectedBrands([]);
                setSelectedCategories([]);
                setPriceRange([0, 50000]);
                setSearchTerm('');
                setMinRating(0);
                setOnlyAvailable(false);
              }}>
                Reset Filters
              </Button>
            </div>
          </aside>

          <main className="flex-1">
            <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <h2 className="text-2xl text-gray-900 mb-1">All Products</h2>
                  <p className="text-gray-600">{filteredProducts.length} products found</p>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search products..."
                    className="w-full sm:w-64 px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-[#DCFCE7]"
                  />
                  <span className="text-gray-700">Sort by:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-[#DCFCE7]"
                  >
                    <option value="popularity">Popularity</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="rating">Rating</option>
                  </select>
                </div>
              </div>

              {(selectedBrands.length > 0 || selectedCategories.length > 0) && (
                <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-gray-200">
                  <span className="text-sm text-gray-600">Active filters:</span>
                  {selectedBrands.map((brand) => (
                    <Badge key={brand} variant="success">{brand}</Badge>
                  ))}
                  {selectedCategories.map((category) => (
                    <Badge key={category} variant="info">{category}</Badge>
                  ))}
                </div>
              )}
            </div>

            {loading ? (
              <p className="text-gray-600">Loading products...</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 mb-8">
                {filteredProducts.map((product) => (
                  <div key={product.id} onClick={() => onNavigate('product-details', product)}>
                    <ProductCard
                      {...product}
                      onAddToCart={() => handleAddToCart(product.id)}
                      onToggleWishlist={() => toggleWishlist(product.id)}
                      isWishlisted={wishlist.includes(product.id)}
                    />
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
      {message && (
        <div className="fixed left-4 right-4 sm:left-auto sm:right-6 bottom-6 z-50 bg-gray-900 text-white px-4 py-2 rounded-xl shadow-lg text-center">
          {message}
        </div>
      )}
    </div>
  );
}
