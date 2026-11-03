import { Mail } from "lucide-react";
import { listCorreosProblema } from "@/lib/data/admin";
import { CorreosAdmin } from "@/components/admin/CorreosAdmin";

export const metadata = { title: "Correos · Admin" };

export default async function CorreosPage() {
  const correos = await listCorreosProblema();
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
          <Mail className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Correos con problemas</h1>
          <p className="mt-0.5 text-base text-slate-600">
            Notificaciones fallidas o en dead-letter (ej. farmacias sin mail). Reintentá o cancelá.
          </p>
        </div>
      </div>
      <CorreosAdmin correos={correos} />
    </div>
  );
}
