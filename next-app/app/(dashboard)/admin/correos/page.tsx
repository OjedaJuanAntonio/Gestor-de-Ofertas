import { Mail } from "lucide-react";
import { listCorreosProblema, resumenColaCorreos } from "@/lib/data/admin";
import { CorreosAdmin } from "@/components/admin/CorreosAdmin";
import { requireRole } from "@/lib/authz";
import { modoEnvio } from "@/lib/email/send";
import { fmtFechaHora } from "@/lib/fecha";

export const metadata = { title: "Correos · Admin" };

export default async function CorreosPage() {
  await requireRole("ADMIN");
  const [correos, resumen] = await Promise.all([listCorreosProblema(), resumenColaCorreos()]);
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
          <Mail className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Correos</h1>
          <p className="mt-0.5 text-base text-slate-600">
            Estado de la cola de notificaciones a las farmacias y correos con problemas (por
            ejemplo, farmacias sin mail).
          </p>
        </div>
      </div>
      <CorreosAdmin
        correos={correos}
        resumen={{
          pendientes: resumen.pendientes,
          masViejo: resumen.masViejo ? fmtFechaHora(resumen.masViejo) : null,
          enviados24h: resumen.enviados24h,
          conProblemas: resumen.conProblemas,
        }}
        modo={modoEnvio()}
      />
    </div>
  );
}
