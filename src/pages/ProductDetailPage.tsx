import { ArrowLeft, Check, Heart, MessageCircle, Minus, Plus, ShieldCheck, Store as StoreIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { buildWhatsappLink, formatUgx } from '../lib/format';
import type { Product } from '../types';

export function ProductDetailPage({ slug }: { slug: string }) {
  const { navigate, addToCart, favoriteProductIds, toggleFavoriteProduct } = useApp();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/products/${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Product not found');
        return d;
      })
      .then((d) => {
        setProduct(d.product);
        setSelectedImage(d.product.images?.[0]?.storage_path || null);
        setQty(1);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 animate-pulse grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-7 aspect-[4/3] bg-slate-200 rounded-xl" />
        <div className="lg:col-span-5 space-y-4">
          <div className="h-4 bg-slate-200 rounded w-1/3" />
          <div className="h-8 bg-slate-200 rounded w-3/4" />
          <div className="h-6 bg-slate-200 rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#0F172A]">Product unavailable</h1>
        <p className="text-slate-600 text-sm">{error || 'This listing could not be found.'}</p>
        <button
          type="button"
          onClick={() => navigate('/market')}
          className="px-4 py-2 text-sm font-semibold bg-[#0B0F0E] text-white rounded-lg"
        >
          Back to UgaByte Market
        </button>
      </div>
    );
  }

  const isFav = favoriteProductIds.includes(product.id);
  const images = product.images || [];
  const mainImg = selectedImage || images[0]?.storage_path || null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-16 space-y-8">
      <button
        type="button"
        onClick={() => navigate('/market')}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#0B0F0E]"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Market
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        {/* Left Sticky Gallery */}
        <div className="lg:col-span-7 space-y-4 lg:sticky lg:top-24">
          <div className="aspect-[4/3] bg-white border border-slate-200 rounded-xl overflow-hidden">
            {mainImg ? (
              <img
                src={mainImg}
                alt={product.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                No product photo available
              </div>
            )}
          </div>

          {images.length > 1 && (
            <div className="grid grid-cols-4 gap-3">
              {images.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setSelectedImage(img.storage_path)}
                  className={`aspect-[4/3] rounded-lg overflow-hidden border-2 transition-colors ${
                    mainImg === img.storage_path ? 'border-[#0B0F0E]' : 'border-slate-200'
                  }`}
                >
                  <img
                    src={img.storage_path}
                    alt={img.alt_text || product.name}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Contiguous Purchase Module */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>{product.category_name || 'General'}</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">{product.condition}</span>
              {product.sku && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{product.sku}</span>
                </>
              )}
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0F172A] leading-tight">
              {product.name}
            </h1>

            <div className="flex items-baseline gap-3 pt-1">
              <span className="font-mono text-2xl font-bold text-[#0B0F0E] tabular-nums">
                {formatUgx(product.price)}
              </span>
              {product.compare_at_price && product.compare_at_price > product.price && (
                <span className="font-mono text-sm text-slate-400 line-through tabular-nums">
                  {formatUgx(product.compare_at_price)}
                </span>
              )}
            </div>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
            {product.description || 'Quality verified item listed by a UgaByte Commerce merchant.'}
          </p>

          {/* Availability & Quantity */}
          <div className="pt-4 border-t border-slate-100 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Availability</span>
              <span className="font-medium text-[#0F172A] tabular-nums">
                {product.stock_quantity > 0 ? `${product.stock_quantity} units available` : 'Out of stock'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="inline-flex items-center border border-slate-300 rounded-lg">
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="p-2.5 text-slate-700 hover:bg-slate-100"
                  aria-label="Decrease quantity"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="px-4 font-mono text-sm font-semibold tabular-nums">{qty}</span>
                <button
                  type="button"
                  onClick={() => setQty((q) => Math.min(Math.max(1, product.stock_quantity), q + 1))}
                  className="p-2.5 text-slate-700 hover:bg-slate-100"
                  aria-label="Increase quantity"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                disabled={product.stock_quantity <= 0}
                onClick={() => addToCart(product, qty)}
                className="flex-1 py-3 px-5 text-sm font-semibold bg-[#0B0F0E] text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 rounded-lg transition-colors"
              >
                Add to Cart
              </button>

              <button
                type="button"
                onClick={() => toggleFavoriteProduct(product.id)}
                aria-label="Save product"
                className="p-3 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
              >
                <Heart className={`w-4 h-4 ${isFav ? 'fill-[#0B0F0E] text-[#0B0F0E]' : ''}`} />
              </button>
            </div>

            <button
              type="button"
              disabled={product.stock_quantity <= 0}
              onClick={() => {
                addToCart(product, qty);
                navigate('/checkout');
              }}
              className="w-full py-3 px-5 text-sm font-semibold bg-[#BAFF00] text-[#0B0F0E] hover:bg-[#a6e600] disabled:bg-slate-100 disabled:text-slate-400 rounded-lg transition-colors"
            >
              Buy Now — Pay on Delivery or Mobile Money
            </button>
          </div>

          {/* Seller Info & WhatsApp */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => navigate(`/store/${product.store_slug}`)}
                className="flex items-center gap-2.5 text-left group"
              >
                <div className="w-9 h-9 rounded-lg bg-[#0B0F0E] p-1.5 shrink-0">
                  <img
                    src={product.store_logo || '/assets/aistudio/ugabyte_icon_29c10976.png'}
                    alt={product.store_name}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#0F172A] group-hover:underline flex items-center gap-1">
                    {product.store_name}
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="text-xs text-slate-500">
                    {product.store_location || product.store_district || 'Uganda'}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => navigate(`/store/${product.store_slug}`)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-[#0B0F0E]"
              >
                <StoreIcon className="w-3.5 h-3.5" />
                Visit Store
              </button>
            </div>

            <a
              href={buildWhatsappLink(
                product.store_whatsapp || product.store_phone,
                `Hello ${product.store_name}, I saw "${product.name}" (${formatUgx(product.price)}) on UgaByte Commerce and would like to ask about availability.`
              )}
              target="_blank"
              rel="noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium border border-slate-300 text-slate-800 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              Chat with Seller on WhatsApp
            </a>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Pickup in {product.store_district || 'Kampala'} or local rider delivery</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
