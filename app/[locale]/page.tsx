import { setRequestLocale } from "next-intl/server";
import { LoginPage } from "@/app/components/LoginPage";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <LoginPage locale={locale} />;
}
