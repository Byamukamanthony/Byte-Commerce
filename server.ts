import 'dotenv/config';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { generateMerchantCopy } from './server/ai.ts';
import {
  attachUser,
  AuthedRequest,
  COOKIE_NAME,
  isStoreMember,
  requireAdmin,
  requireAuth,
  signSessionToken,
} from './server/auth.ts';
import { db, initDatabase, uuid } from './server/db.ts';
import { logOperationalEvent } from './server/logger.ts';

initDatabase();

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(attachUser);
app.use('/uploads', express.static(UPLOADS_DIR));

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function setSessionCookie(res: express.Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ugabyte-commerce' });
});

// ========================
// AUTHENTICATION
// ========================
app.post('/api/auth/register', (req, res) => {
  const { email, password, fullName, phone, district, role } = req.body || {};
  if (!email || !password || !fullName) {
    return res.status(400).json({ error: 'Full name, email, and password are required.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }
  const safeRole = role === 'merchant' ? 'merchant' : 'customer';
  const id = uuid();
  const passwordHash = bcrypt.hashSync(String(password), 10);
  db.prepare(
    `INSERT INTO users (id, email, password_hash, full_name, phone, district, role, account_status) VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`
  ).run(
    id,
    normalizedEmail,
    passwordHash,
    String(fullName).trim(),
    phone ? String(phone).trim() : null,
    district ? String(district).trim() : 'Kampala',
    safeRole
  );

  const token = signSessionToken(id);
  setSessionCookie(res, token);
  res.status(201).json({
    user: {
      id,
      email: normalizedEmail,
      full_name: String(fullName).trim(),
      phone: phone || null,
      district: district || 'Kampala',
      role: safeRole,
      account_status: 'active',
    },
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = db
    .prepare('SELECT id, email, password_hash, full_name, phone, district, role, account_status FROM users WHERE email = ?')
    .get(normalizedEmail) as
    | {
        id: string;
        email: string;
        password_hash: string;
        full_name: string;
        phone: string | null;
        district: string | null;
        role: 'customer' | 'merchant' | 'admin';
        account_status: 'active' | 'suspended';
      }
    | undefined;

  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    logOperationalEvent({
      level: 'warn',
      eventType: 'auth_login_failed',
      message: 'Failed login attempt',
      route: '/api/auth/login',
      metadata: { email: normalizedEmail },
    });
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (user.account_status === 'suspended') {
    logOperationalEvent({
      level: 'warn',
      eventType: 'auth_suspended_blocked',
      message: 'Suspended account login blocked',
      route: '/api/auth/login',
      userId: user.id,
    });
    return res.status(403).json({ error: 'Your account has been suspended. Contact UgaByte support.' });
  }

  const token = signSessionToken(user.id);
  setSessionCookie(res, token);
  res.json({
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone,
      district: user.district,
      role: user.role,
      account_status: user.account_status,
    },
  });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', (req: AuthedRequest, res) => {
  if (!req.user) {
    return res.json({ user: null, stores: [], favoriteProductIds: [], favoriteStoreIds: [] });
  }
  const stores = db
    .prepare(
      `SELECT s.* FROM stores s
       JOIN store_members sm ON sm.store_id = s.id
       WHERE sm.user_id = ?
       ORDER BY s.created_at DESC`
    )
    .all(req.user.id);
  const favProductRows = db
    .prepare(
      `SELECT p.*, s.name as store_name, s.slug as store_slug, s.district as store_district,
              c.name as category_name,
              (SELECT storage_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order ASC LIMIT 1) as primary_image
       FROM product_favorites pf
       JOIN products p ON p.id = pf.product_id
       JOIN stores s ON s.id = p.store_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE pf.user_id = ? AND p.status = 'published' AND s.status = 'active'`
    )
    .all(req.user.id);
  const favProducts = (favProductRows as { id: string }[]).map((r) => r.id);
  const favStores = (
    db.prepare('SELECT store_id FROM store_favorites WHERE user_id = ?').all(req.user.id) as {
      store_id: string;
    }[]
  ).map((r) => r.store_id);

  res.json({
    user: req.user,
    stores,
    favoriteProductIds: favProducts,
    favoriteProducts: favProductRows,
    favoriteStoreIds: favStores,
  });
});

app.patch('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
  const { fullName, phone, district } = req.body || {};
  if (fullName !== undefined && !String(fullName).trim()) {
    return res.status(400).json({ error: 'Full name cannot be empty.' });
  }
  db.prepare(
    `UPDATE users SET full_name = ?, phone = ?, district = ? WHERE id = ?`
  ).run(
    fullName !== undefined ? String(fullName).trim() : req.user!.full_name,
    phone !== undefined ? (String(phone).trim() || null) : req.user!.phone,
    district !== undefined ? (String(district).trim() || 'Kampala') : req.user!.district,
    req.user!.id
  );
  const updated = db
    .prepare('SELECT id, email, full_name, phone, district, role, account_status FROM users WHERE id = ?')
    .get(req.user!.id);
  res.json({ user: updated });
});

app.post('/api/auth/change-password', requireAuth, (req: AuthedRequest, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }
  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }
  const row = db
    .prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(req.user!.id) as { password_hash: string } | undefined;
  if (!row || !bcrypt.compareSync(String(currentPassword), row.password_hash)) {
    logOperationalEvent({
      level: 'warn',
      eventType: 'auth_change_password_failed',
      message: 'Incorrect current password on change-password request',
      route: '/api/auth/change-password',
      userId: req.user!.id,
    });
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  const nextHash = bcrypt.hashSync(String(newPassword), 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(nextHash, req.user!.id);
  res.json({ ok: true, message: 'Password updated successfully.' });
});

app.post('/api/auth/request-password-reset', (req, res) => {
  const { email } = req.body || {};
  if (!email || !String(email).includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }
  logOperationalEvent({
    level: 'info',
    eventType: 'auth_password_reset_requested',
    message: 'Password reset requested (no SMTP provider configured in local sandbox)',
    route: '/api/auth/request-password-reset',
    metadata: { email: String(email).trim().toLowerCase() },
  });
  res.json({
    ok: true,
    emailConfigured: false,
    message:
      'Password reset emails require Supabase Auth / SMTP configuration in production. Signed-in users can update their password directly from Profile.',
  });
});

// ========================
// PUBLIC MARKETPLACE & STORES
// ========================
app.get('/api/categories', (_req, res) => {
  const categories = db
    .prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY name ASC')
    .all();
  res.json({ categories });
});

app.get('/api/market/products', (req, res) => {
  const { q, category, district, store, minPrice, maxPrice, sort = 'newest', page = '1', limit = '24' } =
    req.query as Record<string, string>;

  const where: string[] = ["p.status = 'published'", "s.status = 'active'"];
  const params: unknown[] = [];

  if (q && q.trim()) {
    where.push('(LOWER(p.name) LIKE ? OR LOWER(p.description) LIKE ? OR LOWER(s.name) LIKE ?)');
    const term = `%${q.trim().toLowerCase()}%`;
    params.push(term, term, term);
  }
  if (category && category !== 'all') {
    where.push('c.slug = ?');
    params.push(category);
  }
  if (district && district !== 'all') {
    where.push('LOWER(s.district) = ?');
    params.push(district.toLowerCase());
  }
  if (store && store !== 'all') {
    where.push('s.slug = ?');
    params.push(store);
  }
  if (minPrice && !Number.isNaN(Number(minPrice))) {
    where.push('p.price >= ?');
    params.push(Number(minPrice));
  }
  if (maxPrice && !Number.isNaN(Number(maxPrice))) {
    where.push('p.price <= ?');
    params.push(Number(maxPrice));
  }

  let orderBy = 'p.is_featured DESC, p.created_at DESC';
  if (sort === 'price_asc') orderBy = 'p.price ASC';
  else if (sort === 'price_desc') orderBy = 'p.price DESC';

  const pageNum = Math.max(1, parseInt(page || '1', 10));
  const limitNum = Math.min(48, Math.max(1, parseInt(limit || '24', 10)));
  const offset = (pageNum - 1) * limitNum;

  const whereSql = where.join(' AND ');
  const totalRow = db
    .prepare(
      `SELECT COUNT(*) as total
       FROM products p
       JOIN stores s ON s.id = p.store_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${whereSql}`
    )
    .get(...params) as { total: number };

  const rows = db
    .prepare(
      `SELECT p.*, s.name as store_name, s.slug as store_slug, s.district as store_district,
              s.whatsapp_number as store_whatsapp, c.name as category_name, c.slug as category_slug,
              (SELECT storage_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order ASC LIMIT 1) as primary_image
       FROM products p
       JOIN stores s ON s.id = p.store_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${whereSql}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`
    )
    .all(...params, limitNum, offset);

  res.json({
    products: rows,
    pagination: {
      total: totalRow.total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.max(1, Math.ceil(totalRow.total / limitNum)),
    },
  });
});

app.get('/api/products/:slug', (req: AuthedRequest, res) => {
  const { slug } = req.params;
  const product = db
    .prepare(
      `SELECT p.*, s.name as store_name, s.slug as store_slug, s.district as store_district,
              s.location_text as store_location, s.phone as store_phone,
              s.whatsapp_number as store_whatsapp, s.logo_url as store_logo, s.status as store_status,
              c.name as category_name, c.slug as category_slug
       FROM products p
       JOIN stores s ON s.id = p.store_id
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.slug = ?`
    )
    .get(slug) as Record<string, unknown> | undefined;

  if (!product) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const isPublic = product.status === 'published' && product.store_status === 'active';
  const canPreview =
    req.user && (req.user.role === 'admin' || isStoreMember(String(product.store_id), req.user.id));
  if (!isPublic && !canPreview) {
    return res.status(404).json({ error: 'Product is not publicly available.' });
  }

  const images = db
    .prepare('SELECT id, storage_path, alt_text, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order ASC')
    .all(product.id);

  res.json({ product: { ...product, images } });
});

app.get('/api/stores', (_req, res) => {
  const stores = db
    .prepare(
      `SELECT s.*,
              (SELECT COUNT(*) FROM products p WHERE p.store_id = s.id AND p.status = 'published') as product_count
       FROM stores s
       WHERE s.status = 'active'
       ORDER BY s.created_at DESC`
    )
    .all();
  res.json({ stores });
});

app.get('/api/stores/:slug', (req: AuthedRequest, res) => {
  const { slug } = req.params;
  const store = db.prepare('SELECT * FROM stores WHERE slug = ?').get(slug) as Record<string, unknown> | undefined;
  if (!store) {
    return res.status(404).json({ error: 'Store not found.' });
  }
  const canView =
    store.status === 'active' ||
    (req.user && (req.user.role === 'admin' || isStoreMember(String(store.id), req.user.id)));

  if (!canView) {
    return res.status(404).json({ error: 'Store is currently unavailable.' });
  }

  const products = db
    .prepare(
      `SELECT p.*, c.name as category_name, c.slug as category_slug,
              (SELECT storage_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order ASC LIMIT 1) as primary_image
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.store_id = ? AND p.status = 'published'
       ORDER BY p.is_featured DESC, p.created_at DESC`
    )
    .all(store.id);

  res.json({ store, products });
});

app.get('/api/deals', (_req, res) => {
  const deals = db
    .prepare(
      `SELECT d.*, p.name as product_name, p.slug as product_slug, p.price as product_price,
              p.compare_at_price as product_compare_at_price, s.name as store_name, s.slug as store_slug,
              (SELECT storage_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order ASC LIMIT 1) as product_image
       FROM deals d
       LEFT JOIN products p ON p.id = d.product_id
       LEFT JOIN stores s ON s.id = d.store_id
       WHERE d.is_active = 1 AND (s.status = 'active' OR s.id IS NULL)`
    )
    .all();
  res.json({ deals });
});

app.get('/api/events', (_req, res) => {
  const events = db
    .prepare(
      `SELECT e.*, s.name as store_name, s.slug as store_slug
       FROM events e
       LEFT JOIN stores s ON s.id = e.store_id
       ORDER BY e.event_date ASC`
    )
    .all();
  res.json({ events });
});

// ========================
// SERVER-SIDE CART PERSISTENCE & REVALIDATION
// ========================
app.get('/api/cart', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT ci.product_id as productId, ci.quantity,
              p.slug, p.name, p.price, p.stock_quantity as maxStock, p.status as productStatus,
              p.store_id as storeId, s.name as storeName, s.slug as storeSlug, s.status as storeStatus,
              (SELECT storage_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order ASC LIMIT 1) as image
       FROM cart_items ci
       JOIN products p ON p.id = ci.product_id
       JOIN stores s ON s.id = p.store_id
       WHERE ci.user_id = ?
       ORDER BY ci.created_at ASC`
    )
    .all(req.user!.id) as Record<string, unknown>[];

  const items = rows.map((r) => ({
    ...r,
    available: r.productStatus === 'published' && r.storeStatus === 'active' && Number(r.maxStock) > 0,
  }));
  res.json({ items });
});

app.put('/api/cart', requireAuth, (req: AuthedRequest, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Cart items array is required.' });
  }
  const cleanMap = new Map<string, number>();
  for (const item of items) {
    const pid = item?.productId ? String(item.productId).trim() : '';
    const qty = Number(item?.quantity);
    if (!pid || !Number.isInteger(qty) || qty <= 0) continue;
    cleanMap.set(pid, Math.min(999, (cleanMap.get(pid) || 0) + qty));
  }

  db.transaction(() => {
    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user!.id);
    const ins = db.prepare(
      `INSERT INTO cart_items (id, user_id, product_id, quantity) VALUES (?, ?, ?, ?)`
    );
    for (const [pid, qty] of cleanMap.entries()) {
      const exists = db.prepare('SELECT id FROM products WHERE id = ?').get(pid);
      if (exists) {
        ins.run(uuid(), req.user!.id, pid, qty);
      }
    }
  })();
  res.json({ ok: true });
});

app.post('/api/cart/validate', (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Items array is required.' });
  }

  const issues: string[] = [];
  const validated: Record<string, unknown>[] = [];

  for (const reqItem of items) {
    const pid = reqItem?.productId ? String(reqItem.productId).trim() : '';
    const qty = Number(reqItem?.quantity || 1);
    const expectedPrice = reqItem?.price !== undefined ? Number(reqItem.price) : undefined;
    if (!pid) continue;

    const prod = db
      .prepare(
        `SELECT p.id, p.slug, p.name, p.price, p.stock_quantity, p.status,
                p.store_id, s.name as store_name, s.slug as store_slug, s.status as store_status,
                (SELECT storage_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order ASC LIMIT 1) as primary_image
         FROM products p
         JOIN stores s ON s.id = p.store_id
         WHERE p.id = ?`
      )
      .get(pid) as Record<string, unknown> | undefined;

    if (!prod) {
      issues.push('An item in your cart was removed and is no longer available.');
      continue;
    }
    if (prod.status !== 'published' || prod.store_status !== 'active') {
      issues.push(`"${prod.name}" is currently unavailable for purchase.`);
      continue;
    }
    const maxStock = Number(prod.stock_quantity);
    if (maxStock <= 0) {
      issues.push(`"${prod.name}" is now out of stock.`);
      continue;
    }
    const adjustedQty = Math.min(maxStock, Math.max(1, Number.isInteger(qty) ? qty : 1));
    if (adjustedQty < qty) {
      issues.push(`Stock for "${prod.name}" dropped to ${maxStock}; cart quantity adjusted.`);
    }
    const livePrice = Number(prod.price);
    if (expectedPrice !== undefined && Number.isFinite(expectedPrice) && expectedPrice !== livePrice) {
      issues.push(`Price for "${prod.name}" updated to UGX ${livePrice.toLocaleString('en-US')}.`);
    }

    validated.push({
      productId: prod.id,
      slug: prod.slug,
      name: prod.name,
      price: livePrice,
      quantity: adjustedQty,
      maxStock,
      image: prod.primary_image || null,
      storeId: prod.store_id,
      storeName: prod.store_name,
      storeSlug: prod.store_slug,
    });
  }

  res.json({
    valid: issues.length === 0 && validated.length > 0,
    items: validated,
    issues,
  });
});

// ========================
// SECURE SERVER-SIDE ORDER CREATION & TRACKING (NO IN-APP PAYMENTS)
// ========================
app.post('/api/orders', (req: AuthedRequest, res) => {
  const {
    idempotencyKey,
    customerName,
    customerPhone,
    customerEmail,
    deliveryMethod,
    deliveryDistrict,
    deliveryAddress,
    paymentMethod,
    paymentToken,
    cardNumber,
    customerNote,
    items,
  } = req.body || {};

  // Explicitly block any in-app payment processing payloads
  if (
    paymentToken ||
    cardNumber ||
    (paymentMethod && ['mtn_momo', 'airtel_money', 'card', 'stripe', 'flutterwave'].includes(String(paymentMethod)))
  ) {
    logOperationalEvent({
      level: 'warn',
      eventType: 'payment_restriction_triggered',
      message: 'Blocked attempt to submit in-app payment provider/credentials at checkout',
      route: '/api/orders',
      userId: req.user?.id || null,
    });
    return res.status(400).json({
      error:
        'In-app payment processing is disabled in this release. Submit your order and arrange payment directly with the seller.',
    });
  }

  const cleanPhoneDigits = String(customerPhone || '').replace(/\D/g, '');
  if (!customerName || !String(customerName).trim() || cleanPhoneDigits.length < 9) {
    return res.status(400).json({
      error: 'Customer name, a valid Ugandan phone number (at least 9 digits), and at least one item are required.',
    });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'At least one item is required.' });
  }

  const validDelivery = ['pickup', 'seller_delivery', 'third_party'];
  if (!validDelivery.includes(deliveryMethod)) {
    return res.status(400).json({ error: 'Invalid delivery method selected.' });
  }
  if (deliveryMethod !== 'pickup' && !String(deliveryAddress || '').trim()) {
    return res.status(400).json({ error: 'Delivery address is required for delivery orders.' });
  }

  const cleanIdem = idempotencyKey ? String(idempotencyKey).trim() : '';
  if (cleanIdem) {
    const existing = db
      .prepare(
        `SELECT o.id, o.order_number, o.store_id, s.name as store_name,
                o.subtotal, o.delivery_fee, o.total, o.currency, o.status
         FROM orders o
         JOIN stores s ON s.id = o.store_id
         WHERE o.idempotency_key = ? OR o.idempotency_key LIKE ?`
      )
      .all(cleanIdem, `${cleanIdem}-%`);
    if (existing.length > 0) {
      return res.status(200).json({
        orders: existing,
        deduplicated: true,
        message: 'Your order has been submitted. The seller will contact you to confirm fulfilment and payment arrangements.',
      });
    }
  }

  try {
    const aggregatedItems = new Map<string, number>();
    for (const reqItem of items) {
      const qty = Number(reqItem?.quantity);
      const pid = reqItem?.productId ? String(reqItem.productId).trim() : '';
      if (!pid || !Number.isInteger(qty) || qty <= 0) {
        throw new Error('Each item must have a valid product ID and positive integer quantity.');
      }
      aggregatedItems.set(pid, (aggregatedItems.get(pid) || 0) + qty);
    }

    const createOrdersTx = db.transaction(() => {
      const byStore = new Map<
        string,
        {
          storeId: string;
          storeName: string;
          items: {
            productId: string;
            name: string;
            sku: string | null;
            unitPrice: number;
            quantity: number;
            lineTotal: number;
          }[];
        }
      >();

      for (const [productId, qty] of aggregatedItems.entries()) {
        const prod = db
          .prepare(
            `SELECT p.id, p.store_id, p.name, p.sku, p.price, p.stock_quantity, p.status,
                    s.name as store_name, s.status as store_status
             FROM products p
             JOIN stores s ON s.id = p.store_id
             WHERE p.id = ?`
          )
          .get(productId) as
          | {
              id: string;
              store_id: string;
              name: string;
              sku: string | null;
              price: number;
              stock_quantity: number;
              status: string;
              store_name: string;
              store_status: string;
            }
          | undefined;

        if (!prod) {
          throw new Error('One or more selected products no longer exist.');
        }
        if (prod.status !== 'published' || prod.store_status !== 'active') {
          throw new Error(`"${prod.name}" is currently unavailable for purchase.`);
        }
        if (prod.stock_quantity < qty) {
          throw new Error(
            `Insufficient stock for "${prod.name}". Available: ${prod.stock_quantity}, requested: ${qty}.`
          );
        }

        const upd = db
          .prepare(
            `UPDATE products
             SET stock_quantity = stock_quantity - ?, updated_at = datetime('now')
             WHERE id = ? AND stock_quantity >= ?`
          )
          .run(qty, prod.id, qty);

        if (upd.changes !== 1) {
          throw new Error(`Stock update conflict for "${prod.name}". Please try again.`);
        }

        const bucket = byStore.get(prod.store_id) || {
          storeId: prod.store_id,
          storeName: prod.store_name,
          items: [],
        };
        bucket.items.push({
          productId: prod.id,
          name: prod.name,
          sku: prod.sku,
          unitPrice: prod.price,
          quantity: qty,
          lineTotal: prod.price * qty,
        });
        byStore.set(prod.store_id, bucket);
      }

      const createdOrders: Record<string, unknown>[] = [];
      let storeIndex = 0;

      for (const bucket of byStore.values()) {
        const subtotal = bucket.items.reduce((sum, i) => sum + i.lineTotal, 0);
        let deliveryFee = 0;
        if (deliveryMethod === 'seller_delivery') {
          deliveryFee = String(deliveryDistrict || 'Kampala').toLowerCase() === 'kampala' ? 5000 : 10000;
        } else if (deliveryMethod === 'third_party') {
          deliveryFee = 12000;
        }
        const total = subtotal + deliveryFee;
        const orderId = uuid();
        const randomCode = crypto.randomInt(1000, 9999);
        const orderNumber = `UGB-${Date.now().toString().slice(-4)}${randomCode}`;
        const idemKey = idempotencyKey ? `${String(idempotencyKey)}-${storeIndex}` : null;
        storeIndex += 1;

        const internalArrangement = deliveryMethod === 'pickup' ? 'cash_on_pickup' : 'cash_on_delivery';

        db.prepare(
          `INSERT INTO orders (
             id, order_number, idempotency_key, store_id, customer_id,
             customer_name, customer_phone, customer_email,
             delivery_method, delivery_address, delivery_district, delivery_fee,
             subtotal, total, currency, payment_method, payment_status, status, customer_note
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UGX', ?, 'unpaid', 'pending', ?)`
        ).run(
          orderId,
          orderNumber,
          idemKey,
          bucket.storeId,
          req.user?.id || null,
          String(customerName).trim(),
          String(customerPhone).trim(),
          customerEmail ? String(customerEmail).trim() : null,
          deliveryMethod,
          deliveryMethod === 'pickup' ? 'Customer Pickup at Store' : String(deliveryAddress || '').trim(),
          deliveryDistrict ? String(deliveryDistrict).trim() : 'Kampala',
          deliveryFee,
          subtotal,
          total,
          internalArrangement,
          customerNote ? String(customerNote).trim() : null
        );

        const insertItem = db.prepare(
          `INSERT INTO order_items (id, order_id, product_id, product_name, sku, unit_price, quantity, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const item of bucket.items) {
          insertItem.run(
            uuid(),
            orderId,
            item.productId,
            item.name,
            item.sku,
            item.unitPrice,
            item.quantity,
            item.lineTotal
          );
        }

        db.prepare(
          `INSERT INTO order_status_history (id, order_id, old_status, new_status, changed_by, note)
           VALUES (?, ?, NULL, 'pending', ?, 'Order submitted — awaiting seller confirmation and direct payment arrangement')`
        ).run(uuid(), orderId, req.user?.id || null);

        createdOrders.push({
          id: orderId,
          order_number: orderNumber,
          store_id: bucket.storeId,
          store_name: bucket.storeName,
          subtotal,
          delivery_fee: deliveryFee,
          total,
          currency: 'UGX',
          status: 'pending',
        });
      }

      if (req.user?.id) {
        db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);
      }

      return createdOrders;
    });

    const orders = createOrdersTx();
    res.status(201).json({
      orders,
      message: 'Your order has been submitted. The seller will contact you to confirm fulfilment and payment arrangements.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to process order.';
    logOperationalEvent({
      level: 'warn',
      eventType: message.toLowerCase().includes('stock') ? 'inventory_conflict' : 'order_creation_failed',
      message,
      route: '/api/orders',
      userId: req.user?.id || null,
    });
    res.status(400).json({ error: message });
  }
});

app.get('/api/orders/:orderNumber', (req: AuthedRequest, res) => {
  const { orderNumber } = req.params;
  const { phone } = req.query as { phone?: string };
  const order = db
    .prepare(
      `SELECT o.id, o.order_number, o.store_id, o.customer_id, o.customer_name, o.customer_phone, o.customer_email,
              o.delivery_method, o.delivery_address, o.delivery_district, o.delivery_fee, o.subtotal, o.total,
              o.currency, o.status, o.customer_note, o.created_at, o.updated_at,
              s.name as store_name, s.slug as store_slug, s.phone as store_phone,
              s.whatsapp_number as store_whatsapp, s.location_text as store_location, s.district as store_district
       FROM orders o
       JOIN stores s ON s.id = o.store_id
       WHERE o.order_number = ? OR o.id = ?`
    )
    .get(orderNumber, orderNumber) as Record<string, unknown> | undefined;

  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  const isOwnerCustomer = req.user && order.customer_id && req.user.id === order.customer_id;
  const isMerchant = req.user && isStoreMember(String(order.store_id), req.user.id);
  const isAdmin = req.user && req.user.role === 'admin';
  const cleanInputPhone = phone ? String(phone).replace(/\D/g, '') : '';
  const cleanOrderPhone = String(order.customer_phone || '').replace(/\D/g, '');
  const phoneVerified =
    cleanInputPhone.length >= 9 &&
    cleanOrderPhone.length >= 9 &&
    cleanInputPhone.slice(-9) === cleanOrderPhone.slice(-9);

  if (!isOwnerCustomer && !isMerchant && !isAdmin && !phoneVerified) {
    logOperationalEvent({
      level: 'warn',
      eventType: 'unauthorized_order_access',
      message: `Unauthorized attempt to view order ${orderNumber}`,
      route: '/api/orders/:orderNumber',
      userId: req.user?.id || null,
    });
    return res.status(403).json({
      error: 'Please sign in or verify your order phone number to view this order.',
      requiresPhoneVerification: true,
    });
  }

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  const history = db
    .prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC')
    .all(order.id);

  res.json({ order, items, history });
});

app.get('/api/my/orders', requireAuth, (req: AuthedRequest, res) => {
  const orders = db
    .prepare(
      `SELECT o.*, s.name as store_name, s.slug as store_slug
       FROM orders o
       JOIN stores s ON s.id = o.store_id
       WHERE o.customer_id = ?
       ORDER BY o.created_at DESC`
    )
    .all(req.user!.id);
  res.json({ orders });
});

app.get('/api/my/addresses', requireAuth, (req: AuthedRequest, res) => {
  const addresses = db
    .prepare('SELECT * FROM customer_addresses WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user!.id);
  res.json({ addresses });
});

app.post('/api/my/addresses', requireAuth, (req: AuthedRequest, res) => {
  const { recipientName, phone, district, area, addressDetails } = req.body || {};
  if (!recipientName || !phone) {
    return res.status(400).json({ error: 'Recipient name and phone are required.' });
  }
  const id = uuid();
  db.prepare(
    `INSERT INTO customer_addresses (id, user_id, recipient_name, phone, district, area, address_details)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, req.user!.id, recipientName, phone, district || 'Kampala', area || '', addressDetails || '');
  const address = db.prepare('SELECT * FROM customer_addresses WHERE id = ?').get(id);
  res.status(201).json({ address });
});

app.delete('/api/my/addresses/:id', requireAuth, (req: AuthedRequest, res) => {
  db.prepare('DELETE FROM customer_addresses WHERE id = ? AND user_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

app.post('/api/favorites/products/:productId', requireAuth, (req: AuthedRequest, res) => {
  const { productId } = req.params;
  const existing = db
    .prepare('SELECT 1 FROM product_favorites WHERE user_id = ? AND product_id = ?')
    .get(req.user!.id, productId);
  if (existing) {
    db.prepare('DELETE FROM product_favorites WHERE user_id = ? AND product_id = ?').run(
      req.user!.id,
      productId
    );
    return res.json({ favorited: false });
  }
  db.prepare('INSERT INTO product_favorites (user_id, product_id) VALUES (?, ?)').run(
    req.user!.id,
    productId
  );
  res.json({ favorited: true });
});

app.post('/api/favorites/stores/:storeId', requireAuth, (req: AuthedRequest, res) => {
  const { storeId } = req.params;
  const existing = db
    .prepare('SELECT 1 FROM store_favorites WHERE user_id = ? AND store_id = ?')
    .get(req.user!.id, storeId);
  if (existing) {
    db.prepare('DELETE FROM store_favorites WHERE user_id = ? AND store_id = ?').run(req.user!.id, storeId);
    return res.json({ favorited: false });
  }
  db.prepare('INSERT INTO store_favorites (user_id, store_id) VALUES (?, ?)').run(req.user!.id, storeId);
  res.json({ favorited: true });
});

// ========================
// MERCHANT / UGABYTE BUSINESS WORKSPACE
// ========================
app.get('/api/business/stores/check-slug', requireAuth, (req, res) => {
  const { slug, excludeStoreId } = req.query as { slug?: string; excludeStoreId?: string };
  const normalizedSlug = slugify(String(slug || ''));
  if (!normalizedSlug || normalizedSlug.length < 3) {
    return res.json({ available: false, normalizedSlug, reason: 'Slug must be at least 3 characters.' });
  }
  const existing = excludeStoreId
    ? db.prepare('SELECT id FROM stores WHERE slug = ? AND id != ?').get(normalizedSlug, excludeStoreId)
    : db.prepare('SELECT id FROM stores WHERE slug = ?').get(normalizedSlug);
  res.json({
    available: !existing,
    normalizedSlug,
    reason: existing ? 'This store URL slug is already taken.' : null,
  });
});

app.get('/api/business/stores', requireAuth, (req: AuthedRequest, res) => {
  const stores = db
    .prepare(
      `SELECT s.*, sm.role as member_role
       FROM stores s
       JOIN store_members sm ON sm.store_id = s.id
       WHERE sm.user_id = ?
       ORDER BY s.created_at DESC`
    )
    .all(req.user!.id);
  res.json({ stores });
});

app.post('/api/business/stores', requireAuth, (req: AuthedRequest, res) => {
  const { name, slug, description, phone, whatsappNumber, email, locationText, district, logoUrl, coverUrl } =
    req.body || {};
  if (!name || !String(name).trim() || String(phone || '').replace(/\D/g, '').length < 9) {
    return res.status(400).json({ error: 'Store name and a valid phone number (at least 9 digits) are required.' });
  }
  const cleanSlug = slugify(slug || name);
  if (!cleanSlug || cleanSlug.length < 3) {
    return res.status(400).json({ error: 'Store URL slug must be at least 3 alphanumeric characters.' });
  }
  const existingSlug = db.prepare('SELECT id FROM stores WHERE slug = ?').get(cleanSlug);
  if (existingSlug) {
    return res.status(409).json({ error: 'This store URL is already taken. Choose another slug.' });
  }

  const storeId = uuid();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO stores (id, owner_id, name, slug, description, logo_url, cover_url, phone, whatsapp_number, email, location_text, district, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).run(
      storeId,
      req.user!.id,
      String(name).trim(),
      cleanSlug,
      description || '',
      logoUrl || '/assets/aistudio/ugabyte_icon_29c10976.png',
      coverUrl || '/src/assets/images/hero_kampala_commerce_1795001653548.jpg',
      String(phone).trim(),
      whatsappNumber ? String(whatsappNumber).replace(/\D/g, '') : String(phone).replace(/\D/g, ''),
      email || req.user!.email,
      locationText || '',
      district || 'Kampala'
    );
    db.prepare(`INSERT INTO store_members (id, store_id, user_id, role) VALUES (?, ?, ?, 'owner')`).run(
      uuid(),
      storeId,
      req.user!.id
    );
    if (req.user!.role === 'customer') {
      db.prepare(`UPDATE users SET role = 'merchant' WHERE id = ?`).run(req.user!.id);
    }
  })();

  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);
  res.status(201).json({ store });
});

app.patch('/api/business/stores/:storeId', requireAuth, (req: AuthedRequest, res) => {
  const { storeId } = req.params;
  if (!isStoreMember(storeId, req.user!.id) && req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'You do not have permission to edit this store.' });
  }

  const { name, slug, description, phone, whatsappNumber, email, locationText, district, logoUrl, coverUrl } =
    req.body || {};

  if (slug) {
    const cleanSlug = slugify(slug);
    const conflict = db.prepare('SELECT id FROM stores WHERE slug = ? AND id != ?').get(cleanSlug, storeId);
    if (conflict) {
      return res.status(409).json({ error: 'That store URL slug is already in use.' });
    }
  }

  const current = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as Record<string, unknown> | undefined;
  if (!current) return res.status(404).json({ error: 'Store not found.' });

  db.prepare(
    `UPDATE stores
     SET name = ?, slug = ?, description = ?, phone = ?, whatsapp_number = ?, email = ?,
         location_text = ?, district = ?, logo_url = ?, cover_url = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    name ?? current.name,
    slug ? slugify(slug) : current.slug,
    description ?? current.description,
    phone ?? current.phone,
    whatsappNumber !== undefined ? String(whatsappNumber).replace(/\D/g, '') : current.whatsapp_number,
    email ?? current.email,
    locationText ?? current.location_text,
    district ?? current.district,
    logoUrl ?? current.logo_url,
    coverUrl ?? current.cover_url,
    storeId
  );

  const updated = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId);
  res.json({ store: updated });
});

app.get('/api/business/stores/:storeId/dashboard', requireAuth, (req: AuthedRequest, res) => {
  const { storeId } = req.params;
  if (!isStoreMember(storeId, req.user!.id) && req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized store access.' });
  }

  const ordersToday = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM orders WHERE store_id = ? AND date(created_at) = date('now')`
      )
      .get(storeId) as { cnt: number }
  ).cnt;

  const totals = db
    .prepare(
      `SELECT COUNT(*) as totalOrders,
              COALESCE(SUM(CASE WHEN status NOT IN ('cancelled', 'rejected') THEN total ELSE 0 END), 0) as totalSales,
              COALESCE(SUM(CASE WHEN date(created_at) = date('now') AND status NOT IN ('cancelled', 'rejected') THEN total ELSE 0 END), 0) as salesToday,
              COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pendingOrders
       FROM orders WHERE store_id = ?`
    )
    .get(storeId) as {
    totalOrders: number;
    totalSales: number;
    salesToday: number;
    pendingOrders: number;
  };

  const activeProducts = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM products WHERE store_id = ? AND status = 'published'`)
      .get(storeId) as { cnt: number }
  ).cnt;

  const lowStockProducts = db
    .prepare(
      `SELECT id, name, sku, stock_quantity, price, status FROM products
       WHERE store_id = ? AND status != 'archived' AND stock_quantity <= 5
       ORDER BY stock_quantity ASC`
    )
    .all(storeId);

  const recentOrders = db
    .prepare(
      `SELECT * FROM orders WHERE store_id = ? ORDER BY created_at DESC LIMIT 8`
    )
    .all(storeId);

  const topProducts = db
    .prepare(
      `SELECT oi.product_name, SUM(oi.quantity) as units_sold, SUM(oi.line_total) as revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.store_id = ? AND o.status NOT IN ('cancelled', 'rejected')
       GROUP BY oi.product_name
       ORDER BY revenue DESC
       LIMIT 5`
    )
    .all(storeId);

  res.json({
    kpis: {
      ordersToday,
      salesToday: totals.salesToday,
      totalOrders: totals.totalOrders,
      totalSales: totals.totalSales,
      pendingOrders: totals.pendingOrders,
      activeProducts,
      lowStockCount: lowStockProducts.length,
    },
    lowStockProducts,
    recentOrders,
    topProducts,
  });
});

app.get('/api/business/stores/:storeId/products', requireAuth, (req: AuthedRequest, res) => {
  const { storeId } = req.params;
  if (!isStoreMember(storeId, req.user!.id) && req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized store access.' });
  }
  const products = db
    .prepare(
      `SELECT p.*, c.name as category_name,
              (SELECT storage_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order ASC LIMIT 1) as primary_image
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.store_id = ? AND p.status != 'archived'
       ORDER BY p.created_at DESC`
    )
    .all(storeId) as Record<string, unknown>[];

  const withImages = products.map((p) => ({
    ...p,
    images: db
      .prepare('SELECT id, storage_path, alt_text, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order ASC')
      .all(p.id),
  }));
  res.json({ products: withImages });
});

app.post('/api/business/stores/:storeId/products', requireAuth, (req: AuthedRequest, res) => {
  const { storeId } = req.params;
  if (!isStoreMember(storeId, req.user!.id) && req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized store access.' });
  }
  const { name, description, price, compareAtPrice, stockQuantity, sku, condition, status, categoryId, images } =
    req.body || {};

  const numericPrice = Number(price);
  if (!name || !String(name).trim() || price === undefined || price === '' || !Number.isFinite(numericPrice) || numericPrice < 0) {
    return res.status(400).json({ error: 'Product name and a valid non-negative UGX price are required.' });
  }
  const numericStock = Number(stockQuantity ?? 0);
  if (!Number.isInteger(numericStock) || numericStock < 0) {
    return res.status(400).json({ error: 'Stock quantity must be a non-negative whole number.' });
  }
  if (categoryId) {
    const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(String(categoryId));
    if (!cat) return res.status(400).json({ error: 'Selected category does not exist.' });
  }
  const stock = numericStock;
  const baseSlug = slugify(name) || `product-${Date.now()}`;
  const slugConflict = db
    .prepare('SELECT id FROM products WHERE store_id = ? AND slug = ?')
    .get(storeId, baseSlug);
  const finalSlug = slugConflict ? `${baseSlug}-${Date.now().toString().slice(-4)}` : baseSlug;
  const productId = uuid();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO products (id, store_id, category_id, name, slug, description, price, compare_at_price, stock_quantity, sku, condition, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      productId,
      storeId,
      categoryId || null,
      String(name).trim(),
      finalSlug,
      description || '',
      Math.round(numericPrice),
      compareAtPrice !== undefined && compareAtPrice !== null && compareAtPrice !== '' && Number.isFinite(Number(compareAtPrice))
        ? Math.max(0, Math.round(Number(compareAtPrice)))
        : null,
      stock,
      sku || null,
      ['new', 'used', 'refurbished'].includes(condition) ? condition : 'new',
      ['draft', 'published', 'archived'].includes(status) ? status : 'draft'
    );

    const imgList: string[] = Array.isArray(images) && images.length > 0
      ? images
      : ['/src/assets/images/hero_kampala_commerce_1795001653548.jpg'];

    const insertImg = db.prepare(
      `INSERT INTO product_images (id, product_id, storage_path, alt_text, sort_order) VALUES (?, ?, ?, ?, ?)`
    );
    imgList.forEach((imgPath, idx) => {
      insertImg.run(uuid(), productId, String(imgPath), String(name).trim(), idx);
    });
  })();

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  res.status(201).json({ product });
});

app.patch('/api/business/stores/:storeId/products/:productId', requireAuth, (req: AuthedRequest, res) => {
  const { storeId, productId } = req.params;
  if (!isStoreMember(storeId, req.user!.id) && req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized store access.' });
  }
  const existing = db
    .prepare('SELECT * FROM products WHERE id = ? AND store_id = ?')
    .get(productId, storeId) as Record<string, unknown> | undefined;
  if (!existing) {
    return res.status(404).json({ error: 'Product not found in this store.' });
  }

  const { name, description, price, compareAtPrice, stockQuantity, sku, condition, status, categoryId, images } =
    req.body || {};

  if (price !== undefined) {
    const np = Number(price);
    if (!Number.isFinite(np) || np < 0) {
      return res.status(400).json({ error: 'Price must be a valid non-negative number.' });
    }
  }
  if (stockQuantity !== undefined) {
    const ns = Number(stockQuantity);
    if (!Number.isInteger(ns) || ns < 0) {
      return res.status(400).json({ error: 'Stock quantity must be a non-negative integer.' });
    }
  }
  if (categoryId) {
    const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(String(categoryId));
    if (!cat) return res.status(400).json({ error: 'Selected category does not exist.' });
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE products
       SET name = ?, description = ?, price = ?, compare_at_price = ?, stock_quantity = ?,
           sku = ?, condition = ?, status = ?, category_id = ?, updated_at = datetime('now')
       WHERE id = ? AND store_id = ?`
    ).run(
      name !== undefined ? String(name).trim() : existing.name,
      description ?? existing.description,
      price !== undefined ? Math.round(Number(price)) : existing.price,
      compareAtPrice !== undefined
        ? compareAtPrice !== null && compareAtPrice !== '' && Number.isFinite(Number(compareAtPrice))
          ? Math.max(0, Math.round(Number(compareAtPrice)))
          : null
        : existing.compare_at_price,
      stockQuantity !== undefined ? Number(stockQuantity) : existing.stock_quantity,
      sku !== undefined ? sku : existing.sku,
      ['new', 'used', 'refurbished'].includes(condition) ? condition : existing.condition,
      ['draft', 'published', 'archived'].includes(status) ? status : existing.status,
      categoryId !== undefined ? categoryId : existing.category_id,
      productId,
      storeId
    );

    if (Array.isArray(images) && images.length > 0) {
      db.prepare('DELETE FROM product_images WHERE product_id = ?').run(productId);
      const insertImg = db.prepare(
        `INSERT INTO product_images (id, product_id, storage_path, alt_text, sort_order) VALUES (?, ?, ?, ?, ?)`
      );
      images.forEach((imgPath: string, idx: number) => {
        insertImg.run(uuid(), productId, String(imgPath), String(name ?? existing.name), idx);
      });
    }
  })();

  const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  res.json({ product: updated });
});

