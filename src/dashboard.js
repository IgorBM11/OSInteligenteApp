'use strict';
const store = require('./store');
const nv = require('./neovero');
const { PRIORIDADES } = require('./catalogo');

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

  return {
    geradoEm: agora.toISOString(),
    kpis: {
      totalOS: lista.length,
      abertas: abertas.length,
      custoTotal: Math.round(soma(lista) * 100) / 100,
      custoMedio: comCusto.length ? Math.round(soma(comCusto) / comCusto.length * 100) / 100 : 0,
      semCusto: lista.filter((o) => o.custo == null).length,
      custoMes: Math.round(soma(lista.filter((o) => o.abertura.startsWith(mesAtual))) * 100) / 100,
      criticasAbertas: abertas.filter((o) => o.prioridade === 'Crítica' || o.prioridade === 'Alta').length,
    },
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
const slim = (o) => ({ codigo: o.codigo, abertura: o.abertura, fechamento: o.fechamento, status: o.status, pavimento: o.pavimento, ambiente: o.ambiente, detalheLocal: o.detalheLocal, tipo: o.tipo, ocorrencia: o.ocorrencia, prioridade: o.prioridade, custo: o.custo });

module.exports = { build };
