import { cookies } from "next/headers";
import { isValidWallet, truncateWallet } from "@/lib/auth/wallet";

export { isValidWallet, truncateWallet };

export const SESSION_COOKIE = "factorize_session";

export type UserRole = "investor" | "sme" | "admin" | "analyst";

export type SessionData = {
  wallet: string;
  role: UserRole;
  locale: string;
};

export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export async function setSession(data: SessionData) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, JSON.stringify(data), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}