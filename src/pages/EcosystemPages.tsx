import { ArrowRight, Calendar, MapPin, Tag, Trash2, User as UserIcon } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatDateTime, formatUgx, UGANDA_DISTRICTS } from '../lib/format';
import type { Deal, Order, UgaEvent } from '../types';

export function DealsPage() {
  const { navigate } = useApp();
  const [deals, setDeals] = useState<Deal[]>([]);

  useEffect(() => {
    fetch('/api/deals')
      .then((r) => r.json())
      .then((d) => setDeals(d.deals || []))
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-16 space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0F172A]">UgaByte Deals</h1>
        <p className="text-sm text-slate-600 mt-1">
          Verified store promotions linked directly to live UgaByte Commerce inventory.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {deals.map((deal) => (
          <div key={deal.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
            <div className="aspect-[4/3] bg-slate-100">
              {deal.product_image && (
                <img
                  src={deal.product_image}
                  alt={deal.title}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div className="p-5 flex-1 flex flex-col justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                  <Tag className="w-3.5 h-3.5" />
                  <span>{deal.discount_label}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-500 font-normal">Ends {deal.expires_at}</span>
                </div>
                <h2 className="font-display text-lg font-bold text-[#0F172A]">{deal.title}</h2>
                <p className="text-sm text-slate-600">{deal.subtitle}</p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div>
                  {deal.product_price && (
                    <div className="font-mono text-base font-bold text-[#0B0F0E] tabular-nums">
                      {formatUgx(deal.product_price)}
                    </div>
                  )}
                  <div className="text-xs text-slate-500">{deal.store_name}</div>
                </div>
                {deal.product_slug && (
                  <button
                    type="button"
                    onClick={() => navigate(`/product/${deal.product_slug}`)}
                    className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold bg-[#0B0F0E] text-white rounded-lg"
                  >
                    View Deal
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EventsPage() {
  const { navigate } = useApp();
  const [events, setEvents] = useState<UgaEvent[]>([]);

  useEffect(() => {
    fetch('/api/events')
      .then((r) => r.json())
      .then((d) => setEvents(d.events || []))
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-16 space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0F172A]">UgaByte Events</h1>
        <p className="text-sm text-slate-600 mt-1">
          Pop-up markets, merchant workshops, and community gatherings across Uganda.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {events.map((ev) => (
          <div key={ev.id} className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Calendar className="w-3.5 h-3.5" />
                <span>{ev.event_date}</span>
                <span aria-hidden="true">·</span>
                <span>{ev.district}</span>
              </div>
              <h2 className="font-display text-lg font-bold text-[#0F172A]">{ev.title}</h2>
              <p className="text-sm text-slate-600 leading-relaxed">{ev.description}</p>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 pt-1">
                <MapPin className="w-3.5 h-3.5" />
                <span>{ev.venue}</span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
              <div className="font-mono text-sm font-bold text-[#0B0F0E] tabular-nums">
                {ev.ticket_price === 0 ? 'Free Entry' : formatUgx(ev.ticket_price)}
              </div>
              {ev.store_slug && (
                <button
                  type="button"
                  onClick={() => navigate(`/store/${ev.store_slug}`)}
                  className="text-xs font-semibold text-[#0B0F0E] hover:underline"
                >
                  Host Storefront →
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfilePage() {
  const { user, myStores, favoriteProducts, refreshAuth, logout, navigate, showToast } = useApp();
  const [orders, setOrders] = useState<Order[]>([]);
  const [addresses, setAddresses] = useState<
    { id: string; recipient_name: string; phone: string; district: string; area: string; address_details: string }[]
  >([]);
  const [orderLookup, setOrderLookup] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' });
  const [profileForm, setProfileForm] = useState({
    fullName: user?.full_name || '',
    phone: user?.phone || '',
    district: user?.district || 'Kampala',
  });
  const [addrForm, setAddrForm] = useState({
    recipientName: user?.full_name || '',
    phone: user?.phone || '',
    district: user?.district || 'Kampala',
    area: '',
    addressDetails: '',
  });

  useEffect(() => {
    if (!user) return;
    setProfileForm({
      fullName: user.full_name || '',
      phone: user.phone || '',
      district: user.district || 'Kampala',
    });
    fetch('/api/my/orders')
      .then((r) => r.json())
      .then((d) => setOrders(d.orders || []))
      .catch(() => {});
    fetch('/api/my/addresses')
      .then((r) => r.json())
      .then((d) => setAddresses(d.addresses || []))
      .catch(() => {});
  }, [user]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 pb-16 space-y-8">
      {/* Guest Order Lookup */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-bold text-[#0F172A]">Track an Order by Reference</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Enter your UgaByte order code (e.g. UGB-1041) to inspect status and receipt.
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (orderLookup.trim()) navigate(`/orders/${orderLookup.trim()}`);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={orderLookup}
            onChange={(e) => setOrderLookup(e.target.value)}
            placeholder="UGB-1041"
            className="px-3.5 py-2 text-sm font-mono border border-slate-300 rounded-lg"
          />
          <button
            type="submit"
            className="px-4 py-2 text-sm font-semibold bg-[#0B0F0E] text-white rounded-lg"
          >
            Track
          </button>
        </form>
      </div>

      {!user ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
          <UserIcon className="w-8 h-8 mx-auto text-slate-400" />
          <h1 className="font-display text-xl font-bold text-[#0F172A]">Sign in to view your UgaByte Profile</h1>
          <p className="text-sm text-slate-600">
            Access your saved delivery addresses, order history, favorite products, and storefronts.
          </p>
          <button
            type="button"
            onClick={() => navigate('/auth')}
            className="px-5 py-2.5 text-sm font-semibold bg-[#BAFF00] text-[#0B0F0E] rounded-lg"
          >
            Sign In / Register
          </button>
        </div>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-bold text-[#0F172A]">{user.full_name}</h1>
                <div className="text-sm text-slate-600 mt-0.5">
                  {user.email} · {user.phone || 'No phone'} · {user.district || 'Kampala'} ·{' '}
                  <span className="capitalize font-medium">{user.role}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setEditingProfile((v) => !v);
                    setChangingPassword(false);
                  }}
                  className="px-4 py-2 text-sm font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg"
                >
                  {editingProfile ? 'Cancel' : 'Edit Profile'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChangingPassword((v) => !v);
                    setEditingProfile(false);
                  }}
                  className="px-4 py-2 text-sm font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg"
                >
                  {changingPassword ? 'Cancel' : 'Change Password'}
                </button>
                {myStores.length > 0 && (
                  <button
                    type="button"
                    onClick={() => navigate('/business')}
                    className="px-4 py-2 text-sm font-semibold bg-[#BAFF00] text-[#0B0F0E] rounded-lg"
                  >
                    Open Merchant Dashboard
                  </button>
                )}
                <button
                  type="button"
                  onClick={logout}
                  className="px-4 py-2 text-sm font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg"
                >
                  Sign Out
                </button>
              </div>
            </div>

            {editingProfile && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const res = await fetch('/api/auth/me', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(profileForm),
                  });
                  if (res.ok) {
                    await refreshAuth();
                    setEditingProfile(false);
                    showToast('Profile updated');
                  }
                }}
                className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100"
              >
                <input
                  type="text"
                  required
                  value={profileForm.fullName}
                  onChange={(e) => setProfileForm((f) => ({ ...f, fullName: e.target.value }))}
                  placeholder="Full Name"
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <input
                  type="tel"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+256 7..."
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <select
                  value={profileForm.district}
                  onChange={(e) => setProfileForm((f) => ({ ...f, district: e.target.value }))}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {UGANDA_DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold bg-[#0B0F0E] text-white rounded-lg"
                >
                  Save Profile
                </button>
              </form>
            )}

            {changingPassword && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const res = await fetch('/api/auth/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(pwForm),
                  });
                  const d = await res.json();
                  if (res.ok) {
                    setPwForm({ currentPassword: '', newPassword: '' });
                    setChangingPassword(false);
                    showToast('Password updated');
                  } else {
                    showToast(d.error || 'Could not update password');
                  }
                }}
                className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-100"
              >
                <input
                  type="password"
                  required
                  value={pwForm.currentPassword}
                  onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))}
                  placeholder="Current password"
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
                  placeholder="New password (min 8 chars)"
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold bg-[#0B0F0E] text-white rounded-lg"
                >
                  Update Password
                </button>
              </form>
            )}
          </div>

          {/* Saved Products */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0F172A]">Saved Products</h2>
            {favoriteProducts.length === 0 ? (
              <p className="text-sm text-slate-500">No saved products yet. Tap the heart icon on any product in UgaByte Market.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {favoriteProducts.map((fp) => (
                  <button
                    key={fp.id}
                    type="button"
                    onClick={() => navigate(`/product/${fp.slug}`)}
                    className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg text-left hover:bg-slate-50"
                  >
                    <img
                      src={fp.primary_image || '/assets/aistudio/ugabyte_icon_29c10976.png'}
                      alt={fp.name}
                      className="w-12 h-12 rounded-lg object-cover bg-slate-100 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-[#0F172A] truncate">{fp.name}</div>
                      <div className="text-xs font-mono text-slate-600 tabular-nums">{formatUgx(fp.price)}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Orders History */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="font-display text-lg font-bold text-[#0F172A]">My Orders</h2>
            {orders.length === 0 ? (
              <p className="text-sm text-slate-500">You have not placed any orders yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {orders.map((ord) => (
                  <div key={ord.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <button
                        type="button"
                        onClick={() => navigate(`/orders/${ord.order_number}`)}
                        className="font-mono text-sm font-bold text-[#0B0F0E] hover:underline"
                      >
                        {ord.order_number}
                      </button>
                      <div className="text-xs text-slate-500">
                        {ord.store_name} · {formatDateTime(ord.created_at)} ·{' '}
                        <span className="capitalize font-medium">{ord.status}</span>
                      </div>
                    </div>
                    <div className="font-mono text-sm font-semibold tabular-nums">
                      {formatUgx(ord.total)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Saved Delivery Addresses */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <h2 className="font-display text-lg font-bold text-[#0F172A]">Saved Delivery Addresses</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {addresses.map((a) => (
                <div key={a.id} className="p-4 border border-slate-200 rounded-lg flex justify-between items-start">
                  <div className="text-sm">
                    <div className="font-semibold text-[#0F172A]">{a.recipient_name}</div>
                    <div className="text-slate-600">{a.phone}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {a.area} {a.address_details} ({a.district})
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch(`/api/my/addresses/${a.id}`, { method: 'DELETE' });
                      setAddresses((prev) => prev.filter((x) => x.id !== a.id));
                      showToast('Address removed');
                    }}
                    className="p-1 text-slate-400 hover:text-red-600"
                    aria-label="Delete address"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const res = await fetch('/api/my/addresses', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(addrForm),
                });
                if (res.ok) {
                  const data = await res.json();
                  setAddresses((prev) => [data.address, ...prev]);
                  setAddrForm((f) => ({ ...f, area: '', addressDetails: '' }));
                  showToast('Address saved');
                }
              }}
              className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100"
            >
              <input
                type="text"
                required
                value={addrForm.recipientName}
                onChange={(e) => setAddrForm((f) => ({ ...f, recipientName: e.target.value }))}
                placeholder="Recipient Name"
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <input
                type="tel"
                required
                value={addrForm.phone}
                onChange={(e) => setAddrForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+256 7..."
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <select
                value={addrForm.district}
                onChange={(e) => setAddrForm((f) => ({ ...f, district: e.target.value }))}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {UGANDA_DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-semibold bg-[#0B0F0E] text-white rounded-lg"
              >
                Save Address
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

export function AuthPage() {
  const { refreshAuth, navigate, showToast } = useApp();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'customer' | 'merchant'>('merchant');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(mode === 'login' ? '/api/auth/login' : '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'login'
            ? { email, password }
            : { email, password, fullName, phone, role }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');
      await refreshAuth();
      showToast(`Welcome, ${data.user.full_name}`);
      if (data.user.role === 'admin') navigate('/admin/commerce');
      else if (data.user.role === 'merchant') navigate('/business');
      else navigate('/market');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12 pb-16 space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0B0F0E] p-1.5">
            <img
              src="/assets/aistudio/ugabyte_icon_29c10976.png"
              alt="UgaByte"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-[#0F172A]">
              {mode === 'login' ? 'Sign In to UgaByte' : 'Create UgaByte Account'}
            </h1>
            <p className="text-xs text-slate-500">One account for Market, Stores & Business</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`py-2 text-xs font-semibold rounded-md ${
              mode === 'login' ? 'bg-white text-[#0B0F0E] shadow-sm' : 'text-slate-600'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`py-2 text-xs font-semibold rounded-md ${
              mode === 'register' ? 'bg-white text-[#0B0F0E] shadow-sm' : 'text-slate-600'
            }`}
          >
            Register
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Grace Nakato"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+256 772 000 000"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Account Type</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'customer' | 'merchant')}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="merchant">Business / Merchant (Open a Store)</option>
                  <option value="customer">Customer (Shop & Track Orders)</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@business.ug"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 text-sm font-semibold bg-[#BAFF00] text-[#0B0F0E] hover:bg-[#a6e600] rounded-lg"
          >
            {submitting ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>

          {mode === 'login' && (
            <div className="text-right">
              <button
                type="button"
                onClick={async () => {
                  if (!email.trim()) {
                    setError('Enter your account email above to check password reset options.');
                    return;
                  }
                  const res = await fetch('/api/auth/request-password-reset', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                  });
                  const d = await res.json();
                  showToast(d.message || 'Check password reset status');
                }}
                className="text-xs font-medium text-slate-600 hover:text-[#0B0F0E] underline"
              >
                Forgot password?
              </button>
            </div>
          )}
        </form>

        {/* Quick Role Testing Helpers */}
        {mode === 'login' && (
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <div className="text-xs font-semibold text-slate-500">Quick Role Test Accounts</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Merchant', e: 'merchant@ugabyte.ug', p: 'MerchantUga2026!' },
                { label: 'Customer', e: 'customer@ugabyte.ug', p: 'CustomerUga2026!' },
                { label: 'Admin', e: 'admin@ugabyte.ug', p: 'AdminUga2026!' },
              ].map((acc) => (
                <button
                  key={acc.label}
                  type="button"
                  onClick={() => {
                    setEmail(acc.e);
                    setPassword(acc.p);
                  }}
                  className="py-1.5 px-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg"
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
