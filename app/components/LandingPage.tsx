import NextLink from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import {
  Box,
  Button,
  Flex,
  Heading,
  SimpleGrid,
  Text,
} from "@chakra-ui/react";
import { LocaleSwitcher } from "@/app/components/LocaleSwitcher";
import { DottedSurface } from "@/components/ui/dotted-surface";

export async function LandingPage({
  locale = "en",
  showLocaleSwitcher = false,
}: {
  locale?: string;
  showLocaleSwitcher?: boolean;
}) {
  const t = await getTranslations("landing");

  const stats = [t("statDeposits"), t("statInvestors"), t("statsSme"), t("statDefault")];

  return (
    <Box as="main" position="relative" isolation="isolate" minH="100vh" overflow="hidden">
      <DottedSurface />

      <Box
        position="relative"
        zIndex={10}
        display="flex"
        minH="100vh"
        flexDirection="column"
        bg="transparent"
      >
        <Flex
          as="header"
          justify="flex-end"
          align="center"
          gap={3}
          px={{ base: 6, md: 10 }}
          py={{ base: 6, md: 8 }}
        >
          {showLocaleSwitcher ? <LocaleSwitcher /> : null}
          <Button asChild variant="outline" colorPalette="gray" size="sm">
            <NextLink href="/demo">
              {t("demo")}
              <ArrowRight size={14} />
            </NextLink>
          </Button>
          {/* <Link asChild color="fg.muted" _hover={{ color: "fg.default" }}>
            <NextLink href={`/${locale}/login`}>{t("login")}</NextLink>
          </Link>
          <Button asChild variant="outline" colorPalette="gray" size="sm">
            <NextLink href={`/${locale}/sign-up`}>{t("register")}</NextLink>
          </Button> */}
        </Flex>

        <Flex
          flex="1"
          flexDirection="column"
          align="center"
          justify="center"
          gap={{ base: 8, md: 10 }}
          px={{ base: 6, md: 10 }}
          py={{ base: 8, md: 12 }}
          textAlign="center"
        >
          <Box position="relative" maxW="3xl">
            <Text
              fontSize={{ base: "lg", md: "xl" }}
              color="fg.muted"
              fontFamily="mono"
              lineHeight="tall"
            >
              {t("hero")}
            </Text>
            <Heading
              as="h1"
              my={4}
              size={{ base: "4xl", md: "5xl" }}
              fontFamily="mono"
              fontWeight="semibold"
              letterSpacing="tight"
            >
              {t("brand")}
            </Heading>
            <Text
              fontSize={{ base: "lg", md: "xl" }}
              color="fg.muted"
              fontFamily="mono"
              lineHeight="tall"
            >
              {t("hero2")}
            </Text>
          </Box>

          <SimpleGrid
            columns={{ base: 1, sm: 2 }}
            gap={4}
            w="full"
            maxW="4xl"
          >
            {stats.map((label) => (
              <Box
                key={label}
                borderWidth="1px"
                borderColor="border.subtle"
                rounded="lg"
                p={2}
                textAlign="center"
                //bg="bg/60"
                backdropFilter="blur(8px)"
                fontSize="lg"
                fontWeight="medium"
                fontFamily="mono"
              >
                {label}
              </Box>
            ))}
          </SimpleGrid>
        </Flex>
      </Box>
    </Box>
  );
}
