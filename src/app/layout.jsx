import '@fontsource-variable/fredoka';
import '@fontsource-variable/urbanist';
import { ThemeProvider } from 'next-themes';
import ToastProvider from '@/components/ui/ToastProvider';
import { EVENT } from '@/lib/event';
import './globals.css';

export const metadata = {
  title: `JOLA · ${EVENT.name}`,
  description: `Compra tus entradas para el ${EVENT.name} de ${EVENT.school}. ${EVENT.dateLong}, ${EVENT.place}.`,
  icons: { icon: '/images/logo-jola.png', apple: '/images/logo-jola.png' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F7FB' },
    { media: '(prefers-color-scheme: dark)', color: '#060D22' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="es-BO" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="jola-theme">
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
