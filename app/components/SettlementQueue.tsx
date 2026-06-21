"use client";

import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  Flex,
  Stack,
  Text,
} from "@chakra-ui/react";
import { markPaymentVerified } from "@/app/actions/admin";
import { useFactorizeClient } from "@/app/hooks/useFactorizeClient";
import { getAdminSettleInvoiceInstructionAsync } from "@factorize/sdk";
import { address } from "@solana/kit";
import { sendInstruction } from "@/lib/factorize/sendInstruction";
import { getUsdcMint } from "@/lib/factorize/constants";

type SettlementInvoice = {
  id: string;
  invoice_id: string;
  vault_pda: string;
  shares_mint: string;
  repayment_amount_usdc: string;
  payment_verified_at: string | null;
  payer_company?: { company_name?: string } | null;
};

export function SettlementQueue({ invoices }: { invoices: SettlementInvoice[] }) {
  const t = useTranslations("admin");
  const { rpc, solanaSigner, isReady } = useFactorizeClient();
  const usdcMint = getUsdcMint();
  const treasury = process.env.NEXT_PUBLIC_TREASURY_ADDRESS;

  const verify = async (id: string) => {
    await markPaymentVerified(id);
    globalThis.location.reload();
  };

  const settle = async (invoice: SettlementInvoice) => {
    if (!solanaSigner || !usdcMint || !treasury) return;
    const instruction = await getAdminSettleInvoiceInstructionAsync({
      admin: solanaSigner,
      invoiceVault: address(invoice.vault_pda),
      shares: address(invoice.shares_mint),
      usdcMint,
      treasury: address(treasury),
      invoiceId: invoice.invoice_id,
      repaymentAmount: BigInt(invoice.repayment_amount_usdc),
    });
    await sendInstruction({ rpc, signer: solanaSigner, instruction });
    globalThis.location.reload();
  };

  if (!invoices.length) {
    return <Text color="fg.muted">{t("queueEmpty")}</Text>;
  }

  return (
    <Stack gap={4}>
      {invoices.map((invoice) => (
        <Card.Root key={invoice.id}>
          <Card.Body p={4}>
            <Flex
              justify="space-between"
              align={{ base: "flex-start", sm: "center" }}
              direction={{ base: "column", sm: "row" }}
              gap={3}
            >
              <Text fontWeight="semibold">
                {invoice.payer_company?.company_name}
              </Text>
              {!invoice.payment_verified_at ? (
                <Button
                  variant="outline"
                  colorPalette="gray"
                  onClick={() => verify(invoice.id)}
                >
                  {t("markPaid")}
                </Button>
              ) : (
                <Button
                  colorPalette="gray"
                  disabled={!isReady}
                  onClick={() => settle(invoice)}
                >
                  {t("settleOnChain")}
                </Button>
              )}
            </Flex>
          </Card.Body>
        </Card.Root>
      ))}
    </Stack>
  );
}
