import { ArrowLeft, Check, Copy, MapPin, MessageCircle, Phone, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ProductCard } from '../components/ProductCard';
import { useApp } from '../context/AppContext';
import { buildWhatsappLink } from '../lib/format';
import type { Product, Store } from '../types';

export function StorefrontPage({ slug }: { slug: string }) {
  const { navigate, showToast } = useApp();
  const [store, setStore] = useState<Store | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/stores/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Storefront unavailable');
        return d;
      })
      .then((d) => {
        setStore(d.store);
        setProducts(d.products || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-6 animate-pulse">
        <div className="h-56 bg-slate-200 rounded-xl" />
        <div className="h-8 bg-slate-200 rounded w-1/3" />
      </div>
    );
  }

  if (error || !store) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#0F172A]">Storefront not found</h1>
        <p className="text-sm text-slate-600">{error || 'This storefront is either pending approval or inactive.'}</p>
        <button
          type="button"
          onClick={() => navigate('/market')}
          className="px-4 py-2 text-sm font-semibold bg-[#0B0F0E] text-white rounded-lg"
        >
          Explore UgaByte Market
        </button>
      </div>
    );
  }

  const storeCategories = Array.from(
    new Map(
      products
        .filter((p) => p.category_slug && p.category_name)
        .map((p) => [p.category_slug!, p.category_name!])
    ).entries()
  );

  const visibleProducts =
    activeCategory === 'all' ? products : products.filter((p) => p.category_slug === activeCategory);

  const shareUrl = `${window.location.origin}/store/${store.slug}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      showToast('Storefront link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast(shareUrl);
    }
  };

  return (
    <div className="pb-16 space-y-8">
      {/* Cover & Identity Header */}
      <section className="bg-[#0B0F0E] text-white border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <button
            type="button"
            onClick={() => navigate('/market')}
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 hover:text-white mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            UgaByte Market
          </button>

          <div className="relative rounded-xl overflow-hidden border border-white/10 min-h-[220px] flex items-end">
            {store.cover_url && (
              <img
                src={store.cover_url}
                alt={store.name}
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover opacity-55"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />

            <div className="relative w-full p-6 sm:p-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-[#0B0F0E] border border-white/20 p-2 shrink-0">
                  <img
                    src={store.logo_url || '/assets/aistudio/ugabyte_icon_29c10976.png'}
                    alt={store.name}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">{store.name}</h1>
                    {store.status === 'active' && (
                      <ShieldCheck className="w-5 h-5 text-[#BAFF00] shrink-0" aria-label="Verified active store" />
                    )}
                  </div>
                  <p className="text-sm text-slate-200 max-w-2xl">{store.description}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 pt-1">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-[#BAFF00]" />
                      {store.location_text ? `${store.location_text}, ${store.district}` : store.district || 'Uganda'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">Store status: {store.status}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{products.length} published items</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                {store.phone && (
                  <a
                    href={`tel:${store.phone}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/15 rounded-lg"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    Call Store
                  </a>
                )}
                <a
                  href={buildWhatsappLink(
                    store.whatsapp_number || store.phone,
                    `Hello ${store.name}, I am browsing your UgaByte storefront (${shareUrl}).`
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#BAFF00] text-[#0B0F0E] hover:bg-[#a6e600] rounded-lg"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  WhatsApp Store
                </a>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white text-[#0B0F0E] hover:bg-slate-100 rounded-lg"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Link Copied' : 'Share Store'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Storefront Catalogue */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
        {store.status !== 'active' && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-900">
            Preview mode: This storefront is currently <strong>{store.status}</strong> and is not yet listed on the public UgaByte Market until approved by an admin.
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-display text-xl font-bold text-[#0F172A]">Store Catalogue</h2>

          {storeCategories.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <button
                type="button"
                onClick={() => setActiveCategory('all')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                  activeCategory === 'all'
                    ? 'bg-[#0B0F0E] text-white'
                    : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                All ({products.length})
              </button>
              {storeCategories.map(([catSlug, catName]) => (
                <button
                  key={catSlug}
                  type="button"
                  onClick={() => setActiveCategory(catSlug)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap ${
                    activeCategory === catSlug
                      ? 'bg-[#0B0F0E] text-white'
                      : 'bg-white border border-slate-200 text-slate-700'
                  }`}
                >
                  {catName}
                </button>
              ))}
            </div>
          )}
        </div>

        {visibleProducts.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-2">
            <p className="font-display font-semibold text-[#0F172A]">No published products yet</p>
            <p className="text-sm text-slate-500">Check back soon for new arrivals from {store.name}.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={{
                  ...product,
                  store_name: store.name,
                  store_slug: store.slug,
                  store_district: store.district || undefined,
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
