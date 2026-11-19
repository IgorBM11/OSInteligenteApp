'use strict';
// Interpretação por IA (Claude, API da Anthropic) de TEXTO e/ou FOTO da ocorrência.
// Só roda se ANTHROPIC_API_KEY estiver definida; sem a chave o app usa apenas as regras de src/parser.js.
const Anthropic = require('@anthropic-ai/sdk');
const { locais, PRIORIDADES, OCORRENCIAS, OCORRENCIA_DO_EQUIPAMENTO } = require('./catalogo');

const PAVIMENTOS = [...new Set(locais.ambientes.map((a) => a.pavimento))].filter((p) => p !== 'Geral');
const AMBIENTES = locais.ambientes.map((a) => a.nome);

function montaPrompt(texto, temFoto, equipamentos) {
  const soFoto = temFoto && !texto;
  const modo = soFoto
    ? `MODO SÓ FOTO: não há relato escrito, então a imagem é a ÚNICA fonte de informação. Interprete a foto e preencha o máximo possível:
1. Identifique o equipamento principal visível e escolha-o na lista de equipamentos.
2. Observe o estado dele e o que está errado (vazamento, água escorrendo, mancha, ferrugem, peça solta ou quebrada, sujeira, cabos expostos, equipamento desligado ou danificado…).
3. Escolha a ocorrência ligada a esse equipamento/defeito. Se você reconheceu um equipamento, NUNCA deixe a ocorrência vazia: use a ocorrência mais relacionada a ele, mesmo que o defeito não esteja claro na foto (ex.: exaustor ou ventilador -> "Ventilador/exaustor com defeito"; split ou fan coil -> "Ar-condicionado sem refrigerar"; luminária -> "Lâmpada queimada / iluminação"; régua de gás -> "Falha em gás medicinal"; elevador -> "Elevador parado/com falha"). Se o equipamento não tiver ocorrência correspondente, use "Outra ocorrência". Se a foto mostra um problema sem equipamento (mancha de infiltração no teto, piso quebrado, parede), escolha a ocorrência pelo defeito e deixe equipamento "".
4. Local: preencha pavimento e ambiente SOMENTE se a foto mostrar pistas claras (placa, leito de UTI, sala cirúrgica, recepção, corredor…); caso contrário, "". detalheLocal: número de leito/sala/box se aparecer na imagem.
5. Prioridade conforme a gravidade que se vê. descricao: o que se vê, em 1 ou 2 frases objetivas (ex.: "Split de parede com água escorrendo pela carcaça").`
    : temFoto
      ? 'Há relato e foto. Combine os dois: o relato manda no local e no defeito descrito; a foto confirma ou completa o equipamento e o estado. Em conflito, prefira o relato e descreva a divergência na descricao.'
      : 'Só há relato escrito (sem foto).';

  return `Você é um técnico de manutenção hospitalar experiente e ajuda a registrar ordens de serviço (OS) de um hospital.
${texto ? `Relato do operador: "${texto.slice(0, 800)}"` : 'Não há relato escrito.'}
${modo}

Raciocine sobre QUAL OBJETO/SISTEMA está com problema e QUAL é o defeito, e escolha a ocorrência semanticamente mais próxima da lista.
Não decida por palavra solta (ex.: "quebrado" não significa piso). Use "Outra ocorrência" se nada da lista servir. Use "" apenas para o que realmente não puder ser inferido.
Local: não invente pavimento/ambiente sem indício no relato ou na foto.
Prioridade: Crítica = risco imediato à vida/assistência (gases medicinais, UTI/centro cirúrgico sem energia, faíscas, fumaça); Alta = afeta assistência ou causa dano crescente (infiltração, ar-condicionado em área assistencial, elevador); Média = incômodo operacional; Baixa = estético ou sem impacto.

Responda APENAS um JSON com as chaves: ocorrencia, equipamento, pavimento, ambiente, prioridade, detalheLocal, descricao.
ocorrencia: ${JSON.stringify([...OCORRENCIAS.map((o) => o.ocorrencia), 'Outra ocorrência'])}
equipamento: o equipamento principal que aparece na foto ou é citado no relato, escolhido EXATAMENTE de ${JSON.stringify(equipamentos)}; "" se não houver equipamento identificável. Equipamento e ocorrência são campos independentes.
pavimento: ${JSON.stringify(PAVIMENTOS)}
ambiente: ${JSON.stringify(AMBIENTES)}
prioridade: ${JSON.stringify(PRIORIDADES)}
detalheLocal: texto curto livre (ex.: "Leito 12"). descricao: 1 ou 2 frases objetivas.

Exemplos (formato da resposta):
relato "exaustor do banheiro do 2º andar parou de funcionar" -> {"ocorrencia":"Ventilador/exaustor com defeito","equipamento":"Exaustor","pavimento":"2º Pavimento","ambiente":"Corredor / Circulação","prioridade":"Média","detalheLocal":"","descricao":"Exaustor do banheiro parado."}
relato "cadeira de rodas com roda solta na recepção" -> {"ocorrencia":"Mobiliário/equipamento danificado","equipamento":"Cadeira de rodas","pavimento":"Térreo","ambiente":"Recepção / Acolhimento","prioridade":"Baixa","detalheLocal":"","descricao":"Cadeira de rodas com roda solta."}
somente foto de um ar-condicionado split de parede com água escorrendo, sem pistas de local -> {"ocorrencia":"Ar-condicionado sem refrigerar","equipamento":"Ar-condicionado split","pavimento":"","ambiente":"","prioridade":"Alta","detalheLocal":"","descricao":"Split de parede com água escorrendo pela carcaça."}
somente foto de um exaustor/ventilador de teto parado -> {"ocorrencia":"Ventilador/exaustor com defeito","equipamento":"Exaustor","pavimento":"","ambiente":"","prioridade":"Média","detalheLocal":"","descricao":"Exaustor de teto aparentemente parado."}`;
}

