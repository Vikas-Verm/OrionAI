"use strict";

const axios = require("axios");
const Integration = require("../../models/Integration");

function formatPaiseToInr(paise) {
  return `INR ${Number(paise || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function normalizeAmountToPaise(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("Amount must be a positive number.");
  }
  return Math.round(numeric * 100);
}

async function getRazorpayIntegration(userId) {
  const integration = await Integration.findOne({
    userId,
    type: "razorpay",
    enabled: true,
  });

  if (!integration?.razorpay?.keyId || !integration?.razorpay?.keySecret) {
    throw new Error("Razorpay is not connected. Add your keys in Integrations first.");
  }

  return integration;
}

async function getRazorpayClient(userId) {
  const integration = await getRazorpayIntegration(userId);
  return {
    integration,
    client: axios.create({
      baseURL: "https://api.razorpay.com/v1",
      auth: {
        username: integration.razorpay.keyId,
        password: integration.razorpay.keySecret,
      },
      timeout: 10000,
    }),
  };
}

async function testRazorpayConnection(razorpay) {
  if (!razorpay?.keyId || !razorpay?.keySecret) {
    throw new Error("Razorpay key ID and key secret are required.");
  }

  const client = axios.create({
    baseURL: "https://api.razorpay.com/v1",
    auth: {
      username: razorpay.keyId,
      password: razorpay.keySecret,
    },
    timeout: 10000,
  });

  await client.get("/payouts", { params: { count: 1 } });
  return { ok: true, message: "Razorpay connection verified." };
}

async function toolRazorpayGetPayouts(params = {}, ctx) {
  const { client } = await getRazorpayClient(ctx.userId);
  const response = await client.get("/payouts", {
    params: {
      status: params.status || undefined,
      count: Math.max(1, Math.min(Number(params.limit) || 10, 25)),
    },
  });

  const items = response.data?.items || [];
  const payouts = items.map((item) => ({
    id: item.id,
    amount: item.amount,
    amountLabel: formatPaiseToInr(Number(item.amount || 0) / 100),
    status: item.status,
    mode: item.mode,
    purpose: item.purpose,
    narration: item.narration,
    createdAt: item.created_at ? new Date(item.created_at * 1000).toISOString() : null,
    referenceId: item.reference_id || null,
  }));

  return {
    count: payouts.length,
    payouts,
    summary: payouts.length
      ? `Found ${payouts.length} Razorpay payout${payouts.length === 1 ? "" : "s"}.`
      : "No Razorpay payouts found.",
  };
}

async function toolRazorpayCreatePayout(params = {}, ctx) {
  const { client, integration } = await getRazorpayClient(ctx.userId);
  const accountNumber = params.accountNumber || integration.razorpay.accountNumber;
  if (!accountNumber) {
    throw new Error("Set a default Razorpay source account number in Integrations or pass accountNumber.");
  }
  if (!params.fundAccountId) {
    throw new Error("fundAccountId is required to create a payout.");
  }

  const payload = {
    account_number: accountNumber,
    fund_account_id: params.fundAccountId,
    amount: normalizeAmountToPaise(params.amount),
    currency: params.currency || "INR",
    mode: params.mode || "IMPS",
    purpose: params.purpose || "payout",
    queue_if_low_balance: params.queueIfLowBalance !== false,
    narration: params.narration || undefined,
    reference_id: params.referenceId || undefined,
  };

  const response = await client.post("/payouts", payload);
  const payout = response.data || {};

  return {
    ok: true,
    payoutId: payout.id,
    status: payout.status,
    amount: payload.amount,
    amountLabel: formatPaiseToInr(payload.amount / 100),
    summary: `Created Razorpay payout ${payout.id} for ${formatPaiseToInr(payload.amount / 100)}.`,
  };
}

module.exports = {
  getRazorpayIntegration,
  testRazorpayConnection,
  toolRazorpayGetPayouts,
  toolRazorpayCreatePayout,
};
