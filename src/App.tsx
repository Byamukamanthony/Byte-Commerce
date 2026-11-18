/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CartDrawer } from './components/CartDrawer';
import { Navbar } from './components/Navbar';
import { AppProvider, useApp } from './context/AppContext';
import { AdminConsolePage } from './pages/AdminConsolePage';
import { BusinessDashboardPage } from './pages/BusinessDashboardPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { AuthPage, DealsPage, EventsPage, ProfilePage } from './pages/EcosystemPages';
import { MarketPage } from './pages/MarketPage';
import { OrderTrackingPage } from './pages/OrderTrackingPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { StorefrontPage } from './pages/StorefrontPage';

function RouterView() {
  const { path, navigate } = useApp();
  const cleanPath = path.split('?')[0].replace(/\/+$/, '') || '/';

  let content: React.ReactNode;

  if (cleanPath === '/' || cleanPath === '/market') {
    content = <MarketPage />;
  } else if (cleanPath.startsWith('/market/')) {
    const category = decodeURIComponent(cleanPath.slice('/market/'.length));
    content = <MarketPage initialCategory={category} />;
  } else if (cleanPath.startsWith('/product/')) {
    const slug = decodeURIComponent(cleanPath.slice('/product/'.length));
    content = <ProductDetailPage slug={slug} />;
  } else if (cleanPath.startsWith('/store/')) {
    const slug = decodeURIComponent(cleanPath.slice('/store/'.length));
    content = <StorefrontPage slug={slug} />;
  } else if (cleanPath === '/cart') {
    content = <CheckoutPage mode="cart" />;
  } else if (cleanPath === '/checkout') {
    content = <CheckoutPage mode="checkout" />;
  } else if (cleanPath.startsWith('/orders/')) {
    const orderId = decodeURIComponent(cleanPath.slice('/orders/'.length));
    content = <OrderTrackingPage orderId={orderId} />;
  } else if (cleanPath === '/business') {
    content = <BusinessDashboardPage section="overview" />;
  } else if (cleanPath.startsWith('/business/')) {
    const section = cleanPath.slice('/business/'.length);
    content = <BusinessDashboardPage section={section} />;
  } else if (cleanPath.startsWith('/admin')) {
    content = <AdminConsolePage />;
  } else if (cleanPath === '/deals') {
    content = <DealsPage />;
  } else if (cleanPath === '/events') {
    content = <EventsPage />;
  } else if (cleanPath === '/profile') {
    content = <ProfilePage />;
  } else if (cleanPath === '/auth') {
    content = <AuthPage />;
  } else {
    content = (
      <div className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-[#0F172A]">Page Not Found</h1>
        <p className="text-sm text-slate-600">The UgaByte Commerce page you requested could not be found.</p>
        <button
          type="button"
          onClick={() => navigate('/market')}
          className="px-4 py-2 text-sm font-semibold bg-[#0B0F0E] text-white rounded-lg"
        >
          Back to Market
        </button>
      </div>
    );
  }

  return <main className="flex-1">{content}</main>;
}

function Footer() {
  const { navigate } = useApp();
  return (
    <footer className="bg-white border-t border-slate-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-2.5">
          <img
            src="/assets/aistudio/ugabyte_icon_29c10976.png"
            alt="UgaByte"
            className="w-5 h-5 object-contain"
          />
          <span className="font-display font-semibold text-[#0F172A]">UgaByte Commerce</span>
          <span aria-hidden="true">·</span>
          <span>Kampala, Uganda</span>
        </div>

        <div className="flex flex-wrap items-center gap-5">
          <button type="button" onClick={() => navigate('/market')} className="hover:text-[#0B0F0E]">
            Market
          </button>
          <button type="button" onClick={() => navigate('/deals')} className="hover:text-[#0B0F0E]">
            Deals
          </button>
          <button type="button" onClick={() => navigate('/events')} className="hover:text-[#0B0F0E]">
            Events
          </button>
          <button type="button" onClick={() => navigate('/business')} className="hover:text-[#0B0F0E]">
            Sell on UgaByte
          </button>
          <button type="button" onClick={() => navigate('/admin/commerce')} className="hover:text-[#0B0F0E]">
            Admin
          </button>
        </div>
      </div>
    </footer>
  );
}

function ToastBanner() {
  const { toast } = useApp();
  if (!toast) return null;
  return (
    <div className="fixed bottom-5 right-5 z-50 bg-[#0B0F0E] text-white px-4 py-3 rounded-lg shadow-lg border border-white/10 text-sm font-medium max-w-sm">
      {toast}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
        <Navbar />
        <RouterView />
        <Footer />
        <CartDrawer />
        <ToastBanner />
      </div>
    </AppProvider>
  );
}
