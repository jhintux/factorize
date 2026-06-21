const PROGRAM_ID = "6YWgPX8CbreGMdPAkCnXxLG5xW9T8LiTQHqafP3C3GhT";
const SYNC_DISCRIMINATOR = new Uint8Array([187, 234, 30, 192, 155, 122, 135, 226]);

export function encodeSyncInvoiceStatusData(invoiceId: string): Uint8Array {
  const idBytes = new TextEncoder().encode(invoiceId);
  const data = new Uint8Array(8 + 4 + idBytes.length);
  data.set(SYNC_DISCRIMINATOR, 0);
  new DataView(data.buffer).setUint32(8, idBytes.length, true);
  data.set(idBytes, 12);
  return data;
}

export function buildSyncInvoiceStatusInstruction(
  invoiceVault: string,
  invoiceId: string,
) {
  return {
    programId: PROGRAM_ID,
    keys: [{ pubkey: invoiceVault, isSigner: false, isWritable: true }],
    data: encodeSyncInvoiceStatusData(invoiceId),
  };
}
