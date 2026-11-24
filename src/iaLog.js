'use strict';
// Registro de cada chamada de interpretação por IA (/api/parse): base da aba "Gestão da IA".
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'data', 'ia_log.json');
const MAX = 5000;

let cache = null;
const all = () => (cache ||= fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : []);
const save = () => { if (cache.length > MAX) cache = cache.slice(-MAX); fs.writeFileSync(FILE, JSON.stringify(cache)); };
const add = (e) => { all().push(e); save(); return e; };
const replaceAll = (l) => { cache = l; save(); };

// Compara o que a IA sugeriu com o que o operador confirmou, campo a campo.
const CAMPOS = ['ocorrencia', 'equipamento', 'ambiente', 'pavimento', 'prioridade'];
function registrarRevisao(id, final, codigoOS) {
  const e = all().find((x) => x.id === id);
  if (!e || e.revisao) return null;
  e.revisao = {};
  for (const c of CAMPOS) {
    const sug = (e.sugestao && e.sugestao[c]) || '', fin = final[c] || '';
    e.revisao[c] = sug ? (sug === fin ? 'mantido' : 'alterado') : (fin ? 'preenchido' : 'vazio');
  }
  e.os = codigoOS;
  save();
  return e.revisao;
}
module.exports = { all, add, replaceAll, registrarRevisao, CAMPOS };