const MODELO_PADRAO = 'claude-sonnet-5-5'; // Claude de porte médio; troque com ANTHROPIC_MODEL

let cliente = null;
const getCliente = () => (cliente ||= new Anthropic()); // lê ANTHROPIC_API_KEY (e ANTHROPIC_BASE_URL, se houver)

async function interpretar(texto, foto, equipamentos = []) {
  if (!process.env.ANTHROPIC_API_KEY) return { motivo: 'sem_chave' };
  const content = [];
  if (foto) {
    const m = /^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/.exec(foto);
    if (!m) return { motivo: 'falha' };
    content.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  }
  content.push({ type: 'text', text: montaPrompt(texto, !!foto, equipamentos) });

  const resp = await getCliente().messages.create({
    model: process.env.ANTHROPIC_MODEL || MODELO_PADRAO,
    max_tokens: 4000,
    output_config: { effort: 'medium' },
    messages: [{ role: 'user', content }],
  });
  if (resp.stop_reason === 'refusal') return { motivo: 'falha' };
  const out = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
  const equip = equipamentos.includes(j.equipamento) ? j.equipamento : '';
  let outra = j.ocorrencia === 'Outra ocorrência';
  let oc = OCORRENCIAS.find((o) => o.ocorrencia === j.ocorrencia);
  let derivada = false;
  if (!oc && !outra && equip) { // IA reconheceu o equipamento mas não a ocorrência: deriva do equipamento
    oc = OCORRENCIAS.find((o) => o.ocorrencia === OCORRENCIA_DO_EQUIPAMENTO[equip]);
    outra = !oc; derivada = !!oc;
  }
  return {
    ocorrencia: oc ? oc.ocorrencia : outra ? 'Outra ocorrência' : '', tipo: oc ? oc.tipo : outra ? 'Predial · geral' : '', causa: oc ? oc.causa : outra ? 'A diagnosticar' : '',
    iaOcorrenciaSegura: !!oc && !derivada,
    equipamento: equip,
    prioridade: PRIORIDADES.includes(j.prioridade) ? j.prioridade : (oc ? oc.prioridade : ''),
    ambiente: AMBIENTES.includes(j.ambiente) ? j.ambiente : '',
    pavimento: PAVIMENTOS.includes(j.pavimento) ? j.pavimento : '',
    detalheLocal: String(j.detalheLocal || '').slice(0, 80), descricao: String(j.descricao || '').slice(0, 300),
  };
}
module.exports = { interpretar };
