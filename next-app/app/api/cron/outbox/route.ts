import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { processOutbox } from "@/lib/email/outbox";

// ─────────────────────────────────────────────────────────────
// POST/GET /api/cron/outbox
// Procesa la cola de correos. Pensado para un cron externo
// (Vercel Cron, QStash, GitHub Action) que llame cada 1-2 min con
// el header Authorization: Bearer <CRON_SECRET>. También lo puede
// disparar un ADMIN logueado (para forzar el envío manualmente).
// ─────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

async function handler(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const autorizadoPorCron =
    !!secret && authHeader === `Bearer ${secret}`;

  let autorizadoPorAdmin = false;
  if (!autorizadoPorCron) {
    const session = await auth();
    autorizadoPorAdmin =
      (session?.user as { role?: string } | undefined)?.role === "ADMIN";
  }

  if (!autorizadoPorCron && !autorizadoPorAdmin) {
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
