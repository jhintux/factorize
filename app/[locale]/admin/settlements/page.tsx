import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { DashboardLayout } from "@/app/components/DashboardLayout";
import { listSettlementQueue } from "@/app/actions/admin";
import { getSession } from "@/lib/auth/session";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { getAdminNav } from "@/lib/admin/navigation";
import { SettlementQueue } from "@/app/components/SettlementQueue";

export default async function AdminSettlementsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session || !(await isPlatformAdmin(session.wallet))) {
    redirect(`/${locale}/login`);
  }

  const t = await getTranslations("admin");
  const queue = await listSettlementQueue();
  const nav = getAdminNav({
    locale,
    isPlatformAdmin: true,
    labels: {
      assessments: t("assessments"),
      settlements: t("settlements"),
      config: t("config"),
    },
  });

  return (
    <DashboardLayout locale={locale} title={t("settlements")} nav={nav}>
      <SettlementQueue invoices={queue} />
    </DashboardLayout>
  );
}
