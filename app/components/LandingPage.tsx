import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Link,
  SimpleGrid,
  Text,
} from "@chakra-ui/react";
import { LocaleSwitcher } from "@/app/components/LocaleSwitcher";

export async function LandingPage({ locale }: { locale: string }) {
  const t = await getTranslations("landing");

  return (
    <Box as="main" minH="100vh">
      <Flex
        as="header"
        justify="space-between"
        align="center"
        px={{ base: 4, md: 6 }}
        py={4}
        borderBottomWidth="1px"
        borderColor="border.subtle"
      >
        <Text fontWeight="bold">{t("brand")}</Text>
        <Flex gap={3} align="center">
          <LocaleSwitcher />
          <Link asChild color="fg.muted" _hover={{ color: "fg.default" }}>
            <NextLink href={`/${locale}/login`}>{t("login")}</NextLink>
          </Link>
          <Button asChild variant="outline" colorPalette="gray" size="sm">
            <NextLink href={`/${locale}/sign-up`}>{t("register")}</NextLink>
          </Button>
        </Flex>
      </Flex>

      <Container maxW="container.lg" textAlign="center" py={{ base: 16, md: 20 }}>
        <Heading
          as="h1"
          size={{ base: "3xl", md: "4xl" }}
          maxW="3xl"
          mx="auto"
        >
          {t("hero")}
        </Heading>
      </Container>

      <SimpleGrid
        columns={{ base: 1, sm: 2, md: 3 }}
        gap={4}
        maxW="4xl"
        mx="auto"
        px={{ base: 4, md: 6 }}
        pb={{ base: 16, md: 20 }}
      >
        {[t("statDeposits"), t("statInvestors"), t("statDefault")].map(
          (label) => (
            <Box
              key={label}
              borderWidth="1px"
              borderColor="border.subtle"
              rounded="lg"
              p={6}
              textAlign="center"
              bg="bg"
            >
              {label}
            </Box>
          ),
        )}
      </SimpleGrid>
    </Box>
  );
}
