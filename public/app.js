'use strict';
const $ = (s) => document.querySelector(s);
const R$ = (v) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const R$k = (v) => v >= 1000 ? 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil' : R$(v);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dt = (iso) => new Date(iso).toLocaleDateString('pt-BR');
const local = (o) => esc([o.pavimento, o.ambiente, o.detalheLocal].filter(Boolean).join(' · '));
const badge = (p) => `<span class="badge b-${p}">${p}</span>`;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const COR = { Crítica: '#c0392b', Alta: '#df632e', Média: '#3f86a8', Baixa: '#8a9ba0' };
const PESO = { Crítica: 3, Alta: 2, Média: 1, Baixa: 0 };
let cfg, dashData, foto = null, canal = 'texto';
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
  if (nome !== 'registrar') loadDash();
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

async function decupar() {
  const texto = $('#texto').value.trim();
  if (!texto && !foto) { $('#texto').focus(); toast('Fale, escreva ou fotografe a ocorrência.'); return; }
  const btn = $('#btnDecupar span'); btn.textContent = 'Preenchendo…';
  try {
    const d = await post('/api/parse', { texto, foto });
    $('#f-pavimento').value = d.pavimento; $('#f-ambiente').value = d.ambiente; $('#f-detalhe').value = d.detalheLocal; $('#f-equipamento').value = d.equipamento || '';
    $('#f-ocorrencia').value = d.ocorrencia; $('#f-tipo').value = d.tipo; $('#f-causa').value = d.causa; $('#f-prioridade').value = d.prioridade; $('#f-descricao').value = d.descricao;
    const faltam = marcar(d._confianca);
    const msgs = [];
    if (d._foto === 'sem_chave') msgs.push('📷 Foto anexada, mas a leitura automática está desativada (falta configurar a chave ANTHROPIC_API_KEY no servidor).');
    if (d._foto === 'falha') msgs.push('📷 Foto anexada, mas não consegui lê-la agora. Preencha os campos manualmente.');
    if (d._foto === 'lida') msgs.push('📷 Foto lida pela IA. Confira os campos sugeridos.');
    if (faltam.length) msgs.push(`A IA não conseguiu identificar: <b>${faltam.join(', ')}</b>. Preencha os campos em vermelho.`);
    $('#aviso').innerHTML = msgs.join('<br>'); $('#aviso').classList.toggle('hidden', !msgs.length);
    $('#proxCodigo').textContent = 'Código ' + (await j('/api/config')).proximoCodigo;
    $('#form').classList.remove('hidden'); $('#form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (e) { toast(esc(e.message)); }
  btn.textContent = 'Preencher com a IA';
}
$('#btnDecupar').onclick = decupar;
$('#form').onsubmit = async (e) => {
  e.preventDefault();
  const faltam = CAMPOS.filter(([id, , req]) => req && !$('#' + id).value);
  if (faltam.length) { faltam.forEach(([id]) => setS(id, 'vazio')); $('#' + faltam[0][0]).focus(); toast('Preencha os campos destacados em vermelho.'); return; }
  try {
    const os = await post('/api/os', { pavimento: $('#f-pavimento').value, ambiente: $('#f-ambiente').value, detalheLocal: $('#f-detalhe').value, equipamento: $('#f-equipamento').value, ocorrencia: $('#f-ocorrencia').value, tipo: $('#f-tipo').value, causa: $('#f-causa').value, prioridade: $('#f-prioridade').value, descricao: $('#f-descricao').value, canal, foto });
    toast(`✅ <span><b>${os.codigo}</b> registrada</span> <a id="tVer">Ver no histórico</a>`);
    $('#tVer').onclick = () => irHistorico({ q: os.codigo });
    $('#form').classList.add('hidden'); $('#texto').value = ''; foto = null; $('#fotoChip').classList.add('hidden'); canal = 'texto'; window.scrollTo({ top: 0, behavior: 'smooth' });
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
const ROT = { tipo: (v) => v, ambiente: (v) => v, mes: (v) => 'Mês ' + MESES[+v.slice(5) - 1] + '/' + v.slice(0, 4), altaCrit: () => 'Prioridade alta/crítica', custo: (v) => v === 'sem' ? 'Custo pendente' : 'Com custo no Neovero' };
function renderHist() {
  if (!dashData) return;
  $('#busca').value = hf.q || ''; $('#fStatus').value = hf.status || ''; $('#fPrio').value = hf.prio || ''; $('#fOrdem').value = hf.ordem || 'data';
  const q = (hf.q || '').toLowerCase();
  let l = dashData.historico.filter((o) => (!hf.status || (hf.status === 'abertas' ? o.status !== 'Concluída' : o.status === hf.status)) && (!hf.prio || o.prioridade === hf.prio) && (!hf.altaCrit || PESO[o.prioridade] >= 2)
    && (!hf.tipo || o.tipo === hf.tipo) && (!hf.ambiente || o.ambiente === hf.ambiente) && (!hf.mes || o.abertura.startsWith(hf.mes)) && (!hf.custo || (hf.custo === 'sem' ? o.custo == null : o.custo != null))
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
  $('#dlgBody').innerHTML = `<h3>${o.codigo} ${badge(o.prioridade)} <span class="st st-${o.status.replace(' ', '')}" style="font-size:14px">${o.status}</span></h3><p class="muted">${local(o)} · aberta em ${dt(o.abertura)}</p>
    <p><b>${esc(o.ocorrencia)}</b> (${esc(o.tipo)})${o.equipamento ? `<br>Equipamento: <b>${esc(o.equipamento)}</b>` : ''}<br>Causa provável: ${esc(o.causa)}<br><i>${esc(o.descricao)}</i></p>${o.foto ? `<img src="/uploads/${o.foto}" alt="Foto da OS" style="max-width:100%;border-radius:12px">` : ''}
    ${c ? `<h4>Custos (Neovero)</h4>${tb(c.maoDeObra.map((m) => `<tr><td>${esc(m.tecnico)}</td><td>${m.horas} h × ${R$(m.valorHora)}</td><td class="r">${R$(m.total)}</td></tr>`).join(''), ['Mão de obra', 'Horas', 'Total'])}
      ${tb(c.insumos.map((m) => `<tr><td>${esc(m.item)}</td><td>${m.qtd} ${esc(m.unidade)} × ${R$(m.valorUnit)}</td><td class="r">${R$(m.total)}</td></tr>`).join(''), ['Insumos', 'Qtd', 'Total'])}
      <p class="tot">Total: ${R$(c.total)}</p>` : `<div class="warn">Custo pendente: ainda não há lançamento desta OS no Neovero.<br><br><button class="btn" id="simNv">Simular lançamento no Neovero</button> <small class="muted">(demonstração)</small></div>`}
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
init();
