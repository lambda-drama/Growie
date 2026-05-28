// ─── Asset Classes ───────────────────────────────────────────────────────────

export type AssetClass = 'mmf' | 'real-estate' | 'nse-stocks' | 'global-stocks' | 'etf'

export interface Holding {
  id: string
  name: string          // display name (company name from Growe Stock)
  stockName?: string    // Growe Stock document name (Link field value)
  assetClass: AssetClass
  valueKES: number
  costBasisKES: number
  quantity: number
  ticker: string
  currency?: string
  marketTag?: string
  region?: string
  exchangePlatform?: string
  sector?: string
  /** From Growe Stock instrument_type: stock | etf */
  instrumentType?: 'stock' | 'etf'
  broker?: string
  dateAdded: string
  lastUpdated: string
  notes?: string
  currentPriceKES?: number
  changePercent?: number
  avgBuyPrice?: number
  currentPrice?: number
  /** Position value in holding.currency (legacy column value_kes). */
  valueNative?: number
  /** Position value converted to KES for totals. */
  valueInKES?: number
  costAtAvgKES?: number
  gainPercent?: number
  unrealizedGainKES?: number
}

export interface Portfolio {
  holdings: Holding[]
  totalValueKES: number
  lastUpdated: string
}

// ─── Financial Health Score ───────────────────────────────────────────────────

export interface HealthScoreComponent {
  name: string
  score: number
  weight: number
  tip: string
}

export interface HealthScore {
  totalScore: number
  components: HealthScoreComponent[]
  lastCalculated: string
}

// ─── AI Analysis ─────────────────────────────────────────────────────────────

export interface AIInsight {
  id: string
  holdingId?: string
  type: 'warning' | 'opportunity' | 'info' | 'action'
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  recommendation?: string
}

export interface AIAnalysis {
  portfolioScore: number
  insights: AIInsight[]
  recommendations: string[]
  generatedAt: string
}

// ─── Weekly Insights / Stock Picks ───────────────────────────────────────────

export type SentimentTag = 'watch' | 'hold' | 'buy'

export interface LearningBite {
  id: string
  topic: string
  explanation: string
  linkedInsightId: string
  isRead: boolean
}

export interface StockPick {
  id: string
  ticker: string
  market: 'NSE' | 'NYSE' | 'NASDAQ' | 'LSE' | 'Global'
  title: string
  commentary: string
  sentiment: SentimentTag
  learningBite?: LearningBite
  isPro: boolean
  publishedAt: string
  weekStarting?: string
  isScopePartner?: boolean
}

// ─── News & Market Data ───────────────────────────────────────────────────────

export interface NewsItem {
  id: string
  title: string
  source: string
  summary: string
  url: string
  imageUrl?: string
  publishedAt: string
  category: 'kenya' | 'global' | 'analysis'
}

export interface MarketIndex {
  name: string
  value: number
  change: number
  changePercent: number
  currency: string
  fetchedAt?: string
}

// ─── Video Content ────────────────────────────────────────────────────────────

export interface VideoContent {
  id: string
  title: string
  description: string
  thumbnailUrl: string
  videoUrl: string
  duration: string
  category: 'education' | 'analysis' | 'interview'
  publishedAt: string
}

// ─── Community ────────────────────────────────────────────────────────────────

export interface CommunityPost {
  id: string
  authorName: string
  authorAvatar?: string
  content: string
  likes: number
  comments: number
  publishedAt: string
  isPinned?: boolean
}

// ─── User ─────────────────────────────────────────────────────────────────────

export type SubscriptionTier = 'free' | 'pro' | 'coached'
/** ISO currency code from Frappe Currency / user preference (display only). */
export type Currency = string
export type IdType = string

export interface User {
  id: string
  fullName: string
  email: string
  idType: IdType
  idNumber: string
  idPhotoUrl?: string
  subscriptionTier: SubscriptionTier
  preferredCurrency: Currency
  createdAt: string
}

export interface SignupData {
  fullName: string
  email: string
  password: string
  idType: IdType
  idNumber: string
  idPhoto?: File
}

export interface LoginData {
  email: string
  password: string
}

// ─── Navigation ───────────────────────────────────────────────────────────────

export interface NavItem {
  name: string
  href: string
  icon: string
  badge?: number
}
