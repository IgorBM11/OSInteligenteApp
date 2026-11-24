'use strict';
// Gera histórico fictício: data/os.json (app) + data/neovero_simulador.xlsx (base de custos simulada).
const store = require('../src/store');
const nv = require('../src/neovero');
const iaLog = require('../src/iaLog');
const { locais, OCORRENCIAS, EQUIPAMENTOS, EQUIP_POR_OCORRENCIA, areaPorCategoria } = require('../src/catalogo');

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

const lista = [], mo = [], ins = [], serv = [], osNv = [];
const DUR_H = { Crítica: [1, 6], Alta: [3, 30], Média: [8, 90], Baixa: [24, 220] }; // horas até o fechamento
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
  const eqs = EQUIP_POR_OCORRENCIA[o.ocorrencia];
  const equipamento = eqs ? (pick(eqs) || '') : '';
  const codigo = `OS-${abertura.getFullYear()}-${String(1001 + i).padStart(5, '0')}`;
  const dur = DUR_H[prioridade]; const fechamento = status === 'Concluída' ? new Date(abertura.getTime() + (dur[0] + rnd() * (dur[1] - dur[0])) * 3600000).toISOString() : null;
  const eqCat = (EQUIPAMENTOS.find((e) => e.nome === equipamento) || {}).categoria;
  const os = { codigo, abertura: abertura.toISOString(), fechamento, status, pavimento: pav, ambiente: amb.nome, detalheLocal: detalhe,
    area: areaPorCategoria(eqCat), tipo: o.tipo, ocorrencia: o.ocorrencia, equipamento, causa: o.causa, prioridade,
    descricao: `${o.ocorrencia} - ${amb.nome}${detalhe ? ', ' + detalhe : ''}.`, canal: pick(['voz', 'voz', 'texto', 'foto']), registradoPor: pick(REGISTRADORES) };
  lista.push(os);
}
lista.sort((a, b) => a.abertura.localeCompare(b.abertura));
lista.forEach((o, i) => { o.codigo = `OS-${o.abertura.slice(0, 4)}-${String(1001 + i).padStart(5, '0')}`; });

for (const os of lista) {
  if (os.status === 'Aberta') continue; // ainda sem lançamento no Neovero
  const { mo: m, ins: n, serv: sv } = nv.gerarLinhas(os, rnd);
  // recorrência/serviço grande: algumas OS caras
  if (rnd() < 0.08) n.forEach((x) => { x.qtd *= 4; });
  osNv.push({ codigo_os: os.codigo, data_lancamento: (os.fechamento || os.abertura).slice(0, 10), centro_custo: `${os.pavimento} / ${os.ambiente}` });
  m.forEach((x) => mo.push({ codigo_os: os.codigo, ...x }));
  n.forEach((x) => ins.push({ codigo_os: os.codigo, ...x }));
  sv.forEach((x) => serv.push({ codigo_os: os.codigo, ...x }));
}

store.replaceAll(lista);

// ---- Histórico FICTÍCIO de chamadas da IA (demo = true), para a aba "Gestão da IA" ----
{
  const demo = [];
  const CANAIS = ['texto', 'texto', 'texto', 'foto', 'texto+foto'];
  const CAMPOS = ['ocorrencia', 'equipamento', 'ambiente', 'pavimento', 'prioridade'];
  const ACEITE = { ocorrencia: 0.9, equipamento: 0.82, ambiente: 0.77, pavimento: 0.8, prioridade: 0.84 };
  const COBERT = { ocorrencia: 0.97, equipamento: 0.7, ambiente: 0.72, pavimento: 0.75, prioridade: 0.97 };
  const ERROS = ['HTTP 429: Rate limit reached', 'timeout: The operation was aborted due to timeout', 'resposta sem JSON (finish_reason=length)', 'HTTP 503: The server is overloaded'];
  for (let d = 29; d >= 0; d--) {
    const dow = new Date(HOJE.getTime() - d * 86400000).getDay();
    const n = Math.round((dow === 0 || dow === 6 ? 4 : 13) * (0.7 + rnd() * 0.7) * (1 + (29 - d) / 80)); // cresce levemente com a adoção
    for (let i = 0; i < n; i++) {
      const canal = pick(CANAIS), temFoto = canal !== 'texto';
      const ts = new Date(HOJE.getTime() - d * 86400000 - Math.floor(rnd() * 9 * 3600000)).toISOString();
      const r = rnd();
      const resultado = r < 0.055 ? 'erro' : r < 0.06 ? 'recusa' : 'ok';
      const fallback = resultado === 'ok' && rnd() < 0.035;
      const base = 1350 + Math.floor(rnd() * 120);                  // prompt-base (instruções + listas)
      const tin = resultado === 'ok' ? base + (temFoto ? 700 + Math.floor(rnd() * 400) : 0) : 0;
      const tout = resultado === 'ok' ? 85 + Math.floor(rnd() * 70) : 0;
      const lat = resultado === 'ok' ? Math.round((temFoto ? 2600 : 1300) + rnd() * (temFoto ? 3200 : 1500) + (rnd() < 0.04 ? 5000 : 0)) : Math.round(800 + rnd() * 6000);
      const custo = (tin * 2.5 + tout * 10) / 1e6;
      const e = { id: 'demo' + demo.length, ts, canal, resultado, erro: resultado === 'ok' ? null : (resultado === 'recusa' ? null : pick(ERROS)),
        fotoKB: temFoto ? 90 + Math.floor(rnd() * 140) : 0, chars: temFoto && canal === 'foto' ? 0 : 30 + Math.floor(rnd() * 140),
        modelo_pedido: 'gpt-6.2-sol', modelo_usado: resultado === 'ok' ? (fallback ? 'gpt-4o' : 'gpt-6.2-sol') : null, tentativas: fallback ? 2 : 1,
        tokens_in: tin, tokens_out: tout, latencia_ms: lat, custo_usd: custo, prompt: 'demo', sugestao: {}, demo: true };
      if (resultado === 'ok' && rnd() < 0.92) { // 92% das sugestões chegam a ser confirmadas em uma OS
        e.revisao = {};
        for (const c of CAMPOS) {
          const cobre = rnd() < COBERT[c] * (temFoto && c === 'equipamento' ? 1.25 : 1) * (canal === 'foto' && (c === 'ambiente' || c === 'pavimento') ? 0.35 : 1);
          e.revisao[c] = cobre ? (rnd() < ACEITE[c] ? 'mantido' : 'alterado') : (rnd() < 0.45 ? 'preenchido' : 'vazio');
        }
      }
      demo.push(e);
    }
  }
  demo.sort((a, b) => a.ts.localeCompare(b.ts));
  iaLog.replaceAll(demo);
  console.log(`Log da IA (demonstração): ${demo.length} chamadas.`);
}
const eqRows = EQUIPAMENTOS.map((e, i) => ({ codigo_equipamento: 'EQ-' + String(i + 1).padStart(3, '0'), equipamento: e.nome, categoria: e.categoria }));
nv.writeWorkbook(osNv, { mo, ins, serv }, eqRows).then(() => console.log(`OK: ${lista.length} OS, ${osNv.length} com custos no Neovero simulado.`));
