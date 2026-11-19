'use strict';
const $ = (s) => document.querySelector(s);
const R$ = (v) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dt = (iso) => new Date(iso).toLocaleDateString('pt-BR');
const local = (o) => esc([o.pavimento, o.ambiente, o.detalheLocal].filter(Boolean).join(' · '));
const badge = (p) => `<span class="badge b-${p}">${p}</span>`;
let cfg, dashData, foto = null, canal = 'texto';

async function j(url, opt) { const r = await fetch(url, opt); const d = await r.json(); if (!r.ok) throw new Error(d.erro || 'Erro'); return d; }
const post = (url, body) => j(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

// ---------- Abas ----------
document.querySelectorAll('nav button').forEach((b) => b.onclick = () => {
  document.querySelectorAll('nav button,.tab').forEach((e) => e.classList.remove('on'));
  b.classList.add('on'); $('#tab-' + b.dataset.tab).classList.add('on');
  if (b.dataset.tab !== 'registrar') loadDash();
});

// ---------- Registro ----------
const fill = (sel, arr, v) => { sel.innerHTML = arr.map((x) => `<option>${esc(x)}</option>`).join(''); if (v != null) sel.value = v; };
async function init() {
  cfg = await j('/api/config');
  $('#hospital').textContent = cfg.hospital;
  $('#proxCodigo').textContent = cfg.proximoCodigo;
  fill($('#f-pavimento'), ['', ...cfg.pavimentos.filter((p) => p !== 'Geral')]);
  fill($('#f-ambiente'), ['', ...cfg.ambientes.map((a) => a.nome)]);
  fill($('#f-ocorrencia'), [...cfg.ocorrencias.map((o) => o.ocorrencia), 'Outra ocorrência']);
  fill($('#f-prioridade'), cfg.prioridades);
  $('#fPrio').insertAdjacentHTML('beforeend', cfg.prioridades.map((x) => `<option>${x}</option>`).join(''));
}
$('#f-ocorrencia').onchange = () => { const o = cfg.ocorrencias.find((x) => x.ocorrencia === $('#f-ocorrencia').value); if (o) { $('#f-tipo').value = o.tipo; $('#f-causa').value = o.causa; $('#f-prioridade').value = o.prioridade; } };
$('#f-ambiente').onchange = () => { const a = cfg.ambientes.find((x) => x.nome === $('#f-ambiente').value); if (a && a.pavimento !== 'Geral') $('#f-pavimento').value = a.pavimento; };
document.querySelectorAll('[data-ex]').forEach((a) => a.onclick = (e) => { e.preventDefault(); $('#texto').value = a.dataset.ex; });

// Voz: Web Speech API (Chrome/Edge/Safari). Sem suporte -> digitação.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, gravando = false;
if (!SR) { $('#micHint').textContent = 'Seu navegador não suporta voz: digite a ocorrência.'; $('#mic').disabled = true; $('#mic').style.opacity = .4; }
$('#mic').onclick = () => {
  if (gravando) return rec.stop();
  rec = new SR(); rec.lang = 'pt-BR'; rec.interimResults = true; rec.continuous = true;
  const base = $('#texto').value ? $('#texto').value.trim() + ' ' : '';
  rec.onresult = (e) => { let t = ''; for (const r of e.results) t += r[0].transcript; $('#texto').value = base + t; };
  rec.onstart = () => { gravando = true; canal = 'voz'; $('#mic').classList.add('rec'); $('#micStatus').textContent = 'Gravando… toque para parar'; };
  rec.onend = () => { gravando = false; $('#mic').classList.remove('rec'); $('#micStatus').textContent = 'Toque para falar'; if ($('#texto').value.trim()) decupar(); };
  rec.onerror = (e) => { $('#micHint').textContent = e.error === 'not-allowed' ? 'Permita o microfone no navegador.' : 'Erro de voz: ' + e.error; };
  rec.start();
};
$('#foto').onchange = (e) => { const f = e.target.files[0]; if (!f) return; $('#fotoNome').textContent = f.name; if (canal !== 'voz') canal = 'foto';
  const img = new Image(), fr = new FileReader();
  fr.onload = () => { img.onload = () => { const s = Math.min(1, 1000 / img.width), c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); foto = c.toDataURL('image/jpeg', .75); }; img.src = fr.result; };
  fr.readAsDataURL(f); };

