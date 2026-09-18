const assert = require('assert');
const fs = require('fs');
const { runCode } = require('./harness');

(async () => {
  const REAL = [["telegram_chat_id: 'TU_CHAT_ID'", "telegram_chat_id: '123456789'"],
    ["email_to: 'cliente@ejemplo.com'", "email_to: 'dueno@tienda.test'"],
    ["email_from: 'informes@tu-dominio.com'", "email_from: 'informes@denoro.test'"]];
  await assert.rejects(runCode('config.js'), /valor de ejemplo/);
  const cfg = await runCode('config.js', { replace: REAL });
  assert.strictEqual(cfg[0].json.enviar_email, true);
  const P = cfg[0].json.periodo;
  const ws = new Date(P.semana_inicio), we = new Date(P.semana_fin);
  const madrid = (d, o) => d.toLocaleString('en-GB', { timeZone: 'Europe/Madrid', ...o });
  // la semana va de lunes 00:00 a lunes 00:00 hora de Madrid, aunque el servidor esté en UTC
  assert.strictEqual(madrid(ws, { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }), 'Mon 00:00');
  assert.strictEqual(madrid(we, { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }), 'Mon 00:00');
  assert.strictEqual(P.dias.length, 8);
  assert.ok(Math.abs((we - ws) / 3600000 - 168) <= 1, 'una semana (±1 h por cambio de hora)');
  assert.strictEqual(madrid(new Date(P.mes_inicio), { day: 'numeric', hour: '2-digit', hour12: false }), '1, 00');
  assert.ok(new Date(P.mes_fin) > new Date(P.mes_inicio));

  // demo
  const demo = await runCode('demo-data.js', { nodes: { 'Configuración': cfg } });
  const { orders, products } = demo[0].json;
  assert.ok(orders.length > 1000, `pedidos demo: ${orders.length}`);
  assert.ok(orders.every((o) => o.lines.length && o.total > 0));
  const again = await runCode('demo-data.js', { nodes: { 'Configuración': cfg } });
  assert.deepStrictEqual(again[0].json.orders.slice(0, 5), orders.slice(0, 5), 'datos deterministas');

  const rep = await runCode('report.js', { input: demo, nodes: { 'Configuración': cfg } });
  const r = rep[0].json;
  assert.ok(r.kpis.ventas.actual > 1000 && r.kpis.pedidos.actual > 100, JSON.stringify(r.kpis.ventas));
  assert.strictEqual(r.ventas_por_dia.length, 7);
  const sumDays = r.ventas_por_dia.reduce((s, d) => s + d.ventas, 0);
  assert.ok(Math.abs(sumDays - r.kpis.ventas.actual) < 0.05, 'la suma diaria cuadra con el total');
  assert.strictEqual(r.top_productos.length, 5);
  assert.ok(r.stock_bajo.some((s) => s.sku === 'BOT-09' && s.agotado));
  assert.ok(r.stock_bajo.some((s) => s.sku === 'MOC-04'));
  assert.ok(r.stock_bajo.some((s) => s.sku === 'CHA-08' && !s.agotado && s.stock > 5), 'aviso por cobertura');
  assert.ok(!r.stock_bajo.some((s) => s.sku === 'CAM-01'));
  assert.ok(r.objetivo && r.objetivo.proyeccion > 0);
  assert.ok(r.conclusiones.length >= 4);
  assert.ok(r.telegram.length <= 1000);
  assert.strictEqual(r.enviar_telegram, true);
  const domingo = new Date(new Date(P.semana_fin) - 1).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short' });
  assert.ok(r.asunto.includes(domingo), `el periodo termina en domingo: ${r.asunto}`);
  assert.strictEqual(rep[0].binary.index_html.fileName, 'index.html');
  const pdfHtml = Buffer.from(rep[0].binary.index_html.data, 'base64').toString('utf8');
  assert.ok(pdfHtml.includes('@page'));
  fs.writeFileSync('/tmp/informe_email.html', r.email_html);
  fs.writeFileSync('/tmp/informe_pdf.html', pdfHtml);

  // adjunto: con PDF y sin PDF
  const nodes = { 'Calcular KPIs e informe': rep };
  const withPdf = await runCode('attach.js', { input: [{ json: {}, binary: { informe_pdf: { data: 'JVBERi0=', mimeType: 'application/pdf', fileName: 'x' } } }], nodes });
  assert.strictEqual(withPdf[0].binary.informe.mimeType, 'application/pdf');
  assert.ok(withPdf[0].binary.informe.fileName.endsWith('.pdf'));
  const noPdf = await runCode('attach.js', { input: [{ json: { error: { message: 'ECONNREFUSED' } } }], nodes });
  assert.strictEqual(noPdf[0].json.pdf_generado, false);
  assert.strictEqual(noPdf[0].binary.informe.mimeType, 'text/html');
  assert.ok(noPdf[0].binary.informe.fileName.endsWith('.html'));

  // Shopify
  const iso = (d) => new Date(ws.getTime() + d * 86400000 + 3600000).toISOString();
  const shopOrders = [
    { id: 1, name: '#1001', created_at: iso(0), financial_status: 'paid', total_price: '50.00', email: 'a@x.com', source_name: 'web',
      line_items: [{ sku: 'A', title: 'Prod A', quantity: 2, price: '25.00' }] },
    { id: 2, name: '#1002', created_at: iso(1), financial_status: 'refunded', total_price: '30.00', email: 'b@x.com', source_name: 'pos',
      line_items: [{ sku: 'B', title: 'Prod B', quantity: 1, price: '30.00' }] },
    { id: 3, name: '#1003', created_at: iso(2), financial_status: 'paid', cancelled_at: iso(2), total_price: '10.00', email: 'a@x.com', line_items: [] },
    { id: 4, name: '#1004', created_at: iso(-3), financial_status: 'paid', total_price: '40.00', email: 'a@x.com', source_name: 'web',
      line_items: [{ sku: 'A', title: 'Prod A', quantity: 2, price: '20.00' }] },
  ];
  const shopProducts = [
    { id: 10, title: 'Prod A', variants: [{ sku: 'A', price: '25.00', inventory_management: 'shopify', inventory_quantity: 3 }] },
    { id: 11, title: 'Sin control', variants: [{ sku: 'Z', price: '1', inventory_management: null, inventory_quantity: 0 }] },
  ];
  const sh = await runCode('normalize-shopify.js', { input: shopProducts.map((json) => ({ json })), nodes: { 'Pedidos Shopify': shopOrders.map((json) => ({ json })) } });
  assert.deepStrictEqual(sh[0].json.orders.map((o) => o.status), ['paid', 'paid', 'refunded', 'cancelled']);
  assert.deepStrictEqual(sh[0].json.products, [{ sku: 'A', skus: ['A'], name: 'Prod A', price: 25, stock: 3 }]);
  const shr = (await runCode('report.js', { input: sh, nodes: { 'Configuración': cfg } }))[0].json;
  assert.strictEqual(shr.kpis.ventas.actual, 50);
  assert.strictEqual(shr.kpis.ventas.anterior, 40);
  assert.strictEqual(shr.kpis.ventas.cambio_pct, 25);
  assert.strictEqual(shr.kpis.tasa_devolucion.actual, 50);
  assert.strictEqual(shr.kpis.clientes_nuevos_pct.actual, 0, 'a@x.com ya había comprado');
  assert.strictEqual(shr.stock_bajo[0].sku, 'A');

  // WooCommerce
  const wooOrders = [
    { id: 7, number: '7', status: 'completed', date_created_gmt: iso(0).slice(0, 19), total: '19.90', billing: { email: 'c@x.com' }, created_via: 'checkout',
      meta_data: [{ key: '_wc_order_attribution_utm_source', value: 'instagram' }], line_items: [{ sku: 'W1', name: 'Taza', quantity: 1, price: 19.9 }] },
    { id: 8, number: '8', status: 'failed', date_created_gmt: iso(1).slice(0, 19), total: '5', billing: { email: 'd@x.com' }, line_items: [] },
  ];
  const wooProducts = [{ id: 20, sku: 'W1', name: 'Taza', price: '19.90', manage_stock: true, stock_quantity: 0 }, { id: 21, name: 'Sin stock gestionado', manage_stock: false }];
  const wo = await runCode('normalize-woocommerce.js', { input: wooProducts.map((json) => ({ json })), nodes: { 'Pedidos WooCommerce': wooOrders.map((json) => ({ json })) } });
  assert.deepStrictEqual(wo[0].json.orders.map((o) => [o.status, o.channel]), [['paid', 'instagram'], ['cancelled', 'Otro']]);
  const wor = (await runCode('report.js', { input: wo, nodes: { 'Configuración': cfg } }))[0].json;
  assert.strictEqual(wor.kpis.ventas.actual, 19.9);
  assert.strictEqual(wor.kpis.ventas.cambio_pct, null);
  assert.ok(wor.stock_bajo[0].agotado);

  // tienda sin pedidos
  const none = (await runCode('report.js', { input: [{ json: { orders: [], products: [], fuente: 'shopify' } }], nodes: { 'Configuración': cfg } }))[0].json;
  assert.ok(none.conclusiones.some((c) => c.includes('No se han encontrado pedidos')));

  console.log('weekly-report n8n: todos los escenarios OK');
  console.log(r.telegram);
  console.log(r.conclusiones);
})().catch((e) => { console.error(e); process.exit(1); });
