'use strict';
// Métricas da aba "Gestão da IA": uso, custo, qualidade, latência, armazenamento, configuração e alertas.
const fs = require('fs');
const path = require('path');
const iaLog = require('./iaLog');
const store = require('./store');
const { config } = require('./vision');

const DATA = path.join(__dirname, '..', 'data');
const DIA = 86400000;
const r2 = (n) => Math.round(n * 100) / 100;
const soma = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
const media = (a, f) => (a.length ? soma(a, f) / a.length : 0);
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
function percentil(arr, p) { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]; }

function tamanho(f) { try { return fs.statSync(f).size; } catch { return 0; } }
function armazenamento() {
  const up = path.join(DATA, 'uploads');
  let fotos = 0, bytesFotos = 0;
  try { for (const n of fs.readdirSync(up)) { fotos++; bytesFotos += tamanho(path.join(up, n)); } } catch { /* sem pasta */ }
  const itens = [
    { nome: 'Fotos das OS', bytes: bytesFotos, detalhe: `${fotos} arquivo(s)` },
    { nome: 'Registro de OS (os.json)', bytes: tamanho(path.join(DATA, 'os.json')), detalhe: `${store.all().length} OS` },
    { nome: 'Log da IA (ia_log.json)', bytes: tamanho(path.join(DATA, 'ia_log.json')), detalhe: `${iaLog.all().length} chamadas` },
    { nome: 'Base de custos Neovero (.xlsx)', bytes: tamanho(path.join(DATA, 'neovero_simulador.xlsx')), detalhe: 'simulação' },
  ];
  return { itens, totalBytes: soma(itens, (i) => i.bytes), fotos, bytesFotos };
}

