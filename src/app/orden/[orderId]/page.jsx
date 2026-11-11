import OrderStatus from '@/features/order/OrderStatus';

/** El enlace lleva el token de la orden: no se indexa y no se envía como referer a otros sitios. */
export const metadata = {
  title: 'Estado de tu compra · JOLA',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

/**
 * /orden/{orderId}?k={access_token}: estado de la orden desde cualquier dispositivo.
 * @param {{ params: Promise<{ orderId: string }>, searchParams: Promise<Record<string, string | string[]>> }} props
 */
export default async function OrderPage({ params, searchParams }) {
  const { orderId } = await params;
  const query = await searchParams;
  const one = (v) => (Array.isArray(v) ? v[0] : v) ?? '';
  return <OrderStatus orderId={orderId} token={one(query.k)} mock={one(query.mock)} />;
}
