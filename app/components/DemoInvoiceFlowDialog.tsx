"use client";

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  Badge,
  Box,
  Button,
  CloseButton,
  Dialog,
  Portal,
  Stack,
  Steps,
  Text,
} from "@chakra-ui/react";
import {
  computeFundingPlan,
  getSecondsUntilChain,
  prepareDemoSettleFunds,
  saveDemoInvoiceLog,
  startDemoInvoiceFlow,
  stepAssessDemoInvoice,
  stepClaimDemoInvestment,
  stepClaimDemoInvoiceAdvance,
  stepFundDemoInvoice,
  stepInitDemoInvoiceVault,
  stepSettleDemoInvoice,
  stepSyncDemoInvoiceStatus,
  type DemoFlowContext,
  type DemoFlowType,
} from "@/app/actions/demoInvoices";
import type { DemoSmeEntry } from "@/app/actions/demo";
import { CopyableAddress } from "@/app/components/CopyableAddress";
import { demoStepStyles } from "@/app/components/demoStepStyles";
import {
  DEMO_INVESTOR_MIN_LAMPORTS,
  formatSol,
} from "@/lib/factorize/demoSolBudget";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapStepResult(
  result: Awaited<ReturnType<typeof stepInitDemoInvoiceVault>>,
) {
  if (result.ok === false) return { ok: false as const, error: result.error };
  return {
    ok: true as const,
    signature: result.signature,
    detail: result.detail,
    invoiceDemoId: result.invoiceDemoId,
  };
}

type StepRunResult =
  | { ok: true; signature?: string; detail: string; invoiceDemoId?: string }
  | { ok: false; error: string };

type FlowStep = {
  title: string;
  description: string;
  signature?: string;
  status: "pending" | "running" | "complete" | "error";
};

