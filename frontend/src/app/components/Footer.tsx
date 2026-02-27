import React from 'react';

interface FooterProps {
  onNavigate: (page: string) => void;
}

export function Footer({ onNavigate }: FooterProps) {
  return (
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
  );
}
