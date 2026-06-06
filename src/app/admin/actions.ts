"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE } from "@/lib/adminAuth";

export async function login(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const secret = process.env.ADMIN_PASSWORD;
  if (secret && password === secret) {
    const jar = await cookies();
    jar.set(ADMIN_COOKIE, secret, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8, // 8 hours
    });
  }
  redirect("/admin");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  redirect("/admin");
}
