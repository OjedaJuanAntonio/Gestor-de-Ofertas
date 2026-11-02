import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { CambiarClaveForm } from "@/components/CambiarClaveForm";

export const metadata = { title: "Cambiar contraseña" };

export default async function CambiarClavePage() {
  const session = await auth();
  const u = session?.user as { mustChangePassword?: boolean } | undefined;
  if (!u) redirect("/login");

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-slate-800">Cambiá tu contraseña</h1>
          <p className="mt-1 text-sm text-slate-500">
            {u.mustChangePassword
              ? "Por seguridad, antes de continuar elegí una contraseña nueva (distinta a la temporal)."
              : "Elegí una contraseña nueva."}
          </p>
        </div>
        <CambiarClaveForm />
      </div>
    </div>
  );
}
