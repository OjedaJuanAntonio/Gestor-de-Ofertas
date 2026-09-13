import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { Role } from "@/types";

// Mapa de rol → ruta de entrada por defecto
const ROLE_HOME: Record<Role, string> = {
  ADMIN:     "/admin/usuarios",
  FARMACIA:  "/farmacia/nueva-solicitud",
  COMPRADOR: "/comprador/bandeja",
  PRECIOS:   "/precios/dashboard",
};

// Esta página raíz solo actúa como dispatcher.
// El middleware ya protege, pero si llega aquí, redirige al módulo correcto.
export default async function HomePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const role = (session.user as any).role as Role;
  redirect(ROLE_HOME[role] ?? "/login");
}
