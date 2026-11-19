'use strict';
// Catálogo de domínio do MVP. Locais são PLACEHOLDERS (Hospital Delphina Aziz - Manaus)
// a substituir pelo cadastro real de Ambientes/Pavimentos da Opy (data/locais.json).
const fs = require('fs');
const path = require('path');

const locais = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'locais.json'), 'utf8'));

const PRIORIDADES = ['Baixa', 'Média', 'Alta', 'Crítica'];

// especialidade -> valor/hora (R$) fictício
const VALOR_HORA = {
  Hidráulica: 78, Elétrica: 85, Climatização: 98, Civil: 72,
  'Gases medicinais': 120, Elevadores: 135, Serralheria: 74, Pintura: 62,
};

// ocorrências conhecidas: palavras-chave p/ decupagem + modelo de custo p/ simulador
const OCORRENCIAS = [
  { ocorrencia: 'Infiltração no teto', tipo: 'Predial · hidráulica', causa: 'Vazamento em tubulação', prioridade: 'Alta', esp: 'Hidráulica', horas: [3, 10],
    palavras: ['infiltracao', 'infiltrando', 'pingando', 'goteira', 'mancha no teto', 'vazando do teto', 'cano no teto'],
    insumos: [['Tubo PVC soldável 25mm', 'm', 14, 3, 8], ['Conexão PVC (joelho/luva)', 'un', 6, 2, 8], ['Adesivo PVC 175g', 'un', 28, 1, 2], ['Massa corrida / reparo de forro', 'kg', 11, 2, 6]] },
  { ocorrencia: 'Vazamento de água', tipo: 'Predial · hidráulica', causa: 'Registro/torneira/flexível com defeito', prioridade: 'Média', esp: 'Hidráulica', horas: [1, 5],
    palavras: ['vazamento', 'vazando', 'torneira', 'registro', 'flexivel', 'agua escorrendo', 'poca d agua', 'alagando'],
    insumos: [['Flexível inox 40cm', 'un', 22, 1, 3], ['Vedante / fita veda rosca', 'un', 7, 1, 2], ['Registro de pressão 3/4', 'un', 58, 1, 1]] },
  { ocorrencia: 'Entupimento', tipo: 'Predial · hidráulica', causa: 'Obstrução em ramal/ralo', prioridade: 'Média', esp: 'Hidráulica', horas: [1, 4],
    palavras: ['entupid', 'entupimento', 'entupiu', 'esgoto', 'ralo', 'vaso nao desce', 'mau cheiro', 'refluxo', 'sifao'],
    insumos: [['Soda cáustica / desentupidor químico', 'kg', 18, 1, 2], ['Sifão PVC', 'un', 19, 1, 2]] },
  { ocorrencia: 'Ar-condicionado sem refrigerar', tipo: 'Climatização', causa: 'Falta de gás / filtro sujo / compressor', prioridade: 'Alta', esp: 'Climatização', horas: [2, 8],
    palavras: ['ar condicionado', 'ar-condicionado', 'split', 'nao gela', 'quente', 'sem refriger', 'climatiza', 'pingando ar', 'fan coil', 'chiller'],
    insumos: [['Gás refrigerante R410A', 'kg', 135, 1, 3], ['Filtro de ar', 'un', 45, 1, 2], ['Capacitor de partida', 'un', 62, 1, 1], ['Placa eletrônica evaporadora', 'un', 480, 1, 1]] },
  { ocorrencia: 'Lâmpada queimada / iluminação', tipo: 'Predial · elétrica', causa: 'Fim de vida útil da lâmpada/reator', prioridade: 'Baixa', esp: 'Elétrica', horas: [0.5, 2],
    palavras: ['lampada', 'iluminacao', 'luminaria', 'escuro', 'sem luz', 'led', 'reator', 'queimada'],
    insumos: [['Lâmpada LED tubular 18W', 'un', 16, 1, 6], ['Reator eletrônico', 'un', 32, 1, 2]] },
  { ocorrencia: 'Tomada/disjuntor sem energia', tipo: 'Predial · elétrica', causa: 'Disjuntor desarmado / fiação com defeito', prioridade: 'Alta', esp: 'Elétrica', horas: [1, 6],
    palavras: ['tomada', 'disjuntor', 'sem energia', 'caiu a energia', 'faiscando', 'choque', 'cheiro de queimado', 'quadro eletrico', 'desarmando', 'curto'],
    insumos: [['Disjuntor monopolar 20A', 'un', 24, 1, 2], ['Tomada 2P+T 10A', 'un', 12, 1, 4], ['Cabo flexível 2,5mm', 'm', 4.5, 5, 25]] },
  { ocorrencia: 'Falha em gás medicinal', tipo: 'Gases medicinais', causa: 'Vazamento/pressão baixa na rede ou ponto de gás', prioridade: 'Crítica', esp: 'Gases medicinais', horas: [2, 8],
    palavras: ['oxigenio', 'gas medicinal', 'ar comprimido medicinal', 'vacuo', 'regua de gas', 'ponto de gas', 'fluxometro', 'manometro'],
    insumos: [['Válvula de bloqueio gás medicinal', 'un', 210, 1, 2], ['Mangueira/conexão de gás medicinal', 'un', 95, 1, 3], ['Vedante específico O2', 'un', 38, 1, 2]] },
  { ocorrencia: 'Elevador parado/com falha', tipo: 'Elevadores', causa: 'Falha de porta/comando/sensor', prioridade: 'Alta', esp: 'Elevadores', horas: [2, 6],
    palavras: ['elevador', 'maca presa', 'porta do elevador', 'parou entre andares'],
    insumos: [['Sensor de porta de cabine', 'un', 340, 1, 1], ['Lubrificante de guias', 'un', 55, 1, 1]] },
  { ocorrencia: 'Porta/fechadura com defeito', tipo: 'Predial · serralheria', causa: 'Desgaste de dobradiça/fechadura/mola', prioridade: 'Média', esp: 'Serralheria', horas: [1, 4],
    palavras: ['porta', 'fechadura', 'dobradica', 'trinco', 'macaneta', 'nao fecha', 'emperrada', 'trancada', 'mola hidraulica'],
    insumos: [['Fechadura de embutir', 'un', 85, 1, 1], ['Dobradiça 3"', 'un', 14, 2, 4], ['Mola hidráulica de porta', 'un', 120, 1, 1]] },
  { ocorrencia: 'Piso/forro/parede danificado', tipo: 'Predial · civil', causa: 'Desgaste ou impacto', prioridade: 'Baixa', esp: 'Civil', horas: [2, 12],
    palavras: ['piso', 'forro', 'ceramica soltando', 'rachadura', 'trinca', 'parede', 'reboco', 'azulejo', 'rodape', 'piso quebrado', 'forro caindo', 'forro quebrado', 'parede quebrada'],
    insumos: [['Argamassa AC-II', 'sc', 28, 1, 4], ['Piso/cerâmica (reposição)', 'm²', 55, 1, 6], ['Placa de forro', 'un', 38, 2, 10], ['Rejunte', 'kg', 9, 1, 3]] },
  { ocorrencia: 'Ventilador/exaustor com defeito', tipo: 'Climatização', causa: 'Motor, hélice ou capacitor com defeito', prioridade: 'Média', esp: 'Climatização', horas: [1, 4],
    palavras: ['ventilador', 'exaustor', 'ventilacao', 'ventoinha', 'helice', 'coifa', 'circulador de ar'],
    insumos: [['Capacitor de ventilador', 'un', 28, 1, 2], ['Motor de ventilador', 'un', 190, 1, 1], ['Hélice de ventilador', 'un', 45, 1, 1]] },
  { ocorrencia: 'Mobiliário/equipamento danificado', tipo: 'Predial · geral', causa: 'Desgaste, impacto ou uso inadequado', prioridade: 'Baixa', esp: 'Serralheria', horas: [1, 3],
    palavras: ['cadeira', 'mesa', 'bancada', 'armario', 'maca', 'cama', 'gaveta', 'prateleira', 'bebedouro', 'suporte de soro'],
    insumos: [['Parafusos e fixadores (kit)', 'un', 18, 1, 2], ['Rodízio', 'un', 22, 1, 4], ['Peça de reposição', 'un', 60, 1, 2]] },
  { ocorrencia: 'Pintura/acabamento', tipo: 'Predial · pintura', causa: 'Desgaste / manchas', prioridade: 'Baixa', esp: 'Pintura', horas: [3, 14],
    palavras: ['pintura', 'pintar', 'tinta', 'descascando', 'mofo', 'manchada'],
    insumos: [['Tinta acrílica 18L', 'un', 310, 1, 2], ['Massa corrida 25kg', 'un', 70, 1, 2], ['Rolo/fita/lixa (kit)', 'un', 36, 1, 2]] },
];

const GENERICA = { ocorrencia: 'Outra ocorrência', tipo: 'Predial · geral', causa: 'A diagnosticar', prioridade: 'Média', esp: 'Civil', horas: [1, 4], palavras: [], insumos: [['Material diverso', 'un', 40, 1, 3]] };

module.exports = { locais, PRIORIDADES, VALOR_HORA, OCORRENCIAS, GENERICA };
