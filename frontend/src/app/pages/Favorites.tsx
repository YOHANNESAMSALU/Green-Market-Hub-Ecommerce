import React, { useEffect, useMemo, useState } from 'react';
import { Heart } from 'lucide-react';
import { Button } from '../components/Button';
import { ProductCard } from '../components/ProductCard';
import { addToCart, FrontendProduct, getProducts } from '../data/api';

interface FavoritesProps {
  onNavigate: (page: string, data?: any) => void;
  onCartChange?: () => void;
}

const WISHLIST_KEY = 'marketHubWishlist';

const loadWishlistIds = (): string[] => {
  const stored = localStorage.getItem(WISHLIST_KEY);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

export function Favorites({ onNavigate, onCartChange }: FavoritesProps) {
  const [products, setProducts] = useState<FrontendProduct[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setWishlist(loadWishlistIds());
    getProducts()
      .then((rows) => setProducts(rows))
      .finally(() => setLoading(false));
  }, []);

  const favoriteProducts = useMemo(
    () => products.filter((product) => wishlist.includes(product.id)),
    [products, wishlist],
  );

  const showMessage = (value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(''), 1800);
  };

  const handleAddToCart = async (productId: string) => {
    try {
      await addToCart(productId, 1);
      onCartChange?.();
      showMessage('Added to cart');
    } catch (err) {
      showMessage((err as any)?.message || 'Could not add to cart');
    }
  };

  const toggleWishlist = (productId: string) => {
    const next = wishlist.includes(productId)
      ? wishlist.filter((id) => id !== productId)
      : [...wishlist, productId];
    setWishlist(next);
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(next));
  };

  if (loading) {
    return <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-12 text-gray-600">Loading favorites...</div>;
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-8">
          <button onClick={() => onNavigate('home')} className="hover:text-[#16A34A]">Home</button>
          <span>/</span>
          <span className="text-gray-900">Favorites</span>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6 mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl text-gray-900">My Wishlist ({favoriteProducts.length})</h1>
          <Button variant="outline" onClick={() => onNavigate('products')}>Browse Products</Button>
        </div>

        {favoriteProducts.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 sm:p-16 text-center">
            <Heart className="w-24 h-24 text-gray-300 mx-auto mb-4" />
            <h2 className="text-2xl text-gray-900 mb-2">No favorites yet</h2>
            <p className="text-gray-600 mb-8">Save products you love and find them here.</p>
            <Button variant="primary" onClick={() => onNavigate('products')}>Start Shopping</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {favoriteProducts.map((product) => (
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
      </div>

      {message && (
        <div className="fixed left-4 right-4 sm:left-auto sm:right-6 bottom-6 z-50 bg-gray-900 text-white px-4 py-2 rounded-xl shadow-lg text-center">
          {message}
        </div>
      )}
    </div>
  );
}
