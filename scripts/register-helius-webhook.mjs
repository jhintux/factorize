#!/usr/bin/env node
/**
 * Register Helius webhook for Factorize program (devnet).
 * Usage: HELIUS_API_KEY=... WEBHOOK_URL=... HELIUS_WEBHOOK_SECRET=... node scripts/register-helius-webhook.mjs
 */
const API_KEY = process.env.HELIUS_API_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const SECRET = process.env.HELIUS_WEBHOOK_SECRET ?? "factorize-dev";
const PROGRAM_ID = "6YWgPX8CbreGMdPAkCnXxLG5xW9T8LiTQHqafP3C3GhT";

if (!API_KEY || !WEBHOOK_URL) {
  console.error("Set HELIUS_API_KEY and WEBHOOK_URL");
  process.exit(1);
}

const res = await fetch(`https://api-devnet.helius-rpc.com/v0/webhooks?api-key=${API_KEY}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    accountAddresses: [PROGRAM_ID],
    transactionTypes: ["ANY"],
    webhookURL: WEBHOOK_URL,
    webhookType: "enhancedDevnet",
    authHeader: { Authorization: SECRET },
  }),
});

console.log(await res.json());
