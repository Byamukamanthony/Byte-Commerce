import assert from 'node:assert/strict';

const BASE = 'http://localhost:3000';

async function req(path: string, opts: RequestInit = {}, cookie?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((opts.headers as Record<string, string>) || {}),
  };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, headers: res.headers, data: json };
}

function getCookie(resHeaders: Headers): string {
  const raw = resHeaders.get('set-cookie') || '';
  return raw.split(';')[0];
}

async function runSuite() {
  const results: { name: string; status: 'PASS' | 'FAIL'; detail: string }[] = [];
  const check = async (name: string, fn: () => Promise<string>) => {
    try {
      const detail = await fn();
      results.push({ name, status: 'PASS', detail });
    } catch (err) {
      results.push({
        name,
        status: 'FAIL',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const ts = Date.now();
  let merchantACookie = '';
  let merchantBCookie = '';
  let customerCookie = '';
  let adminCookie = '';
  let storeAId = '';
  let storeASlug = `qa-store-a-${ts}`;
  let draftProdId = '';
  let pubProdId = '';
  let pubProdSlug = '';
  let orderNumber = '';
  let orderId = '';
  let uploadedUrl = '';

  // TEST 1 & 4 — Public Market & Filters
  await check('1. Public marketplace hides drafts & pending stores and supports filters', async () => {
    const m = await req('/api/market/products?sort=price_asc&limit=12');
    assert.equal(m.status, 200);
    assert.ok(Array.isArray(m.data.products) && m.data.products.length > 0);
    assert.equal(m.data.products.some((p: any) => p.status !== 'published'), false);
    const stores = await req('/api/stores');
    assert.equal(stores.data.stores.some((s: any) => s.status !== 'active'), false);
    return `${m.data.products.length} published products, ${stores.data.stores.length} active stores`;
  });

  // TEST 1 — Auth Flow Verification + Password Change
  await check('2. Register roles, reject invalid login, verify password update & session', async () => {
    const bad = await req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'merchant@ugabyte.ug', password: 'WrongPassword!' }),
    });
    assert.equal(bad.status, 401);

    const regA = await req('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: `qa-merch-a-${ts}@ugabyte.ug`,
        password: 'TestPass2026!',
        fullName: 'QA Merchant A',
        phone: '+256772100100',
        role: 'merchant',
      }),
    });
    assert.equal(regA.status, 201);
    merchantACookie = getCookie(regA.headers);

    const regB = await req('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: `qa-merch-b-${ts}@ugabyte.ug`,
        password: 'TestPass2026!',
        fullName: 'QA Merchant B',
        phone: '+256772200200',
        role: 'merchant',
      }),
    });
    assert.equal(regB.status, 201);
    merchantBCookie = getCookie(regB.headers);

    const regC = await req('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: `qa-cust-${ts}@ugabyte.ug`,
        password: 'TestPass2026!',
        fullName: 'QA Customer',
        phone: '+256782300300',
        role: 'customer',
      }),
    });
    assert.equal(regC.status, 201);
    customerCookie = getCookie(regC.headers);

    // Change customer password & verify login with new password
    const chg = await req(
      '/api/auth/change-password',
      { method: 'POST', body: JSON.stringify({ currentPassword: 'TestPass2026!', newPassword: 'NewCustPass2026!' }) },
      customerCookie
    );
    assert.equal(chg.status, 200);
    const relogin = await req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: `qa-cust-${ts}@ugabyte.ug`, password: 'NewCustPass2026!' }),
    });
    assert.equal(relogin.status, 200);
    customerCookie = getCookie(relogin.headers);

    const adm = await req('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@ugabyte.ug', password: 'AdminUga2026!' }),
    });
    assert.equal(adm.status, 200);
    adminCookie = getCookie(adm.headers);
    return 'All 4 roles authenticated, password change + re-login passed, bad credentials returned 401';
  });

  // TEST 2 & 8 — Store Creation, Slug Check, Approval & Admin Audit Log
  await check('3. Store slug availability check, pending creation, admin approval & audit log', async () => {
    const slugFree = await req(`/api/business/stores/check-slug?slug=${storeASlug}`, {}, merchantACookie);
    assert.equal(slugFree.status, 200);
    assert.equal(slugFree.data.available, true);

    const create = await req(
      '/api/business/stores',
      {
        method: 'POST',
        body: JSON.stringify({
          name: `QA Store ${ts}`,
          slug: storeASlug,
          description: 'QA automated test store',
          phone: '+256772100100',
          district: 'Kampala',
        }),
      },
      merchantACookie
    );
    assert.equal(create.status, 201);
    assert.equal(create.data.store.status, 'pending');
    storeAId = create.data.store.id;

    const slugTaken = await req(`/api/business/stores/check-slug?slug=${storeASlug}`, {}, merchantBCookie);
    assert.equal(slugTaken.data.available, false);

    // Public cannot view pending store
    const pubPending = await req(`/api/stores/${storeASlug}`);
    assert.equal(pubPending.status, 404);

    // Non-admin cannot approve store
    const merchApprove = await req(
      `/api/admin/stores/${storeAId}/status`,
      { method: 'PATCH', body: JSON.stringify({ status: 'active' }) },
      merchantACookie
    );
    assert.equal(merchApprove.status, 403);

    // Admin approves & audit log records action
    const admApprove = await req(
      `/api/admin/stores/${storeAId}/status`,
      { method: 'PATCH', body: JSON.stringify({ status: 'active' }) },
      adminCookie
    );
    assert.equal(admApprove.status, 200);
    assert.equal(admApprove.data.store.status, 'active');

    const overview = await req('/api/admin/overview', {}, adminCookie);
    assert.ok(overview.data.auditLogs.some((l: any) => l.target_id === storeAId && l.action === 'store_status_active'));
    return `Store ${storeASlug} checked, created pending -> approved active + logged in admin_audit_logs`;
  });

  // TEST 2 — Cross-merchant RBAC Isolation
  await check('4. Merchant B cannot edit Merchant A store, products, or orders (403)', async () => {
    const editStore = await req(
      `/api/business/stores/${storeAId}`,
      { method: 'PATCH', body: JSON.stringify({ name: 'Hijacked' }) },
      merchantBCookie
    );
    assert.equal(editStore.status, 403);

    const addProd = await req(
      `/api/business/stores/${storeAId}/products`,
      { method: 'POST', body: JSON.stringify({ name: 'Illegal', price: 1000, stockQuantity: 5 }) },
      merchantBCookie
    );
    assert.equal(addProd.status, 403);

    const viewOrders = await req(`/api/business/stores/${storeAId}/orders`, {}, merchantBCookie);
    assert.equal(viewOrders.status, 403);
    return 'All cross-tenant mutations/reads returned 403 Forbidden';
  });

  // TEST 3 — Storage Security (Store-scoped upload & delete authorization)
  await check('5. File upload validates MIME, enforces store ownership, and blocks cross-merchant deletion', async () => {
    const badUpload = await req(
      '/api/upload',
      {
        method: 'POST',
        body: JSON.stringify({
          filename: 'malware.exe',
          mimeType: 'application/x-msdownload',
          base64Data: 'dGVzdA==',
          storeId: storeAId,
        }),
      },
      merchantACookie
    );
    assert.equal(badUpload.status, 400);

    const tinyPngB64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    // Merchant B cannot upload into Merchant A store
    const crossUpload = await req(
      '/api/upload',
      {
        method: 'POST',
        body: JSON.stringify({
          filename: 'stolen.png',
          mimeType: 'image/png',
          base64Data: tinyPngB64,
          storeId: storeAId,
          bucket: 'product-images',
        }),
      },
      merchantBCookie
    );
    assert.equal(crossUpload.status, 403);

    const goodUpload = await req(
      '/api/upload',
      {
        method: 'POST',
        body: JSON.stringify({
          filename: 'qa-photo.png',
          mimeType: 'image/png',
          base64Data: tinyPngB64,
          storeId: storeAId,
          bucket: 'product-images',
        }),
      },
      merchantACookie
    );
    assert.equal(goodUpload.status, 201);
    uploadedUrl = goodUpload.data.url;
    assert.ok(uploadedUrl.startsWith('/uploads/'));

    // Merchant B cannot delete Merchant A's uploaded asset
    const crossDelete = await req(
      '/api/upload',
      { method: 'DELETE', body: JSON.stringify({ url: uploadedUrl }) },
      merchantBCookie
    );
    assert.equal(crossDelete.status, 403);

    // Merchant A can delete their own uploaded asset
    const ownDelete = await req(
      '/api/upload',
      { method: 'DELETE', body: JSON.stringify({ url: uploadedUrl }) },
      merchantACookie
    );
    assert.equal(ownDelete.status, 200);
    return `Store-scoped upload & delete enforced (cross-tenant upload/delete 403, owner delete 200)`;
  });

  // TEST 6 — Product Validation, Draft Isolation, and Cart Persistence / Revalidation
  await check('6. Product validation, draft isolation, cart persistence, and live revalidation', async () => {
    const badPrice = await req(
      `/api/business/stores/${storeAId}/products`,
      { method: 'POST', body: JSON.stringify({ name: 'Bad', price: 'not-a-number', stockQuantity: 2 }) },
      merchantACookie
    );
    assert.equal(badPrice.status, 400);

    const draft = await req(
      `/api/business/stores/${storeAId}/products`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: `QA Draft Item ${ts}`,
          price: 25000,
          stockQuantity: 3,
          status: 'draft',
        }),
      },
      merchantACookie
    );
    assert.equal(draft.status, 201);
    draftProdId = draft.data.product.id;

    const pubDraft = await req(`/api/products/${draft.data.product.slug}`);
    assert.equal(pubDraft.status, 404);

    const pub = await req(
      `/api/business/stores/${storeAId}/products`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: `QA Live Product ${ts}`,
          description: 'Authentic Kampala test product',
          price: 50000,
          stockQuantity: 2,
          status: 'published',
        }),
      },
      merchantACookie
    );
    assert.equal(pub.status, 201);
    pubProdId = pub.data.product.id;
    pubProdSlug = pub.data.product.slug;

    // Persist cart for customer & revalidate against tampered price / excess quantity
    const saveCart = await req(
      '/api/cart',
      { method: 'PUT', body: JSON.stringify({ items: [{ productId: pubProdId, quantity: 1 }] }) },
      customerCookie
    );
    assert.equal(saveCart.status, 200);
    const getCart = await req('/api/cart', {}, customerCookie);
    assert.equal(getCart.data.items.length, 1);

    const validateCart = await req('/api/cart/validate', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          { productId: pubProdId, quantity: 99, price: 1 },
          { productId: draftProdId, quantity: 1, price: 25000 },
        ],
      }),
    });
    assert.equal(validateCart.status, 200);
    assert.equal(validateCart.data.valid, false);
    assert.equal(validateCart.data.items.length, 1);
    assert.equal(validateCart.data.items[0].price, 50000);
    assert.equal(validateCart.data.items[0].quantity, 2);
    assert.ok(validateCart.data.issues.length >= 2);
    return `Draft hidden (404), server cart persisted, and revalidation corrected price & stock`;
  });

  // TEST 10 & TEST 6 — Payment Restriction + Checkout Price Authority, Concurrency & Idempotency
  await check('7. Payment restriction enforced + Checkout ignores client price & prevents final-unit oversell', async () => {
    // TEST 10: Reject in-app payment providers or payment tokens
    const momoAttempt = await req(
      '/api/orders',
      {
        method: 'POST',
        body: JSON.stringify({
          customerName: 'QA Buyer',
          customerPhone: '+256782300300',
          deliveryMethod: 'pickup',
          paymentMethod: 'mtn_momo',
          items: [{ productId: pubProdId, quantity: 1 }],
        }),
      },
      customerCookie
    );
    assert.equal(momoAttempt.status, 400);

    const cardAttempt = await req(
      '/api/orders',
      {
        method: 'POST',
        body: JSON.stringify({
          customerName: 'QA Buyer',
          customerPhone: '+256782300300',
          deliveryMethod: 'pickup',
          paymentToken: 'tok_visa_fake',
          items: [{ productId: pubProdId, quantity: 1 }],
        }),
      },
      customerCookie
    );
    assert.equal(cardAttempt.status, 400);

    // Valid checkout without payment credentials (price tampering ignored)
    const idem = `qa-idem-${ts}`;
    const valid = await req(
      '/api/orders',
      {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: idem,
          customerName: 'QA Customer',
          customerPhone: '+256782300300',
          deliveryMethod: 'seller_delivery',
          deliveryDistrict: 'Kampala',
          deliveryAddress: 'Kololo Hill Drive',
          items: [{ productId: pubProdId, quantity: 1, price: 1, unit_price: 1 }],
        }),
      },
      customerCookie
    );
    assert.equal(valid.status, 201);
    assert.equal(valid.data.orders[0].subtotal, 50000);
    assert.equal(valid.data.orders[0].delivery_fee, 5000);
    assert.equal(valid.data.orders[0].total, 55000);
    assert.equal(
      valid.data.message,
      'Your order has been submitted. The seller will contact you to confirm fulfilment and payment arrangements.'
    );
    orderNumber = valid.data.orders[0].order_number;
    orderId = valid.data.orders[0].id;

    // Customer cart automatically cleared after order submission
    const cartAfter = await req('/api/cart', {}, customerCookie);
    assert.equal(cartAfter.data.items.length, 0);

    // Idempotent replay
    const replay = await req(
      '/api/orders',
      {
        method: 'POST',
        body: JSON.stringify({
          idempotencyKey: idem,
          customerName: 'QA Customer',
          customerPhone: '+256782300300',
          deliveryMethod: 'seller_delivery',
          deliveryDistrict: 'Kampala',
          deliveryAddress: 'Kololo Hill Drive',
          items: [{ productId: pubProdId, quantity: 1 }],
        }),
      },
      customerCookie
    );
    assert.equal(replay.status, 200);
    assert.equal(replay.data.deduplicated, true);

    // Concurrent race on final 1 unit
    const [race1, race2] = await Promise.all([
      req('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerName: 'Race 1',
          customerPhone: '+256782300301',
          deliveryMethod: 'pickup',
          items: [{ productId: pubProdId, quantity: 1 }],
        }),
      }),
      req('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          customerName: 'Race 2',
          customerPhone: '+256782300302',
          deliveryMethod: 'pickup',
          items: [{ productId: pubProdId, quantity: 1 }],
        }),
      }),
    ]);
    assert.deepEqual([race1.status, race2.status].sort(), [201, 400]);

    const afterRace = await req(`/api/products/${pubProdSlug}`);
    assert.equal(afterRace.data.product.stock_quantity, 0);
    return `Blocked MoMo/card payloads (400), submitted order UGX 55,000, deduplicated replay, cleared cart, & won concurrent stock race`;
  });

  // TEST 7 & 10 — Order Access Privacy, State Machine, and Disabled Payment Status Mutation
  await check('8. Order privacy, state machine transitions, and blocked paymentStatus mutation', async () => {
    const unauthView = await req(`/api/orders/${orderNumber}`, {}, merchantBCookie);
    assert.equal(unauthView.status, 403);

    const shortPhone = await req(`/api/orders/${orderNumber}?phone=00`);
    assert.equal(shortPhone.status, 403);

    // Payment status mutation is disabled (400)
    const blockPayMut = await req(
      `/api/business/stores/${storeAId}/orders/${orderId}`,
      { method: 'PATCH', body: JSON.stringify({ paymentStatus: 'paid' }) },
      merchantACookie
    );
    assert.equal(blockPayMut.status, 400);

    const t1 = await req(
      `/api/business/stores/${storeAId}/orders/${orderId}`,
      { method: 'PATCH', body: JSON.stringify({ status: 'accepted' }) },
      merchantACookie
    );
    assert.equal(t1.status, 200);

    const badJump = await req(
      `/api/business/stores/${storeAId}/orders/${orderId}`,
      { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) },
      merchantACookie
    );
    assert.equal(badJump.status, 400);

    await req(
      `/api/business/stores/${storeAId}/orders/${orderId}`,
      { method: 'PATCH', body: JSON.stringify({ status: 'ready' }) },
      merchantACookie
    );
    const done = await req(
      `/api/business/stores/${storeAId}/orders/${orderId}`,
      { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) },
      merchantACookie
    );
    assert.equal(done.status, 200);
    assert.equal(done.data.order.status, 'completed');

    const revert = await req(
      `/api/business/stores/${storeAId}/orders/${orderId}`,
      { method: 'PATCH', body: JSON.stringify({ status: 'pending' }) },
      merchantACookie
    );
    assert.equal(revert.status, 400);
    return `Order ${orderNumber} progressed cleanly; paymentStatus mutation rejected (400); invalid jumps blocked`;
  });

  // TEST 9 — Ecosystem Regression (Deals, Events, Profile)
  await check('9. Existing Deals, Events & Profile update endpoints work', async () => {
    const deals = await req('/api/deals');
    assert.equal(deals.status, 200);
    assert.ok(deals.data.deals.length > 0);

    const events = await req('/api/events');
    assert.equal(events.status, 200);
    assert.ok(events.data.events.length > 0);

    const prof = await req(
      '/api/auth/me',
      { method: 'PATCH', body: JSON.stringify({ fullName: 'QA Customer Updated', district: 'Wakiso' }) },
      customerCookie
    );
    assert.equal(prof.status, 200);
    assert.equal(prof.data.user.district, 'Wakiso');
    return `${deals.data.deals.length} deals, ${events.data.events.length} events, profile PATCH verified`;
  });

  console.log(JSON.stringify(results, null, 2));
  const failed = results.filter((r) => r.status === 'FAIL');
  if (failed.length > 0) process.exit(1);
}

runSuite().catch((e) => {
  console.error(e);
  process.exit(1);
});
