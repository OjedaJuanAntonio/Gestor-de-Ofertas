import { describe, it, expect } from "vitest";
import { renderEmail } from "./templates";

describe("renderEmail", () => {
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
    const r = renderEmail("CONSOLIDADO_FARMACIA", {
      codigo: "SOL-1",
      farmacia: "Farmacia Z",
      items: [
        {
          descripcion: "<script>alert(1)</script>",
          codigoBarra: "1",
          cantidad: 1,
          estado: "APROBADO",
          condicion: "10%",
          motivoRechazo: null,
        },
      ],
    });
    expect(r.html).not.toContain("<script>alert(1)</script>");
    expect(r.html).toContain("&lt;script&gt;");
  });
});
