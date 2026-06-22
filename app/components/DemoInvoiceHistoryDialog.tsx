"use client";

import { useEffect, useState } from "react";
import {
  Box,
  CloseButton,
  Dialog,
  Portal,
  Spinner,
  Stack,
  Steps,
  Text,
} from "@chakra-ui/react";
import {
  getDemoInvoiceLogs,
  type DemoInvoiceLogEntry,
} from "@/app/actions/demoInvoices";
import type { DemoInvoiceEntry } from "@/app/actions/demo";
import { CopyableAddress } from "@/app/components/CopyableAddress";
import { demoStepStyles } from "@/app/components/demoStepStyles";

function HistoryIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export { HistoryIcon };

type CachedInvoiceLogs =
  | { status: "success"; logs: DemoInvoiceLogEntry[] }
  | { status: "error"; error: string };

const invoiceLogsSessionCache = new Map<string, CachedInvoiceLogs>();

function getCachedInvoiceLogs(invoiceId: string): CachedInvoiceLogs | undefined {
  return invoiceLogsSessionCache.get(invoiceId);
}

function setCachedInvoiceLogs(invoiceId: string, entry: CachedInvoiceLogs) {
  invoiceLogsSessionCache.set(invoiceId, entry);
}

function getInitialLogState(invoiceId: string) {
  const cached = getCachedInvoiceLogs(invoiceId);
  if (!cached) {
    return { logs: [] as DemoInvoiceLogEntry[], loading: true, error: null as string | null };
  }
  if (cached.status === "error") {
    return { logs: [] as DemoInvoiceLogEntry[], loading: false, error: cached.error };
  }
  return { logs: cached.logs, loading: false, error: null as string | null };
}

export function DemoInvoiceHistoryDialog({
  invoice,
  open,
  onClose,
}: {
  invoice: DemoInvoiceEntry;
  open: boolean;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState(
    () => getInitialLogState(invoice.id).logs,
  );
  const [loading, setLoading] = useState(
    () => getInitialLogState(invoice.id).loading,
  );
  const [error, setError] = useState<string | null>(
    () => getInitialLogState(invoice.id).error,
  );

  useEffect(() => {
    if (!open) return;

    const cached = getCachedInvoiceLogs(invoice.id);
    if (cached) {
      if (cached.status === "error") {
        setError(cached.error);
        setLogs([]);
      } else {
        setLogs(cached.logs);
        setError(null);
      }
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void getDemoInvoiceLogs(invoice.id).then((result) => {
      if (cancelled) return;
      if (result.ok === false) {
        setCachedInvoiceLogs(invoice.id, { status: "error", error: result.error });
        setError(result.error);
        setLogs([]);
      } else {
        setCachedInvoiceLogs(invoice.id, { status: "success", logs: result.logs });
        setLogs(result.logs);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, invoice.id]);

  const completedCount = logs.filter((log) => log.status === "complete").length;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => {
        if (!e.open) onClose();
      }}
      size="lg"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxH="85vh" overflowY="auto">
            <Dialog.Header>
              <Dialog.Title>Invoice history — {invoice.invoice_id}</Dialog.Title>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Dialog.CloseTrigger>
            </Dialog.Header>

            <Dialog.Body>
              <Text color="fg.muted" fontSize="sm" mb={4}>
                {invoice.sme_label} · {invoice.flow_type} · {invoice.on_chain_status}
              </Text>

              {loading && (
                <Stack align="center" py={8}>
                  <Spinner size="sm" />
                  <Text fontSize="sm" color="fg.muted">
                    Loading history…
                  </Text>
                </Stack>
              )}

              {!loading && error && (
                <Text color="red.500" fontSize="sm">
                  {error}
                </Text>
              )}

              {!loading && !error && logs.length === 0 && (
                <Text color="fg.muted" fontSize="sm">
                  No history recorded for this invoice yet.
                </Text>
              )}

              {!loading && !error && logs.length > 0 && (
                <Box css={demoStepStyles}>
                  <Steps.Root
                    orientation="vertical"
                    step={Math.max(0, completedCount - 1)}
                    count={logs.length}
                  >
                  <Steps.List>
                    {logs.map((log, index) => (
                      <Steps.Item key={log.id} index={index}>
                        <Steps.Indicator />
                        <Box flex={1} pb={6}>
                          <Steps.Title>{log.title}</Steps.Title>
                          <Steps.Description>
                            <Text fontSize="sm" color="fg.muted" mt={1}>
                              {log.description}
                            </Text>
                            {log.signature && (
                              <CopyableAddress
                                address={log.signature}
                                kind="tx"
                                //prefix="tx "
                                truncateChars={8}
                                fontSize="xs"
                                //color="pink.500"
                                mt={1}
                              />
                            )}
                            {log.status === "error" && (
                              <Text color="red.500" fontSize="sm" mt={1}>
                                Failed
                              </Text>
                            )}
                          </Steps.Description>
                        </Box>
                        <Steps.Separator />
                      </Steps.Item>
                    ))}
                  </Steps.List>
                  </Steps.Root>
                </Box>
              )}
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
