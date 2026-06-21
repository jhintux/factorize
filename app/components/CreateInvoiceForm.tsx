"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import NextLink from "next/link";
import {
  Box,
  Button,
  Field,
  Fieldset,
  Flex,
  Input,
  NativeSelect,
  Stack,
  Text,
} from "@chakra-ui/react";
import {
  searchCompanyByRuc,
  createCompany,
} from "@/app/actions/companies";
import { createInvoiceDraft, uploadInvoiceDocument } from "@/app/actions/invoices";
import { useFactorizeClient } from "@/app/hooks/useFactorizeClient";
import {
  findInvoiceVaultPda,
  findSharesPda,
  hashCanonicalInvoice,
  usdcToCanonicalString,
  dateToIso,
} from "@/lib/factorize";
import { getInitInvoiceVaultInstructionAsync } from "@factorize/sdk";
import { findAssociatedTokenPda } from "@solana-program/token";
import { sendInstruction } from "@/lib/factorize/sendInstruction";
import { getUsdcMint, resolveTokenProgramForMint } from "@/lib/factorize/constants";

type ReferenceOption = { id?: string; code?: string; sector_id?: string; name: string };

type CreateInvoiceFormValues = {
  ruc: string;
  payerName: string;
  sectorId: string;
  activityCode: string;
  invoiceNumber: string;
  operationType: "factoring" | "confirming";
  collectionDate: string;
  faceValue: string;
  dueDate: string;
  settleDate: string;
};

const ALLOWED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function InvoiceDocumentPreview({
  file,
  emptyLabel,
  title,
}: {
  file: File | null;
  emptyLabel: string;
  title: string;
}) {
  const previewUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const isImage = file?.type.startsWith("image/");
  const isPdf = file?.type === "application/pdf";

  return (
    <Box
      borderWidth="1px"
      borderColor="border"
      borderRadius="lg"
      bg="bg.subtle"
      overflow="hidden"
      h={{ base: "xs", lg: "xl" }}
    >
      <Box px={4} py={3} borderBottomWidth="1px" borderColor="border">
        <Text fontWeight="medium">{title}</Text>
        {file && (
          <Text fontSize="sm" color="fg.muted" truncate>
            {file.name} · {formatFileSize(file.size)}
          </Text>
        )}
      </Box>

      <Flex
        align="center"
        justify="center"
        h="calc(100% - 4.5rem)"
        p={4}
        bg="bg"
      >
        {!file || !previewUrl ? (
          <Text color="fg.muted" textAlign="center" px={4}>
            {emptyLabel}
          </Text>
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={file.name}
            style={{
              maxHeight: "100%",
              maxWidth: "100%",
              objectFit: "contain",
            }}
          />
        ) : isPdf ? (
          <iframe
            src={previewUrl}
            title={file.name}
            style={{
              width: "100%",
              height: "100%",
              border: 0,
              borderRadius: "var(--chakra-radii-md)",
            }}
          />
        ) : (
          <Text color="fg.muted" textAlign="center" px={4}>
            {file.name}
          </Text>
        )}
      </Flex>
    </Box>
  );
}

