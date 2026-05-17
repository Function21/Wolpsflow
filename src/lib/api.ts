import type { Quote } from "./types";
import { QUOTE_ENDPOINT, getFallbackQuote, getSeenQuoteIds, normalizeQuote, rememberQuote } from "./tracks";

export async function loadQuote(): Promise<Quote> {
  const seen = getSeenQuoteIds();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(QUOTE_ENDPOINT, { cache: "no-store" });
      if (!response.ok) throw new Error(`Quote request failed: ${response.status}`);
      const quote = normalizeQuote(await response.json());
      if (!seen.has(quote.id)) {
        rememberQuote(quote);
        return quote;
      }
    } catch (error) {
      console.debug(`Quote fetch attempt ${attempt + 1} failed:`, error);
    }
  }

  const fallback = getFallbackQuote(seen);
  rememberQuote(fallback);
  return fallback;
}
