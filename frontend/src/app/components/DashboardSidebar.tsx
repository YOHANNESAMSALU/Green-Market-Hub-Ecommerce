import React from 'react';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingBag, 
  Settings,
  BarChart3,
  FileText,
  CheckCircle,
  LogOut,
  Tags,
  UserCheck
} from 'lucide-react';

interface MenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface DashboardSidebarProps {
  type: 'seller' | 'admin';
  activeItem: string;
  onItemClick: (id: string) => void;
  onLogout?: () => void;
}

export function DashboardSidebar({ type, activeItem, onItemClick, onLogout }: DashboardSidebarProps) {
  const sellerMenuItems: MenuItem[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'products', label: 'Products', icon: <Package className="w-5 h-5" /> },
    { id: 'orders', label: 'Orders', icon: <ShoppingBag className="w-5 h-5" /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-5 h-5" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
  ];

  const adminMenuItems: MenuItem[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'sellers', label: 'Categories', icon: <Tags className="w-5 h-5" /> },
    { id: 'products', label: 'Products', icon: <Package className="w-5 h-5" /> },
    { id: 'orders', label: 'Users', icon: <UserCheck className="w-5 h-5" /> },
    { id: 'approvals', label: 'Approvals', icon: <CheckCircle className="w-5 h-5" /> },
    { id: 'reports', label: 'Reports', icon: <FileText className="w-5 h-5" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
  ];

  const menuItems = type === 'seller' ? sellerMenuItems : adminMenuItems;

  return (
    <div className="w-64 bg-white h-screen border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="p-8 border-b border-gray-200">
        <h2 className="text-2xl text-[#16A34A]">
          {type === 'seller' ? 'Seller Portal' : 'Admin Panel'}
        </h2>
      </div>

      {/* Menu Items */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onItemClick(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                  activeItem === item.id
                    ? 'bg-[#DCFCE7] text-[#16A34A]'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
