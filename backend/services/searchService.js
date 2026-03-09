const { tavily } = require("@tavily/core");

const client = tavily({ apiKey: process.env.TAVILY_API_KEY });

async function webSearch(query) {
  const response = await client.search(query, {
    searchDepth: "basic",
    maxResults: 5,
    includeAnswer: true, // ← Tavily gives a pre-summarized answer too
  });

  return {
    answer: response.answer || null, // quick summary
    results: response.results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content, // Tavily gives full extracted content, not just snippet
    })),
  };
}

module.exports = { webSearch };
