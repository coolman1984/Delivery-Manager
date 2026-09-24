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
  centerLat?: number | null;
  centerLng?: number | null;
  radiusKm?: number;
}

export interface StoreSummary {
  id: string;
  name: string;
  type: StoreType;
  isOpen: boolean;
  zoneName?: string;
  rating?: number | null;
  ratingCount?: number;
  logoUrl?: string | null;
  coverUrl?: string | null;
  prepMinutes?: number;
}

export interface TenantPublic {
  name: string;
  slug: string;
  governorate: string;
  otpEnabled: boolean;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  imageUrl?: string | null;
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
  type: 'delivery' | 'errand';
  pickupText: string | null;
  errandDetails: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  storeLat?: number | null;
  storeLng?: number | null;
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
  lastLat: number | null;
  lastLng: number | null;
}

export interface Tracking {
  status: string;
  driver: { lat: number; lng: number; lastSeenAt: string | null } | null;
  pickup: { lat: number; lng: number; label: string | null } | null;
  dropoff: { lat: number; lng: number } | null;
}
