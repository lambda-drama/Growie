export type StackBucketKind = 'region' | 'exchange' | 'security'

type BucketIconStyle = { tint: string; hex: string }

const REGION_STYLES: Record<string, BucketIconStyle> = {
  usa: {
    tint: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
    hex: '#0284c7',
  },
  us: {
    tint: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
    hex: '#0284c7',
  },
  africa: {
    tint: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    hex: '#059669',
  },
  kenya: {
    tint: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    hex: '#059669',
  },
  local: {
    tint: 'bg-lime-100 text-lime-900 dark:bg-lime-950 dark:text-lime-300',
    hex: '#65a30d',
  },
  asia: {
    tint: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-300',
    hex: '#ea580c',
  },
  europe: {
    tint: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
    hex: '#7c3aed',
  },
  'middle east': {
    tint: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
    hex: '#d97706',
  },
  global: {
    tint: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
    hex: '#0d9488',
  },
}

const EXCHANGE_STYLES: Record<string, BucketIconStyle> = {
  nse: {
    tint: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
    hex: '#1e3a5f',
  },
  nyse: {
    tint: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    hex: '#2563eb',
  },
  nasdaq: {
    tint: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
    hex: '#4f46e5',
  },
  amex: {
    tint: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
    hex: '#0891b2',
  },
  lse: {
    tint: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
    hex: '#7c3aed',
  },
  euronext: {
    tint: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
    hex: '#9333ea',
  },
  jpx: {
    tint: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    hex: '#e11d48',
  },
  hkex: {
    tint: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-300',
    hex: '#ea580c',
  },
  jse: {
    tint: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    hex: '#059669',
  },
  global: {
    tint: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
    hex: '#0d9488',
  },
}

const SECURITY_STYLES: Record<string, BucketIconStyle> = {
  stocks: {
    tint: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
    hex: '#0284c7',
  },
  etfs: {
    tint: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
    hex: '#4f46e5',
  },
  'money market funds': {
    tint: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    hex: '#059669',
  },
  'real estate': {
    tint: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
    hex: '#d97706',
  },
  other: {
    tint: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300',
    hex: '#64748b',
  },
}

const FALLBACK_PALETTE: BucketIconStyle[] = [
  { tint: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300', hex: '#0284c7' },
  { tint: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300', hex: '#059669' },
  { tint: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300', hex: '#7c3aed' },
  { tint: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300', hex: '#d97706' },
  { tint: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300', hex: '#e11d48' },
  { tint: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300', hex: '#0d9488' },
  { tint: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300', hex: '#4f46e5' },
  { tint: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-300', hex: '#ea580c' },
]

function normalizeBucketKey(label: string): string {
  return label.trim().toLowerCase()
}

function hashLabel(label: string): number {
  let h = 0
  for (let i = 0; i < label.length; i++) {
    h = (h * 31 + label.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function lookupStyle(label: string, kind: StackBucketKind): BucketIconStyle {
  const key = normalizeBucketKey(label)
  if (kind === 'security') {
    return SECURITY_STYLES[key] ?? FALLBACK_PALETTE[hashLabel(key || label) % FALLBACK_PALETTE.length]
  }
  const map = kind === 'region' ? REGION_STYLES : EXCHANGE_STYLES
  if (map[key]) return map[key]
  return FALLBACK_PALETTE[hashLabel(key || label) % FALLBACK_PALETTE.length]
}

export function getBucketIconTint(label: string, kind: StackBucketKind): string {
  return lookupStyle(label, kind).tint
}

export function getBucketIconColorHex(label: string, kind: StackBucketKind): string {
  return lookupStyle(label, kind).hex
}

/** Short label inside the badge (e.g. NSE, ME, A). */
export function getBucketIconInitial(label: string): string {
  const trimmed = label.trim()
  if (!trimmed) return '?'
  const compact = trimmed.replace(/\s+/g, '')
  if (compact.length <= 4 && /^[A-Za-z0-9.]+$/.test(compact)) {
    return compact.toUpperCase()
  }
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    return words
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join('')
      .toUpperCase()
  }
  return trimmed.charAt(0).toUpperCase()
}
