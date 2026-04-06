const axios = require("axios");
require("dotenv").config();

// Azure OpenAI client
const azureClient = axios.create({
  baseURL: `${process.env.OPENAI_BASE_URL}`,
  headers: {
    "Content-Type": "application/json",
    "api-key": process.env.OPENAI_API_KEY,
  },
  params: {
    "api-version": process.env.API_VERSION,
  },
});

// Main chat completion — returns stream
async function chatStream(messages, res) {
  const response = await azureClient.post(
    "chat/completions",
    {
      messages,
      max_tokens: 5000,
      temperature: 0.7,
      stream: true,
    },
    {
      responseType: "stream",
    }
  );
  return response;
}

// Non-streaming completion — for summarization, memory updates
async function chatComplete(messages, maxTokens = 300, temperature = 0.3) {
  try {
    const response = await azureClient.post("chat/completions", {
      messages,
      max_tokens: maxTokens,
      temperature,
    });
    return response.data.choices[0].message.content;
  } catch (err) {
    // Log the actual Azure error body
    console.error(
      "chatComplete Azure error:",
      JSON.stringify(err.response?.data, null, 2)
    );
    throw err;
  }
}

async function chatCompleteNoSystem(
  userMessage,
  maxTokens = 512,
  temperature = 0.1
) {
  try {
    const response = await azureClient.post("chat/completions", {
      messages: [{ role: "user", content: userMessage }],
      max_tokens: maxTokens,
      temperature,
    });

    return response.data.choices[0].message.content;
  } catch (err) {
    console.error(
      "chatCompleteNoSystem error:",
      JSON.stringify(err.response?.data, null, 2)
    );
    throw err;
  }
}
module.exports = {
  azureClient,
  chatStream,
  chatComplete,
  chatCompleteNoSystem,
};
