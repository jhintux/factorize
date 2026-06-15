"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { locales, type Locale } from "@/i18n/config";

export function LocaleSwitcher() {
  const pathname = usePathname();
  const segments = pathname.split("/");
  const currentLocale = segments[1] as Locale;

  const rest = segments.slice(2).join("/");

  return (
    <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
      {locales.map((locale) => {
        const href = rest ? `/${locale}/${rest}` : `/${locale}`;
        const isActive = locale === currentLocale;

        return (
          <Link
            key={locale}
            href={href}
            style={{
              fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              color: isActive ? "#111" : "#6b7280",
              textDecoration: isActive ? "underline" : "none",
            }}
          >
            {locale.toUpperCase()}
          </Link>
        );
      })}
    </div>
  );
}