app.delete('/api/business/stores/:storeId/products/:productId', requireAuth, (req: AuthedRequest, res) => {
  const { storeId, productId } = req.params;
  if (!isStoreMember(storeId, req.user!.id) && req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized store access.' });
  }
  const result = db
    .prepare(`UPDATE products SET status = 'archived', updated_at = datetime('now') WHERE id = ? AND store_id = ?`)
    .run(productId, storeId);
  if (result.changes === 0) return res.status(404).json({ error: 'Product not found.' });
  res.json({ ok: true });
});

app.get('/api/business/stores/:storeId/orders', requireAuth, (req: AuthedRequest, res) => {
  const { storeId } = req.params;
  if (!isStoreMember(storeId, req.user!.id) && req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized store access.' });
  }
  const orders = db
    .prepare('SELECT * FROM orders WHERE store_id = ? ORDER BY created_at DESC')
    .all(storeId) as Record<string, unknown>[];

  const enriched = orders.map((o) => ({
    ...o,
    items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id),
    history: db
      .prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC')
      .all(o.id),
  }));
  res.json({ orders: enriched });
});

app.patch('/api/business/stores/:storeId/orders/:orderId', requireAuth, (req: AuthedRequest, res) => {
  const { storeId, orderId } = req.params;
  if (!isStoreMember(storeId, req.user!.id) && req.user!.role !== 'admin') {
    logOperationalEvent({
      level: 'warn',
      eventType: 'unauthorized_store_order_update',
      message: 'Forbidden attempt to update order in another store',
      route: '/api/business/stores/:storeId/orders/:orderId',
      userId: req.user!.id,
      metadata: { storeId, orderId },
    });
    return res.status(403).json({ error: 'Unauthorized store access.' });
  }
  const order = db
    .prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?')
    .get(orderId, storeId) as Record<string, unknown> | undefined;
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  const { status, paymentStatus, note } = req.body || {};
  if (paymentStatus !== undefined) {
    return res.status(400).json({
      error: 'In-app payment processing is disabled in this release. Payment is arranged directly between customer and seller.',
    });
  }

  const ALLOWED_TRANSITIONS: Record<string, string[]> = {
    pending: ['accepted', 'rejected', 'cancelled'],
    accepted: ['processing', 'ready', 'cancelled'],
    processing: ['ready', 'dispatched', 'cancelled'],
    ready: ['dispatched', 'completed', 'cancelled'],
    dispatched: ['completed'],
    completed: [],
    cancelled: [],
    rejected: [],
  };

  const currentStatus = String(order.status);

  if (status && status !== currentStatus) {
    const allowedNext = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowedNext.includes(status)) {
      return res.status(400).json({
        error: `Invalid order transition from "${currentStatus}" to "${status}". Allowed next statuses: ${
          allowedNext.length > 0 ? allowedNext.join(', ') : 'none (terminal state)'
        }.`,
      });
    }
  }

  db.transaction(() => {
    if (status && status !== currentStatus) {
      db.prepare(`UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(
        status,
        orderId
      );
      db.prepare(
        `INSERT INTO order_status_history (id, order_id, old_status, new_status, changed_by, note)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(uuid(), orderId, currentStatus, status, req.user!.id, note || `Status updated to ${status}`);

      if (['rejected', 'cancelled'].includes(status)) {
        const items = db
          .prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?')
          .all(orderId) as { product_id: string | null; quantity: number }[];
        for (const item of items) {
          if (item.product_id) {
            db.prepare('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?').run(
              item.quantity,
              item.product_id
            );
          }
        }
      }
    }
  })();

  const updated = db
    .prepare(
      `SELECT id, order_number, store_id, customer_id, customer_name, customer_phone, customer_email,
              delivery_method, delivery_address, delivery_district, delivery_fee, subtotal, total,
              currency, status, customer_note, created_at, updated_at
       FROM orders WHERE id = ?`
    )
    .get(orderId);
  res.json({ order: updated });
});

