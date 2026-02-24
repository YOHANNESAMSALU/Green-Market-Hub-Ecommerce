import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, Plus, Minus, ShoppingBag } from 'lucide-react';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { FrontendCartItem, getCartItems, removeCartItem, updateCartItemQuantity } from '../data/api';

interface CartProps {
  onNavigate: (page: string) => void;
  onCartChange?: () => void;
}

export function Cart({ onNavigate, onCartChange }: CartProps) {
  const [cartItems, setCartItems] = useState<FrontendCartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    getCartItems()
      .then((rows) => setCartItems(rows))
      .finally(() => setLoading(false));
  }, []);

  const showMessage = (value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(''), 1800);
  };

  const updateQuantity = async (id: string, change: number) => {
    const item = cartItems.find((row) => row.id === id);
    if (!item) return;

    const nextQuantity = Math.max(1, item.quantity + change);
    try {
      await updateCartItemQuantity(id, nextQuantity);
      setCartItems((prev) => prev.map((row) => (row.id === id ? { ...row, quantity: nextQuantity } : row)));
      onCartChange?.();
    } catch {
      showMessage('Could not update quantity');
    }
  };

  const removeItem = async (id: string) => {
    try {
      await removeCartItem(id);
      setCartItems((prev) => prev.filter((item) => item.id !== id));
      onCartChange?.();
    } catch {
      showMessage('Could not remove item');
    }
  };

  const subtotal = useMemo(() => cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0), [cartItems]);
  const shipping = subtotal > 3000 ? 0 : 150;
  const tax = subtotal * 0.15;
  const total = subtotal + shipping + tax;

  if (loading) {
    return <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-12 text-gray-600">Loading cart...</div>;
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-8">
          <button onClick={() => onNavigate('home')} className="hover:text-[#16A34A]">Home</button>
          <span>/</span>
          <span className="text-gray-900">Shopping Cart</span>
        </div>

        {cartItems.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-8 sm:p-16 text-center">
            <ShoppingBag className="w-24 h-24 text-gray-300 mx-auto mb-4" />
            <h2 className="text-2xl text-gray-900 mb-2">Your cart is empty</h2>
            <p className="text-gray-600 mb-8">Add some products to get started!</p>
            <Button variant="primary" onClick={() => onNavigate('products')}>Continue Shopping</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl shadow-sm">
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-2xl text-gray-900">Shopping Cart ({cartItems.length} items)</h2>
                </div>

                <div className="divide-y divide-gray-200">
                  {cartItems.map((item) => (
                    <div key={item.id} className="p-6">
                      <div className="flex flex-col sm:flex-row gap-6">
                        <div className="w-full sm:w-32 h-40 sm:h-32 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0">
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                        </div>

                        <div className="flex-1">
                          <div className="flex justify-between mb-2">
                            <h3 className="text-gray-900">{item.name}</h3>
                            <button onClick={() => removeItem(item.id)} className="text-red-500 hover:text-red-700">
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>

                          <div className="flex items-center gap-4 mb-4">
                            <Badge variant="info">Qty: {item.quantity}</Badge>
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => updateQuantity(item.id, -1)}
                                className="w-10 h-10 flex items-center justify-center border-2 border-gray-300 rounded-lg hover:border-[#16A34A]"
                              >
                                <Minus className="w-4 h-4" />
                              </button>
                              <span className="w-8 text-center">{item.quantity}</span>
                              <button
                                onClick={() => updateQuantity(item.id, 1)}
                                className="w-10 h-10 flex items-center justify-center border-2 border-gray-300 rounded-lg hover:border-[#16A34A]"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="text-left sm:text-right">
                              <div className="text-xl text-[#16A34A]">ETB {(item.price * item.quantity).toLocaleString()}</div>
                              <div className="text-sm text-gray-600">ETB {item.price.toLocaleString()} each</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-6 border-t border-gray-200">
                  <Button variant="outline" onClick={() => onNavigate('products')}>Continue Shopping</Button>
                </div>
              </div>
            </div>

            <div>
              <div className="bg-white rounded-2xl shadow-sm p-6 lg:sticky lg:top-24">
                <h3 className="text-xl text-gray-900 mb-6">Order Summary</h3>

                <div className="space-y-4 mb-6">
                  <div className="flex justify-between text-gray-700"><span>Subtotal</span><span>ETB {subtotal.toLocaleString()}</span></div>
                  <div className="flex justify-between text-gray-700">
                    <span>Shipping</span>
                    <span className={shipping === 0 ? 'text-[#16A34A]' : ''}>{shipping === 0 ? 'FREE' : `ETB ${shipping.toLocaleString()}`}</span>
                  </div>
                  <div className="flex justify-between text-gray-700"><span>Tax (15%)</span><span>ETB {tax.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
                  <div className="pt-4 border-t border-gray-200">
                    <div className="flex justify-between text-xl">
                      <span className="text-gray-900">Total</span>
                      <span className="text-[#16A34A]">ETB {total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                  </div>
                </div>

                <Button variant="primary" className="w-full mb-4" onClick={() => onNavigate('checkout')}>Proceed to Checkout</Button>
              </div>
            </div>
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
