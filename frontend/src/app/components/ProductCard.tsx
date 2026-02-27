import React from 'react';
import { Heart, Star, ShoppingCart } from 'lucide-react';
import { Badge } from './Badge';
import { Button } from './Button';

interface ProductCardProps {
  id: string;
  image: string;
  name: string;
  price: number;
  originalPrice?: number;
  rating: number;
  reviews: number;
  discount?: number;
  onAddToCart?: (id: string) => void;
  onToggleWishlist?: (id: string) => void;
  isWishlisted?: boolean;
}

export function ProductCard({
  id,
  image,
  name,
  price,
  originalPrice,
  rating,
  reviews,
  discount,
  onAddToCart,
  onToggleWishlist,
  isWishlisted = false
}: ProductCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow p-4 relative group">
      {discount && (
        <Badge variant="discount" className="absolute top-6 left-6 z-10">
          -{discount}%
        </Badge>
      )}
      
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleWishlist?.(id);
        }}
        className="absolute top-6 right-6 z-10 bg-white rounded-full p-2 shadow-sm hover:shadow-md transition-all"
      >
        <Heart
          className={`w-5 h-5 ${isWishlisted ? 'fill-red-500 text-red-500' : 'text-gray-400'}`}
        />
      </button>

      <div className="aspect-square bg-gray-100 rounded-xl mb-4 overflow-hidden">
        <img 
          src={image} 
          alt={name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
      </div>

      <h3 className="text-gray-900 mb-2 line-clamp-2 min-h-[48px]">
        {name}
      </h3>

      <div className="flex items-center gap-1 mb-3">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`w-4 h-4 ${
              i < Math.floor(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
            }`}
          />
        ))}
        <span className="text-sm text-gray-600 ml-1">({reviews})</span>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <span className="text-[#16A34A]">ETB {price.toLocaleString()}</span>
        {originalPrice && (
          <span className="text-gray-400 line-through">ETB {originalPrice.toLocaleString()}</span>
        )}
      </div>

      <Button
        variant="primary"
        size="sm"
        className="w-full"
        onClick={(e) => {
          e.stopPropagation();
          onAddToCart?.(id);
        }}
      >
        <ShoppingCart className="w-4 h-4 mr-2" />
        Add to Cart
      </Button>
    </div>
  );
}
