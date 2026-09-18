// Convierte pedidos y productos de Shopify al formato común del informe
const rawOrders = $('Pedidos Shopify').all().map((i) => i.json).filter((o) => o && o.id);
const rawProducts = $input.all().map((i) => i.json).filter((p) => p && p.id);
const counts = {};
rawOrders.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
const orders = rawOrders.map((o) => {
  const email = o.email || o.customer?.email || String(o.customer?.id || o.id);
  const refunded = o.financial_status === 'refunded';
  const status = o.cancelled_at ? 'cancelled' : refunded ? 'refunded' : ['paid', 'partially_paid', 'authorized'].includes(o.financial_status) ? 'paid' : 'pending';
  counts[email] = (counts[email] || 0) + 1;
  const returning = (o.customer?.orders_count ?? 1) > 1 || counts[email] > 1;
  return {
    id: o.name || String(o.id),
    date: o.created_at || o.processed_at,
    status,
    total: Number(o.current_total_price ?? o.total_price ?? 0),
    customer: email,
    returning,
    channel: o.source_name === 'web' ? (o.referring_site ? 'Referido' : 'Web') : (o.source_name || 'Otro'),
    lines: (o.line_items || []).map((l) => ({ sku: l.sku || String(l.product_id), name: l.title, qty: Number(l.quantity || 0), price: Number(l.price || 0) })),
  };
});
const products = [];
for (const p of rawProducts) {
  const variants = p.variants || [];
  const tracked = variants.filter((v) => v.inventory_management);
  if (!tracked.length) continue; // sin control de stock: no se puede avisar
  const skus = variants.map((v) => v.sku).filter(Boolean);
  products.push({
    sku: skus[0] || String(p.id),
    skus,
    name: p.title,
    price: Number(variants[0]?.price || 0),
    stock: tracked.reduce((s, v) => s + Number(v.inventory_quantity || 0), 0),
  });
}
return [{ json: { orders, products, fuente: 'shopify' } }];
