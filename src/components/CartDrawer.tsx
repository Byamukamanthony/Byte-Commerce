import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatUgx } from '../lib/format';

export function CartDrawer() {
  const { cart, cartOpen, setCartOpen, updateCartQty, removeFromCart, cartSubtotal, navigate } = useApp();

  if (!cartOpen) return null;

  const grouped = cart.reduce<Record<string, { storeName: string; storeSlug: string; items: typeof cart }>>(
    (acc, item) => {
      if (!acc[item.storeId]) {
        acc[item.storeId] = { storeName: item.storeName, storeSlug: item.storeSlug, items: [] };
      }
      acc[item.storeId].items.push(item);
      return acc;
    },
    {}
  );

  const storeCount = Object.keys(grouped).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[1px]"
        onClick={() => setCartOpen(false)}
      />

      <aside className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-slate-200">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-[#0B0F0E]" />
            <h2 className="font-display text-lg font-bold text-[#0F172A]">Your Cart</h2>
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(false)}
            aria-label="Close cart"
            className="p-2 text-slate-500 hover:text-[#0B0F0E] rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {cart.length === 0 ? (
            <div className="py-16 text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <p className="font-display font-semibold text-slate-900">Your cart is empty</p>
                <p className="mt-1 text-sm text-slate-500">
                  Browse Ugandan storefronts on UgaByte Market to add items.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCartOpen(false);
                  navigate('/market');
                }}
                className="inline-flex items-center px-4 py-2 text-sm font-semibold bg-[#0B0F0E] text-white rounded-lg"
              >
                Explore Market
              </button>
            </div>
          ) : (
            <>
              {storeCount > 1 && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                  Items from {storeCount} stores will create {storeCount} separate store orders at checkout so each business fulfills directly.
                </div>
              )}

              {Object.entries(grouped).map(([storeId, group]) => (
                <div key={storeId} className="space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCartOpen(false);
                        navigate(`/store/${group.storeSlug}`);
                      }}
                      className="text-xs font-semibold text-slate-700 hover:text-[#0B0F0E]"
                    >
                      {group.storeName}
                    </button>
                    <span className="text-xs text-slate-400 tabular-nums">
                      {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>

                  {group.items.map((item) => (
                    <div key={item.productId} className="flex gap-3 items-start">
                      <div className="w-16 h-16 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        ) : null}
                      </div>

                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            setCartOpen(false);
                            navigate(`/product/${item.slug}`);
                          }}
                          className="text-sm font-semibold text-[#0F172A] hover:underline text-left line-clamp-1"
                        >
                          {item.name}
                        </button>
                        <div className="mt-0.5 font-mono text-xs font-medium text-slate-700 tabular-nums">
                          {formatUgx(item.price)}
                        </div>

                        <div className="mt-2 flex items-center justify-between">
                          <div className="inline-flex items-center border border-slate-200 rounded-lg">
                            <button
                              type="button"
                              aria-label="Decrease quantity"
                              onClick={() => updateCartQty(item.productId, item.quantity - 1)}
                              className="p-1.5 text-slate-600 hover:text-[#0B0F0E]"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="px-2.5 text-xs font-mono font-semibold tabular-nums">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              aria-label="Increase quantity"
                              onClick={() => updateCartQty(item.productId, item.quantity + 1)}
                              disabled={item.quantity >= item.maxStock}
                              className="p-1.5 text-slate-600 hover:text-[#0B0F0E] disabled:opacity-40"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeFromCart(item.productId)}
                            aria-label="Remove item"
                            className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>

        {cart.length > 0 && (
          <div className="p-6 border-t border-slate-200 bg-slate-50 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Subtotal (excluding delivery)</span>
              <span className="font-mono text-base font-bold text-[#0B0F0E] tabular-nums">
                {formatUgx(cartSubtotal)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setCartOpen(false);
                  navigate('/cart');
                }}
                className="px-4 py-2.5 text-sm font-semibold text-[#0B0F0E] bg-white border border-slate-300 hover:bg-slate-100 rounded-lg transition-colors"
              >
                View Cart
              </button>
              <button
                type="button"
                onClick={() => {
                  setCartOpen(false);
                  navigate('/checkout');
                }}
                className="px-4 py-2.5 text-sm font-semibold text-[#0B0F0E] bg-[#BAFF00] hover:bg-[#a6e600] rounded-lg transition-colors"
              >
                Checkout
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
