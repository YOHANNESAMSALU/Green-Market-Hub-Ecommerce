import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import { Button } from '../components/Button';

import {
  addToCart,
  FrontendCategory,
  FrontendProduct,
  getCategories,
  getProducts,
  getPromoBannerSettings,
} from '../data/api';

interface HomeProps {
  onNavigate: (page: string, data?: any) => void;
  onCartChange?: () => void;
}

const WISHLIST_KEY = 'marketHubWishlist';

export function Home({ onNavigate, onCartChange }: HomeProps) {
  const [products, setProducts] = useState<FrontendProduct[]>([]);
  const [categories, setCategories] = useState<FrontendCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [promoBannerImage, setPromoBannerImage] = useState('');

  useEffect(() => {
    Promise.all([getProducts(), getCategories()])
      .then(([productRows, categoryRows]) => {
        setProducts(productRows);
        setCategories(categoryRows);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getPromoBannerSettings()
      .then((data) => setPromoBannerImage(data.image || ''))
      .catch(() => setPromoBannerImage(''));
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

  const newArrivals = useMemo(() => products.slice(0, 4), [products]);
  const flashSaleProducts = useMemo(
    () => [...products].sort((a, b) => (b.discount || 0) - (a.discount || 0)).slice(0, 4),
    [products],
  );
  const featuredProducts = useMemo(
    () => [...products]
      .sort((a, b) => ((b.discount || 0) + b.price * 0.001) - ((a.discount || 0) + a.price * 0.001))
      .slice(0, 8),
    [products],
  );

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <section
        className="bg-gradient-to-r from-[#16A34A] to-[#15803D] text-white"
        style={
          promoBannerImage
            ? {
                backgroundImage: `linear-gradient(rgba(00, 00, 00, 0.5), rgba(21, 128, 61, 0)), url(${promoBannerImage})`,
                backgroundPosition: 'center',
                backgroundSize: 'cover',
              }
            : undefined
        }
      >
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 lg:py-16">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-10">
            <div className="max-w-xl">
              <h1 className="text-4xl sm:text-4xl lg:text-5xl mb-4">Summer Sale is Here!</h1>
              <p className="text-base sm:text-lg lg:text-xl mb-8 text-green-50">
                Get up to 50% off on selected items. Shop now and save big!
              </p>
              <div className="promo-btn-container">
  <Button 
    variant="secondary" 
    size="lg" 
    onClick={() => onNavigate('products', {})}
    className="promo-btn-inner border-none shadow-none"
  >
    Shop Now
    <ChevronRight className="w-5 h-5 ml-2" />
  </Button>
</div>

            </div>
            <div className="hidden lg:block">
              <img
                src="https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=600"
                alt="Shopping"
                className="w-96 h-96 object-cover rounded-3xl"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 lg:py-16">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
          <h2 className="text-2xl sm:text-3xl text-gray-900">Shop by Category</h2>
          <button
            onClick={() => onNavigate('products', {})}
            className="text-[#16A34A] hover:text-[#15803D] flex items-center gap-2"
          >
            View All
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <p className="text-gray-600">Loading categories...</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-4 sm:gap-6">
            {categories.map((category) => (
              <button key={category.id} onClick={() => onNavigate('products', { category: category.name })} className="group">
                <div className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-all">
                  <img
                    src={category.image}
                    alt={category.name}
                    className="w-full aspect-square object-cover rounded-xl mb-3"
                  />
                  <p className="text-center text-gray-900 group-hover:text-[#16A34A]">{category.name}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 lg:py-16">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
          <h2 className="text-2xl sm:text-3xl text-gray-900">New Arrivals</h2>
          <button
            onClick={() => onNavigate('products', {})}
            className="text-[#16A34A] hover:text-[#15803D] flex items-center gap-2"
          >
            View All
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <p className="text-gray-600">Loading products...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-12">
            {newArrivals.map((product) => (
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

        <div className="bg-gradient-to-r from-orange-500 to-red-500 rounded-3xl p-6 sm:p-8 text-white mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <h2 className="text-2xl sm:text-3xl mb-2">Flash Sale</h2>
              <p className="text-base sm:text-xl">Hurry up! Limited time offers</p>
            </div>
            <div className="flex gap-3 sm:gap-4">
              <div className="bg-white/20 rounded-xl p-4 text-center backdrop-blur">
                <div className="text-3xl">12</div>
                <div className="text-sm">Hours</div>
              </div>
              <div className="bg-white/20 rounded-xl p-4 text-center backdrop-blur">
                <div className="text-3xl">34</div>
                <div className="text-sm">Minutes</div>
              </div>
              <div className="bg-white/20 rounded-xl p-4 text-center backdrop-blur">
                <div className="text-3xl">56</div>
                <div className="text-sm">Seconds</div>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-gray-600">Loading products...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {flashSaleProducts.map((product) => (
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
      </section>

      <section className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 lg:py-16">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
          <h2 className="text-2xl sm:text-3xl text-gray-900">Featured Products</h2>
          <button
            onClick={() => onNavigate('products', {})}
            className="text-[#16A34A] hover:text-[#15803D] flex items-center gap-2"
          >
            View All
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <p className="text-gray-600">Loading products...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {featuredProducts.map((product) => (
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
      </section>

      {message && (
        <div className="fixed left-4 right-4 sm:left-auto sm:right-6 bottom-6 z-50 bg-gray-900 text-white px-4 py-2 rounded-xl shadow-lg text-center">
          {message}
        </div>
      )}

      <footer className="bg-gray-900 text-white mt-16">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="text-2xl text-[#16A34A] mb-4">MarketHub</h3>
              <p className="text-gray-400">
                Your trusted multi-vendor marketplace for quality products at great prices.
              </p>
            </div>
            <div>
              <h4 className="mb-4">Shop</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white">All Products</a></li>
                <li><a href="#" className="hover:text-white">Categories</a></li>
                <li><a href="#" className="hover:text-white">Flash Sales</a></li>
                <li><a href="#" className="hover:text-white">New Arrivals</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4">Customer Service</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white">Contact Us</a></li>
                <li><a href="#" className="hover:text-white">Shipping Info</a></li>
                <li><a href="#" className="hover:text-white">Returns</a></li>
                <li><a href="#" className="hover:text-white">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4">Sell With Us</h4>
              <ul className="space-y-2 text-gray-400">
                <li><button onClick={() => onNavigate('become-seller')} className="hover:text-white">Become a Seller</button></li>
                <li><button onClick={() => onNavigate('seller-dashboard')} className="hover:text-white">Seller Dashboard</button></li>
                
                <li><a href="#" className="hover:text-white">Seller Guidelines</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-gray-400">
            <p>&copy; 2026 MarketHub. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
