"use client";

import { useAccount, useModal, useWallet } from "@getpara/react-sdk";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Flex,
  Heading,
  Link,
  Stack,
  Text,
} from "@chakra-ui/react";
import { getWalletLoginStatus, loginByWallet } from "@/app/actions/auth";
import { LocaleSwitcher } from "@/app/components/LocaleSwitcher";
import { useFactorizeClient } from "@/app/hooks/useFactorizeClient";
import type { WalletAdminStatus } from "@/lib/auth/admin";

export function LoginPage({ locale }: { locale: string }) {
  const t = useTranslations("login");
  const tc = useTranslations("common");
  const { openModal } = useModal();
  const { isConnected } = useAccount();
  const { data: wallet } = useWallet();
  const { solanaSigner } = useFactorizeClient();
  const [error, setError] = useState<string | null>(null);
  const [adminStatus, setAdminStatus] = useState<WalletAdminStatus | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const address = solanaSigner?.address ?? wallet?.address;
  const walletReady = Boolean(address);

  useEffect(() => {
    if (!address) {
      setAdminStatus(null);
      return;
    }

    let cancelled = false;
    void getWalletLoginStatus(address).then((result) => {
      if (cancelled || !result.ok) return;
      setAdminStatus(result.status);
    });

    return () => {
      cancelled = true;
    };
  }, [address]);

  const handleContinue = () => {
    if (!address) return;

    setError(null);
    startTransition(async () => {
      const result = await loginByWallet(address, locale);
      if (result.ok === false) {
        if (result.error === "notRegistered") {
          setError(t("notRegistered"));
        } else {
          setError(tc("error"));
        }
      }
    });
  };

  return (
    <Container maxW="lg" py={{ base: 8, md: 12 }} px={4}>
      <Box mb={6}>
        <LocaleSwitcher />
      </Box>

      <Stack gap={2} textAlign="center" mb={12}>
        <Heading as="h1" size="3xl">
          {t("title")}
        </Heading>
        <Text color="fg.muted" maxW="xl" mx="auto">
          {t("description")}
        </Text>
      </Stack>

      {!isConnected ? (
        <Card.Root maxW="md" mx="auto">
          <Card.Body p={8} textAlign="center">
            <Button
              width="full"
              colorPalette="gray"
              onClick={() => openModal()}
            >
              {t("connectButton")}
            </Button>
          </Card.Body>
        </Card.Root>
      ) : !walletReady ? (
        <Card.Root maxW="md" mx="auto">
          <Card.Body p={8} textAlign="center">
            <Button width="full" colorPalette="gray" loading disabled>
              {tc("loading")}
            </Button>
          </Card.Body>
        </Card.Root>
      ) : (
        <Card.Root maxW="md" mx="auto">
          <Card.Body p={8} textAlign="center">
            <Text fontSize="sm" color="fg.muted" mb={1}>
              {t("connectedAs")}
            </Text>
            <Text fontFamily="mono" fontSize="sm" wordBreak="break-all" mb={4}>
              {address}
            </Text>
            {adminStatus?.isPlatformAdmin && (
              <Flex justify="center" gap={2} flexWrap="wrap" mb={4}>
                <Badge colorPalette="purple">{t("platformAdminBadge")}</Badge>
                {adminStatus.matchesOnChainAdmin && (
                  <Badge colorPalette="blue">{t("onChainAdminBadge")}</Badge>
                )}
                {adminStatus.inEnvAdminList && (
                  <Badge colorPalette="gray">{t("envAdminBadge")}</Badge>
                )}
              </Flex>
            )}
            {adminStatus?.isWhitelistedAnalyst &&
              !adminStatus.isPlatformAdmin && (
                <Badge colorPalette="green" mb={4}>
                  {t("analystBadge")}
                </Badge>
              )}
            <Button
              width="full"
              colorPalette="gray"
              onClick={handleContinue}
              disabled={isPending}
              loading={isPending}
            >
              {isPending
                ? tc("loading")
                : adminStatus?.canAccessAdminPortal
                  ? t("continueAdminButton")
                  : t("continueButton")}
            </Button>
            <Button
              width="full"
              variant="outline"
              colorPalette="gray"
              mt={2}
              onClick={() => openModal()}
            >
              {t("manageWallet")}
            </Button>
            {error && (
              <Text color="red.500" mt={3} fontSize="sm">
                {error}
              </Text>
            )}
          </Card.Body>
        </Card.Root>
      )}

      <Text textAlign="center" mt={6} color="fg.muted">
        {t("signUpPrompt")}{" "}
        <Link asChild color="fg.default">
          <NextLink href={`/${locale}/sign-up`}>{t("signUpLink")}</NextLink>
        </Link>
      </Text>
    </Container>
  );
}
