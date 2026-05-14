export async function onRequestGet() {
  const upstream = "https://api.quotable.io/quotes/random?maxLength=120";

  try {
    const response = await fetch(upstream, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Wolpsflow/1.0"
      },
      cf: {
        cacheTtl: 60,
        cacheEverything: false
      }
    });

    if (!response.ok) {
      return new Response(JSON.stringify(fallbackQuote()), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    const raw = await response.json();
    const data = Array.isArray(raw) ? raw[0] : raw;
    return new Response(JSON.stringify({
      id: data._id,
      text: data.content,
      author: data.author
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch {
    return new Response(JSON.stringify(fallbackQuote()), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
}

function fallbackQuote() {
  const quotes = [
    {
      id: "edge-fallback-da-vinci-1",
      text: "Simplicity is the ultimate sophistication.",
      author: "Leonardo da Vinci"
    },
    {
      id: "edge-fallback-curie-1",
      text: "Be less curious about people and more curious about ideas.",
      author: "Marie Curie"
    },
    {
      id: "edge-fallback-franklin-1",
      text: "An investment in knowledge pays the best interest.",
      author: "Benjamin Franklin"
    },
    {
      id: "edge-fallback-confucius-1",
      text: "It does not matter how slowly you go as long as you do not stop.",
      author: "Confucius"
    },
    {
      id: "edge-fallback-woolf-1",
      text: "Arrange whatever pieces come your way.",
      author: "Virginia Woolf"
    }
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
