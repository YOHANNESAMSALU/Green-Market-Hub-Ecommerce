import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  const homeRootRef = useRef<HTMLDivElement>(null);
  const CATEGORY_SLIDE_INTERVAL_MS = 2800;
  const [products, setProducts] = useState<FrontendProduct[]>([]);
  const [categories, setCategories] = useState<FrontendCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [promoBannerImage, setPromoBannerImage] = useState('');
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [categorySlideIndex, setCategorySlideIndex] = useState(0);
  const [visibleCategoryCount, setVisibleCategoryCount] = useState(4);
  const [isCategorySliderPaused, setIsCategorySliderPaused] = useState(false);
  const [showAllNewArrivals, setShowAllNewArrivals] = useState(false);
  const [showAllFeatured, setShowAllFeatured] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [isSmallPhone, setIsSmallPhone] = useState(false);
  const [isTinyPhone, setIsTinyPhone] = useState(false);
  const [deferDealsSections, setDeferDealsSections] = useState(false);
  const [newArrivalsSlideIndex, setNewArrivalsSlideIndex] = useState(0);
  const [flashSaleSlideIndex, setFlashSaleSlideIndex] = useState(0);
  const [featuredSlideIndex, setFeaturedSlideIndex] = useState(0);

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

  useEffect(() => {
    const updateVisibleCategoryCount = () => {
      const width = window.innerWidth;
      setIsSmallPhone(width < 425);
      setIsTinyPhone(width < 400);
      if (width < 640) {
        setVisibleCategoryCount(1);
      } else if (width < 768) {
        setVisibleCategoryCount(2);
      } else if (width < 1024) {
        setVisibleCategoryCount(3);
      } else {
        setVisibleCategoryCount(4);
      }
    };

    updateVisibleCategoryCount();
    window.addEventListener('resize', updateVisibleCategoryCount);
    return () => window.removeEventListener('resize', updateVisibleCategoryCount);
  }, []);

  useEffect(() => {
    if (!isSmallPhone) {
      setDeferDealsSections(false);
      return;
    }
    setDeferDealsSections(true);
    const timer = window.setTimeout(() => setDeferDealsSections(false), 260);
    return () => window.clearTimeout(timer);
  }, [isSmallPhone]);

  useEffect(() => {
    const updateScrollProgress = () => {
      const doc = document.documentElement;
      const maxScroll = doc.scrollHeight - window.innerHeight;
      if (maxScroll <= 0) {
        setScrollProgress(0);
        setScrollY(0);
        return;
      }
      setScrollY(window.scrollY);
      setScrollProgress(Math.min(1, Math.max(0, window.scrollY / maxScroll)));
    };

    updateScrollProgress();
    window.addEventListener('scroll', updateScrollProgress, { passive: true });
    window.addEventListener('resize', updateScrollProgress);
    return () => {
      window.removeEventListener('scroll', updateScrollProgress);
      window.removeEventListener('resize', updateScrollProgress);
    };
  }, []);

  useEffect(() => {
    const root = homeRootRef.current;
    if (!root) return;
    const revealRows = Array.from(root.querySelectorAll<HTMLElement>('[data-scroll-reveal]'));
    if (!revealRows.length) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || isSmallPhone) {
      revealRows.forEach((row) => row.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          (entry.target as HTMLElement).classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.16, rootMargin: '0px 0px -8% 0px' },
    );

    revealRows.forEach((row, index) => {
      row.style.setProperty('--reveal-delay', `${Math.min(index * 70, 280)}ms`);
      observer.observe(row);
    });

    return () => observer.disconnect();
  }, [isSmallPhone]);

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

  const sortedCategories = useMemo(() => {
    const productCounts = new Map<string, number>();
    for (const product of products) {
      const key = String(product.category || '').trim().toLowerCase();
      if (!key) continue;
      productCounts.set(key, (productCounts.get(key) || 0) + 1);
    }

    return [...categories].sort((a, b) => {
      const aCount = productCounts.get(String(a.name || '').trim().toLowerCase()) || 0;
      const bCount = productCounts.get(String(b.name || '').trim().toLowerCase()) || 0;
      if (aCount !== bCount) return bCount - aCount;
      return a.name.localeCompare(b.name);
    });
  }, [categories, products]);

  useEffect(() => {
    setCategorySlideIndex(0);
  }, [sortedCategories.length, showAllCategories, visibleCategoryCount]);

  useEffect(() => {
    if (showAllCategories || isCategorySliderPaused || sortedCategories.length <= visibleCategoryCount) return;
    const timer = window.setInterval(() => {
      setCategorySlideIndex((prev) => (prev + 1) % sortedCategories.length);
    }, CATEGORY_SLIDE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [showAllCategories, isCategorySliderPaused, sortedCategories.length, visibleCategoryCount]);

  const sliderCategories = useMemo(() => {
    if (showAllCategories || sortedCategories.length <= visibleCategoryCount) {
      return sortedCategories;
    }
    return [...sortedCategories, ...sortedCategories];
  }, [showAllCategories, sortedCategories, visibleCategoryCount]);

  const categoryTrackStyle = useMemo(() => {
    if (showAllCategories || sortedCategories.length <= visibleCategoryCount) {
      return undefined;
    }
    return {
      transform: `translateX(-${(categorySlideIndex * 100) / visibleCategoryCount}%)`,
    } as const;
  }, [showAllCategories, sortedCategories.length, visibleCategoryCount, categorySlideIndex]);
  const productPreviewCount = isSmallPhone ? (isTinyPhone ? 4 : 1) : 4;
  const flashSalePreviewCount = isSmallPhone ? (isTinyPhone ? 4 : 1) : 4;
  const newArrivals = useMemo(
    () => (showAllNewArrivals ? products : products.slice(0, productPreviewCount)),
    [products, productPreviewCount, showAllNewArrivals],
  );
  const flashSaleProducts = useMemo(
    () => [...products].sort((a, b) => (b.discount || 0) - (a.discount || 0)).slice(0, flashSalePreviewCount),
    [products, flashSalePreviewCount],
  );
  const featuredProducts = useMemo(
    () => [...products]
      .sort((a, b) => ((b.discount || 0) + b.price * 0.001) - ((a.discount || 0) + a.price * 0.001)),
    [products],
  );
  const visibleFeaturedProducts = useMemo(
    () => (showAllFeatured ? featuredProducts : featuredProducts.slice(0, productPreviewCount)),
    [featuredProducts, productPreviewCount, showAllFeatured],
  );
  const newArrivalsSliderProducts = useMemo(
    () => (isTinyPhone && !showAllNewArrivals && newArrivals.length > 1 ? [...newArrivals, ...newArrivals] : newArrivals),
    [isTinyPhone, showAllNewArrivals, newArrivals],
  );
  const flashSaleSliderProducts = useMemo(
    () => (isTinyPhone && flashSaleProducts.length > 1 ? [...flashSaleProducts, ...flashSaleProducts] : flashSaleProducts),
    [isTinyPhone, flashSaleProducts],
  );
  const featuredSliderProducts = useMemo(
    () => (isTinyPhone && !showAllFeatured && visibleFeaturedProducts.length > 1
      ? [...visibleFeaturedProducts, ...visibleFeaturedProducts]
      : visibleFeaturedProducts),
    [isTinyPhone, showAllFeatured, visibleFeaturedProducts],
  );

  useEffect(() => {
    setNewArrivalsSlideIndex(0);
  }, [newArrivals.length, isTinyPhone, showAllNewArrivals]);

  useEffect(() => {
    setFlashSaleSlideIndex(0);
  }, [flashSaleProducts.length, isTinyPhone]);

  useEffect(() => {
    setFeaturedSlideIndex(0);
  }, [visibleFeaturedProducts.length, isTinyPhone, showAllFeatured]);

  useEffect(() => {
    if (!isTinyPhone || showAllNewArrivals || newArrivals.length <= 1) return;
    const timer = window.setInterval(() => {
      setNewArrivalsSlideIndex((prev) => (prev + 1) % newArrivals.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, [isTinyPhone, newArrivals.length, showAllNewArrivals]);

  useEffect(() => {
    if (!isTinyPhone || flashSaleProducts.length <= 1) return;
    const timer = window.setInterval(() => {
      setFlashSaleSlideIndex((prev) => (prev + 1) % flashSaleProducts.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, [isTinyPhone, flashSaleProducts.length]);

  useEffect(() => {
    if (!isTinyPhone || showAllFeatured || visibleFeaturedProducts.length <= 1) return;
    const timer = window.setInterval(() => {
      setFeaturedSlideIndex((prev) => (prev + 1) % visibleFeaturedProducts.length);
    }, 2600);
    return () => window.clearInterval(timer);
  }, [isTinyPhone, showAllFeatured, visibleFeaturedProducts.length]);

  return (
    <div ref={homeRootRef} className="min-h-screen bg-[#F9FAFB]">
      <div className="scroll-progress">
        <span className="scroll-progress-bar" style={{ transform: `scaleX(${scrollProgress})` }} />
      </div>
      <section
        data-scroll-reveal
        className="bg-gradient-to-r from-[#16A34A] to-[#15803D] text-white scroll-reveal"
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
                style={{ transform: `translateY(${isSmallPhone ? 0 : Math.min(scrollY * 0.14, 48)}px)` }}
              />
            </div>
          </div>
        </div>
      </section>

      <section data-scroll-reveal className="relative max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 lg:py-16 scroll-reveal">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -z-10 h-[240px] rounded-[40px] blur-3xl"
          style={{
            background: 'radial-gradient(circle at 20% 50%, rgba(22,163,74,0.18), rgba(22,163,74,0))',
            transform: `translateY(${isSmallPhone ? 0 : scrollY * 0.05}px)`,
          }}
        />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
          <h2 className="text-2xl sm:text-3xl text-gray-900">Shop by Category</h2>
          {sortedCategories.length > visibleCategoryCount && (
            <button
              onClick={() => setShowAllCategories((prev) => !prev)}
              className="text-[#16A34A] hover:text-[#15803D] flex items-center gap-2"
            >
              {showAllCategories ? 'Show Less' : 'View All'}
              <ChevronRight className={`w-5 h-5 transition-transform ${showAllCategories ? 'rotate-90' : ''}`} />
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-gray-600">Loading categories...</p>
        ) : showAllCategories ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
            {sortedCategories.map((category) => (
              <button key={category.id} onClick={() => onNavigate('products', { category: category.name })} className="group">
                <div className="bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-all h-full">
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
        ) : (
          <div
            className="overflow-hidden"
            onMouseEnter={() => setIsCategorySliderPaused(true)}
            onMouseLeave={() => setIsCategorySliderPaused(false)}
            onFocusCapture={() => setIsCategorySliderPaused(true)}
            onBlurCapture={() => setIsCategorySliderPaused(false)}
          >
            <div
              className="flex items-stretch transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform"
              style={categoryTrackStyle}
            >
              {sliderCategories.map((category, index) => (
                <button
                  key={`${category.id}-${index}`}
                  onClick={() => onNavigate('products', { category: category.name })}
                  className="group shrink-0 p-2"
                  style={{ width: `${100 / visibleCategoryCount}%` }}
                >
                  <div className="bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-all h-full">
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
          </div>
        )}
      </section>

      <section data-scroll-reveal className="relative max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 lg:py-16 scroll-reveal">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -z-10 h-[260px] rounded-[40px] blur-3xl"
          style={{
            background: 'radial-gradient(circle at 80% 40%, rgba(249,115,22,0.2), rgba(249,115,22,0))',
            transform: `translateY(${isSmallPhone ? 0 : scrollY * 0.08}px)`,
          }}
        />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
          <h2 className="text-2xl sm:text-3xl text-gray-900">New Arrivals</h2>
          {products.length > productPreviewCount && (
            <button
              onClick={() => setShowAllNewArrivals((prev) => !prev)}
              className="text-[#16A34A] hover:text-[#15803D] flex items-center gap-2"
            >
              {showAllNewArrivals ? 'Show Less' : 'View All'}
              <ChevronRight className={`w-5 h-5 transition-transform ${showAllNewArrivals ? 'rotate-90' : ''}`} />
            </button>
          )}
        </div>

        {loading || deferDealsSections ? (
          <p className="text-gray-600">Loading products...</p>
        ) : isTinyPhone && !showAllNewArrivals && newArrivals.length > 1 ? (
          <div className="overflow-hidden mb-12">
            <div
              className="flex items-stretch transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform"
              style={{ transform: `translateX(-${newArrivalsSlideIndex * 100}%)` }}
            >
              {newArrivalsSliderProducts.map((product, index) => (
                <div
                  key={`${product.id}-new-${index}`}
                  onClick={() => onNavigate('product-details', product)}
                  className="shrink-0 w-full px-1"
                >
                  <ProductCard
                    {...product}
                    onAddToCart={() => handleAddToCart(product.id)}
                    onToggleWishlist={() => toggleWishlist(product.id)}
                    isWishlisted={wishlist.includes(product.id)}
                  />
                </div>
              ))}
            </div>
          </div>
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

        {loading || deferDealsSections ? (
          <p className="text-gray-600">Loading products...</p>
        ) : isTinyPhone && flashSaleProducts.length > 1 ? (
          <div className="overflow-hidden">
            <div
              className="flex items-stretch transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform"
              style={{ transform: `translateX(-${flashSaleSlideIndex * 100}%)` }}
            >
              {flashSaleSliderProducts.map((product, index) => (
                <div
                  key={`${product.id}-flash-${index}`}
                  onClick={() => onNavigate('product-details', product)}
                  className="shrink-0 w-full px-1"
                >
                  <ProductCard
                    {...product}
                    onAddToCart={() => handleAddToCart(product.id)}
                    onToggleWishlist={() => toggleWishlist(product.id)}
                    isWishlisted={wishlist.includes(product.id)}
                  />
                </div>
              ))}
            </div>
          </div>
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

      <section data-scroll-reveal className="relative max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12 lg:py-16 scroll-reveal">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -z-10 h-[240px] rounded-[40px] blur-3xl"
          style={{
            background: 'radial-gradient(circle at 30% 45%, rgba(16,185,129,0.16), rgba(16,185,129,0))',
            transform: `translateY(${isSmallPhone ? 0 : scrollY * 0.06}px)`,
          }}
        />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
          <h2 className="text-2xl sm:text-3xl text-gray-900">Featured Products</h2>
          {featuredProducts.length > productPreviewCount && (
            <button
              onClick={() => setShowAllFeatured((prev) => !prev)}
              className="text-[#16A34A] hover:text-[#15803D] flex items-center gap-2"
            >
              {showAllFeatured ? 'Show Less' : 'View All'}
              <ChevronRight className={`w-5 h-5 transition-transform ${showAllFeatured ? 'rotate-90' : ''}`} />
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-gray-600">Loading products...</p>
        ) : isTinyPhone && !showAllFeatured && visibleFeaturedProducts.length > 1 ? (
          <div className="overflow-hidden">
            <div
              className="flex items-stretch transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform"
              style={{ transform: `translateX(-${featuredSlideIndex * 100}%)` }}
            >
              {featuredSliderProducts.map((product, index) => (
                <div
                  key={`${product.id}-featured-${index}`}
                  onClick={() => onNavigate('product-details', product)}
                  className="shrink-0 w-full px-1"
                >
                  <ProductCard
                    {...product}
                    onAddToCart={() => handleAddToCart(product.id)}
                    onToggleWishlist={() => toggleWishlist(product.id)}
                    isWishlisted={wishlist.includes(product.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {visibleFeaturedProducts.map((product) => (
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

      <footer data-scroll-reveal className="bg-gray-900 text-white mt-16 scroll-reveal">
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
