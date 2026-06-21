import NextLink from "next/link";
import {
  Box,
  Flex,
  Heading,
  Link,
  Stack,
} from "@chakra-ui/react";

type NavItem = { href: string; label: string };

export function DashboardLayout({
  locale,
  title,
  nav,
  children,
}: {
  locale: string;
  title: string;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <Flex minH="100vh">
      <Box
        as="aside"
        w={{ base: "full", md: "220px" }}
        borderRightWidth={{ md: "1px" }}
        borderColor="border.subtle"
        p={6}
        display={{ base: "none", md: "block" }}
      >
        <Link asChild fontWeight="bold" _hover={{ textDecoration: "none" }}>
          <NextLink href={`/${locale}`}>Factorize</NextLink>
        </Link>
        <Stack as="nav" gap={3} mt={8}>
          {nav.map((item) => (
            <Link key={item.href} asChild color="fg.muted" _hover={{ color: "fg.default" }}>
              <NextLink href={item.href}>{item.label}</NextLink>
            </Link>
          ))}
        </Stack>
      </Box>
      <Box as="main" flex={1} p={{ base: 4, md: 8 }}>
        <Stack gap={4} display={{ base: "flex", md: "none" }} mb={6}>
          <Link asChild fontWeight="bold">
            <NextLink href={`/${locale}`}>Factorize</NextLink>
          </Link>
          <Stack as="nav" direction="row" gap={4} flexWrap="wrap">
            {nav.map((item) => (
              <Link key={item.href} asChild fontSize="sm" color="fg.muted">
                <NextLink href={item.href}>{item.label}</NextLink>
              </Link>
            ))}
          </Stack>
        </Stack>
        <Heading as="h1" size="2xl" mb={6}>
          {title}
        </Heading>
        {children}
      </Box>
    </Flex>
  );
}
