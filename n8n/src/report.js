// Calcula los KPIs de la semana frente a la anterior y genera:
//  - el email en HTML, - el HTML para el PDF (binario index.html), - el resumen para Telegram
const cfg = $('Configuración').first().json;
const { orders = [], products = [], fuente } = $input.first().json;
const P = cfg.periodo;
const DAY = 86400000;
const t = (s) => new Date(s).getTime();
const wStart = t(P.semana_inicio), wEnd = t(P.semana_fin), pStart = t(P.anterior_inicio), mStart = t(P.mes_inicio);
const cur = cfg.moneda || 'EUR';

// ---------- formato ----------
const nf = (v, d = 0) => {
  const [int, dec] = Math.abs(Number(v || 0)).toFixed(d).split('.');
  return (Number(v) < 0 && Number(int + (dec || '')) !== 0 ? '-' : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec ? ',' + dec : '');
};
const money = (v, d = 2) => nf(v, d) + ({ EUR: ' €', USD: ' $', GBP: ' £' }[cur] ?? ' ' + cur);
const pct = (v) => (v === null ? '—' : (v > 0 ? '+' : '') + nf(v, 1) + ' %');
const change = (a, b) => (b ? Math.round(((a - b) / b) * 1000) / 10 : null);
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fDate = (ms, o = { day: 'numeric', month: 'short' }) => new Date(ms).toLocaleDateString('es-ES', { timeZone: cfg.zona_horaria, ...o });

// ---------- KPIs ----------
const inRange = (o, a, b) => { const x = t(o.date); return x >= a && x < b; };
function summarize(list) {
  const paid = list.filter((o) => o.status === 'paid');
  const refunded = list.filter((o) => o.status === 'refunded');
  const revenue = paid.reduce((s, o) => s + o.total, 0);
  const units = paid.reduce((s, o) => s + o.lines.reduce((u, l) => u + l.qty, 0), 0);
  const valid = paid.length + refunded.length;
  return {
    ventas: Math.round(revenue * 100) / 100,
    pedidos: paid.length,
    ticket_medio: paid.length ? Math.round((revenue / paid.length) * 100) / 100 : 0,
    unidades: units,
    devoluciones: refunded.length,
    importe_devuelto: Math.round(refunded.reduce((s, o) => s + o.total, 0) * 100) / 100,
    tasa_devolucion: valid ? Math.round((refunded.length / valid) * 1000) / 10 : 0,
    cancelados: list.filter((o) => o.status === 'cancelled').length,
    clientes_nuevos_pct: paid.length ? Math.round((paid.filter((o) => !o.returning).length / paid.length) * 1000) / 10 : 0,
  };
}
const week = orders.filter((o) => inRange(o, wStart, wEnd));
const prev = orders.filter((o) => inRange(o, pStart, wStart));
const W = summarize(week), Pv = summarize(prev);
const kpis = Object.fromEntries(Object.keys(W).map((k) => [k, { actual: W[k], anterior: Pv[k], cambio_pct: change(W[k], Pv[k]) }]));

// ventas por día
const days = [];
for (let d = 0; d < 7; d++) {
  const a = t(P.dias[d]), b = t(P.dias[d + 1]);
  const list = week.filter((o) => inRange(o, a, b) && o.status === 'paid');
  days.push({ dia: fDate(a, { weekday: 'short', day: 'numeric' }), ventas: list.reduce((s, o) => s + o.total, 0), pedidos: list.length });
}
const bestDay = days.reduce((m, d) => (d.ventas > m.ventas ? d : m), days[0]);

// productos
function byProduct(list) {
  const m = {};
  for (const o of list.filter((x) => x.status === 'paid')) {
    for (const l of o.lines) {
      m[l.sku] = m[l.sku] || { sku: l.sku, nombre: l.name, unidades: 0, ventas: 0 };
      m[l.sku].unidades += l.qty;
      m[l.sku].ventas += l.qty * l.price;
    }
  }
  return m;
}
const pw = byProduct(week), pp = byProduct(prev);
const top = Object.values(pw).sort((a, b) => b.ventas - a.ventas).slice(0, 5)
  .map((x) => ({ ...x, ventas: Math.round(x.ventas * 100) / 100, cambio_pct: change(x.ventas, pp[x.sku]?.ventas || 0) }));

// canales
const chan = {};
for (const o of week.filter((x) => x.status === 'paid')) chan[o.channel || 'Otro'] = (chan[o.channel || 'Otro'] || 0) + o.total;
const canales = Object.entries(chan).sort((a, b) => b[1] - a[1]).map(([canal, v]) => ({ canal, ventas: Math.round(v * 100) / 100, peso_pct: W.ventas ? Math.round((v / W.ventas) * 1000) / 10 : 0 }));