export function CreateInvoiceForm({
  locale,
  sectors,
  activities,
}: {
  locale: string;
  sectors: ReferenceOption[];
  activities: ReferenceOption[];
}) {
  const t = useTranslations("sme");
  const { rpc, solanaSigner, isReady } = useFactorizeClient();
  const [payerId, setPayerId] = useState<string | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const usdcMint = getUsdcMint();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateInvoiceFormValues>({
    defaultValues: {
      ruc: "",
      payerName: "",
      sectorId: "",
      activityCode: "",
      invoiceNumber: "",
      operationType: "confirming",
      collectionDate: "",
      faceValue: "",
      dueDate: "",
      settleDate: "",
    },
  });

  const sectorId = watch("sectorId");
  const ruc = watch("ruc");

  const filteredActivities = useMemo(
    () => activities.filter((a) => a.sector_id === sectorId),
    [activities, sectorId],
  );

  const lookupRuc = () => {
    startTransition(async () => {
      const found = await searchCompanyByRuc(ruc);
      if (found) {
        setPayerId(found.id);
        setValue("payerName", found.company_name);
        setValue("sectorId", found.sector_id);
        setValue("activityCode", found.activity_code);
      } else {
        setPayerId(null);
        setValue("payerName", "");
      }
    });
  };

  const onSubmit = (values: CreateInvoiceFormValues) => {
    if (!solanaSigner?.address || !usdcMint) return;

    if (!documentFile) {
      setDocumentError(t("documentRequired"));
      return;
    }
    if (!ALLOWED_DOCUMENT_TYPES.has(documentFile.type)) {
      setDocumentError(t("invalidDocumentType"));
      return;
    }
    if (documentFile.size > MAX_DOCUMENT_BYTES) {
      setDocumentError(t("documentTooLarge"));
      return;
    }

    startTransition(async () => {
      setError(null);
      setDocumentError(null);
      try {
        let companyId = payerId;
        if (!companyId) {
          const existing = await searchCompanyByRuc(values.ruc);
          if (existing) {
            companyId = existing.id;
          } else {
            const created = await createCompany({
              company_name: values.payerName,
              ruc: values.ruc,
              sector_id: values.sectorId,
              activity_code: values.activityCode,
            });
            if (!created.ok) {
              setError(t("createCompanyFailed"));
              return;
            }
            companyId = created.company.id;
          }
        }

        const invoiceId = crypto.randomUUID().replace(/-/g, "");

        const uploadFormData = new FormData();
        uploadFormData.set("invoiceId", invoiceId);
        uploadFormData.set("file", documentFile);
        const uploadResult = await uploadInvoiceDocument(uploadFormData);
        if (!uploadResult.ok) {
          if (uploadResult.error === "invalidType") {
            setDocumentError(t("invalidDocumentType"));
          } else if (uploadResult.error === "tooLarge") {
            setDocumentError(t("documentTooLarge"));
          } else {
            setError(t("uploadFailed"));
          }
          return;
        }

        const face = BigInt(Math.round(Number(values.faceValue) * 1_000_000));
        const advanceDb = 0n;
        const advanceOnChain = face;
        const repayment = face;

        const [vaultPda] = await findInvoiceVaultPda(
          solanaSigner.address,
          invoiceId,
        );
        const [sharesMint] = await findSharesPda(
          solanaSigner.address,
          invoiceId,
        );
        const tokenProgram = await resolveTokenProgramForMint(rpc, usdcMint);
        const [vaultAta] = await findAssociatedTokenPda({
          mint: usdcMint,
          owner: vaultPda,
          tokenProgram,
        });

        const dueTs = Math.floor(new Date(values.dueDate).getTime() / 1000);
        const settleTs = Math.floor(new Date(values.settleDate).getTime() / 1000);
        const instruction = await getInitInvoiceVaultInstructionAsync({
          sme: solanaSigner,
          invoiceVault: vaultPda,
          shares: sharesMint,
          invoiceVaultAta: vaultAta,
          usdcMint,
          tokenProgram,
          advanceAmount: advanceOnChain,
          repaymentAmount: repayment,
          dueDate: BigInt(dueTs),
          settleDate: BigInt(settleTs),
          invoiceId: invoiceId,
        });
        await sendInstruction({ rpc, signer: solanaSigner, instruction });

        const draftResult = await createInvoiceDraft({
          id: invoiceId,
          payer_company_id: companyId!,
          invoice_number: values.invoiceNumber,
          operation_type: values.operationType,
          collection_date: values.collectionDate,
          face_value_usdc: face.toString(),
          advance_amount_usdc: advanceDb.toString(),
          repayment_amount_usdc: repayment.toString(),
          due_date: new Date(values.dueDate).toISOString(),
          settle_date: new Date(values.settleDate).toISOString(),
          document_path: uploadResult.path,
          vault_pda: vaultPda,
          shares_mint: sharesMint,
          seller_wallet: solanaSigner.address,
        });
        if (!draftResult.ok) {
          setError(t("submitFailed"));
          return;
        }

        await hashCanonicalInvoice({
          advance_amount_usdc: usdcToCanonicalString(advanceDb),
          collection_date: values.collectionDate,
          due_date: dateToIso(new Date(values.dueDate)),
          invoice_id: invoiceId,
          invoice_number: values.invoiceNumber,
          operation_type: values.operationType,
          payer_ruc: values.ruc,
          repayment_amount_usdc: usdcToCanonicalString(repayment),
          seller_wallet: solanaSigner.address,
          settle_date: dateToIso(new Date(values.settleDate)),
        });

        globalThis.location.href = `/${locale}/sme/invoices`;
      } catch {
        setError(t("submitFailed"));
      }
    });
  };

  return (
    <Flex
      as="form"
      onSubmit={handleSubmit(onSubmit)}
      direction={{ base: "column", lg: "row" }}
      align={{ base: "stretch", lg: "flex-start" }}
      gap={{ base: 6, lg: 8 }}
      maxW="5xl"
    >
      <Stack flex="1" minW={0} gap={4} maxW={{ base: "full", lg: "xl" }}>
      <Fieldset.Root>
        <Fieldset.Legend>{t("payerSection")}</Fieldset.Legend>
        <Fieldset.Content>
          <Stack gap={4}>
            <Field.Root invalid={!!errors.ruc}>
              <Field.Label htmlFor="ruc">{t("ruc")}</Field.Label>
              <Input id="ruc" {...register("ruc")} />
            </Field.Root>

            <Button
              type="button"
              variant="outline"
              colorPalette="gray"
              alignSelf="flex-start"
              onClick={lookupRuc}
              loading={isPending}
            >
              {t("lookupRuc")}
            </Button>

            {payerId ? (
              <Text color="fg.muted">
                {t("payerFound")}: {watch("payerName")}
              </Text>
            ) : (
              <Stack gap={4}>
                <Field.Root invalid={!!errors.payerName} required>
                  <Field.Label htmlFor="payerName">
                    {t("companyName")}
                  </Field.Label>
                  <Input
                    id="payerName"
                    {...register("payerName", {
                      required: !payerId ? t("companyName") : false,
                    })}
                  />
                  <Field.ErrorText>
                    {errors.payerName?.message}
                  </Field.ErrorText>
                </Field.Root>

                <Field.Root invalid={!!errors.sectorId} required>
                  <Field.Label htmlFor="sector">{t("selectSector")}</Field.Label>
                  <NativeSelect.Root>
                    <NativeSelect.Field
                      id="sector"
                      {...register("sectorId", {
                        required: !payerId ? t("selectSector") : false,
                      })}
                    >
                      <option value="">{t("selectSector")}</option>
                      {sectors.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                  <Field.ErrorText>{errors.sectorId?.message}</Field.ErrorText>
                </Field.Root>

                <Field.Root invalid={!!errors.activityCode} required>
                  <Field.Label htmlFor="activity">
                    {t("selectActivity")}
                  </Field.Label>
                  <NativeSelect.Root>
                    <NativeSelect.Field
                      id="activity"
                      {...register("activityCode", {
                        required: !payerId ? t("selectActivity") : false,
                      })}
                    >
                      <option value="">{t("selectActivity")}</option>
                      {filteredActivities.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.name}
                        </option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                  <Field.ErrorText>
                    {errors.activityCode?.message}
                  </Field.ErrorText>
                </Field.Root>
              </Stack>
            )}
          </Stack>
        </Fieldset.Content>
      </Fieldset.Root>

      <Field.Root invalid={!!errors.invoiceNumber} required>
        <Field.Label htmlFor="invoiceNumber">{t("invoiceNumber")}</Field.Label>
        <Input
          id="invoiceNumber"
          {...register("invoiceNumber", { required: t("invoiceNumber") })}
        />
        <Field.ErrorText>{errors.invoiceNumber?.message}</Field.ErrorText>
      </Field.Root>

      <Field.Root invalid={!!errors.operationType}>
        <Field.Label htmlFor="operationType">{t("operationType")}</Field.Label>
        <NativeSelect.Root>
          <NativeSelect.Field id="operationType" {...register("operationType")}>
            <option value="confirming">{t("confirming")}</option>
            <option value="factoring">{t("factoring")}</option>
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Field.Root>

      <Field.Root invalid={!!errors.collectionDate} required>
        <Field.Label htmlFor="collectionDate">{t("collectionDate")}</Field.Label>
        <Input
          id="collectionDate"
          type="date"
          {...register("collectionDate", { required: t("collectionDate") })}
        />
        <Field.ErrorText>{errors.collectionDate?.message}</Field.ErrorText>
      </Field.Root>

      <Field.Root invalid={!!errors.faceValue} required>
        <Field.Label htmlFor="faceValue">{t("faceValue")}</Field.Label>
        <Input
          id="faceValue"
          type="number"
          step="0.01"
          {...register("faceValue", { required: t("faceValue") })}
        />
        <Field.ErrorText>{errors.faceValue?.message}</Field.ErrorText>
      </Field.Root>

      <Field.Root invalid={!!errors.dueDate} required>
        <Field.Label htmlFor="dueDate">{t("dueDate")}</Field.Label>
        <Input
          id="dueDate"
          type="datetime-local"
          {...register("dueDate", { required: t("dueDate") })}
        />
        <Field.HelperText>{t("dueDateHint")}</Field.HelperText>
        <Field.ErrorText>{errors.dueDate?.message}</Field.ErrorText>
      </Field.Root>

      <Field.Root invalid={!!errors.settleDate} required>
        <Field.Label htmlFor="settleDate">{t("settleDate")}</Field.Label>
        <Input
          id="settleDate"
          type="datetime-local"
          {...register("settleDate", { required: t("settleDate") })}
        />
        <Field.HelperText>{t("settleDateHint")}</Field.HelperText>
        <Field.ErrorText>{errors.settleDate?.message}</Field.ErrorText>
      </Field.Root>

      <Field.Root invalid={!!documentError} required>
        <Field.Label htmlFor="invoiceDocument">{t("invoiceDocument")}</Field.Label>
        <Input
          id="invoiceDocument"
          type="file"
          accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            setDocumentFile(file);
            setDocumentError(null);
          }}
        />
        <Field.HelperText>{t("invoiceDocumentHint")}</Field.HelperText>
        <Field.ErrorText>{documentError}</Field.ErrorText>
      </Field.Root>

      {error && <Text color="red.500">{error}</Text>}

      <Button
        type="submit"
        colorPalette="gray"
        disabled={!isReady}
        loading={isPending}
      >
        {isPending ? t("submitting") : t("createInvoice")}
      </Button>

      <Button
        asChild
        variant="outline"
        colorPalette="gray"
        disabled={isPending}
      >
        <NextLink href={`/${locale}/sme/invoices`}>{t("cancel")}</NextLink>
      </Button>
      </Stack>

      <Box
        flex="1"
        minW={0}
        w={{ base: "full", lg: "sm" }}
        position={{ lg: "sticky" }}
        top={{ lg: 6 }}
      >
        <InvoiceDocumentPreview
          file={documentFile}
          title={t("documentPreview")}
          emptyLabel={t("documentPreviewEmpty")}
        />
      </Box>
    </Flex>
  );
}
