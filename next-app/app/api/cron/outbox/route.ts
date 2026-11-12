import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { processOutbox } from "@/lib/email/outbox";

// ─────────────────────────────────────────────────────────────
// GET/POST /api/cron/outbox
// Procesa la cola de correos. Lo llama un cron externo (el workflow
// .github/workflows/correos.yml, o Vercel Cron) con el encabezado
// Authorization: Bearer <CRON_SECRET>.
//
// Solo acepta el secreto. El administrador ya no lo dispara desde acá
// con su sesión (un GET con efectos y cookies se podía gatillar desde
// otro sitio): usa el botón "Procesar cola ahora" de Admin → Correos.
// ─────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secretoValido(recibido: string | null): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || !recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(`Bearer ${secreto}`);
  // Comparación en tiempo constante (no delata cuántos caracteres acertó).
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handler(req: NextRequest) {
  if (!secretoValido(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const resultado = await processOutbox();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    console.error("[cron/outbox] error:", e);
    return NextResponse.json({ ok: false, error: "Error procesando la cola" }, { status: 500 });
  }
}

export const GET = handler;
export const POST = handler;
