import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function InvoicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("invoices");

  return (
    <main style={{ padding: "48px 16px", fontFamily: "system-ui, sans-serif" }}>
      <p>{t("hello")}</p>
    </main>
  );
}
