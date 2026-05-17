import type { Quote } from "./types";
import { hashString } from "./math";

export const QUOTE_ENDPOINT = "/api/quote";
const QUOTE_STORAGE_KEY = "wolpsflow.seenQuoteIds";

const QUOTES: Quote[] = [
  { id: "local-socrates-1", text: "The only true wisdom is in knowing you know nothing.", author: "Socrates" },
  { id: "local-mandela-1", text: "It always seems impossible until it is done.", author: "Nelson Mandela" },
  { id: "local-da-vinci-1", text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
  { id: "local-buddha-1", text: "What we think, we become.", author: "Buddha" },
  { id: "local-lao-tzu-1", text: "The journey of a thousand miles begins with one step.", author: "Lao Tzu" },
  { id: "local-aristotle-1", text: "Well begun is half done.", author: "Aristotle" },
  { id: "local-jobs-1", text: "Stay hungry, stay foolish.", author: "Steve Jobs" },
  { id: "local-edison-1", text: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas Edison" },
  { id: "local-tolkien-1", text: "Not all those who wander are lost.", author: "J. R. R. Tolkien" },
  { id: "local-oprah-1", text: "Turn your wounds into wisdom.", author: "Oprah Winfrey" },
  { id: "local-twain-1", text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { id: "local-roosevelt-1", text: "Do what you can, with what you have, where you are.", author: "Theodore Roosevelt" },
  { id: "local-franklin-1", text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
  { id: "local-curie-1", text: "Be less curious about people and more curious about ideas.", author: "Marie Curie" },
  { id: "local-austen-1", text: "There is no charm equal to tenderness of heart.", author: "Jane Austen" },
  { id: "local-woolf-1", text: "Arrange whatever pieces come your way.", author: "Virginia Woolf" },
  { id: "local-emerson-1", text: "Nothing great was ever achieved without enthusiasm.", author: "Ralph Waldo Emerson" },
  { id: "local-confucius-1", text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { id: "local-helen-keller-1", text: "Alone we can do so little; together we can do so much.", author: "Helen Keller" },
  { id: "local-lewis-1", text: "You are never too old to set another goal or to dream a new dream.", author: "C. S. Lewis" }
];

export function normalizeQuote(raw: Partial<Quote>): Quote {
  const text = String(raw.text || "").trim();
  const author = String(raw.author || "Unknown").trim();
  return {
    id: String(raw.id || hashString(`${text}-${author}`)),
    text,
    author
  };
}

export function formatQuote(quote: Quote | null | undefined): string {
  if (!quote) return "";
  return `"${quote.text}" - ${quote.author}`;
}

let currentQuoteIndex = -1;

export function getFallbackQuote(seen = getSeenQuoteIds()): Quote {
  const available = QUOTES.filter((quote) => !seen.has(quote.id));
  if (!available.length) {
    saveSeenQuoteIds(new Set());
    currentQuoteIndex = -1;
    return QUOTES[0];
  }
  currentQuoteIndex = (currentQuoteIndex + 1) % available.length;
  return available[currentQuoteIndex];
}

export function getSeenQuoteIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(QUOTE_STORAGE_KEY) || "[]") as string[]);
  } catch {
    return new Set();
  }
}

function saveSeenQuoteIds(seen: Set<string>): void {
  try {
    localStorage.setItem(QUOTE_STORAGE_KEY, JSON.stringify([...seen].slice(-600)));
  } catch {
    // localStorage unavailable in private mode
  }
}

export function rememberQuote(quote: Quote): void {
  if (!quote?.id) return;
  const seen = getSeenQuoteIds();
  seen.add(quote.id);
  saveSeenQuoteIds(seen);
}
