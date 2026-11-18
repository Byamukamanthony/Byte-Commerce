import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'ugabyte_commerce.db');
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function uuid(): string {
  return crypto.randomUUID();
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      district TEXT DEFAULT 'Kampala',
      role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'merchant', 'admin')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      parent_id TEXT REFERENCES categories(id),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      logo_url TEXT,
      cover_url TEXT,
      phone TEXT,
      whatsapp_number TEXT,
      email TEXT,
      location_text TEXT,
      district TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'rejected')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS store_members (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'manager', 'staff')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (store_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      category_id TEXT REFERENCES categories(id),
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      price INTEGER NOT NULL CHECK (price >= 0),
      compare_at_price INTEGER,
      stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
      sku TEXT,
      condition TEXT NOT NULL DEFAULT 'new' CHECK (condition IN ('new', 'used', 'refurbished')),
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
      is_featured INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (store_id, slug)
    );

    CREATE TABLE IF NOT EXISTS product_images (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) on DELETE CASCADE,
      storage_path TEXT NOT NULL,
      alt_text TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customer_addresses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      district TEXT,
      area TEXT,
      address_details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      idempotency_key TEXT UNIQUE,
      store_id TEXT NOT NULL REFERENCES stores(id),
      customer_id TEXT REFERENCES users(id),
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_email TEXT,
      delivery_method TEXT NOT NULL CHECK (delivery_method IN ('pickup', 'seller_delivery', 'third_party')),
      delivery_address TEXT,
      delivery_district TEXT,
      delivery_fee INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
      total INTEGER NOT NULL CHECK (total >= 0),
      currency TEXT NOT NULL DEFAULT 'UGX' CHECK (currency = 'UGX'),
      payment_method TEXT NOT NULL DEFAULT 'cash_on_delivery' CHECK (payment_method IN ('cash_on_delivery', 'cash_on_pickup', 'mtn_momo', 'airtel_money')),
      payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed', 'refunded')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'processing', 'ready', 'dispatched', 'completed', 'cancelled', 'rejected')),
      customer_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      sku TEXT,
      unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      line_total INTEGER NOT NULL CHECK (line_total >= 0)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK (provider IN ('cash', 'mtn_momo', 'airtel_money', 'other')),
      provider_reference TEXT,
      amount INTEGER NOT NULL CHECK (amount >= 0),
      currency TEXT NOT NULL DEFAULT 'UGX',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed', 'refunded')),
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_status_history (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      old_status TEXT,
      new_status TEXT NOT NULL,
      changed_by TEXT REFERENCES users(id),
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS store_favorites (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, store_id)
    );

    CREATE TABLE IF NOT EXISTS product_favorites (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      discount_label TEXT NOT NULL,
      product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
      store_id TEXT REFERENCES stores(id) ON DELETE SET NULL,
      expires_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      organizer TEXT NOT NULL,
      venue TEXT NOT NULL,
      district TEXT NOT NULL,
      event_date TEXT NOT NULL,
      ticket_price INTEGER NOT NULL DEFAULT 0,
      description TEXT NOT NULL,
      store_id TEXT REFERENCES stores(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS products_store_status_idx ON products(store_id, status);
    CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id);
    CREATE INDEX IF NOT EXISTS orders_store_created_idx ON orders(store_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS orders_customer_created_idx ON orders(customer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS stores_status_idx ON stores(status);

    CREATE TABLE IF NOT EXISTS cart_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS uploaded_assets (
      id TEXT PRIMARY KEY,
      store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
      uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      bucket TEXT NOT NULL DEFAULT 'product-images',
      url TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS operational_logs (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      route TEXT,
      user_id TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Safe non-destructive column migrations for existing databases
  const userCols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!userCols.some((c) => c.name === 'account_status')) {
    db.exec(`ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended'))`);
  }

  seedInitialData();
}

function seedInitialData() {
  const userCount = (db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number }).cnt;
  if (userCount > 0) return;

  const adminId = uuid();
  const merchant1Id = uuid();
  const merchant2Id = uuid();
  const customerId = uuid();

  const insertUser = db.prepare(`
    INSERT INTO users (id, email, password_hash, full_name, phone, district, role)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  insertUser.run(adminId, 'admin@ugabyte.ug', hash('AdminUga2026!'), 'Amina Nabwire', '+256701000111', 'Kampala', 'admin');
  insertUser.run(merchant1Id, 'merchant@ugabyte.ug', hash('MerchantUga2026!'), 'Tony Ssemwogerere', '+256772345678', 'Kampala', 'merchant');
  insertUser.run(merchant2Id, 'roasters@ugabyte.ug', hash('RoastUga2026!'), 'Grace Birungi', '+256752889900', 'Fort Portal', 'merchant');
  insertUser.run(customerId, 'customer@ugabyte.ug', hash('CustomerUga2026!'), 'Brian Kato', '+256782112233', 'Wakiso', 'customer');

  const categories = [
    { id: uuid(), name: 'Fashion & Kitenge', slug: 'fashion-kitenge' },
    { id: uuid(), name: 'Food & Coffee', slug: 'food-coffee' },
    { id: uuid(), name: 'Beauty & Shea', slug: 'beauty-shea' },
    { id: uuid(), name: 'Electronics & Solar', slug: 'electronics-solar' },
    { id: uuid(), name: 'Leather & Craft', slug: 'leather-craft' },
    { id: uuid(), name: 'Campus Essentials', slug: 'campus-essentials' },
  ];

  const insertCategory = db.prepare('INSERT INTO categories (id, name, slug, is_active) VALUES (?, ?, ?, 1)');
  for (const c of categories) {
    insertCategory.run(c.id, c.name, c.slug);
  }
  const catMap = Object.fromEntries(categories.map((c) => [c.slug, c.id]));

  const store1Id = uuid();
  const store2Id = uuid();
  const store3Id = uuid();
  const store4Id = uuid();

  const insertStore = db.prepare(`
    INSERT INTO stores (id, owner_id, name, slug, description, logo_url, cover_url, phone, whatsapp_number, email, location_text, district, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMember = db.prepare(`INSERT INTO store_members (id, store_id, user_id, role) VALUES (?, ?, ?, 'owner')`);

  insertStore.run(
    store1Id,
    merchant1Id,
    'Empako Leather & Apparel',
    'empako-leather',
    'Handcrafted Ugandan full-grain leather bags and contemporary Kitenge menswear tailored in Industrial Area, Kampala.',
    '/assets/aistudio/ugabyte_icon_29c10976.png',
    '/src/assets/images/hero_kampala_commerce_1795001653548.jpg',
    '+256772345678',
    '256772345678',
    'orders@empako.ug',
    'Plot 14 Luthuli Avenue, Bugolobi',
    'Kampala',
    'active'
  );
  insertMember.run(uuid(), store1Id, merchant1Id);

  insertStore.run(
    store2Id,
    merchant2Id,
    'Rwenzori Roast Collective',
    'rwenzori-roast',
    'High-altitude single-origin Arabica coffee and unrefined Northern Ugandan Nilotica shea skincare.',
    '/assets/aistudio/ugabyte_icon_29c10976.png',
    '/src/assets/images/product_rwenzori_coffee_1795001654127.jpg',
    '+256752889900',
    '256752889900',
    'hello@rwenzoriroast.ug',
    'Kasese Road Hub & Kololo Pickup Point',
    'Kampala',
    'active'
  );
  insertMember.run(uuid(), store2Id, merchant2Id);

  insertStore.run(
    store3Id,
    merchant1Id,
    'Kampala Solar & Tech',
    'kampala-solar-tech',
    'Reliable portable solar chargers, USB-C cables, and off-grid campus power gear tested for Ugandan conditions.',
    '/assets/aistudio/ugabyte_icon_29c10976.png',
    '/src/assets/images/product_solar_powerbank_1795001657439.jpg',
    '+256772345678',
    '256772345678',
    'support@kampalasolar.ug',
    'Mabirizi Complex Level 3, Kampala Road',
    'Kampala',
    'active'
  );
  insertMember.run(uuid(), store3Id, merchant1Id);

  insertStore.run(
    store4Id,
    merchant2Id,
    'Gulu Nilotica Co-op',
    'gulu-nilotica',
    'Cold-pressed organic Nilotica shea butter and botanical facial oils harvested by women cooperatives in Northern Uganda.',
    '/assets/aistudio/ugabyte_icon_29c10976.png',
    '/src/assets/images/product_nilotica_shea_1795001656443.jpg',
    '+256752889900',
    '256752889900',
    'care@gulunilotica.ug',
    'Main Street Arcade, Gulu City',
    'Gulu',
    'pending'
  );
  insertMember.run(uuid(), store4Id, merchant2Id);

  const insertProduct = db.prepare(`
    INSERT INTO products (id, store_id, category_id, name, slug, description, price, compare_at_price, stock_quantity, sku, condition, status, is_featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertProductImage = db.prepare(`
    INSERT INTO product_images (id, product_id, storage_path, alt_text, sort_order)
    VALUES (?, ?, ?, ?, 0)
  `);

  const products = [
    {
      id: uuid(),
      storeId: store1Id,
      catId: catMap['leather-craft'],
      name: 'Bugolobi Full-Grain Leather Tote',
      slug: 'bugolobi-full-grain-leather-tote',
      description: 'Hand-stitched cognac cowhide everyday tote with solid brass rivets, reinforced shoulder handles, and 14-inch laptop sleeve.',
      price: 245000,
      compareAt: 285000,
      stock: 14,
      sku: 'EMP-TOTE-01',
      status: 'published',
      featured: 1,
      image: '/src/assets/images/product_kampala_leather_tote_1795001656806.jpg',
    },
    {
      id: uuid(),
      storeId: store1Id,
      catId: catMap['fashion-kitenge'],
      name: 'Olive Canvas Kitenge Collar Overshirt',
      slug: 'olive-canvas-kitenge-overshirt',
      description: 'Heavyweight 100% Ugandan cotton canvas overshirt finished with hand-selected geometric Kitenge collar and chest pocket trim.',
      price: 135000,
      compareAt: 160000,
      stock: 22,
      sku: 'EMP-SHIRT-04',
      status: 'published',
      featured: 1,
      image: '/src/assets/images/product_kitenge_overshirt_1795001656336.jpg',
    },
    {
      id: uuid(),
      storeId: store2Id,
      catId: catMap['food-coffee'],
      name: 'Rwenzori AA Single-Origin Arabica (500g)',
      slug: 'rwenzori-aa-arabica-500g',
      description: 'Washed high-altitude Arabica roasted in small batches in Kampala. Notes of dark cacao, bergamot, and toasted cane sugar.',
      price: 42000,
      compareAt: 50000,
      stock: 48,
      sku: 'RWZ-COF-500',
      status: 'published',
      featured: 1,
      image: '/src/assets/images/product_rwenzori_coffee_1795001654127.jpg',
    },
    {
      id: uuid(),
      storeId: store2Id,
      catId: catMap['beauty-shea'],
      name: 'Unrefined Nilotica Shea & Serum Duo',
      slug: 'unrefined-nilotica-shea-serum-duo',
      description: 'Cold-pressed Northern Ugandan Vitellaria nilotica whipped butter paired with a 30ml botanical hydration serum in UV-safe amber glass.',
      price: 68000,
      compareAt: 80000,
      stock: 19,
      sku: 'RWZ-SHEA-02',
      status: 'published',
      featured: 1,
      image: '/src/assets/images/product_nilotica_shea_1795001656443.jpg',
    },
    {
      id: uuid(),
      storeId: store3Id,
      catId: catMap['electronics-solar'],
      name: '20,000mAh Rugged Solar Power Bank USB-C',
      slug: 'rugged-solar-power-bank-20000mah',
      description: 'Fast-charging 22.5W dual-output portable power bank with monocrystalline solar recharge panel and braided USB-C cable.',
      price: 148000,
      compareAt: 175000,
      stock: 9,
      sku: 'KST-SOL-20K',
      status: 'published',
      featured: 1,
      image: '/src/assets/images/product_solar_powerbank_1795001657439.jpg',
    },
    {
      id: uuid(),
      storeId: store3Id,
      catId: catMap['campus-essentials'],
      name: 'Makerere Desk & Study Solar Kit',
      slug: 'makerere-desk-study-solar-kit',
      description: 'Backup battery unit tailored for university hostels with LED reading lamp support and two fast USB ports.',
      price: 95000,
      compareAt: null,
      stock: 4,
      sku: 'KST-CAMP-09',
      status: 'published',
      featured: 0,
      image: '/src/assets/images/product_solar_powerbank_1795001657439.jpg',
    },
    {
      id: uuid(),
      storeId: store1Id,
      catId: catMap['leather-craft'],
      name: 'Kampala Messenger Satchel (Draft Prototype)',
      slug: 'kampala-messenger-satchel-draft',
      description: 'Upcoming leather commuter satchel currently undergoing quality inspection before marketplace launch.',
      price: 310000,
      compareAt: null,
      stock: 3,
      sku: 'EMP-MSG-99',
      status: 'draft',
      featured: 0,
      image: '/src/assets/images/hero_kampala_commerce_1795001653548.jpg',
    },
  ];

  for (const p of products) {
    insertProduct.run(
      p.id,
      p.storeId,
      p.catId,
      p.name,
      p.slug,
      p.description,
      p.price,
      p.compareAt,
      p.stock,
      p.sku,
      'new',
      p.status,
      p.featured
    );
    insertProductImage.run(uuid(), p.id, p.image, p.name);
  }

  // Seed one authentic completed + one pending order for merchant1 so dashboard is immediately inspectable
  const ord1Id = uuid();
  const ord2Id = uuid();
  db.prepare(`
    INSERT INTO orders (id, order_number, store_id, customer_id, customer_name, customer_phone, customer_email, delivery_method, delivery_address, delivery_district, delivery_fee, subtotal, total, currency, payment_method, payment_status, status, customer_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UGX', ?, ?, ?, ?)
  `).run(
    ord1Id,
    'UGB-1041',
    store1Id,
    customerId,
    'Brian Kato',
    '+256782112233',
    'customer@ugabyte.ug',
    'seller_delivery',
    'Ntinda Stretcher Road, Stage 2',
    'Kampala',
    5000,
    245000,
    250000,
    'cash_on_delivery',
    'paid',
    'completed',
    'Call when arriving near Capital Shoppers.'
  );
  db.prepare(`
    INSERT INTO order_items (id, order_id, product_id, product_name, sku, unit_price, quantity, line_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuid(), ord1Id, products[0].id, products[0].name, products[0].sku, 245000, 1, 245000);
  db.prepare(`INSERT INTO payments (id, order_id, provider, amount, currency, status) VALUES (?, ?, 'cash', 250000, 'UGX', 'successful')`).run(uuid(), ord1Id);
  db.prepare(`INSERT INTO order_status_history (id, order_id, old_status, new_status, changed_by, note) VALUES (?, ?, NULL, 'pending', ?, 'Order submitted by customer')`).run(uuid(), ord1Id, customerId);
  db.prepare(`INSERT INTO order_status_history (id, order_id, old_status, new_status, changed_by, note) VALUES (?, ?, 'pending', 'completed', ?, 'Delivered and paid in cash')`).run(uuid(), ord1Id, merchant1Id);

  db.prepare(`
    INSERT INTO orders (id, order_number, store_id, customer_id, customer_name, customer_phone, customer_email, delivery_method, delivery_address, delivery_district, delivery_fee, subtotal, total, currency, payment_method, payment_status, status, customer_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UGX', ?, ?, ?, ?)
  `).run(
    ord2Id,
    'UGB-1042',
    store1Id,
    customerId,
    'Brian Kato',
    '+256782112233',
    'customer@ugabyte.ug',
    'pickup',
    'Store Pickup — Bugolobi',
    'Kampala',
    0,
    135000,
    135000,
    'cash_on_pickup',
    'unpaid',
    'pending',
    'Picking up Saturday afternoon.'
  );
  db.prepare(`
    INSERT INTO order_items (id, order_id, product_id, product_name, sku, unit_price, quantity, line_total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(uuid(), ord2Id, products[1].id, products[1].name, products[1].sku, 135000, 1, 135000);
  db.prepare(`INSERT INTO payments (id, order_id, provider, amount, currency, status) VALUES (?, ?, 'cash', 135000, 'UGX', 'pending')`).run(uuid(), ord2Id);
  db.prepare(`INSERT INTO order_status_history (id, order_id, old_status, new_status, changed_by, note) VALUES (?, ?, NULL, 'pending', ?, 'Order placed for store pickup')`).run(uuid(), ord2Id, customerId);

  // Seed UgaByte Deals & Events (integrated with Stores & Products)
  const insertDeal = db.prepare(`INSERT INTO deals (id, title, subtitle, discount_label, product_id, store_id, expires_at, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`);
  insertDeal.run(uuid(), 'Kampala Craft Week — Leather Tote', 'Save UGX 40,000 on handcrafted Bugolobi cowhide totes.', '14% OFF', products[0].id, store1Id, '2026-12-15');
  insertDeal.run(uuid(), 'Fresh Harvest Roast Bundle', 'Single-origin Rwenzori Arabica direct from Fort Portal farmers.', '16% OFF', products[2].id, store2Id, '2026-12-01');
  insertDeal.run(uuid(), 'Back-to-Campus Power Drop', '20,000mAh solar backup power bank with braided USB-C cable.', '15% OFF', products[4].id, store3Id, '2026-11-30');

  const insertEvent = db.prepare(`INSERT INTO events (id, title, organizer, venue, district, event_date, ticket_price, description, store_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  insertEvent.run(uuid(), 'Kampala Creators & Makers Pop-Up Market', 'UgaByte Commerce', 'Motiv Bugolobi Courtyard', 'Kampala', '2026-12-06 10:00', 0, 'Shop 40+ verified Ugandan clothing, leather, coffee, and beauty storefronts in person with instant mobile pickup.', store1Id);
  insertEvent.run(uuid(), 'Uganda SME Digital Commerce Clinic', 'UgaByte Business Team', 'National ICT Innovation Hub, Nakawa', 'Kampala', '2026-12-12 14:00', 25000, 'Hands-on workshop on pricing in UGX, product photography on mobile, and fulfilling WhatsApp & online orders.', store3Id);
  insertEvent.run(uuid(), 'Rwenzori Coffee Cupping & Tasting Session', 'Rwenzori Roast Collective', 'Kololo Terrace Lounge', 'Kampala', '2026-12-19 15:00', 35000, 'Guided tasting of washed and natural Rwenzori Arabica harvests with roastery founders.', store2Id);
}