// stock: unidades vendidas por semana (media de las 2 últimas) -> semanas de cobertura
const stock = [];
for (const p of products) {
  const skus = p.skus && p.skus.length ? p.skus : [p.sku];
  const sold = skus.reduce((s, k) => s + (pw[k]?.unidades || 0) + (pp[k]?.unidades || 0), 0) / 2;
  const cover = sold > 0 ? Math.round((p.stock / sold) * 10) / 10 : null;
  const low = p.stock <= cfg.stock_minimo || (cover !== null && cover < cfg.semanas_cobertura_min);
  if (low) stock.push({ sku: p.sku, nombre: p.name, stock: p.stock, venta_semanal: Math.round(sold * 10) / 10, semanas_cobertura: cover, agotado: p.stock <= 0 });
}
stock.sort((a, b) => a.stock - b.stock);

// objetivo del mes
let objetivo = null;
if (cfg.objetivo_mensual > 0) {
  const mEnd = t(P.mes_fin);
  const upTo = Math.min(wEnd, mEnd);
  const mtd = orders.filter((o) => inRange(o, mStart, upTo) && o.status === 'paid').reduce((s, o) => s + o.total, 0);
  const elapsed = Math.max(1, Math.round((upTo - mStart) / DAY));
  const total = Math.round((mEnd - mStart) / DAY);
  const proj = (mtd / elapsed) * total;
  objetivo = { mes: fDate(mStart, { month: 'long', year: 'numeric' }), acumulado: Math.round(mtd * 100) / 100, objetivo: cfg.objetivo_mensual,
               progreso_pct: Math.round((mtd / cfg.objetivo_mensual) * 1000) / 10, dias: `${elapsed}/${total}`,
               proyeccion: Math.round(proj * 100) / 100, proyeccion_pct: Math.round((proj / cfg.objetivo_mensual) * 1000) / 10 };
}

// conclusiones automáticas
const insights = [];
if (kpis.ventas.cambio_pct !== null) {
  insights.push(`Las ventas ${kpis.ventas.cambio_pct >= 0 ? 'suben' : 'bajan'} un ${nf(Math.abs(kpis.ventas.cambio_pct), 1)} % frente a la semana anterior` +
    (Math.abs(kpis.pedidos.cambio_pct || 0) > Math.abs(kpis.ticket_medio.cambio_pct || 0) ? ', sobre todo por el número de pedidos.' : ', sobre todo por el ticket medio.'));
}
if (W.pedidos) insights.push(`El mejor día fue el ${bestDay.dia} con ${money(bestDay.ventas)}.`);
if (top[0]) insights.push(`«${top[0].nombre}» es el producto estrella: ${nf(top[0].unidades)} uds y ${money(top[0].ventas)}.`);
const agotados = stock.filter((s) => s.agotado).length;
if (stock.length) insights.push(`${stock.length} producto${stock.length > 1 ? 's' : ''} con stock bajo${agotados ? ` (${agotados} agotado${agotados > 1 ? 's' : ''})` : ''}: conviene reponer.`);
if (W.tasa_devolucion > 8) insights.push(`Ojo con las devoluciones: ${nf(W.tasa_devolucion, 1)} % de los pedidos.`);
if (objetivo) insights.push(`Al ritmo actual cerrarías ${objetivo.mes} en ${money(objetivo.proyeccion, 0)} (${nf(objetivo.proyeccion_pct, 0)} % del objetivo).`);
if (!orders.length) insights.push('No se han encontrado pedidos en el periodo. Revisa la conexión con la tienda.');

