// Convierte pedidos y productos de WooCommerce al formato común del informe
const rawOrders = $('Pedidos WooCommerce').all().map((i) => i.json).filter((o) => o && o.id);
const rawProducts = $input.all().map((i) => i.json).filter((p) => p && p.id);
const counts = {};
const sorted = rawOrders.slice().sort((a, b) => String(a.date_created).localeCompare(String(b.date_created)));
const orders = sorted.map((o) => {
  const who = o.billing?.email || String(o.customer_id || o.id);
  counts[who] = (counts[who] || 0) + 1;
  const status = ['completed', 'processing'].includes(o.status) ? 'paid'
    : o.status === 'refunded' ? 'refunded' : ['cancelled', 'failed'].includes(o.status) ? 'cancelled' : 'pending';
  const meta = (o.meta_data || []).find((m) => m.key === '_wc_order_attribution_source_type' || m.key === '_wc_order_attribution_utm_source');
  return {
    id: `#${o.number || o.id}`,
    date: o.date_created_gmt ? o.date_created_gmt + 'Z' : o.date_created,
    status,
    total: Number(o.total || 0),
    customer: who,
    returning: counts[who] > 1,
    channel: meta ? String(meta.value) : (o.created_via === 'checkout' ? 'Web' : o.created_via || 'Otro'),
    lines: (o.line_items || []).map((l) => ({ sku: l.sku || String(l.product_id), name: l.name, qty: Number(l.quantity || 0), price: Number(l.price || 0) })),
  };
});
const products = rawProducts
  .filter((p) => p.manage_stock)
  .map((p) => ({ sku: p.sku || String(p.id), name: p.name, price: Number(p.price || 0), stock: Number(p.stock_quantity || 0) }));
return [{ json: { orders, products, fuente: 'woocommerce' } }];
