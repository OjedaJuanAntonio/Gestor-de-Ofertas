import { describe, it, expect } from "vitest";
import { normalizeEan, isValidEanFormat, isValidEan13Checksum } from "./ean";
import { validateRow, validateGrid, isValidVencimiento } from "./grid";
import { generateSolicitudCodigo } from "./solicitud";
import { agruparPorComprador } from "./multicomprador";
import { computeEstadoSolicitud, evaluarCierre } from "./cierre";
import {
  dedupConsolidadoFarmacia,
  dedupRechazoTotal,
} from "./email-keys";

// ─── EAN ──────────────────────────────────────────────────────
describe("normalizeEan", () => {
  it("deja solo dígitos", () => {
    expect(normalizeEan("  779-123 \n")).toBe("779123");
    expect(normalizeEan("7791234567890")).toBe("7791234567890");
  });
  it("maneja vacío/undefined", () => {
    expect(normalizeEan("")).toBe("");
    // @ts-expect-error probando input no string
    expect(normalizeEan(undefined)).toBe("");
  });
});

describe("isValidEanFormat", () => {
  it("acepta 6 a 14 dígitos", () => {
    expect(isValidEanFormat("779123")).toBe(true);
    expect(isValidEanFormat("7791234567890")).toBe(true);
  });
  it("rechaza fuera de rango o con letras", () => {
    expect(isValidEanFormat("12345")).toBe(false);
    expect(isValidEanFormat("12345A")).toBe(false);
    expect(isValidEanFormat("")).toBe(false);
  });
});

describe("isValidEan13Checksum", () => {
  it("valida un EAN-13 correcto", () => {
    expect(isValidEan13Checksum("4006381333931")).toBe(true);
  });
  it("rechaza checksum inválido", () => {
    expect(isValidEan13Checksum("4006381333932")).toBe(false);
  });
});

// ─── Vencimiento ──────────────────────────────────────────────
describe("isValidVencimiento", () => {
  it("acepta MM/AA válido", () => {
    expect(isValidVencimiento("12/26")).toBe(true);
    expect(isValidVencimiento("01/30")).toBe(true);
  });
  it("rechaza mes inválido o formato erróneo", () => {
    expect(isValidVencimiento("13/26")).toBe(false);
    expect(isValidVencimiento("00/26")).toBe(false);
    expect(isValidVencimiento("2026-12")).toBe(false);
    expect(isValidVencimiento("")).toBe(false);
  });
});

// ─── Validación de filas ──────────────────────────────────────
describe("validateRow", () => {
  const base = {
    codigoBarra: "7791234567890",
    articuloExiste: true,
    cantidad: 5 as number | "",
    motivo: "SOBRESTOCK" as const,
    fechaVencimiento: "10/27",
  };

  it("fila válida", () => {
    expect(validateRow(base).ok).toBe(true);
  });
  it("código vacío", () => {
    expect(validateRow({ ...base, codigoBarra: "" }).error).toMatch(/código/i);
  });
  it("producto inexistente", () => {
    expect(validateRow({ ...base, articuloExiste: false }).error).toBe(
      "Producto inexistente",
    );
  });
  it("cantidad cero / negativa / no entera", () => {
    expect(validateRow({ ...base, cantidad: 0 }).ok).toBe(false);
    expect(validateRow({ ...base, cantidad: -3 }).ok).toBe(false);
    expect(validateRow({ ...base, cantidad: 1.5 }).ok).toBe(false);
    expect(validateRow({ ...base, cantidad: "" }).ok).toBe(false);
  });
  it("cantidad con tope: rechaza un número disparatado (anti-overflow)", () => {
    expect(validateRow({ ...base, cantidad: 1_000_001 }).ok).toBe(false);
    expect(validateRow({ ...base, cantidad: 2_147_483_648 }).error).toMatch(/no puede superar/i);
    expect(validateRow({ ...base, cantidad: 1_000_000 }).ok).toBe(true);
  });
  it("motivo faltante", () => {
    expect(validateRow({ ...base, motivo: "" }).error).toMatch(/motivo/i);
  });
  it("vencimiento obligatorio para todos los motivos salvo PROBADOR", () => {
    // VENCIMIENTO_PROXIMO, STOCK_INMOVILIZADO y SOBRESTOCK: fecha requerida.
    for (const motivo of ["VENCIMIENTO_PROXIMO", "STOCK_INMOVILIZADO", "SOBRESTOCK"] as const) {
      expect(validateRow({ ...base, motivo, fechaVencimiento: "" }).ok).toBe(false);
      expect(validateRow({ ...base, motivo, fechaVencimiento: "10/27" }).ok).toBe(true);
    }
  });
  it("PROBADOR no exige fecha de vencimiento", () => {
    expect(validateRow({ ...base, motivo: "PROBADOR", fechaVencimiento: "" }).ok).toBe(true);
  });
  it("fecha con formato inválido se rechaza (motivo no PROBADOR)", () => {
    expect(validateRow({ ...base, motivo: "SOBRESTOCK", fechaVencimiento: "13/99" }).ok).toBe(false);
  });
  it("normaliza el código antes de validar (scanner con espacios)", () => {
    expect(validateRow({ ...base, codigoBarra: " 7791234567890 " }).ok).toBe(
      true,
    );
  });
});

