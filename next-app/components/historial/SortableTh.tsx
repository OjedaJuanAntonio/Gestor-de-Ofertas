// Cabecera de columna ordenable (tipo planilla): clic para ordenar, con flecha.
// Presentacional: la página calcula el href (toggle de dirección) y el estado activo.

type Dir = "asc" | "desc";

export function SortableTh({
  label,
  col,
  activeSort,
  dir,
  hrefFor,
  className,
}: {
  label: string;
  col: string;
  activeSort: string;
  dir: Dir;
  /** Devuelve la URL para ordenar por `col` en la dirección dada. */
  hrefFor: (col: string, dir: Dir) => string;
  className?: string;
}) {
  const active = activeSort === col;
  const nextDir: Dir = active && dir === "asc" ? "desc" : "asc";
  const arrow = active ? (dir === "asc" ? "↑" : "↓") : "↕";
  return (
    <th className={className}>
      <a
        href={hrefFor(col, nextDir)}
        className="inline-flex items-center gap-1 hover:text-slate-900"
        aria-label={`Ordenar por ${label}`}
      >
        <span>{label}</span>
        <span className={`text-xs ${active ? "text-blue-600" : "text-slate-400"}`}>{arrow}</span>
      </a>
    </th>
  );
}
