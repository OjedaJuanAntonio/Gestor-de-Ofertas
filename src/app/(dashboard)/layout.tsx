import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/Sidebar";
import type { Role } from "@/types";

// ─────────────────────────────────────────────────────────────
// Layout protegido — envuelve todos los módulos del dashboard.
// Si el usuario no tiene sesión, redirige a /login.
// ─────────────────────────────────────────────────────────────

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // Segunda línea de defensa (el middleware ya protege, pero esto
  // garantiza que Server Components no rendericen sin sesión)
  if (!session?.user) {
    redirect("/login");
  }

  const { id: _, role, nombre, email } = session.user as {
    id: string;
    role: Role;
    nombre: string;
    email: string;
  };

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar role={role} nombre={nombre} email={email ?? ""} />

      {/* Área de contenido principal */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header de contexto (título de la página lo pone cada page.tsx) */}
        <header className="bg-white border-b border-slate-200 px-6 py-3 shrink-0">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">
            Gestor de Ofertas · {role}
          </p>
        </header>

        {/* Contenido de la ruta activa */}
        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
