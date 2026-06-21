"use client";

import { useAccount, useModal, useWallet } from "@getpara/react-sdk";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Grid,
  Heading,
  IconButton,
  Stack,
  Text,
} from "@chakra-ui/react";
import {
  getAddAnalystInstructionAsync,
  getRemoveAnalystInstructionAsync,
  FACTORIZE_PROGRAM_ADDRESS,
} from "@factorize/sdk";
import { address } from "@solana/kit";
import {
  addDemoSme,
  cleanupPendingDemoAnalyst,
  confirmDemoAnalyst,
  ensureDemoSmesSeeded,
  getDemoPageData,
  prepareDemoAnalyst,
  removeDemoAnalyst,
} from "@/app/actions/demo";
import type {
  DemoAnalystEntry,
  DemoInvoiceEntry,
  DemoSmeEntry,
  DemoSolBudget,
} from "@/app/actions/demo";
import { CopyableAddress } from "@/app/components/CopyableAddress";
import { DemoInvoiceFlowDialog } from "@/app/components/DemoInvoiceFlowDialog";
import {
  DemoInvoiceHistoryDialog,
  HistoryIcon,
} from "@/app/components/DemoInvoiceHistoryDialog";
import { useFactorizeClient } from "@/app/hooks/useFactorizeClient";
import { sendInstruction } from "@/lib/factorize/sendInstruction";
import type { ProtocolConfigSummary } from "@/lib/factorize/protocolState";

type DemoData = {
  protocol: ProtocolConfigSummary;
  treasury: {
    treasury: string | null;
    balanceFormatted: string;
  };
  analysts: DemoAnalystEntry[];
  smes: DemoSmeEntry[];
  invoices: DemoInvoiceEntry[];
  solBudget: DemoSolBudget;
};

function smeSolTitle(entry: DemoSmeEntry) {
  return `${entry.label} · ${entry.solBalanceFormatted} SOL`;
}

