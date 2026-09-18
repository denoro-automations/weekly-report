# Informe semanal automático de la tienda

**Denoro Automations** · Cada lunes a las 8:00 la tienda recibe por email un informe claro de la semana anterior (con **PDF** adjunto) y un resumen corto por Telegram. Sin abrir ningún panel.

## Qué incluye
- **Ventas, pedidos, ticket medio y tasa de devoluciones**, comparados con la semana anterior
- **Conclusiones automáticas** (qué ha movido las ventas, mejor día, producto estrella…)
- **Ventas por día** y **top 5 de productos** con su tendencia
- ⚠️ **Stock a reponer**: productos por debajo del mínimo o que se agotarán en menos de *N* semanas al ritmo actual
- **Ventas por canal**
- **Objetivo del mes**: progreso y proyección a final de mes

## Fuentes de datos
En el nodo *Configuración*, `fuente` puede ser `demo` (pedidos de ejemplo realistas), `shopify` o `woocommerce`.

## Puesta en marcha (n8n)
1. **Import from File** → `n8n-workflow.json` y `n8n-error-workflow.json`.
2. Edita el bloque **CONFIGURACIÓN**: nombre de la tienda, fuente, moneda, zona horaria, stock mínimo, objetivo y destinatarios (`email_to`, `email_from`, `telegram_chat_id`). Con valores de ejemplo el workflow se para con un mensaje claro; un valor vacío desactiva ese canal.
3. Si usas Shopify o WooCommerce, elige la credencial en sus dos nodos.
4. Elige las credenciales en **Enviar email** (SMTP) y **Enviar PDF a Telegram**.
5. **PDF:** arranca Gotenberg junto a n8n:
   ```bash
   docker run -d --name gotenberg --restart unless-stopped -p 3000:3000 gotenberg/gotenberg:8
   ```
   Si Gotenberg no está disponible, el informe se envía igualmente, con el HTML adjunto en lugar del PDF.
6. *Settings → Error workflow* → **Denoro — Avisos de error**, y activa el workflow.

## Calidad
- El código de cada nodo Code está en `n8n/src/`, con tests fuera de n8n (`node n8n/test/test_weekly_report.js`).
- `python n8n/build.py` vuelve a generar el workflow.
- Probado en una instancia real de n8n.
