import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Badge, Heading, Stack, Text } from "@chakra-ui/react";
import { DashboardLayout } from "@/app/components/DashboardLayout";
import { getInvoiceById } from "@/app/actions/invoices";
import { InvestPanel } from "@/app/components/InvestPanel";

export default async function InvestorInvoiceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("invoices");
  const invoice = await getInvoiceById(id);
  if (!invoice) notFound();

  const assessed = Boolean(invoice.assessed_at);
  const payer = invoice.payer_company as {
    company_name: string;
    about?: string;
    ruc: string;
  } | null;
  const rating = invoice.invoice_assessments?.[0]?.rating;

  return (
    <DashboardLayout
      locale={locale}
      title={payer?.company_name ?? invoice.invoice_number}
      nav={[
        { href: `/${locale}/investor/invoices`, label: t("navInvoices") },
        { href: `/${locale}/investor/investments`, label: t("navInvestments") },
      ]}
    >
      {rating && (
        <Badge colorPalette="yellow" variant="outline" mb={4}>
          {rating}
        </Badge>
      )}
      <Stack gap={6} maxW="xl" mt={6}>
        <Stack gap={2}>
          <Heading as="h2" size="md">
            {t("tabDetail")}
          </Heading>
          <Text>
            {t("operationType")}: {invoice.operation_type}
          </Text>
          <Text>
            {t("collectionDate")}: {invoice.collection_date}
          </Text>
          <Text>
            {t("status")}: {invoice.on_chain_status}
          </Text>
        </Stack>
        <Stack gap={2}>
          <Heading as="h2" size="md">
            {t("tabCompany")}
          </Heading>
          <Text>{payer?.about}</Text>
          <Text>RUC: {payer?.ruc}</Text>
        </Stack>
        <InvestPanel invoice={invoice} assessed={assessed} />
      </Stack>
    </DashboardLayout>
  );
}
