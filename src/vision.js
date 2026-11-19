'use strict';
// Leitura de FOTO com Google Gemini (visão; há plano gratuito). Só roda se GEMINI_API_KEY estiver definida;
// sem a chave, a foto é apenas anexada e os campos ficam para preenchimento manual.
const { locais, PRIORIDADES, OCORRENCIAS } = require('./catalogo');

const PAVIMENTOS = [...new Set(locais.ambientes.map((a) => a.pavimento))].filter((p) => p !== 'Geral');
const AMBIENTES = locais.ambientes.map((a) => a.nome);

async function lerFoto(foto, texto) {
  const key = process.env.GEMINI_API_KEY;
  const m = /^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/.exec(foto || '');
  if (!key) return { motivo: 'sem_chave' };
  if (!m) return { motivo: 'falha' };
  const prompt = `Você ajuda a registrar ordens de serviço de manutenção predial em um hospital. Analise a foto${texto ? ' e a descrição: "' + texto.slice(0, 500) + '"' : ''}.
Responda APENAS um JSON com as chaves: ocorrencia, pavimento, ambiente, prioridade, detalheLocal, descricao.
Use somente valores destas listas, ou "" se não der para saber pela foto:
ocorrencia: ${JSON.stringify(OCORRENCIAS.map((o) => o.ocorrencia))}
pavimento: ${JSON.stringify(PAVIMENTOS)}
ambiente: ${JSON.stringify(AMBIENTES)}
prioridade: ${JSON.stringify(PRIORIDADES)}
detalheLocal e descricao: texto curto livre (descricao = o que se vê, 1 frase).
Não invente o local se a foto não o mostra.`;
  const modelo = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: m[1], data: m[2] } }, { text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
    }),
  });
  if (!r.ok) throw new Error('Gemini: HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const out = (await r.json()).candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
  const oc = OCORRENCIAS.find((o) => o.ocorrencia === j.ocorrencia);
  return {
    ocorrencia: oc ? oc.ocorrencia : '', tipo: oc ? oc.tipo : '', causa: oc ? oc.causa : '',
    prioridade: PRIORIDADES.includes(j.prioridade) ? j.prioridade : (oc ? oc.prioridade : ''),
    ambiente: AMBIENTES.includes(j.ambiente) ? j.ambiente : '',
    pavimento: PAVIMENTOS.includes(j.pavimento) ? j.pavimento : '',
    detalheLocal: String(j.detalheLocal || '').slice(0, 80), descricao: String(j.descricao || '').slice(0, 300),
  };
}
module.exports = { lerFoto };
