"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Stack, Text } from "@chakra-ui/react";
import { useFactorizeClient } from "@/app/hooks/useFactorizeClient";
import { getClaimInvoiceInstructionAsync } from "@factorize/sdk";
import { address } from "@solana/kit";
import { sendInstruction } from "@/lib/factorize/sendInstruction";
import { getUsdcMint } from "@/lib/factorize/constants";

export function ClaimAdvanceButton({
  invoice,
}: {
  invoice: { invoice_id: string; vault_pda: string };
}) {
  const t = useTranslations("sme");
  const { rpc, solanaSigner, isReady } = useFactorizeClient();
  const [status, setStatus] = useState<string | null>(null);
  const usdcMint = getUsdcMint();

  const onClaim = async () => {
    if (!solanaSigner || !usdcMint) return;
    try {
      const instruction = await getClaimInvoiceInstructionAsync({
        sme: solanaSigner,
        invoiceVault: address(invoice.vault_pda),
        usdcMint,
        invoiceId: invoice.invoice_id,
      });
      const sig = await sendInstruction({ rpc, signer: solanaSigner, instruction });
      setStatus(sig.slice(0, 12));
    } catch {
      setStatus(t("claimFailed"));
    }
  };

  return (
    <Stack gap={2} mt={6}>
      <Button
        colorPalette="gray"
        disabled={!isReady}
        onClick={onClaim}
        alignSelf="flex-start"
      >
        {t("claimAdvance")}
      </Button>
      {status && <Text fontSize="sm" color="fg.muted">{status}</Text>}
    </Stack>
  );
}
