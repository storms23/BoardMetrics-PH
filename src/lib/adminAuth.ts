import "server-only";
import { cookies } from "next/headers";

const COOKIE = "pr_admin";

/** Whether the current request has a valid admin session cookie. */
export async function isAdmin(): Promise<boolean> {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return false;
  const jar = await cookies();
  return jar.get(COOKIE)?.value === secret;
}

export const ADMIN_COOKIE = COOKIE;
