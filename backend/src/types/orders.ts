export const ORDER_STATUSES = ["pending", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface OrderItemRow {
  product_id: string | null;
  sku: string;
  name: string;
  quantity: number;
  unit_price_paise: number;
}

export interface OrderRow {
  id: string;
  user_id: string;
  status: OrderStatus;
  delivery_address: Record<string, string | null>;
  subtotal_paise: number;
  discount_paise: number;
  delivery_fee_paise: number;
  total_paise: number;
  created_at: string;
  order_items?: OrderItemRow[];
}

export interface CheckoutResult {
  order_id: string | null;
  replayed: boolean;
  subtotal_paise: number;
  discount_paise: number;
  delivery_fee_paise: number;
  total_paise: number;
}