app.get('/api/business/stores/:storeId/customers', requireAuth, (req: AuthedRequest, res) => {
  const { storeId } = req.params;
  if (!isStoreMember(storeId, req.user!.id) && req.user!.role !== 'admin') {
    return res.status(403).json({ error: 'Unauthorized store access.' });
  }
  const customers = db
    .prepare(
      `SELECT customer_name, customer_phone, customer_email, delivery_district,
              COUNT(*) as order_count,
              SUM(CASE WHEN status NOT IN ('cancelled', 'rejected') THEN total ELSE 0 END) as total_spent,
              MAX(created_at) as last_order_at
       FROM orders
       WHERE store_id = ?
       GROUP BY customer_phone
       ORDER BY last_order_at DESC`
    )
    .all(storeId);
  res.json({ customers });
});

// ========================
// UPLOADS (STORE-SCOPED) & GEMINI AI ASSISTANT
// ========================
app.post('/api/upload', requireAuth, (req: AuthedRequest, res) => {
  const { filename, mimeType, base64Data, storeId, bucket } = req.body || {};
  const allowedBuckets = ['store-logos', 'store-covers', 'product-images'];
  const cleanBucket = allowedBuckets.includes(String(bucket)) ? String(bucket) : 'product-images';

  if (storeId) {
    if (!isStoreMember(String(storeId), req.user!.id) && req.user!.role !== 'admin') {
      logOperationalEvent({
        level: 'warn',
        eventType: 'storage_unauthorized_upload',
        message: 'Unauthorized store asset upload attempt',
        route: '/api/upload',
        userId: req.user!.id,
        metadata: { storeId },
      });
      return res.status(403).json({ error: 'You do not have permission to upload assets for this store.' });
    }
  }

  const allowedMimes: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  const ext = allowedMimes[String(mimeType || '').toLowerCase()];
  if (!ext || !base64Data) {
    logOperationalEvent({
      level: 'warn',
      eventType: 'storage_invalid_upload',
      message: 'Rejected invalid file upload type or empty payload',
      route: '/api/upload',
      userId: req.user!.id,
      metadata: { mimeType: String(mimeType || '') },
    });
    return res.status(400).json({ error: 'Only JPG, PNG, and WEBP image uploads up to 2MB are supported.' });
  }
  const cleanB64 = String(base64Data).replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(cleanB64, 'base64');
  if (buffer.byteLength === 0 || buffer.byteLength > 2 * 1024 * 1024) {
    return res.status(400).json({ error: 'Image size must be non-empty and under 2MB.' });
  }
  const safeBase = slugify(path.basename(String(filename || 'upload'), path.extname(String(filename || '')))) || 'img';
  const outName = `${safeBase}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
  const outPath = path.join(UPLOADS_DIR, outName);
  fs.writeFileSync(outPath, buffer);
  const url = `/uploads/${outName}`;

  db.prepare(
    `INSERT INTO uploaded_assets (id, store_id, uploaded_by, bucket, url, file_name, mime_type, size_bytes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(uuid(), storeId ? String(storeId) : null, req.user!.id, cleanBucket, url, outName, String(mimeType), buffer.byteLength);

  res.status(201).json({ url, bucket: cleanBucket });
});

app.delete('/api/upload', requireAuth, (req: AuthedRequest, res) => {
  const { url } = req.body || {};
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl.startsWith('/uploads/')) {
    return res.status(400).json({ error: 'Only uploaded store assets can be deleted.' });
  }
  const asset = db
    .prepare('SELECT * FROM uploaded_assets WHERE url = ?')
    .get(cleanUrl) as { id: string; store_id: string | null; uploaded_by: string; file_name: string } | undefined;

  if (!asset) {
    return res.status(404).json({ error: 'Uploaded asset not found.' });
  }

  const isOwner = asset.uploaded_by === req.user!.id;
  const isStoreStaff = asset.store_id ? isStoreMember(asset.store_id, req.user!.id) : false;
  if (!isOwner && !isStoreStaff && req.user!.role !== 'admin') {
    logOperationalEvent({
      level: 'warn',
      eventType: 'storage_unauthorized_delete',
      message: 'Forbidden attempt to delete another store asset',
      route: 'DELETE /api/upload',
      userId: req.user!.id,
      metadata: { assetId: asset.id },
    });
    return res.status(403).json({ error: 'You do not have permission to delete this image.' });
  }

  const filePath = path.join(UPLOADS_DIR, path.basename(asset.file_name));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  db.prepare('DELETE FROM uploaded_assets WHERE id = ?').run(asset.id);
  res.json({ ok: true });
});

