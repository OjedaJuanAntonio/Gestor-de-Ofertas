"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  PackageCheck,
  Download,
  Upload,
} from "lucide-react";
import type { ItemPrecios } from "@/lib/data/precios";
import {
  confirmarCargasERP,
  type ConfirmarCargasResult,
} from "@/lib/actions/precios";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const fmtFecha = (d: Date | null) =>
  d
    ? new Intl.DateTimeFormat("es-AR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      }).format(new Date(d))
    : "—";

type ImportResult =
  | { ok: true; cargados: number; ignorados: number; solicitudesFinalizadas: number; correosEncolados: number; mensaje?: string }
  | { ok: false; error: string };

export function PanelPrecios({
  items,
  page,
  pages,
  total,
}: {
  items: ItemPrecios[];
  page: number;
  pages: number;
  total: number;
}) {
  const router = useRouter();
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<ConfirmarCargasResult | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const [subiendo, setSubiendo] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const seleccionados = Object.keys(marcados).filter((id) => marcados[id]);
  const todosMarcados = items.length > 0 && items.every((it) => marcados[it.id]);

  function toggleTodos() {
    if (todosMarcados) {
      setMarcados({});
    } else {
      const all: Record<string, boolean> = {};
      items.forEach((it) => (all[it.id] = true));
      setMarcados(all);
    }
  }

  function pedirConfirmacion() {
    if (seleccionados.length === 0) return;
    setConfirmando(true);
  }

  async function ejecutar() {
    setConfirmando(false);
    setEnviando(true);
    setResultado(null);
    try {
      const res = await confirmarCargasERP({ itemIds: seleccionados });
      setResultado(res);
      if (res.ok) {
        setMarcados({});
        router.refresh();
      }
    } catch {
      setResultado({ ok: false, error: "Error inesperado." });
    } finally {
      setEnviando(false);
    }
  }

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = ""; // permite re-subir el mismo archivo
    if (!file) return;
    setSubiendo(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/precios/import", { method: "POST", body: fd });
      const data = (await res.json()) as ImportResult;
      setImportResult(data);
      if (data.ok) router.refresh();
    } catch {
      setImportResult({ ok: false, error: "No se pudo subir el archivo." });
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="space-y-4 text-[15px]">
      {/* ── Barra de Excel ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm text-slate-600">
          <p className="font-semibold text-slate-700">Trabajar con Excel</p>
          <p className="mt-0.5">
            Bajá la planilla, cargá las ofertas en el ERP y volvé a subirla con la columna{" "}
            <code className="rounded bg-slate-100 px-1 font-mono">CARGADO = SI</code> en lo ya hecho.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/precios/export"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 px-4 text-base font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" /> Descargar Excel
          </a>
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={subiendo}
            variant="ghost"
            className="h-11 gap-2 border border-slate-300 px-4 text-base font-semibold text-slate-700 hover:bg-slate-50"
          >
            {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Subir Excel marcado
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            onChange={onArchivo}
            className="hidden"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-base text-slate-600">
          <strong>{total}</strong> ítem(s) aprobados pendientes ·{" "}
          <strong>{seleccionados.length}</strong> seleccionados
        </span>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <PackageCheck className="h-12 w-12 text-slate-300" />
          <p className="mt-3 text-lg font-medium text-slate-500">No hay ítems pendientes de carga.</p>
          <p className="text-base text-slate-400">Todo lo aprobado ya fue cargado en el ERP.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full border-collapse text-left tabular-nums">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  <th className="w-12 border-r border-slate-200 px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={todosMarcados}
                      onChange={toggleTodos}
                      aria-label="Marcar todos"
                      className="h-5 w-5 accent-blue-600"
                    />
                  </th>
                  <th className="border-r border-slate-200 px-3 py-2">Solicitud</th>
                  <th className="border-r border-slate-200 px-3 py-2">Farmacia</th>
                  <th className="border-r border-slate-200 px-3 py-2 min-w-[240px]">Producto</th>
                  <th className="border-r border-slate-200 px-3 py-2">Laboratorio</th>
                  <th className="border-r border-slate-200 px-3 py-2 w-16 text-center">Cant.</th>
                  <th className="border-r border-slate-200 px-3 py-2">Condición</th>
                  <th className="px-3 py-2 w-24">Aprobado</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const marcado = !!marcados[it.id];
                  return (
                    <tr
                      key={it.id}
                      onClick={() => setMarcados((p) => ({ ...p, [it.id]: !marcado }))}
                      className={`cursor-pointer border-b border-slate-100 ${
                        marcado ? "bg-blue-50" : "odd:bg-white even:bg-slate-50/40 hover:bg-slate-100/60"
                      }`}
                    >
                      <td className="border-r border-slate-100 px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={(e) =>
                            setMarcados((p) => ({ ...p, [it.id]: e.target.checked }))
                          }
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Marcar ${it.descripcion}`}
                          className="h-5 w-5 accent-blue-600"
                        />
                      </td>
                      <td className="border-r border-slate-100 px-3 py-2 font-mono text-xs text-slate-500">
                        {it.solicitudCodigo}
                      </td>
                      <td className="border-r border-slate-100 px-3 py-2 text-slate-700">
                        {it.farmaciaNombre}
                      </td>
                      <td className="border-r border-slate-100 px-3 py-2">
                        <span className="font-medium text-slate-800">{it.descripcion}</span>
                        <span className="ml-2 font-mono text-xs text-slate-400">{it.codigoBarra}</span>
                      </td>
                      <td className="border-r border-slate-100 px-3 py-2 text-slate-600">
                        {it.laboratorio}
                      </td>
                      <td className="border-r border-slate-100 px-3 py-2 text-center font-semibold text-slate-800">
                        {it.cantidad}
                      </td>
                      <td className="border-r border-slate-100 px-3 py-2">
                        <span className="inline-block rounded bg-green-100 px-2 py-0.5 font-semibold text-green-800">
                          {it.condicionAutorizada ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-500">{fmtFecha(it.fechaAprobacion)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <Paginador page={page} pages={pages} />
            <Button
              onClick={pedirConfirmacion}
              disabled={enviando || seleccionados.length === 0}
              className="h-12 gap-2 bg-blue-600 px-6 text-lg hover:bg-blue-700"
            >
              {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <PackageCheck className="h-5 w-5" />}
              Confirmar cargas en sistema ({seleccionados.length})
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmando}
        title="Confirmar cargas en el ERP"
        message={
          <>
            Vas a marcar <strong>{seleccionados.length}</strong> ítem(s) como cargados en el
            sistema. Al cerrarse una solicitud se le notifica a la farmacia. Esta acción es
            definitiva.
          </>
        }
        confirmLabel="Confirmar cargas"
        onConfirm={ejecutar}
        onCancel={() => setConfirmando(false)}
      />

      {resultado && (
        <ResultModal onClose={() => setResultado(null)} ok={resultado.ok}>
          {resultado.ok ? (
            <>
              <h2 className="mt-3 text-xl font-bold text-slate-800">Cargas confirmadas</h2>
              <p className="mt-2 text-base text-slate-600">
                {resultado.cargados} ítem(s) cargados · {resultado.solicitudesFinalizadas}{" "}
                solicitud(es) finalizadas
                {resultado.correosEncolados > 0 &&
                  ` · ${resultado.correosEncolados} correo(s) consolidado(s) a farmacias`}
              </p>
            </>
          ) : (
            <>
              <h2 className="mt-3 text-xl font-bold text-slate-800">No se pudo confirmar</h2>
              <p className="mt-2 text-base text-red-600">{resultado.error}</p>
            </>
          )}
        </ResultModal>
      )}

      {importResult && (
        <ResultModal onClose={() => setImportResult(null)} ok={importResult.ok}>
          {importResult.ok ? (
            <>
              <h2 className="mt-3 text-xl font-bold text-slate-800">Excel procesado</h2>
              <p className="mt-2 text-base text-slate-600">
                {importResult.cargados} ítem(s) cargados · {importResult.solicitudesFinalizadas}{" "}
                solicitud(es) finalizadas
                {importResult.correosEncolados > 0 &&
                  ` · ${importResult.correosEncolados} correo(s) a farmacias`}
                {importResult.ignorados > 0 &&
                  ` · ${importResult.ignorados} ignorado(s) (ya cargados o inválidos)`}
              </p>
              {importResult.mensaje && (
                <p className="mt-1 text-sm text-slate-500">{importResult.mensaje}</p>
              )}
            </>
          ) : (
            <>
              <h2 className="mt-3 text-xl font-bold text-slate-800">No se pudo procesar el Excel</h2>
              <p className="mt-2 text-base text-red-600">{importResult.error}</p>
            </>
          )}
        </ResultModal>
      )}
    </div>
  );
}

function ResultModal({
  ok,
  children,
  onClose,
}: {
  ok: boolean;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {ok ? (
          <CheckCircle2 className="mx-auto h-14 w-14 text-green-500" />
        ) : (
          <AlertTriangle className="mx-auto h-14 w-14 text-red-500" />
        )}
        {children}
        <Button className="mt-5" variant="ghost" onClick={onClose}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}

function Paginador({ page, pages }: { page: number; pages: number }) {
  if (pages <= 1) return <div />;
  return (
    <div className="flex items-center gap-2 text-base">
      <a
        href={`?page=${page - 1}`}
        className={`rounded-md border px-3 py-1.5 ${
          page <= 1
            ? "pointer-events-none border-slate-200 text-slate-300"
            : "border-slate-300 text-slate-600 hover:bg-slate-50"
        }`}
      >
        ← Anterior
      </a>
      <span className="text-slate-500">
        Página {page} de {pages}
      </span>
      <a
        href={`?page=${page + 1}`}
        className={`rounded-md border px-3 py-1.5 ${
          page >= pages
            ? "pointer-events-none border-slate-200 text-slate-300"
            : "border-slate-300 text-slate-600 hover:bg-slate-50"
        }`}
      >
        Siguiente →
      </a>
    </div>
  );
}
