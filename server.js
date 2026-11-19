'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./src/store');
const nv = require('./src/neovero');
const { parseOS, vazio } = require('./src/parser');
const { interpretar, resumoErro } = require('./src/vision');
const dash = require('./src/dashboard');
const { locais, PRIORIDADES, OCORRENCIAS } = require('./src/catalogo');

const PUB = path.join(__dirname, 'public');
const UPLOADS = path.join(__dirname, 'data', 'uploads');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
const readBody = (req) => new Promise((ok, ko) => { let b = ''; req.on('data', (c) => { b += c; if (b.length > 8e6) { ko(new Error('payload grande')); req.destroy(); } }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { ko(e); } }); });
const clean = (s, max = 400) => String(s ?? '').slice(0, max).trim();

async function osComCusto(codigo) {
  const os = store.get(codigo);
  if (!os) return null;
  return { ...os, custoDet: await nv.getCustos(codigo) };
}

async function api(req, res, url) {
  const p = url.pathname;
  if (req.method === 'GET' && p === '/api/config') {
    return send(res, 200, { hospital: locais.hospital, ambientes: locais.ambientes.map((a) => ({ nome: a.nome, pavimento: a.pavimento })),
      pavimentos: [...new Set(locais.ambientes.map((a) => a.pavimento))], prioridades: PRIORIDADES,
      ocorrencias: OCORRENCIAS.map((o) => ({ ocorrencia: o.ocorrencia, tipo: o.tipo, causa: o.causa, prioridade: o.prioridade })), equipamentos: await nv.getEquipamentos(), proximoCodigo: store.nextCodigo() });
  }
  if (req.method === 'POST' && p === '/api/parse') {
    const { texto, foto } = await readBody(req);
    const t = clean(texto, 2000);
    if (!t && !foto) return send(res, 400, { erro: 'Fale, digite ou fotografe a ocorrência.' });
    const listaEq = (await nv.getEquipamentos()).map((e) => e.nome);
    const d = t ? parseOS(t, listaEq) : vazio();
    // IA (OpenAI) tem prioridade sobre as regras quando há chave; regras preenchem o que a IA deixar vazio.
    let status = foto ? 'falha' : null;
    try {
      const v = await interpretar(t, foto, listaEq);
      if (v && v.motivo) { if (foto) status = v.motivo; }
      else if (v) {
        if (foto) status = 'lida';
        const regras = { ...d };
        for (const k of ['ocorrencia', 'tipo', 'causa', 'prioridade', 'ambiente', 'pavimento', 'detalheLocal', 'descricao', 'equipamento']) d[k] = v[k] || regras[k] || '';
        const c = d._confianca;
        if (v.iaOcorrenciaSegura) { c.ocorrencia = 'ia'; c.causa = 'ia'; c.prioridade = 'ia'; }
        else if (v.ocorrencia) { c.ocorrencia = 'revisar'; c.prioridade = 'revisar'; }
        if (v.ambiente) c.local = 'ia';
        if (v.equipamento) c.equipamento = 'ia';
      }
    } catch (e) { d._erro = resumoErro(e); console.error('interpretação por IA falhou:', d._erro); }
    d._foto = status;
    return send(res, 200, d);
  }
  if (req.method === 'POST' && p === '/api/os') {
    const b = await readBody(req);
    if (!clean(b.ambiente) || !clean(b.ocorrencia)) return send(res, 400, { erro: 'Ambiente e ocorrência são obrigatórios.' });
    if (!PRIORIDADES.includes(b.prioridade)) return send(res, 400, { erro: 'Prioridade inválida.' });
    const equipamentoValido = (await nv.getEquipamentos()).some((e) => e.nome === b.equipamento) ? b.equipamento : '';
    const codigo = store.nextCodigo();
    let foto = null;
    if (typeof b.foto === 'string' && /^data:image\/(png|jpe?g|webp);base64,/.test(b.foto)) {
      fs.mkdirSync(UPLOADS, { recursive: true });
      const ext = b.foto.startsWith('data:image/png') ? 'png' : 'jpg';
      foto = `${codigo}.${ext}`;
      fs.writeFileSync(path.join(UPLOADS, foto), Buffer.from(b.foto.split(',')[1], 'base64'));
    }
    const os = { codigo, abertura: new Date().toISOString(), fechamento: null, status: 'Aberta', pavimento: clean(b.pavimento, 60), ambiente: clean(b.ambiente, 80), detalheLocal: clean(b.detalheLocal, 80),
      tipo: clean(b.tipo, 80), ocorrencia: clean(b.ocorrencia, 80), equipamento: equipamentoValido, causa: clean(b.causa, 120), prioridade: b.prioridade, descricao: clean(b.descricao, 2000) || (b.foto ? 'Registro por foto.' : clean(b.ocorrencia, 80)),
      canal: ['voz', 'texto', 'foto'].includes(b.canal) ? b.canal : 'texto', registradoPor: clean(b.registradoPor, 60) || 'Operação', foto };
    store.add(os);
    return send(res, 201, os);
  }
  let m;
  if (req.method === 'GET' && (m = p.match(/^\/api\/os\/(OS-\d{4}-\d{5})$/))) {
    const o = await osComCusto(m[1]);
    return o ? send(res, 200, o) : send(res, 404, { erro: 'OS não encontrada' });
  }
  if (req.method === 'POST' && (m = p.match(/^\/api\/os\/(OS-\d{4}-\d{5})\/status$/))) {
    const os = store.get(m[1]); const { status } = await readBody(req);
    if (!os) return send(res, 404, { erro: 'OS não encontrada' });
    if (!['Aberta', 'Em andamento', 'Concluída'].includes(status)) return send(res, 400, { erro: 'Status inválido' });
    os.status = status; os.fechamento = status === 'Concluída' ? new Date().toISOString() : null; store.save();
    return send(res, 200, os);
  }
  // Simula o lançamento dos custos no Neovero (escreve na planilha) e já puxa de volta
  if (req.method === 'POST' && (m = p.match(/^\/api\/neovero\/simular-lancamento\/(OS-\d{4}-\d{5})$/))) {
    const os = store.get(m[1]);
    if (!os) return send(res, 404, { erro: 'OS não encontrada' });
    await nv.lancarCustosSimulados(os);
    return send(res, 200, await osComCusto(m[1]));
  }
  if (req.method === 'GET' && p === '/api/dashboard') return send(res, 200, await dash.build());
  if (req.method === 'GET' && p === '/neovero/planilha.xlsx') {
    res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="neovero_simulador.xlsx"' });
    return fs.createReadStream(nv.FILE).pipe(res);
  }
  return send(res, 404, { erro: 'Rota não encontrada' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/neovero/')) return await api(req, res, url);
    if (url.pathname.startsWith('/uploads/')) {
      const f = path.join(UPLOADS, path.basename(url.pathname));
      return fs.existsSync(f) ? send(res, 200, fs.readFileSync(f), MIME[path.extname(f)] || 'image/jpeg') : send(res, 404, 'nf', 'text/plain');
    }
    const rel = url.pathname === '/' ? 'index.html' : path.normalize(url.pathname).replace(/^(\.\.[\/\\])+/, '');
    const f = path.join(PUB, rel);
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(res, 404, 'Não encontrado', 'text/plain');
    send(res, 200, fs.readFileSync(f), MIME[path.extname(f)] || 'application/octet-stream');
  } catch (e) { console.error(e); send(res, 500, { erro: 'Erro interno' }); }
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`OS Inteligente em http://localhost:${PORT}`));
