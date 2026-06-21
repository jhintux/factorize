import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { DashboardLayout } from "@/app/components/DashboardLayout";
import { CreateInvoiceForm } from "@/app/components/CreateInvoiceForm";
import { getSectorsAndActivities } from "@/app/actions/auth";

export default async function SmeNewInvoicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("sme");
  const { sectors, activities } = await getSectorsAndActivities(locale);

  return (
    <DashboardLayout locale={locale} title={t("newInvoice")} nav={[{ href: `/${locale}/sme/invoices`, label: t("myInvoices") }]}>
      <CreateInvoiceForm locale={locale} sectors={sectors} activities={activities} />
    </DashboardLayout>
  );
}
