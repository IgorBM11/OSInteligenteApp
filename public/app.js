'use strict';
const $ = (s) => document.querySelector(s);
const R$ = (v) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const R$k = (v) => v >= 1000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : R$(v);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dt = (iso) => new Date(iso).toLocaleDateString('pt-BR');
const dth = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const slaTxt = (o) => { const h = (new Date(o.fechamento) - new Date(o.abertura)) / 3600000, sla = cfg.slaHoras[o.prioridade]; return `atendida em ${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h · ${h <= sla ? `<span class="ok-b">dentro do SLA (${sla} h)</span>` : `<span class="er-b">fora do SLA (${sla} h)</span>`}`; };
const local = (o) => esc([o.pavimento, o.ambiente, o.detalheLocal].filter(Boolean).join(' · '));
const badge = (p) => `<span class="badge b-${p}">${p}</span>`;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const COR = { Crítica: '#c0392b', Alta: '#df632e', Média: '#3f86a8', Baixa: '#8a9ba0' };
const PESO = { Crítica: 3, Alta: 2, Média: 1, Baixa: 0 };
let cfg, dashData, foto = null, canal = 'texto', parseId = null;
let hf = {}; // filtros do histórico

async function j(url, opt) { const r = await fetch(url, opt); const d = await r.json(); if (!r.ok) throw new Error(d.erro || 'Erro'); return d; }
const post = (url, body) => j(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

let toastT;
function toast(html) { const t = $('#toast'); t.innerHTML = html; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 4500); }

// ---------- Abas ----------
function abrirAba(nome) {
  document.querySelectorAll('nav button,.tab').forEach((e) => e.classList.remove('on'));
  document.querySelector(`nav [data-tab=${nome}]`).classList.add('on'); $('#tab-' + nome).classList.add('on');
  window.scrollTo(0, 0);
  if (nome === 'ia') loadIA(); else if (nome !== 'registrar') loadDash();
}
document.querySelectorAll('nav button').forEach((b) => b.onclick = () => { if (b.dataset.tab === 'historico') hf = {}; abrirAba(b.dataset.tab); });
$('#home').onclick = (e) => { e.preventDefault(); abrirAba('registrar'); };
function irHistorico(filtros) { hf = { ...filtros }; abrirAba('historico'); }

// ---------- Registro ----------
const fill = (sel, arr, ph) => { sel.innerHTML = arr.map((x) => x === '' ? `<option value="">${ph || 'Selecione…'}</option>` : `<option>${esc(x)}</option>`).join(''); };
async function init() {
  cfg = await j('/api/config');
  $('#hospital').textContent = cfg.hospital;
  fill($('#f-pavimento'), ['', ...cfg.pavimentos.filter((p) => p !== 'Geral')]);
  fill($('#f-ambiente'), ['', ...cfg.ambientes.map((a) => a.nome)]);
  fill($('#f-equipamento'), ['', ...cfg.equipamentos.map((e) => e.nome)], 'Nenhum / não se aplica');
  fill($('#f-ocorrencia'), ['', ...cfg.ocorrencias.map((o) => o.ocorrencia), 'Outra ocorrência']);
  fill($('#f-prioridade'), ['', ...cfg.prioridades]);
  $('#fPrio').insertAdjacentHTML('beforeend', cfg.prioridades.map((x) => `<option>${x}</option>`).join(''));
}

// destaque dos campos: verde = IA, laranja = confira, vermelho = preencher
const CAMPOS = [['f-pavimento', 'local', 1], ['f-ambiente', 'local', 1], ['f-detalhe', 'local', 0], ['f-equipamento', 'equipamento', 0], ['f-ocorrencia', 'ocorrencia', 1], ['f-tipo', 'ocorrencia', 0], ['f-causa', 'causa', 0], ['f-prioridade', 'prioridade', 1], ['f-descricao', null, 0]];
const setS = (id, s) => { const l = document.querySelector(`label[data-f=${id}]`); if (s) l.dataset.s = s; else delete l.dataset.s; };
function marcar(conf) {
  const faltam = [];
  for (const [id, k, req] of CAMPOS) {
    const v = $('#' + id).value;
    if (!v) { if (req) { setS(id, 'vazio'); faltam.push(document.querySelector(`label[data-f=${id}]`).firstChild.textContent.trim()); } else setS(id, null); }
    else setS(id, k && conf[k] === 'ia' ? 'ia' : (k ? 'revisar' : 'ia'));
  }
  return faltam;
}
CAMPOS.forEach(([id, , req]) => { $('#' + id).addEventListener('input', () => setS(id, $('#' + id).value ? null : (req ? 'vazio' : null))); });
$('#f-ocorrencia').onchange = () => { const o = cfg.ocorrencias.find((x) => x.ocorrencia === $('#f-ocorrencia').value); if (o) { $('#f-tipo').value = o.tipo; $('#f-causa').value = o.causa; if (!$('#f-prioridade').value) { $('#f-prioridade').value = o.prioridade; setS('f-prioridade', null); } } };
$('#f-equipamento').addEventListener('change', () => consultar());
$('#f-ambiente').addEventListener('change', () => consultar());
$('#f-ambiente').onchange = () => { const a = cfg.ambientes.find((x) => x.nome === $('#f-ambiente').value); if (a && a.pavimento !== 'Geral') { $('#f-pavimento').value = a.pavimento; setS('f-pavimento', null); } };
document.querySelectorAll('[data-ex]').forEach((a) => a.onclick = (e) => { e.preventDefault(); $('#texto').value = a.dataset.ex; $('#texto').focus(); });
$('#texto').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); decupar(); } });

