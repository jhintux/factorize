import { setRequestLocale } from "next-intl/server";
import { getSectorsAndActivities } from "@/app/actions/auth";
import { SignUpForm } from "@/app/components/SignUpForm";

export const dynamic = "force-dynamic";

export default async function SignUpPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { sectors, activities } = await getSectorsAndActivities(locale);

  return (
    <SignUpForm locale={locale} sectors={sectors} activities={activities} />
  );
}
