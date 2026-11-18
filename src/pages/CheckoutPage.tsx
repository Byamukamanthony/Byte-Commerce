import { AlertTriangle, ArrowLeft, CheckCircle2, Minus, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatUgx, UGANDA_DISTRICTS } from '../lib/format';
import type { Order } from '../types';

export function CheckoutPage({ mode = 'checkout' }: { mode?: 'cart' | 'checkout' }) {
  const {
    user,
    cart,
    updateCartQty,
    removeFromCart,
    clearCart,
    revalidateCart,
    cartSubtotal,
    navigate,
    showToast,
  } = useApp();

  const [customerName, setCustomerName] = useState(user?.full_name || '');
  const [customerPhone, setCustomerPhone] = useState(user?.phone || '');
  const [customerEmail, setCustomerEmail] = useState(user?.email || '');
  const [deliveryDistrict, setDeliveryDistrict] = useState(user?.district || 'Kampala');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'seller_delivery' | 'third_party'>(
    'seller_delivery'
  );
  const [customerNote, setCustomerNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cartWarnings, setCartWarnings] = useState<string[]>([]);
  const [createdOrders, setCreatedOrders] = useState<Order[] | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState<string>('');
  const [idempotencyKey] = useState(() => `chk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const revalidatedOnce = useRef(false);

  useEffect(() => {
    if (user) {
      setCustomerName((prev) => prev || user.full_name || '');
      setCustomerPhone((prev) => prev || user.phone || '');
      setCustomerEmail((prev) => prev || user.email || '');
      setDeliveryDistrict((prev) => prev || user.district || 'Kampala');
    }
  }, [user]);

  useEffect(() => {
    if (cart.length > 0 && !revalidatedOnce.current) {
      revalidatedOnce.current = true;
      revalidateCart().then((issues) => {
        if (issues.length > 0) setCartWarnings(issues);
      });
    }
  }, [cart.length, revalidateCart]);

  const storeGroups = useMemo(() => {
    const map = new Map<string, { storeName: string; storeSlug: string; items: typeof cart }>();
    for (const item of cart) {
      const bucket = map.get(item.storeId) || {
        storeName: item.storeName,
        storeSlug: item.storeSlug,
        items: [],
      };
      bucket.items.push(item);
      map.set(item.storeId, bucket);
    }
    return Array.from(map.entries());
  }, [cart]);

  const perStoreDeliveryFee = useMemo(() => {
    if (deliveryMethod === 'pickup') return 0;
    if (deliveryMethod === 'third_party') return 12000;
    return deliveryDistrict.toLowerCase() === 'kampala' ? 5000 : 10000;
  }, [deliveryMethod, deliveryDistrict]);

  const estimatedDeliveryTotal = perStoreDeliveryFee * Math.max(1, storeGroups.length);
  const estimatedGrandTotal = cartSubtotal + (cart.length > 0 ? estimatedDeliveryTotal : 0);

  if (createdOrders) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#BAFF00] text-[#0B0F0E] flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-[#0F172A]">
                {createdOrders.length > 1 ? `${createdOrders.length} Orders Submitted` : 'Order Submitted'}
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                {confirmationMessage ||
                  'Your order has been submitted. The seller will contact you to confirm fulfilment and payment arrangements.'}
              </p>
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-200 pt-5">
            {createdOrders.map((ord) => (
              <div
                key={ord.id}
                className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="font-mono text-sm font-bold text-[#0B0F0E]">{ord.order_number}</div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    {ord.store_name} · Total:{' '}
                    <span className="font-mono font-semibold tabular-nums">{formatUgx(ord.total)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/orders/${ord.order_number}`)}
                  className="px-4 py-2 text-xs font-semibold bg-[#0B0F0E] text-white hover:bg-slate-800 rounded-lg whitespace-nowrap"
                >
                  Track Order →
                </button>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/market')}
              className="px-4 py-2.5 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-[#0B0F0E] rounded-lg"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (cart.length === 0) {
      setError('Your cart is empty.');
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      setError('Please provide your full name and Ugandan phone number.');
      return;
    }
    if (deliveryMethod !== 'pickup' && !deliveryAddress.trim()) {
      setError('Please enter your delivery street, stage, or landmark.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim() || null,
          deliveryMethod,
          deliveryDistrict,
          deliveryAddress: deliveryAddress.trim(),
          customerNote: customerNote.trim() || null,
          items: cart.map((c) => ({ productId: c.productId, quantity: c.quantity })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Could not submit order.');
      }
      clearCart();
      setConfirmationMessage(
        data.message ||
          'Your order has been submitted. The seller will contact you to confirm fulfilment and payment arrangements.'
      );
      setCreatedOrders(data.orders || []);
      showToast('Order submitted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#0F172A]">Your cart is empty</h1>
        <p className="text-sm text-slate-600">Add products from UgaByte Market or any storefront to check out.</p>
        <button
          type="button"
          onClick={() => navigate('/market')}
          className="px-5 py-2.5 text-sm font-semibold bg-[#0B0F0E] text-white rounded-lg"
        >
          Browse Market
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-16 space-y-6">
      <button
        type="button"
        onClick={() => navigate('/market')}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#0B0F0E]"
      >
        <ArrowLeft className="w-4 h-4" />
        Continue Shopping
      </button>

      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0F172A]">
          {mode === 'cart' ? 'Shopping Cart' : 'UgaByte Checkout'}
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Submit your order and arrange payment directly with the seller. Final prices and stock are verified in UGX on submission.
        </p>
      </div>

      {cartWarnings.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-sm text-amber-900">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-700" />
          <div className="space-y-1">
            <div className="font-semibold">Your cart was updated from live store inventory:</div>
            <ul className="list-disc pl-4 text-xs space-y-0.5">
              {cartWarnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Cart Items / Customer Form */}
        <div className="lg:col-span-7 space-y-6">
          {/* Grouped Cart Items */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="font-display text-lg font-bold text-[#0F172A]">Order Items</h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {storeGroups.length} {storeGroups.length === 1 ? 'store' : 'stores'}
              </span>
            </div>

            {storeGroups.map(([storeId, group]) => (
              <div key={storeId} className="space-y-3">
                <div className="text-xs font-semibold text-slate-700">
                  Fulfilled by {group.storeName}
                </div>
                {group.items.map((item) => (
                  <div
                    key={item.productId}
                    className="flex items-center justify-between gap-4 py-3 border-t border-slate-100"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-14 h-14 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                        {item.image && (
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#0F172A] truncate">{item.name}</div>
                        <div className="font-mono text-xs text-slate-600 tabular-nums">
                          {formatUgx(item.price)} each
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="inline-flex items-center border border-slate-200 rounded-lg">
                        <button
                          type="button"
                          onClick={() => updateCartQty(item.productId, item.quantity - 1)}
                          className="p-1.5 text-slate-600"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-2.5 font-mono text-xs font-semibold tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateCartQty(item.productId, item.quantity + 1)}
                          disabled={item.quantity >= item.maxStock}
                          className="p-1.5 text-slate-600 disabled:opacity-40"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="font-mono text-sm font-semibold text-[#0B0F0E] w-28 text-right tabular-nums">
                        {formatUgx(item.price * item.quantity)}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.productId)}
                        className="p-1.5 text-slate-400 hover:text-red-600"
                        aria-label="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Checkout Form */}
          <form id="checkout-form" onSubmit={handleSubmitOrder} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <h2 className="font-display text-lg font-bold text-[#0F172A] border-b border-slate-100 pb-3">
              Customer & Delivery Details
            </h2>

            {error && (
              <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Full Name *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Sarah Namukasa"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B0F0E]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Ugandan Phone / WhatsApp *
                </label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+256 772 000 000"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B0F0E]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Email (optional)
                </label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B0F0E]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">District</label>
                <select
                  value={deliveryDistrict}
                  onChange={(e) => setDeliveryDistrict(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#0B0F0E]"
                >
                  {UGANDA_DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Delivery Method */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Delivery Method</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {[
                  { id: 'seller_delivery', title: 'Seller Delivery', sub: 'UGX 5,000–10,000 / store' },
                  { id: 'pickup', title: 'Customer Pickup', sub: 'Free at store' },
                  { id: 'third_party', title: 'Courier Rider', sub: 'UGX 12,000 / store' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDeliveryMethod(opt.id as typeof deliveryMethod)}
                    className={`p-3 text-left rounded-lg border transition-colors ${
                      deliveryMethod === opt.id
                        ? 'border-[#0B0F0E] bg-slate-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-xs font-semibold text-[#0F172A]">{opt.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{opt.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {deliveryMethod !== 'pickup' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Delivery Location / Street / Stage *
                </label>
                <input
                  type="text"
                  required
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="e.g. Ntinda Kiwatule Road, near Shell"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B0F0E]"
                />
              </div>
            )}

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 leading-relaxed">
              <strong>Direct Payment Arrangement:</strong> No online payment or mobile money PIN is collected on UgaByte. Submit your order and arrange payment directly with the seller when confirming delivery or pickup.
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Order / Delivery Note (optional)
              </label>
              <textarea
                rows={2}
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                placeholder="Any preferred delivery time or landmark details..."
                className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B0F0E]"
              />
            </div>
          </form>
        </div>

        {/* Right: Summary */}
        <aside className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5 lg:sticky lg:top-24">
          <h2 className="font-display text-lg font-bold text-[#0F172A] border-b border-slate-100 pb-3">
            Order Summary
          </h2>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Items Subtotal</span>
              <span className="font-mono font-medium tabular-nums">{formatUgx(cartSubtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">
                Delivery ({storeGroups.length} {storeGroups.length === 1 ? 'store' : 'stores'})
              </span>
              <span className="font-mono font-medium tabular-nums">
                {estimatedDeliveryTotal === 0 ? 'UGX 0' : formatUgx(estimatedDeliveryTotal)}
              </span>
            </div>
            <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
              <span className="font-semibold text-[#0F172A]">Order Total (UGX)</span>
              <span className="font-mono text-xl font-bold text-[#0B0F0E] tabular-nums">
                {formatUgx(estimatedGrandTotal)}
              </span>
            </div>
          </div>

          <button
            type="submit"
            form="checkout-form"
            disabled={submitting}
            className="w-full py-3.5 px-5 text-sm font-semibold bg-[#BAFF00] text-[#0B0F0E] hover:bg-[#a6e600] disabled:opacity-60 rounded-lg transition-colors"
          >
            {submitting ? 'Submitting Order...' : `Submit Order · ${formatUgx(estimatedGrandTotal)}`}
          </button>

          <div className="flex items-start gap-2 text-xs text-slate-500 pt-1">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              Submit your order and arrange payment directly with the seller. Stock is reserved on the UgaByte server when your order is submitted.
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
