"use client";

import { useAccount, useModal, useWallet } from "@getpara/react-sdk";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { Box, Button, Stack, Text } from "@chakra-ui/react";
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

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 14,
  fontWeight: 500,
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #e5e7eb",
  borderRadius: 4,
  fontSize: 14,
  boxSizing: "border-box",
};

export function SignUpForm({ locale, sectors, activities }: SignUpFormProps) {
  const t = useTranslations("signUp");
  const tc = useTranslations("common");
  const { openModal } = useModal();
  const { isConnected } = useAccount();
  const { data: wallet } = useWallet();
  const [accountType, setAccountType] = useState<AccountType>("investor");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [about, setAbout] = useState("");
  const [ruc, setRuc] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [activityCode, setActivityCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const address = wallet?.address;

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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!address) {
      setError(t("walletRequired"));
      return;
    }

    setError(null);
    startTransition(async () => {
      if (accountType === "investor") {
        const result = await signUpInvestor(address, locale, name);
        handleError(result);
        return;
      }

      const result = await signUpSme(address, locale, {
        company_name: companyName,
        about,
        ruc,
        sector_id: sectorId,
        activity_code: activityCode,
      });
      handleError(result);
    });
  };

  return (
    <Box maxW="560px" mx="auto" px={4} py={12} fontFamily="system-ui, sans-serif">
      <Box mb={6}>
        <LocaleSwitcher />
      </Box>

      <Stack gap={2} textAlign="center" mb={8}>
        <Text fontSize="2xl" fontWeight="bold">
          {t("title")}
        </Text>
        <Text color="gray.600">{t("description")}</Text>
      </Stack>

      {!isConnected ? (
        <Box
          borderWidth="1px"
          borderColor="gray.200"
          p={8}
          textAlign="center"
          bg="white"
        >
          <Button onClick={() => openModal()} width="full" colorPalette="gray">
            {t("connectWallet")}
          </Button>
        </Box>
      ) : (
        <Box as="form" onSubmit={handleSubmit}>
          <Stack gap={4}>
            <Box
              borderWidth="1px"
              borderColor="gray.200"
              p={4}
              bg="gray.50"
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
                onClick={() => setAccountType("investor")}
              >
                {t("investor")}
              </Button>
              <Button
                type="button"
                flex={1}
                variant={accountType === "enterprise" ? "solid" : "outline"}
                colorPalette="gray"
                onClick={() => setAccountType("enterprise")}
              >
                {t("enterprise")}
              </Button>
            </Stack>

            {accountType === "investor" ? (
              <div>
                <label style={labelStyle} htmlFor="name">
                  {t("nameOptional")}
                </label>
                <input
                  id="name"
                  style={inputStyle}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                  {t("nameHint")}
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label style={labelStyle} htmlFor="companyName">
                    {t("companyName")}
                  </label>
                  <input
                    id="companyName"
                    style={inputStyle}
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="about">
                    {t("about")}
                  </label>
                  <textarea
                    id="about"
                    style={{ ...inputStyle, minHeight: 96 }}
                    value={about}
                    onChange={(e) => setAbout(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="ruc">
                    {t("ruc")}
                  </label>
                  <input
                    id="ruc"
                    style={inputStyle}
                    value={ruc}
                    onChange={(e) => setRuc(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="sector">
                    {t("sector")}
                  </label>
                  <select
                    id="sector"
                    style={inputStyle}
                    value={sectorId}
                    onChange={(e) => {
                      setSectorId(e.target.value);
                      setActivityCode("");
                    }}
                    required
                  >
                    <option value="">{t("selectSector")}</option>
                    {sectors.map((sector) => (
                      <option key={sector.id} value={sector.id}>
                        {sector.id}: {sector.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle} htmlFor="activity">
                    {t("activity")}
                  </label>
                  <select
                    id="activity"
                    style={inputStyle}
                    value={activityCode}
                    onChange={(e) => setActivityCode(e.target.value)}
                    required
                    disabled={!sectorId}
                  >
                    <option value="">{t("selectActivity")}</option>
                    {filteredActivities.map((activity) => (
                      <option key={activity.code} value={activity.code}>
                        {activity.code}: {activity.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {error && (
              <Text color="red.600" fontSize="sm">
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

      <Text textAlign="center" mt={6} color="gray.600">
        <Link href={`/${locale}`}>{t("loginLink")}</Link>
      </Text>
    </Box>
  );
}
