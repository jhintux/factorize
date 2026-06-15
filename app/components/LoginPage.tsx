"use client";

import { useAccount, useModal, useWallet } from "@getpara/react-sdk";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { loginByWallet } from "@/app/actions/auth";
import { LocaleSwitcher } from "@/app/components/LocaleSwitcher";

const cardStyle: React.CSSProperties = {
  maxWidth: 480,
  margin: "0 auto",
  border: "1px solid #e5e5e5",
  padding: 32,
  textAlign: "center",
  background: "#fff",
};

const buttonStyle: React.CSSProperties = {
  padding: "12px 24px",
  background: "#111",
  color: "#fff",
  border: "none",
  cursor: "pointer",
  fontWeight: 500,
  width: "100%",
};

const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "#f3f4f6",
  color: "#374151",
  marginTop: 8,
};

export function LoginPage({ locale }: { locale: string }) {
  const t = useTranslations("login");
  const tc = useTranslations("common");
  const { openModal } = useModal();
  const { isConnected } = useAccount();
  const { data: wallet } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const address = wallet?.address;

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
    <main style={{ padding: "48px 16px", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ marginBottom: 24 }}>
        <LocaleSwitcher />
      </div>

      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
          {t("title")}
        </h1>
        <p style={{ color: "#6b7280", maxWidth: 560, margin: "0 auto" }}>
          {t("description")}
        </p>
      </div>

      {!isConnected ? (
        <div style={cardStyle}>
          <button
            type="button"
            onClick={() => openModal()}
            style={buttonStyle}
          >
            {t("connectButton")}
          </button>
        </div>
      ) : (
        <div style={cardStyle}>
          <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 4 }}>
            {t("connectedAs")}
          </p>
          <p
            style={{
              fontFamily: "ui-monospace, monospace",
              fontSize: 14,
              wordBreak: "break-all",
              marginBottom: 16,
            }}
          >
            {address ?? tc("loading")}
          </p>
          <button
            type="button"
            onClick={handleContinue}
            disabled={isPending || !address}
            style={{
              ...buttonStyle,
              opacity: isPending ? 0.6 : 1,
            }}
          >
            {isPending ? tc("loading") : t("continueButton")}
          </button>
          <button
            type="button"
            onClick={() => openModal()}
            style={secondaryButtonStyle}
          >
            {t("manageWallet")}
          </button>
          {error && (
            <p style={{ color: "#dc2626", marginTop: 12, fontSize: 14 }}>
              {error}
            </p>
          )}
        </div>
      )}

      <p style={{ textAlign: "center", marginTop: 24, color: "#6b7280" }}>
        {t("signUpPrompt")}{" "}
        <Link href={`/${locale}/sign-up`} style={{ color: "#111" }}>
          {t("signUpLink")}
        </Link>
      </p>
    </main>
  );
}
