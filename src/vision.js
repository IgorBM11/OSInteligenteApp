'use strict';
// Interpretação por IA (Claude, API da Anthropic) de TEXTO e/ou FOTO da ocorrência.
// Só roda se ANTHROPIC_API_KEY estiver definida; sem a chave o app usa apenas as regras de src/parser.js.
const Anthropic = require('@anthropic-ai/sdk');
const { locais, PRIORIDADES, OCORRENCIAS } = require('./catalogo');

const PAVIMENTOS = [...new Set(locais.ambientes.map((a) => a.pavimento))].filter((p) => p !== 'Geral');
const AMBIENTES = locais.ambientes.map((a) => a.nome);

function montaPrompt(texto, temFoto) {
  return `Você é um técnico de manutenção hospitalar experiente e ajuda a registrar ordens de serviço (OS) de um hospital.
${texto ? `Relato do operador: "${texto.slice(0, 800)}"` : 'Não há relato escrito.'}
${temFoto ? 'Há também uma foto da ocorrência.' : ''}

Raciocine sobre QUAL OBJETO/SISTEMA está com problema e QUAL é o defeito, e escolha a ocorrência semanticamente mais próxima da lista.
Não decida por palavra solta (ex.: "quebrado" não significa piso; "ventilador quebrado" é ventilador/exaustor com defeito).
Se nenhuma ocorrência da lista servir, use "Outra ocorrência". Use "" apenas para o que não puder ser inferido.
Local: use pavimento/ambiente só se o relato ou a foto indicarem; não invente.
Prioridade: Crítica = risco imediato à vida/assistência (gases medicinais, UTI/centro cirúrgico sem energia, faíscas, fumaça); Alta = afeta assistência ou causa dano crescente (infiltração, ar-condicionado em área assistencial, elevador); Média = incômodo operacional; Baixa = estético ou sem impacto.

Responda APENAS um JSON com as chaves: ocorrencia, pavimento, ambiente, prioridade, detalheLocal, descricao.
ocorrencia: ${JSON.stringify([...OCORRENCIAS.map((o) => o.ocorrencia), 'Outra ocorrência'])}
pavimento: ${JSON.stringify(PAVIMENTOS)}
ambiente: ${JSON.stringify(AMBIENTES)}
prioridade: ${JSON.stringify(PRIORIDADES)}
detalheLocal: texto curto livre (ex.: "Leito 12"). descricao: 1 frase objetiva do problema.

Exemplos:
"ventilador quebrado no terceiro pavimento do laboratório" -> {"ocorrencia":"Ventilador/exaustor com defeito","pavimento":"3º Pavimento","ambiente":"Laboratório","prioridade":"Média","detalheLocal":"","descricao":"Ventilador quebrado no laboratório."}
"cadeira de rodas com roda solta na recepção" -> {"ocorrencia":"Mobiliário/equipamento danificado","pavimento":"Térreo","ambiente":"Recepção / Acolhimento","prioridade":"Baixa","detalheLocal":"","descricao":"Cadeira de rodas com roda solta."}`;
}

const MODELO_PADRAO = 'claude-sonnet-5-5'; // Claude de porte médio; troque com ANTHROPIC_MODEL

let cliente = null;
const getCliente = () => (cliente ||= new Anthropic()); // lê ANTHROPIC_API_KEY (e ANTHROPIC_BASE_URL, se houver)

async function interpretar(texto, foto) {
  if (!process.env.ANTHROPIC_API_KEY) return { motivo: 'sem_chave' };
  const content = [];
  if (foto) {
    const m = /^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/.exec(foto);
    if (!m) return { motivo: 'falha' };
    content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  }
  content.push({ type: 'text', text: montaPrompt(texto, !!foto) });

  const resp = await getCliente().messages.create({
    model: process.env.ANTHROPIC_MODEL || MODELO_PADRAO,
    max_tokens: 4000,
    output_config: { effort: 'medium' },
    messages: [{ role: 'user', content }],
  });
  if (resp.stop_reason === 'refusal') return { motivo: 'falha' };
  const out = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
  const outra = j.ocorrencia === 'Outra ocorrência';
  const oc = OCORRENCIAS.find((o) => o.ocorrencia === j.ocorrencia);
  return {
    ocorrencia: oc ? oc.ocorrencia : outra ? 'Outra ocorrência' : '', tipo: oc ? oc.tipo : outra ? 'Predial · geral' : '', causa: oc ? oc.causa : outra ? 'A diagnosticar' : '',
    iaOcorrenciaSegura: !!oc,
    prioridade: PRIORIDADES.includes(j.prioridade) ? j.prioridade : (oc ? oc.prioridade : ''),
    ambiente: AMBIENTES.includes(j.ambiente) ? j.ambiente : '',
    pavimento: PAVIMENTOS.includes(j.pavimento) ? j.pavimento : '',
    detalheLocal: String(j.detalheLocal || '').slice(0, 80), descricao: String(j.descricao || '').slice(0, 300),
  };
}
module.exports = { interpretar };
