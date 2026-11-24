# OS Inteligente · Opy Health (MVP v0.1)

Registro de ordens de serviço por **voz ou texto**, decupagem automática (local, ocorrência, causa, prioridade, código de OS),
custos puxados de um **simulador do Neovero (planilha Excel)** e **dashboard** com histórico, custos e rankings.

## Rodar
```bash
npm install
npm start          # http://localhost:3000
npm run seed       # (opcional) recria o histórico fictício e a planilha
```

## Alinhamento com a apresentação (https://igorbm11.github.io/OSInteligente/)
| Na apresentação | No MVP |
|---|---|
| Registro por foto ou voz, sem formulário | Caixa central com voz e foto na hora |
| Leitura pela IA: local, equipamento, tipo de serviço, ocorrência e prioridade | Idem (campos na mesma ordem do mock) |
| **Chamado por setor, não por equipamento** (86% das OS prediais sem ativo) | Campo **Equipamento** (lista do Neovero) identificado pela IA; KPI "OS com equipamento identificado" |
| Consulta às bases (ativo, histórico, almoxarifado) | Cartão **Consulta ao Neovero** na confirmação: OS em 90 dias, custo acumulado, recorrência e peças mais usadas |
| Custo = mão de obra + peças + serviço externo | Abas MaoDeObra, **Pecas** (código padronizado PC-NNNN) e **ServicosExternos**; gráfico de composição |
| Histórico, recorrência e custo por equipamento | Painel de equipamentos no dashboard (clicável) |
| Abertura e fechamento automáticos | Horários gravados e exibidos na OS |
| Indicadores atuais não distinguem o que vai bem do que vai mal ("100% no prazo") | SLA por prioridade (premissa: 4/24/72/168 h): % dentro do SLA e OS em atraso |
| ~170 OS/dia em um hospital (OZN) | Projeções da aba Gestão da IA usam 170 OS/dia |
| Manutenção predial primeiro, engenharia clínica depois | Campo **Área** (predial × engenharia clínica) por categoria do equipamento |

**Fora do MVP (de propósito):** integrações com Sankhya, meuResíduo e TOTVS; almoxarifado completo (saldo, inventário, retirada sem reabrir); rondas/checklist; TI; validações de encerramento (assinatura); Helpdesk.

## O que o MVP faz
| Tela | O que tem |
|---|---|
| **Registrar** | Caixa de texto central (estilo chat) com **voz** (microfone) e **foto tirada na hora** (câmera) → "Preencher com a IA" → campos preenchidos (verde = IA, laranja = confira, **vermelho = a IA não soube: preencher**) → confirmar. Aviso rápido (toast) ao registrar. Código gerado `OS-AAAA-NNNNN`. |
| **Dashboard** | KPIs e gráficos clicáveis (abrem o Histórico já filtrado), **fila de prioridade** (OS em aberto: prioridade + dias parada + custo) e **maiores custos por OS**, ambos compactos com "ver lista completa". |
| **Gestão da IA** | Acompanhamento da IA de registro: chamadas, taxa de sucesso, latência (média/p95), **tokens** (entrada/saída), **custo estimado**, qualidade (quanto o operador aceita sem corrigir, por campo), resultado e erros, modelos usados (principal × reserva), **armazenamento** (fotos e dados) com projeção para ~100 OS/dia, configuração (modelo, chave, versão do prompt) e alertas. Cada chamada é registrada em `data/ia_log.json`; o histórico de demonstração (marcado como *demo*) é gerado por `npm run seed`. |
| **Histórico** | Todas as OS, com filtros e detalhe de custo (mão de obra + insumos). Mudança de status. |

### Escolha voz × imagem
Voz foi escolhida por ser a mais executável no MVP (zero custo, sem backend de IA e é o formato do mock da apresentação). A foto é tirada na hora (câmera). A **leitura automática** de texto e foto usa a OpenAI (modelo com visão): defina `OPENAI_API_KEY` (e, opcionalmente, `OPENAI_MODEL`; padrão `gpt-6.2-sol`, com `gpt-4o` e `gpt-4o-mini` de reserva se o modelo não existir para a conta). O servidor envia o relato/imagem para sugerir ocorrência, equipamento, local e prioridade (*ainda não testado com chave real*). Sem a chave, valem só as regras e a foto fica apenas anexada, com os campos em vermelho. Se a IA falhar, o motivo técnico aparece no aviso do formulário.

## Simulador do Neovero
`data/neovero_simulador.xlsx` (também baixável no dashboard) com as abas **OS**, **Equipamentos**, **MaoDeObra**, **Pecas**, (mão de obra: técnico, horas, valor_hora · peças: codigo_peca, descricao, qtd, valor_unit · serviços externos: fornecedor, descricao, valor).
A aba **Equipamentos** (codigo_equipamento, equipamento, categoria) é a lista de equipamentos do hospital: alimenta o dropdown do formulário e a identificação pela IA. Para incluir um equipamento, adicione uma linha nessa aba. O app lê essa planilha a cada mudança (editar o Excel reflete no dashboard). OS sem linhas aparecem como "aguardando custo";
no detalhe da OS o botão **Simular lançamento no Neovero** grava custos plausíveis na planilha. A integração real troca apenas `src/neovero.js` (`getCustos`, `getTodos`).

## Gestão da IA: variáveis opcionais
`OPENAI_PRICE_IN_PER_M` e `OPENAI_PRICE_OUT_PER_M` (US$ por 1M de tokens; padrão 2,5 e 10 — **estimativa**, ajuste ao preço do modelo).

## Estrutura
`server.js` (API + estáticos) · `src/parser.js` (decupagem por regras; trocável por LLM) · `src/neovero.js` · `src/dashboard.js` · `src/catalogo.js` · `data/locais.json` · `public/`

## Pendências conhecidas
- **Locais são placeholders**: não foi possível ler a tela de Pavimentos/Ambientes da Opy (exige Claude in Chrome e login). Substituir `data/locais.json` pelo cadastro real.
- Decupagem: regras com palavra inteira (sempre ativas) + raciocínio da OpenAI sobre texto e foto quando `OPENAI_API_KEY` existe (a IA tem prioridade e as regras preenchem o que faltar); sem autenticação/perfis; persistência em JSON; dados e custos fictícios.

## Publicar (Render, plano gratuito)
1. Crie conta em render.com e conecte o GitHub.
2. **New → Blueprint**, escolha este repositório e a branch com o app (o `render.yaml` configura tudo).
3. Ao terminar o deploy, abra o endereço `https://….onrender.com` (HTTPS, então o microfone funciona).

No plano gratuito o serviço "dorme" após ~15 min sem uso (o 1º acesso demora ~1 min) e os dados voltam ao estado inicial a cada reinício. Adequado para demonstração.
