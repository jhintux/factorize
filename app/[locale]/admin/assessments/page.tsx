import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { DashboardLayout } from "@/app/components/DashboardLayout";
import { listAssessmentQueue } from "@/app/actions/admin";
import { getSession } from "@/lib/auth/session";
import {
  canAccessAdminPortal,
  isPlatformAdmin,
} from "@/lib/auth/admin";
import { getAdminNav } from "@/lib/admin/navigation";
import { AssessmentQueue } from "@/app/components/AssessmentQueue";

export default async function AdminAssessmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSession();
  if (!session || !(await canAccessAdminPortal(session.wallet))) {
    redirect(`/${locale}/login`);
  }

  const t = await getTranslations("admin");
  const queue = await listAssessmentQueue();
  const platformAdmin = await isPlatformAdmin(session.wallet);
  const nav = getAdminNav({
    locale,
    isPlatformAdmin: platformAdmin,
    labels: {
      assessments: t("assessments"),
      settlements: t("settlements"),
      config: t("config"),
    },
  });

  return (
    <DashboardLayout locale={locale} title={t("assessments")} nav={nav}>
      <AssessmentQueue locale={locale} invoices={queue} />
    </DashboardLayout>
  );
}
