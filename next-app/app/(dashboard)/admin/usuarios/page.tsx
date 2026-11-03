import { Users } from "lucide-react";
import { listUsuarios, listFarmaciasOptions } from "@/lib/data/admin";
import { UsuariosAdmin } from "@/components/admin/UsuariosAdmin";
import { ImportUsuarios } from "@/components/admin/ImportUsuarios";

export const metadata = { title: "Usuarios · Admin" };

export default async function UsuariosPage() {
  const [usuarios, farmacias] = await Promise.all([
    listUsuarios(),
    listFarmaciasOptions(),
  ]);
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Users className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Usuarios</h1>
        </div>
        <UsuariosAdmin usuarios={usuarios} farmacias={farmacias} />
      </div>
      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-700">Alta masiva de usuarios de farmacia</h2>
        <ImportUsuarios />
      </div>
    </div>
  );
}
