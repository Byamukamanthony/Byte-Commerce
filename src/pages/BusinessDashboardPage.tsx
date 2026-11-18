import {
  BarChart3,
  Copy,
  ExternalLink,
  LayoutDashboard,
  MessageCircle,
  Package,
  Pencil,
  Plus,
  ShoppingCart,
  Store as StoreIcon,
  Trash2,
  Upload,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  buildWhatsappLink,
  formatDateTime,
  formatDeliveryMethod,
  formatUgx,
  UGANDA_DISTRICTS,
} from '../lib/format';
import type { Order, Product, Store } from '../types';

type BusinessTab = 'overview' | 'store' | 'products' | 'orders' | 'customers' | 'analytics';

async function fileToUploadUrl(
  file: File,
  opts?: { storeId?: string; bucket?: 'store-logos' | 'store-covers' | 'product-images' }
): Promise<string> {
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type,
      base64Data,
      storeId: opts?.storeId,
      bucket: opts?.bucket || 'product-images',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.url;
}

export function BusinessDashboardPage({ section }: { section?: string }) {
  const { user, myStores, categories, navigate, refreshAuth, showToast } = useApp();
  const activeTab: BusinessTab = (
    ['store', 'products', 'orders', 'customers', 'analytics'].includes(section || '')
      ? section
      : 'overview'
  ) as BusinessTab;

  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [dashboard, setDashboard] = useState<{
    kpis: {
      ordersToday: number;
      salesToday: number;
      totalOrders: number;
      totalSales: number;
      pendingOrders: number;
      activeProducts: number;
      lowStockCount: number;
    };
    lowStockProducts: Product[];
    recentOrders: Order[];
    topProducts: { product_name: string; units_sold: number; revenue: number }[];
  } | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<
    {
      customer_name: string;
      customer_phone: string;
      customer_email: string | null;
      delivery_district: string | null;
      order_count: number;
      total_spent: number;
      last_order_at: string;
    }[]
  >([]);

  // Store Onboarding / Edit State
  const [showCreateStore, setShowCreateStore] = useState(false);
  const [storeForm, setStoreForm] = useState({
    name: '',
    slug: '',
    description: '',
    phone: user?.phone || '',
    whatsappNumber: user?.phone || '',
    email: user?.email || '',
    district: user?.district || 'Kampala',
    locationText: '',
    logoUrl: '/assets/aistudio/ugabyte_icon_29c10976.png',
    coverUrl: '/src/assets/images/hero_kampala_commerce_1795001653548.jpg',
  });
  const [storeSaving, setStoreSaving] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [slugCheck, setSlugCheck] = useState<{ available: boolean; reason?: string | null } | null>(null);
  const [uploadingTarget, setUploadingTarget] = useState<'logo' | 'cover' | 'product' | null>(null);

  // Product Modal State
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [prodForm, setProdForm] = useState({
    name: '',
    description: '',
    price: '',
    compareAtPrice: '',
    stockQuantity: '10',
    sku: '',
    condition: 'new',
    status: 'published',
    categoryId: '',
    images: [] as string[],
  });
  const [prodSaving, setProdSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{
    improvedTitle?: string;
    description?: string;
    suggestedCategory?: string;
    marketingCaption?: string;
    whatsappPromo?: string;
  } | null>(null);

  const activeStore: Store | undefined =
    myStores.find((s) => s.id === selectedStoreId) || myStores[0];

  useEffect(() => {
    const rawSlug = storeForm.slug.trim();
    if (!rawSlug || rawSlug.length < 3) {
      setSlugCheck(null);
      return;
    }
    const timer = setTimeout(() => {
      const qs = new URLSearchParams({ slug: rawSlug });
      if (activeStore && !showCreateStore && activeTab === 'store') {
        qs.set('excludeStoreId', activeStore.id);
      }
      fetch(`/api/business/stores/check-slug?${qs.toString()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) setSlugCheck({ available: d.available, reason: d.reason });
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [storeForm.slug, activeStore, showCreateStore, activeTab]);

  useEffect(() => {
    if (myStores.length > 0 && !selectedStoreId) {
      setSelectedStoreId(myStores[0].id);
    }
  }, [myStores, selectedStoreId]);

  useEffect(() => {
    if (activeStore && activeTab === 'store') {
      setStoreForm({
        name: activeStore.name,
        slug: activeStore.slug,
        description: activeStore.description || '',
        phone: activeStore.phone || '',
        whatsappNumber: activeStore.whatsapp_number || '',
        email: activeStore.email || '',
        district: activeStore.district || 'Kampala',
        locationText: activeStore.location_text || '',
        logoUrl: activeStore.logo_url || '/assets/aistudio/ugabyte_icon_29c10976.png',
        coverUrl: activeStore.cover_url || '/src/assets/images/hero_kampala_commerce_1795001653548.jpg',
      });
    }
  }, [activeStore, activeTab]);

  const loadStoreData = useCallback(async () => {
    if (!activeStore) return;
    const sid = activeStore.id;
    try {
      const [dashRes, prodRes, ordRes, custRes] = await Promise.all([
        fetch(`/api/business/stores/${sid}/dashboard`),
        fetch(`/api/business/stores/${sid}/products`),
        fetch(`/api/business/stores/${sid}/orders`),
        fetch(`/api/business/stores/${sid}/customers`),
      ]);
      if (dashRes.ok) setDashboard(await dashRes.json());
      if (prodRes.ok) setProducts((await prodRes.json()).products || []);
      if (ordRes.ok) setOrders((await ordRes.json()).orders || []);
      if (custRes.ok) setCustomers((await custRes.json()).customers || []);
    } catch {
      // Handle cleanly
    }
  }, [activeStore]);

  useEffect(() => {
    loadStoreData();
  }, [loadStoreData]);

  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-5">
        <div className="w-12 h-12 mx-auto rounded-xl bg-[#0B0F0E] p-2.5">
          <img
            src="/assets/aistudio/ugabyte_icon_29c10976.png"
            alt="UgaByte"
            className="w-full h-full object-contain"
          />
        </div>
        <h1 className="font-display text-2xl font-bold text-[#0F172A]">UgaByte Business</h1>
        <p className="text-sm text-slate-600">
          Sign in or register an account to launch your Ugandan online store, list products in UGX, and manage customer orders.
        </p>
        <button
          type="button"
          onClick={() => navigate('/auth')}
          className="px-6 py-3 text-sm font-semibold bg-[#BAFF00] text-[#0B0F0E] hover:bg-[#a6e600] rounded-lg"
        >
          Sign In to UgaByte Business
        </button>
      </div>
    );
  }

  const handleCreateOrUpdateStore = async (e: React.FormEvent, isCreate: boolean) => {
    e.preventDefault();
    setStoreError(null);
    setStoreSaving(true);
    try {
      const url = isCreate
        ? '/api/business/stores'
        : `/api/business/stores/${activeStore!.id}`;
      const res = await fetch(url, {
        method: isCreate ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(storeForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save store');
      await refreshAuth();
      setSelectedStoreId(data.store.id);
      setShowCreateStore(false);
      showToast(isCreate ? 'Store created! Pending admin approval for public Market.' : 'Store profile updated.');
      loadStoreData();
    } catch (err) {
      setStoreError(err instanceof Error ? err.message : 'Unable to save store');
    } finally {
      setStoreSaving(false);
    }
  };

  // Onboarding View when user has no stores or clicked "New Store"
  if (myStores.length === 0 || showCreateStore) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 pb-16 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-[#0F172A]">Create Your UgaByte Store</h1>
            <p className="text-sm text-slate-600 mt-1">
              Get your shareable storefront URL and start listing products in UGX.
            </p>
          </div>
          {myStores.length > 0 && (
            <button
              type="button"
              onClick={() => setShowCreateStore(false)}
              className="text-sm font-medium text-slate-600 hover:text-[#0B0F0E]"
            >
              Cancel
            </button>
          )}
        </div>

        <form
          onSubmit={(e) => handleCreateOrUpdateStore(e, true)}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          {storeError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg">
              {storeError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Business Name *</label>
              <input
                type="text"
                required
                value={storeForm.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setStoreForm((f) => ({
                    ...f,
                    name,
                    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''),
                  }));
                }}
                placeholder="e.g. Tony's Fashion Kampala"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Storefront Slug *</label>
              <input
                type="text"
                required
                value={storeForm.slug}
                onChange={(e) => setStoreForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="tonys-fashion"
                className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
              {slugCheck && (
                <div className={`text-[11px] mt-1 font-medium ${slugCheck.available ? 'text-emerald-700' : 'text-red-600'}`}>
                  {slugCheck.available ? 'Storefront URL is available' : slugCheck.reason || 'Unavailable'}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Business Description</label>
            <textarea
              rows={3}
              value={storeForm.description}
              onChange={(e) => setStoreForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What do you sell and where do you deliver?"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number *</label>
              <input
                type="tel"
                required
                value={storeForm.phone}
                onChange={(e) => setStoreForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+256 772 000 000"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">WhatsApp Number</label>
              <input
                type="tel"
                value={storeForm.whatsappNumber}
                onChange={(e) => setStoreForm((f) => ({ ...f, whatsappNumber: e.target.value }))}
                placeholder="256772000000"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">District</label>
              <select
                value={storeForm.district}
                onChange={(e) => setStoreForm((f) => ({ ...f, district: e.target.value }))}
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {UGANDA_DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Physical Location / Pickup Point</label>
              <input
                type="text"
                value={storeForm.locationText}
                onChange={(e) => setStoreForm((f) => ({ ...f, locationText: e.target.value }))}
                placeholder="e.g. Acacia Mall / Mabirizi Level 2"
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={storeSaving}
            className="w-full py-3 text-sm font-semibold bg-[#BAFF00] text-[#0B0F0E] hover:bg-[#a6e600] rounded-lg"
          >
            {storeSaving ? 'Creating Store...' : 'Launch Storefront'}
          </button>
        </form>
      </div>
    );
  }

  const openNewProductModal = () => {
    setEditingProduct(null);
    setAiSuggestion(null);
    setProdForm({
      name: '',
      description: '',
      price: '',
      compareAtPrice: '',
      stockQuantity: '10',
      sku: '',
      condition: 'new',
      status: 'published',
      categoryId: categories[0]?.id || '',
      images: [],
    });
    setProductModalOpen(true);
  };

  const openEditProductModal = (prod: Product) => {
    setEditingProduct(prod);
    setAiSuggestion(null);
    setProdForm({
      name: prod.name,
      description: prod.description || '',
      price: String(prod.price),
      compareAtPrice: prod.compare_at_price ? String(prod.compare_at_price) : '',
      stockQuantity: String(prod.stock_quantity),
      sku: prod.sku || '',
      condition: prod.condition,
      status: prod.status,
      categoryId: prod.category_id || '',
      images: (prod.images || []).map((i) => i.storage_path),
    });
    setProductModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStore) return;
    setProdSaving(true);
    try {
      const payload = {
        name: prodForm.name,
        description: prodForm.description,
        price: Number(prodForm.price),
        compareAtPrice: prodForm.compareAtPrice ? Number(prodForm.compareAtPrice) : null,
        stockQuantity: Number(prodForm.stockQuantity),
        sku: prodForm.sku || null,
        condition: prodForm.condition,
        status: prodForm.status,
        categoryId: prodForm.categoryId || null,
        images: prodForm.images,
      };
      const url = editingProduct
        ? `/api/business/stores/${activeStore.id}/products/${editingProduct.id}`
        : `/api/business/stores/${activeStore.id}/products`;
      const res = await fetch(url, {
        method: editingProduct ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save product');
      setProductModalOpen(false);
      showToast(editingProduct ? 'Product updated' : 'Product added to catalogue');
      loadStoreData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setProdSaving(false);
    }
  };

  const handleArchiveProduct = async (productId: string) => {
    if (!activeStore) return;
    await fetch(`/api/business/stores/${activeStore.id}/products/${productId}`, {
      method: 'DELETE',
    });
    showToast('Product archived');
    loadStoreData();
  };

  const handleRunAiAssist = async () => {
    if (!prodForm.name.trim()) {
      showToast('Enter a product name first for UgaByte AI.');
      return;
    }
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'full_pack',
          productName: prodForm.name,
          roughNotes: prodForm.description,
          priceUgx: Number(prodForm.price) || undefined,
          storeName: activeStore?.name,
          district: activeStore?.district,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI request failed');
      setAiSuggestion(data.suggestion);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not reach UgaByte AI');
    } finally {
      setAiLoading(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: string) => {
    if (!activeStore) return;
    const res = await fetch(`/api/business/stores/${activeStore.id}/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Could not update order');
      return;
    }
    showToast(`Order updated to ${status}`);
    loadStoreData();
  };

  const ALLOWED_NEXT_STATUSES: Record<string, string[]> = {
    pending: ['accepted', 'rejected', 'cancelled'],
    accepted: ['processing', 'ready', 'cancelled'],
    processing: ['ready', 'dispatched', 'cancelled'],
    ready: ['dispatched', 'completed', 'cancelled'],
    dispatched: ['completed'],
    completed: [],
    cancelled: [],
    rejected: [],
  };

  const sidebarItems: { id: BusinessTab; label: string; icon: React.ReactNode; route: string }[] = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" />, route: '/business' },
    { id: 'orders', label: 'Orders', icon: <ShoppingCart className="w-4 h-4" />, route: '/business/orders' },
    { id: 'products', label: 'Products', icon: <Package className="w-4 h-4" />, route: '/business/products' },
    { id: 'customers', label: 'Customers', icon: <Users className="w-4 h-4" />, route: '/business/customers' },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" />, route: '/business/analytics' },
    { id: 'store', label: 'Store Profile', icon: <StoreIcon className="w-4 h-4" />, route: '/business/store' },
  ];

  const shareUrl = activeStore ? `${window.location.origin}/store/${activeStore.slug}` : '';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-16">
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* 240px Sidebar */}
        <aside className="w-full lg:w-[240px] shrink-0 bg-white border border-slate-200 rounded-xl p-4 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Active Storefront</label>
            <select
              value={activeStore?.id || ''}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              className="w-full px-3 py-2 text-sm font-semibold bg-slate-50 border border-slate-200 rounded-lg"
            >
              {myStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowCreateStore(true)}
              className="mt-2 text-xs font-semibold text-slate-600 hover:text-[#0B0F0E]"
            >
              + Create another store
            </button>
          </div>

          <nav className="space-y-1">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.route)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === item.id
                    ? 'bg-[#0B0F0E] text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          {activeStore && (
            <div className="pt-4 border-t border-slate-200 space-y-2">
              <div className="text-xs text-slate-500">Public Store Link</div>
              <button
                type="button"
                onClick={() => navigate(`/store/${activeStore.slug}`)}
                className="w-full inline-flex items-center justify-between px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-800"
              >
                <span className="truncate">/store/{activeStore.slug}</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  showToast('Store link copied');
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-[#BAFF00] text-[#0B0F0E] rounded-lg"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Share URL
              </button>
            </div>
          )}
        </aside>

        {/* Main Workspace Viewport */}
        <div className="flex-1 min-w-0 space-y-6 w-full">
          {/* Top Breadcrumb + Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs text-slate-500">
                UgaByte Business / {activeStore?.name} / <span className="capitalize">{activeTab}</span>
              </div>
              <h1 className="font-display text-2xl font-bold text-[#0F172A] capitalize mt-0.5">
                {activeTab === 'overview' ? 'Merchant Dashboard' : activeTab}
              </h1>
            </div>
            <button
              type="button"
              onClick={openNewProductModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-[#0B0F0E] text-white hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              Add Product
            </button>
          </div>

          {activeStore && activeStore.status !== 'active' && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
              Your store status is currently <strong className="capitalize">{activeStore.status}</strong>. You can add products and prepare your storefront now; an admin approves stores before listings appear on the public UgaByte Market.
            </div>
          )}

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Orders Today', value: dashboard?.kpis.ordersToday ?? 0 },
                  { label: 'Sales Today', value: formatUgx(dashboard?.kpis.salesToday ?? 0) },
                  { label: 'Active Products', value: dashboard?.kpis.activeProducts ?? 0 },
                  { label: 'Pending Orders', value: dashboard?.kpis.pendingOrders ?? 0 },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white border border-slate-200 rounded-xl p-5">
                    <div className="text-xs font-medium text-slate-500">{kpi.label}</div>
                    <div className="mt-2 font-mono text-xl sm:text-2xl font-bold text-[#0B0F0E] tabular-nums">
                      {kpi.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-base font-bold text-[#0F172A]">Recent Orders</h2>
                    <button
                      type="button"
                      onClick={() => navigate('/business/orders')}
                      className="text-xs font-semibold text-slate-700 hover:underline"
                    >
                      Manage all orders →
                    </button>
                  </div>

                  {orders.length === 0 ? (
                    <div className="py-10 text-center text-sm text-slate-500">
                      No orders received yet. Share your storefront URL on WhatsApp to start selling.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-xs text-slate-500 text-left">
                            <th className="pb-2 font-medium">Order</th>
                            <th className="pb-2 font-medium">Customer</th>
                            <th className="pb-2 font-medium">Status</th>
                            <th className="pb-2 font-medium text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {orders.slice(0, 5).map((ord) => (
                            <tr key={ord.id} className="hover:bg-slate-50">
                              <td className="py-3 font-mono text-xs font-semibold">{ord.order_number}</td>
                              <td className="py-3">
                                <div className="font-medium text-[#0F172A]">{ord.customer_name}</div>
                                <div className="text-xs text-slate-500">{ord.customer_phone}</div>
                              </td>
                              <td className="py-3 capitalize text-xs font-medium">{ord.status}</td>
                              <td className="py-3 text-right font-mono font-semibold tabular-nums">
                                {formatUgx(ord.total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <h2 className="font-display text-base font-bold text-[#0F172A]">Low Stock Alerts</h2>
                  {(dashboard?.lowStockProducts || []).length === 0 ? (
                    <p className="text-sm text-slate-500">All products are well stocked.</p>
                  ) : (
                    <div className="space-y-3">
                      {dashboard!.lowStockProducts.map((lp) => (
                        <div
                          key={lp.id}
                          className="flex items-center justify-between text-sm border-b border-slate-100 pb-2.5 last:border-0"
                        >
                          <span className="font-medium text-slate-800 truncate pr-2">{lp.name}</span>
                          <span className="font-mono text-xs font-semibold text-amber-700 tabular-nums shrink-0">
                            {lp.stock_quantity} left
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* PRODUCTS TAB */}
          {activeTab === 'products' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {products.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <p className="font-display text-lg font-semibold text-[#0F172A]">No products added yet</p>
                  <p className="text-sm text-slate-500">
                    Add your first product with UGX pricing and stock quantity, or let UgaByte AI write the copy.
                  </p>
                  <button
                    type="button"
                    onClick={openNewProductModal}
                    className="px-4 py-2 text-sm font-semibold bg-[#BAFF00] text-[#0B0F0E] rounded-lg"
                  >
                    Add First Product
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 text-left">
                        <th className="px-4 py-3 font-medium">Product</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium text-right">Stock</th>
                        <th className="px-4 py-3 font-medium text-right">Price</th>
                        <th className="px-4 py-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {products.map((prod) => (
                        <tr key={prod.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <img
                                src={prod.primary_image || '/assets/aistudio/ugabyte_icon_29c10976.png'}
                                alt={prod.name}
                                className="w-10 h-10 rounded-lg object-cover bg-slate-100 border border-slate-200 shrink-0"
                              />
                              <div>
                                <div className="font-semibold text-[#0F172A]">{prod.name}</div>
                                <div className="text-xs text-slate-500">
                                  {prod.category_name || 'Uncategorized'} {prod.sku ? `· ${prod.sku}` : ''}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 capitalize text-xs font-semibold">
                            <span className={prod.status === 'published' ? 'text-emerald-700' : 'text-amber-700'}>
                              {prod.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">{prod.stock_quantity}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                            {formatUgx(prod.price)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditProductModal(prod)}
                                className="p-1.5 text-slate-600 hover:text-[#0B0F0E]"
                                aria-label="Edit product"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleArchiveProduct(prod.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600"
                                aria-label="Archive product"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ORDERS TAB */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              {orders.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
                  No incoming orders yet.
                </div>
              ) : (
                orders.map((ord) => (
                  <div key={ord.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-sm font-bold text-[#0B0F0E]">{ord.order_number}</span>
                          <span className="text-xs text-slate-500">· {formatDateTime(ord.created_at)}</span>
                        </div>
                        <div className="text-sm text-slate-700 mt-0.5">
                          {ord.customer_name} · {ord.customer_phone} · {ord.delivery_address}
                        </div>
                      </div>
                      <div className="text-left sm:text-right">
                        <div className="font-mono text-lg font-bold text-[#0B0F0E] tabular-nums">
                          {formatUgx(ord.total)}
                        </div>
                        <div className="text-xs text-slate-500">
                          {formatDeliveryMethod(ord.delivery_method)} · Arrange payment directly with customer
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-700">
                      {(ord.items || []).map((item) => (
                        <div key={item.id} className="flex justify-between">
                          <span>
                            {item.quantity} × {item.product_name}
                          </span>
                          <span className="font-mono tabular-nums">{formatUgx(item.line_total)}</span>
                        </div>
                      ))}
                      {ord.customer_note && (
                        <div className="pt-1 text-slate-500">Note: {ord.customer_note}</div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-slate-600 mr-1 capitalize">
                          Status: {ord.status}
                        </span>
                        {(ALLOWED_NEXT_STATUSES[ord.status] || []).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => handleUpdateOrderStatus(ord.id, st)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-md capitalize transition-colors bg-slate-100 hover:bg-[#0B0F0E] hover:text-white text-slate-800"
                          >
                            Mark {st}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <a
                          href={`tel:${ord.customer_phone}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-slate-300 text-slate-800 rounded-lg hover:bg-slate-50"
                        >
                          Call Customer
                        </a>
                        <a
                          href={buildWhatsappLink(
                            ord.customer_phone,
                            `Hello ${ord.customer_name}, update from ${activeStore?.name} on your order ${ord.order_number}: currently ${ord.status}.`
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-[#BAFF00] text-[#0B0F0E] rounded-lg hover:bg-[#a6e600]"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          WhatsApp Customer
                        </a>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* CUSTOMERS TAB */}
          {activeTab === 'customers' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {customers.length === 0 ? (
                <div className="p-12 text-center text-sm text-slate-500">
                  Customers will appear here once your store receives its first order.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 text-left">
                        <th className="px-4 py-3 font-medium">Customer</th>
                        <th className="px-4 py-3 font-medium">District</th>
                        <th className="px-4 py-3 font-medium text-right">Orders</th>
                        <th className="px-4 py-3 font-medium text-right">Total Spent</th>
                        <th className="px-4 py-3 font-medium text-right">Last Order</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customers.map((c) => (
                        <tr key={c.customer_phone}>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-[#0F172A]">{c.customer_name}</div>
                            <div className="text-xs text-slate-500">{c.customer_phone}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{c.delivery_district || '—'}</td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">{c.order_count}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                            {formatUgx(c.total_spent)}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-slate-500">
                            {formatDateTime(c.last_order_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ANALYTICS TAB */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="text-xs text-slate-500">Total Lifetime Sales</div>
                  <div className="mt-2 font-mono text-2xl font-bold text-[#0B0F0E] tabular-nums">
                    {formatUgx(dashboard?.kpis.totalSales ?? 0)}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="text-xs text-slate-500">Total Orders</div>
                  <div className="mt-2 font-mono text-2xl font-bold text-[#0B0F0E] tabular-nums">
                    {dashboard?.kpis.totalOrders ?? 0}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <div className="text-xs text-slate-500">Low Stock Items (≤ 5)</div>
                  <div className="mt-2 font-mono text-2xl font-bold text-[#0B0F0E] tabular-nums">
                    {dashboard?.kpis.lowStockCount ?? 0}
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="font-display text-base font-bold text-[#0F172A]">Best-Selling Products</h2>
                {(dashboard?.topProducts || []).length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No sales recorded yet. Revenue and unit counts are calculated directly from verified orders.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {dashboard!.topProducts.map((tp) => (
                      <div key={tp.product_name} className="py-3 flex items-center justify-between text-sm">
                        <div>
                          <div className="font-semibold text-[#0F172A]">{tp.product_name}</div>
                          <div className="text-xs text-slate-500 tabular-nums">{tp.units_sold} units sold</div>
                        </div>
                        <div className="font-mono font-bold text-[#0B0F0E] tabular-nums">
                          {formatUgx(tp.revenue)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STORE PROFILE TAB */}
          {activeTab === 'store' && (
            <form
              onSubmit={(e) => handleCreateOrUpdateStore(e, false)}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
            >
              {storeError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg">
                  {storeError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Store Name</label>
                  <input
                    type="text"
                    required
                    value={storeForm.name}
                    onChange={(e) => setStoreForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Store URL Slug</label>
                  <input
                    type="text"
                    required
                    value={storeForm.slug}
                    onChange={(e) => setStoreForm((f) => ({ ...f, slug: e.target.value }))}
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                  {slugCheck && storeForm.slug !== activeStore?.slug && (
                    <div className={`text-[11px] mt-1 font-medium ${slugCheck.available ? 'text-emerald-700' : 'text-red-600'}`}>
                      {slugCheck.available ? 'Storefront URL is available' : slugCheck.reason || 'Unavailable'}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Store Description</label>
                <textarea
                  rows={3}
                  value={storeForm.description}
                  onChange={(e) => setStoreForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={storeForm.phone}
                    onChange={(e) => setStoreForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">WhatsApp Number</label>
                  <input
                    type="tel"
                    value={storeForm.whatsappNumber}
                    onChange={(e) => setStoreForm((f) => ({ ...f, whatsappNumber: e.target.value }))}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">District</label>
                  <select
                    value={storeForm.district}
                    onChange={(e) => setStoreForm((f) => ({ ...f, district: e.target.value }))}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {UGANDA_DISTRICTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Location / Pickup Address</label>
                  <input
                    type="text"
                    value={storeForm.locationText}
                    onChange={(e) => setStoreForm((f) => ({ ...f, locationText: e.target.value }))}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Logo & Cover Upload */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Store Logo</label>
                  <div className="flex items-center gap-3">
                    <img
                      src={storeForm.logoUrl}
                      alt="Store logo"
                      className="w-12 h-12 rounded-lg object-contain bg-[#0B0F0E] p-1.5 border border-slate-200"
                    />
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50">
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingTarget === 'logo' ? 'Uploading...' : 'Upload Logo'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        disabled={uploadingTarget !== null}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploadingTarget('logo');
                          try {
                            const url = await fileToUploadUrl(file, { storeId: activeStore?.id, bucket: 'store-logos' });
                            setStoreForm((f) => ({ ...f, logoUrl: url }));
                            showToast('Logo uploaded');
                          } catch (err) {
                            showToast(err instanceof Error ? err.message : 'Upload failed');
                          } finally {
                            setUploadingTarget(null);
                          }
                        }}
                      />
                    </label>
                    {storeForm.logoUrl.startsWith('/uploads/') && (
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch('/api/upload', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: storeForm.logoUrl }),
                          });
                          setStoreForm((f) => ({ ...f, logoUrl: '/assets/aistudio/ugabyte_icon_29c10976.png' }));
                          showToast('Logo reset to default');
                        }}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Cover Banner</label>
                  <div className="flex items-center gap-3">
                    <img
                      src={storeForm.coverUrl}
                      alt="Store cover"
                      className="w-20 h-12 rounded-lg object-cover border border-slate-200"
                    />
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50">
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingTarget === 'cover' ? 'Uploading...' : 'Upload Cover'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        disabled={uploadingTarget !== null}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploadingTarget('cover');
                          try {
                            const url = await fileToUploadUrl(file, { storeId: activeStore?.id, bucket: 'store-covers' });
                            setStoreForm((f) => ({ ...f, coverUrl: url }));
                            showToast('Cover image uploaded');
                          } catch (err) {
                            showToast(err instanceof Error ? err.message : 'Upload failed');
                          } finally {
                            setUploadingTarget(null);
                          }
                        }}
                      />
                    </label>
                    {storeForm.coverUrl.startsWith('/uploads/') && (
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch('/api/upload', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ url: storeForm.coverUrl }),
                          });
                          setStoreForm((f) => ({
                            ...f,
                            coverUrl: '/src/assets/images/hero_kampala_commerce_1795001653548.jpg',
                          }));
                          showToast('Cover reset to default');
                        }}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={storeSaving}
                className="px-5 py-2.5 text-sm font-semibold bg-[#0B0F0E] text-white hover:bg-slate-800 rounded-lg"
              >
                {storeSaving ? 'Saving...' : 'Save Store Profile'}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Add / Edit Product Modal with UgaByte AI */}
      {productModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-display text-lg font-bold text-[#0F172A]">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h2>
              <button
                type="button"
                onClick={() => setProductModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-[#0B0F0E]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={prodForm.name}
                    onChange={(e) => setProdForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Handmade Kitenge Laptop Sleeve"
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={handleRunAiAssist}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold bg-[#BAFF00] text-[#0B0F0E] hover:bg-[#a6e600] rounded-lg whitespace-nowrap shrink-0"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  {aiLoading ? 'Generating...' : 'UgaByte AI Copy'}
                </button>
              </div>

              {aiSuggestion && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#0F172A]">UgaByte AI Suggestions (Review before applying)</span>
                    <button
                      type="button"
                      onClick={() => {
                        const matchedCat = categories.find(
                          (c) => c.name.toLowerCase() === (aiSuggestion.suggestedCategory || '').toLowerCase()
                        );
                        setProdForm((f) => ({
                          ...f,
                          name: aiSuggestion.improvedTitle || f.name,
                          description: aiSuggestion.description || f.description,
                          categoryId: matchedCat ? matchedCat.id : f.categoryId,
                        }));
                        showToast('Applied AI title, description, and category');
                      }}
                      className="px-2.5 py-1 bg-[#0B0F0E] text-white font-semibold rounded"
                    >
                      Apply to Form
                    </button>
                  </div>
                  <div>
                    <strong>Title:</strong> {aiSuggestion.improvedTitle}
                  </div>
                  <div>
                    <strong>Description:</strong> {aiSuggestion.description}
                  </div>
                  <div>
                    <strong>Suggested Category:</strong> {aiSuggestion.suggestedCategory}
                  </div>
                  <div>
                    <strong>WhatsApp Promo:</strong> {aiSuggestion.whatsappPromo}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={prodForm.description}
                  onChange={(e) => setProdForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Describe size, materials, origin, or warranty..."
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Price (UGX) *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={prodForm.price}
                    onChange={(e) => setProdForm((f) => ({ ...f, price: e.target.value }))}
                    placeholder="45000"
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Compare-at Price</label>
                  <input
                    type="number"
                    min="0"
                    value={prodForm.compareAtPrice}
                    onChange={(e) => setProdForm((f) => ({ ...f, compareAtPrice: e.target.value }))}
                    placeholder="55000"
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Stock Quantity *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={prodForm.stockQuantity}
                    onChange={(e) => setProdForm((f) => ({ ...f, stockQuantity: e.target.value }))}
                    className="w-full px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={prodForm.categoryId}
                    onChange={(e) => setProdForm((f) => ({ ...f, categoryId: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">Select category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Condition</label>
                  <select
                    value={prodForm.condition}
                    onChange={(e) => setProdForm((f) => ({ ...f, condition: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="new">New</option>
                    <option value="used">Used</option>
                    <option value="refurbished">Refurbished</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Visibility</label>
                  <select
                    value={prodForm.status}
                    onChange={(e) => setProdForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
              </div>

              {/* Product Image Upload */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Product Photos</label>
                <div className="flex flex-wrap items-center gap-3">
                  {prodForm.images.map((url, idx) => (
                    <div key={url + idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200">
                      <img src={url} alt="Uploaded product" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        aria-label="Delete product image"
                        onClick={async () => {
                          if (url.startsWith('/uploads/')) {
                            await fetch('/api/upload', {
                              method: 'DELETE',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ url }),
                            }).catch(() => {});
                          }
                          setProdForm((f) => ({
                            ...f,
                            images: f.images.filter((_, i) => i !== idx),
                          }));
                        }}
                        className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border border-dashed border-slate-300 rounded-lg hover:bg-slate-50">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingTarget === 'product' ? 'Uploading...' : 'Upload Photo'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={uploadingTarget !== null}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setUploadingTarget('product');
                        try {
                          const url = await fileToUploadUrl(file, { storeId: activeStore?.id, bucket: 'product-images' });
                          setProdForm((f) => ({ ...f, images: [...f.images, url] }));
                          showToast('Photo uploaded');
                        } catch (err) {
                          showToast(err instanceof Error ? err.message : 'Upload failed');
                        } finally {
                          setUploadingTarget(null);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setProductModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-[#0B0F0E]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={prodSaving}
                  className="px-5 py-2 text-sm font-semibold bg-[#0B0F0E] text-white hover:bg-slate-800 rounded-lg"
                >
                  {prodSaving ? 'Saving...' : editingProduct ? 'Save Changes' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
