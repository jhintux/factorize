"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  Flex,
  NativeSelect,
  Stack,
  Text,
} from "@chakra-ui/react";
import { saveAssessment, getInvoiceDocumentUrl } from "@/app/actions/admin";
import { useFactorizeClient } from "@/app/hooks/useFactorizeClient";
import { getAssessInvoiceRiskInstructionAsync } from "@factorize/sdk";
import { address } from "@solana/kit";
import { sendInstruction } from "@/lib/factorize/sendInstruction";
import { hashCanonicalInvoice } from "@/lib/factorize/canonicalInvoiceHash";

type QueueInvoice = {
  id: string;
  invoice_id: string;
  invoice_number: string;
  vault_pda: string;
  seller_wallet: string;
  document_path?: string | null;
  payer_company?: { ruc?: string; company_name?: string } | null;
  advance_amount_usdc: string;
  repayment_amount_usdc: string;
  collection_date: string;
  due_date: string;
  settle_date: string;
  operation_type: "factoring" | "confirming";
};

export function AssessmentQueue({
  invoices,
}: {
  locale: string;
  invoices: QueueInvoice[];
}) {
  const t = useTranslations("admin");
  const { rpc, solanaSigner, isReady } = useFactorizeClient();
  const [ratings, setRatings] = useState<Record<string, string>>({});

  const viewDocument = async (documentPath: string) => {
    const result = await getInvoiceDocumentUrl(documentPath);
    if (result.ok) {
      window.open(result.url, "_blank", "noopener,noreferrer");
    }
  };

  const assess = async (invoice: QueueInvoice) => {
    if (!solanaSigner) return;
    const rating = ratings[invoice.id] ?? "B";
    const hash = await hashCanonicalInvoice({
      advance_amount_usdc: invoice.advance_amount_usdc,
      collection_date: invoice.collection_date,
      due_date: invoice.due_date,
      invoice_id: invoice.invoice_id,
      invoice_number: invoice.invoice_number,
      operation_type: invoice.operation_type,
      payer_ruc: invoice.payer_company?.ruc ?? "",
      repayment_amount_usdc: invoice.repayment_amount_usdc,
      seller_wallet: invoice.seller_wallet,
      settle_date: invoice.settle_date,
    });

    const instruction = await getAssessInvoiceRiskInstructionAsync({
      analyst: solanaSigner,
      invoiceVault: address(invoice.vault_pda),
      invoiceId: invoice.invoice_id,
      invoiceHash: hash,
    });
    await sendInstruction({ rpc, signer: solanaSigner, instruction });
    await saveAssessment({ invoiceId: invoice.id, rating });
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
            <Text fontWeight="semibold">
              {invoice.payer_company?.company_name}
            </Text>
            <Text color="fg.muted" fontSize="sm" mb={3}>
              {invoice.invoice_number}
            </Text>
            {invoice.document_path ? (
              <Button
                variant="outline"
                colorPalette="gray"
                size="sm"
                mb={3}
                onClick={() => viewDocument(invoice.document_path!)}
              >
                {t("viewDocument")}
              </Button>
            ) : (
              <Text color="fg.muted" fontSize="sm" mb={3}>
                {t("noDocument")}
              </Text>
            )}
            <Flex gap={3} align="center" flexWrap="wrap">
              <NativeSelect.Root width={{ base: "full", sm: "auto" }}>
                <NativeSelect.Field
                  value={ratings[invoice.id] ?? "B"}
                  onChange={(e) =>
                    setRatings({ ...ratings, [invoice.id]: e.target.value })
                  }
                >
                  {["A", "B", "C", "D"].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
              <Button
                colorPalette="gray"
                disabled={!isReady}
                onClick={() => assess(invoice)}
              >
                {t("assess")}
              </Button>
            </Flex>
          </Card.Body>
        </Card.Root>
      ))}
    </Stack>
  );
}