// Voz: Web Speech API (Chrome/Edge/Safari)
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, gravando = false;
if (!SR) { $('#mic').disabled = true; $('#mic').style.opacity = .4; $('#mic').title = 'Seu navegador não suporta voz (use Chrome ou Edge)'; }
$('#mic').onclick = () => {
  if (gravando) return rec.stop();
  rec = new SR(); rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = true;
  const base = $('#texto').value ? $('#texto').value.trim() + ' ' : '';
  rec.onresult = (e) => { let t = ''; for (const r of e.results) t += r[0].transcript; $('#texto').value = base + t; };
  rec.onstart = () => { gravando = true; canal = 'voz'; $('#mic').classList.add('rec'); $('#micStatus').textContent = 'Ouvindo… toque no microfone para parar'; };
  rec.onend = () => { gravando = false; $('#mic').classList.remove('rec'); $('#micStatus').textContent = ''; if ($('#texto').value.trim() || foto) decupar(); };
  rec.onerror = (e) => { $('#micStatus').textContent = e.error === 'not-allowed' ? 'Permita o uso do microfone no navegador.' : 'Erro de voz: ' + e.error; };
  rec.start();
};

// Câmera: foto tirada na hora (getUserMedia); fallback para a câmera do aparelho
let stream = null;
const pararCam = () => { if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; };
function definirFoto(dataUrl) { foto = dataUrl; $('#fotoThumb').src = dataUrl; $('#fotoChip').classList.remove('hidden'); if (canal !== 'voz') canal = 'foto'; }
$('#fotoRemover').onclick = () => { foto = null; $('#fotoChip').classList.add('hidden'); if (canal === 'foto') canal = 'texto'; };
function reduzir(src, cb) { const img = new Image(); img.onload = () => { const s = Math.min(1, 1000 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); cb(c.toDataURL('image/jpeg', .75)); }; img.src = src; }
$('#btnCamera').onclick = async () => {
  $('#camMsg').textContent = ''; $('#camFallback').classList.add('hidden'); $('#camShot').disabled = false; $('#dlgCam').showModal();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    $('#video').srcObject = stream;
  } catch (e) {
    $('#camMsg').textContent = 'Não foi possível acessar a câmera (' + (e.name === 'NotAllowedError' ? 'permissão negada' : 'indisponível') + ').';
    $('#camShot').disabled = true; $('#camFallback').classList.remove('hidden');
  }
};
$('#camShot').onclick = () => {
  const v = $('#video'); if (!v.videoWidth) return;
  const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0);
  reduzir(c.toDataURL('image/jpeg', .9), (d) => { definirFoto(d); pararCam(); $('#dlgCam').close(); decupar(); });
};
$('#camFile').onchange = (e) => { const f = e.target.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => reduzir(fr.result, (d) => { definirFoto(d); $('#dlgCam').close(); decupar(); }); fr.readAsDataURL(f); e.target.value = ''; };
$('#camCancel').onclick = () => $('#dlgCam').close();
$('#dlgCam').addEventListener('close', pararCam);

// Etapa 3 do fluxo: consulta às bases (Neovero simulado): ativo e histórico do equipamento
let consultaSeq = 0;
async function consultar() {
  const eq = $('#f-equipamento').value, box = $('#consulta'), seq = ++consultaSeq;
  if (!eq) { box.classList.add('hidden'); return; }
  try {
    const c = await j(`/api/neovero/consulta?equipamento=${encodeURIComponent(eq)}&ambiente=${encodeURIComponent($('#f-ambiente').value)}`);
    if (seq !== consultaSeq) return;
    const onde = c.escopo === 'ambiente' ? `em ${esc(c.ambiente)}` : 'no hospital';
    box.innerHTML = c.osTotal === 0
      ? `<h4>🔎 Consulta ao Neovero · ${esc(eq)}</h4>Sem histórico deste equipamento no Neovero: primeira ocorrência registrada.`
      : `<h4>🔎 Consulta ao Neovero · ${esc(eq)} <span class="muted">(${onde})</span>${c.recorrente ? '<span class="alerta-rec">Recorrência: avaliar reparar × substituir</span>' : ''}</h4>
        <b>${c.osUlt90d}</b> OS nos últimos 90 dias · <b>${c.osTotal}</b> no histórico · custo acumulado <b>${R$(c.custoTotal)}</b>
        <ul>${c.ultimas.map((u) => `<li><a data-os="${u.codigo}">${u.codigo}</a> · ${dt(u.abertura)} · ${esc(u.ocorrencia)} · ${u.custo == null ? 'custo pendente' : R$(u.custo)}</li>`).join('')}</ul>
        ${c.pecasFrequentes.length ? `<div class="muted" style="margin-top:6px">Peças mais usadas: ${c.pecasFrequentes.map((p) => `${esc(p.item)} (${esc(p.codigo)}) ×${p.vezes}`).join(' · ')}</div>` : ''}`;
    box.classList.remove('hidden');
  } catch { box.classList.add('hidden'); }
}

