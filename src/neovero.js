'use strict';
// SIMULADOR do Neovero: a base de custos vive em data/neovero_simulador.xlsx
// (abas OS, MaoDeObra, Insumos). A integração real (API/banco do Neovero) deve
// substituir apenas este módulo mantendo a interface: getCustos(codigo) e lancarCustosSimulados(os).
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const { VALOR_HORA, OCORRENCIAS, GENERICA } = require('./catalogo');

const FILE = path.join(__dirname, '..', 'data', 'neovero_simulador.xlsx');
let cache = { mtime: 0, map: new Map() };
let chain = Promise.resolve();

const round = (n) => Math.round(n * 100) / 100;

async function load() {
  if (!fs.existsSync(FILE)) return new Map();
  const mtime = fs.statSync(FILE).mtimeMs;
  if (mtime === cache.mtime) return cache.map;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const map = new Map();
  const slot = (c) => { if (!map.has(c)) map.set(c, { maoDeObra: [], insumos: [] }); return map.get(c); };
  const rows = (name) => { const ws = wb.getWorksheet(name); const out = []; if (!ws) return out;
    const head = ws.getRow(1).values.slice(1);
    ws.eachRow((r, i) => { if (i === 1) return; const o = {}; head.forEach((h, k) => { let v = r.getCell(k + 1).value; if (v && v.result !== undefined) v = v.result; o[h] = v; }); if (o.codigo_os) out.push(o); });
    return out; };
  rows('OS').forEach((r) => slot(r.codigo_os));
  rows('MaoDeObra').forEach((r) => slot(r.codigo_os).maoDeObra.push({ tecnico: r.tecnico, especialidade: r.especialidade, horas: +r.horas, valorHora: +r.valor_hora, total: round(r.horas * r.valor_hora) }));
  rows('Insumos').forEach((r) => slot(r.codigo_os).insumos.push({ item: r.descricao, qtd: +r.qtd, unidade: r.unidade, valorUnit: +r.valor_unit, total: round(r.qtd * r.valor_unit) }));
  cache = { mtime, map };
  return map;
}

async function getCustos(codigo) {
  const m = (await load()).get(codigo);
  if (!m) return null;
  const mo = round(m.maoDeObra.reduce((s, x) => s + x.total, 0));
  const ins = round(m.insumos.reduce((s, x) => s + x.total, 0));
  return { ...m, totalMaoDeObra: mo, totalInsumos: ins, total: round(mo + ins) };
}
async function getTodos() {
  const map = await load();
  const out = {};
  for (const c of map.keys()) out[c] = await getCustos(c);
  return out;
}

const TECNICOS = { Hidráulica: ['Carlos Pinto', 'Jonas Lima'], Elétrica: ['Rafael Souza', 'Marcos Dias'], Climatização: ['Tiago Nunes', 'Evandro Reis'], Civil: ['Paulo Gomes', 'Edson Melo'], 'Gases medicinais': ['Sérgio Braga'], Elevadores: ['Equipe Terceirizada (elevadores)'], Serralheria: ['Nelson Prado'], Pintura: ['Wilson Araújo'] };

// gera linhas de custo plausíveis p/ uma OS (usado no seed e no botão "Simular lançamento")
function gerarLinhas(os, rnd = Math.random) {
  const o = OCORRENCIAS.find((x) => x.ocorrencia === os.ocorrencia) || GENERICA;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const h = Math.round((o.horas[0] + rnd() * (o.horas[1] - o.horas[0])) * 2) / 2; // passo de 0,5h
  const mo = [{ tecnico: pick(TECNICOS[o.esp] || ['Equipe Manutenção']), especialidade: o.esp, horas: h, valor_hora: VALOR_HORA[o.esp] }];
  if (h > 6) mo.push({ tecnico: 'Ajudante de manutenção', especialidade: 'Civil', horas: round(h * 0.8), valor_hora: VALOR_HORA.Civil * 0.6 });
  const n = 1 + Math.floor(rnd() * Math.min(3, o.insumos.length));
  const ins = [...o.insumos].sort(() => rnd() - 0.5).slice(0, n).map(([d, u, v, mi, ma]) => ({
    descricao: d, unidade: u, qtd: mi + Math.floor(rnd() * (ma - mi + 1)), valor_unit: round(v * (0.9 + rnd() * 0.25)),
  }));
  return { mo, ins };
}

async function writeWorkbook(osList, linhasPorOS) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Simulador Neovero (OS Inteligente)';
  const mk = (name, cols, rows) => { const ws = wb.addWorksheet(name); ws.columns = cols.map(([header, key, width]) => ({ header, key, width })); rows.forEach((r) => ws.addRow(r)); ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3D5A6B' } }; ws.views = [{ state: 'frozen', ySplit: 1 }]; return ws; };
  mk('OS', [['codigo_os', 'codigo_os', 14], ['data_lancamento', 'data_lancamento', 16], ['centro_custo', 'centro_custo', 28]], osList);
  mk('MaoDeObra', [['codigo_os', 'codigo_os', 14], ['tecnico', 'tecnico', 30], ['especialidade', 'especialidade', 18], ['horas', 'horas', 8], ['valor_hora', 'valor_hora', 12]], linhasPorOS.mo);
  mk('Insumos', [['codigo_os', 'codigo_os', 14], ['descricao', 'descricao', 40], ['unidade', 'unidade', 10], ['qtd', 'qtd', 8], ['valor_unit', 'valor_unit', 12]], linhasPorOS.ins);
  await wb.xlsx.writeFile(FILE);
  cache.mtime = 0;
}

// Anexa custos de uma OS na planilha (simula o lançamento feito no Neovero pela manutenção)
function lancarCustosSimulados(os) {
  chain = chain.then(async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(FILE);
    if (await getCustos(os.codigo)) return false;
    const { mo, ins } = gerarLinhas(os);
    wb.getWorksheet('OS').addRow([os.codigo, new Date().toISOString().slice(0, 10), `${os.pavimento} / ${os.ambiente}`]);
    mo.forEach((r) => wb.getWorksheet('MaoDeObra').addRow([os.codigo, r.tecnico, r.especialidade, r.horas, r.valor_hora]));
    ins.forEach((r) => wb.getWorksheet('Insumos').addRow([os.codigo, r.descricao, r.unidade, r.qtd, r.valor_unit]));
    await wb.xlsx.writeFile(FILE);
    cache.mtime = 0;
    return true;
  });
  return chain;
}

module.exports = { getCustos, getTodos, gerarLinhas, writeWorkbook, lancarCustosSimulados, FILE };
