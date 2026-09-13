import type {
  Role,
  EstadoSolicitud,
  EstadoDecision,
  MotivoSolicitud,
} from "@prisma/client";

export type { Role, EstadoSolicitud, EstadoDecision, MotivoSolicitud };

// Extensión del tipo de sesión de NextAuth
declare module "next-auth" {
  interface User {
    role: Role;
    nombre: string;
    farmaciaId?: number | null;
  }
  interface Session {
    user: User & { id: string };
  }
}

// El token JWT por defecto (@auth/core) ya admite claves arbitrarias
// (extiende Record<string, unknown>), por eso no augmentamos "next-auth/jwt":
// los callbacks en auth.config.ts setean/leen role, nombre y farmaciaId con cast.

// ─── DTOs y tipos de UI ───────────────────────────────────────

export type ArticuloLookup = {
  codigoBarra: string;
  descripcion: string;
  laboratorio: string;
  categoria: string | null;
  stockReferencia: number | null;
  /** Comprador resuelto por laboratorio (puede no existir → requiere alta). */
  compradorId: string | null;
  compradorNombre: string | null;
  compradorMail: string | null;
};

/** Estado de validación de una fila de la grilla de carga. */
export type EstadoFila = "VACIA" | "BUSCANDO" | "OK" | "ERROR";

export type ItemGrillaRow = {
  id: string; // id local de UI
  codigoBarra: string;
  descripcion: string;
  laboratorio: string;
  categoria: string | null;
  cantidad: number | "";
  motivo: MotivoSolicitud | "";
  fechaVencimiento: string; // MM/AA
  observaciones: string;
  // Datos resueltos del lookup (no editables por el operador):
  compradorId: string | null;
  compradorMail: string | null;
  estado: EstadoFila;
  error?: string;
};

// ─── Motivos del dominio real (ofertas comerciales) ───────────

export const MOTIVOS: { value: MotivoSolicitud; label: string }[] = [
  { value: "VENCIMIENTO_PROXIMO", label: "Vencimiento próximo" },
  { value: "STOCK_INMOVILIZADO", label: "Stock inmovilizado" },
  { value: "SOBRESTOCK", label: "Sobrestock" },
];

export const MOTIVO_LABEL: Record<MotivoSolicitud, string> = {
  VENCIMIENTO_PROXIMO: "Vencimiento próximo",
  STOCK_INMOVILIZADO: "Stock inmovilizado",
  SOBRESTOCK: "Sobrestock",
};

export const ESTADO_DECISION_LABEL: Record<EstadoDecision, string> = {
  PENDIENTE: "Pendiente",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
};

export const ESTADO_SOLICITUD_LABEL: Record<EstadoSolicitud, string> = {
  PENDIENTE: "Pendiente",
  EN_PROCESO: "En proceso",
  FINALIZADA: "Finalizada",
};
