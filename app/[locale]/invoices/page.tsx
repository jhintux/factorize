import { getTranslations, setRequestLocale } from "next-intl/server";
import { Container, Text } from "@chakra-ui/react";

export default async function InvoicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("invoices");

  return (
    <Container maxW="lg" py={{ base: 8, md: 12 }} px={4}>
      <Text>{t("hello")}</Text>
    </Container>
  );
}
