"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { cambiarMiPassword } from "@/lib/actions/cuenta";
import { MIN_PASSWORD_CAMBIO } from "@/lib/password";
import { Button } from "@/components/ui/button";

export function CambiarClaveForm() {
  const [password, setPassword] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_CAMBIO) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_CAMBIO} caracteres.`);
      return;
    }
    if (password !== confirmar) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    start(async () => {
      // Si sale bien, la Server Action cierra sesión y redirige al login.
      const res = await cambiarMiPassword({ password });
      if (!res.ok) setError(res.error);
    });
  }

  const inputCls =
    "h-11 w-full rounded-lg border border-slate-300 px-3 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-300";

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="space-y-1.5">
        <label htmlFor="nueva" className="text-sm font-medium text-slate-700">
          Nueva contraseña
        </label>
        <input
          id="nueva"
          type="password"
          autoFocus
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={`Al menos ${MIN_PASSWORD_CAMBIO} caracteres`}
          className={inputCls}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="confirmar" className="text-sm font-medium text-slate-700">
          Repetir contraseña
        </label>
        <input
          id="confirmar"
          type="password"
          autoComplete="new-password"
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
          placeholder="Repetí la nueva contraseña"
          className={inputCls}
        />
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <Button type="submit" disabled={pending} className="w-full bg-blue-600 hover:bg-blue-700">
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Guardando...
          </>
        ) : (
          "Guardar y continuar"
        )}
      </Button>
    </form>
  );
}
