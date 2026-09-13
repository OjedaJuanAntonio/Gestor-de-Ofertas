// ─────────────────────────────────────────────────────────────
// Distribución multicomprador (Módulo 1).
// Tras enviar un lote, los ítems se agrupan por comprador para
// disparar un correo personalizado a cada uno. Los ítems sin
// comprador asignado (laboratorio sin responsable) se aíslan para
// alertar al admin en vez de perderse silenciosamente.
// ─────────────────────────────────────────────────────────────

export type ItemDistribuible = {
  compradorId: string | null;
  compradorMail: string | null;
};

export type GrupoComprador<T> = {
  compradorId: string;
  compradorMail: string;
  items: T[];
};

export type ResultadoDistribucion<T> = {
  grupos: GrupoComprador<T>[];
  /** Ítems cuyo laboratorio no tiene comprador asignado. */
  sinComprador: T[];
};

export function agruparPorComprador<T extends ItemDistribuible>(
  items: T[],
): ResultadoDistribucion<T> {
  const mapa = new Map<string, GrupoComprador<T>>();
  const sinComprador: T[] = [];

  for (const item of items) {
    if (!item.compradorId || !item.compradorMail) {
      sinComprador.push(item);
      continue;
    }
    const grupo = mapa.get(item.compradorId);
    if (grupo) {
      grupo.items.push(item);
    } else {
      mapa.set(item.compradorId, {
        compradorId: item.compradorId,
        compradorMail: item.compradorMail,
        items: [item],
      });
    }
  }

  return { grupos: [...mapa.values()], sinComprador };
}
