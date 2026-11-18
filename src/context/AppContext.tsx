import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { CartItem, Category, Product, Store, User } from '../types';

interface AppContextValue {
  path: string;
  navigate: (to: string) => void;
  user: User | null;
  myStores: Store[];
  favoriteProductIds: string[];
  favoriteProducts: Product[];
  favoriteStoreIds: string[];
  categories: Category[];
  authLoading: boolean;
  refreshAuth: () => Promise<void>;
  logout: () => Promise<void>;
  cart: CartItem[];
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  addToCart: (product: Product, quantity?: number) => void;
  updateCartQty: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  revalidateCart: () => Promise<string[]>;
  cartCount: number;
  cartSubtotal: number;
  toggleFavoriteProduct: (productId: string) => Promise<void>;
  toast: string | null;
  showToast: (msg: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);
const CART_KEY = 'ugabyte_commerce_cart_v1';

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [path, setPath] = useState<string>(() => window.location.pathname || '/market');
  const [user, setUser] = useState<User | null>(null);
  const [myStores, setMyStores] = useState<Store[]>([]);
  const [favoriteProductIds, setFavoriteProductIds] = useState<string[]>([]);
  const [favoriteProducts, setFavoriteProducts] = useState<Product[]>([]);
  const [favoriteStoreIds, setFavoriteStoreIds] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const skipNextServerSync = useRef(false);

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      // Ignore storage quota errors
    }
    if (user && !skipNextServerSync.current) {
      fetch('/api/cart', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        }),
      }).catch(() => {});
    }
    skipNextServerSync.current = false;
  }, [cart, user]);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname || '/market');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    if (to !== window.location.pathname) {
      window.history.pushState({}, '', to);
      setPath(to);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  const syncServerCartOnLogin = useCallback(async () => {
    try {
      const res = await fetch('/api/cart');
      if (!res.ok) return;
      const data = await res.json();
      const serverItems: CartItem[] = (data.items || []).filter((i: any) => i.available);
      if (serverItems.length > 0) {
        skipNextServerSync.current = true;
        setCart((localItems) => {
          const merged = new Map<string, CartItem>();
          for (const sItem of serverItems) {
            merged.set(sItem.productId, {
              productId: sItem.productId,
              slug: sItem.slug,
              name: sItem.name,
              price: sItem.price,
              quantity: Math.min(sItem.maxStock, sItem.quantity),
              maxStock: sItem.maxStock,
              image: sItem.image || null,
              storeId: sItem.storeId,
              storeName: sItem.storeName,
              storeSlug: sItem.storeSlug,
            });
          }
          for (const lItem of localItems) {
            if (!merged.has(lItem.productId)) {
              merged.set(lItem.productId, lItem);
            }
          }
          return Array.from(merged.values());
        });
      }
    } catch {
      // Ignore cart sync network error
    }
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user || null);
        setMyStores(data.stores || []);
        setFavoriteProductIds(data.favoriteProductIds || []);
        setFavoriteProducts(data.favoriteProducts || []);
        setFavoriteStoreIds(data.favoriteStoreIds || []);
        if (data.user) {
          await syncServerCartOnLogin();
        }
      }
    } finally {
      setAuthLoading(false);
    }
  }, [syncServerCartOnLogin]);

  useEffect(() => {
    refreshAuth();
    fetch('/api/categories')
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []))
      .catch(() => {});
  }, [refreshAuth]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setMyStores([]);
    setFavoriteProductIds([]);
    setFavoriteProducts([]);
    setFavoriteStoreIds([]);
    showToast('Signed out of UgaByte Commerce');
    navigate('/market');
  }, [navigate, showToast]);

  const addToCart = useCallback(
    (product: Product, quantity = 1) => {
      if (product.stock_quantity <= 0) {
        showToast('This item is currently out of stock.');
        return;
      }
      setCart((prev) => {
        const existing = prev.find((i) => i.productId === product.id);
        if (existing) {
          const nextQty = Math.min(product.stock_quantity, existing.quantity + quantity);
          return prev.map((i) => (i.productId === product.id ? { ...i, quantity: nextQty } : i));
        }
        return [
          ...prev,
          {
            productId: product.id,
            slug: product.slug,
            name: product.name,
            price: product.price,
            quantity: Math.min(product.stock_quantity, quantity),
            maxStock: product.stock_quantity,
            image: product.primary_image || product.images?.[0]?.storage_path || null,
            storeId: product.store_id,
            storeName: product.store_name || 'UgaByte Store',
            storeSlug: product.store_slug || '',
          },
        ];
      });
      setCartOpen(true);
      showToast(`Added ${product.name} to cart`);
    },
    [showToast]
  );

  const updateCartQty = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((i) => i.productId !== productId));
      return;
    }
    setCart((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, quantity: Math.min(i.maxStock, quantity) } : i))
    );
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const revalidateCart = useCallback(async (): Promise<string[]> => {
    if (cart.length === 0) return [];
    try {
      const res = await fetch('/api/cart/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((c) => ({ productId: c.productId, quantity: c.quantity, price: c.price })),
        }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      setCart(data.items || []);
      return data.issues || [];
    } catch {
      return [];
    }
  }, [cart]);

  const toggleFavoriteProduct = useCallback(
    async (productId: string) => {
      if (!user) {
        showToast('Sign in to save favorite products.');
        navigate('/auth');
        return;
      }
      const res = await fetch(`/api/favorites/products/${productId}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setFavoriteProductIds((prev) =>
          data.favorited ? [...prev, productId] : prev.filter((id) => id !== productId)
        );
      }
    },
    [user, navigate, showToast]
  );

  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);
  const cartSubtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <AppContext.Provider
      value={{
        path,
        navigate,
        user,
        myStores,
        favoriteProductIds,
        favoriteProducts,
        favoriteStoreIds,
        categories,
        authLoading,
        refreshAuth,
        logout,
        cart,
        cartOpen,
        setCartOpen,
        addToCart,
        updateCartQty,
        removeFromCart,
        clearCart,
        revalidateCart,
        cartCount,
        cartSubtotal,
        toggleFavoriteProduct,
        toast,
        showToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
