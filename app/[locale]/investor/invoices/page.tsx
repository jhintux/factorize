import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { DashboardLayout } from "@/app/components/DashboardLayout";
import { InvoiceList } from "@/app/components/InvoiceList";
import { listInvoicesForInvestor } from "@/app/actions/invoices";

export default async function InvestorInvoicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("invoices");
  const invoices = await listInvoicesForInvestor();

  return (
    <DashboardLayout
      locale={locale}
      title={t("title")}
      nav={[
        { href: `/${locale}/investor/invoices`, label: t("navInvoices") },
        { href: `/${locale}/investor/investments`, label: t("navInvestments") },
      ]}
    >
      <InvoiceList locale={locale} invoices={invoices} basePath="investor/invoices" />
    </DashboardLayout>
  );
}
