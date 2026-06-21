"use client";

import { useAccount, useModal, useWallet } from "@getpara/react-sdk";
import NextLink from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import {
  Box,
  Button,
  Field,
  Fieldset,
  Input,
  Link,
  NativeSelect,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import {
  signUpInvestor,
  signUpSme,
  type AuthResult,
} from "@/app/actions/auth";
import { LocaleSwitcher } from "@/app/components/LocaleSwitcher";

type ReferenceOption = {
  id?: string;
  code?: string;
  sector_id?: string;
  name: string;
};

type SignUpFormProps = {
  locale: string;
  sectors: ReferenceOption[];
  activities: ReferenceOption[];
};

type AccountType = "investor" | "enterprise";

type SignUpFormValues = {
  accountType: AccountType;
  name: string;
  companyName: string;
  about: string;
  ruc: string;
  sectorId: string;
  activityCode: string;
};

export function SignUpForm({ locale, sectors, activities }: SignUpFormProps) {
  const t = useTranslations("signUp");
  const tc = useTranslations("common");
  const { openModal } = useModal();
  const { isConnected } = useAccount();
  const { data: wallet } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const address = wallet?.address;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SignUpFormValues>({
    defaultValues: {
      accountType: "investor",
      name: "",
      companyName: "",
      about: "",
      ruc: "",
      sectorId: "",
      activityCode: "",
    },
  });

  const accountType = watch("accountType");
  const sectorId = watch("sectorId");

  const filteredActivities = useMemo(
    () => activities.filter((a) => a.sector_id === sectorId),
    [activities, sectorId],
  );

  const handleError = (result: AuthResult) => {
    if (result.ok === true) return;
    if (result.error === "alreadyRegistered") {
      setError(t("alreadyRegistered"));
    } else {
      setError(tc("error"));
    }
  };

  const onSubmit = (values: SignUpFormValues) => {
    if (!address) {
      setError(t("walletRequired"));
      return;
    }

    setError(null);
    startTransition(async () => {
      if (values.accountType === "investor") {
        const result = await signUpInvestor(address, locale, values.name);
        handleError(result);
        return;
      }

      const result = await signUpSme(address, locale, {
        company_name: values.companyName,
        about: values.about,
        ruc: values.ruc,
        sector_id: values.sectorId,
        activity_code: values.activityCode,
      });
      handleError(result);
    });
  };

  return (
    <Box maxW="560px" mx="auto" px={4} py={12}>
      <Box mb={6}>
        <LocaleSwitcher />
      </Box>

      <Stack gap={2} textAlign="center" mb={8}>
        <Text fontSize="2xl" fontWeight="bold">
          {t("title")}
        </Text>
        <Text color="fg.muted">{t("description")}</Text>
      </Stack>

      {!isConnected ? (
        <Box
          borderWidth="1px"
          borderColor="border.subtle"
          rounded="lg"
          p={8}
          textAlign="center"
          bg="bg"
        >
          <Button onClick={() => openModal()} width="full" colorPalette="gray">
            {t("connectWallet")}
          </Button>
        </Box>
      ) : (
        <Box as="form" onSubmit={handleSubmit(onSubmit)}>
          <Stack gap={4}>
            <Box
              borderWidth="1px"
              borderColor="border.subtle"
              rounded="md"
              p={4}
              bg="bg.subtle"
              fontFamily="mono"
              fontSize="sm"
              wordBreak="break-all"
            >
              {address}
            </Box>

            <Stack direction="row" gap={2}>
              <Button
                type="button"
                flex={1}
                variant={accountType === "investor" ? "solid" : "outline"}
                colorPalette="gray"
                onClick={() => setValue("accountType", "investor")}
              >
                {t("investor")}
              </Button>
              <Button
                type="button"
                flex={1}
                variant={accountType === "enterprise" ? "solid" : "outline"}
                colorPalette="gray"
                onClick={() => setValue("accountType", "enterprise")}
              >
                {t("enterprise")}
              </Button>
            </Stack>

            {accountType === "investor" ? (
              <Field.Root>
                <Field.Label htmlFor="name">{t("nameOptional")}</Field.Label>
                <Input id="name" {...register("name")} />
                <Field.HelperText>{t("nameHint")}</Field.HelperText>
              </Field.Root>
            ) : (
              <Fieldset.Root>
                <Fieldset.Content>
                  <Stack gap={4}>
                    <Field.Root invalid={!!errors.companyName} required>
                      <Field.Label htmlFor="companyName">
                        {t("companyName")}
                      </Field.Label>
                      <Input
                        id="companyName"
                        {...register("companyName", {
                          required: t("companyName"),
                        })}
                      />
                      <Field.ErrorText>
                        {errors.companyName?.message}
                      </Field.ErrorText>
                    </Field.Root>

                    <Field.Root invalid={!!errors.about} required>
                      <Field.Label htmlFor="about">{t("about")}</Field.Label>
                      <Textarea
                        id="about"
                        minH="24"
                        {...register("about", { required: t("about") })}
                      />
                      <Field.ErrorText>{errors.about?.message}</Field.ErrorText>
                    </Field.Root>

                    <Field.Root invalid={!!errors.ruc} required>
                      <Field.Label htmlFor="ruc">{t("ruc")}</Field.Label>
                      <Input
                        id="ruc"
                        {...register("ruc", { required: t("ruc") })}
                      />
                      <Field.ErrorText>{errors.ruc?.message}</Field.ErrorText>
                    </Field.Root>

                    <Field.Root invalid={!!errors.sectorId} required>
                      <Field.Label htmlFor="sector">{t("sector")}</Field.Label>
                      <NativeSelect.Root>
                        <NativeSelect.Field
                          id="sector"
                          {...register("sectorId", {
                            required: t("sector"),
                            onChange: () => setValue("activityCode", ""),
                          })}
                        >
                          <option value="">{t("selectSector")}</option>
                          {sectors.map((sector) => (
                            <option key={sector.id} value={sector.id}>
                              {sector.id}: {sector.name}
                            </option>
                          ))}
                        </NativeSelect.Field>
                        <NativeSelect.Indicator />
                      </NativeSelect.Root>
                      <Field.ErrorText>
                        {errors.sectorId?.message}
                      </Field.ErrorText>
                    </Field.Root>

                    <Field.Root invalid={!!errors.activityCode} required>
                      <Field.Label htmlFor="activity">
                        {t("activity")}
                      </Field.Label>
                      <NativeSelect.Root>
                        <NativeSelect.Field
                          id="activity"
                          disabled={!sectorId}
                          {...register("activityCode", {
                            required: t("activity"),
                          })}
                        >
                          <option value="">{t("selectActivity")}</option>
                          {filteredActivities.map((activity) => (
                            <option key={activity.code} value={activity.code}>
                              {activity.code}: {activity.name}
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
                </Fieldset.Content>
              </Fieldset.Root>
            )}

            {error && (
              <Text color="red.500" fontSize="sm">
                {error}
              </Text>
            )}

            <Button
              type="submit"
              width="full"
              colorPalette="gray"
              loading={isPending}
            >
              {tc("submit")}
            </Button>
          </Stack>
        </Box>
      )}

      <Text textAlign="center" mt={6} color="fg.muted">
        <Link asChild>
          <NextLink href={`/${locale}`}>{t("loginLink")}</NextLink>
        </Link>
      </Text>
    </Box>
  );
}
