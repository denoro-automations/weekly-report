#!/usr/bin/env python3
"""Genera los workflows de n8n a partir del código en src/ (el JS se testea aparte con node).

Uso: python n8n/build.py
"""
import importlib.util
import json
import uuid
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent
spec = importlib.util.spec_from_file_location("common", HERE / "common.py")
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)
c.HERE = HERE
node, sticky, link, js, NS = c.node, c.sticky, c.link, c.js, c.NS


def switch_rule(value):
    return {"conditions": {
        "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
        "conditions": [{"leftValue": "={{ $json.fuente }}", "rightValue": value,
                        "operator": {"type": "string", "operation": "equals"}}],
        "combinator": "and"}, "renameOutput": True, "outputKey": value}


def weekly_report():
    form = lambda name, value: {"parameterType": "formData", "name": name, "value": value}  # noqa: E731
    nodes = [
        sticky("Nota: cómo usarlo", [-460, -300], (
            "## Informe semanal · Denoro\n"
            "1. Edita el bloque **CONFIGURACIÓN** del nodo *Configuración*: `fuente` = demo, shopify o woocommerce.\n"
            "2. Si usas Shopify/WooCommerce, elige la credencial en sus dos nodos.\n"
            "3. Elige credenciales en **Enviar email** (SMTP) y **Enviar PDF a Telegram**.\n"
            "4. PDF: arranca Gotenberg (`docker run -d -p 3000:3000 gotenberg/gotenberg:8`). "
            "Si no está, se adjunta el informe en HTML.\n"
            "5. *Settings → Error workflow*: **Denoro — Avisos de error**."), w=460, h=320, color=5),
        node("Cada lunes a las 8:00", "n8n-nodes-base.scheduleTrigger", 1.2, [0, 0],
             {"rule": {"interval": [{"field": "weeks", "weeksInterval": 1, "triggerAtDay": [1],
                                     "triggerAtHour": 8, "triggerAtMinute": 0}]}}),
        node("Probar manualmente", "n8n-nodes-base.manualTrigger", 1, [0, 200], {}),
        node("Configuración", "n8n-nodes-base.code", 2, [220, 100], {"jsCode": js("config.js")}),
        node("¿De dónde leo los pedidos?", "n8n-nodes-base.switch", 3, [440, 100], {
            "rules": {"values": [switch_rule("demo"), switch_rule("shopify"), switch_rule("woocommerce")]},
            "options": {}}),
        # demo
        node("Pedidos de ejemplo", "n8n-nodes-base.code", 2, [700, -120], {"jsCode": js("demo-data.js")}),
        # Shopify
        node("Pedidos Shopify", "n8n-nodes-base.shopify", 1, [700, 100], {
            "authentication": "accessToken", "resource": "order", "operation": "getAll", "returnAll": True,
            "options": {"status": "any", "createdAtMin": "={{ $json.periodo.pedir_desde }}"}},
            alwaysOutputData=True, retryOnFail=True, maxTries=3, waitBetweenTries=5000),
        node("Productos Shopify", "n8n-nodes-base.shopify", 1, [920, 100], {
            "authentication": "accessToken", "resource": "product", "operation": "getAll", "returnAll": True,
            "additionalFields": {}}, executeOnce=True, alwaysOutputData=True, retryOnFail=True, maxTries=3,
            waitBetweenTries=5000),
        node("Normalizar Shopify", "n8n-nodes-base.code", 2, [1140, 100], {"jsCode": js("normalize-shopify.js")}),
        # WooCommerce
        node("Pedidos WooCommerce", "n8n-nodes-base.wooCommerce", 1, [700, 320], {
            "resource": "order", "operation": "getAll", "returnAll": True,
            "options": {"after": "={{ $json.periodo.pedir_desde }}"}},
            alwaysOutputData=True, retryOnFail=True, maxTries=3, waitBetweenTries=5000),
        node("Productos WooCommerce", "n8n-nodes-base.wooCommerce", 1, [920, 320], {
            "resource": "product", "operation": "getAll", "returnAll": True, "options": {}},
            executeOnce=True, alwaysOutputData=True, retryOnFail=True, maxTries=3, waitBetweenTries=5000),
        node("Normalizar WooCommerce", "n8n-nodes-base.code", 2, [1140, 320], {"jsCode": js("normalize-woocommerce.js")}),
        # informe
        node("Calcular KPIs e informe", "n8n-nodes-base.code", 2, [1380, 100], {"jsCode": js("report.js")}),
        node("Crear PDF (Gotenberg)", "n8n-nodes-base.httpRequest", 4.2, [1600, 100], {
            "method": "POST",
            "url": "={{ $json.gotenberg_url }}/forms/chromium/convert/html",
            "sendBody": True,
            "contentType": "multipart-form-data",
            "bodyParameters": {"parameters": [
                {"parameterType": "formBinaryData", "name": "files", "inputDataFieldName": "index_html"},
                form("printBackground", "true"), form("paperWidth", "8.27"), form("paperHeight", "11.7"),
                form("marginTop", "0.4"), form("marginBottom", "0.4"), form("marginLeft", "0.4"),
                form("marginRight", "0.4"), form("preferCssPageSize", "true"),
            ]},
            "options": {"response": {"response": {"responseFormat": "file", "outputPropertyName": "informe_pdf"}},
                        "timeout": 60000},
        }, onError="continueRegularOutput", alwaysOutputData=True),
        node("Preparar adjunto", "n8n-nodes-base.code", 2, [1820, 100], {"jsCode": js("attach.js")}),
        c.gate("¿Email activo?", "enviar_email", [2040, 0]),
        c.gate("¿Telegram activo?", "enviar_telegram", [2040, 220]),
        c.email([2280, 0], attachments="informe"),
        node("Enviar PDF a Telegram", "n8n-nodes-base.telegram", 1.2, [2280, 220], {
            "operation": "sendDocument",
            "chatId": "={{ $json.telegram_chat_id }}",
            "binaryData": True,
            "binaryPropertyName": "informe",
            "additionalFields": {"caption": "={{ $json.telegram }}", "parse_mode": "HTML"},
        }, retryOnFail=True, maxTries=3, waitBetweenTries=5000),
    ]
    conns = link(
        ("Cada lunes a las 8:00", "Configuración"), ("Probar manualmente", "Configuración"),
        ("Configuración", "¿De dónde leo los pedidos?"),
        ("¿De dónde leo los pedidos?", "Pedidos de ejemplo", 0),
        ("¿De dónde leo los pedidos?", "Pedidos Shopify", 1),
        ("¿De dónde leo los pedidos?", "Pedidos WooCommerce", 2),
        ("Pedidos Shopify", "Productos Shopify"), ("Productos Shopify", "Normalizar Shopify"),
        ("Pedidos WooCommerce", "Productos WooCommerce"), ("Productos WooCommerce", "Normalizar WooCommerce"),
        ("Pedidos de ejemplo", "Calcular KPIs e informe"), ("Normalizar Shopify", "Calcular KPIs e informe"),
        ("Normalizar WooCommerce", "Calcular KPIs e informe"),
        ("Calcular KPIs e informe", "Crear PDF (Gotenberg)"), ("Crear PDF (Gotenberg)", "Preparar adjunto"),
        ("Preparar adjunto", "¿Email activo?"), ("Preparar adjunto", "¿Telegram activo?"),
        ("¿Email activo?", "Enviar email", 0), ("¿Telegram activo?", "Enviar PDF a Telegram", 0),
    )
    return c.workflow("Denoro — Informe semanal de la tienda", nodes, conns)


if __name__ == "__main__":
    outputs = {ROOT / "n8n-workflow.json": weekly_report(), ROOT / "n8n-error-workflow.json": c.error_handler()}
    for path, wf in outputs.items():
        path.write_text(json.dumps(wf, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"{path.name}: {len(wf['nodes'])} nodos")
