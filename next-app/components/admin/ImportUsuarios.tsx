"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileUp, CheckCircle2, AlertTriangle, Download } from "lucide-react";
import { parseUsuariosCsv } from "@/lib/import/usuarios-csv";
import {
  importarUsuariosFarmacia,
  type CredencialNueva,
  type ImportUsuariosResult,
} from "@/lib/actions/admin";
import { toCsv } from "@/lib/export/csv";
import { DIAS_VIGENCIA_CLAVE_TEMPORAL } from "@/lib/password";
import { Button } from "@/components/ui/button";

const EJEMPLO = `farmacia,email
Farmacia Central 3303,central3303@farma.com
Farmacia del Pueblo 1102,pueblo1102@farma.com`;

/** Baja un CSV (para Excel) con farmacia, email y clave temporal de cada alta. */
function descargarClaves(credenciales: CredencialNueva[]) {
  const csv = toCsv<CredencialNueva>(
    credenciales,
    [
      { header: "Farmacia", value: (c) => c.farmacia },
      { header: "Email", value: (c) => c.email },
      { header: "Clave temporal", value: (c) => c.clave },
    ],
    { bom: true },
  );
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `claves-temporales-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportUsuarios() {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<ImportUsuariosResult | null>(null);
  const [pending, start] = useTransition();

  const preview = texto.trim() ? parseUsuariosCsv(texto) : null;

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setTexto(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  function importar() {
    setResultado(null);
    start(async () => {
      const res = await importarUsuariosFarmacia(texto);
      setResultado(res);
      if (res.ok) {
        setTexto("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <label className="text-base font-semibold text-slate-700">
            Alta masiva de logins de farmacia (CSV)
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <FileUp className="h-4 w-4" /> Subir archivo
            <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
          </label>
        </div>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={EJEMPLO}
          rows={6}
          className="w-full rounded-lg border border-slate-300 p-3 font-mono text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
        />
        <p className="mt-2 text-xs text-slate-400">
          Columnas: farmacia y email (obligatorias), nombre (opcional). La farmacia debe existir ya
          (importala primero). Cada usuario se crea con rol FARMACIA y una clave temporal propia,
          generada al azar, que vence a los {DIAS_VIGENCIA_CLAVE_TEMPORAL} días; al terminar vas a
          poder descargar el listado de claves. Los emails ya existentes se omiten.
        </p>
      </div>

      {preview && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-base">
          <div className="flex flex-wrap gap-6">
            <span className="font-semibold text-green-600">{preview.validos.length} válidos</span>
            <span className={preview.errores.length ? "font-semibold text-red-600" : "text-slate-400"}>
              {preview.errores.length} con error
            </span>
          </div>
          {preview.errores.length > 0 && (
            <ul className="mt-3 max-h-40 overflow-y-auto text-sm text-red-600">
              {preview.errores.slice(0, 20).map((e, i) => (
                <li key={i}>
                  Línea {e.linea}: {e.motivo}
                </li>
              ))}
            </ul>
          )}
          <Button
            onClick={importar}
            disabled={pending || preview.validos.length === 0}
            className="mt-4 gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <Upload className="h-4 w-4" /> Importar {preview.validos.length} usuario(s)
          </Button>
        </div>
      )}

      {resultado && (
        <div
          className={`rounded-lg border px-4 py-3 ${resultado.ok ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-700"}`}
        >
          <div className="flex items-center gap-2">
            {resultado.ok ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            {resultado.ok
              ? `Importados ${resultado.importados} usuario(s)${resultado.omitidos ? ` · ${resultado.omitidos} omitidos (email ya existía)` : ""}.`
              : resultado.error}
          </div>
          {resultado.ok && resultado.credenciales.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">
                Descargá ahora las claves temporales: no se guardan y no se pueden volver a ver.
              </p>
              <p className="mt-1">
                Cada farmacia tiene una clave distinta, válida por {DIAS_VIGENCIA_CLAVE_TEMPORAL} días.
                Al entrar se le pide elegir la suya. Si perdés el archivo, generá una nueva desde
                la tabla de usuarios (&quot;Clave temporal&quot;).
              </p>
              <Button
                onClick={() => descargarClaves(resultado.credenciales)}
                className="mt-3 gap-2 bg-blue-600 hover:bg-blue-700"
              >
                <Download className="h-4 w-4" /> Descargar claves ({resultado.credenciales.length})
              </Button>
            </div>
          )}
          {resultado.ok && resultado.noEncontradas.length > 0 && (
            <p className="mt-2 text-sm text-amber-700">
              Farmacias no encontradas (impórtalas primero): {resultado.noEncontradas.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
