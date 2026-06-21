import { EventParser, BorshCoder } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "./idl.json";

export type ParsedFactorizeEvent = {
  name: string;
  data: Record<string, unknown>;
};

const coder = new BorshCoder(idl as never);
const parser = new EventParser(
  new PublicKey("6YWgPX8CbreGMdPAkCnXxLG5xW9T8LiTQHqafP3C3GhT"),
  coder,
);

export function parseFactorizeEvents(logs: string[]): ParsedFactorizeEvent[] {
  const events: ParsedFactorizeEvent[] = [];
  for (const event of parser.parseLogs(logs)) {
    events.push({
      name: event.name,
      data: event.data as Record<string, unknown>,
    });
  }
  return events;
}

export function invoiceStatusFromEvent(status: unknown): string {
  if (typeof status === "object" && status !== null) {
    const keys = Object.keys(status);
    if (keys.length === 1) return keys[0]!;
  }
  return String(status);
}
