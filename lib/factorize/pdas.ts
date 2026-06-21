import {
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
} from "@solana/kit";
import { FACTORIZE_PROGRAM_ID } from "./constants";

export async function findInvoiceVaultPda(
  sme: Address,
  invoiceId: string,
): Promise<readonly [Address, number]> {
  return getProgramDerivedAddress({
    programAddress: FACTORIZE_PROGRAM_ID,
    seeds: [
      new TextEncoder().encode("invoice_vault"),
      getAddressEncoder().encode(sme),
      new TextEncoder().encode(invoiceId),
    ],
  });
}

export async function findSharesPda(
  sme: Address,
  invoiceId: string,
): Promise<readonly [Address, number]> {
  return getProgramDerivedAddress({
    programAddress: FACTORIZE_PROGRAM_ID,
    seeds: [
      new TextEncoder().encode("shares"),
      getAddressEncoder().encode(sme),
      new TextEncoder().encode(invoiceId),
    ],
  });
}

export async function findConfigPda(): Promise<readonly [Address, number]> {
  return getProgramDerivedAddress({
    programAddress: FACTORIZE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("config")],
  });
}

export async function findAnalystWhitelistPda(
  analyst: Address,
): Promise<readonly [Address, number]> {
  return getProgramDerivedAddress({
    programAddress: FACTORIZE_PROGRAM_ID,
    seeds: [
      new TextEncoder().encode("analyst"),
      getAddressEncoder().encode(analyst),
    ],
  });
}