// ---------- HTML (compatible con email y con PDF) ----------
const C = { ink: '#0f2a3d', muted: '#5b6b7a', line: '#e6eaee', soft: '#f4f6f8', up: '#067647', down: '#b42318', accent: '#1f6feb' };
const arrow = (v, inverse = false) => {
  if (v === null) return `<span style="color:${C.muted}">nuevo</span>`;
  const good = inverse ? v <= 0 : v >= 0;
  return `<span style="color:${good ? C.up : C.down}">${v >= 0 ? '▲' : '▼'} ${pct(v).replace('+', '')}</span>`;
};
const tile = (label, value, ch, inverse) => `<td width="25%" style="padding:6px"><div style="background:${C.soft};border-radius:10px;padding:14px">
<div style="font-size:12px;color:${C.muted}">${label}</div><div style="font-size:22px;font-weight:700;color:${C.ink};margin:4px 0">${value}</div>
<div style="font-size:12px">${arrow(ch, inverse)} <span style="color:${C.muted}">vs semana anterior</span></div></div></td>`;
const maxDay = Math.max(1, ...days.map((d) => d.ventas));
const dayRows = days.map((d) => `<tr><td style="padding:4px 8px 4px 0;font-size:13px;color:${C.muted};white-space:nowrap;width:70px">${esc(d.dia)}</td>
<td style="padding:4px 0"><div style="background:${d === bestDay ? C.accent : '#9db8d9'};height:16px;border-radius:4px;width:${Math.max(2, Math.round((d.ventas / maxDay) * 100))}%"></div></td>
<td style="padding:4px 0 4px 8px;font-size:13px;text-align:right;white-space:nowrap;width:110px">${money(d.ventas, 0)} · ${d.pedidos}</td></tr>`).join('');
const th = (s, right) => `<th style="padding:8px;text-align:${right ? 'right' : 'left'};font-size:12px;color:${C.muted};border-bottom:1px solid ${C.line}">${s}</th>`;
const tdc = (s, right, extra = '') => `<td style="padding:8px;text-align:${right ? 'right' : 'left'};font-size:13px;border-bottom:1px solid ${C.line};${extra}">${s}</td>`;
const topRows = top.map((x, i) => `<tr>${tdc(`${i + 1}. ${esc(x.nombre)}`)}${tdc(nf(x.unidades), true)}${tdc(money(x.ventas), true)}${tdc(arrow(x.cambio_pct), true)}</tr>`).join('')
  || `<tr>${tdc('Sin ventas esta semana')}</tr>`;
const stockRows = stock.slice(0, 10).map((s) => `<tr>${tdc(esc(s.nombre))}${tdc(s.agotado ? `<b style="color:${C.down}">Agotado</b>` : nf(s.stock), true)}${tdc(nf(s.venta_semanal, 1), true)}${tdc(s.semanas_cobertura === null ? '—' : nf(s.semanas_cobertura, 1) + ' sem', true, s.semanas_cobertura !== null && s.semanas_cobertura < 1 ? `color:${C.down};font-weight:700` : '')}</tr>`).join('');
const chanRows = canales.map((c) => `<tr>${tdc(esc(c.canal))}${tdc(money(c.ventas), true)}${tdc(nf(c.peso_pct, 1) + ' %', true)}</tr>`).join('');
const h3 = (s) => `<h3 style="margin:28px 0 10px;font-size:16px;color:${C.ink}">${s}</h3>`;
const periodo = `${fDate(wStart)} – ${fDate(wEnd - 1, { day: 'numeric', month: 'short', year: 'numeric' })}`;
const goalBlock = objetivo ? `${h3('Objetivo del mes')}
<div style="font-size:13px;color:${C.muted};margin-bottom:6px">${esc(objetivo.mes)} · día ${objetivo.dias} · ${money(objetivo.acumulado, 0)} de ${money(objetivo.objetivo, 0)}</div>
<div style="background:${C.soft};border-radius:6px;height:14px"><div style="background:${objetivo.proyeccion_pct >= 100 ? C.up : C.accent};height:14px;border-radius:6px;width:${Math.min(100, objetivo.progreso_pct)}%"></div></div>
<div style="font-size:13px;margin-top:6px">${nf(objetivo.progreso_pct, 1)} % conseguido · proyección: <b>${money(objetivo.proyeccion, 0)}</b> (${nf(objetivo.proyeccion_pct, 0)} %)</div>` : '';

