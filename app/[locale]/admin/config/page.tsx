import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { DashboardLayout } from "@/app/components/DashboardLayout";
import { AnalystConfigPanel } from "@/app/components/AnalystConfigPanel";
import { listAnalystsWithStatus } from "@/app/actions/admin";
import { getSession } from "@/lib/auth/session";
import { isPlatformAdmin } from "@/lib/auth/admin";
import { getAdminNav } from "@/lib/admin/navigation";

export default async function AdminConfigPage({
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
  const result = await listAnalystsWithStatus();

  if (!result.ok) {
    redirect(`/${locale}/login`);
  }

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
    <DashboardLayout locale={locale} title={t("config")} nav={nav}>
      <AnalystConfigPanel
        protocol={result.protocol}
        analysts={result.analysts}
        connectedWallet={session.wallet}
      />
    </DashboardLayout>
  );
}
