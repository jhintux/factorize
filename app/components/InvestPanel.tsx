"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import {
  Button,
  Card,
  Field,
  Heading,
  Input,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useFactorizeClient } from "@/app/hooks/useFactorizeClient";
import { getFundInvoiceInstructionAsync } from "@factorize/sdk";
import { address } from "@solana/kit";
import { sendInstruction } from "@/lib/factorize/sendInstruction";
import { getUsdcMint } from "@/lib/factorize/constants";

type InvestPanelProps = {
  assessed: boolean;
  invoice: {
    id: string;
    invoice_id: string;
    seller_wallet: string;
    vault_pda: string;
    shares_mint: string;
    advance_amount_usdc: string;
    funding_amount_usdc: string;
  };
};

type InvestFormValues = {
  amount: string;
};

export function InvestPanel({ invoice, assessed }: InvestPanelProps) {
  const t = useTranslations("invoices");
  const { rpc, solanaSigner, isReady } = useFactorizeClient();
  const [status, setStatus] = useState<string | null>(null);
  const usdcMint = getUsdcMint();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InvestFormValues>({
    defaultValues: { amount: "" },
  });

  const onSubmit = async (values: InvestFormValues) => {
    if (!solanaSigner || !usdcMint) return;
    setStatus(t("submitting"));
    try {
      const fundAmount = BigInt(values.amount);
      const instruction = await getFundInvoiceInstructionAsync({
        investor: solanaSigner,
        invoiceVault: address(invoice.vault_pda),
        shares: address(invoice.shares_mint),
        usdcMint,
        invoiceId: invoice.invoice_id,
        fundAmount,
      });
      const signature = await sendInstruction({
        rpc,
        signer: solanaSigner,
        instruction,
      });
      setStatus(`${t("submitted")}: ${signature.slice(0, 8)}…`);
    } catch {
      setStatus(t("investError"));
    }
  };

  if (!assessed) {
    return <Text color="fg.muted">{t("availableSoon")}</Text>;
  }

  return (
    <Card.Root>
      <Card.Body p={5}>
        <Heading as="h3" size="md" mb={4}>
          {t("investTitle")}
        </Heading>
        <Stack as="form" onSubmit={handleSubmit(onSubmit)} gap={4}>
          <Field.Root invalid={!!errors.amount} required>
            <Field.Label htmlFor="amount">{t("investAmount")}</Field.Label>
            <Input
              id="amount"
              type="number"
              placeholder={t("investAmount")}
              {...register("amount", { required: t("investAmount") })}
            />
            <Field.ErrorText>{errors.amount?.message}</Field.ErrorText>
          </Field.Root>
          <Button
            type="submit"
            colorPalette="blue"
            alignSelf="flex-start"
            disabled={!isReady}
          >
            {t("investButton")}
          </Button>
          {status && (
            <Text fontSize="sm" color="fg.muted">
              {status}
            </Text>
          )}
        </Stack>
      </Card.Body>
    </Card.Root>
  );
}