app.post('/api/ai/assist', requireAuth, async (req, res) => {
  const { action, productName, roughNotes, priceUgx, storeName, district } = req.body || {};
  if (!productName) {
    return res.status(400).json({ error: 'Please enter a product name first so UgaByte AI can assist.' });
  }
  try {
    const categories = (
      db.prepare('SELECT name FROM categories WHERE is_active = 1').all() as { name: string }[]
    ).map((c) => c.name);
    const result = await generateMerchantCopy({
      action: action || 'full_pack',
      productName: String(productName),
      roughNotes: roughNotes ? String(roughNotes) : undefined,
      priceUgx: priceUgx ? Number(priceUgx) : undefined,
      storeName: storeName ? String(storeName) : undefined,
      district: district ? String(district) : undefined,
      categories,
    });
    res.json({ suggestion: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI generation failed.';
    res.status(500).json({ error: message });
  }
});

// ========================
// PLATFORM ADMIN
// ========================
app.get('/api/admin/overview', requireAdmin, (_req, res) => {
  const stores = db
    .prepare(
      `SELECT s.*, u.full_name as owner_name, u.email as owner_email,
              (SELECT COUNT(*) FROM products p WHERE p.store_id = s.id) as product_count,
              (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id) as order_count
       FROM stores s
       JOIN users u ON u.id = s.owner_id
       ORDER BY s.created_at DESC`
    )
    .all();

  const products = db
    .prepare(
      `SELECT p.*, s.name as store_name, s.slug as store_slug, c.name as category_name,
              (SELECT storage_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY sort_order ASC LIMIT 1) as primary_image
       FROM products p
       JOIN stores s ON s.id = p.store_id
       LEFT JOIN categories c ON c.id = p.category_id
       ORDER BY p.created_at DESC`
    )
    .all();

  const orders = db
    .prepare(
      `SELECT o.*, s.name as store_name
       FROM orders o
       JOIN stores s ON s.id = o.store_id
       ORDER BY o.created_at DESC
       LIMIT 50`
    )
    .all();

  const categories = db.prepare('SELECT * FROM categories ORDER BY name ASC').all();

  const stats = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM stores) as totalStores,
              (SELECT COUNT(*) FROM stores WHERE status = 'pending') as pendingStores,
              (SELECT COUNT(*) FROM stores WHERE status = 'active') as activeStores,
              (SELECT COUNT(*) FROM products WHERE status = 'published') as publishedProducts,
              (SELECT COUNT(*) FROM orders) as totalOrders,
              (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status NOT IN ('cancelled', 'rejected')) as gmvUgx`
    )
    .get();

  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/001_ugabyte_commerce.sql');
  const migrationSql = fs.existsSync(migrationPath) ? fs.readFileSync(migrationPath, 'utf8') : '';
  const migration002Path = path.resolve(process.cwd(), 'supabase/migrations/002_infrastructure_no_payments.sql');
  const migration002Sql = fs.existsSync(migration002Path) ? fs.readFileSync(migration002Path, 'utf8') : '';

  const auditLogs = db
    .prepare(
      `SELECT l.*, u.full_name as admin_name, u.email as admin_email
       FROM admin_audit_logs l
       JOIN users u ON u.id = l.admin_id
       ORDER BY l.created_at DESC
       LIMIT 100`
    )
    .all();

  const users = db
    .prepare('SELECT id, email, full_name, phone, district, role, account_status, created_at FROM users ORDER BY created_at DESC')
    .all();

  const operationalLogs = db
    .prepare('SELECT id, level, event_type, message, route, user_id, created_at FROM operational_logs ORDER BY created_at DESC LIMIT 50')
    .all();

  res.json({
    stores,
    products,
    orders,
    categories,
    stats,
    auditLogs,
    users,
    operationalLogs,
    migrationSql,
    migration002Sql,
  });
});

app.patch('/api/admin/stores/:storeId/status', requireAdmin, (req: AuthedRequest, res) => {
  const { status } = req.body || {};
  if (!['pending', 'active', 'suspended', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid store status.' });
  }
  db.prepare(`UPDATE stores SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(
    status,
    req.params.storeId
  );
  db.prepare(
    `INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, details)
     VALUES (?, ?, ?, 'store', ?, ?)`
  ).run(uuid(), req.user!.id, `store_status_${status}`, req.params.storeId, `Set store status to ${status}`);

  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.storeId);
  res.json({ store });
});

