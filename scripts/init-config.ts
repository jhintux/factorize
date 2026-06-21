#!/usr/bin/env tsx
/**
 * Initialize Factorize on-chain Config from .env.local + Solana CLI config.
 *
 * Uses the keypair and RPC URL from ~/.config/solana/cli/config.yml (or SOLANA_CONFIG_FILE),
 * matching Anchor.toml provider settings.
 *
 * Required in .env.local:
 *   NEXT_PUBLIC_USDC_MINT
 *   NEXT_PUBLIC_TREASURY_ADDRESS
 *
 * Optional:
 *   NEXT_PUBLIC_SOLANA_RPC_URL / SOLANA_RPC_URL (overrides Solana CLI RPC)
 *   PROTOCOL_FEE_BPS (default 500)
 *   FACTORIZE_ADMIN_WALLETS (warns if CLI wallet is not listed)
 *
 * Usage:
 *   yarn init:config
 *   yarn init:config -- --dry-run
 *   yarn init:config -- --config ~/.config/solana/cli/config.yml
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  address,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  type Address,
} from "@solana/kit";
import {
  fetchConfig,
  findConfigPda,
  getInitConfigInstructionAsync,
} from "@factorize/sdk";
import { sendInstruction } from "../lib/factorize/sendInstruction";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_PROTOCOL_FEE_BPS = 500;

type SolanaCliConfig = {
  jsonRpcUrl: string;
  keypairPath: string;
};

type InitConfigParams = {
  treasury: Address;
  usdcMint: Address;
  protocolFeeBps: number;
};

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const configFlagIndex = argv.indexOf("--config");
  const configPath =
    configFlagIndex >= 0 ? argv[configFlagIndex + 1] : undefined;
  const keypairFlagIndex = argv.indexOf("--keypair");
  const keypairPath =
    keypairFlagIndex >= 0 ? argv[keypairFlagIndex + 1] : undefined;

  return { dryRun, configPath, keypairPath };
}

function expandHome(filePath: string): string {
  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  return filePath;
}

function loadEnvLocal(envPath: string) {
  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing ${envPath}. Create it with NEXT_PUBLIC_USDC_MINT and NEXT_PUBLIC_TREASURY_ADDRESS.`);
  }

  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function loadSolanaCliConfig(configPath?: string): SolanaCliConfig {
  const resolvedConfigPath = expandHome(
    configPath ??
      process.env.SOLANA_CONFIG_FILE ??
      path.join(os.homedir(), ".config/solana/cli/config.yml"),
  );

  if (!fs.existsSync(resolvedConfigPath)) {
    throw new Error(
      `Solana CLI config not found at ${resolvedConfigPath}. Run \`solana config get\` first.`,
    );
  }

  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(resolvedConfigPath, "utf8").split("\n")) {
    const match = line.match(/^([a-z_]+):\s*(.+)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }

  const jsonRpcUrl = values.json_rpc_url;
  const keypairPath = values.keypair_path;
  if (!jsonRpcUrl || !keypairPath) {
    throw new Error(
      `Invalid Solana CLI config at ${resolvedConfigPath}. Expected json_rpc_url and keypair_path.`,
    );
  }

  return {
    jsonRpcUrl,
    keypairPath: expandHome(keypairPath),
  };
}

function loadKeypairBytes(keypairPath: string): Uint8Array {
  const resolved = expandHome(keypairPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Keypair not found at ${resolved}`);
  }

  const secret = JSON.parse(fs.readFileSync(resolved, "utf8")) as number[];
  if (!Array.isArray(secret) || secret.length !== 64) {
    throw new Error(`Expected a 64-byte keypair JSON array at ${resolved}`);
  }

  return Uint8Array.from(secret);
}

function resolveInitConfigParams(): InitConfigParams {
  const usdcMint =
    process.env.NEXT_PUBLIC_USDC_MINT ?? process.env.USDC_MINT;
  const treasury =
    process.env.NEXT_PUBLIC_TREASURY_ADDRESS ?? process.env.TREASURY_ADDRESS;
  const protocolFeeBps = Number(
    process.env.PROTOCOL_FEE_BPS ?? DEFAULT_PROTOCOL_FEE_BPS,
  );

  if (!usdcMint) {
    throw new Error("Set NEXT_PUBLIC_USDC_MINT (or USDC_MINT) in .env.local");
  }
  if (!treasury) {
    throw new Error(
      "Set NEXT_PUBLIC_TREASURY_ADDRESS (or TREASURY_ADDRESS) in .env.local",
    );
  }
  if (!Number.isInteger(protocolFeeBps) || protocolFeeBps < 0 || protocolFeeBps > 10_000) {
    throw new Error("PROTOCOL_FEE_BPS must be an integer between 0 and 10000");
  }

  return {
    treasury: address(treasury),
    usdcMint: address(usdcMint),
    protocolFeeBps,
  };
}

function warnIfAdminNotListed(adminAddress: string) {
  const admins =
    process.env.FACTORIZE_ADMIN_WALLETS?.split(",").map((w) => w.trim()) ?? [];
  if (admins.length === 0) return;

  if (!admins.includes(adminAddress)) {
    console.warn(
      `Warning: CLI wallet ${adminAddress} is not in FACTORIZE_ADMIN_WALLETS (${admins.join(", ")})`,
    );
  }
}

async function main() {
  const { dryRun, configPath, keypairPath } = parseArgs(process.argv.slice(2));

  loadEnvLocal(path.join(ROOT, ".env.local"));
  const solanaConfig = loadSolanaCliConfig(configPath);
  const rpcUrl =
    process.env.SOLANA_RPC_URL ??
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    solanaConfig.jsonRpcUrl;
  const resolvedKeypairPath = keypairPath ?? solanaConfig.keypairPath;
  const params = resolveInitConfigParams();

  const admin = await createKeyPairSignerFromBytes(
    loadKeypairBytes(resolvedKeypairPath),
  );
  warnIfAdminNotListed(admin.address);

  const rpc = createSolanaRpc(rpcUrl);
  const [configPda, configBump] = await findConfigPda();
  const existing = await rpc.getAccountInfo(configPda, { encoding: "base64" }).send();

  console.log("Factorize init_config");
  console.log(`  RPC:              ${rpcUrl}`);
  console.log(`  Admin (signer):   ${admin.address}`);
  console.log(`  Keypair:          ${resolvedKeypairPath}`);
  console.log(`  Config PDA:       ${configPda} (bump ${configBump})`);
  console.log(`  Treasury:         ${params.treasury}`);
  console.log(`  USDC mint:        ${params.usdcMint}`);
  console.log(`  Protocol fee bps: ${params.protocolFeeBps}`);

  if (existing.value) {
    throw new Error(`Config already initialized at ${configPda}`);
  }

  if (dryRun) {
    console.log("\nDry run — transaction not sent.");
    return;
  }

  const instruction = await getInitConfigInstructionAsync({
    admin,
    treasury: params.treasury,
    usdcMint: params.usdcMint,
    protocolFeeBps: params.protocolFeeBps,
  });

  const signature = await sendInstruction({
    rpc,
    signer: admin,
    instruction,
  });

  const config = await fetchConfig(rpc, configPda);

  console.log(`\nConfig initialized. Signature: ${signature}`);
  console.log(`  On-chain admin:   ${config.data.admin}`);
  console.log(`  On-chain treasury:${config.data.treasury}`);
  console.log(`  On-chain USDC:    ${config.data.usdcMint}`);
  console.log(`  Paused:           ${config.data.paused}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
