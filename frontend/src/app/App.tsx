import React, { useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { Home } from './pages/Home';
import { ProductListing } from './pages/ProductListing';
import { ProductDetails } from './pages/ProductDetails';
import { Cart } from './pages/Cart';
import { Checkout } from './pages/Checkout';
import { Favorites } from './pages/Favorites';
import { Orders } from './pages/Orders';
import { SellerDashboard } from './pages/SellerDashboard';
import { Login } from './pages/Login';
import { SellerApplication } from './pages/SellerApplication';
import { Profile } from './pages/Profile';
import {
  AUTH_SESSION_TOKEN_KEY,
  AUTH_USER_KEY,
  FrontendAuthUser,
  getCartItems,
  getSessionUser,
  logout,
} from './data/api';

type Page =
  | 'home'
  | 'products'
  | 'product-details'
  | 'favorites'
  | 'profile'
  | 'orders'
  | 'cart'
  | 'checkout'
  | 'seller-dashboard'
  | 'become-seller'
  | 'login';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [cartItemCount, setCartItemCount] = useState(0);
  const [authUser, setAuthUser] = useState<FrontendAuthUser | null>(null);
  const [productFilters, setProductFilters] = useState<{ search?: string; category?: string } | null>(null);
  const [paymentNotice, setPaymentNotice] = useState('');

  const clearAuth = () => {
    localStorage.removeItem(AUTH_USER_KEY);
    localStorage.removeItem(AUTH_SESSION_TOKEN_KEY);
    setAuthUser(null);
  };

  const syncAuthUser = async () => {
    const token = localStorage.getItem(AUTH_SESSION_TOKEN_KEY);
    if (!token) {
      setAuthUser(null);
      return;
    }

    try {
      const session = await getSessionUser();
      setAuthUser(session.user);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(session.user));
    } catch {
      clearAuth();
    }
  };

  const refreshCartCount = () => {
    getCartItems()
      .then((items) => {
        const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
        setCartItemCount(totalItems);
      })
      .catch(() => {
        setCartItemCount(0);
      });
  };

  useEffect(() => {
    refreshCartCount();
    syncAuthUser();

    const params = new URLSearchParams(window.location.search);
    if (params.get('payment_provider') === 'chapa') {
      const paymentStatus = String(params.get('payment_status') || '').toUpperCase();
      if (paymentStatus === 'SUCCESS') {
        setPaymentNotice('Payment successful. Your order is confirmed.');
      } else if (paymentStatus) {
        setPaymentNotice(`Payment ${paymentStatus.toLowerCase()}. Please try again if needed.`);
      } else {
        setPaymentNotice('We could not confirm payment status yet.');
      }
      window.history.replaceState({}, document.title, window.location.pathname);
      setCurrentPage('orders');
    }
  }, []);

  useEffect(() => {
    const handleAuthChanged = () => {
      syncAuthUser();
      refreshCartCount();
    };

    window.addEventListener('markethub-auth-changed', handleAuthChanged);
    return () => {
      window.removeEventListener('markethub-auth-changed', handleAuthChanged);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // ignore and clear client auth anyway
    } finally {
      clearAuth();
      refreshCartCount();
      setCurrentPage('home');
    }
  };

  const handleNavigate = (page: string, data?: any) => {
    setCurrentPage(page as Page);

    if (page === 'products') {
      setProductFilters(data || null);
    }

    if (page === 'product-details' && data) {
      setSelectedProduct(data);
    }

    window.scrollTo(0, 0);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <Home onNavigate={handleNavigate} onCartChange={refreshCartCount} />;
      case 'products':
        return (
          <ProductListing
            onNavigate={handleNavigate}
            onCartChange={refreshCartCount}
            initialFilters={productFilters || undefined}
          />
        );
      case 'product-details':
        return <ProductDetails product={selectedProduct} onNavigate={handleNavigate} onCartChange={refreshCartCount} />;
      case 'cart':
        return <Cart onNavigate={handleNavigate} onCartChange={refreshCartCount} />;
      case 'favorites':
        return <Favorites onNavigate={handleNavigate} onCartChange={refreshCartCount} />;
      case 'profile':
        return (
          <Profile
            authUser={authUser}
            onNavigate={handleNavigate}
            onAuthUserUpdated={(user) => setAuthUser(user)}
          />
        );
      case 'orders':
        return (
          <Orders
            onNavigate={handleNavigate}
            authUser={authUser}
            onAuthUserUpdated={(user) => setAuthUser(user)}
          />
        );
      case 'checkout':
        return <Checkout onNavigate={handleNavigate} onCartChange={refreshCartCount} />;
      case 'seller-dashboard':
        return <SellerDashboard authUser={authUser} onNavigate={handleNavigate} />;
      case 'login':
        return (
          <Login
            onNavigate={handleNavigate}
            onAuthSuccess={(user) => {
              setAuthUser(user);
              refreshCartCount();
            }}
          />
        );
      case 'become-seller':
        return <SellerApplication authUser={authUser} onNavigate={handleNavigate} />;
      default:
        return <Home onNavigate={handleNavigate} />;
    }
  };

  const showNavbar = !['seller-dashboard'].includes(currentPage);

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {showNavbar && (
        <Navbar
          onNavigate={handleNavigate}
          cartItemCount={cartItemCount}
          authUser={authUser}
          onLogout={handleLogout}
        />
      )}
      {paymentNotice && (
        <div className="max-w-[1440px] mx-auto px-8 pt-4">
          <div className="bg-[#DCFCE7] text-[#166534] px-4 py-3 rounded-xl">
            {paymentNotice}
          </div>
        </div>
      )}
      {renderPage()}
    </div>
  );
}

export default App;