describe("validateGrid", () => {
  const ok = {
    codigoBarra: "7791234567890",
    articuloExiste: true,
    cantidad: 2 as number | "",
    motivo: "STOCK_INMOVILIZADO" as const,
    fechaVencimiento: "10/27",
  };
  it("ok si todas válidas y hay al menos una", () => {
    expect(validateGrid([ok, ok]).ok).toBe(true);
  });
  it("no ok si grilla vacía", () => {
    expect(validateGrid([]).ok).toBe(false);
  });
  it("reporta índices con error", () => {
    const res = validateGrid([ok, { ...ok, articuloExiste: false }]);
    expect(res.ok).toBe(false);
    expect(res.errores).toEqual([{ index: 1, error: "Producto inexistente" }]);
  });
});

// ─── Código de solicitud ──────────────────────────────────────
describe("generateSolicitudCodigo", () => {
  it("formato SOL-YYMMDD-HHMMSS-XXXX", () => {
    const cod = generateSolicitudCodigo(new Date(2026, 5, 16, 14, 30, 52), "4F7A");
    expect(cod).toBe("SOL-260616-143052-4F7A");
  });
  it("genera distintos sufijos por defecto", () => {
    const a = generateSolicitudCodigo();
    const b = generateSolicitudCodigo();
    // muy improbable que coincidan ambos sufijos aleatorios
    expect(a).not.toBe(b);
  });
});

// ─── Distribución multicomprador ──────────────────────────────
describe("agruparPorComprador", () => {
  it("agrupa por comprador y aísla los sin comprador", () => {
    const items = [
      { compradorId: "c1", compradorMail: "c1@x.com", n: 1 },
      { compradorId: "c1", compradorMail: "c1@x.com", n: 2 },
      { compradorId: "c2", compradorMail: "c2@x.com", n: 3 },
      { compradorId: null, compradorMail: null, n: 4 },
    ];
    const res = agruparPorComprador(items);
    expect(res.grupos).toHaveLength(2);
    const c1 = res.grupos.find((g) => g.compradorId === "c1")!;
    expect(c1.items).toHaveLength(2);
    expect(res.sinComprador).toHaveLength(1);
    expect(res.sinComprador[0].n).toBe(4);
  });
});

