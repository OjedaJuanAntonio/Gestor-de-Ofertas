"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, AlertTriangle, CheckCircle2, Send } from "lucide-react";
import type { FarmaciaOption } from "@/lib/data/farmacias";
import type { ArticuloLookup, MotivoSolicitud } from "@/types";
import { MOTIVOS } from "@/types";
import { validateRow } from "@/lib/business/grid";
import { normalizeEan } from "@/lib/business/ean";
import {
  enviarSolicitud,
  type EnviarSolicitudResult,
} from "@/lib/actions/solicitudes";
import { Button } from "@/components/ui/button";

type EstadoFila = "VACIA" | "BUSCANDO" | "OK" | "ERROR";

type Fila = {
  id: string;
  codigoBarra: string;
  descripcion: string;
  laboratorio: string;
  stock: number | null;
  compradorNombre: string | null;
  compradorId: string | null;
  compradorMail: string | null;
  cantidad: number | "";
  motivo: MotivoSolicitud | "";
  fechaVencimiento: string;
  observaciones: string;
  estado: EstadoFila;
  error?: string;
};

const DRAFT_KEY = "carga-draft-v1";

function filaNueva(): Fila {
  return {
    id: crypto.randomUUID(),
    codigoBarra: "",
    descripcion: "",
    laboratorio: "",
    stock: null,
    compradorNombre: null,
    compradorId: null,
    compradorMail: null,
    cantidad: "",
    motivo: "",
    fechaVencimiento: "",
    observaciones: "",
    estado: "VACIA",
  };
}

function nuevoLote(): Fila[] {
  return [filaNueva()];
}

