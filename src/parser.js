'use strict';
// Decupagem do texto (transcrição de voz ou digitado) em campos da OS.
// MVP: regras + palavras-chave (determinístico, sem custo). A função parseOS tem a mesma
// assinatura que teria uma versão com LLM, então pode ser trocada depois sem mexer no app.
const { locais, PRIORIDADES, OCORRENCIAS, GENERICA } = require('./catalogo');

const norm = (s) => ' ' + s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9º°\-\s]/g, ' ').replace(/\s+/g, ' ') + ' ';

const URGENCIA_LEVE = ['urgente', 'urgencia', 'agora', 'pingando', 'alagando', 'parou', 'sem energia'];
const URGENCIA_GRAVE = ['paciente', 'risco', 'perigo', 'faiscando', 'fumaca', 'cheiro de queimado', 'choque', 'incendio'];
const AREAS_CRITICAS = ['Centro Cirúrgico', 'UTI Adulto', 'Pronto-Socorro', 'CME', 'Central de Gases / Utilidades'];

function detectaOcorrencia(n) {
  let best = null, bestScore = 0;
  for (const o of OCORRENCIAS) {
    let sc = 0;
    for (const p of o.palavras) if (n.includes(' ' + p)) sc += p.includes(' ') || p.length > 8 ? 2 : 1; // início de palavra
    if (sc > bestScore) { best = o; bestScore = sc; }
  }
  return { o: best || GENERICA, achou: !!best };
}

function detectaAmbiente(n) {
  let best = null, len = 0;
  for (const a of locais.ambientes) for (const al of a.aliases) {
    const needle = n.includes(' ' + al.trim() + ' ') || (al !== al.trim() && n.includes(al)) ? al.trim() : null;
    if (needle && needle.length > len) { best = a; len = needle.length; }
  }
  return best;
}

function detectaPavimento(n, amb) {
  if (/\b(terreo)\b/.test(n)) return 'Térreo';
  if (/subsolo/.test(n)) return 'Subsolo';
  const m = n.match(/\b(1|2|3|4|primeiro|segundo|terceiro|quarto)\s*(º|°|o)?\s*(andar|pavimento|piso)/);
  if (m) {
    const map = { 1: 1, primeiro: 1, 2: 2, segundo: 2, 3: 3, terceiro: 3, 4: 4, quarto: 4 };
    return `${map[m[1]]}º Pavimento`;
  }
  return amb && amb.pavimento !== 'Geral' ? amb.pavimento : null;
}

function detectaDetalhe(n) {
  const m = n.match(/\b(leito|sala|quarto|box|consultorio|apartamento)\s*(n\s*)?(º|°)?\s*(\d{1,3})\b/);
  if (m) return m[1][0].toUpperCase() + m[1].slice(1) + ' ' + m[4];
  return null;
}

function prioridade(base, n, ambNome) {
  let i = PRIORIDADES.indexOf(base);
  if (URGENCIA_GRAVE.some((u) => n.includes(u))) i++;
  else if (URGENCIA_LEVE.some((u) => n.includes(u)) && i < 2) i++; // urgência leve eleva no máx. até Alta
  if (AREAS_CRITICAS.includes(ambNome) && i < 3) i++;
  if (/\b(sem urgencia|quando der|nao urgente)\b/.test(n)) i--;
  return PRIORIDADES[Math.max(0, Math.min(3, i))];
}

function parseOS(texto) {
  const original = (texto || '').trim();
  const n = norm(original);
  const { o, achou } = detectaOcorrencia(n);
  const amb = detectaAmbiente(n);
  const pav = detectaPavimento(n, amb);
  const detalhe = detectaDetalhe(n);
  const conf = (b) => (b ? 'ia' : 'revisar');
  // sem correspondência: deixa ocorrência/tipo/causa em branco para o operador escolher
  const sem = !achou;
  return {
    descricao: original.replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase()),
    pavimento: pav || '',
    ambiente: amb ? amb.nome : '',
    detalheLocal: detalhe || '',
    tipo: sem ? '' : o.tipo,
    ocorrencia: sem ? '' : o.ocorrencia,
    causa: sem ? '' : o.causa,
    prioridade: prioridade(o.prioridade, n, amb && amb.nome),
    _confianca: { local: conf(!!amb), ocorrencia: conf(achou), prioridade: conf(achou), causa: conf(achou) },
  };
}

function vazio() {
  return { descricao: '', pavimento: '', ambiente: '', detalheLocal: '', tipo: '', ocorrencia: '', causa: '', prioridade: '',
    _confianca: { local: 'revisar', ocorrencia: 'revisar', prioridade: 'revisar', causa: 'revisar' } };
}

module.exports = { parseOS, vazio };
