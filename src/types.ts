export interface User {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  district: string | null;
  role: 'customer' | 'merchant' | 'admin';
  account_status?: 'active' | 'suspended';
  created_at?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  is_active: number;
}

export interface Store {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  email: string | null;
  location_text: string | null;
  district: string | null;
  status: 'pending' | 'active' | 'suspended' | 'rejected';
  product_count?: number;
  order_count?: number;
  owner_name?: string;
  owner_email?: string;
  created_at: string;
}

export interface ProductImage {
  id: string;
  storage_path: string;
  alt_text: string | null;
  sort_order: number;
}

export interface Product {
  id: string;
  store_id: string;
  category_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  stock_quantity: number;
  sku: string | null;
  condition: 'new' | 'used' | 'refurbished';
  status: 'draft' | 'published' | 'archived';
  is_featured: number;
  primary_image?: string | null;
  images?: ProductImage[];
  store_name?: string;
  store_slug?: string;
  store_district?: string;
  store_location?: string;
  store_phone?: string;
  store_whatsapp?: string;
  store_logo?: string;
  store_status?: string;
  category_name?: string;
  category_slug?: string;
  created_at: string;
}

export interface CartItem {
  productId: string;
  slug: string;
  name: string;
  price: number;
  quantity: number;
  maxStock: number;
  image: string | null;
  storeId: string;
  storeName: string;
  storeSlug: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  sku: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface OrderStatusEntry {
  id: string;
  order_id: string;
  old_status: string | null;
  new_status: string;
  note: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  order_number: string;
  store_id: string;
  store_name?: string;
  store_slug?: string;
  store_phone?: string;
  store_whatsapp?: string;
  store_location?: string;
  store_district?: string;
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  delivery_method: 'pickup' | 'seller_delivery' | 'third_party';
  delivery_address: string | null;
  delivery_district: string | null;
  delivery_fee: number;
  subtotal: number;
  total: number;
  currency: 'UGX';
  status:
    | 'pending'
    | 'accepted'
    | 'processing'
    | 'ready'
    | 'dispatched'
    | 'completed'
    | 'cancelled'
    | 'rejected';
  customer_note: string | null;
  created_at: string;
  items?: OrderItem[];
  history?: OrderStatusEntry[];
}

export interface AuditLogEntry {
  id: string;
  admin_id: string;
  admin_name?: string;
  admin_email?: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string | null;
  created_at: string;
}

export interface OperationalLogEntry {
  id: string;
  level: 'info' | 'warn' | 'error';
  event_type: string;
  message: string;
  route: string | null;
  user_id: string | null;
  created_at: string;
}

export interface Deal {
  id: string;
  title: string;
  subtitle: string;
  discount_label: string;
  product_id: string | null;
  store_id: string | null;
  product_name?: string;
  product_slug?: string;
  product_price?: number;
  product_compare_at_price?: number;
  product_image?: string;
  store_name?: string;
  store_slug?: string;
  expires_at: string;
}

export interface UgaEvent {
  id: string;
  title: string;
  organizer: string;
  venue: string;
  district: string;
  event_date: string;
  ticket_price: number;
  description: string;
  store_name?: string;
  store_slug?: string;
}
