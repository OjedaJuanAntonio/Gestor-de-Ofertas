import { describe, it, expect } from "vitest";
import { renderEmail } from "./templates";

describe("renderEmail", () => {
  it("NOTIF_COMPRADOR incluye cantidad y código", () => {
    const r = renderEmail("NOTIF_COMPRADOR", {
      codigo: "SOL-123",
      cantidad: 3,
      farmacia: "Farmacia X",
    });
    expect(r.subject).toContain("SOL-123");
    expect(r.subject).toContain("3");
    expect(r.html).toContain("Farmacia X");
    expect(r.text).toContain("SOL-123");
  });

  it("CONSOLIDADO separa aprobados y rechazados", () => {
    const r = renderEmail("CONSOLIDADO_FARMACIA", {
      codigo: "SOL-9",
      farmacia: "Farmacia Y",
      items: [
        { descripcion: "Aspirina", codigoBarra: "1", cantidad: 5, estado: "APROBADO", condicion: "50%", motivoRechazo: null },
        { descripcion: "Bepanthen", codigoBarra: "2", cantidad: 2, estado: "RECHAZADO", condicion: null, motivoRechazo: "Vence" },
      ],
    });
    expect(r.html).toContain("Aprobados (1)");
    expect(r.html).toContain("Rechazados (1)");
    expect(r.html).toContain("50%");
    expect(r.text).toContain("1 aprobados, 1 rechazados");
  });

  it("RECHAZO_TOTAL menciona que no se aprobó nada", () => {
    const r = renderEmail("RECHAZO_TOTAL_FARMACIA", { codigo: "SOL-5" });
    expect(r.subject).toContain("SOL-5");
    expect(r.html.toLowerCase()).toContain("no se aprobó");
  });

  it("escapa HTML para evitar inyección", () => {
    const r = renderEmail("NOTIF_COMPRADOR", {
      codigo: "SOL-1",
      cantidad: 1,
      farmacia: "<script>alert(1)</script>",
    });
    expect(r.html).not.toContain("<script>alert(1)</script>");
    expect(r.html).toContain("&lt;script&gt;");
  });
});
