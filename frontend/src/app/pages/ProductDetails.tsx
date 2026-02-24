import React, { useEffect, useMemo, useState } from 'react';
import { Star, Heart, ShoppingCart, Minus, Plus, Truck, Shield, RotateCcw } from 'lucide-react';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { ProductCard } from '../components/ProductCard';
import { addToCart, FrontendProduct, getProductById, getProducts } from '../data/api';

interface ProductDetailsProps {
  product?: FrontendProduct;
  onNavigate: (page: string, data?: any) => void;
  onCartChange?: () => void;
}

const WISHLIST_KEY = 'marketHubWishlist';

export function ProductDetails({ product, onNavigate, onCartChange }: ProductDetailsProps) {
  const [allProducts, setAllProducts] = useState<FrontendProduct[]>([]);
  const [currentProduct, setCurrentProduct] = useState<FrontendProduct | null>(product || null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState('M');
  const [selectedColor, setSelectedColor] = useState('Black');
  const [activeTab, setActiveTab] = useState('description');
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [isBuyingNow, setIsBuyingNow] = useState(false);

  useEffect(() => {
    getProducts().then((rows) => setAllProducts(rows));
  }, []);

  useEffect(() => {
    if (product?.id) {
      getProductById(product.id)
        .then((row) => setCurrentProduct(row))
        .catch(() => setCurrentProduct(product));
    }
  }, [product]);

  useEffect(() => {
    if (!currentProduct && allProducts.length) {
      setCurrentProduct(allProducts[0]);
    }
  }, [allProducts, currentProduct]);

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

  const relatedProducts = useMemo(() => {
    if (!currentProduct) return [];
    return allProducts.filter((p) => p.id !== currentProduct.id).slice(0, 4);
  }, [allProducts, currentProduct]);

  if (!currentProduct) {
    return <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-12 text-gray-600">Loading product...</div>;
  }

  const showMessage = (value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(''), 1800);
  };

  const addCurrentProductToCart = async () => {
    try {
      await addToCart(currentProduct.id, quantity);
      onCartChange?.();
      return true;
    } catch {
      showMessage('Could not add to cart');
      return false;
    }
  };

  const handleAddToCart = async () => {
    const added = await addCurrentProductToCart();
    if (added) {
      showMessage('Added to cart');
    }
  };

  const handleBuyNow = async () => {
    if (isBuyingNow) return;
    setIsBuyingNow(true);
    try {
      const added = await addCurrentProductToCart();
      if (added) {
        onNavigate('checkout');
      }
    } catch {
      showMessage('Could not start checkout');
    } finally {
      setIsBuyingNow(false);
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
          <button onClick={() => onNavigate('products')} className="hover:text-[#16A34A]">Products</button>
          <span>/</span>
          <span className="text-gray-900">{currentProduct.name}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 mb-12 lg:mb-16">
          <div>
            <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-6 lg:p-8 mb-4">
              <img
                src={currentProduct.images?.[selectedImage] || currentProduct.image}
                alt={currentProduct.name}
                className="w-full aspect-square object-cover rounded-xl"
              />
            </div>
            <div className="grid grid-cols-4 gap-2 sm:gap-4">
              {(currentProduct.images || [currentProduct.image]).map((img: string, idx: number) => (
                <button
                  key={idx}
                  onClick={() => setSelectedImage(idx)}
                  className={`bg-white rounded-xl shadow-sm p-2 ${selectedImage === idx ? 'ring-2 ring-[#16A34A]' : ''}`}
                >
                  <img src={img} alt={`Product ${idx + 1}`} className="w-full aspect-square object-cover rounded-lg" />
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="bg-white rounded-2xl shadow-sm p-6 sm:p-8">
              <h1 className="text-2xl sm:text-3xl text-gray-900 mb-4">{currentProduct.name}</h1>

              <div className="flex items-center gap-2 mb-6">
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-5 h-5 ${i < Math.floor(currentProduct.rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                    />
                  ))}
                </div>
                <span className="text-gray-600">{currentProduct.rating} ({currentProduct.reviews} reviews)</span>
              </div>

              <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-6">
                <span className="text-3xl sm:text-4xl text-[#16A34A]">ETB {currentProduct.price.toLocaleString()}</span>
                {currentProduct.originalPrice && (
                  <>
                    <span className="text-xl sm:text-2xl text-gray-400 line-through">ETB {currentProduct.originalPrice.toLocaleString()}</span>
                    <Badge variant="discount">-{currentProduct.discount}%</Badge>
                  </>
                )}
              </div>

              <div className="mb-6">
                <Badge variant="success">In Stock ({currentProduct.stock} available)</Badge>
              </div>

              <p className="text-gray-700 mb-6">{currentProduct.description}</p>

              <div className="mb-6">
                <label className="block text-gray-900 mb-3">Size</label>
                <div className="flex flex-wrap gap-3">
                  {['S', 'M', 'L', 'XL'].map((size) => (
                    <button
                      key={size}
                      onClick={() => setSelectedSize(size)}
                      className={`px-6 py-2 border-2 rounded-xl transition-colors ${
                        selectedSize === size ? 'border-[#16A34A] bg-[#DCFCE7] text-[#16A34A]' : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-gray-900 mb-3">Color</label>
                <div className="flex flex-wrap gap-3">
                  {['Black', 'White', 'Blue', 'Red'].map((color) => (
                    <button
                      key={color}
                      onClick={() => setSelectedColor(color)}
                      className={`px-6 py-2 border-2 rounded-xl transition-colors ${
                        selectedColor === color ? 'border-[#16A34A] bg-[#DCFCE7] text-[#16A34A]' : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-8">
                <label className="block text-gray-900 mb-3">Quantity</label>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-12 h-12 flex items-center justify-center border-2 border-gray-300 rounded-xl hover:border-[#16A34A]"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <span className="text-xl w-12 text-center">{quantity}</span>
                  <button
                    onClick={() => setQuantity(Math.min(currentProduct.stock, quantity + 1))}
                    className="w-12 h-12 flex items-center justify-center border-2 border-gray-300 rounded-xl hover:border-[#16A34A]"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <Button variant="primary" size="lg" className="flex-1" onClick={handleAddToCart}>
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  Add to Cart
                </Button>
                <Button variant="secondary" size="lg" className="flex-1" onClick={handleBuyNow} disabled={isBuyingNow}>
                  {isBuyingNow ? 'Processing...' : 'Buy Now'}
                </Button>
                <button
                  onClick={() => toggleWishlist(currentProduct.id)}
                  className="w-full sm:w-14 h-14 flex items-center justify-center border-2 border-gray-300 rounded-xl hover:border-[#16A34A] hover:bg-[#DCFCE7]"
                >
                  <Heart className={`w-6 h-6 ${wishlist.includes(currentProduct.id) ? 'fill-red-500 text-red-500' : ''}`} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-gray-200">
                <div className="flex flex-col items-center text-center">
                  <Truck className="w-8 h-8 text-[#16A34A] mb-2" />
                  <span className="text-sm text-gray-700">Free Shipping</span>
                </div>
                <div className="flex flex-col items-center text-center">
                  <Shield className="w-8 h-8 text-[#16A34A] mb-2" />
                  <span className="text-sm text-gray-700">Secure Payment</span>
                </div>
                <div className="flex flex-col items-center text-center">
                  <RotateCcw className="w-8 h-8 text-[#16A34A] mb-2" />
                  <span className="text-sm text-gray-700">Easy Returns</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-6 mt-6">
              <h3 className="text-gray-900 mb-4">Seller Information</h3>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-900">{currentProduct.seller}</p>
                  <p className="text-sm text-gray-600">Marketplace Seller</p>
                </div>
                <Button variant="outline" size="sm">Visit Store</Button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm mb-16">
          <div className="flex flex-wrap border-b border-gray-200">
            <button
              onClick={() => setActiveTab('description')}
              className={`px-6 py-4 transition-colors ${activeTab === 'description' ? 'text-[#16A34A] border-b-2 border-[#16A34A]' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Description
            </button>
            <button
              onClick={() => setActiveTab('reviews')}
              className={`px-6 py-4 transition-colors ${activeTab === 'reviews' ? 'text-[#16A34A] border-b-2 border-[#16A34A]' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Reviews ({currentProduct.reviews})
            </button>
            <button
              onClick={() => setActiveTab('shipping')}
              className={`px-6 py-4 transition-colors ${activeTab === 'shipping' ? 'text-[#16A34A] border-b-2 border-[#16A34A]' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Shipping Info
            </button>
          </div>

          <div className="p-8">
            {activeTab === 'description' && (
              <div>
                <h3 className="text-gray-900 mb-4">Product Description</h3>
                <p className="text-gray-700 mb-4">{currentProduct.description}</p>
              </div>
            )}

            {activeTab === 'reviews' && (
              <p className="text-gray-700">No reviews yet.</p>
            )}

            {activeTab === 'shipping' && (
              <div>
                <h3 className="text-gray-900 mb-4">Shipping Information</h3>
                <ul className="space-y-3 text-gray-700">
                  <li className="flex items-start gap-2"><span className="text-[#16A34A]">✓</span><span>Free standard shipping on orders over ETB 3,000</span></li>
                  <li className="flex items-start gap-2"><span className="text-[#16A34A]">✓</span><span>Express shipping available for an additional fee</span></li>
                </ul>
              </div>
            )}
          </div>
        </div>

        <section>
          <h2 className="text-2xl text-gray-900 mb-6">Related Products</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {relatedProducts.map((related) => (
              <div key={related.id} onClick={() => onNavigate('product-details', related)}>
                <ProductCard
                  {...related}
                  onAddToCart={() =>
                    addToCart(related.id, 1)
                      .then(() => {
                        onCartChange?.();
                        showMessage('Added to cart');
                      })
                      .catch(() => showMessage('Could not add to cart'))
                  }
                  onToggleWishlist={() => toggleWishlist(related.id)}
                  isWishlisted={wishlist.includes(related.id)}
                />
              </div>
            ))}
          </div>
        </section>
      </div>
      {message && (
        <div className="fixed left-4 right-4 sm:left-auto sm:right-6 bottom-6 z-50 bg-gray-900 text-white px-4 py-2 rounded-xl shadow-lg text-center">
          {message}
        </div>
      )}
    </div>
  );
}
