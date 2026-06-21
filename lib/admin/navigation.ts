export type AdminNavItem = { href: string; label: string };

export function getAdminNav(input: {
  locale: string;
  isPlatformAdmin: boolean;
  labels: {
    assessments: string;
    settlements: string;
    config: string;
  };
}): AdminNavItem[] {
  const { locale, isPlatformAdmin, labels } = input;
  const nav: AdminNavItem[] = [
    { href: `/${locale}/admin/assessments`, label: labels.assessments },
  ];

  if (isPlatformAdmin) {
    nav.push(
      { href: `/${locale}/admin/settlements`, label: labels.settlements },
      { href: `/${locale}/admin/config`, label: labels.config },
    );
  }

  return nav;
}
