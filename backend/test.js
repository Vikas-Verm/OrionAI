// const axios = require("axios");
// // OR: const axios = require("axios");

// const OPENAI_API_KEY =
//   "44tHKvY6gZhfYlp4QVoSd6M2MzNq32QaVjt9wEZpZRM2O3m8hv5FJQQJ99BDACHYHv6XJ3w3AAABACOG9BYK";
// const OPENAI_BASE_URL = "https://poshn-openai-dev-instance.openai.azure.com/";
// const OPENAI_MODEL = "gpt-4.1";
// const API_VERSION = "2024-02-01";

// // Create a reusable axios instance
// const azureClient = axios.create({
//   baseURL: `${OPENAI_BASE_URL}openai/deployments/${OPENAI_MODEL}/`,
//   headers: {
//     "Content-Type": "application/json",
//     "api-key": OPENAI_API_KEY,
//   },
//   params: {
//     "api-version": API_VERSION,
//   },
// });

// async function chat(messages) {
//   try {
//     const response = await azureClient.post("chat/completions", {
//       messages,
//       max_tokens: 1000,
//       temperature: 0.7,
//     });

//     return response.data.choices[0].message.content;
//   } catch (error) {
//     // Axios wraps HTTP errors — extract the useful part
//     const details = error.response?.data ?? error.message;
//     throw new Error(`Azure OpenAI Error: ${JSON.stringify(details)}`);
//   }
// }

// // Example usage
// async function main() {
//   const reply = await chat([
//     { role: "system", content: "You are a helpful assistant." },
//     { role: "user", content: "Hello! What can you do?" },
//   ]);

//   console.log("Assistant:", reply);
// }

// main();

// test-parse.js
require("dotenv").config();
const { parseAgentIntent } = require("./services/agentService");

async function test() {
  const result = await parseAgentIntent(
    "create a jira task for fix balance due calculation in bills and this fixes will impact on PO screens as well, priority is high and assign to Ashish Saini."
  );
  console.log({ "Result Test": JSON.stringify(result, null, 2) });
}

test().catch(console.error);