const body = `<div style="font-size:12px;letter-spacing:.08em;color:${C.muted};text-transform:uppercase">Denoro Automations · Informe semanal</div>
<h1 style="margin:4px 0 2px;font-size:24px;color:${C.ink}">${esc(cfg.tienda)}</h1>
<div style="color:${C.muted};font-size:13px">Semana del ${periodo}${fuente === 'demo' ? ' · <b>datos de ejemplo</b>' : ''}</div>
<table width="100%" cellspacing="0" style="margin-top:16px"><tr>
${tile('Ventas', money(W.ventas, 0), kpis.ventas.cambio_pct)}${tile('Pedidos', nf(W.pedidos), kpis.pedidos.cambio_pct)}
${tile('Ticket medio', money(W.ticket_medio), kpis.ticket_medio.cambio_pct)}${tile('Devoluciones', nf(W.tasa_devolucion, 1) + ' %', kpis.tasa_devolucion.cambio_pct, true)}
</tr></table>
${h3('Lo más importante')}
<ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6">${insights.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
${h3('Ventas por día')}<table width="100%" cellspacing="0">${dayRows}</table>
${h3('Top 5 productos')}<table width="100%" cellspacing="0" style="border-collapse:collapse"><tr>${th('Producto')}${th('Uds', 1)}${th('Ventas', 1)}${th('vs sem. ant.', 1)}</tr>${topRows}</table>
${stock.length ? `${h3('⚠️ Stock a reponer')}<table width="100%" cellspacing="0" style="border-collapse:collapse"><tr>${th('Producto')}${th('Stock', 1)}${th('Venta/sem', 1)}${th('Cobertura', 1)}</tr>${stockRows}</table>` : ''}
${canales.length ? `${h3('Ventas por canal')}<table width="100%" cellspacing="0" style="border-collapse:collapse"><tr>${th('Canal')}${th('Ventas', 1)}${th('Peso', 1)}</tr>${chanRows}</table>` : ''}
${goalBlock}
<p style="margin-top:28px;font-size:12px;color:#98a2b3">Unidades: ${nf(W.unidades)} · Clientes nuevos: ${nf(W.clientes_nuevos_pct, 1)} % · Cancelados: ${W.cancelados} · Importe devuelto: ${money(W.importe_devuelto)}. Generado automáticamente el ${fDate(Date.now(), { dateStyle: 'long' })}.</p>`;

const emailHtml = `<!doctype html><html><body style="margin:0;background:#eef1f4;font-family:Arial,Helvetica,sans-serif;color:#1d2939">
<table width="100%" cellspacing="0"><tr><td align="center" style="padding:24px">
<table width="680" cellspacing="0" style="background:#fff;border-radius:12px"><tr><td style="padding:28px">${body}
<p style="font-size:12px;color:#98a2b3">Adjunto: este informe en PDF.</p></td></tr></table></td></tr></table></body></html>`;
const pdfHtml = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe semanal ${esc(cfg.tienda)}</title>
<style>@page{size:A4;margin:14mm}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#1d2939;-webkit-print-color-adjust:exact;print-color-adjust:exact}
table{page-break-inside:auto}tr{page-break-inside:avoid}h3{page-break-after:avoid}</style></head><body>${body}</body></html>`;

const up = (v) => (v === null ? '' : ` (${pct(v)})`);
const telegram = `📊 <b>${esc(cfg.tienda)} · semana ${periodo}</b>${fuente === 'demo' ? ' <i>(demo)</i>' : ''}\n` +
  `💶 Ventas: <b>${money(W.ventas, 0)}</b>${up(kpis.ventas.cambio_pct)}\n` +
  `🧾 Pedidos: ${nf(W.pedidos)}${up(kpis.pedidos.cambio_pct)} · Ticket: ${money(W.ticket_medio)}\n` +
  (top[0] ? `🏆 ${esc(top[0].nombre)} (${nf(top[0].unidades)} uds)\n` : '') +
  (stock.length ? `⚠️ Stock bajo: ${stock.slice(0, 3).map((s) => esc(s.nombre)).join(', ')}${stock.length > 3 ? '…' : ''}\n` : '') +
  (objetivo ? `🎯 Objetivo del mes: ${nf(objetivo.progreso_pct, 0)} % (proyección ${nf(objetivo.proyeccion_pct, 0)} %)\n` : '') +
  'Informe completo en el PDF adjunto.';

const fileDate = new Date(wStart).toISOString().slice(0, 10);
return [{
  json: {
    asunto: `📊 ${cfg.tienda} · Informe semanal ${periodo}: ${money(W.ventas, 0)}${up(kpis.ventas.cambio_pct)}`,
    email_html: emailHtml,
    telegram: telegram.slice(0, 1000),
    email_to: cfg.email_to,
    email_from: cfg.email_from,
    telegram_chat_id: cfg.telegram_chat_id,
    enviar_email: cfg.enviar_email,
    enviar_telegram: cfg.enviar_telegram,
    gotenberg_url: cfg.gotenberg_url,
    nombre_pdf: `informe-semanal-${fileDate}.pdf`,
    periodo: { inicio: P.semana_inicio, fin: P.semana_fin },
    fuente, kpis, ventas_por_dia: days, top_productos: top, canales, stock_bajo: stock, objetivo, conclusiones: insights,
  },
  binary: {
    index_html: { data: Buffer.from(pdfHtml, 'utf8').toString('base64'), mimeType: 'text/html', fileName: 'index.html', fileExtension: 'html' },
  },
}];
