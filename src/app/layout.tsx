import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "next-auth/react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Gestor de Ofertas | Droguería Central",
  description: "Sistema de gestión de solicitudes de ofertas entre farmacias y la droguería central.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={inter.className}>
        {/* SessionProvider habilita useSession() en Client Components */}
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
