import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block mb-2 text-gray-700">
          {label}
        </label>
      )}
      <input
        autoComplete="on"
        className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-[#DCFCE7] transition-all ${className}`}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className = '', ...props }: TextareaProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block mb-2 text-gray-700">
          {label}
        </label>
      )}
      <textarea
        className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-[#DCFCE7] transition-all resize-none ${className}`}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
