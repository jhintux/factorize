import NextLink from "next/link";
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import {
  Button,
  Link,
  Table,
} from "@chakra-ui/react";
import { DashboardLayout } from "@/app/components/DashboardLayout";
import { listSmeInvoices } from "@/app/actions/invoices";

export default async function SmeInvoicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("sme");
  const invoices = await listSmeInvoices();

  return (
    <DashboardLayout
      locale={locale}
      title={t("title")}
      nav={[{ href: `/${locale}/sme/invoices`, label: t("myInvoices") }]}
    >
      <Button asChild colorPalette="gray" mb={6}>
        <NextLink href={`/${locale}/sme/invoices/new`}>{t("newInvoice")}</NextLink>
      </Button>
      <Table.Root size="sm">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>{t("invoiceNumber")}</Table.ColumnHeader>
            <Table.ColumnHeader>{t("payer")}</Table.ColumnHeader>
            <Table.ColumnHeader>{t("status")}</Table.ColumnHeader>
            <Table.ColumnHeader />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {invoices.map((inv) => (
            <Table.Row key={inv.id}>
              <Table.Cell>{inv.invoice_number}</Table.Cell>
              <Table.Cell>
                {(inv.payer_company as { company_name?: string })?.company_name}
              </Table.Cell>
              <Table.Cell>{inv.on_chain_status}</Table.Cell>
              <Table.Cell>
                <Link asChild color="blue.500">
                  <NextLink href={`/${locale}/sme/invoices/${inv.id}`}>
                    {t("view")}
                  </NextLink>
                </Link>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </DashboardLayout>
  );
}
