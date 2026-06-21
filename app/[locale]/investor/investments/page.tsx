import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Stack, Table, Text } from "@chakra-ui/react";
import { DashboardLayout } from "@/app/components/DashboardLayout";
import { getSession } from "@/lib/auth/session";
import { listInvoicesForInvestor } from "@/app/actions/invoices";

export default async function InvestorInvestmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("invoices");
  const session = await getSession();
  const invoices = await listInvoicesForInvestor();

  return (
    <DashboardLayout
      locale={locale}
      title={t("navInvestments")}
      nav={[
        { href: `/${locale}/investor/invoices`, label: t("navInvoices") },
        { href: `/${locale}/investor/investments`, label: t("navInvestments") },
      ]}
    >
      <Table.Root size="sm">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>{t("enterprise")}</Table.ColumnHeader>
            <Table.ColumnHeader>{t("status")}</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {invoices.map((invoice) => (
            <Table.Row key={invoice.id}>
              <Table.Cell>
                {(invoice.payer_company as { company_name?: string } | null)
                  ?.company_name}
              </Table.Cell>
              <Table.Cell>{invoice.on_chain_status}</Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      {!session && (
        <Text color="fg.muted" mt={4}>
          {t("loginRequired")}
        </Text>
      )}
    </DashboardLayout>
  );
}
