import "server-only";
import { after } from "next/server";
import { processOutbox } from "@/lib/email/outbox";

// ─────────────────────────────────────────────────────────────
// Despacho inmediato de la cola de correos.
//
// Las acciones que encolan un correo (cierre de una solicitud) llaman
// a esto: apenas se responde al usuario, se procesa la cola, sin
// esperar al cron. El cron (ver .github/workflows/correos.yml) queda
// como red de seguridad para los reintentos.
//
// `after` solo existe dentro de un request. Fuera de uno (tests,
// scripts) no hay nada que despachar acá: lo toma el cron.
// ─────────────────────────────────────────────────────────────

export function despacharColaLuego(): void {
  try {
    after(async () => {
      try {
        await processOutbox();
      } catch (e) {
        console.error("[outbox] falló el despacho inmediato:", e);
      }
    });
  } catch {
    /* fuera de un request: la cola la procesa el cron */
  }
}
