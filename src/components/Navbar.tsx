import { Menu, ShoppingBag, X } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../context/AppContext';

export function Navbar() {
  const { path, navigate, user, cartCount, setCartOpen } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const links = [
    { label: 'Market', to: '/market', match: (p: string) => p === '/' || p.startsWith('/market') || p.startsWith('/product') || p.startsWith('/store') },
    { label: 'Deals', to: '/deals', match: (p: string) => p.startsWith('/deals') },
    { label: 'Events', to: '/events', match: (p: string) => p.startsWith('/events') },
    { label: 'Business', to: '/business', match: (p: string) => p.startsWith('/business') },
    ...(user?.role === 'admin'
      ? [{ label: 'Admin', to: '/admin/commerce', match: (p: string) => p.startsWith('/admin') }]
      : [{ label: 'Orders', to: '/profile', match: (p: string) => p.startsWith('/profile') || p.startsWith('/orders') }]),
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => navigate('/market')}
          className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B0F0E]"
        >
          <img
            src="/assets/aistudio/ugabyte_icon_29c10976.png"
            alt="UgaByte Commerce logo"
            className="w-7 h-7 object-contain shrink-0"
          />
          <span className="font-display text-lg font-bold tracking-tight text-[#0B0F0E]">
            UgaByte Commerce
          </span>
        </button>

        {/* Zone 2: 5 concise single-line text nav links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
          {links.map((link) => {
            const active = link.match(path);
            return (
              <button
                key={link.to}
                type="button"
                onClick={() => navigate(link.to)}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                  active
                    ? 'border-[#0B0F0E] text-[#0B0F0E] font-semibold'
                    : 'border-transparent text-slate-600 hover:text-[#0B0F0E]'
                }`}
              >
                {link.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary Action Cluster (Cart + Account) */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            aria-label="Open shopping cart"
            className="relative inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-[#0B0F0E] bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="hidden sm:inline">Cart</span>
            <span className="font-mono text-xs font-semibold tabular-nums bg-[#BAFF00] text-[#0B0F0E] px-1.5 py-0.5 rounded">
              {cartCount}
            </span>
          </button>

          {user ? (
            <button
              type="button"
              onClick={() => navigate(user.role === 'admin' ? '/admin/commerce' : '/profile')}
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[#0B0F0E] bg-[#BAFF00] hover:bg-[#a6e600] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {user.full_name.split(' ')[0]}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/auth')}
              className="hidden sm:inline-flex items-center px-4 py-2 text-sm font-semibold text-white bg-[#0B0F0E] hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Sign In
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            className="md:hidden p-2 text-slate-700 hover:text-[#0B0F0E] rounded-lg"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1">
          {links.map((link) => (
            <button
              key={link.to}
              type="button"
              onClick={() => {
                navigate(link.to);
                setMobileMenuOpen(false);
              }}
              className="block w-full text-left px-3 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-100 rounded-lg"
            >
              {link.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              navigate(user ? '/profile' : '/auth');
              setMobileMenuOpen(false);
            }}
            className="block w-full text-left px-3 py-2.5 text-sm font-semibold text-[#0B0F0E] bg-[#BAFF00] rounded-lg mt-2"
          >
            {user ? `Account (${user.full_name})` : 'Sign In / Create Account'}
          </button>
        </div>
      )}
    </header>
  );
}