app.patch('/api/admin/products/:productId/status', requireAdmin, (req: AuthedRequest, res) => {
  const { status } = req.body || {};
  if (!['draft', 'published', 'archived'].includes(status)) {
    return res.status(400).json({ error: 'Invalid product status.' });
  }
  db.prepare(`UPDATE products SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(
    status,
    req.params.productId
  );
  db.prepare(
    `INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, details)
     VALUES (?, ?, ?, 'product', ?, ?)`
  ).run(uuid(), req.user!.id, `product_status_${status}`, req.params.productId, `Set product status to ${status}`);

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.productId);
  res.json({ product });
});

app.patch('/api/admin/users/:userId/status', requireAdmin, (req: AuthedRequest, res) => {
  const { accountStatus } = req.body || {};
  if (!['active', 'suspended'].includes(accountStatus)) {
    return res.status(400).json({ error: 'Invalid account status.' });
  }
  if (req.params.userId === req.user!.id && accountStatus === 'suspended') {
    return res.status(400).json({ error: 'Admins cannot suspend their own account.' });
  }
  db.prepare(`UPDATE users SET account_status = ? WHERE id = ?`).run(accountStatus, req.params.userId);
  db.prepare(
    `INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, details)
     VALUES (?, ?, ?, 'user', ?, ?)`
  ).run(uuid(), req.user!.id, `user_status_${accountStatus}`, req.params.userId, `Set user status to ${accountStatus}`);

  const user = db
    .prepare('SELECT id, email, full_name, phone, district, role, account_status FROM users WHERE id = ?')
    .get(req.params.userId);
  res.json({ user });
});

app.post('/api/admin/categories', requireAdmin, (req: AuthedRequest, res) => {
  const { name } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Category name is required.' });
  }
  const cleanName = String(name).trim();
  const slug = slugify(cleanName);
  const id = uuid();
  try {
    db.prepare('INSERT INTO categories (id, name, slug, is_active) VALUES (?, ?, ?, 1)').run(
      id,
      cleanName,
      slug
    );
    db.prepare(
      `INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, details)
       VALUES (?, ?, 'category_created', 'category', ?, ?)`
    ).run(uuid(), req.user!.id, id, `Created category "${cleanName}"`);

    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    res.status(201).json({ category });
  } catch {
    res.status(409).json({ error: 'Category already exists.' });
  }
});

app.patch('/api/admin/categories/:categoryId', requireAdmin, (req: AuthedRequest, res) => {
  const { isActive } = req.body || {};
  db.prepare('UPDATE categories SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, req.params.categoryId);
  db.prepare(
    `INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, details)
     VALUES (?, ?, 'category_toggled', 'category', ?, ?)`
  ).run(uuid(), req.user!.id, req.params.categoryId, `Set category active=${Boolean(isActive)}`);

  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.categoryId);
  res.json({ category });
});

// Global JSON parse / error handler for /api routes
app.use('/api', (err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logOperationalEvent({
    level: 'error',
    eventType: 'api_unhandled_error',
    message: err.message || 'Invalid API request',
    route: req.originalUrl,
  });
  res.status(400).json({ error: err.message || 'Invalid API request.' });
});

// ========================
// VITE / PRODUCTION STATIC SERVING
// ========================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`UgaByte Commerce server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
