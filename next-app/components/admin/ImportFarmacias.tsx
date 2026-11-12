"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileUp, CheckCircle2, AlertTriangle } from "lucide-react";
import { parseFarmaciasCsv } from "@/lib/import/farmacias-csv";
import { leerArchivoCsv } from "@/lib/import/leer-archivo";
import { importarFarmacias, type ImportFarmaciasResult } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";

const EJEMPLO = `codigo,nombre,email
3303,Farmacia Central 3303,central3303@farma.com
1102,Farmacia del Pueblo 1102,`;

export function ImportFarmacias() {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ImportFarmaciasResult | null>(null);
  const [pending, start] = useTransition();

  const preview = texto.trim() ? parseFarmaciasCsv(texto) : null;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { texto: contenido, aviso: av } = await leerArchivoCsv(file);
      setTexto(contenido);
      setAviso(av);
      setResultado(null);
    } catch {
      setResultado({ ok: false, error: "No se pudo leer el archivo." });
    }
  }

  function importar() {
    setResultado(null);
    start(async () => {
      try {
        const res = await importarFarmacias(texto);
        setResultado(res);
        if (res.ok) {
          setTexto("");
          setAviso(null);
          router.refresh();
        }
      } catch {
        setResultado({ ok: false, error: "Se cortó la conexión con el servidor. Probá de nuevo." });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <label htmlFor="csv-farmacias" className="text-base font-semibold text-slate-700">
            Alta masiva (CSV)
          </label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <FileUp className="h-4 w-4" /> Subir archivo
            <input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onFile} className="hidden" />
          </label>
        </div>
        <textarea
          id="csv-farmacias"
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setAviso(null);
          }}
          placeholder={EJEMPLO}
          rows={6}
          className="w-full rounded-lg border border-slate-300 p-3 font-mono text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
        />
        <p className="mt-2 text-xs text-slate-500">
          Columnas: codigo (obligatorio, es el ID interno), nombre (obligatorio), email (opcional).
          Acepta `;` o `,` y alias (id, farmacia, mail, correo). Las farmacias nuevas se crean y las
          que ya existen (mismo código) se <strong>actualizan</strong>; un email vacío no borra el
          que ya está cargado. Si tus códigos empiezan con cero, en Excel poné esa columna como
          Texto antes de guardar (si no, Excel los borra).
        </p>
        {aviso && (
          <p className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {aviso}
          </p>
        )}
      </div>

      {preview && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-base">
          <div className="flex flex-wrap gap-6">
            <span className="font-semibold text-green-700">{preview.validos.length} válidas</span>
            <span className={preview.errores.length ? "font-semibold text-red-600" : "text-slate-500"}>
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
            <Upload className="h-4 w-4" /> Importar {preview.validos.length} farmacia(s)
          </Button>
        </div>
      )}

      {resultado && !resultado.ok && (
        <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-700" role="alert">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          {resultado.error}
        </div>
      )}

      {resultado && resultado.ok && (
        <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-green-800" role="status">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span>
              {resultado.creadas} creada(s) · {resultado.actualizadas} actualizada(s) ·{" "}
              {resultado.sinCambios} sin cambios
              {resultado.errores.length > 0 && ` · ${resultado.errores.length} con error`}.
            </span>
          </div>
          {resultado.conflictos.length > 0 && (
            <div className="mt-2 text-sm text-amber-800">
              <p className="font-semibold">
                {resultado.conflictos.length} fila(s) no se aplicaron:
              </p>
              <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5">
                {resultado.conflictos.map((c) => (
                  <li key={c.codigo}>
                    {c.codigo} — {c.nombre}: {c.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
