// Layout para rutas públicas (login, etc.)
// Sin sidebar, sin autenticación requerida
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
