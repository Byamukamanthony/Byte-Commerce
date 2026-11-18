import { ArrowLeft, CheckCircle2, Clock, MessageCircle, Phone, Store as StoreIcon } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  buildWhatsappLink,
  formatDateTime,
  formatDeliveryMethod,
  formatUgx,
} from '../lib/format';
import type { Order, OrderItem, OrderStatusEntry } from '../types';

export function OrderTrackingPage({ orderId }: { orderId: string }) {
  const { navigate } = useApp();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [history, setHistory] = useState<OrderStatusEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [requiresPhone, setRequiresPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadOrder = useCallback(
    async (verifyPhone?: string) => {
      setLoading(true);
      setError(null);
      try {
        const qs = verifyPhone ? `?phone=${encodeURIComponent(verifyPhone)}` : '';
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}${qs}`);
        const data = await res.json();
        if (res.status === 403 && data.requiresPhoneVerification) {
          setRequiresPhone(true);
          return;
        }
        if (!res.ok) throw new Error(data.error || 'Could not load order.');
        setRequiresPhone(false);
        setOrder(data.order);
        setItems(data.items || []);
        setHistory(data.history || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to find order.');
      } finally {
        setLoading(false);
      }
    },
    [orderId]
  );

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  const handleVerifyPhone = (e: React.FormEvent) => {
    e.preventDefault();
    loadOrder(phoneInput);
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 space-y-4 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-1/3" />
        <div className="h-48 bg-slate-200 rounded-xl" />
      </div>
    );
  }

  if (requiresPhone) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <form onSubmit={handleVerifyPhone} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h1 className="font-display text-xl font-bold text-[#0F172A]">Verify Order Phone</h1>
          <p className="text-sm text-slate-600">
            Enter the phone number used when placing order <span className="font-mono font-semibold">{orderId}</span>.
          </p>
          <input
            type="tel"
            required
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="+256 7..."
            className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B0F0E]"
          />
          <button
            type="submit"
            className="w-full py-2.5 text-sm font-semibold bg-[#0B0F0E] text-white rounded-lg"
          >
            View Order Details
          </button>
        </form>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#0F172A]">Order Not Found</h1>
        <p className="text-sm text-slate-600">{error}</p>
        <button
          type="button"
          onClick={() => navigate('/market')}
          className="px-4 py-2 text-sm font-semibold bg-[#0B0F0E] text-white rounded-lg"
        >
          Return to Market
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-16 space-y-6">
      <button
        type="button"
        onClick={() => navigate('/profile')}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-[#0B0F0E]"
      >
        <ArrowLeft className="w-4 h-4" />
        All My Orders
      </button>

      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="text-xs text-slate-500">Order Reference</div>
            <h1 className="font-mono text-2xl font-bold text-[#0B0F0E] mt-0.5">{order.order_number}</h1>
            <div className="text-xs text-slate-500 mt-1">
              Submitted {formatDateTime(order.created_at)} · Store: {order.store_name}
            </div>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-xs text-slate-500">Order Status</div>
            <div className="font-display text-lg font-bold capitalize text-[#0F172A] mt-0.5">
              {order.status}
            </div>
            <div className="text-xs text-slate-600">
              Payment arranged directly with seller
            </div>
          </div>
        </div>

        {/* Status Timeline */}
        <div className="space-y-3">
          <h2 className="font-display text-base font-bold text-[#0F172A]">Status History</h2>
          <div className="space-y-2.5">
            {history.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span className="font-semibold capitalize text-[#0F172A]">{entry.new_status}</span>
                  {entry.note && <span className="text-slate-600"> — {entry.note}</span>}
                  <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {formatDateTime(entry.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Itemized Snapshot Receipt */}
        <div className="border-t border-slate-100 pt-5 space-y-3">
          <h2 className="font-display text-base font-bold text-[#0F172A]">Items Ordered</h2>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {items.map((item) => (
              <div key={item.id} className="p-3.5 flex items-center justify-between gap-4 text-sm">
                <div>
                  <div className="font-semibold text-[#0F172A]">{item.product_name}</div>
                  <div className="text-xs text-slate-500 font-mono tabular-nums">
                    {item.quantity} × {formatUgx(item.unit_price)}
                  </div>
                </div>
                <div className="font-mono font-semibold text-[#0B0F0E] tabular-nums">
                  {formatUgx(item.line_total)}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5 text-sm pt-2">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">{formatUgx(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Delivery ({formatDeliveryMethod(order.delivery_method)})</span>
              <span className="font-mono tabular-nums">{formatUgx(order.delivery_fee)}</span>
            </div>
            <div className="flex justify-between font-bold text-[#0B0F0E] text-base pt-2 border-t border-slate-200">
              <span>Total</span>
              <span className="font-mono tabular-nums">{formatUgx(order.total)}</span>
            </div>
          </div>
        </div>

        {/* Delivery & Store Contact */}
        <div className="border-t border-slate-100 pt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="p-4 bg-slate-50 rounded-lg space-y-1">
            <div className="text-xs font-semibold text-slate-500">Delivery Destination</div>
            <div className="font-semibold text-[#0F172A]">{order.customer_name}</div>
            <div className="text-slate-600">{order.customer_phone}</div>
            <div className="text-slate-600">
              {order.delivery_address} {order.delivery_district ? `(${order.delivery_district})` : ''}
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg space-y-2.5">
            <div className="text-xs font-semibold text-slate-500">Merchant Support</div>
            <div className="font-semibold text-[#0F172A]">{order.store_name}</div>
            <div className="flex flex-wrap gap-2">
              <a
                href={buildWhatsappLink(
                  order.store_whatsapp || order.store_phone,
                  `Hello ${order.store_name}, checking on my UgaByte order ${order.order_number}.`
                )}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#BAFF00] text-[#0B0F0E] rounded-lg"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                WhatsApp Seller
              </a>
              {order.store_phone && (
                <a
                  href={`tel:${order.store_phone}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 text-slate-800 rounded-lg"
                >
                  <Phone className="w-3.5 h-3.5" />
                  Call
                </a>
              )}
              <button
                type="button"
                onClick={() => navigate(`/store/${order.store_slug}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 text-slate-800 rounded-lg"
              >
                <StoreIcon className="w-3.5 h-3.5" />
                Storefront
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
