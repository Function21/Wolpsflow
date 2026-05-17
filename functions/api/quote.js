const QUOTESLATE_ENDPOINT = "https://quoteslate.vercel.app/api/quotes/random?maxLength=140";

export async function onRequestGet() {
  try {
    const response = await fetch(QUOTESLATE_ENDPOINT, {
      headers: { Accept: "application/json" },
      cf: { cacheTtl: 30, cacheEverything: true }
    });

    if (!response.ok) return json(fallbackQuote());

    const raw = await response.json();
    const data = Array.isArray(raw) ? raw[0] : raw;
    return json({
      id: String(data.id ?? data._id ?? `quoteslate-${Date.now()}`),
      text: String(data.quote ?? data.text ?? data.content ?? "").trim(),
      author: String(data.author ?? "Unknown").trim()
    });
  } catch {
    return json(fallbackQuote());
  }
}

function fallbackQuote() {
  const quotes = [
    { id: "edge-fallback-da-vinci-1", text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
    { id: "edge-fallback-curie-1", text: "Be less curious about people and more curious about ideas.", author: "Marie Curie" },
    { id: "edge-fallback-franklin-1", text: "An investment in knowledge pays the best interest.", author: "Benjamin Franklin" },
    { id: "edge-fallback-confucius-1", text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
    { id: "edge-fallback-woolf-1", text: "Arrange whatever pieces come your way.", author: "Virginia Woolf" }
  ];
  return quotes[Math.floor(Math.random() * quotes.length)];
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
