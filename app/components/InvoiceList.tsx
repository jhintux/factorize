"use client";

import NextLink from "next/link";
import { useTranslations } from "next-intl";
import {
  Badge,
  Box,
  Flex,
  LinkBox,
  LinkOverlay,
  Progress,
  Stack,
  Text,
} from "@chakra-ui/react";

type InvoiceRow = {
  id: string;
  invoice_number: string;
  on_chain_status: string;
  advance_amount_usdc: string;
  funding_amount_usdc: string;
  payer_company?: { company_name: string } | null;
  invoice_assessments?: { rating: string }[] | null;
};

export function InvoiceList({
  locale,
  invoices,
  basePath,
}: {
  locale: string;
  invoices: InvoiceRow[];
  basePath: string;
}) {
  const t = useTranslations("invoices");

  if (!invoices.length) {
    return <Text color="fg.muted">{t("empty")}</Text>;
  }

  return (
    <Stack gap={4}>
      {invoices.map((invoice) => {
        const funded = BigInt(invoice.funding_amount_usdc ?? "0");
        const advance = BigInt(invoice.advance_amount_usdc ?? "1");
        const pct = Number((funded * BigInt(100)) / advance);
        const assessed = Boolean(invoice.invoice_assessments?.length);
        const rating = invoice.invoice_assessments?.[0]?.rating;

        return (
          <LinkBox
            key={invoice.id}
            as="article"
            borderWidth="1px"
            borderColor="border.subtle"
            rounded="lg"
            p={5}
            bg="bg"
            _hover={{ borderColor: "border.emphasized" }}
            transition="border-color 0.2s"
          >
            <LinkOverlay asChild>
              <NextLink href={`/${locale}/${basePath}/${invoice.id}`} />
            </LinkOverlay>
            <Flex justify="space-between" align="center" gap={4}>
              <Text fontWeight="semibold">
                {invoice.payer_company?.company_name ?? invoice.invoice_number}
              </Text>
              {rating && (
                <Badge colorPalette="yellow" variant="outline">
                  {rating}
                </Badge>
              )}
            </Flex>
            <Box mt={3}>
              <Progress.Root value={Math.min(pct, 100)} size="sm">
                <Progress.Track>
                  <Progress.Range />
                </Progress.Track>
              </Progress.Root>
            </Box>
            <Text mt={2} color="fg.muted" fontSize="sm">
              {invoice.on_chain_status} · {pct}% {t("funded")}
              {!assessed && ` · ${t("availableSoon")}`}
            </Text>
          </LinkBox>
        );
      })}
    </Stack>
  );
}
