import { Check, Copy, Database, ShieldAlert } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { formatDateTime, formatUgx } from '../lib/format';
import type { AuditLogEntry, Category, OperationalLogEntry, Order, Product, Store, User } from '../types';

export function AdminConsolePage() {
  const { user, navigate, showToast } = useApp();
  const [tab, setTab] = useState<'stores' | 'products' | 'orders' | 'users' | 'categories' | 'audit' | 'sql'>('stores');
  const [data, setData] = useState<{
    stores: Store[];
    products: Product[];
    orders: Order[];
    categories: Category[];
    users: User[];
    auditLogs: AuditLogEntry[];
    operationalLogs: OperationalLogEntry[];
    stats: {
      totalStores: number;
      pendingStores: number;
      activeStores: number;
      publishedProducts: number;
      totalOrders: number;
      gmvUgx: number;
    };
    migrationSql: string;
    migration002Sql: string;
  } | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [copiedSql, setCopiedSql] = useState(false);

  const loadAdmin = useCallback(async () => {
    const res = await fetch('/api/admin/overview');
    if (res.ok) {
      setData(await res.json());
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') {
      loadAdmin();
    }
  }, [user, loadAdmin]);

  if (!user || user.role !== 'admin') {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h1 className="font-display text-2xl font-bold text-[#0F172A]">Platform Admin Access Required</h1>
        <p className="text-sm text-slate-600">
          Sign in with an administrator account to moderate stores, review listings, and manage marketplace categories.
        </p>
        <button
          type="button"
          onClick={() => navigate('/auth')}
          className="px-5 py-2.5 text-sm font-semibold bg-[#0B0F0E] text-white rounded-lg"
        >
          Sign In as Admin
        </button>
      </div>
    );
  }

  const updateStoreStatus = async (storeId: string, status: string) => {
    const res = await fetch(`/api/admin/stores/${storeId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      showToast(`Store marked ${status}`);
      loadAdmin();
    }
  };

  const updateProductStatus = async (productId: string, status: string) => {
    const res = await fetch(`/api/admin/products/${productId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      showToast(`Product marked ${status}`);
      loadAdmin();
    }
  };

  const updateUserAccountStatus = async (userId: string, accountStatus: 'active' | 'suspended') => {
    const res = await fetch(`/api/admin/users/${userId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountStatus }),
    });
    const d = await res.json();
    if (res.ok) {
      showToast(`Account ${accountStatus}`);
      loadAdmin();
    } else {
      showToast(d.error || 'Could not update user');
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    const res = await fetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCategoryName.trim() }),
    });
    if (res.ok) {
      setNewCategoryName('');
      showToast('Category added');
      loadAdmin();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 pb-16 space-y-6">
      <div>
        <div className="text-xs text-slate-500">UgaByte Commerce / Platform Governance</div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#0F172A] mt-0.5">
          Commerce Administration
        </h1>
      </div>

      {/* Platform KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Active Stores', value: data?.stats.activeStores ?? 0 },
          { label: 'Pending Review', value: data?.stats.pendingStores ?? 0 },
          { label: 'Published Listings', value: data?.stats.publishedProducts ?? 0 },
          { label: 'Platform Orders', value: data?.stats.totalOrders ?? 0 },
          { label: 'Platform GMV', value: formatUgx(data?.stats.gmvUgx ?? 0) },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">{stat.label}</div>
            <div className="mt-1.5 font-mono text-xl font-bold text-[#0B0F0E] tabular-nums">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Section Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {[
          { id: 'stores', label: 'Stores Moderation' },
          { id: 'products', label: 'Products Moderation' },
          { id: 'orders', label: 'Platform Orders' },
          { id: 'users', label: 'Users & Access' },
          { id: 'categories', label: 'Categories' },
          { id: 'audit', label: 'Audit & Ops Logs' },
          { id: 'sql', label: 'Supabase SQL & RLS' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 ${
              tab === t.id
                ? 'bg-[#0B0F0E] text-white'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* STORES TAB */}
      {tab === 'stores' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 text-left">
                  <th className="px-4 py-3 font-medium">Store</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">District</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Moderation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.stores || []).map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => navigate(`/store/${s.slug}`)}
                        className="font-semibold text-[#0F172A] hover:underline text-left"
                      >
                        {s.name}
                      </button>
                      <div className="text-xs font-mono text-slate-500">/store/{s.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <div>{s.owner_name}</div>
                      <div>{s.owner_email}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{s.district}</td>
                    <td className="px-4 py-3 capitalize text-xs font-semibold">
                      <span
                        className={
                          s.status === 'active'
                            ? 'text-emerald-700'
                            : s.status === 'pending'
                            ? 'text-amber-700'
                            : 'text-red-700'
                        }
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {s.status !== 'active' && (
                          <button
                            type="button"
                            onClick={() => updateStoreStatus(s.id, 'active')}
                            className="px-2.5 py-1 text-xs font-semibold bg-[#BAFF00] text-[#0B0F0E] rounded"
                          >
                            Approve
                          </button>
                        )}
                        {s.status !== 'suspended' && (
                          <button
                            type="button"
                            onClick={() => updateStoreStatus(s.id, 'suspended')}
                            className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded"
                          >
                            Suspend
                          </button>
                        )}
                        {s.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => updateStoreStatus(s.id, 'rejected')}
                            className="px-2.5 py-1 text-xs font-semibold bg-red-50 text-red-700 rounded"
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PRODUCTS TAB */}
      {tab === 'products' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 text-left">
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Store</th>
                  <th className="px-4 py-3 font-medium text-right">Price</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.products || []).map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-semibold text-[#0F172A]">{p.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{p.store_name}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{formatUgx(p.price)}</td>
                    <td className="px-4 py-3 capitalize text-xs font-semibold">{p.status}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1.5">
                        {p.status !== 'published' && (
                          <button
                            type="button"
                            onClick={() => updateProductStatus(p.id, 'published')}
                            className="px-2.5 py-1 text-xs font-semibold bg-[#BAFF00] text-[#0B0F0E] rounded"
                          >
                            Publish
                          </button>
                        )}
                        {p.status !== 'archived' && (
                          <button
                            type="button"
                            onClick={() => updateProductStatus(p.id, 'archived')}
                            className="px-2.5 py-1 text-xs font-semibold bg-slate-100 text-slate-700 rounded"
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ORDERS TAB */}
      {tab === 'orders' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 text-left">
                  <th className="px-4 py-3 font-medium">Ref</th>
                  <th className="px-4 py-3 font-medium">Store</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.orders || []).map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-3 font-mono text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => navigate(`/orders/${o.order_number}`)}
                        className="hover:underline"
                      >
                        {o.order_number}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700">{o.store_name}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">
                      {o.customer_name} ({o.customer_phone})
                    </td>
                    <td className="px-4 py-3 capitalize text-xs font-semibold">{o.status}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                      {formatUgx(o.total)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-500">
                      {formatDateTime(o.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* USERS TAB */}
      {tab === 'users' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 text-left">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">District</th>
                  <th className="px-4 py-3 font-medium">Account Status</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(data?.users || []).map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#0F172A]">{u.full_name}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </td>
                    <td className="px-4 py-3 capitalize text-xs font-semibold">{u.role}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{u.district || '—'}</td>
                    <td className="px-4 py-3 capitalize text-xs font-semibold">
                      <span className={u.account_status === 'suspended' ? 'text-red-600' : 'text-emerald-700'}>
                        {u.account_status || 'active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.id !== user.id && (
                        <button
                          type="button"
                          onClick={() =>
                            updateUserAccountStatus(u.id, u.account_status === 'suspended' ? 'active' : 'suspended')
                          }
                          className={`px-2.5 py-1 text-xs font-semibold rounded ${
                            u.account_status === 'suspended'
                              ? 'bg-[#BAFF00] text-[#0B0F0E]'
                              : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {u.account_status === 'suspended' ? 'Restore Active' : 'Suspend'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CATEGORIES TAB */}
      {tab === 'categories' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <form onSubmit={handleAddCategory} className="flex gap-3 max-w-md">
            <input
              type="text"
              required
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="New category name (e.g. Agri-Processing)"
              className="flex-1 px-3.5 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <button
              type="submit"
              className="px-4 py-2 text-sm font-semibold bg-[#0B0F0E] text-white rounded-lg"
            >
              Add
            </button>
          </form>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
            {(data?.categories || []).map((c) => (
              <div key={c.id} className="px-4 py-3 flex items-center justify-between text-sm">
                <div>
                  <span className="font-semibold text-[#0F172A]">{c.name}</span>
                  <span className="ml-2 font-mono text-xs text-slate-400">/{c.slug}</span>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch(`/api/admin/categories/${c.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ isActive: !c.is_active }),
                    });
                    loadAdmin();
                  }}
                  className={`px-3 py-1 text-xs font-semibold rounded ${
                    c.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {c.is_active ? 'Active' : 'Disabled'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AUDIT & OPERATIONAL LOGS TAB */}
      {tab === 'audit' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="font-display text-base font-bold text-[#0F172A]">Admin Audit Log</h2>
            {(data?.auditLogs || []).length === 0 ? (
              <p className="text-xs text-slate-500">No admin moderation actions recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {data!.auditLogs.map((log) => (
                  <div key={log.id} className="py-2.5 space-y-0.5">
                    <div className="flex justify-between font-semibold text-[#0F172A]">
                      <span>{log.action}</span>
                      <span className="text-slate-400 font-normal">{formatDateTime(log.created_at)}</span>
                    </div>
                    <div className="text-slate-600">{log.details}</div>
                    <div className="text-slate-400">By {log.admin_name} ({log.target_type})</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <h2 className="font-display text-base font-bold text-[#0F172A]">Operational Security & Error Log</h2>
            {(data?.operationalLogs || []).length === 0 ? (
              <p className="text-xs text-slate-500">No security or operational alerts recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 text-xs">
                {data!.operationalLogs.map((op) => (
                  <div key={op.id} className="py-2.5 space-y-0.5">
                    <div className="flex justify-between font-semibold">
                      <span className={op.level === 'error' ? 'text-red-700' : 'text-amber-700'}>
                        [{op.level.toUpperCase()}] {op.event_type}
                      </span>
                      <span className="text-slate-400 font-normal">{formatDateTime(op.created_at)}</span>
                    </div>
                    <div className="text-slate-700">{op.message}</div>
                    {op.route && <div className="font-mono text-slate-400">{op.route}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUPABASE SQL & RLS TAB */}
      {tab === 'sql' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#0B0F0E]" />
                <h2 className="font-display text-base font-bold text-[#0F172A]">
                  supabase/migrations/001_ugabyte_commerce.sql & 002_infrastructure_no_payments.sql
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${data?.migrationSql || ''}\n\n-- MIGRATION 002\n${data?.migration002Sql || ''}`
                  );
                  setCopiedSql(true);
                  setTimeout(() => setCopiedSql(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#0B0F0E] text-white rounded-lg"
              >
                {copiedSql ? <Check className="w-3.5 h-3.5 text-[#BAFF00]" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedSql ? 'Copied SQL' : 'Copy Combined SQL'}
              </button>
            </div>
            <pre className="p-4 bg-[#0B0F0E] text-slate-200 text-xs font-mono rounded-lg overflow-x-auto max-h-[480px]">
              {`${data?.migrationSql || ''}\n\n-- =====================================\n-- MIGRATION 002\n-- =====================================\n${data?.migration002Sql || ''}`}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
