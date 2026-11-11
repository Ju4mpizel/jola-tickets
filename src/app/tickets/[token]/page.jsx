import TicketCard from '@/features/ticket/TicketCard';

/** El enlace del boleto es la entrada: no se indexa y no se envía como referer a otros sitios. */
export const metadata = {
  title: 'Tu entrada · JOLA',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/**
 * /tickets/{token}: boleto digital permanente (el QR del boleto apunta a esta misma URL).
 * @param {{ params: Promise<{ token: string }> }} props
 */
export default async function TicketPage({ params }) {
  const { token } = await params;
  return <TicketCard token={token} />;
}
