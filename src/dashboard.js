'use strict';
const store = require('./store');
const nv = require('./neovero');
const { PRIORIDADES, SLA_HORAS } = require('./catalogo');

const PESO_PRIO = { Crítica: 60, Alta: 40, Média: 20, Baixa: 5 };
const DIA = 86400000;

// Score de prioridade (0-100) para OS em aberto: urgência + tempo parado + custo estimado
function score(os, custo, maxCusto, agora) {
  const dias = (agora - new Date(os.abertura)) / DIA;
  const s = PESO_PRIO[os.prioridade] + Math.min(25, dias * 2.5) + (custo ? Math.min(15, (custo / maxCusto) * 15) : 0);
  return Math.round(Math.min(100, s));
}

async function build() {
  const agora = new Date();
  const custos = await nv.getTodos();
  const lista = store.all().map((o) => ({ ...o, custo: custos[o.codigo] ? custos[o.codigo].total : null, custoDet: custos[o.codigo] || null }));
  const comCusto = lista.filter((o) => o.custo != null);
  const maxCusto = Math.max(1, ...comCusto.map((o) => o.custo));
  const soma = (a) => a.reduce((s, o) => s + (o.custo || 0), 0);
  const agrupa = (key) => {
    const m = {};
    for (const o of lista) { const k = typeof key === 'function' ? key(o) : o[key]; (m[k] ||= { chave: k, qtd: 0, custo: 0 }); m[k].qtd++; m[k].custo += o.custo || 0; }
    return Object.values(m).map((x) => ({ ...x, custo: Math.round(x.custo * 100) / 100 }));
  };
  const abertas = lista.filter((o) => o.status !== 'Concluída');
  const mensal = agrupa((o) => o.abertura.slice(0, 7)).sort((a, b) => a.chave.localeCompare(b.chave));
  const mesAtual = agora.toISOString().slice(0, 7);

  // composição do custo (mão de obra + peças + serviço externo), como na análise da apresentação
  const composicao = { maoDeObra: 0, pecas: 0, servicos: 0 };
  for (const o of comCusto) { composicao.maoDeObra += o.custoDet.totalMaoDeObra; composicao.pecas += o.custoDet.totalPecas; composicao.servicos += o.custoDet.totalServicos; }
  for (const k of Object.keys(composicao)) composicao[k] = Math.round(composicao[k] * 100) / 100;

  // recorrência: mesmo equipamento no mesmo ambiente nos 90 dias anteriores
  const comEq = lista.filter((o) => o.equipamento);
  for (const o of comEq) o.recorrente = comEq.some((x) => x !== o && x.equipamento === o.equipamento && x.ambiente === o.ambiente && x.abertura < o.abertura && (new Date(o.abertura) - new Date(x.abertura)) <= 90 * DIA);
  const porEquipamento = {};
  for (const o of comEq) { const m = (porEquipamento[o.equipamento] ||= { chave: o.equipamento, qtd: 0, custo: 0, recorrentes: 0 }); m.qtd++; m.custo += o.custo || 0; if (o.recorrente) m.recorrentes++; }

  // SLA por prioridade (premissa em catalogo.js) e tempo de atendimento
  const concl = lista.filter((o) => o.status === 'Concluída' && o.fechamento);
  const horas = (o) => (new Date(o.fechamento) - new Date(o.abertura)) / 3600000;
  const dentroSLA = concl.filter((o) => horas(o) <= SLA_HORAS[o.prioridade]).length;
  const emAtraso = abertas.filter((o) => (agora - new Date(o.abertura)) / 3600000 > SLA_HORAS[o.prioridade]).length;

  return {
    geradoEm: agora.toISOString(),
    kpis: {
      totalOS: lista.length,
      abertas: abertas.length,
      custoTotal: Math.round(soma(lista) * 100) / 100,
      custoMedio: comCusto.length ? Math.round(soma(comCusto) / comCusto.length * 100) / 100 : 0,
      semCusto: lista.filter((o) => o.custo == null).length,
      custoMes: Math.round(soma(lista.filter((o) => o.abertura.startsWith(mesAtual))) * 100) / 100,
      comEquipamentoPct: Math.round(comEq.length / Math.max(1, lista.length) * 1000) / 10, comEquipamento: comEq.length,
      recorrentes: comEq.filter((o) => o.recorrente).length, recorrentesPct: Math.round(comEq.filter((o) => o.recorrente).length / Math.max(1, comEq.length) * 1000) / 10,
      slaPct: concl.length ? Math.round(dentroSLA / concl.length * 1000) / 10 : null, emAtraso, tempoMedioH: concl.length ? Math.round(concl.reduce((a, o) => a + horas(o), 0) / concl.length * 10) / 10 : null,
      criticasAbertas: abertas.filter((o) => o.prioridade === 'Crítica' || o.prioridade === 'Alta').length,
    },
    composicao, slaHoras: SLA_HORAS,
    porEquipamento: Object.values(porEquipamento).map((x) => ({ ...x, custo: Math.round(x.custo * 100) / 100 })).sort((a, b) => b.custo - a.custo),
    porArea: agrupa('area').sort((a, b) => b.custo - a.custo),
    porTipo: agrupa('tipo').sort((a, b) => b.custo - a.custo),
    porOcorrencia: agrupa('ocorrencia').sort((a, b) => b.qtd - a.qtd),
    porAmbiente: agrupa('ambiente').sort((a, b) => b.custo - a.custo),
    porPavimento: agrupa('pavimento').sort((a, b) => b.custo - a.custo),
    porPrioridade: PRIORIDADES.map((p) => ({ chave: p, qtd: lista.filter((o) => o.prioridade === p).length })),
    mensal,
    rankingCusto: [...comCusto].sort((a, b) => b.custo - a.custo).map(slim),
    rankingPrioridade: abertas.map((o) => ({ ...slim(o), score: score(o, o.custo, maxCusto, agora), diasAberta: Math.floor((agora - new Date(o.abertura)) / DIA) }))
      .sort((a, b) => b.score - a.score),
    historico: lista.map(slim).sort((a, b) => b.abertura.localeCompare(a.abertura)),
  };
}
const slim = (o) => ({ codigo: o.codigo, abertura: o.abertura, fechamento: o.fechamento, status: o.status, pavimento: o.pavimento, ambiente: o.ambiente, detalheLocal: o.detalheLocal, tipo: o.tipo, ocorrencia: o.ocorrencia, equipamento: o.equipamento || '', area: o.area || 'Manutenção predial', recorrente: !!o.recorrente, prioridade: o.prioridade, custo: o.custo });

