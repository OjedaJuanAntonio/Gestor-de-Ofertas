import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { lookupArticulo } from "@/lib/data/articulos";
import { rateLimit } from "@/lib/rate-limit";

// ─────────────────────────────────────────────────────────────
// GET /api/articulos/lookup?ean=XXXX
// Autocompletado de la grilla de carga. Devuelve el artículo +
// comprador resuelto, o 404 si no existe en el maestro.
// Requiere sesión (rol FARMACIA o ADMIN). Rate-limited.
// ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!session?.user || (role !== "FARMACIA" && role !== "ADMIN")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;
  const rl = rateLimit(`lookup:${userId}`, 600, 60_000); // 600/min por usuario
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Demasiadas búsquedas, esperá un momento." },
      { status: 429, headers: { "Retry-After": "10" } },
    );
  }

  const ean = req.nextUrl.searchParams.get("ean") ?? "";
  if (!ean.trim()) {
    return NextResponse.json({ error: "Falta el parámetro ean" }, { status: 400 });
  }

  try {
    const articulo = await lookupArticulo(ean);
    if (!articulo) {
      return NextResponse.json(
        { found: false, error: "Producto inexistente" },
        { status: 404 },
      );
    }
    return NextResponse.json({ found: true, articulo });
  } catch (e) {
    console.error("[lookup] error:", e);
    return NextResponse.json(
      { error: "Error interno al buscar el artículo" },
      { status: 500 },
    );
  }
}