async function build({ dias = 30, origem = 'todos' } = {}) {
  const agora = Date.now();
  const desde = dias > 0 ? agora - dias * DIA : 0;
  const todos = iaLog.all();
  const l = todos.filter((e) => new Date(e.ts).getTime() >= desde && (origem === 'todos' || !e.demo));
  const comIA = l.filter((e) => e.resultado === 'ok' || e.resultado === 'erro' || e.resultado === 'recusa'); // chamadas que tentaram a IA
  const ok = l.filter((e) => e.resultado === 'ok');
  const lat = ok.map((e) => e.latencia_ms);
  const tin = soma(ok, (e) => e.tokens_in), tout = soma(ok, (e) => e.tokens_out);
  const custoTotal = soma(l, (e) => e.custo_usd);

  // por dia (preenche dias sem chamadas)
  const porDia = {};
  const nDias = dias > 0 ? dias : Math.max(1, Math.ceil((agora - Math.min(agora, ...l.map((e) => new Date(e.ts).getTime()))) / DIA) + 1);
  for (let i = nDias - 1; i >= 0; i--) { const k = new Date(agora - i * DIA).toISOString().slice(0, 10); porDia[k] = { dia: k, chamadas: 0, erros: 0, tin: 0, tout: 0, custo: 0 }; }
  for (const e of l) { const x = porDia[e.ts.slice(0, 10)]; if (!x) continue; x.chamadas++; if (e.resultado !== 'ok') x.erros++; x.tin += e.tokens_in || 0; x.tout += e.tokens_out || 0; x.custo += e.custo_usd || 0; }

  // por canal
  const canais = ['texto', 'foto', 'texto+foto'].map((c) => {
    const a = l.filter((e) => e.canal === c), o = a.filter((e) => e.resultado === 'ok');
    return { canal: c, chamadas: a.length, sucesso: pct(o.length, a.length), latMedia: Math.round(media(o, (e) => e.latencia_ms)), latP95: Math.round(percentil(o.map((e) => e.latencia_ms), 95)),
      tokensMedios: Math.round(media(o, (e) => e.tokens_in + e.tokens_out)), custoMedio: media(o, (e) => e.custo_usd), custo: soma(a, (e) => e.custo_usd) };
  });

  // qualidade: sugestão da IA x confirmação do operador (somente chamadas bem-sucedidas já confirmadas)
  const rev = ok.filter((e) => e.revisao);
  const campos = iaLog.CAMPOS.map((c) => {
    const cont = { mantido: 0, alterado: 0, preenchido: 0, vazio: 0 };
    for (const e of rev) cont[e.revisao[c]]++;
    const sug = cont.mantido + cont.alterado;
    return { campo: c, ...cont, aceite: pct(cont.mantido, sug), cobertura: pct(sug, sug + cont.preenchido) };
  });
  const corrigidosPorOS = rev.length ? r2(media(rev, (e) => Object.values(e.revisao).filter((v) => v === 'alterado' || v === 'preenchido').length)) : null;
  const semCorrecao = rev.length ? pct(rev.filter((e) => Object.values(e.revisao).every((v) => v === 'mantido' || v === 'vazio')).length, rev.length) : null;

  // modelos (pedido x efetivamente usado)
  const modelos = {};
  for (const e of ok) { const k = e.modelo_usado || '—'; (modelos[k] ||= { modelo: k, chamadas: 0, tokens: 0, custo: 0 }); modelos[k].chamadas++; modelos[k].tokens += e.tokens_in + e.tokens_out; modelos[k].custo += e.custo_usd; }
  const fallbacks = ok.filter((e) => e.modelo_pedido && e.modelo_usado && e.modelo_pedido !== e.modelo_usado).length;

  // erros
  const errosAgrup = {};
  for (const e of l.filter((x) => x.erro)) { const k = e.erro.replace(/\d{4,}/g, 'N').slice(0, 70); errosAgrup[k] = (errosAgrup[k] || 0) + 1; }

  // armazenamento + projeção (referência da apresentação: ~100 OS/dia em um hospital)
  const arm = armazenamento();
  const fotosLog = l.filter((e) => e.fotoKB > 0);
  const fotoMedKB = fotosLog.length ? Math.round(media(fotosLog, (e) => e.fotoKB)) : 150;
  const pctFoto = l.length ? fotosLog.length / l.length : 0.4;
  const OS_DIA = 100;
  const custoMedio = ok.length ? custoTotal / l.filter((e) => e.custo_usd > 0).length : 0;
  const projecao = {
    osPorDia: OS_DIA, fotoMedKB, pctFoto: Math.round(pctFoto * 100),
    fotosMesMB: Math.round((OS_DIA * 30 * pctFoto * fotoMedKB) / 1024), fotosAnoGB: r2((OS_DIA * 365 * pctFoto * fotoMedKB) / 1024 / 1024),
    custoMesUSD: r2(OS_DIA * 30 * custoMedio), tokensMes: Math.round(OS_DIA * 30 * (ok.length ? (tin + tout) / ok.length : 0)),
  };

  const cfg = config();
  const taxaErro = pct(l.filter((e) => e.resultado === 'erro' || e.resultado === 'recusa').length, comIA.length);
  const alertas = [];
  if (!cfg.chaveConfigurada) alertas.push({ nivel: 'alto', msg: 'Chave da OpenAI não configurada no servidor: o app está usando só as regras (sem IA).' });
  if (comIA.length >= 10 && taxaErro != null && taxaErro > 5) alertas.push({ nivel: 'alto', msg: `Taxa de erro da IA em ${taxaErro}% no período (referência: abaixo de 5%).` });
  if (fallbacks > 0) alertas.push({ nivel: 'medio', msg: `${fallbacks} chamada(s) caíram no modelo de reserva: o modelo principal pode estar indisponível ou sem acesso.` });
  const p95 = percentil(lat, 95);
  if (ok.length >= 5 && p95 > 8000) alertas.push({ nivel: 'medio', msg: `Latência p95 de ${(p95 / 1000).toFixed(1)} s: operadores podem sentir lentidão no registro.` });
  for (const c of campos) if (rev.length >= 10 && c.aceite != null && c.aceite < 70) alertas.push({ nivel: 'medio', msg: `Campo "${c.campo}" aceito sem alteração em só ${c.aceite}% das vezes: vale revisar o prompt ou o catálogo.` });
  if (projecao.custoMesUSD > 100) alertas.push({ nivel: 'baixo', msg: `Projeção de custo da IA: US$ ${projecao.custoMesUSD}/mês para ~${OS_DIA} OS/dia.` });
  if (l.some((e) => e.demo)) alertas.push({ nivel: 'info', msg: `Há ${l.filter((e) => e.demo).length} chamadas de demonstração (fictícias) nesta visão. Use "Somente reais" para ver apenas o uso verdadeiro.` });

  return {
    geradoEm: new Date().toISOString(), filtro: { dias, origem }, config: cfg,
    kpis: {
      chamadas: l.length, comIA: comIA.length, sucesso: pct(ok.length, comIA.length), regrasApenas: l.filter((e) => e.resultado === 'regras').length,
      latMedia: Math.round(media(ok, (e) => e.latencia_ms)), latP95: Math.round(p95),
      tokensEntrada: tin, tokensSaida: tout, tokensTotal: tin + tout, custoUSD: r2(custoTotal), custoPorChamadaUSD: Math.round(custoMedio * 10000) / 10000,
      pctComFoto: pct(fotosLog.length, l.length), mediaTokensPorChamada: ok.length ? Math.round((tin + tout) / ok.length) : 0,
      semCorrecao, corrigidosPorOS, revisadas: rev.length,
    },
    porDia: Object.values(porDia), canais, campos, modelos: Object.values(modelos).sort((a, b) => b.chamadas - a.chamadas), fallbacks,
    resultados: ['ok', 'erro', 'recusa', 'regras'].map((k) => ({ chave: k, qtd: l.filter((e) => e.resultado === k).length })),
    errosAgrup: Object.entries(errosAgrup).map(([erro, qtd]) => ({ erro, qtd })).sort((a, b) => b.qtd - a.qtd).slice(0, 6),
    armazenamento: arm, projecao, alertas,
    ultimas: [...l].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 15).map((e) => ({ ts: e.ts, canal: e.canal, resultado: e.resultado, modelo: e.modelo_usado || e.modelo_pedido, tokens: (e.tokens_in || 0) + (e.tokens_out || 0), latencia_ms: e.latencia_ms, custo_usd: e.custo_usd, erro: e.erro, os: e.os || null, demo: !!e.demo })),
  };
}
module.exports = { build };
