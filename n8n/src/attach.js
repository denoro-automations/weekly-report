// Deja un único adjunto "informe": el PDF si Gotenberg respondió; si no, el HTML del informe.
const data = $('Calcular KPIs e informe').first();
const res = $input.first();
const pdf = res.binary && (res.binary.informe_pdf || res.binary.data);
const ok = Boolean(pdf) && !res.json.error;
const html = data.binary.index_html;
const adjunto = ok
  ? { ...pdf, fileName: data.json.nombre_pdf, mimeType: 'application/pdf', fileExtension: 'pdf' }
  : { ...html, fileName: data.json.nombre_pdf.replace('.pdf', '.html') };
return [{
  json: { ...data.json, pdf_generado: ok, aviso_pdf: ok ? '' : 'No se pudo generar el PDF (¿está Gotenberg en marcha?). Se adjunta el HTML.' },
  binary: { informe: adjunto },
}];