function formatUsdc(raw: string) {
  const amount = BigInt(raw);
  const whole = amount / 1_000_000n;
  const fraction = amount % 1_000_000n;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(6, "0").replace(/0+$/, "")}`;
}

const INVOICE_STATUS_BADGE_BG = "rgb(49, 93, 55)";
const INVOICE_STATUS_BADGE_TEXT = "rgb(103, 211, 120)";

function formatDemoTimestamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function InvoiceStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      size="sm"
      variant="outline"
      bg={INVOICE_STATUS_BADGE_BG}
      color={INVOICE_STATUS_BADGE_TEXT}
      borderColor={INVOICE_STATUS_BADGE_TEXT}
    >
      {status}
    </Badge>
  );
}

function SmeRow({
  entry,
  solBudget,
  onCreateInvoice,
  createDisabled,
}: {
  entry: DemoSmeEntry;
  solBudget: DemoSolBudget;
  onCreateInvoice: () => void;
  createDisabled?: boolean;
}) {
  const balanceZero = entry.solBalanceLamports === "0";
  const underfunded = !entry.canInitInvoice;

  return (
    <Flex
      align="center"
      gap={2}
      py={2}
      px={3}
      borderWidth="1px"
      borderColor={underfunded ? "orange.300" : "border.subtle"}
      rounded="md"
      bg="bg"
      fontSize="xs"
    >
      <Stack gap={0.5} flex={1} minW={0}>
        <Text fontWeight="medium" color={balanceZero ? "red.500" : undefined}>
          {smeSolTitle(entry)}
        </Text>
        <CopyableAddress address={entry.wallet} truncateChars={8} />
        {underfunded && (
          <Text color="orange.500" fontSize="xs">
            {balanceZero
              ? `Prefund on devnet — min ${entry.minSolRequiredFormatted} SOL to issue (rent + ${solBudget.txFeeSol} SOL/tx)`
              : `Below min ${entry.minSolRequiredFormatted} SOL for invoice flows (rent + ${solBudget.txFeeSol} SOL/tx)`}
          </Text>
        )}
      </Stack>
      <Button
        aria-label="Simulate invoice flow"
        size="xs"
        variant="outline"
        disabled={createDisabled}
        onClick={onCreateInvoice}
      >
        Simulate
      </Button>
    </Flex>
  );
}

function AnalystRow({
  wallet,
  pda,
  onRemove,
  removeDisabled,
  removeLoading,
}: {
  wallet: string;
  pda: string;
  onRemove: () => void;
  removeDisabled?: boolean;
  removeLoading?: boolean;
}) {
  return (
    <Flex
      align="center"
      gap={2}
      py={2}
      px={3}
      borderWidth="1px"
      borderColor="border.subtle"
      rounded="md"
      bg="bg"
      fontSize="xs"
    >
      <Stack gap={0.5} flex={1} minW={0}>
        <CopyableAddress address={wallet} truncateChars={8} />
        <CopyableAddress
          address={pda}
          prefix="PDA: "
          truncateChars={8}
          color="fg.muted"
        />
      </Stack>
      <IconButton
        aria-label="Remove analyst"
        size="xs"
        variant="ghost"
        colorPalette="red"
        disabled={removeDisabled}
        loading={removeLoading}
        onClick={onRemove}
      >
        −
      </IconButton>
    </Flex>
  );
}

function ColumnHeader({
  title,
  onAdd,
  addDisabled,
  addLoading,
}: {
  title: string;
  onAdd?: () => void;
  addDisabled?: boolean;
  addLoading?: boolean;
}) {
  return (
    <Flex align="center" justify="space-between" mb={3}>
      <Heading as="h2" size="sm">
        {title}
      </Heading>
      {onAdd && (
        <IconButton
          aria-label={`Add ${title}`}
          size="xs"
          variant="outline"
          disabled={addDisabled}
          loading={addLoading}
          onClick={onAdd}
        >
          +
        </IconButton>
      )}
    </Flex>
  );
}

export function DemoPage({ initialData }: { initialData: DemoData }) {
  const { openModal } = useModal();
  const { isConnected } = useAccount();
  const { data: wallet } = useWallet();
  const { rpc, solanaSigner, isReady } = useFactorizeClient();

  const [data, setData] = useState(initialData);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [invoiceSme, setInvoiceSme] = useState<DemoSmeEntry | null>(null);
  const [historyInvoice, setHistoryInvoice] = useState<DemoInvoiceEntry | null>(
    null,
  );

  const connectedWallet = solanaSigner?.address ?? wallet?.address ?? null;
  const isOnChainAdmin =
    Boolean(connectedWallet) &&
    Boolean(data.protocol.admin) &&
    connectedWallet === data.protocol.admin;

  const refresh = useCallback(async () => {
    const next = await getDemoPageData();
    setData(next);
  }, []);

  useEffect(() => {
    void ensureDemoSmesSeeded().then((result) => {
      if (result.ok && result.seeded) {
        void refresh();
      }
    });
  }, [refresh]);

  const addAnalyst = () => {
    if (!solanaSigner || !connectedWallet) return;
    setError(null);

    startTransition(async () => {
      let pendingWallet: string | null = null;
      try {
        const prepared = await prepareDemoAnalyst(connectedWallet);
        if (!prepared.ok) {
          setError(
            prepared.error === "notAdmin"
              ? "Only the on-chain admin can add analysts."
              : "Failed to prepare analyst.",
          );
          return;
        }

        pendingWallet = prepared.wallet;

        const instruction = await getAddAnalystInstructionAsync({
          admin: solanaSigner,
          analyst: address(prepared.wallet),
        });
        await sendInstruction({ rpc, signer: solanaSigner, instruction });

        const confirmed = await confirmDemoAnalyst({
          wallet: prepared.wallet,
          adminWallet: connectedWallet,
        });

        if (!confirmed.ok) {
          await cleanupPendingDemoAnalyst(prepared.wallet);
          setError("Transaction did not land on-chain. Analyst was not saved.");
          return;
        }

        await refresh();
      } catch {
        if (pendingWallet) {
          await cleanupPendingDemoAnalyst(pendingWallet);
        }
        setError(
          "Failed to add analyst. Check that you are the admin and try again.",
        );
      }
    });
  };

  const removeAnalyst = (entry: DemoAnalystEntry) => {
    if (!solanaSigner || !connectedWallet) return;
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

        const result = await removeDemoAnalyst({
          wallet: entry.wallet,
          adminWallet: connectedWallet,
        });

        if (!result.ok) {
          setError(
            result.error === "notAdmin"
              ? "Only the on-chain admin can remove analysts."
              : "Failed to remove analyst.",
          );
          return;
        }

        await refresh();
      } catch {
        setError("Failed to remove analyst.");
      }
    });
  };

  const addSme = () => {
    if (!connectedWallet) return;
    setError(null);

    startTransition(async () => {
      const result = await addDemoSme(connectedWallet);
      if (!result.ok) {
        setError(
          result.error === "notAdmin"
            ? "Only the on-chain admin can add SMEs."
            : "Failed to add SME.",
        );
        return;
      }
      await refresh();
    });
  };

  return (
    <Stack gap={6} minH="100vh">
      <Flex
        as="header"
        align="center"
        justify="space-between"
        px={{ base: 4, md: 8 }}
        py={4}
        borderBottomWidth="1px"
        borderColor="border.subtle"
        bg="bg"
      >
        <Flex gap={2} alignItems="flex-end">
          <Heading as="h1" size="lg">
            Factorize Demo
          </Heading>
          <CopyableAddress
            address={FACTORIZE_PROGRAM_ADDRESS}
            truncateChars={8}
            fontSize="sm"
          />
        </Flex>
        {isConnected && connectedWallet ? (
          <Flex align="center" gap={2}>
            <CopyableAddress
              address={connectedWallet}
              truncateChars={6}
              fontSize="sm"
            />
            <Button colorPalette="gray" size="sm" onClick={() => openModal()}>
              Wallet
            </Button>
          </Flex>
        ) : (
          <Button colorPalette="gray" onClick={() => openModal()}>
            Connect wallet
          </Button>
        )}
      </Flex>

      <Box px={{ base: 4, md: 8 }} pb={10}>
        <Card.Root mb={6}>
          <Card.Body p={5}>
            <Text fontWeight="semibold" mb={3}>
              Config
            </Text>
            {!data.protocol.initialized ? (
              <Text color="fg.muted">Protocol not initialized.</Text>
            ) : (
              <Grid
                templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }}
                gap={4}
              >
                <Box>
                  <Text color="fg.muted" fontSize="sm" mb={1}>
                    Admin
                  </Text>
                  <CopyableAddress
                    address={data.protocol.admin}
                    fontSize="sm"
                  />
                </Box>
                <Box>
                  <Text color="fg.muted" fontSize="sm" mb={1}>
                    Treasury
                  </Text>
                  <CopyableAddress
                    address={data.treasury.treasury}
                    fontSize="sm"
                  />
                  <Text fontSize="sm" mt={1}>
                    {data.treasury.balanceFormatted} USDC
                  </Text>
                </Box>
                <Box>
                  <Text color="fg.muted" fontSize="sm" mb={1}>
                    Paused
                  </Text>
                  <Badge colorPalette={data.protocol.paused ? "red" : "green"}>
                    {data.protocol.paused ? "true" : "false"}
                  </Badge>
                </Box>
              </Grid>
            )}
            {connectedWallet && data.protocol.admin && !isOnChainAdmin && (
              <Text color="orange.500" fontSize="sm" mt={3}>
                Connected wallet is not the on-chain admin. Add/remove actions
                are disabled.
              </Text>
            )}
          </Card.Body>
        </Card.Root>

        <Grid templateColumns={{ base: "1fr", lg: "repeat(3, 1fr)" }} gap={6}>
          <Box>
            <ColumnHeader
              title="Analysts"
              onAdd={addAnalyst}
              addDisabled={!isReady || !isOnChainAdmin || isPending}
              addLoading={isPending}
            />
            {!data.analysts.length ? (
              <Text color="fg.muted" fontSize="sm">
                No analysts yet.
              </Text>
            ) : (
              <Stack gap={2}>
                {data.analysts.map((entry) => (
                  <AnalystRow
                    key={entry.id}
                    wallet={entry.wallet}
                    pda={entry.whitelistPda}
                    onRemove={() => removeAnalyst(entry)}
                    removeDisabled={!isReady || !isOnChainAdmin || isPending}
                    removeLoading={isPending}
                  />
                ))}
              </Stack>
            )}
          </Box>

          <Box>
            <ColumnHeader
              title="SMEs"
              onAdd={addSme}
              addDisabled={!connectedWallet || !isOnChainAdmin || isPending}
              addLoading={isPending}
            />
            <Text color="fg.muted" fontSize="xs" mb={3}>
              Demo SMEs must be prefunded with devnet SOL. Send SOL to each
              wallet below — issuer min {data.solBudget.issuerMinSol} SOL
              (InvoiceVault + mint + escrow rent + 3 txs), investor min{" "}
              {data.solBudget.investorMinSol} SOL (token accounts + 2 txs).
              Assumes {data.solBudget.txFeeSol} SOL per transaction.
            </Text>
            {!data.smes.length ? (
              <Text color="fg.muted" fontSize="sm">
                Seeding SMEs…
              </Text>
            ) : (
              <Stack gap={2}>
                {data.smes.map((entry) => (
                  <SmeRow
                    key={entry.id}
                    entry={entry}
                    solBudget={data.solBudget}
                    onCreateInvoice={() => {
                      if (!entry.canInitInvoice) {
                        setError(
                          entry.solBalanceLamports === "0"
                            ? `${entry.label} has 0 SOL. Prefund the wallet on devnet before starting a flow.`
                            : `${entry.label} needs at least ${entry.minSolRequiredFormatted} SOL to issue an invoice.`,
                        );
                        return;
                      }
                      setInvoiceSme(entry);
                    }}
                    createDisabled={
                      !connectedWallet ||
                      !isOnChainAdmin ||
                      isPending ||
                      !entry.canInitInvoice
                    }
                  />
                ))}
              </Stack>
            )}
          </Box>

          <Box>
            <ColumnHeader title="Invoices" />
            {!data.invoices.length ? (
              <Text color="fg.muted" fontSize="sm">
                No invoices yet.
              </Text>
            ) : (
              <Stack gap={2}>
                {data.invoices.map((invoice) => (
                  <Box
                    key={invoice.id}
                    py={2}
                    px={3}
                    borderWidth="1px"
                    borderColor="border.subtle"
                    rounded="md"
                    bg="bg"
                    fontSize="xs"
                  >
                    <Flex justify="space-between" align="center" gap={2} mb={1}>
                      <Text fontWeight="medium">{invoice.invoice_id}</Text>
                      <IconButton
                        aria-label="View invoice history"
                        size="2xs"
                        variant="ghost"
                        onClick={() => setHistoryInvoice(invoice)}
                      >
                        <HistoryIcon />
                      </IconButton>
                    </Flex>
                    <Flex align="center" gap={2} flexWrap="wrap">
                      <Text color="fg.muted">{invoice.sme_label}</Text>
                      <InvoiceStatusBadge status={invoice.on_chain_status} />
                    </Flex>
                    <Text color="fg.muted" mt={1}>
                      Due {formatDemoTimestamp(invoice.due_date)}
                    </Text>
                    {invoice.on_chain_status === "Settled" && (
                      <Text color="fg.muted" mt={1}>
                        Settled {formatDemoTimestamp(invoice.settle_date)}
                      </Text>
                    )}
                    <Text color="fg.muted" mt={1}>
                      Advance {formatUsdc(invoice.advance_amount_usdc)} / Repay{" "}
                      {formatUsdc(invoice.repayment_amount_usdc)} USDC
                    </Text>
                    <Text color="fg.muted" mt={1}>
                      Funded {formatUsdc(invoice.funding_amount_usdc)} USDC
                      {invoice.on_chain_status === "Settled" &&
                        ` · Pool ${formatUsdc(invoice.settlement_pool)} USDC`}
                    </Text>
                    <CopyableAddress
                      address={invoice.vault_pda}
                      prefix="Vault: "
                      truncateChars={8}
                      color="fg.muted"
                      mt={1}
                    />
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        </Grid>

        {error && (
          <Text color="red.500" fontSize="sm" mt={4}>
            {error}
          </Text>
        )}
      </Box>

      {invoiceSme && (
        <DemoInvoiceFlowDialog
          sme={invoiceSme}
          open={Boolean(invoiceSme)}
          onClose={() => setInvoiceSme(null)}
          onComplete={() => void refresh()}
        />
      )}

      {historyInvoice && (
        <DemoInvoiceHistoryDialog
          invoice={historyInvoice}
          open={Boolean(historyInvoice)}
          onClose={() => setHistoryInvoice(null)}
        />
      )}
    </Stack>
  );
}
