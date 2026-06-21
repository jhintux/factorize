"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Badge,
  Box,
  Button,
  Card,
  Field,
  Flex,
  Input,
  Stack,
  Text,
} from "@chakra-ui/react";
import {
  getAddAnalystInstructionAsync,
  getRemoveAnalystInstructionAsync,
} from "@factorize/sdk";
import { address } from "@solana/kit";
import {
  checkAnalystOnChain,
  deleteStaleAnalystFromDb,
  registerAnalystInDb,
  removeAnalystFromDb,
  type AnalystListEntry,
} from "@/app/actions/admin";
import { useFactorizeClient } from "@/app/hooks/useFactorizeClient";
import { sendInstruction } from "@/lib/factorize/sendInstruction";
import { isValidWallet } from "@/lib/auth/wallet";

type ProtocolSummary = {
  configPda: string;
  admin: string | null;
  treasury: string | null;
  usdcMint: string | null;
  paused: boolean;
  protocolFeeBps: number;
  initialized: boolean;
};

export function AnalystConfigPanel({
  protocol,
  analysts: initialAnalysts,
  connectedWallet,
}: {
  protocol: ProtocolSummary;
  analysts: AnalystListEntry[];
  connectedWallet: string | null;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const { rpc, solanaSigner, isReady } = useFactorizeClient();
  const [analysts, setAnalysts] = useState(initialAnalysts);
  const [name, setName] = useState("");
  const [wallet, setWallet] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isOnChainAdmin =
    Boolean(connectedWallet) &&
    Boolean(protocol.admin) &&
    connectedWallet === protocol.admin;

  const addAnalyst = () => {
    if (!solanaSigner || !isOnChainAdmin) return;
    if (!name.trim() || !isValidWallet(wallet)) {
      setError(t("configInvalidInput"));
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const chainCheck = await checkAnalystOnChain(wallet);
        if (chainCheck.ok && chainCheck.onChainActive) {
          setError(t("configAlreadyWhitelisted"));
          return;
        }

        const instruction = await getAddAnalystInstructionAsync({
          admin: solanaSigner,
          analyst: address(wallet),
        });
        await sendInstruction({ rpc, signer: solanaSigner, instruction });

        const dbResult = await registerAnalystInDb({
          name: name.trim(),
          wallet,
        });
        if (!dbResult.ok) {
          setError(t("configDbSaveFailed"));
          return;
        }

        setName("");
        setWallet("");
        globalThis.location.reload();
      } catch {
        setError(tc("error"));
      }
    });
  };

  const removeAnalyst = (entry: AnalystListEntry) => {
    if (!solanaSigner || !isOnChainAdmin) return;

    setError(null);
    startTransition(async () => {
      try {
        if (entry.onChainActive) {
          const instruction = await getRemoveAnalystInstructionAsync({
            admin: solanaSigner,
            analyst: address(entry.wallet),
          });
          await sendInstruction({ rpc, signer: solanaSigner, instruction });
        }

        const dbResult = await removeAnalystFromDb(entry.wallet);
        if (!dbResult.ok) {
          setError(tc("error"));
          return;
        }

        setAnalysts((prev) => prev.filter((a) => a.wallet !== entry.wallet));
        globalThis.location.reload();
      } catch {
        setError(tc("error"));
      }
    });
  };

  const deleteStale = (entry: AnalystListEntry) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteStaleAnalystFromDb(entry.id);
      if (!result.ok) {
        setError(
          result.error === "stillActiveOnChain"
            ? t("configStillActiveOnChain")
            : tc("error"),
        );
        return;
      }
        setAnalysts((prev) => prev.filter((a) => a.id !== entry.id));
        globalThis.location.reload();
      });
  };

  return (
    <Stack gap={6}>
      <Card.Root>
        <Card.Body p={4}>
          <Text fontWeight="semibold" mb={3}>
            {t("configProtocolTitle")}
          </Text>
          {!protocol.initialized ? (
            <Text color="fg.muted">{t("configNotInitialized")}</Text>
          ) : (
            <Stack gap={2} fontSize="sm">
              <Flex gap={2} flexWrap="wrap">
                <Text color="fg.muted">{t("configPda")}:</Text>
                <Text fontFamily="mono" wordBreak="break-all">
                  {protocol.configPda}
                </Text>
              </Flex>
              <Flex gap={2} flexWrap="wrap">
                <Text color="fg.muted">{t("configOnChainAdmin")}:</Text>
                <Text fontFamily="mono" wordBreak="break-all">
                  {protocol.admin}
                </Text>
              </Flex>
              <Flex gap={2} align="center">
                <Text color="fg.muted">{t("configPaused")}:</Text>
                <Badge colorPalette={protocol.paused ? "red" : "green"}>
                  {protocol.paused ? t("configPausedYes") : t("configPausedNo")}
                </Badge>
              </Flex>
            </Stack>
          )}
          {connectedWallet && protocol.admin && !isOnChainAdmin && (
            <Text color="orange.500" fontSize="sm" mt={3}>
              {t("configSignerMismatch")}
            </Text>
          )}
        </Card.Body>
      </Card.Root>

      <Card.Root>
        <Card.Body p={4}>
          <Text fontWeight="semibold" mb={3}>
            {t("configAddAnalyst")}
          </Text>
          <Stack gap={3}>
            <Field.Root>
              <Field.Label>{t("configAnalystName")}</Field.Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("configAnalystNamePlaceholder")}
              />
            </Field.Root>
            <Field.Root>
              <Field.Label>{t("configAnalystWallet")}</Field.Label>
              <Input
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder={t("configAnalystWalletPlaceholder")}
                fontFamily="mono"
              />
            </Field.Root>
            <Button
              colorPalette="gray"
              alignSelf="flex-start"
              disabled={!isReady || !isOnChainAdmin || isPending}
              loading={isPending}
              onClick={addAnalyst}
            >
              {t("configAddAnalystButton")}
            </Button>
          </Stack>
        </Card.Body>
      </Card.Root>

      <Box>
        <Text fontWeight="semibold" mb={3}>
          {t("configAnalystList")}
        </Text>
        {!analysts.length ? (
          <Text color="fg.muted">{t("configNoAnalysts")}</Text>
        ) : (
          <Stack gap={3}>
            {analysts.map((entry) => (
              <Card.Root key={entry.id}>
                <Card.Body p={4}>
                  <Flex
                    justify="space-between"
                    align="flex-start"
                    gap={4}
                    flexWrap="wrap"
                  >
                    <Box flex={1} minW={0}>
                      <Flex gap={2} align="center" flexWrap="wrap" mb={1}>
                        <Text fontWeight="medium">{entry.name}</Text>
                        {entry.onChainActive ? (
                          <Badge colorPalette="green">{t("configActive")}</Badge>
                        ) : (
                          <Badge colorPalette="orange">
                            {t("configInconsistent")}
                          </Badge>
                        )}
                      </Flex>
                      <Text fontFamily="mono" fontSize="sm" wordBreak="break-all">
                        {entry.wallet}
                      </Text>
                      <Text color="fg.muted" fontSize="xs" mt={1} wordBreak="break-all">
                        {t("configWhitelistPda")}: {entry.whitelistPda}
                      </Text>
                      {entry.inconsistent && (
                        <Text color="orange.500" fontSize="sm" mt={2}>
                          {t("configInconsistentHint")}
                        </Text>
                      )}
                    </Box>
                    <Flex gap={2} flexWrap="wrap">
                      {entry.inconsistent ? (
                        <Button
                          size="sm"
                          variant="outline"
                          colorPalette="orange"
                          disabled={isPending}
                          onClick={() => deleteStale(entry)}
                        >
                          {t("configRemoveFromDb")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          colorPalette="red"
                          disabled={!isReady || !isOnChainAdmin || isPending}
                          onClick={() => removeAnalyst(entry)}
                        >
                          {t("configRemoveAnalyst")}
                        </Button>
                      )}
                    </Flex>
                  </Flex>
                </Card.Body>
              </Card.Root>
            ))}
          </Stack>
        )}
      </Box>

      {error && (
        <Text color="red.500" fontSize="sm">
          {error}
        </Text>
      )}
    </Stack>
  );
}
