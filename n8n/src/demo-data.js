// Datos de ejemplo realistas: 10 semanas de pedidos de una tienda de ropa y accesorios.
// Con un cliente real esta rama se sustituye por Shopify o WooCommerce (ver Configuración).
const cfg = $('Configuración').first().json;
const DAY = 86400000;
const products = [
  { sku: 'CAM-01', name: 'Camiseta básica algodón orgánico', price: 19.9, stock: 140, weight: 9 },
  { sku: 'SUD-02', name: 'Sudadera con capucha', price: 44.9, stock: 160, weight: 5 },
  { sku: 'GOR-03', name: 'Gorra bordada', price: 17.5, stock: 60, weight: 4 },
  { sku: 'MOC-04', name: 'Mochila urbana impermeable', price: 59.0, stock: 3, weight: 2 },
  { sku: 'TAZ-05', name: 'Taza de cerámica 350 ml', price: 12.9, stock: 85, weight: 4 },
  { sku: 'CAL-06', name: 'Pack 3 calcetines', price: 14.9, stock: 150, weight: 6 },
  { sku: 'BOL-07', name: 'Tote bag lona', price: 16.0, stock: 44, weight: 3 },
  { sku: 'CHA-08', name: 'Chaqueta cortavientos', price: 79.0, stock: 14, weight: 1.5 },
  { sku: 'BOT-09', name: 'Botella térmica 500 ml', price: 24.5, stock: 0, weight: 2 },
  { sku: 'PAN-10', name: 'Pañuelo estampado', price: 11.0, stock: 70, weight: 1.5 },
];
const channels = [['Orgánico', 0.38], ['Instagram', 0.27], ['Google Ads', 0.2], ['Email', 0.15]];
let seed = 20260917;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pick = (pairs) => { let r = rnd() * pairs.reduce((s, p) => s + p[1], 0); for (const p of pairs) { if ((r -= p[1]) <= 0) return p[0]; } return pairs[0][0]; };
const totalW = products.reduce((s, p) => s + p.weight, 0);
const pickProduct = () => pick(products.map((p) => [p, p.weight / totalW]));

const end = new Date(cfg.periodo.semana_fin).getTime();
const orders = [];
const customers = [];
let n = 1000;
for (let d = 70; d >= 1; d--) {
  const day = new Date(end - d * DAY);
  const weekday = (day.getDay() + 6) % 7;
  const growth = 1 + (70 - d) * 0.004;                       // la tienda crece poco a poco
  const base = [18, 17, 18, 20, 24, 27, 22][weekday];          // más ventas en fin de semana
  const count = Math.round(base * growth * (0.8 + rnd() * 0.4));
  for (let i = 0; i < count; i++) {
    const returning = customers.length > 20 && rnd() < 0.34;
    let customer;
    if (returning) customer = customers[Math.floor(rnd() * customers.length)];
    else { customer = `cliente-${customers.length + 1}`; customers.push(customer); }
    const lines = [];
    const nLines = rnd() < 0.7 ? 1 : rnd() < 0.8 ? 2 : 3;
    for (let l = 0; l < nLines; l++) {
      const p = pickProduct();
      const qty = rnd() < 0.85 ? 1 : 2;
      const existing = lines.find((x) => x.sku === p.sku);
      if (existing) existing.qty += qty; else lines.push({ sku: p.sku, name: p.name, qty, price: p.price });
    }
    const subtotal = lines.reduce((s, x) => s + x.qty * x.price, 0);
    const shipping = subtotal >= 50 ? 0 : 4.95;
    const r = rnd();
    orders.push({
      id: `#${++n}`,
      date: new Date(day.getTime() + Math.floor(rnd() * DAY)).toISOString(),
      status: r < 0.035 ? 'cancelled' : r < 0.085 ? 'refunded' : 'paid',
      total: Math.round((subtotal + shipping) * 100) / 100,
      customer, returning,
      channel: pick(channels),
      lines,
    });
  }
}
return [{ json: {
  orders,
  products: products.map(({ sku, name, price, stock }) => ({ sku, name, price, stock })),
  fuente: 'demo',
} }];
