import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { getBadgeCounts } from "@/lib/data/badges";
import type { Role } from "@/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const { id, role, nombre, email } = session.user as {
    id: string;
    role: Role;
    nombre: string;
    email: string;
  };

  const counts = await getBadgeCounts(role, id);
  const badges: Record<string, number> = {};
  if (counts.compradorPendientes) badges["/comprador/bandeja"] = counts.compradorPendientes;
  if (counts.preciosPendientes) badges["/precios/dashboard"] = counts.preciosPendientes;
  if (counts.emailsDead) badges["/admin/correos"] = counts.emailsDead;
  if (counts.adminSinAsignar) badges["/admin/sin-asignar"] = counts.adminSinAsignar;
  if (counts.testersPendientes) badges["/comprador/testers"] = counts.testersPendientes;

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar role={role} nombre={nombre} email={email ?? ""} badges={badges} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-6 py-3 shrink-0">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">
            Gestor de Ofertas · {role}
          </p>
        </header>

        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
