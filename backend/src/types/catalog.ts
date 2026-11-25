export interface Category {
  id: string;
  parent_id: string | null;
  slug: string;
  name: string;
  image_path: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface ProductRow {
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
  image_path: string | null;
  is_active: boolean;
}

export interface ProductFilter {
  categorySlug?: string;
  q?: string;
  page: number;
  pageSize: number;
  includeInactive: boolean;
}
