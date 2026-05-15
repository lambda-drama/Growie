/**
 * Clean Barbs AI text for display: plain text only, no markdown asterisks or legal disclaimer.
 */

const DISCLAIMER_RE =
  /^\s*\*?\s*(?:this is not regulated financial advice\.?|not regulated financial advice\.?)\s*\*?\s*$/i

/** Remove disclaimer lines anywhere in the message. */
function stripDisclaimerLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !DISCLAIMER_RE.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Strip markdown bold/italic markers; leave words unchanged. */
function stripMarkdownAsterisks(text: string): string {
  let s = text
  // **bold**
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1')
  // *italic* (single-line)
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
  // Leftover pairs or singletons
  s = s.replace(/\*\*/g, '')
  s = s.replace(/\*/g, '')
  return s
}

export function formatBarbsAIReply(text: string): string {
  if (!text?.trim()) return ''
  let s = stripDisclaimerLines(text)
  s = stripMarkdownAsterisks(s)
  return s.trim()
}
