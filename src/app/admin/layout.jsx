/**
 * Panel de la directiva. No se indexa y ninguna página pública enlaza aquí.
 * La protección real está en el servidor (cada ruta /admin/* exige el JWT y la tabla admins);
 * las páginas solo redirigen al login si no hay sesión.
 */
export const metadata = {
  title: 'JOLA Admin',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function AdminLayout({ children }) {
  return (
    <div className="mx-auto max-w-[1180px] px-3.5 pt-3.5 pb-[calc(32px+env(safe-area-inset-bottom))] max-[380px]:px-2.5 lg:px-7 lg:pt-6">
      {children}
    </div>
  );
}
