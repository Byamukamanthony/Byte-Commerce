import { ArrowRight, MapPin, Search, Store as StoreIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ProductCard } from '../components/ProductCard';
import { useApp } from '../context/AppContext';
import { UGANDA_DISTRICTS } from '../lib/format';
import type { Product, Store } from '../types';

export function MarketPage({ initialCategory }: { initialCategory?: string }) {
  const { categories, navigate } = useApp();
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(initialCategory || 'all');
  const [district, setDistrict] = useState('all');
  const [storeFilter, setStoreFilter] = useState('all');
  const [maxPrice, setMaxPrice] = useState('');
  const [sort, setSort] = useState('newest');
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setCategory(initialCategory || 'all');
    setPage(1);
  }, [initialCategory]);

  useEffect(() => {
    fetch('/api/stores')
      .then((r) => r.json())
      .then((d) => setStores(d.stores || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    if (category && category !== 'all') params.set('category', category);
    if (district && district !== 'all') params.set('district', district);
    if (storeFilter && storeFilter !== 'all') params.set('store', storeFilter);
    if (maxPrice) params.set('maxPrice', maxPrice);
    params.set('sort', sort);
    params.set('page', String(page));
    params.set('limit', '12');

    fetch(`/api/market/products?${params.toString()}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        setProducts(data.products || []);
        setTotalCount(data.pagination?.total ?? 0);
        setTotalPages(data.pagination?.totalPages ?? 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [search, category, district, storeFilter, maxPrice, sort, page]);

  return (
    <div className="space-y-12 pb-16">
      {/* Section 1: Editorial Hero (Light Mode) */}
      <section className="bg-white border-b border-slate-200 text-[#0F172A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 lg:py-14 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between gap-6 py-2">
            <div className="space-y-4">
              <div className="text-xs font-semibold text-[#3F6212] tracking-wide">
                UgaByte Commerce · Kampala & Across Uganda
              </div>
              <h1
                className="font-display font-bold tracking-tight text-[#0F172A] leading-[1.1] max-w-xl"
                style={{ fontSize: 'clamp(2rem, 3.8vw, 3.25rem)', textWrap: 'balance' }}
              >
                Buy from Ugandan businesses. Launch your own store in minutes.
              </h1>
              <p className="text-slate-600 text-base leading-relaxed max-w-lg">
                One shared marketplace and independent merchant storefronts with transparent UGX pricing, stock verification, direct order submission, and WhatsApp follow-up.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <a
                href="#catalogue"
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold bg-[#BAFF00] text-[#0B0F0E] hover:bg-[#a6e600] rounded-lg transition-colors whitespace-nowrap"
              >
                Browse Marketplace
                <ArrowRight className="w-4 h-4" />
              </a>
              <button
                type="button"
                onClick={() => navigate('/business')}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold bg-slate-100 text-[#0B0F0E] hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors whitespace-nowrap"
              >
                Open Your Store
              </button>
            </div>
          </div>

          <div className="lg:col-span-6 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 min-h-[260px] lg:min-h-[340px]">
            <img
              src="/src/assets/images/hero_kampala_commerce_1795001653548.jpg"
              alt="Curated Ugandan products from UgaByte Commerce merchants"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Section 2: Marketplace Discovery & Filter Toolbar */}
      <section id="catalogue" className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#0F172A]">UgaByte Market</h2>
            <p className="text-sm text-slate-600 mt-1 tabular-nums">
              {totalCount} published {totalCount === 1 ? 'product' : 'products'} from verified active stores
            </p>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1 sm:flex-initial">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products or stores..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#0B0F0E]"
              />
            </div>

            <select
              aria-label="Filter by district"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-[#0B0F0E]"
            >
              <option value="all">All Districts</option>
              {UGANDA_DISTRICTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by store"
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-[#0B0F0E]"
            >
              <option value="all">All Stores</option>
              {stores.map((s) => (
                <option key={s.id} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Max price in UGX"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-[#0B0F0E]"
            >
              <option value="">Any Price (UGX)</option>
              <option value="50000">Under UGX 50,000</option>
              <option value="150000">Under UGX 150,000</option>
              <option value="300000">Under UGX 300,000</option>
            </select>

            <select
              aria-label="Sort products"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-[#0B0F0E]"
            >
              <option value="newest">Featured & Newest</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
            </select>
          </div>
        </div>

        {/* Category Segmented Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => {
              setCategory('all');
              navigate('/market');
            }}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors ${
              category === 'all'
                ? 'bg-[#0B0F0E] text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            All Categories
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setCategory(cat.slug);
                navigate(`/market/${cat.slug}`);
              }}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                category === cat.slug
                  ? 'bg-[#0B0F0E] text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="bg-white border border-slate-200 rounded-xl overflow-hidden animate-pulse">
                <div className="aspect-[4/3] bg-slate-200" />
                <div className="p-4 space-y-3">
                  <div className="h-3 bg-slate-200 rounded w-1/3" />
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="h-8 bg-slate-200 rounded w-full mt-4" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
            <p className="font-display text-lg font-semibold text-[#0F172A]">No matching products found</p>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Try clearing your search or price filter, or explore another Ugandan district.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCategory('all');
                setDistrict('all');
                setStoreFilter('all');
                setMaxPrice('');
              }}
              className="px-4 py-2 text-sm font-semibold bg-[#0B0F0E] text-white rounded-lg"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-4">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-4 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-xs font-mono text-slate-600 tabular-nums">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-4 py-2 text-xs font-semibold bg-white border border-slate-200 rounded-lg disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Section 3: Active Independent Storefronts */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
        <div className="flex items-end justify-between border-t border-slate-200 pt-10">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#0F172A]">UgaByte Storefronts</h2>
            <p className="text-sm text-slate-600 mt-1">
              Independent online shops with shareable URLs and verified contact details
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/business')}
            className="text-sm font-semibold text-[#0B0F0E] hover:underline whitespace-nowrap"
          >
            Create your storefront →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {stores.map((store) => (
            <button
              key={store.id}
              type="button"
              onClick={() => navigate(`/store/${store.slug}`)}
              className="text-left bg-white border border-slate-200 rounded-xl overflow-hidden hover:-translate-y-0.5 hover:shadow-md transition-all flex flex-col"
            >
              <div className="h-32 bg-slate-900 relative overflow-hidden">
                {store.cover_url && (
                  <img
                    src={store.cover_url}
                    alt={store.name}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover opacity-80"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute bottom-3 left-4 right-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#0B0F0E] border border-white/20 p-1.5 shrink-0">
                    <img
                      src={store.logo_url || '/assets/aistudio/ugabyte_icon_29c10976.png'}
                      alt={store.name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="font-display font-bold text-white truncate">{store.name}</div>
                    <div className="text-xs text-slate-200 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      <span>{store.district || 'Uganda'}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                <p className="text-sm text-slate-600 line-clamp-2">{store.description}</p>
                <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                  <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                    <StoreIcon className="w-3.5 h-3.5" />
                    /store/{store.slug}
                  </span>
                  <span className="tabular-nums font-medium">
                    {store.product_count || 0} products
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
