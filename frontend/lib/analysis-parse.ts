import { formatBarbsAIReply } from '@/lib/barbs-ai-text'

/** Parse portfolio analysis text into UI sections (best-effort). */

export interface ParsedPortfolioAnalysis {
  strengths: string
  risks: string
  opportunities: string
  watchlist: string
  recommendations: { title: string; description: string }[]
}

const SECTION_PATTERNS: { key: keyof Omit<ParsedPortfolioAnalysis, 'recommendations'>; re: RegExp }[] = [
  { key: 'strengths', re: /(?:^|\n)\s*(?:#{1,3}\s*)?(?:\d+\.\s*)?(?:strengths?|what(?:'s| is) working(?: well)?)[:\s]+([\s\S]*?)(?=\n\s*(?:#{1,3}\s*)?(?:\d+\.\s*)?(?:risks?|opportunit|watchlist|recommend)|$)/i },
  { key: 'risks', re: /(?:^|\n)\s*(?:#{1,3}\s*)?(?:\d+\.\s*)?(?:risks?|top risks?)[:\s]+([\s\S]*?)(?=\n\s*(?:#{1,3}\s*)?(?:\d+\.\s*)?(?:strength|opportunit|watchlist|recommend)|$)/i },
  { key: 'opportunities', re: /(?:^|\n)\s*((?:#{1,3}\s*)?(?:\d+\.\s*)?(?:opportunit(?:ies|y)|growth)[:\s]+)([\s\S]*?)(?=\n\s*(?:#{1,3}\s*)?(?:\d+\.\s*)?(?:strength|risks?|watchlist|recommend)|$)/i },
  { key: 'watchlist', re: /(?:^|\n)\s*(?:#{1,3}\s*)?(?:\d+\.\s*)?(?:watchlist|watch)[:\s]+([\s\S]*?)(?=\n\s*(?:#{1,3}\s*)?(?:\d+\.\s*)?(?:strength|risks?|opportunit|recommend)|$)/i },
]

function cleanSection(s: string): string {
  return formatBarbsAIReply(s.replace(/\n+/g, ' '))
}

function firstSentence(text: string, maxLen = 220): string {
  const t = cleanSection(text)
  if (!t) return ''
  const m = t.match(/^[^.!?]+[.!?]/)
  const s = m ? m[0] : t
  return s.length <= maxLen ? s : `${s.slice(0, maxLen - 1).trim()}…`
}

function extractRecommendations(text: string): { title: string; description: string }[] {
  const recBlock = text.match(
    /(?:recommendations?|next steps?|suggested actions?)[:\s]+([\s\S]*?)(?=\n\s*(?:#{1,3}\s*)?(?:disclaimer|strength|risks?)|$)/i
  )?.[1]

  const source = recBlock || text
  const items: { title: string; description: string }[] = []

  const numbered = [...source.matchAll(/(?:^|\n)\s*(?:\d+[\).]|[-•*])\s*(.+?)(?=\n\s*(?:\d+[\).]|[-•*])|$)/gs)]
  for (const m of numbered.slice(0, 5)) {
    const line = m[1].trim()
    const colon = line.indexOf(':')
    if (colon > 0 && colon < 60) {
      items.push({
        title: line.slice(0, colon).replace(/\*\*/g, '').trim(),
        description: line.slice(colon + 1).trim(),
      })
    } else {
      const dot = line.indexOf('. ')
      if (dot > 10 && dot < 80) {
        items.push({ title: line.slice(0, dot).replace(/\*\*/g, ''), description: line.slice(dot + 2) })
      } else {
        items.push({ title: line.slice(0, 50), description: line })
      }
    }
  }

  return items.slice(0, 4)
}

export function parsePortfolioAnalysis(text: string): ParsedPortfolioAnalysis {
  const normalized = formatBarbsAIReply(text)
  const parsed: ParsedPortfolioAnalysis = {
    strengths: '',
    risks: '',
    opportunities: '',
    watchlist: '',
    recommendations: [],
  }

  for (const { key, re } of SECTION_PATTERNS) {
    const m = normalized.match(re)
    if (m?.[1]) parsed[key] = firstSentence(m[1])
  }

  parsed.recommendations = extractRecommendations(normalized)

  if (!parsed.strengths) {
    const paras = normalized.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
    parsed.strengths = firstSentence(paras[0] || normalized)
  }
  if (!parsed.risks) parsed.risks = firstSentence(parasFromKeywords(normalized, ['risk', 'concentrat', 'exposure']))
  if (!parsed.opportunities) {
    parsed.opportunities = firstSentence(
      parasFromKeywords(normalized, ['opportunit', 'consider', 'growth', 'diversif'])
    )
  }
  if (!parsed.watchlist) {
    parsed.watchlist = firstSentence(parasFromKeywords(normalized, ['watch', 'monitor', 'momentum']))
  }

  return parsed
}

function parasFromKeywords(text: string, keywords: string[]): string {
  const lines = text.split(/\n+/)
  for (const line of lines) {
    const lower = line.toLowerCase()
    if (keywords.some((k) => lower.includes(k)) && line.length > 40) return line
  }
  return ''
}

export function defaultInsightsFromPortfolio(opts: {
  classCount: number
  holdingCount: number
  topClassLabel: string
  topClassPct: number
  gainPercent: number
}): ParsedPortfolioAnalysis {
  const { classCount, holdingCount, topClassLabel, topClassPct, gainPercent } = opts
  return {
    strengths:
      classCount >= 3
        ? `Your portfolio is diversified across ${classCount} asset classes with ${holdingCount} position${holdingCount === 1 ? '' : 's'}.`
        : `You have ${holdingCount} active position${holdingCount === 1 ? '' : 's'} to build on.`,
    risks:
      topClassPct >= 35
        ? `High exposure to ${topClassLabel} (${topClassPct.toFixed(0)}%). Consider rebalancing for better diversification.`
        : 'Review concentration across asset classes periodically.',
    opportunities:
      classCount < 4
        ? 'Consider adding global stocks or MMF exposure for broader diversification.'
        : 'Look for opportunities to add to underweight asset classes aligned with your goals.',
    watchlist: 'Review holdings with large recent price moves and rebalance if allocations drift.',
    recommendations: [
      {
        title: 'Review asset allocation',
        description: 'Ensure your mix matches your risk tolerance and time horizon.',
      },
      {
        title: 'Rebalance if needed',
        description:
          topClassPct >= 30
            ? `Trim ${topClassLabel} if it exceeds your target weight.`
            : 'Revisit weights quarterly or after large market moves.',
      },
      {
        title: 'Emergency fund check',
        description: 'Keep 3–6 months of expenses in liquid MMF or cash before adding risk.',
      },
    ],
  }
}

export function mergeParsedWithDefaults(
  parsed: ParsedPortfolioAnalysis,
  defaults: ParsedPortfolioAnalysis
): ParsedPortfolioAnalysis {
  return {
    strengths: parsed.strengths || defaults.strengths,
    risks: parsed.risks || defaults.risks,
    opportunities: parsed.opportunities || defaults.opportunities,
    watchlist: parsed.watchlist || defaults.watchlist,
    recommendations:
      parsed.recommendations.length > 0 ? parsed.recommendations : defaults.recommendations,
  }
}
