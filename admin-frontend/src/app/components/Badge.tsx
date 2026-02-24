import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'discount';
  className?: string;
}

export function Badge({ children, variant = 'success', className = '' }: BadgeProps) {
  const variants = {
    success: 'bg-[#DCFCE7] text-[#16A34A]',
    warning: 'bg-yellow-100 text-yellow-700',
    danger: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
    discount: 'bg-[#16A34A] text-white'
  };
  
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-lg ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}
