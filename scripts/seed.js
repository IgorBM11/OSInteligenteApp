'use strict';
// Gera histórico fictício: data/os.json (app) + data/neovero_simulador.xlsx (base de custos simulada).
const store = require('../src/store');
const nv = require('../src/neovero');
const { locais, OCORRENCIAS } = require('../src/catalogo');

let seed = 20261119;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const HOJE = new Date('2026-11-19T12:00:00-04:00');
const REGISTRADORES = ['Ana Beatriz (Operação)', 'Marcelo Tavares (Operação)', 'Luciana Prado (Operação)'];
const DETALHES = ['', '', 'Leito 12', 'Leito 7', 'Sala 3', 'Sala 5', 'Box 2', 'Quarto 204', 'Perto do leito 12'];
// pesos: ocorrências mais comuns
const PESO = { 'Lâmpada queimada / iluminação': 5, 'Vazamento de água': 4, 'Ar-condicionado sem refrigerar': 5, 'Tomada/disjuntor sem energia': 4, 'Infiltração no teto': 3, 'Porta/fechadura com defeito': 3, Entupimento: 3, 'Piso/forro/parede danificado': 2, 'Falha em gás medicinal': 1, 'Elevador parado/com falha': 1, 'Pintura/acabamento': 1 };
const bag = OCORRENCIAS.flatMap((o) => Array(PESO[o.ocorrencia] || 1).fill(o));
const PRIOS = ['Baixa', 'Média', 'Alta', 'Crítica'];

const lista = [], mo = [], ins = [], osNv = [];
const N = 96;
for (let i = 0; i < N; i++) {
  const diasAtras = Math.floor((1 - Math.pow(rnd(), 0.8)) * 170) ; // mais recentes um pouco mais frequentes
  const abertura = new Date(HOJE.getTime() - diasAtras * 86400000 - rnd() * 8 * 3600000);
  const o = pick(bag);
  const amb = pick(locais.ambientes);
  const pav = amb.pavimento === 'Geral' ? pick(['Térreo', '1º Pavimento', '2º Pavimento']) : amb.pavimento;
  let pi = PRIOS.indexOf(o.prioridade) + (rnd() < 0.2 ? 1 : rnd() < 0.15 ? -1 : 0);
  if (['Centro Cirúrgico', 'UTI Adulto', 'Pronto-Socorro'].includes(amb.nome) && pi < 3 && rnd() < 0.5) pi++;
  const prioridade = PRIOS[Math.max(0, Math.min(3, pi))];
  const r = rnd();
  const status = diasAtras < 2 && r < 0.6 ? 'Aberta' : diasAtras < 12 && r < 0.45 ? 'Em andamento' : diasAtras > 40 && r < 0.04 ? 'Em andamento' : 'Concluída';
  const detalhe = pick(DETALHES);
  const codigo = `OS-${abertura.getFullYear()}-${String(1001 + i).padStart(5, '0')}`;
  const fechamento = status === 'Concluída' ? new Date(abertura.getTime() + (0.3 + rnd() * 5) * 86400000).toISOString() : null;
  const os = { codigo, abertura: abertura.toISOString(), fechamento, status, pavimento: pav, ambiente: amb.nome, detalheLocal: detalhe,
    tipo: o.tipo, ocorrencia: o.ocorrencia, causa: o.causa, prioridade,
    descricao: `${o.ocorrencia} - ${amb.nome}${detalhe ? ', ' + detalhe : ''}.`, canal: pick(['voz', 'voz', 'texto', 'foto']), registradoPor: pick(REGISTRADORES) };
  lista.push(os);
}
lista.sort((a, b) => a.abertura.localeCompare(b.abertura));
lista.forEach((o, i) => { o.codigo = `OS-${o.abertura.slice(0, 4)}-${String(1001 + i).padStart(5, '0')}`; });

for (const os of lista) {
  if (os.status === 'Aberta') continue; // ainda sem lançamento no Neovero
  const { mo: m, ins: n } = nv.gerarLinhas(os, rnd);
  // recorrência/serviço grande: algumas OS caras
  if (rnd() < 0.08) n.forEach((x) => { x.qtd *= 4; });
  osNv.push({ codigo_os: os.codigo, data_lancamento: (os.fechamento || os.abertura).slice(0, 10), centro_custo: `${os.pavimento} / ${os.ambiente}` });
  m.forEach((x) => mo.push({ codigo_os: os.codigo, ...x }));
  n.forEach((x) => ins.push({ codigo_os: os.codigo, ...x }));
}

store.replaceAll(lista);
nv.writeWorkbook(osNv, { mo, ins }).then(() => console.log(`OK: ${lista.length} OS, ${osNv.length} com custos no Neovero simulado.`));