export function GrillaCarga({
  farmacias,
  farmaciaFija,
}: {
  farmacias: FarmaciaOption[];
  farmaciaFija: number | null;
}) {
  const [farmaciaId, setFarmaciaId] = useState<number | "">(
    farmaciaFija ?? "",
  );
  const [emailOverride, setEmailOverride] = useState("");
  const [filas, setFilas] = useState<Fila[]>(nuevoLote);
  const [idemKey, setIdemKey] = useState<string>(() => crypto.randomUUID());
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<EnviarSolicitudResult | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [draftRecuperado, setDraftRecuperado] = useState(false);

  const farmaciaSel = useMemo(
    () => farmacias.find((f) => f.id === farmaciaId),
    [farmacias, farmaciaId],
  );

  // ── Recuperar borrador al montar (lectura de localStorage) ───
  // setState dentro del effect es intencional: hidratamos desde
  // localStorage solo en cliente, tras el primer render (evita
  // mismatch de hidratación).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      const tieneContenido =
        Array.isArray(d.filas) &&
        d.filas.some((f: Fila) => f.codigoBarra?.trim());
      if (tieneContenido) {
        setFilas(d.filas);
        if (!farmaciaFija && d.farmaciaId) setFarmaciaId(d.farmaciaId);
        if (d.emailOverride) setEmailOverride(d.emailOverride);
        setDraftRecuperado(true);
      }
    } catch {
      /* draft corrupto: ignorar */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const tieneContenido = filas.some((f) => f.codigoBarra.trim());
    if (tieneContenido) {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ farmaciaId, emailOverride, filas }),
      );
    } else {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, [filas, farmaciaId, emailOverride]);

  // ── Helpers de mutación ──────────────────────────────────────
  const actualizarFila = useCallback((id: string, patch: Partial<Fila>) => {
    setFilas((prev) => {
      const next = prev.map((f) => (f.id === id ? { ...f, ...patch } : f));
      // Auto-agregar fila vacía si se empezó a usar la última.
      const ultima = next[next.length - 1];
      if (ultima.codigoBarra.trim() !== "") next.push(filaNueva());
      return next;
    });
  }, []);

  const borrarFila = useCallback((id: string) => {
    setFilas((prev) => {
      const next = prev.filter((f) => f.id !== id);
      return next.length ? next : nuevoLote();
    });
  }, []);

  // ── Lookup ───────────────────────────────────────────────────
  const resolver = useCallback(
    async (id: string, codigoRaw: string) => {
      const ean = normalizeEan(codigoRaw);
      if (!ean) {
        actualizarFila(id, { estado: "VACIA", error: undefined });
        return;
      }
      actualizarFila(id, { estado: "BUSCANDO", error: undefined });
      try {
        const res = await fetch(
          `/api/articulos/lookup?ean=${encodeURIComponent(ean)}`,
        );
        if (res.status === 404) {
          actualizarFila(id, {
            estado: "ERROR",
            error: "Producto inexistente",
            descripcion: "",
            laboratorio: "",
            compradorNombre: null,
            compradorId: null,
            compradorMail: null,
          });
          return;
        }
        if (!res.ok) {
          actualizarFila(id, { estado: "ERROR", error: "Error de búsqueda" });
          return;
        }
        const data = (await res.json()) as { articulo: ArticuloLookup };
        const a = data.articulo;
        actualizarFila(id, {
          estado: "OK",
          error: undefined,
          codigoBarra: a.codigoBarra,
          descripcion: a.descripcion,
          laboratorio: a.laboratorio,
          stock: a.stockReferencia,
          compradorNombre: a.compradorNombre,
          compradorId: a.compradorId,
          compradorMail: a.compradorMail,
        });
      } catch {
        actualizarFila(id, { estado: "ERROR", error: "Error de conexión" });
      }
    },
    [actualizarFila],
  );

  // ── Paste desde Excel (multi-fila) ───────────────────────────
  const onPasteEan = useCallback(
    (e: React.ClipboardEvent, filaIndex: number) => {
      const text = e.clipboardData.getData("text");
      if (!text.includes("\n") && !text.includes("\t")) return; // pegado simple
      e.preventDefault();
      const codigos = text
        .split(/\r?\n/)
        .map((l) => normalizeEan(l.split(/\t/)[0]))
        .filter(Boolean);
      if (codigos.length === 0) return;

      setFilas((prev) => {
        const next = [...prev];
        codigos.forEach((cod, i) => {
          const idx = filaIndex + i;
          if (!next[idx]) next[idx] = filaNueva();
          next[idx] = { ...next[idx], codigoBarra: cod, estado: "BUSCANDO" };
        });
        if (next[next.length - 1].codigoBarra.trim() !== "")
          next.push(filaNueva());
        return next;
      });
      // dispara lookups
      codigos.forEach((cod, i) => {
        const idx = filaIndex + i;
        setFilas((prev) => {
          const f = prev[idx];
          if (f) void resolver(f.id, cod);
          return prev;
        });
      });
    },
    [resolver],
  );

  // ── Validación de la grilla ──────────────────────────────────
  const filasActivas = filas.filter((f) => f.codigoBarra.trim() !== "");

  const erroresPorFila = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of filasActivas) {
      if (f.estado === "BUSCANDO") {
        m.set(f.id, "Buscando…");
        continue;
      }
      const v = validateRow({
        codigoBarra: f.codigoBarra,
        articuloExiste: f.estado === "OK",
        cantidad: f.cantidad,
        motivo: f.motivo,
        fechaVencimiento: f.fechaVencimiento,
      });
      if (!v.ok) m.set(f.id, v.error!);
    }
    return m;
  }, [filasActivas]);

  // El email es opcional: si la farmacia no tiene y el operador no lo
  // completa, se guarda "SIN_MAIL". Por eso no bloquea el envío.
  const grillaValida =
    filasActivas.length > 0 &&
    erroresPorFila.size === 0 &&
    !filasActivas.some((f) => f.estado === "BUSCANDO") &&
    farmaciaId !== "";

  // ── Envío ────────────────────────────────────────────────────
  async function confirmarEnvio() {
    setConfirmando(false);
    setEnviando(true);
    setResultado(null);
    try {
      const res = await enviarSolicitud({
        farmaciaId: Number(farmaciaId),
        emailManual: emailOverride.trim() || undefined,
        idempotencyKey: idemKey,
        rows: filasActivas.map((f) => ({
          codigoBarra: f.codigoBarra,
          cantidad: Number(f.cantidad),
          motivo: f.motivo as MotivoSolicitud,
          fechaVencimiento: f.fechaVencimiento,
          observaciones: f.observaciones,
        })),
      });
      setResultado(res);
      if (res.ok) {
        // Limpieza parcial: borra ítems, mantiene la farmacia. Nuevo lote.
        setFilas(nuevoLote());
        setIdemKey(crypto.randomUUID());
        localStorage.removeItem(DRAFT_KEY);
        setDraftRecuperado(false);
      }
    } catch {
      setResultado({ ok: false, error: "Error inesperado al enviar." });
    } finally {
      setEnviando(false);
    }
  }

  // ── Navegación por teclado ───────────────────────────────────
  function onKeyEan(e: React.KeyboardEvent, fila: Fila) {
    if (e.key === "Enter") {
      e.preventDefault();
      void resolver(fila.id, fila.codigoBarra);
      document.getElementById(`cant-${fila.id}`)?.focus();
    }
  }

  return (
    <div className="space-y-4 text-[15px]">
      {draftRecuperado && (
        <div className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-amber-800">
          <span>Recuperamos una carga anterior sin enviar.</span>
          <button
            className="font-semibold underline"
            onClick={() => {
              setFilas(nuevoLote());
              localStorage.removeItem(DRAFT_KEY);
              setDraftRecuperado(false);
            }}
          >
            Descartar
          </button>
        </div>
      )}

      {/* ── Cabecera: farmacia + email ── */}
      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <div>
          <label htmlFor="farmacia" className="mb-1 block text-base font-semibold text-slate-700">
            Farmacia
          </label>
          <select
            id="farmacia"
            value={farmaciaId}
            disabled={!!farmaciaFija}
            onChange={(e) =>
              setFarmaciaId(e.target.value ? Number(e.target.value) : "")
            }
            className="h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-300 disabled:bg-slate-100"
          >
            <option value="">— Elegí una farmacia —</option>
            {farmacias.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-base font-semibold text-slate-700">
            Email de la farmacia
          </label>
          {farmaciaSel?.email ? (
            <div className="flex h-12 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-lg text-slate-600">
              {farmaciaSel.email}
            </div>
          ) : (
            <input
              id="email"
              type="email"
              placeholder={farmaciaSel ? "Sin mail — ingresalo o dejá vacío (SIN_MAIL)" : "Elegí una farmacia primero"}
              value={emailOverride}
              disabled={!farmaciaSel}
              onChange={(e) => setEmailOverride(e.target.value)}
              className="h-12 w-full rounded-lg border border-slate-300 px-3 text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-300 disabled:bg-slate-100"
            />
          )}
        </div>
      </div>

      {/* ── Grilla ── */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600">
              <th className="w-10 px-2 py-3 text-center">#</th>
              <th className="px-2 py-3 min-w-[170px]">Código de barras</th>
              <th className="px-2 py-3 min-w-[220px]">Descripción</th>
              <th className="px-2 py-3 min-w-[120px]">Laboratorio</th>
              <th className="px-2 py-3 w-28">Cantidad</th>
              <th className="px-2 py-3 min-w-[160px]">Motivo</th>
              <th className="px-2 py-3 w-24">Vto MM/AA</th>
              <th className="px-2 py-3 min-w-[140px]">Observaciones</th>
              <th className="w-10 px-2 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, idx) => {
              const err = erroresPorFila.get(fila.id);
              const esError = fila.estado === "ERROR" || (!!err && err !== "Buscando…");
              return (
                <tr
                  key={fila.id}
                  className={
                    esError
                      ? "border-b border-slate-100 bg-red-50"
                      : fila.estado === "OK"
                        ? "border-b border-slate-100 bg-green-50/40"
                        : "border-b border-slate-100"
                  }
                >
                  <td className="px-2 py-1.5 text-center text-sm text-slate-400">{idx + 1}</td>
                  <td className="px-2 py-1.5">
                    <div className="relative">
                      <input
                        id={`ean-${fila.id}`}
                        aria-label={`Código de barras, fila ${idx + 1}`}
                        inputMode="numeric"
                        autoComplete="off"
                        value={fila.codigoBarra}
                        onChange={(e) =>
                          actualizarFila(fila.id, {
                            codigoBarra: e.target.value,
                            estado: "VACIA",
                          })
                        }
                        onBlur={(e) => resolver(fila.id, e.target.value)}
                        onKeyDown={(e) => onKeyEan(e, fila)}
                        onPaste={(e) => onPasteEan(e, idx)}
                        aria-invalid={esError}
                        className={`h-11 w-full rounded-md border px-2 font-mono text-lg focus:ring-2 ${
                          esError
                            ? "border-red-400 bg-red-50 focus:ring-red-300"
                            : "border-slate-300 focus:border-blue-500 focus:ring-blue-300"
                        }`}
                      />
                      {fila.estado === "BUSCANDO" && (
                        <Loader2 className="absolute right-2 top-3 h-5 w-5 animate-spin text-blue-500" />
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-base text-slate-700">
                    {fila.descripcion || <span className="text-slate-300">—</span>}
                    {err && err !== "Buscando…" && (
                      <span className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-red-600">
                        <AlertTriangle className="h-4 w-4" /> {err}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-base text-slate-600">
                    {fila.laboratorio || <span className="text-slate-300">—</span>}
                    {fila.estado === "OK" && !fila.compradorId && (
                      <span className="block text-xs font-semibold text-amber-600">
                        Lab sin comprador asignado
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      id={`cant-${fila.id}`}
                      aria-label={`Cantidad, fila ${idx + 1}`}
                      type="number"
                      min={1}
                      value={fila.cantidad}
                      onChange={(e) =>
                        actualizarFila(fila.id, {
                          cantidad: e.target.value === "" ? "" : Number(e.target.value),
                        })
                      }
                      className="h-11 w-24 rounded-md border border-slate-300 px-2 text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      aria-label={`Motivo, fila ${idx + 1}`}
                      value={fila.motivo}
                      onChange={(e) =>
                        actualizarFila(fila.id, {
                          motivo: e.target.value as MotivoSolicitud | "",
                        })
                      }
                      className="h-11 w-full rounded-md border border-slate-300 bg-white px-2 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
                    >
                      <option value="">— Motivo —</option>
                      {MOTIVOS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      aria-label={`Vencimiento MM/AA, fila ${idx + 1}`}
                      placeholder="MM/AA"
                      value={fila.fechaVencimiento}
                      onChange={(e) =>
                        actualizarFila(fila.id, { fechaVencimiento: e.target.value })
                      }
                      disabled={fila.motivo !== "VENCIMIENTO_PROXIMO"}
                      className="h-11 w-24 rounded-md border border-slate-300 px-2 text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-300 disabled:bg-slate-100"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      aria-label={`Observaciones, fila ${idx + 1}`}
                      value={fila.observaciones}
                      onChange={(e) =>
                        actualizarFila(fila.id, { observaciones: e.target.value })
                      }
                      className="h-11 w-full rounded-md border border-slate-300 px-2 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-300"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => borrarFila(fila.id)}
                      aria-label="Borrar fila"
                      className="text-slate-300 hover:text-red-500"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pie: resumen + acciones ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-base text-slate-600">
          <button
            onClick={() => setFilas((p) => [...p, filaNueva()])}
            className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700"
          >
            <Plus className="h-4 w-4" /> Agregar fila
          </button>
          <span className="ml-4">
            <strong>{filasActivas.length}</strong> ítem(s) ·{" "}
            {erroresPorFila.size > 0 ? (
              <span className="font-semibold text-red-600">
                {erroresPorFila.size} con error
              </span>
            ) : (
              <span className="font-semibold text-green-600">todo OK</span>
            )}
          </span>
        </div>
        <Button
          onClick={() => setConfirmando(true)}
          disabled={!grillaValida || enviando}
          className="h-12 gap-2 bg-blue-600 px-6 text-lg hover:bg-blue-700"
        >
          {enviando ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
          Enviar solicitud
        </Button>
      </div>

      {/* ── Modal de confirmación ── */}
      {confirmando && (
        <Modal onClose={() => setConfirmando(false)}>
          <h2 className="text-xl font-bold text-slate-800">Confirmar envío</h2>
          <p className="mt-2 text-base text-slate-600">
            Vas a enviar <strong>{filasActivas.length}</strong> ítem(s) de{" "}
            <strong>{farmaciaSel?.nombre}</strong>. Los ítems se distribuyen a la
            bandeja de cada comprador según el laboratorio.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={confirmarEnvio}>
              Confirmar y enviar
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Resultado ── */}
      {resultado && (
        <Modal onClose={() => setResultado(null)}>
          {resultado.ok ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-14 w-14 text-green-500" />
              <h2 className="mt-3 text-2xl font-bold text-slate-800">
                {resultado.duplicada ? "Solicitud ya registrada" : "¡Solicitud enviada!"}
              </h2>
              <p className="mt-2 text-lg text-slate-600">
                Código <strong>{resultado.codigo}</strong> · {resultado.totalItems} ítem(s)
              </p>
              {!resultado.duplicada && (
                <p className="mt-1 text-base text-slate-500">
                  {resultado.compradoresConItems} comprador(es) con ítems en su bandeja
                  {resultado.itemsSinComprador > 0 &&
                    ` · ${resultado.itemsSinComprador} ítem(s) sin comprador (quedan en "Sin asignar")`}
                </p>
              )}
              <Button
                className="mt-5 bg-blue-600 hover:bg-blue-700"
                onClick={() => setResultado(null)}
              >
                Cargar otra
              </Button>
            </div>
          ) : (
            <div className="text-center">
              <AlertTriangle className="mx-auto h-14 w-14 text-red-500" />
              <h2 className="mt-3 text-xl font-bold text-slate-800">No se pudo enviar</h2>
              <p className="mt-2 text-base text-red-600">{resultado.error}</p>
              <Button className="mt-5" variant="ghost" onClick={() => setResultado(null)}>
                Cerrar
              </Button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
