"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { HStack, Link } from "@chakra-ui/react";
import { locales, type Locale } from "@/i18n/config";

export function LocaleSwitcher() {
  const pathname = usePathname();
  const segments = pathname.split("/");
  const currentLocale = segments[1] as Locale;
  const rest = segments.slice(2).join("/");

  return (
    <HStack as="nav" gap={3} justify="center">
      {locales.map((locale) => {
        const href = rest ? `/${locale}/${rest}` : `/${locale}`;
        const isActive = locale === currentLocale;

        return (
          <Link
            key={locale}
            asChild
            fontSize="sm"
            fontWeight={isActive ? "semibold" : "normal"}
            color={isActive ? "fg.default" : "fg.muted"}
            textDecoration={isActive ? "underline" : "none"}
          >
            <NextLink href={href}>{locale.toUpperCase()}</NextLink>
          </Link>
        );
      })}
    </HStack>
  );
}
