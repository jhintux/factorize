import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Stack, Text } from "@chakra-ui/react";
import { DashboardLayout } from "@/app/components/DashboardLayout";
import { getInvoiceById } from "@/app/actions/invoices";
import { ClaimAdvanceButton } from "@/app/components/ClaimAdvanceButton";

export default async function SmeInvoiceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("sme");
  const invoice = await getInvoiceById(id);
  if (!invoice) notFound();

  return (
    <DashboardLayout
      locale={locale}
      title={invoice.invoice_number}
      nav={[{ href: `/${locale}/sme/invoices`, label: t("myInvoices") }]}
    >
      <Stack gap={2}>
        <Text>
          {t("status")}: {invoice.on_chain_status}
        </Text>
        <Text>
          {t("payer")}:{" "}
          {(invoice.payer_company as { company_name?: string })?.company_name}
        </Text>
        {invoice.on_chain_status === "InProgress" && (
          <ClaimAdvanceButton invoice={invoice} />
        )}
      </Stack>
    </DashboardLayout>
  );
}
