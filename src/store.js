'use strict';
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'data', 'os.json');

let cache = null;
function all() {
  if (!cache) cache = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : [];
  return cache;
}
function save() { fs.writeFileSync(FILE, JSON.stringify(cache, null, 2)); }
function nextCodigo(ano = new Date().getFullYear()) {
  const max = all().reduce((m, o) => Math.max(m, parseInt(o.codigo.split('-')[2], 10) || 0), 1000);
  return `OS-${ano}-${String(max + 1).padStart(5, '0')}`;
}
function add(os) { all().push(os); save(); return os; }
function get(codigo) { return all().find((o) => o.codigo === codigo); }
function replaceAll(list) { cache = list; save(); }
module.exports = { all, add, get, save, nextCodigo, replaceAll };
