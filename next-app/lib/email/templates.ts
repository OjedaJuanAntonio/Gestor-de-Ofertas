import type { EmailTipo } from "@prisma/client";

// ─────────────────────────────────────────────────────────────
// Plantillas de los correos transaccionales (puras y testeables).
// render(tipo, payload) → { subject, html, text }
// ─────────────────────────────────────────────────────────────

export type RenderedEmail = { subject: string; html: string; text: string };

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string,
  );

const layout = (titulo: string, cuerpo: string) => `
<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1e293b">
  <div style="background:#2563eb;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0">
    <strong style="font-size:18px">Droguería Central</strong> · Gestor de Ofertas
  </div>
  <div style="border:1px solid #e2e8f0;border-top:none;padding:20px;border-radius:0 0 10px 10px">
    <h2 style="margin:0 0 12px;font-size:18px">${titulo}</h2>
    ${cuerpo}
  </div>
</div>`;

export type ConsolidadoItem = {
  descripcion: string;
  codigoBarra: string;
  cantidad: number;
  estado: string;
  condicion: string | null;
  motivoRechazo: string | null;
};

function renderConsolidado(p: Record<string, unknown>): RenderedEmail {
  const codigo = esc(p.codigo);
  const items = (Array.isArray(p.items) ? p.items : []) as ConsolidadoItem[];
  const aprobados = items.filter((i) => i.estado === "APROBADO");
  const rechazados = items.filter((i) => i.estado === "RECHAZADO");

  const filasAprob = aprobados
    .map(
      (i) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #f1f5f9">${esc(i.descripcion)}</td><td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:center">${i.cantidad}</td><td style="padding:6px 8px;border-bottom:1px solid #f1f5f9"><strong style="color:#16a34a">${esc(i.condicion ?? "—")}</strong></td></tr>`,
    )
    .join("");
  const filasRech = rechazados
    .map(
      (i) =>
        `<li>${esc(i.descripcion)} (x${i.cantidad})${i.motivoRechazo ? ` — ${esc(i.motivoRechazo)}` : ""}</li>`,
    )
    .join("");

  const cuerpo = `
    <p>Tu solicitud <strong>${codigo}</strong> fue procesada. Este es el resultado final:</p>
    ${
      aprobados.length
        ? `<h3 style="font-size:15px;margin:16px 0 6px;color:#16a34a">Aprobados (${aprobados.length})</h3>
           <table style="width:100%;border-collapse:collapse;font-size:14px">
             <tr style="background:#f8fafc"><th style="text-align:left;padding:6px 8px">Producto</th><th style="padding:6px 8px">Cant.</th><th style="text-align:left;padding:6px 8px">Condición</th></tr>
             ${filasAprob}
           </table>`
        : ""
    }
    ${
      rechazados.length
        ? `<h3 style="font-size:15px;margin:16px 0 6px;color:#dc2626">Rechazados (${rechazados.length})</h3><ul style="font-size:14px;margin:0;padding-left:18px">${filasRech}</ul>`
        : ""
    }`;
  return {
    subject: `Resultado de tu solicitud ${p.codigo}`,
    html: layout("Resultado de tu solicitud", cuerpo),
    text: `Solicitud ${p.codigo}: ${aprobados.length} aprobados, ${rechazados.length} rechazados.`,
  };
}

function renderRechazoTotal(p: Record<string, unknown>): RenderedEmail {
  const codigo = esc(p.codigo);
  const cuerpo = `
    <p>Tu solicitud <strong>${codigo}</strong> fue revisada. En esta oportunidad <strong>no se aprobó ninguno</strong> de los ítems solicitados.</p>
    <p>Podés consultar el detalle en el sistema o cargar una nueva solicitud cuando lo necesites.</p>`;
  return {
    subject: `Tu solicitud ${p.codigo} fue revisada`,
    html: layout("Solicitud revisada", cuerpo),
    text: `Tu solicitud ${p.codigo} fue revisada. No se aprobó ningún ítem en esta oportunidad.`,
  };
}

export function renderEmail(
  tipo: EmailTipo,
  payload: Record<string, unknown>,
): RenderedEmail {
  switch (tipo) {
    case "CONSOLIDADO_FARMACIA":
      return renderConsolidado(payload);
    case "RECHAZO_TOTAL_FARMACIA":
      return renderRechazoTotal(payload);
    default:
      return {
        subject: "Notificación",
        html: layout("Notificación", "<p>Sin contenido.</p>"),
        text: "Notificación",
      };
  }
}
