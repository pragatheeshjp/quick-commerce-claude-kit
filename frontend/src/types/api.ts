export interface ApiEnvelope<T> {
  success: true;
  data: T;
  meta?: PageMeta & { replayed?: boolean };
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface Category {
  id: string;
  parent_id: string | null;
  slug: string;
  name: string;
  image_path: string | null;
  sort_order: number;
}

export interface Product {
  id: string;
  category_id: string;
  sku: string;
  name: string;
  description: string | null;
  brand: string | null;
  unit_label: string;
  price_paise: number;
  mrp_paise: number;
  in_stock: boolean;
  image_url: string | null;
}

export type Serviceability =
  | { pincode: string; serviceable: false }
  | {
      pincode: string;
      serviceable: true;
      area_name: string;
      city: string;
      delivery_fee_paise: number;
      min_order_paise: number;
    };

export interface Me {
  id: string;
  email?: string;
  role: "customer" | "admin";
  profile: { full_name: string | null; phone: string | null } | null;
}

export interface CartItem {
  product_id: string;
  name: string;
  unit_label: string;
  image_url: string | null;
  quantity: number;
  unit_price_paise: number;
  mrp_paise: number;
  line_total_paise: number;
  purchasable: boolean;
  issue: null | "unavailable" | "insufficient_stock";
  available_quantity?: number;
}

export interface Cart {
  items: CartItem[];
  item_count: number;
  /** Informational: only purchasable lines count. Checkout recalculates on the server. */
  subtotal_paise: number;
}

export interface Address {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
}

export interface Quote {
  subtotal_paise: number;
  discount_paise: number;
  delivery_fee_paise: number;
  total_paise: number;
}

export type OrderStatus = "pending" | "confirmed" | "packed" | "out_for_delivery" | "delivered" | "cancelled";

export interface OrderItem {
  product_id: string | null;
  sku: string;
  name: string;
  quantity: number;
  unit_price_paise: number;
  line_total_paise: number;
}

export interface Order extends Quote {
  id: string;
  status: OrderStatus;
  delivery_address: Record<string, string | null>;
  created_at: string;
  items?: OrderItem[];
}

export interface AdminProduct {
  id: string;
  category_id: string;
  sku: string;
  name: string;
  description: string | null;
  brand: string | null;
  unit_label: string;
  price_paise: number;
  mrp_paise: number;
  stock_quantity: number;
  image_url: string | null;
  is_active: boolean;
}

export interface AdminCategory extends Category {
  is_active: boolean;
}

export interface AdminOrder extends Order {
  user_id: string;
}

export interface AdminUser {
  user_id: string;
  email: string;
  created_at: string;
}
