import { Heart, Package, Plus } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatUgx } from '../lib/format';
import type { Product } from '../types';

export function ProductCard({ product }: { product: Product }) {
  const { navigate, addToCart, favoriteProductIds, toggleFavoriteProduct } = useApp();
  const [imgError, setImgError] = useState(false);
  const isFav = favoriteProductIds.includes(product.id);
  const imgSrc = product.primary_image || product.images?.[0]?.storage_path || null;

  return (
    <article className="group bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
        <button
          type="button"
          onClick={() => navigate(`/product/${product.slug}`)}
          className="block w-full h-full text-left"
        >
          {imgSrc && !imgError ? (
            <img
              src={imgSrc}
              alt={product.name}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-100 to-slate-200 text-slate-500">
              <Package className="w-8 h-8 mb-2 opacity-60" />
              <span className="text-xs font-medium text-center line-clamp-2">{product.name}</span>
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleFavoriteProduct(product.id);
          }}
          aria-label={isFav ? 'Remove from saved products' : 'Save product'}
          className="absolute top-3 right-3 w-9 h-9 rounded-lg bg-white/90 backdrop-blur-sm border border-slate-200 flex items-center justify-center text-slate-700 hover:text-[#0B0F0E] transition-colors"
        >
          <Heart className={`w-4 h-4 ${isFav ? 'fill-[#0B0F0E] text-[#0B0F0E]' : ''}`} />
        </button>
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
            <span>{product.category_name || 'Marketplace'}</span>
            {product.store_district && (
              <>
                <span aria-hidden="true">·</span>
                <span>{product.store_district}</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate(`/product/${product.slug}`)}
            className="mt-1 block text-left font-display text-base font-semibold text-[#0F172A] hover:underline line-clamp-2"
          >
            {product.name}
          </button>

          {product.store_name && (
            <button
              type="button"
              onClick={() => navigate(`/store/${product.store_slug}`)}
              className="mt-1 text-xs font-medium text-slate-600 hover:text-[#0B0F0E] transition-colors truncate block"
            >
              Sold by {product.store_name}
            </button>
          )}
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
          <div>
            <div className="font-mono text-[15px] font-semibold text-[#0B0F0E] tabular-nums">
              {formatUgx(product.price)}
            </div>
            {product.compare_at_price && product.compare_at_price > product.price ? (
              <div className="font-mono text-xs text-slate-400 line-through tabular-nums">
                {formatUgx(product.compare_at_price)}
              </div>
            ) : (
              <div className="text-xs text-slate-500 tabular-nums">
                {product.stock_quantity > 0 ? `${product.stock_quantity} in stock` : 'Out of stock'}
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={product.stock_quantity <= 0}
            onClick={() => addToCart(product, 1)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-[#0B0F0E] text-white hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
      </div>
    </article>
  );
}
