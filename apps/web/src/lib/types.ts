import type { DriverStatus, OrderStatus, Role, StoreType } from '@dm/shared';

export interface SessionUser {
  id: string;
  name: string;
  phone: string;
  role: Role;
  storeId: string | null;
}

export interface Zone {
  id: string;
  name: string;
  deliveryFee: number;
  isActive?: boolean;
}

export interface StoreSummary {
  id: string;
  name: string;
  type: StoreType;
  isOpen: boolean;
  zoneName?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  isAvailable?: boolean;
}

export interface StoreDetail extends StoreSummary {
  address: string;
  products: Product[];
}

export interface Address {
  id: string;
  label: string;
  details: string;
  zoneId: string;
  zoneName: string;
  deliveryFee: number;
}

export interface Order {
  id: string;
  number: number;
  status: OrderStatus;
  storeId: string;
  storeName?: string;
  driverId: string | null;
  driverName?: string | null;
  customerName: string;
  customerPhone: string | null;
  addressText: string;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  commissionAmount: number | null;
  cashCollected: number | null;
  cashDiffStatus: 'none' | 'pending' | 'written_off' | 'charged_driver';
  note: string | null;
  reason: string | null;
  placedAt: string;
  deliveredAt: string | null;
}

export interface OrderDetail extends Order {
  storePhone: string;
  driverPhone: string | null;
  items: Array<{ name: string; unitPrice: number; quantity: number; lineTotal: number }>;
  events: Array<{
    type: string;
    toStatus: OrderStatus | null;
    note: string | null;
    createdAt: string;
  }>;
  rated: boolean;
}

export interface DriverOverview {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
  status: DriverStatus;
  activeOrders: number;
  cashBalance: number;
  lastSeenAt: string | null;
}