function formatUsdc(raw: string) {
  const amount = BigInt(raw);
  const whole = amount / 1_000_000n;
  const fraction = amount % 1_000_000n;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(6, "0").replace(/0+$/, "")}`;
}

async function runStep(
  index: number,
  title: string,
  runner: () => Promise<StepRunResult>,
  setSteps: Dispatch<SetStateAction<FlowStep[]>>,
  persistLog?: (
    title: string,
    result: StepRunResult,
    description: string,
  ) => Promise<void>,
) {
  setSteps((prev) => {
    const next = [...prev];
    next[index] = { ...next[index], status: "running" };
    return next;
  });

  const result = await runner();

  setSteps((prev) => {
    const updated = [...prev];
    if (result.ok === false) {
      updated[index] = {
        ...updated[index],
        status: "error",
        description: result.error,
      };
      return updated;
    }

    updated[index] = {
      ...updated[index],
      status: "complete",
      description: result.detail,
      signature: result.signature,
    };
    return updated;
  });

  if (persistLog) {
    const description =
      result.ok === false ? result.error : result.detail;
    await persistLog(title, result, description);
  }

  if (result.ok === false) throw new Error(result.error);
  return result;
}

async function waitStep(
  index: number,
  title: string,
  seconds: number,
  reason: string,
  setSteps: Dispatch<SetStateAction<FlowStep[]>>,
  persistLog?: (title: string, description: string) => Promise<void>,
) {
  setSteps((prev) => {
    const next = [...prev];
    next[index] = {
      ...next[index],
      status: "running",
      description: `Waiting ${seconds}s — ${reason}`,
    };
    return next;
  });

  for (let remaining = seconds; remaining > 0; remaining -= 1) {
    await sleep(1000);
    setSteps((prev) => {
      const tick = [...prev];
      tick[index] = {
        ...tick[index],
        description: `Waiting ${remaining}s — ${reason}`,
      };
      return tick;
    });
  }

  setSteps((prev) => {
    const done = [...prev];
    done[index] = {
      ...done[index],
      status: "complete",
      description: `Wait finished — ${reason}`,
    };
    return done;
  });

  if (persistLog) {
    await persistLog(title, `Wait finished — ${reason}`);
  }
}

export function DemoInvoiceFlowDialog({
  sme,
  open,
  onClose,
  onComplete,
}: {
  sme: DemoSmeEntry;
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [phase, setPhase] = useState<"pick" | "running" | "done">("pick");
  const [flowType, setFlowType] = useState<DemoFlowType | null>(null);
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);

  const reset = useCallback(() => {
    setPhase("pick");
    setFlowType(null);
    setSteps([]);
    setActiveStep(0);
    setError(null);
  }, []);

  const handleClose = () => {
    if (phase === "done") onComplete();
    reset();
    onClose();
  };

  const runFlow = async (selected: DemoFlowType) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setError(null);
    setFlowType(selected);
    setPhase("running");

    const started = await startDemoInvoiceFlow({
      smeDemoId: sme.id,
      flowType: selected,
    });

    if (started.ok === false) {
      setError(started.error);
      setPhase("pick");
      runningRef.current = false;
      return;
    }

    const context: DemoFlowContext = started.context;
    const fundingPlan = await computeFundingPlan(context);

    const plannedSteps: FlowStep[] = [
      {
        title: "Register demo invoice",
        description: `Planned · repayment ${formatUsdc(context.repaymentAmount)} USDC · advance ${formatUsdc(context.advanceAmount)} USDC (${Math.round(Number((BigInt(context.advanceAmount) * 100n) / BigInt(context.repaymentAmount)))}%) · due +60s · settle +${selected === "default" ? "75" : selected === "settle" ? "240" : "90"}s (chain clock)`,
        status: "pending",
      },
      {
        title: "init_invoice_vault",
        description: "Creating on-chain InvoiceVault, shares mint, and USDC escrow ATA…",
        status: "pending",
      },
      {
        title: "assess_invoice_risk",
        description: "Whitelisted analyst publishes invoice_hash attestation…",
        status: "pending",
      },
      ...fundingPlan.map((plan, i) => ({
        title: `fund_invoice (${i + 1}/${fundingPlan.length})`,
        description: `Investor SME deposits ${formatUsdc(plan.amount)} USDC · mints shares`,
        status: "pending" as const,
      })),
    ];

    if (selected === "settle") {
      plannedSteps.push(
        {
          title: "claim_invoice",
          description: "SME withdraws funded advance from vault escrow…",
          status: "pending",
        },
        {
          title: "settle_invoice",
          description:
            "Server waits for settle window, then SME repays · protocol fee → treasury · status → Settled",
          status: "pending",
        },
        ...fundingPlan.map((plan, i) => ({
          title: `claim_investment (${i + 1}/${fundingPlan.length})`,
          description: `Investor burns shares · receives proportional USDC payout`,
          status: "pending" as const,
        })),
      );
    } else if (selected === "expire") {
      plannedSteps.push(
        {
          title: "Wait for due_date",
          description: "Funding window ends while invoice is underfunded…",
          status: "pending",
        },
        {
          title: "sync_invoice_status",
          description: "Keeper transitions Funding → Expired (past due_date, underfunded)",
          status: "pending",
        },
        {
          title: "claim_investment (refund)",
          description: "Investor burns shares · receives USDC refund from vault",
          status: "pending",
        },
      );
    } else {
      plannedSteps.push(
        {
          title: "claim_invoice",
          description: "SME withdraws advance · status stays InProgress",
          status: "pending",
        },
        {
          title: "Wait for settle_date",
          description: "Debtor repayment deadline passes on devnet…",
          status: "pending",
        },
        {
          title: "sync_invoice_status",
          description: "Keeper transitions InProgress → Defaulted (past settle_date)",
          status: "pending",
        },
      );
    }

    setSteps(plannedSteps);
    setActiveStep(1);

    const persistTxLog = async (
      stepOrder: number,
      title: string,
      result: StepRunResult,
      description: string,
    ) => {
      if (!context.invoiceDemoId) return;
      await saveDemoInvoiceLog({
        invoiceDemoId: context.invoiceDemoId,
        stepOrder,
        title,
        description,
        signature: result.ok ? result.signature : undefined,
        status: result.ok ? "complete" : "error",
      });
    };

    const persistWaitLog = async (
      stepOrder: number,
      title: string,
      description: string,
    ) => {
      if (!context.invoiceDemoId) return;
      await saveDemoInvoiceLog({
        invoiceDemoId: context.invoiceDemoId,
        stepOrder,
        title,
        description,
        status: "complete",
      });
    };

    try {
      let stepIndex = 1;

      const initResult = await runStep(
        stepIndex,
        "init_invoice_vault",
        async () => mapStepResult(await stepInitDemoInvoiceVault(context)),
        setSteps,
        async (title, result, description) => {
          if (result.ok && result.invoiceDemoId) {
            context.invoiceDemoId = result.invoiceDemoId;
          }
          await persistTxLog(stepIndex, title, result, description);
        },
      );
      if (initResult.ok && initResult.invoiceDemoId) {
        context.invoiceDemoId = initResult.invoiceDemoId;
      }
      const registerDescription = `On-chain vault initialized · invoice ${context.invoiceId.slice(0, 16)}…`;
      setSteps((prev) => {
        const next = [...prev];
        next[0] = {
          ...next[0],
          status: "complete",
          description: registerDescription,
        };
        return next;
      });
      if (context.invoiceDemoId) {
        await saveDemoInvoiceLog({
          invoiceDemoId: context.invoiceDemoId,
          stepOrder: 0,
          title: "Register demo invoice",
          description: registerDescription,
          status: "complete",
        });
      }
      stepIndex += 1;
      setActiveStep(stepIndex);

      await runStep(
        stepIndex,
        "assess_invoice_risk",
        async () => mapStepResult(await stepAssessDemoInvoice(context)),
        setSteps,
        (title, result, description) =>
          persistTxLog(stepIndex, title, result, description),
      );
      stepIndex += 1;
      setActiveStep(stepIndex);

      for (const plan of fundingPlan) {
        const fundIndex = fundingPlan.indexOf(plan);
        const fundTitle = `fund_invoice (${fundIndex + 1}/${fundingPlan.length})`;
        await runStep(
          stepIndex,
          fundTitle,
          async () =>
            mapStepResult(
              await stepFundDemoInvoice({
                context,
                investorSmeId: plan.smeId,
                fundAmount: plan.amount,
              }),
            ),
          setSteps,
          (title, result, description) =>
            persistTxLog(stepIndex, title, result, description),
        );
        stepIndex += 1;
        setActiveStep(stepIndex);
      }

      if (selected === "settle") {
        await runStep(
          stepIndex,
          "claim_invoice",
          async () => mapStepResult(await stepClaimDemoInvoiceAdvance(context)),
          setSteps,
          (title, result, description) =>
            persistTxLog(stepIndex, title, result, description),
        );
        stepIndex += 1;
        setActiveStep(stepIndex);

        const prepared = await prepareDemoSettleFunds(context);
        if (prepared.ok === false) {
          throw new Error(prepared.error);
        }

        await runStep(
          stepIndex,
          "settle_invoice",
          async () => mapStepResult(await stepSettleDemoInvoice(context)),
          setSteps,
          (title, result, description) =>
            persistTxLog(stepIndex, title, result, description),
        );
        stepIndex += 1;
        setActiveStep(stepIndex);

        for (const plan of fundingPlan) {
          const claimIndex = fundingPlan.indexOf(plan);
          const claimTitle = `claim_investment (${claimIndex + 1}/${fundingPlan.length})`;
          await runStep(
            stepIndex,
            claimTitle,
            async () =>
              mapStepResult(
                await stepClaimDemoInvestment({
                  context,
                  investorSmeId: plan.smeId,
                  shareAmount: plan.amount,
                }),
              ),
            setSteps,
            (title, result, description) =>
              persistTxLog(stepIndex, title, result, description),
          );
          stepIndex += 1;
          setActiveStep(stepIndex);
        }
      } else if (selected === "expire") {
        const waitDue = await getSecondsUntilChain(context.dueDate);
        await waitStep(
          stepIndex,
          "Wait for due_date",
          waitDue,
          "due_date reached — funding window closed with partial deposits",
          setSteps,
          (title, description) => persistWaitLog(stepIndex, title, description),
        );
        stepIndex += 1;
        setActiveStep(stepIndex);

        await runStep(
          stepIndex,
          "sync_invoice_status",
          async () => mapStepResult(await stepSyncDemoInvoiceStatus(context)),
          setSteps,
          (title, result, description) =>
            persistTxLog(stepIndex, title, result, description),
        );
        stepIndex += 1;
        setActiveStep(stepIndex);

        const plan = fundingPlan[0];
        await runStep(
          stepIndex,
          "claim_investment (refund)",
          async () =>
            mapStepResult(
              await stepClaimDemoInvestment({
                context,
                investorSmeId: plan.smeId,
                shareAmount: plan.amount,
              }),
            ),
          setSteps,
          (title, result, description) =>
            persistTxLog(stepIndex, title, result, description),
        );
      } else {
        await runStep(
          stepIndex,
          "claim_invoice",
          async () => mapStepResult(await stepClaimDemoInvoiceAdvance(context)),
          setSteps,
          (title, result, description) =>
            persistTxLog(stepIndex, title, result, description),
        );
        stepIndex += 1;
        setActiveStep(stepIndex);

        const waitSettle = await getSecondsUntilChain(context.settleDate);
        await waitStep(
          stepIndex,
          "Wait for settle_date",
          waitSettle,
          "settle_date reached — invoice becomes eligible for default sync",
          setSteps,
          (title, description) => persistWaitLog(stepIndex, title, description),
        );
        stepIndex += 1;
        setActiveStep(stepIndex);

        await runStep(
          stepIndex,
          "sync_invoice_status",
          async () => mapStepResult(await stepSyncDemoInvoiceStatus(context)),
          setSteps,
          (title, result, description) =>
            persistTxLog(stepIndex, title, result, description),
        );
      }

      setPhase("done");
      setActiveStep(plannedSteps.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Flow failed");
      setPhase("done");
    } finally {
      runningRef.current = false;
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => {
        if (!e.open) handleClose();
      }}
      size="lg"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxH="85vh" overflowY="auto">
            <Dialog.Header>
              <Dialog.Title>
                Invoice demo — {sme.label}
              </Dialog.Title>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Dialog.CloseTrigger>
            </Dialog.Header>

            <Dialog.Body>
              {phase === "pick" && (
                <Stack gap={4}>
                  <Text color="fg.muted" fontSize="sm">
                    Pick a lifecycle path. Each runs real devnet transactions using
                    demo SME keypairs stored in Supabase. Prefund wallets on devnet
                    first — issuer min {sme.minSolRequiredFormatted} SOL, investor
                    min {formatSol(DEMO_INVESTOR_MIN_LAMPORTS)} SOL (account rent +
                    0.00008 SOL per tx). Timestamps use devnet validator clock (due_date
                    +60s, settle_date +180s after due on happy path).
                  </Text>
                  {!sme.canInitInvoice && (
                    <Text color="red.500" fontSize="sm">
                      {sme.solBalanceLamports === "0"
                        ? `${sme.label} has 0 SOL — prefund this wallet on devnet before running a flow.`
                        : `${sme.label} has ${sme.solBalanceFormatted} SOL but needs at least ${sme.minSolRequiredFormatted} SOL to start.`}
                    </Text>
                  )}
                  <Stack gap={2}>
                    <Button
                      disabled={!sme.canInitInvoice}
                      onClick={() => void runFlow("settle")}
                    >
                      Create and Settle (Happy path)
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!sme.canInitInvoice}
                      onClick={() => void runFlow("expire")}
                    >
                      Create and Expire
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!sme.canInitInvoice}
                      onClick={() => void runFlow("default")}
                    >
                      Create and Default
                    </Button>
                  </Stack>
                  {error && (
                    <Text color="red.500" fontSize="sm">
                      {error}
                    </Text>
                  )}
                </Stack>
              )}

              {(phase === "running" || phase === "done") && (
                <Stack gap={4}>
                  {flowType && (
                    <Badge alignSelf="flex-start">
                      {flowType === "settle"
                        ? "Happy path"
                        : flowType === "expire"
                          ? "Expire path"
                          : "Default path"}
                    </Badge>
                  )}

                  <Box css={demoStepStyles}>
                    <Steps.Root
                      orientation="vertical"
                      step={activeStep}
                      count={steps.length}
                    >
                    <Steps.List>
                      {steps.map((step, index) => (
                        <Steps.Item key={`${step.title}-${index}`} index={index}>
                          <Steps.Indicator />
                          <Box flex={1} pb={6}>
                            <Steps.Title>{step.title}</Steps.Title>
                            <Steps.Description>
                              <Text fontSize="sm" color="fg.muted" mt={1}>
                                {step.description}
                              </Text>
                              {step.signature && (
                                <CopyableAddress
                                  address={step.signature}
                                  kind="tx"
                                  truncateChars={8}
                                  fontSize="xs"
                                  mt={1}
                                />
                              )}
                              {step.status === "error" && (
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

                  {phase === "done" && !error && (
                    <Text fontSize="sm" color="green.600">
                      Flow complete. Close this dialog to refresh the invoice list.
                    </Text>
                  )}
                  {error && (
                    <Text color="red.500" fontSize="sm">
                      {error}
                    </Text>
                  )}
                </Stack>
              )}
            </Dialog.Body>

            {phase === "done" && (
              <Dialog.Footer>
                <Button onClick={handleClose}>Close</Button>
              </Dialog.Footer>
            )}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