// ─── Cierre de ciclo ──────────────────────────────────────────
describe("computeEstadoSolicitud", () => {
  it("PENDIENTE si ningún ítem revisado", () => {
    expect(
      computeEstadoSolicitud([
        { estadoDecision: "PENDIENTE", cargadoERP: false },
        { estadoDecision: "PENDIENTE", cargadoERP: false },
      ]),
    ).toBe("PENDIENTE");
  });
  it("EN_PROCESO si revisión parcial", () => {
    expect(
      computeEstadoSolicitud([
        { estadoDecision: "APROBADO", cargadoERP: false },
        { estadoDecision: "PENDIENTE", cargadoERP: false },
      ]),
    ).toBe("EN_PROCESO");
  });
  it("EN_PROCESO si aprobado sin cargar en ERP", () => {
    expect(
      computeEstadoSolicitud([
        { estadoDecision: "APROBADO", cargadoERP: false },
        { estadoDecision: "RECHAZADO", cargadoERP: false },
      ]),
    ).toBe("EN_PROCESO");
  });
  it("FINALIZADA si todos resueltos y aprobados cargados", () => {
    expect(
      computeEstadoSolicitud([
        { estadoDecision: "APROBADO", cargadoERP: true },
        { estadoDecision: "RECHAZADO", cargadoERP: false },
      ]),
    ).toBe("FINALIZADA");
  });
  it("FINALIZADA si todos rechazados (no requieren ERP)", () => {
    expect(
      computeEstadoSolicitud([
        { estadoDecision: "RECHAZADO", cargadoERP: false },
        { estadoDecision: "RECHAZADO", cargadoERP: false },
      ]),
    ).toBe("FINALIZADA");
  });
  it("EN_PROCESO si un probador aprobado aún no se envió como tester", () => {
    expect(
      computeEstadoSolicitud([
        { estadoDecision: "APROBADO", cargadoERP: false, motivo: "PROBADOR", testerEnviado: false },
      ]),
    ).toBe("EN_PROCESO");
  });
  it("FINALIZADA si el probador aprobado ya se envió (no pasa por ERP)", () => {
    expect(
      computeEstadoSolicitud([
        { estadoDecision: "APROBADO", cargadoERP: false, motivo: "PROBADOR", testerEnviado: true },
        { estadoDecision: "APROBADO", cargadoERP: true, motivo: "SOBRESTOCK", testerEnviado: false },
      ]),
    ).toBe("FINALIZADA");
  });
});

describe("evaluarCierre (notificación a la farmacia)", () => {
  it("no notifica si aún EN_PROCESO", () => {
    const r = evaluarCierre(
      [
        { estadoDecision: "APROBADO", cargadoERP: false },
        { estadoDecision: "PENDIENTE", cargadoERP: false },
      ],
      false,
    );
    expect(r.notificar).toBe(false);
    expect(r.tipo).toBeNull();
  });
  it("CONSOLIDADO al finalizar con al menos un aprobado", () => {
    const r = evaluarCierre(
      [
        { estadoDecision: "APROBADO", cargadoERP: true },
        { estadoDecision: "RECHAZADO", cargadoERP: false },
      ],
      false,
    );
    expect(r.finalizada).toBe(true);
    expect(r.notificar).toBe(true);
    expect(r.tipo).toBe("CONSOLIDADO");
  });
  it("RECHAZO_TOTAL al finalizar con 100% rechazos (bug corregido)", () => {
    const r = evaluarCierre(
      [
        { estadoDecision: "RECHAZADO", cargadoERP: false },
        { estadoDecision: "RECHAZADO", cargadoERP: false },
      ],
      false,
    );
    expect(r.finalizada).toBe(true);
    expect(r.notificar).toBe(true);
    expect(r.tipo).toBe("RECHAZO_TOTAL");
  });
  it("no re-notifica si ya se notificó (anti-duplicado)", () => {
    const r = evaluarCierre(
      [{ estadoDecision: "APROBADO", cargadoERP: true }],
      true,
    );
    expect(r.finalizada).toBe(true);
    expect(r.notificar).toBe(false);
  });
});

// ─── Claves de deduplicación ──────────────────────────────────
describe("email-keys", () => {
  it("genera claves estables y distintas", () => {
    expect(dedupConsolidadoFarmacia("s1")).toBe("consolidado-farmacia:s1");
    expect(dedupRechazoTotal("s1")).toBe("rechazo-total:s1");
  });
});
