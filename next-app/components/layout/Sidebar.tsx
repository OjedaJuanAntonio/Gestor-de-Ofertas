"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Package,
  Users,
  Upload,
  ClipboardList,
  Inbox,
  CheckSquare,
  BarChart3,
  Mail,
  UserX,
  FlaskConical,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";
import { Button } from "@/components/ui/button";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
};

const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  ADMIN: [
    { label: "Reportes",        href: "/admin/analytics", icon: BarChart3 },
    { label: "Usuarios",        href: "/admin/usuarios",  icon: Users },
    { label: "Farmacias",       href: "/admin/farmacias", icon: Package },
    { label: "Artículos / CSV", href: "/admin/articulos", icon: Upload },
    { label: "Sin asignar",     href: "/admin/sin-asignar", icon: UserX },
    { label: "Correos",         href: "/admin/correos",   icon: Mail },
  ],
  FARMACIA: [
    { label: "Nueva Solicitud", href: "/farmacia/nueva-solicitud", icon: ClipboardList },
    { label: "Mis Solicitudes", href: "/farmacia/mis-solicitudes", icon: Package },
  ],
  COMPRADOR: [
    { label: "Bandeja de Entrada", href: "/comprador/bandeja", icon: Inbox },
    { label: "Testers", href: "/comprador/testers", icon: FlaskConical },
  ],
  PRECIOS: [
    { label: "Dashboard ERP", href: "/precios/dashboard", icon: CheckSquare },
  ],
};

const ADMIN_FULL_NAV: NavItem[] = [
  ...NAV_BY_ROLE.ADMIN,
  ...NAV_BY_ROLE.FARMACIA,
  ...NAV_BY_ROLE.COMPRADOR,
  ...NAV_BY_ROLE.PRECIOS,
];

type SidebarProps = {
  role: Role;
  nombre: string;
  email: string;
  badges?: Record<string, number>;
};

export function Sidebar({ role, nombre, email, badges = {} }: SidebarProps) {
  const pathname = usePathname();
  const navItems = role === "ADMIN" ? ADMIN_FULL_NAV : (NAV_BY_ROLE[role] ?? []);

  return (
    <aside className="flex flex-col w-60 min-h-screen bg-slate-900 text-slate-100 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-700">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500 shrink-0">
          <Package className="w-4 h-4 text-white" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold">Gestor de Ofertas</p>
          <p className="text-xs text-slate-400">Droguería Central</p>
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {badges[item.href] ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                  {badges[item.href]}
                </span>
              ) : isActive ? (
                <ChevronRight className="w-3.5 h-3.5 opacity-70" />
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-slate-700 space-y-2">
        <div className="px-3 py-2">
          <p className="text-sm font-medium text-slate-200 truncate">{nombre}</p>
          <p className="text-xs text-slate-400 truncate">{email}</p>
          <span className="inline-block mt-1 text-xs bg-slate-700 text-slate-300 rounded px-1.5 py-0.5">
            {role}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full justify-start gap-3 text-slate-300 hover:text-white hover:bg-slate-800 px-3"
        >
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </Button>
      </div>
    </aside>
  );
}
