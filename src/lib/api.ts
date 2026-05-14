import type { Quote } from "./types";
import { QUOTE_ENDPOINT, getFallbackQuote, getSeenQuoteIds, normalizeQuote, rememberQuote } from "./tracks";

export async function loadQuote(): Promise<Quote> {
  const seen = getSeenQuoteIds();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(QUOTE_ENDPOINT, { cache: "no-store" });
      if (!response.ok) throw new Error(`Quote request failed: ${response.status}`);
      const rawData = await response.json() as Partial<Quote> & { _id?: string; content?: string };
      const quote = normalizeQuote(rawData);
      
      if (!quote || !quote.id) {
        console.warn("Invalid quote data received");
        continue;
      }
      
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
