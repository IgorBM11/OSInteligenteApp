# OS Inteligente · Opy Health (MVP v0.1)

Registro de ordens de serviço por **voz ou texto**, decupagem automática (local, ocorrência, causa, prioridade, código de OS),
custos puxados de um **simulador do Neovero (planilha Excel)** e **dashboard** com histórico, custos e rankings.

## Rodar
```bash
npm install
npm start          # http://localhost:3000
npm run seed       # (opcional) recria o histórico fictício e a planilha
```

## O que o MVP faz
| Tela | O que tem |
|---|---|
| **Registrar OS** | Microfone (Web Speech API, pt-BR, Chrome/Edge/Safari) ou digitação → "Decupar" → campos preenchidos (verde = IA, laranja = revisar) → confirmar. Foto opcional anexada. Código gerado `OS-AAAA-NNNNN`. |
| **Dashboard** | KPIs, **ranking de prioridade** (OS em aberto: prioridade + dias parada + custo), **ranking das OS mais caras**, custo por mês/tipo/ambiente, OS por prioridade. |
| **Histórico** | Todas as OS, com filtros e detalhe de custo (mão de obra + insumos). Mudança de status. |

### Escolha voz × imagem
Voz foi escolhida por ser a mais executável no MVP (zero custo, sem backend de IA e é o formato do mock da apresentação). Foto pode ser anexada, mas ainda **não é interpretada**.

## Simulador do Neovero
`data/neovero_simulador.xlsx` (também baixável no dashboard) com as abas **OS**, **MaoDeObra** (tecnico, horas, valor_hora) e **Insumos** (descricao, qtd, valor_unit).
O app lê essa planilha a cada mudança (editar o Excel reflete no dashboard). OS sem linhas aparecem como "aguardando custo";
no detalhe da OS o botão **Simular lançamento no Neovero** grava custos plausíveis na planilha. A integração real troca apenas `src/neovero.js` (`getCustos`, `getTodos`).

## Estrutura
`server.js` (API + estáticos) · `src/parser.js` (decupagem por regras; trocável por LLM) · `src/neovero.js` · `src/dashboard.js` · `src/catalogo.js` · `data/locais.json` · `public/`

## Pendências conhecidas
- **Locais são placeholders**: não foi possível ler a tela de Pavimentos/Ambientes da Opy (exige Claude in Chrome e login). Substituir `data/locais.json` pelo cadastro real.
- Decupagem por palavras-chave (sem LLM); sem autenticação/perfis; persistência em JSON; dados e custos fictícios.

## Publicar (Render, plano gratuito)
1. Crie conta em render.com e conecte o GitHub.
2. **New → Blueprint**, escolha este repositório e a branch com o app (o `render.yaml` configura tudo).
3. Ao terminar o deploy, abra o endereço `https://….onrender.com` (HTTPS, então o microfone funciona).

No plano gratuito o serviço "dorme" após ~15 min sem uso (o 1º acesso demora ~1 min) e os dados voltam ao estado inicial a cada reinício. Adequado para demonstração.
