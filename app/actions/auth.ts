"use server";

import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import {
  isValidWallet,
  setSession,
  truncateWallet,
  type UserRole,
} from "@/lib/auth/session";
import { isValidLocale } from "@/i18n/config";
import {
  getWalletAdminStatus,
  isPlatformAdmin,
} from "@/lib/auth/admin";
import { isAnalystWhitelistedOnChain } from "@/lib/factorize/protocolState";

export type AuthResult =
  | { ok: true; role: UserRole }
  | { ok: false; error: string };

export async function loginByWallet(
  wallet: string,
  locale: string,
): Promise<AuthResult> {
  if (!isValidLocale(locale)) {
    return { ok: false, error: "invalidLocale" };
  }

  if (!isValidWallet(wallet)) {
    return { ok: false, error: "invalidWallet" };
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return { ok: false, error: "configMissing" };
  }

  if (await isPlatformAdmin(wallet)) {
    await setSession({ wallet, role: "admin", locale });
    redirect(`/${locale}/admin/assessments`);
  }

  const { data: investor } = await supabase
    .from("investors")
    .select("id")
    .eq("wallet", wallet)
    .maybeSingle();

  if (investor) {
    await setSession({ wallet, role: "investor", locale });
    redirect(`/${locale}/investor/invoices`);
  }

  const { data: sme } = await supabase
    .from("smes")
    .select("id")
    .eq("wallet", wallet)
    .maybeSingle();

  if (sme) {
    await setSession({ wallet, role: "sme", locale });
    redirect(`/${locale}/sme/invoices`);
  }

  if (await isAnalystWhitelistedOnChain(wallet)) {
    await setSession({ wallet, role: "analyst", locale });
    redirect(`/${locale}/admin/assessments`);
  }

  const displayName = truncateWallet(wallet);
  const { error } = await supabase.from("investors").insert({
    name: displayName,
    wallet,
  });

  if (error) {
    return { ok: false, error: "insertFailed" };
  }

  await setSession({ wallet, role: "investor", locale });
  redirect(`/${locale}/investor/invoices`);
}

export async function signUpInvestor(
  wallet: string,
  locale: string,
  name?: string,
): Promise<AuthResult> {
  if (!isValidLocale(locale)) {
    return { ok: false, error: "invalidLocale" };
  }

  if (!isValidWallet(wallet)) {
    return { ok: false, error: "invalidWallet" };
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return { ok: false, error: "configMissing" };
  }

  const { data: existingInvestor } = await supabase
    .from("investors")
    .select("id")
    .eq("wallet", wallet)
    .maybeSingle();

  const { data: existingSme } = await supabase
    .from("smes")
    .select("id")
    .eq("wallet", wallet)
    .maybeSingle();

  if (existingInvestor || existingSme) {
    return { ok: false, error: "alreadyRegistered" };
  }

  const displayName = name?.trim() || truncateWallet(wallet);

  const { error } = await supabase.from("investors").insert({
    name: displayName,
    wallet,
  });

  if (error) {
    return { ok: false, error: "insertFailed" };
  }

  await setSession({ wallet, role: "investor", locale });
  redirect(`/${locale}/investor/invoices`);
}

export async function signUpSme(
  wallet: string,
  locale: string,
  data: {
    company_name: string;
    about: string;
    ruc: string;
    sector_id: string;
    activity_code: string;
  },
): Promise<AuthResult> {
  if (!isValidLocale(locale)) {
    return { ok: false, error: "invalidLocale" };
  }

  if (!isValidWallet(wallet)) {
    return { ok: false, error: "invalidWallet" };
  }

  const { company_name, about, ruc, sector_id, activity_code } = data;

  if (
    !company_name?.trim() ||
    !about?.trim() ||
    !ruc?.trim() ||
    !sector_id ||
    !activity_code
  ) {
    return { ok: false, error: "missingFields" };
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return { ok: false, error: "configMissing" };
  }

  const { data: existingInvestor } = await supabase
    .from("investors")
    .select("id")
    .eq("wallet", wallet)
    .maybeSingle();

  const { data: existingSme } = await supabase
    .from("smes")
    .select("id")
    .eq("wallet", wallet)
    .maybeSingle();

  if (existingInvestor || existingSme) {
    return { ok: false, error: "alreadyRegistered" };
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .insert({
      company_name: company_name.trim(),
      about: about.trim(),
      ruc: ruc.trim(),
      sector_id,
      activity_code,
      wallet,
    })
    .select("id")
    .single();

  if (companyError || !company) {
    return { ok: false, error: "insertFailed" };
  }

  const { error } = await supabase.from("smes").insert({
    wallet,
    company_id: company.id,
  });

  if (error) {
    return { ok: false, error: "insertFailed" };
  }

  await setSession({ wallet, role: "sme", locale });
  redirect(`/${locale}/sme/invoices`);
}

export async function getSectorsAndActivities(locale: string) {
  const supabase = createServiceClient();
  if (!supabase) {
    return { sectors: [], activities: [] };
  }

  const nameField = locale === "es" ? "name_es" : "name_en";

  const [{ data: sectors }, { data: activities }] = await Promise.all([
    supabase.from("sectors").select("id, name_es, name_en").order("id"),
    supabase
      .from("activities")
      .select("code, sector_id, name_es, name_en")
      .order("code"),
  ]);

  return {
    sectors:
      sectors?.map((s) => ({
        id: s.id,
        name: s[nameField as "name_es" | "name_en"],
      })) ?? [],
    activities:
      activities?.map((a) => ({
        code: a.code,
        sector_id: a.sector_id,
        name: a[nameField as "name_es" | "name_en"],
      })) ?? [],
  };
}

export async function getWalletLoginStatus(wallet: string) {
  if (!isValidWallet(wallet)) {
    return { ok: false as const, error: "invalidWallet" };
  }

  return { ok: true as const, status: await getWalletAdminStatus(wallet) };
}
