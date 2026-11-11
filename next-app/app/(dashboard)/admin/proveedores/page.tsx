import { Factory } from "lucide-react";
import { listProveedores, listCompradoresOptions } from "@/lib/data/admin";
import { ProveedoresAdmin } from "@/components/admin/ProveedoresAdmin";
import { requireRole } from "@/lib/authz";

export const metadata = { title: "Proveedores · Admin" };

export default async function ProveedoresPage() {
  await requireRole("ADMIN");
  const [proveedores, compradores] = await Promise.all([
    listProveedores(),
    listCompradoresOptions(),
  ]);
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
          <Factory className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Proveedores (laboratorios)</h1>
          <p className="mt-0.5 text-base text-slate-600">
            Cada proveedor tiene un comprador responsable. Los artículos apuntan a su proveedor,
            y las solicitudes se rutean al comprador por esa asignación.
          </p>
        </div>
      </div>
      <ProveedoresAdmin proveedores={proveedores} compradores={compradores} />
    </div>
  );
}
