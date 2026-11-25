export interface Address {
  id: string;
  user_id: string;
  label: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  is_default: boolean;
}

export type AddressInput = Omit<Address, "id" | "user_id" | "is_default"> & { is_default?: boolean };

export interface ServiceablePincode {
  pincode: string;
  area_name: string;
  city: string;
  delivery_fee_paise: number;
  min_order_paise: number;
  is_active: boolean;
}

export interface CartLineRow {
  product_id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    unit_label: string;
    price_paise: number;
    mrp_paise: number;
    stock_quantity: number;
    image_path: string | null;
    is_active: boolean;
  };
}