async function decupar() {
  const texto = $('#texto').value.trim(); if (!texto) return;
  $('#btnDecupar').textContent = 'Decupando…';
  try {
    const d = await post('/api/parse', { texto });
    $('#f-pavimento').value = d.pavimento; $('#f-ambiente').value = d.ambiente; $('#f-detalhe').value = d.detalheLocal;
    $('#f-ocorrencia').value = d.ocorrencia; $('#f-tipo').value = d.tipo; $('#f-causa').value = d.causa; $('#f-prioridade').value = d.prioridade; $('#f-descricao').value = d.descricao;
    const c = d._confianca; const marca = { local: c.local, ocorrencia: c.ocorrencia, prioridade: c.prioridade, causa: c.causa };
    document.querySelectorAll('#form [data-c]').forEach((l) => l.dataset.c = marca[l.dataset.c] === 'ia' && !(l.dataset.c === 'local' && !$('#f-pavimento').value && l.textContent.includes('Pavimento')) ? 'ia' : 'revisar');
    $('#form').classList.remove('hidden'); $('#ok').classList.add('hidden');
  } catch (e) { alert(e.message); }
  $('#btnDecupar').textContent = 'Decupar com a IA';
}
$('#btnDecupar').onclick = decupar;
$('#form').onsubmit = async (e) => {
  e.preventDefault();
  try {
    const os = await post('/api/os', { pavimento: $('#f-pavimento').value, ambiente: $('#f-ambiente').value, detalheLocal: $('#f-detalhe').value, ocorrencia: $('#f-ocorrencia').value, tipo: $('#f-tipo').value, causa: $('#f-causa').value, prioridade: $('#f-prioridade').value, descricao: $('#f-descricao').value, canal, foto });
    $('#ok').innerHTML = `✅ <b>${os.codigo}</b> registrada (${badge(os.prioridade)}).<br><small>Custos aparecem quando forem lançados no Neovero. Para demonstrar, abra a OS no Histórico e use “Simular lançamento no Neovero”.</small>`;
    $('#ok').classList.remove('hidden'); $('#form').classList.add('hidden'); $('#texto').value = ''; $('#fotoNome').textContent = ''; foto = null; canal = 'texto'; $('#foto').value = '';
    cfg.proximoCodigo = (await j('/api/config')).proximoCodigo; $('#proxCodigo').textContent = cfg.proximoCodigo;
  } catch (e) { alert(e.message); }
};

