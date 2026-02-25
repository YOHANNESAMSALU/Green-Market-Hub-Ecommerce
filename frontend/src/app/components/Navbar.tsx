import React, { useEffect, useRef, useState } from 'react';
import { Search, ShoppingCart, User, Menu, Heart, Package } from 'lucide-react';
import { Button } from './Button';
import { FrontendAuthUser } from '../data/api';

interface NavbarProps {
  onNavigate?: (page: string, data?: any) => void;
  cartItemCount?: number;
  authUser?: FrontendAuthUser | null;
  onLogout?: () => void;
}

export function Navbar({ onNavigate, cartItemCount = 0, authUser, onLogout }: NavbarProps) {
  const [search, setSearch] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const liveSearchTimerRef = useRef<number | null>(null);
  const hasTypedRef = useRef(false);
  const onNavigateRef = useRef(onNavigate);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onNavigate?.('products', { search: search.trim() });
    setIsMobileMenuOpen(false);
  };

  const navigateAndClose = (page: string, data?: any) => {
    if (page === 'home') {
      hasTypedRef.current = false;
    }
    onNavigate?.(page, data);
    setIsMobileMenuOpen(false);
  };

  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);

  useEffect(() => {
    if (!hasTypedRef.current) return;
    if (liveSearchTimerRef.current) {
      window.clearTimeout(liveSearchTimerRef.current);
    }
    liveSearchTimerRef.current = window.setTimeout(() => {
      onNavigateRef.current?.('products', { search: search.trim() });
    }, 250);
    return () => {
      if (liveSearchTimerRef.current) {
        window.clearTimeout(liveSearchTimerRef.current);
      }
    };
  }, [search]);

  return (
    <nav className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <button
            onClick={() => navigateAndClose('home')}
            className="text-xl md:text-2xl text-[#16A34A] hover:text-[#15803D] transition-colors"
          >
            MarketHub
          </button>

          {/* Search Bar */}
          <div className="hidden md:block flex-1 max-w-2xl mx-6 lg:mx-16">
            <form className="relative" onSubmit={submitSearch}>
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search for products..."
                value={search}
                onChange={(e) => {
                  hasTypedRef.current = true;
                  setSearch(e.target.value);
                }}
                className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-[#DCFCE7] transition-all"
              />
            </form>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden md:flex items-center gap-4">
              {authUser ? (
                <>
                  <img
                    src={authUser.image || 'https://via.placeholder.com/40?text=U'}
                    alt={authUser.name}
                    className="w-10 h-10 rounded-full object-cover border border-gray-200"
                  />
                  <div className="hidden lg:flex flex-col items-end leading-tight">
                    <span className="text-sm text-gray-900">{authUser.name}</span>
                    <span className="text-xs text-gray-500">{String(authUser.role || '').toUpperCase()}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => navigateAndClose('profile')}>
                    <User className="w-5 h-5 mr-2" />
                    Profile
                  </Button>
                  <Button variant="outline" size="sm" onClick={onLogout}>
                    Logout
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => navigateAndClose('login')}>
                  <User className="w-5 h-5 mr-2" />
                  Login
                </Button>
              )}

              {authUser && (
                <Button variant="ghost" size="sm" onClick={() => navigateAndClose('favorites')}>
                  <Heart className="w-5 h-5 mr-2" />
                  Favorites
                </Button>
              )}

              <Button variant="ghost" size="sm" onClick={() => navigateAndClose('orders')}>
                <Package className="w-5 h-5 mr-2" />
                Orders
              </Button>
              <Button variant="ghost" size="sm" onClick={() => navigateAndClose('checkout')}>
                Checkout
              </Button>
            </div>

            <button
              onClick={() => navigateAndClose('cart')}
              className="relative p-2 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <ShoppingCart className="w-6 h-6 text-gray-700" />
              {authUser && cartItemCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#16A34A] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                  {cartItemCount}
                </span>
              )}
            </button>

            <button
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors md:hidden"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle mobile menu"
              aria-expanded={isMobileMenuOpen}
            >
              <Menu className="w-6 h-6 text-gray-700" />
            </button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-gray-100 py-3">
            <div className="px-1 pb-2">
              <form className="relative" onSubmit={submitSearch}>
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search for products..."
                  value={search}
                  onChange={(e) => {
                    hasTypedRef.current = true;
                    setSearch(e.target.value);
                  }}
                  className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-[#DCFCE7] transition-all"
                />
              </form>
            </div>
            <div className="flex flex-col gap-2">
              {authUser ? (
                <div className="px-2 py-2">
                  <p className="text-sm text-gray-900">{authUser.name}</p>
                  <p className="text-xs text-gray-500">{String(authUser.role || '').toUpperCase()}</p>
                </div>
              ) : null}

              {authUser ? (
                <button
                  className="text-left px-3 py-2 rounded-lg hover:bg-gray-100"
                  onClick={() => navigateAndClose('profile')}
                >
                  Profile
                </button>
              ) : (
                <button
                  className="text-left px-3 py-2 rounded-lg hover:bg-gray-100"
                  onClick={() => navigateAndClose('login')}
                >
                  Login
                </button>
              )}

              {authUser && (
                <button
                  className="text-left px-3 py-2 rounded-lg hover:bg-gray-100"
                  onClick={() => navigateAndClose('favorites')}
                >
                  Favorites
                </button>
              )}
              <button
                className="text-left px-3 py-2 rounded-lg hover:bg-gray-100"
                onClick={() => navigateAndClose('orders')}
              >
                Orders
              </button>
              <button
                className="text-left px-3 py-2 rounded-lg hover:bg-gray-100"
                onClick={() => navigateAndClose('checkout')}
              >
                Checkout
              </button>
              <button
                className="text-left px-3 py-2 rounded-lg hover:bg-gray-100"
                onClick={() => navigateAndClose('cart')}
              >
                Cart
              </button>
              {authUser && (
                <button
                  className="text-left px-3 py-2 rounded-lg hover:bg-gray-100 text-red-600"
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onLogout?.();
                  }}
                >
                  Logout
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
