export const UGANDA_DISTRICTS = [
  'Kampala',
  'Wakiso',
  'Entebbe',
  'Jinja',
  'Mbarara',
  'Gulu',
  'Mbale',
  'Fort Portal',
  'Lira',
  'Arua',
  'Mukono',
  'Masaka',
];

export function formatUgx(amount: number | string | null | undefined): string {
  const num = Number(amount || 0);
  return `UGX ${Math.round(num).toLocaleString('en-US')}`;
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const normalized = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-UG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function buildWhatsappLink(phone: string | null | undefined, message: string): string {
  const digits = String(phone || '256700000000').replace(/\D/g, '');
  const normalized = digits.startsWith('0') ? `256${digits.slice(1)}` : digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function formatDeliveryMethod(method: string): string {
  switch (method) {
    case 'pickup':
      return 'Customer Pickup';
    case 'seller_delivery':
      return 'Seller Local Delivery';
    case 'third_party':
      return 'Third-Party Courier';
    default:
      return method;
  }
}
