import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { Role } from "@/types";

const ROLE_HOME: Record<Role, string> = {
  ADMIN:     "/admin/analytics",
  FARMACIA:  "/farmacia/nueva-solicitud",
  COMPRADOR: "/comprador/bandeja",
  PRECIOS:   "/precios/dashboard",
};

export default async function HomePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const role = (session.user as { role?: Role }).role;
  redirect((role && ROLE_HOME[role]) || "/login");
}