// "Consulta às bases": histórico do ativo (equipamento + ambiente) no Neovero, para a etapa de confirmação
async function consultaEquipamento(equipamento, ambiente) {
  const custos = await nv.getTodos();
  const agora = Date.now();
  const mesmo = store.all().filter((o) => o.equipamento === equipamento);
  const noLocal = mesmo.filter((o) => o.ambiente === ambiente);
  const base = noLocal.length ? noLocal : mesmo;
  const ult90 = base.filter((o) => agora - new Date(o.abertura) <= 90 * DIA);
  const pecas = {};
  for (const o of base) for (const p of (custos[o.codigo]?.pecas || [])) { const m = (pecas[p.item] ||= { codigo: p.codigo, item: p.item, vezes: 0 }); m.vezes++; }
  return {
    equipamento, ambiente, escopo: noLocal.length ? 'ambiente' : 'hospital', osTotal: base.length, osUlt90d: ult90.length,
    custoTotal: Math.round(base.reduce((a, o) => a + (custos[o.codigo]?.total || 0), 0) * 100) / 100,
    recorrente: ult90.length >= 2,
    ultimas: [...base].sort((a, b) => b.abertura.localeCompare(a.abertura)).slice(0, 3).map((o) => ({ codigo: o.codigo, abertura: o.abertura, ocorrencia: o.ocorrencia, status: o.status, custo: custos[o.codigo]?.total ?? null })),
    pecasFrequentes: Object.values(pecas).sort((a, b) => b.vezes - a.vezes).slice(0, 3),
  };
}
module.exports = { build, consultaEquipamento };
