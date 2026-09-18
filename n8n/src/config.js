// ============ CONFIGURACIÓN DEL CLIENTE (edita solo este bloque) ============
const CONFIG = {
  tienda: 'Tienda Demo',
  fuente: 'demo',                 // 'demo', 'shopify' o 'woocommerce'
  moneda: 'EUR',
  zona_horaria: 'Europe/Madrid',

  stock_minimo: 5,                // avisa si quedan estas unidades o menos...
  semanas_cobertura_min: 2,       // ...o si al ritmo actual se agota en menos de 2 semanas
  objetivo_mensual: 32000,        // ventas objetivo del mes (0 para ocultarlo)

  email_to: 'cliente@ejemplo.com',
  email_from: 'informes@tu-dominio.com',  // la cuenta SMTP que envía
  telegram_chat_id: 'TU_CHAT_ID',

  // Servicio que convierte el informe en PDF (Gotenberg, ver README)
  gotenberg_url: 'http://host.docker.internal:3000',
};
// ============================================================================
if (!['demo', 'shopify', 'woocommerce'].includes(CONFIG.fuente)) {
  throw new Error(`fuente "${CONFIG.fuente}" no válida: usa demo, shopify o woocommerce`);
}
// Destinos: vacío = canal desactivado; valores de ejemplo = error claro
const PLACEHOLDER = /ejemplo\.com|tu-dominio|TU_CHAT_ID/i;
for (const k of ['email_to', 'email_from', 'telegram_chat_id']) {
  if (PLACEHOLDER.test(String(CONFIG[k] || ''))) {
    throw new Error(`Configura "${k}" en el nodo Configuración (ahora tiene un valor de ejemplo). Déjalo vacío ('') para desactivar ese canal.`);
  }
}
if (CONFIG.telegram_chat_id && !/^-?\d+$|^@\w+$/.test(String(CONFIG.telegram_chat_id))) {
  throw new Error('telegram_chat_id debe ser un número (p. ej. 123456789) o @canal');
}
if (!CONFIG.email_to && !CONFIG.telegram_chat_id) throw new Error('Configura al menos un canal: email_to o telegram_chat_id');
if (CONFIG.email_to && !CONFIG.email_from) throw new Error('Falta email_from (la cuenta SMTP que envía)');

// ---- Fechas en la zona horaria de la tienda (el servidor puede estar en UTC) ----
const TZ = CONFIG.zona_horaria || 'Europe/Madrid';
const partsOf = (ms, opts) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', ...opts })
  .formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
const offsetAt = (ms) => {
  const p = partsOf(ms, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
};
// medianoche (en TZ) del día y/m/d -> instante UTC
const midnight = (y, m, d) => {
  const naive = Date.UTC(y, m - 1, d);
  let t = naive - offsetAt(naive);
  t = naive - offsetAt(t);
  return t;
};
const addDays = (y, m, d, k) => { const x = new Date(Date.UTC(y, m - 1, d + k)); return [x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()]; };
const now = partsOf(Date.now(), { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' });
const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(now.weekday);   // 0 = lunes
const thisMonday = addDays(+now.year, +now.month, +now.day, -dow);
const weekStartD = addDays(...thisMonday, -7);
const prevStartD = addDays(...thisMonday, -14);
const dias = Array.from({ length: 8 }, (_, k) => new Date(midnight(...addDays(...weekStartD, k))).toISOString());
const lastDayD = addDays(...thisMonday, -1);                           // domingo de la semana informada
const mesIni = midnight(lastDayD[0], lastDayD[1], 1);
const mesFin = midnight(...(lastDayD[1] === 12 ? [lastDayD[0] + 1, 1, 1] : [lastDayD[0], lastDayD[1] + 1, 1]));
const weekStart = midnight(...weekStartD), prevStart = midnight(...prevStartD);

return [{ json: { ...CONFIG, zona_horaria: TZ,
  enviar_email: Boolean(CONFIG.email_to), enviar_telegram: Boolean(CONFIG.telegram_chat_id),
  periodo: {
    semana_inicio: new Date(weekStart).toISOString(), semana_fin: dias[7], dias,
    anterior_inicio: new Date(prevStart).toISOString(),
    mes_inicio: new Date(mesIni).toISOString(), mes_fin: new Date(mesFin).toISOString(),
    pedir_desde: new Date(Math.min(prevStart, mesIni)).toISOString(),
  },
} }];