async function decupar() {
  const texto = $('#texto').value.trim();
  if (!texto && !foto) { $('#texto').focus(); toast('Fale, escreva ou fotografe a ocorrência.'); return; }
  const btn = $('#btnDecupar span'); btn.textContent = 'Lendo…';
  try {
    const d = await post('/api/parse', { texto, foto });
    $('#f-pavimento').value = d.pavimento; $('#f-ambiente').value = d.ambiente; $('#f-detalhe').value = d.detalheLocal; $('#f-equipamento').value = d.equipamento || '';
    $('#f-ocorrencia').value = d.ocorrencia; $('#f-tipo').value = d.tipo; $('#f-causa').value = d.causa; $('#f-prioridade').value = d.prioridade; $('#f-descricao').value = d.descricao;
    parseId = d._id || null;
    const faltam = marcar(d._confianca);
    consultar();
    const msgs = [];
    if (d._foto === 'sem_chave') msgs.push('📷 Foto anexada, mas a leitura automática está desativada (falta configurar a chave OPENAI_API_KEY no servidor).');
    if (d._foto === 'falha') msgs.push('📷 Foto anexada, mas não consegui lê-la agora. Preencha os campos manualmente.');
    if (d._erro) msgs.push(`⚠️ Motivo técnico da falha da IA: <i>${esc(d._erro)}</i>`);
    if (d._foto === 'lida') msgs.push('📷 Foto lida pela IA. Confira os campos sugeridos.');
    if (faltam.length) msgs.push(`A IA não conseguiu identificar: <b>${faltam.join(', ')}</b>. Preencha os campos em vermelho.`);
    $('#aviso').innerHTML = msgs.join('<br>'); $('#aviso').classList.toggle('hidden', !msgs.length);
    $('#proxCodigo').textContent = 'Código ' + (await j('/api/config')).proximoCodigo;
    $('#form').classList.remove('hidden'); $('#form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (e) { toast(esc(e.message)); }
  btn.textContent = 'Leitura pela IA';
}
$('#btnDecupar').onclick = decupar;
$('#form').onsubmit = async (e) => {
  e.preventDefault();
  const faltam = CAMPOS.filter(([id, , req]) => req && !$('#' + id).value);
  if (faltam.length) { faltam.forEach(([id]) => setS(id, 'vazio')); $('#' + faltam[0][0]).focus(); toast('Preencha os campos destacados em vermelho.'); return; }
  try {
    const os = await post('/api/os', { pavimento: $('#f-pavimento').value, ambiente: $('#f-ambiente').value, detalheLocal: $('#f-detalhe').value, equipamento: $('#f-equipamento').value, ocorrencia: $('#f-ocorrencia').value, tipo: $('#f-tipo').value, causa: $('#f-causa').value, prioridade: $('#f-prioridade').value, descricao: $('#f-descricao').value, canal, foto, parseId: parseId });
    toast(`✅ <span><b>${os.codigo}</b> registrada às ${new Date(os.abertura).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} (abertura automática)</span> <a id="tVer">Ver no histórico</a>`);
    $('#tVer').onclick = () => irHistorico({ q: os.codigo });
    $('#consulta').classList.add('hidden'); $('#form').classList.add('hidden'); $('#texto').value = ''; foto = null; parseId = null; $('#fotoChip').classList.add('hidden'); canal = 'texto'; window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) { toast(esc(err.message)); }
};

// ---------- Dashboard ----------
async function loadDash() { dashData = await j('/api/dashboard'); renderDash(); renderHist(); }
function hbars(el, arr, val, fmt, onclick) {
  const max = Math.max(1, ...arr.map(val));
  $(el).innerHTML = `<div class="hbars">${arr.map((x, i) => `<button class="b" data-i="${i}" title="Ver OS no histórico"><span>${esc(x.chave)}</span><div class="t"><i style="width:${val(x) / max * 100}%"></i></div><span>${fmt(val(x))}</span></button>`).join('')}</div>`;
  $(el).querySelectorAll('.b').forEach((b) => b.onclick = () => onclick(arr[b.dataset.i]));
}
function rkHtml(arr, right) { return arr.map((o, i) => `<button class="rk" data-os="${o.codigo}"><span class="n">${i + 1}</span><div><b>${o.codigo}</b> ${badge(o.prioridade)} <span class="st st-${o.status.replace(' ', '')}">${o.status}</span><small>${esc(o.ocorrencia)} · ${local(o)}</small></div><div class="v">${right(o)}</div></button>`).join(''); }
const rightPrio = (o) => `Score ${o.score}<small>${o.diasAberta} d · ${R$(o.custo)}</small>`;
const rightCusto = (o) => R$(o.custo);
const mesAtual = () => new Date().toISOString().slice(0, 7);

function renderDash() {
  const d = dashData, k = d.kpis;
  $('#dashAt').textContent = 'Atualizado às ' + new Date(d.geradoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const kp = [
    [k.totalOS, 'Ordens de serviço', {}, ''],
    [k.abertas, 'Em aberto', { status: 'abertas' }, ''],
    [k.criticasAbertas, 'Alta/crítica em aberto', { status: 'abertas', altaCrit: 1 }, 'alert'],
    [(k.slaPct == null ? '—' : k.slaPct.toLocaleString('pt-BR') + '%'), 'Concluídas dentro do SLA', { status: 'abertas', atraso: 1 }, k.emAtraso ? 'alert' : ''],
    [k.comEquipamentoPct.toLocaleString('pt-BR') + '%', 'OS com equipamento identificado', { comEquip: 1 }, ''],
    [k.recorrentes, 'OS recorrentes (90 dias)', { recorrente: 1 }, k.recorrentes ? 'alert' : ''],
    [R$(k.custoTotal), 'Custo total (Neovero)', { custo: 'com', ordem: 'custo' }, ''],
    [R$(k.custoMedio), 'Custo médio por OS', { custo: 'com', ordem: 'custo' }, ''],
    [R$(k.custoMes), 'Custo no mês corrente', { mes: mesAtual(), ordem: 'custo' }, ''],
    [k.semCusto, 'Custo pendente no Neovero', { custo: 'sem' }, 'alert'],
  ];
  $('#kpis').innerHTML = kp.map(([v, l, , c], i) => `<button class="kpi ${c}" data-k="${i}"><b>${v}</b><span>${l}</span><i>Ver OS →</i></button>`).join('');
  $('#kpis').querySelectorAll('.kpi').forEach((b) => b.onclick = () => irHistorico(kp[b.dataset.k][2]));

  const m = d.mensal.map((x) => ({ ...x, rot: MESES[+x.chave.slice(5) - 1] + '/' + x.chave.slice(2, 4) }));
  const maxM = Math.max(1, ...m.map((x) => x.custo));
  $('#chMes').innerHTML = `<div class="cols-chart">${m.map((x, i) => `<button class="col" data-i="${i}" title="Ver OS de ${x.rot}"><span class="v">${R$k(x.custo)}</span><div class="bar-v" style="height:${Math.max(3, x.custo / maxM * 150)}px"></div><span class="m">${x.rot}</span><span class="q">${x.qtd} OS</span></button>`).join('')}</div>`;
  $('#chMes').querySelectorAll('.col').forEach((b) => b.onclick = () => irHistorico({ mes: m[b.dataset.i].chave }));

  const tot = d.porPrioridade.reduce((s, x) => s + x.qtd, 0); let acc = 0;
  const grad = d.porPrioridade.slice().reverse().map((x) => { const a = acc / tot * 100; acc += x.qtd; return `${COR[x.chave]} ${a}% ${acc / tot * 100}%`; }).join(',');
  $('#chPrio').innerHTML = `<div class="donut-wrap"><div class="donut" data-total="${tot}" style="background:conic-gradient(${grad})"></div><div class="leg">${d.porPrioridade.slice().reverse().map((x) => `<button data-p="${x.chave}"><i style="background:${COR[x.chave]}"></i>${x.chave}<b>${x.qtd}</b></button>`).join('')}</div></div>`;
  $('#chPrio').querySelectorAll('[data-p]').forEach((b) => b.onclick = () => irHistorico({ prio: b.dataset.p }));

  const tc = d.composicao, tt = Math.max(1, tc.maoDeObra + tc.pecas + tc.servicos);
  const partes = [['Mão de obra', tc.maoDeObra, '#2bb99f'], ['Peças (almoxarifado)', tc.pecas, '#168a74'], ['Serviço externo', tc.servicos, '#df632e']];
  $('#chComp').innerHTML = `<div class="comp-bar">${partes.map(([, v, c]) => `<i style="width:${v / tt * 100}%;background:${c}"></i>`).join('')}</div><div class="comp-leg">${partes.map(([n, v, c]) => `<div><i style="background:${c}"></i>${n}<b>${R$(v)} · ${(v / tt * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</b></div>`).join('')}</div><p class="muted" style="margin:10px 0 0">Custo da OS = horas × custo-hora do cargo + peças vinculadas + serviço externo.</p>`;
  hbars('#chArea', d.porArea, (x) => x.custo, R$, (x) => irHistorico({ area: x.chave, ordem: 'custo' }));
  $('#tbEquip').innerHTML = `<tr><th>Equipamento</th><th class="r">OS</th><th class="r">Recorrências</th><th class="r">Custo</th><th class="r">Custo médio</th></tr>` + d.porEquipamento.slice(0, 10).map((e) => `<tr data-eq="${esc(e.chave)}"><td><b>${esc(e.chave)}</b></td><td class="r">${e.qtd}</td><td class="r ${e.recorrentes ? 'rec-n' : ''}">${e.recorrentes}</td><td class="r">${R$(e.custo)}</td><td class="r">${R$(e.custo / e.qtd)}</td></tr>`).join('');
  $('#tbEquip').querySelectorAll('tr[data-eq]').forEach((tr) => tr.onclick = () => irHistorico({ equipamento: tr.dataset.eq, ordem: 'custo' }));
  hbars('#chTipo', d.porTipo, (x) => x.custo, R$, (x) => irHistorico({ tipo: x.chave, ordem: 'custo' }));
  hbars('#chAmb', d.porAmbiente.slice(0, 8), (x) => x.custo, R$, (x) => irHistorico({ ambiente: x.chave, ordem: 'custo' }));

  $('#rkPrio').innerHTML = rkHtml(d.rankingPrioridade.slice(0, 5), rightPrio);
  $('#rkCusto').innerHTML = rkHtml(d.rankingCusto.slice(0, 5), rightCusto);
  $('#vtPrio').textContent = `Ver lista completa (${d.rankingPrioridade.length})`;
  $('#vtCusto').textContent = `Ver lista completa (${d.rankingCusto.length})`;
}
function abrirLista(titulo, arr, right) { $('#listTitulo').textContent = titulo; $('#listBody').innerHTML = rkHtml(arr, right); $('#dlgList').showModal(); }
$('#vtPrio').onclick = () => abrirLista('Fila de prioridade · OS em aberto', dashData.rankingPrioridade, rightPrio);
$('#vtCusto').onclick = () => abrirLista('Maiores custos por OS', dashData.rankingCusto, rightCusto);
$('#listClose').onclick = () => $('#dlgList').close();
document.addEventListener('click', (e) => { const r = e.target.closest('[data-os],tr[data-os]'); if (r) abrirOS(r.dataset.os); });

// ---------- Histórico ----------
const ROT = { tipo: (v) => v, ambiente: (v) => v, equipamento: (v) => 'Equipamento: ' + v, area: (v) => v, comEquip: () => 'Com equipamento identificado', recorrente: () => 'Recorrentes (90 dias)', atraso: () => 'Em atraso (SLA)', mes: (v) => 'Mês ' + MESES[+v.slice(5) - 1] + '/' + v.slice(0, 4), altaCrit: () => 'Prioridade alta/crítica', custo: (v) => v === 'sem' ? 'Custo pendente' : 'Com custo no Neovero' };
function renderHist() {
  if (!dashData) return;
  $('#busca').value = hf.q || ''; $('#fStatus').value = hf.status || ''; $('#fPrio').value = hf.prio || ''; $('#fOrdem').value = hf.ordem || 'data';
  const q = (hf.q || '').toLowerCase();
  let l = dashData.historico.filter((o) => (!hf.status || (hf.status === 'abertas' ? o.status !== 'Concluída' : o.status === hf.status)) && (!hf.prio || o.prioridade === hf.prio) && (!hf.altaCrit || PESO[o.prioridade] >= 2)
    && (!hf.tipo || o.tipo === hf.tipo) && (!hf.ambiente || o.ambiente === hf.ambiente) && (!hf.equipamento || o.equipamento === hf.equipamento) && (!hf.area || o.area === hf.area) && (!hf.comEquip || o.equipamento) && (!hf.recorrente || o.recorrente) && (!hf.atraso || (Date.now() - new Date(o.abertura)) / 3600000 > dashData.slaHoras[o.prioridade]) && (!hf.mes || o.abertura.startsWith(hf.mes)) && (!hf.custo || (hf.custo === 'sem' ? o.custo == null : o.custo != null))
    && (!q || (o.codigo + ' ' + o.ocorrencia + ' ' + o.ambiente + ' ' + o.pavimento + ' ' + o.tipo + ' ' + o.detalheLocal + ' ' + (o.equipamento || '')).toLowerCase().includes(q)));
  if (hf.ordem === 'custo') l = [...l].sort((a, b) => (b.custo ?? -1) - (a.custo ?? -1));
  else if (hf.ordem === 'prio') l = [...l].sort((a, b) => PESO[b.prioridade] - PESO[a.prioridade] || b.abertura.localeCompare(a.abertura));
  $('#chips').innerHTML = Object.keys(ROT).filter((k) => hf[k]).map((k) => `<span class="chip">${esc(ROT[k](hf[k]))}<button data-x="${k}" aria-label="Remover filtro">×</button></span>`).join('');
  $('#chips').querySelectorAll('[data-x]').forEach((b) => b.onclick = () => { delete hf[b.dataset.x]; renderHist(); });
  const soma = l.reduce((s, o) => s + (o.custo || 0), 0);
  $('#histResumo').textContent = `${l.length} OS · custo somado ${R$(soma)}`;
  $('#tbl tbody').innerHTML = l.map((o) => `<tr data-os="${o.codigo}"><td><b>${o.codigo}</b></td><td>${dt(o.abertura)}</td><td>${local(o)}</td><td>${esc(o.ocorrencia)}<br><small class="muted">${esc(o.tipo)}${o.equipamento ? ' · ' + esc(o.equipamento) : ''}</small></td><td>${badge(o.prioridade)}</td><td class="st st-${o.status.replace(' ', '')}">${o.status}</td><td class="r">${o.custo == null ? '<span class="muted">pendente</span>' : R$(o.custo)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nenhuma OS encontrada com esses filtros.</td></tr>';
}
$('#busca').oninput = () => { hf.q = $('#busca').value; renderHist(); $('#busca').focus(); };
$('#fStatus').onchange = () => { hf.status = $('#fStatus').value; renderHist(); };
$('#fPrio').onchange = () => { hf.prio = $('#fPrio').value; renderHist(); };
$('#fOrdem').onchange = () => { hf.ordem = $('#fOrdem').value; renderHist(); };

// ---------- Detalhe da OS ----------
async function abrirOS(codigo) {
  const o = await j('/api/os/' + codigo), c = o.custoDet;
  const tb = (rows, h) => `<table><tr>${h.map((x) => `<th>${x}</th>`).join('')}</tr>${rows}</table>`;
  $('#dlgBody').innerHTML = `<h3>${o.codigo} ${badge(o.prioridade)} <span class="st st-${o.status.replace(' ', '')}" style="font-size:14px">${o.status}</span></h3><p class="muted">${local(o)} · ${esc(o.area || 'Manutenção predial')}</p>
    <p class="muted" style="margin-top:-8px">Abertura ${dth(o.abertura)} <small>(automática)</small>${o.fechamento ? ` · Fechamento ${dth(o.fechamento)} <small>(automático)</small> · ${slaTxt(o)}` : ` · SLA de ${cfg.slaHoras[o.prioridade]} h`}</p>
    <p><b>${esc(o.ocorrencia)}</b> (${esc(o.tipo)})${o.equipamento ? `<br>Equipamento: <b>${esc(o.equipamento)}</b>` : ''}<br>Causa provável: ${esc(o.causa)}<br><i>${esc(o.descricao)}</i></p>${o.foto ? `<img src="/uploads/${o.foto}" alt="Foto da OS" style="max-width:100%;border-radius:12px">` : ''}
    ${c ? `<h4>Custos (Neovero)</h4>${tb(c.maoDeObra.map((m) => `<tr><td>${esc(m.tecnico)}</td><td>${m.horas} h × ${R$(m.valorHora)}</td><td class="r">${R$(m.total)}</td></tr>`).join(''), ['Mão de obra', 'Horas', 'Total'])}
      ${tb(c.pecas.map((m) => `<tr><td>${esc(m.item)} <small class="muted">${esc(m.codigo || '')}</small></td><td>${m.qtd} ${esc(m.unidade)} × ${R$(m.valorUnit)}</td><td class="r">${R$(m.total)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Nenhuma peça vinculada.</td></tr>', ['Peças (almoxarifado)', 'Qtd', 'Total'])}
      ${c.servicos.length ? tb(c.servicos.map((m) => `<tr><td>${esc(m.fornecedor)}<br><small class="muted">${esc(m.descricao)}</small></td><td></td><td class="r">${R$(m.total)}</td></tr>`).join(''), ['Serviço externo', '', 'Total']) : ''}
      <p class="tot">Mão de obra ${R$(c.totalMaoDeObra)} + peças ${R$(c.totalPecas)} + serviço externo ${R$(c.totalServicos)} = <b>${R$(c.total)}</b></p>` : `<div class="warn">Custo pendente: ainda não há lançamento desta OS no Neovero.<br><br><button class="btn" id="simNv">Simular lançamento no Neovero</button> <small class="muted">(demonstração)</small></div>`}
    <p class="muted" style="margin-bottom:6px">Atualizar status:</p><div class="row" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">${['Aberta', 'Em andamento', 'Concluída'].map((s) => `<button class="btn ghost sm" data-st="${s}" ${s === o.status ? 'disabled' : ''}>${s}</button>`).join('')}</div>`;
  const dlg = $('#dlg'); if (!dlg.open) dlg.showModal();
  const sim = $('#simNv'); if (sim) sim.onclick = async () => { sim.textContent = 'Lançando…'; await post('/api/neovero/simular-lancamento/' + codigo); await loadDash(); abrirOS(codigo); };
  document.querySelectorAll('[data-st]').forEach((b) => b.onclick = async () => {
    try {
      await post(`/api/os/${codigo}/status`, { status: b.dataset.st });
      $('#dlg').close(); $('#dlgList').close();
      await loadDash();
      toast(`✅ <span><b>${codigo}</b> agora está <b>${esc(b.dataset.st)}</b></span>`);
    } catch (e) { toast(esc(e.message)); }
  });
}
$('#dlgClose').onclick = () => $('#dlg').close();

// ---------- Gestão da IA ----------
const fmtN = (n) => (n || 0).toLocaleString('pt-BR');
const bytes = (b) => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : b < 1073741824 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1073741824).toFixed(2) + ' GB';
const usd = (v, d = 2) => 'US$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const seg = (ms) => ms ? (ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' s' : '—';
const pc = (v) => v == null ? '—' : v.toLocaleString('pt-BR') + '%';
const ROT_CAMPO = { ocorrencia: 'Ocorrência', equipamento: 'Equipamento', ambiente: 'Ambiente', pavimento: 'Pavimento', prioridade: 'Prioridade' };
const ROT_RES = { ok: 'Sucesso', erro: 'Erro (usou regras)', recusa: 'Recusa da IA', regras: 'Só regras (sem chave)' };
const COR_RES = { ok: '#2bb99f', erro: '#df632e', recusa: '#c0392b', regras: '#8a9ba0' };

function pilhas(el, dias, a, b, fmt) {
  const max = Math.max(1, ...dias.map((d) => a(d) + b(d)));
  $(el).innerHTML = `<div class="stk-chart">${dias.map((d) => `<div class="stk" title="${d.dia.split('-').reverse().slice(0, 2).join('/')}: ${fmt(a(d))} + ${fmt(b(d))}"><i class="${el === '#iaDia' ? 'b' : 'c'}" style="height:${b(d) / max * 100}%"></i><i class="a" style="height:${a(d) / max * 100}%"></i></div>`).join('')}</div>
    <div class="stk-lab">${dias.map((d, i) => `<span>${i % Math.ceil(dias.length / 6) === 0 ? d.dia.split('-').reverse().slice(0, 2).join('/') : ''}</span>`).join('')}</div>`;
}
async function loadIA() {
  const q = `?dias=${$('#iaDias').value}&origem=${$('#iaOrigem').value}`;
  const d = await j('/api/ia' + q), k = d.kpis;
  $('#iaAt').textContent = 'Atualizado às ' + new Date(d.geradoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' · ' + d.config.provedor + ' · ' + d.config.modelo;
  $('#iaAlertas').innerHTML = d.alertas.map((x) => `<div class="alerta ${x.nivel}"><b>${{ alto: '⚠️ Atenção', medio: '⚠️ Verificar', baixo: 'ℹ️ Nota', info: 'ℹ️ Info' }[x.nivel]}</b><span>${esc(x.msg)}</span></div>`).join('');
  const kp = [
    [fmtN(k.chamadas), 'Chamadas à IA', k.regrasApenas ? `${k.regrasApenas} só com regras` : 'no período'],
    [pc(k.sucesso), 'Taxa de sucesso', 'chamadas que a IA respondeu'],
    [seg(k.latMedia), 'Latência média', 'p95: ' + seg(k.latP95)],
    [fmtN(k.tokensTotal), 'Tokens consumidos', `${fmtN(k.tokensEntrada)} entrada · ${fmtN(k.tokensSaida)} saída`],
    [usd(k.custoUSD), 'Custo estimado da IA', 'por OS: ' + usd(k.custoPorChamadaUSD, 4)],
    [pc(k.semCorrecao), 'OS aceitas sem correção', k.corrigidosPorOS == null ? 'sem OS confirmadas' : `${String(k.corrigidosPorOS).replace('.', ',')} campos corrigidos por OS`],
    [pc(k.pctComFoto), 'Chamadas com foto', `~${fmtN(k.mediaTokensPorChamada)} tokens por chamada`],
    [bytes(d.armazenamento.totalBytes), 'Armazenamento em uso', `${d.armazenamento.fotos} foto(s) salva(s)`],
  ];
  $('#iaKpis').innerHTML = kp.map(([v, l, s]) => `<div class="kpi static"><b>${v}</b><span>${l}</span><small>${esc(s)}</small></div>`).join('');

  pilhas('#iaDia', d.porDia, (x) => x.chamadas - x.erros, (x) => x.erros, fmtN);
  $('#iaDia').insertAdjacentHTML('beforeend', '<div class="legenda"><span><i style="background:var(--teal)"></i>Sucesso</span><span><i style="background:var(--orange)"></i>Erro / recusa</span></div>');
  pilhas('#iaTokens', d.porDia, (x) => x.tin, (x) => x.tout, fmtN);
  $('#iaTokens').insertAdjacentHTML('beforeend', '<div class="legenda"><span><i style="background:var(--teal)"></i>Entrada (prompt + imagem)</span><span><i style="background:var(--teal-xd)"></i>Saída (resposta)</span></div>');

  $('#iaCampos').innerHTML = `<div class="dual"><span></span><span class="h">Preenchido pela IA</span><span class="h">Aceito sem alteração</span></div>` + d.campos.map((c) =>
    `<div class="dual"><b>${ROT_CAMPO[c.campo]}</b><div><div class="mini"><i style="width:${c.cobertura || 0}%"></i></div><div class="mini-v">${pc(c.cobertura)}</div></div><div><div class="mini"><i class="${c.aceite != null && c.aceite < 70 ? 'w' : ''}" style="width:${c.aceite || 0}%"></i></div><div class="mini-v">${pc(c.aceite)}</div></div></div>`).join('')
    + `<p class="muted" style="margin:10px 0 0">Base: ${fmtN(k.revisadas)} OS com sugestão da IA já confirmadas pelo operador.</p>`;

  const totR = d.resultados.reduce((s, x) => s + x.qtd, 0); let acc = 0;
  const grad = totR ? d.resultados.filter((x) => x.qtd).map((x) => { const a0 = acc / totR * 100; acc += x.qtd; return `${COR_RES[x.chave]} ${a0}% ${acc / totR * 100}%`; }).join(',') : '#e1eaea 0 100%';
  $('#iaResultado').innerHTML = `<div class="donut-wrap"><div class="donut" data-total="${fmtN(totR)}" style="background:conic-gradient(${grad})"></div><div class="leg">${d.resultados.map((x) => `<button style="cursor:default"><i style="background:${COR_RES[x.chave]}"></i>${ROT_RES[x.chave]}<b>${fmtN(x.qtd)}</b></button>`).join('')}</div></div>`;

  $('#iaCanais').innerHTML = `<tr><th>Canal</th><th class="r">Chamadas</th><th class="r">Sucesso</th><th class="r">Latência média</th><th class="r">p95</th><th class="r">Tokens/chamada</th><th class="r">Custo médio</th></tr>` + d.canais.map((c) => `<tr><td><b>${{ texto: 'Texto / voz', foto: 'Só foto', 'texto+foto': 'Texto + foto' }[c.canal]}</b></td><td class="r">${fmtN(c.chamadas)}</td><td class="r">${pc(c.sucesso)}</td><td class="r">${seg(c.latMedia)}</td><td class="r">${seg(c.latP95)}</td><td class="r">${fmtN(c.tokensMedios)}</td><td class="r">${usd(c.custoMedio, 4)}</td></tr>`).join('');
  $('#iaModelos').innerHTML = `<tr><th>Modelo</th><th class="r">Chamadas</th><th class="r">Tokens</th><th class="r">Custo</th></tr>` + (d.modelos.map((m) => `<tr><td><b>${esc(m.modelo)}</b>${m.modelo !== d.config.modelo ? ' <span class="tag">reserva</span>' : ' <span class="tag">principal</span>'}</td><td class="r">${fmtN(m.chamadas)}</td><td class="r">${fmtN(m.tokens)}</td><td class="r">${usd(m.custo)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sem chamadas bem-sucedidas no período.</td></tr>');
  $('#iaErros').innerHTML = d.errosAgrup.length ? `<div class="sec-h">Principais erros</div>` + d.errosAgrup.map((e) => `<div class="muted" style="display:flex;justify-content:space-between;gap:10px;padding:3px 0"><span>${esc(e.erro)}</span><b class="er-b">${e.qtd}×</b></div>`).join('') : '';

  const maxA = Math.max(1, ...d.armazenamento.itens.map((i) => i.bytes)), pj = d.projecao;
  $('#iaArm').innerHTML = `<div class="hbars">${d.armazenamento.itens.map((i) => `<div class="b" style="cursor:default"><span title="${esc(i.detalhe)}">${esc(i.nome)}</span><div class="t"><i style="width:${Math.max(2, i.bytes / maxA * 100)}%"></i></div><span>${bytes(i.bytes)}</span></div>`).join('')}</div>
    <p class="muted" style="margin:8px 0 0">Total em disco: <b>${bytes(d.armazenamento.totalBytes)}</b>. No plano gratuito do Render o disco é temporário: os arquivos voltam ao estado inicial a cada reinício.</p>
    <div class="sec-h">Projeção para ~${pj.osPorDia} OS/dia (um hospital)</div>
    <dl class="kv"><dt>Foto média (${pj.pctFoto}% das chamadas)</dt><dd>${pj.fotoMedKB} KB</dd><dt>Fotos por mês</dt><dd>~${fmtN(pj.fotosMesMB)} MB</dd><dt>Fotos por ano</dt><dd>~${String(pj.fotosAnoGB).replace('.', ',')} GB</dd><dt>Tokens por mês</dt><dd>~${fmtN(pj.tokensMes)}</dd><dt>Custo de sustentação da IA por mês</dt><dd>~${usd(pj.custoMesUSD)}</dd></dl>`;

  const cf = d.config;
  $('#iaCfg').innerHTML = `<dl class="kv"><dt>Provedor</dt><dd>${esc(cf.provedor)}</dd><dt>Modelo principal</dt><dd>${esc(cf.modelo)}</dd><dt>Modelos de reserva</dt><dd>${cf.reserva.map(esc).join(', ')}</dd>
    <dt>Chave da API</dt><dd class="${cf.chaveConfigurada ? 'ok-b' : 'er-b'}">${cf.chaveConfigurada ? 'configurada (' + esc(cf.chaveVariavel) + ')' : 'não configurada'}</dd><dt>Versão do prompt</dt><dd><code>${esc(cf.promptVersao)}</code></dd>
    <dt>Preço usado na estimativa</dt><dd>US$ ${cf.preco.entradaPorM} entrada · US$ ${cf.preco.saidaPorM} saída / 1M tokens</dd></dl>
    <p class="muted" style="margin:10px 0 0">Os valores em dólar são <b>estimativas</b> com o preço acima. Ajuste conforme o modelo no Render: <code>OPENAI_PRICE_IN_PER_M</code> e <code>OPENAI_PRICE_OUT_PER_M</code>. A versão do prompt muda sempre que o texto-base é alterado.</p>`;

  $('#iaUltimas').innerHTML = `<tr><th>Quando</th><th>Canal</th><th>Resultado</th><th>Modelo</th><th class="r">Tokens</th><th class="r">Latência</th><th class="r">Custo</th><th>OS / erro</th></tr>` + d.ultimas.map((u) => `<tr><td>${new Date(u.ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${u.demo ? ' <span class="tag demo">demo</span>' : ''}</td><td>${u.canal}</td><td class="${u.resultado === 'ok' ? 'ok-b' : 'er-b'}">${ROT_RES[u.resultado]}</td><td>${esc(u.modelo || '—')}</td><td class="r">${fmtN(u.tokens)}</td><td class="r">${seg(u.latencia_ms)}</td><td class="r">${usd(u.custo_usd, 4)}</td><td class="muted" style="white-space:normal;max-width:260px">${u.os ? esc(u.os) : esc(u.erro || '')}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Nenhuma chamada no período.</td></tr>';
}
$('#iaDias').onchange = loadIA; $('#iaOrigem').onchange = loadIA;
init();
