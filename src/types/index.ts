import type { Role, EstadoSolicitud, EstadoDecision } from "@prisma/client";

// ─────────────────────────────────────────────────────────────
// Re-exportamos los enums de Prisma para usarlos en el cliente
// sin importar desde @prisma/client directamente (que puede
// causar problemas en componentes Client Components).
// ─────────────────────────────────────────────────────────────
export type { Role, EstadoSolicitud, EstadoDecision };

// Extensión del tipo de sesión de NextAuth
declare module "next-auth" {
  interface User {
    role: Role;
    nombre: string;
    farmaciaId?: number | null;
  }
  interface Session {
    user: User & {
      id: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
    nombre: string;
    farmaciaId?: number | null;
  }
}

// ─── DTOs y tipos de UI ───────────────────────────────────────

export type ArticuloLookup = {
  codigoBarra: string;
  descripcion: string;
  laboratorio: string;
  categoria: string | null;
};

// Fila de la grilla de carga rápida de la farmacia (estado local)
export type ItemGrillaRow = {
  id: string; // UUID local para key de React
  codigoBarra: string;
  descripcion: string;
  laboratorio: string;
  cantidad: number;
  motivo: string;
  error?: string; // Mensaje de error de validación inline
};

export type MotivoSolicitud =
  | "FALTANTE"
  | "STOCK_BAJO"
  | "PEDIDO_ESPECIAL"
  | "DEVOLUCION";

export const MOTIVOS: { value: MotivoSolicitud; label: string }[] = [
  { value: "FALTANTE",       label: "Faltante de stock" },
  { value: "STOCK_BAJO",     label: "Stock bajo mínimo" },
  { value: "PEDIDO_ESPECIAL", label: "Pedido especial" },
  { value: "DEVOLUCION",     label: "Devolución" },
];