// ---------- Dashboard ----------
async function loadDash() { dashData = await j('/api/dashboard'); renderDash(); renderHist(); }
const bars = (el, arr, val, fmt, color) => { const max = Math.max(1, ...arr.map(val)); $(el).innerHTML = `<div class="bars">${arr.map((x) => `<div class="b"><span title="${esc(x.chave)}">${esc(x.rot || x.chave)}</span><div class="t"><i style="width:${val(x) / max * 100}%;${color ? 'background:' + color(x) : ''}"></i></div><span>${fmt(val(x))}</span></div>`).join('')}</div>`; };
const COR = { Crítica: '#c0392b', Alta: '#d9822b', Média: '#4f86b0', Baixa: '#8a99a6' };
function rk(arr, right) { return arr.map((o, i) => `<div class="rk" data-os="${o.codigo}"><span class="n">${i + 1}</span><div><b>${o.codigo}</b> ${badge(o.prioridade)} <span class="st st-${o.status.replace(' ', '')}">${o.status}</span><small>${esc(o.ocorrencia)} · ${local(o)}</small></div><div class="v">${right(o)}</div></div>`).join(''); }
function renderDash() {
  const d = dashData, k = d.kpis;
  $('#dashAt').textContent = 'Atualizado ' + new Date(d.geradoEm).toLocaleTimeString('pt-BR');
  $('#kpis').innerHTML = [[k.totalOS, 'ordens de serviço'], [k.abertas, 'em aberto'], [k.criticasAbertas, 'abertas · alta/crítica'], [R$(k.custoTotal), 'custo total (Neovero)'], [R$(k.custoMedio), 'custo médio por OS'], [R$(k.custoMes), 'custo do mês corrente'], [k.semCusto, 'OS aguardando custo']].map(([v, l]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`).join('');
  $('#rkPrio').innerHTML = rk(d.rankingPrioridade, (o) => `<span title="urgência + tempo parado + custo">score ${o.score}</span><small>${o.diasAberta} d aberta · ${R$(o.custo)}</small>`);
  $('#rkCaras').innerHTML = rk(d.rankingCaras, (o) => R$(o.custo));
  bars('#chMes', d.mensal.map((m) => ({ ...m, rot: m.chave.slice(5) + '/' + m.chave.slice(2, 4) + ` (${m.qtd})` })), (x) => x.custo, R$);
  bars('#chTipo', d.porTipo, (x) => x.custo, R$);
  bars('#chAmb', d.porAmbiente.slice(0, 8), (x) => x.custo, R$);
  bars('#chPrio', d.porPrioridade, (x) => x.qtd, (v) => v, (x) => COR[x.chave]);
}
document.addEventListener('click', (e) => { const r = e.target.closest('[data-os]'); if (r) abrirOS(r.dataset.os); });

// ---------- Histórico ----------
function renderHist() {
  if (!dashData) return;
  const q = $('#busca').value.toLowerCase(), st = $('#fStatus').value, pr = $('#fPrio').value;
  let l = dashData.historico.filter((o) => (!st || o.status === st) && (!pr || o.prioridade === pr) && (!q || (o.codigo + ' ' + o.ocorrencia + ' ' + o.ambiente + ' ' + o.pavimento + ' ' + o.tipo + ' ' + o.detalheLocal).toLowerCase().includes(q)));
  if ($('#fOrdem').value === 'custo') l = [...l].sort((a, b) => (b.custo || 0) - (a.custo || 0));
  $('#tbl tbody').innerHTML = l.map((o) => `<tr data-os="${o.codigo}"><td><b>${o.codigo}</b></td><td>${dt(o.abertura)}</td><td>${local(o)}</td><td>${esc(o.ocorrencia)}<br><small class="muted">${esc(o.tipo)}</small></td><td>${badge(o.prioridade)}</td><td class="st st-${o.status.replace(' ', '')}">${o.status}</td><td class="r">${o.custo == null ? '<span class="muted">aguardando</span>' : R$(o.custo)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Nenhuma OS encontrada.</td></tr>';
}
['#busca', '#fStatus', '#fPrio', '#fOrdem'].forEach((s) => $(s).oninput = renderHist);

// ---------- Detalhe da OS ----------
async function abrirOS(codigo) {
  const o = await j('/api/os/' + codigo), c = o.custoDet;
  const tb = (rows, h) => `<table><tr>${h.map((x) => `<th>${x}</th>`).join('')}</tr>${rows}</table>`;
  $('#dlgBody').innerHTML = `<h3>${o.codigo} ${badge(o.prioridade)}</h3><p class="muted">${local(o)} · aberta em ${dt(o.abertura)} · ${o.status}</p>
    <p><b>${esc(o.ocorrencia)}</b> (${esc(o.tipo)})<br>Causa provável: ${esc(o.causa)}<br><i>${esc(o.descricao)}</i></p>${o.foto ? `<img src="/uploads/${o.foto}" style="max-width:100%;border-radius:10px">` : ''}
    ${c ? `<h4>Custos (Neovero)</h4>${tb(c.maoDeObra.map((m) => `<tr><td>${esc(m.tecnico)}</td><td>${m.horas} h × ${R$(m.valorHora)}</td><td class="r">${R$(m.total)}</td></tr>`).join(''), ['Mão de obra', 'Horas', 'Total'])}
      ${tb(c.insumos.map((m) => `<tr><td>${esc(m.item)}</td><td>${m.qtd} ${esc(m.unidade)} × ${R$(m.valorUnit)}</td><td class="r">${R$(m.total)}</td></tr>`).join(''), ['Insumos', 'Qtd', 'Total'])}
      <p class="tot">Total: ${R$(c.total)}</p>` : `<div class="warn">Sem custos no Neovero para esta OS ainda.<br><button class="btn" id="simNv">Simular lançamento no Neovero</button></div>`}
    <div class="row" style="margin-bottom:10px">${['Aberta', 'Em andamento', 'Concluída'].map((s) => `<button class="btn ghost" data-st="${s}" ${s === o.status ? 'disabled' : ''}>${s}</button>`).join('')}</div>`;
  const dlg = $('#dlg'); if (!dlg.open) dlg.showModal();
  const sim = $('#simNv'); if (sim) sim.onclick = async () => { sim.textContent = 'Lançando…'; await post('/api/neovero/simular-lancamento/' + codigo); await loadDash(); abrirOS(codigo); };
  document.querySelectorAll('[data-st]').forEach((b) => b.onclick = async () => { await post(`/api/os/${codigo}/status`, { status: b.dataset.st }); await loadDash(); abrirOS(codigo); });
}
$('#dlgClose').onclick = () => $('#dlg').close();
init();
