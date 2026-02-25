import React, { useEffect, useMemo, useState } from "react";
import {
  CreditCard,
  CheckCircle,
} from "lucide-react";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Badge } from "../components/Badge";
import { FrontendCartItem, getCartItems, placeOrder } from "../data/api";

interface CheckoutProps {
  onNavigate: (page: string) => void;
  onCartChange?: () => void;
}

export function Checkout({ onNavigate, onCartChange }: CheckoutProps) {
  const [shippingMethod, setShippingMethod] = useState("standard");
  const [paymentMethod, setPaymentMethod] = useState("chapa");
  const [cartItems, setCartItems] = useState<FrontendCartItem[]>([]);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [error, setError] = useState("");
  const [orderSuccess, setOrderSuccess] = useState<{
    orderId: string;
    totalAmount: number;
  } | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    street: "",
    city: "",
    subCity: "",
    region: "",
    country: "Ethiopia",
  });

  useEffect(() => {
    getCartItems().then((rows) => setCartItems(rows));
  }, []);

  const subtotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cartItems],
  );
  const shipping = shippingMethod === "express" ? 250 : 150;
  const tax = subtotal * 0.15;
  const total = subtotal + shipping + tax;

  const handlePlaceOrder = async () => {
    setError("");

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("First name and last name are required.");
      return;
    }
    if (!form.phone.trim() || !form.city.trim() || !form.street.trim()) {
      setError("Phone, city, and street address are required.");
      return;
    }
    if (!cartItems.length) {
      setError("Your cart is empty.");
      return;
    }

    setPlacingOrder(true);
    try {
      const result = await placeOrder({
        shippingMethod,
        paymentMethod,
        shippingAddress: {
          fullName: `${form.firstName.trim()} ${form.lastName.trim()}`,
          email: form.email.trim(),
          phone: form.phone.trim(),
          city: form.city.trim(),
          subCity: form.subCity.trim(),
          region: form.region.trim(),
          details: `${form.street.trim()}${form.country.trim() ? `, ${form.country.trim()}` : ""}`,
        },
      });

      if (result.payment?.provider === "CHAPA" && result.payment.checkoutUrl) {
        window.location.href = result.payment.checkoutUrl;
        return;
      }

      setCartItems([]);
      onCartChange?.();
      setOrderSuccess({
        orderId: result.orderId,
        totalAmount: result.totalAmount,
      });
    } catch (err: any) {
      const message =
        typeof err?.message === "string" && err.message.includes("CHAPA_SECRET_KEY")
          ? "Chapa test mode is not configured. Set CHAPA_SECRET_KEY in backend .env."
          : "Could not place order. Please try again.";
      setError(message);
    } finally {
      setPlacingOrder(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-8">
          <button
            onClick={() => onNavigate("home")}
            className="hover:text-[#16A34A]"
          >
            Home
          </button>
          <span>/</span>
          <button
            onClick={() => onNavigate("cart")}
            className="hover:text-[#16A34A]"
          >
            Cart
          </button>
          <span>/</span>
          <span className="text-gray-900">Checkout</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl text-gray-900">Shipping Address</h2>
                <Badge variant="success">Step 1 of 3</Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                
                  label="First Name"
                  placeholder="John"
                  value={form.firstName}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, firstName: e.target.value }))
                  }
                />
                <Input
                  label="Last Name"
                  placeholder="Doe"
                  value={form.lastName}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, lastName: e.target.value }))
                  }
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Email Address (Optional)"
                    type="email"
                    placeholder="john@example.com"
                    value={form.email}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, email: e.target.value }))
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    label="Phone Number"
                    type="tel"
                    placeholder="+251 9XX XXX XXX"
                    value={form.phone}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, phone: e.target.value }))
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    label="Street Address"
                    placeholder="123 Main Street"
                    value={form.street}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, street: e.target.value }))
                    }
                  />
                </div>
                <Input
                  label="City"
                  placeholder="Addis Ababa"
                  value={form.city}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, city: e.target.value }))
                  }
                />
                <Input
                  label="Sub City"
                  placeholder="Bole"
                  value={form.subCity}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, subCity: e.target.value }))
                  }
                />
                <Input
                  label="Region"
                  placeholder="Addis Ababa"
                  value={form.region}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, region: e.target.value }))
                  }
                />
                <Input
                  label="Country"
                  placeholder="Ethiopia"
                  value={form.country}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, country: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl text-gray-900">Shipping Method</h2>
                <Badge variant="success">Step 2 of 3</Badge>
              </div>

              <div className="space-y-3">
                <label
                  className={`flex items-center justify-between p-4 border-2 rounded-xl cursor-pointer transition-colors ${shippingMethod === "standard" ? "border-[#16A34A] bg-[#DCFCE7]" : "border-gray-300 hover:border-gray-400"}`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="shipping"
                      value="standard"
                      checked={shippingMethod === "standard"}
                      onChange={(e) => setShippingMethod(e.target.value)}
                      className="w-4 h-4 text-[#16A34A]"
                    />
                    <div>
                      <p className="text-gray-900">Standard Shipping</p>
                      <p className="text-sm text-gray-600">
                        Delivery in 5-7 business days
                      </p>
                    </div>
                  </div>
                  <span className="text-[#16A34A]">ETB 150</span>
                </label>

                <label
                  className={`flex items-center justify-between p-4 border-2 rounded-xl cursor-pointer transition-colors ${shippingMethod === "express" ? "border-[#16A34A] bg-[#DCFCE7]" : "border-gray-300 hover:border-gray-400"}`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="shipping"
                      value="express"
                      checked={shippingMethod === "express"}
                      onChange={(e) => setShippingMethod(e.target.value)}
                      className="w-4 h-4 text-[#16A34A]"
                    />
                    <div>
                      <p className="text-gray-900">Express Shipping</p>
                      <p className="text-sm text-gray-600">
                        Delivery in 2-3 business days
                      </p>
                    </div>
                  </div>
                  <span className="text-[#16A34A]">ETB 250</span>
                </label>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl text-gray-900">Payment Method</h2>
                <Badge variant="success">Step 3 of 3</Badge>
              </div>

              <div className="space-y-3">
                <label
                  className={`flex items-center justify-between p-4 border-2 rounded-xl cursor-pointer transition-colors ${paymentMethod === "chapa" ? "border-[#16A34A] bg-[#DCFCE7]" : "border-gray-300 hover:border-gray-400"}`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="payment"
                      value="chapa"
                      checked={paymentMethod === "chapa"}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-4 h-4 text-[#16A34A]"
                    />
                    <CreditCard className="w-6 h-6 text-gray-600" />
                    <div>
                      <p className="text-gray-900">Chapa Payment</p>
                      <p className="text-sm text-gray-600">
                        Pay securely with Chapa
                      </p>
                    </div>
                  </div>
                </label>

                {/* <label
                  className={`flex items-center justify-between p-4 border-2 rounded-xl cursor-pointer transition-colors ${paymentMethod === "mobile" ? "border-[#16A34A] bg-[#DCFCE7]" : "border-gray-300 hover:border-gray-400"}`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="payment"
                      value="mobile"
                      checked={paymentMethod === "mobile"}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-4 h-4 text-[#16A34A]"
                    />
                    <Smartphone className="w-6 h-6 text-gray-600" />
                    <div>
                      <p className="text-gray-900">Mobile Money</p>
                      <p className="text-sm text-gray-600">
                        M-Pesa, Airtel Money, etc.
                      </p>
                    </div>
                  </div>
                </label>

                <label
                  className={`flex items-center justify-between p-4 border-2 rounded-xl cursor-pointer transition-colors ${paymentMethod === "bank" ? "border-[#16A34A] bg-[#DCFCE7]" : "border-gray-300 hover:border-gray-400"}`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="payment"
                      value="bank"
                      checked={paymentMethod === "bank"}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-4 h-4 text-[#16A34A]"
                    />
                    <Building2 className="w-6 h-6 text-gray-600" />
                    <div>
                      <p className="text-gray-900">Bank Transfer</p>
                      <p className="text-sm text-gray-600">
                        Direct bank transfer
                      </p>
                    </div>
                  </div>
                </label>

                <label
                  className={`flex items-center justify-between p-4 border-2 rounded-xl cursor-pointer transition-colors ${paymentMethod === "cod" ? "border-[#16A34A] bg-[#DCFCE7]" : "border-gray-300 hover:border-gray-400"}`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="payment"
                      value="cod"
                      checked={paymentMethod === "cod"}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-4 h-4 text-[#16A34A]"
                    />
                    <Banknote className="w-6 h-6 text-gray-600" />
                    <div>
                      <p className="text-gray-900">Cash on Delivery</p>
                      <p className="text-sm text-gray-600">
                        Pay when you receive
                      </p>
                    </div>
                  </div>
                </label> */}
              </div>
            </div>
          </div>

          <div>
            <div className="bg-white rounded-2xl shadow-sm p-6 lg:sticky lg:top-24">
              <h3 className="text-xl text-gray-900 mb-6">Order Summary</h3>

              <div className="space-y-4 mb-6 pb-6 border-b border-gray-200">
                {cartItems.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <div>
                      <p className="text-gray-900">{item.name}</p>
                      {item.selectedVariant?.title && (
                        <p className="text-xs text-blue-700">{item.selectedVariant.title}</p>
                      )}
                      <p className="text-sm text-gray-600">
                        Qty: {item.quantity}
                      </p>
                    </div>
                    <span className="text-gray-900">
                      ETB {(item.price * item.quantity).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-3 mb-6 pb-6 border-b border-gray-200">
                <div className="flex justify-between text-gray-700">
                  <span>Subtotal</span>
                  <span>ETB {subtotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>Shipping</span>
                  <span>ETB {shipping.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>Tax (15%)</span>
                  <span>
                    ETB{" "}
                    {tax.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </div>
              </div>

              <div className="flex justify-between text-xl mb-6">
                <span className="text-gray-900">Total</span>
                <span className="text-[#16A34A]">
                  ETB{" "}
                  {total.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>

              <Button
                variant="primary"
                className="w-full mb-4"
                onClick={handlePlaceOrder}
                disabled={placingOrder || cartItems.length === 0}
              >
                <CheckCircle className="w-5 h-5 mr-2" />
                {placingOrder ? "Placing Order..." : "Place Order"}
              </Button>

              {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

              {orderSuccess && (
                <div className="bg-[#DCFCE7] border border-[#86EFAC] rounded-xl p-4">
                  <p className="text-[#166534] mb-1">
                    Order placed successfully.
                  </p>
                  <p className="text-sm text-[#166534]">
                    Order #{orderSuccess.orderId.slice(0, 8)} | ETB{" "}
                    {orderSuccess.totalAmount.toLocaleString()}
                  </p>
                  <div className="mt-3">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onNavigate("orders")}
                      >
                        View Orders
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onNavigate("home")}
                      >
                        Continue Shopping
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
