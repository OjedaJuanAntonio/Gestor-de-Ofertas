import { auth } from "@/lib/auth";
import { getTestersPendientes } from "@/lib/data/testers";
import { TestersComprador } from "@/components/comprador/TestersComprador";

export const metadata = { title: "Testers · Comprador" };

export default async function TestersPage() {
  const session = await auth();
  const user = session?.user as { id: string; role?: string } | undefined;

  // El admin ve todos los testers pendientes; el comprador, solo los suyos.
  const items = user
    ? await getTestersPendientes(user.role === "ADMIN" ? undefined : user.id)
    : [];

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Testers / Probadores</h1>
        <p className="mt-1 text-base text-slate-600">
          Probadores aprobados pendientes de envío a la farmacia. Marcá los que ya
          enviaste para cerrar el ciclo. No pasan por la carga del ERP.
        </p>
      </div>
      <TestersComprador items={items} />
    </div>
  );
}
