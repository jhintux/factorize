"use server";

import { createServiceClient } from "@/lib/supabase/server";

export async function searchCompanyByRuc(ruc: string) {
  const supabase = createServiceClient();
  if (!supabase || !ruc.trim()) return null;

  const { data } = await supabase
    .from("companies")
    .select("id, company_name, ruc, about, sector_id, activity_code")
    .eq("ruc", ruc.trim())
    .maybeSingle();

  return data;
}

export async function createCompany(data: {
  company_name: string;
  about?: string;
  ruc: string;
  sector_id: string;
  activity_code: string;
}) {
  const supabase = createServiceClient();
  if (!supabase) return { ok: false as const, error: "configMissing" };

  const { data: row, error } = await supabase
    .from("companies")
    .insert({
      company_name: data.company_name.trim(),
      about: data.about?.trim() ?? null,
      ruc: data.ruc.trim(),
      sector_id: data.sector_id,
      activity_code: data.activity_code,
    })
    .select("id, company_name, ruc")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("companies")
        .select("id, company_name, ruc")
        .eq("ruc", data.ruc.trim())
        .maybeSingle();

      if (existing) {
        return { ok: true as const, company: existing };
      }
    }
    return { ok: false as const, error: "insertFailed" };
  }
  return { ok: true as const, company: row };
}

export async function getSmeProfile(wallet: string) {
  const supabase = createServiceClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("smes")
    .select("id, wallet, company_id, companies(*)")
    .eq("wallet", wallet)
    .maybeSingle();

  return data;
}
