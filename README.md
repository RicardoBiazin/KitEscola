# KitEscola

Comparador de preços de material escolar. Você informa a lista (digitando, colando o texto da escola ou anexando
uma planilha), o CEP e a série; o KitEscola busca os itens em várias lojas online, confere o frete para o CEP e
monta o carrinho mais barato — somando produto **e** frete, que é cobrado uma vez por loja.

## Como usar

- **Windows:** dê dois cliques em `iniciar.bat` (instala, compila na primeira vez e abre `http://localhost:3000`).
- **Manual:** `npm ci && npm run build && npm start`. Para desenvolvimento: `npm run dev`.

Requer Node.js 20+. Amazon e Mercado Livre usam o **Edge ou Chrome instalado** (via Playwright, sem baixar navegador).

## O que ele faz

| Etapa | Como |
| --- | --- |
| Entrada | item a item, texto colado (`2 cadernos`, `lápis preto - 4`, `cola (2)`) ou planilha XLSX/XLS/ODS/CSV (detecta as colunas "Material" e "Quantidade") |
| Busca | todas as lojas em paralelo, com o progresso aparecendo ao vivo (NDJSON) |
| Casamento | nota de relevância (a palavra principal é obrigatória, e especificações como "10 matérias", "24 cores" e "90g" precisam bater) para não aceitar "Camisa 10" como caderno de 10 matérias |
| Quantidade | entende pacotes ("caixa com 12", "kit 4") e calcula quantos anúncios comprar |
| Frete | **real** quando a loja calcula pelo CEP; **estimado** (regra "grátis acima de X") quando a loja exige login |
| Otimização | busca exaustiva sobre os conjuntos de lojas (até 14), com frete por loja ou por item (marketplaces); mostra até 3 opções ("mais barato", "menos lojas", "tudo em uma loja" e as seguintes), com o frete reconfirmado no carrinho final |
| Sugestões | kit típico por série (Infantil, Fund. I, Fund. II, Médio) e complementares (borracha para quem tem lápis, grafite para lapiseira, plástico para encapar...) |

## Lojas

| Loja | Busca | Frete |
| --- | --- | --- |
| Kalunga | HTML | estimado (o cálculo do site exige login) |
| eFácil | dados da página de busca (Next.js) | estimado (o cálculo exige sessão na plataforma da loja) |
| Carrefour, Americanas, Atacadão, Ri Happy, PB Kids, Savegnago, Bistek, Giassi | API pública VTEX | **real**, pela simulação de checkout por CEP; o preço regional e a entrega são conferidos por item |
| Amazon | navegador (só no computador; desligada na Netlify) | estimado |
| Shopee | **API de afiliados** (`SHOPEE_APP_ID`/`SHOPEE_SECRET`); só aparece com as credenciais | estimado, um por vendedor |
| Mercado Livre | **API oficial** (catálogo) com `ML_CLIENT_ID`/`ML_CLIENT_SECRET`; sem credenciais, navegador | estimado, com o "frete grátis" informado por anúncio |

Situação em 24/09/2026:
- **Le Biscuit** (Cloudflare Bot Management), **Magazine Luiza** e **Casas Bahia** bloqueiam (HTTP 403) até mesmo o navegador automatizado, por isso ficaram de fora.
- Sem credenciais da API, o Mercado Livre vai pelo navegador e às vezes pede verificação anti-robô; aí ele aparece como **bloqueado** e o resto segue normalmente.
- A Americanas, na plataforma VTEX, oferece principalmente **retirada em loja**. Marque "Aceito retirar na loja" para considerar essa opção.

**Incluir uma loja:** se ela for VTEX, basta uma linha em `LOJAS_VTEX` ([src/lib/lojas/registro.ts](src/lib/lojas/registro.ts)). Para outra plataforma, crie um adapter que implemente `LojaAdapter` ([src/lib/lojas/tipos.ts](src/lib/lojas/tipos.ts)).

As regras de frete estimado ficam em `REGRAS_FRETE`, no mesmo arquivo.

## Mercado Livre (API)

Crie um app em developers.mercadolivre.com.br → *Minhas aplicações*, com o fluxo **Client Credentials** e só permissões de leitura, e coloque `ML_CLIENT_ID` e `ML_CLIENT_SECRET` no `.env.local`. O token de aplicativo (vale 6 h) é obtido e renovado sozinho.

O que o token de aplicativo libera (testado em 25/09/2026):
- `/products/search`: busca no catálogo, filtrada pela categoria do `domain_discovery`.
- `/products/{id}/items`: preço por vendedor e frete grátis.

Continuam bloqueados (403): `/sites/MLB/search`, `/items/{id}` e `/items/{id}/shipping_options`. Por isso o frete do ML segue estimado. A busca cobre só produtos de catálogo; anúncios sem produto de catálogo não aparecem.

## Configuração (`.env.local`)

Veja `.env.example`: `KITESCOLA_NAVEGADOR=off` desliga as lojas que precisam de navegador; `KITESCOLA_LOJAS_OFF=amazon,kalunga` desliga lojas específicas.

Proteção anti-robô: é exigida por padrão. Sem as chaves do Turnstile e sem `KITESCOLA_SEGREDO`, busca, importação e otimização recusam. Para uso só no computador, `KITESCOLA_LOCAL=1` (definido pelo `iniciar.bat` e pelo e2e; no `npm run dev`, via `.env.development.local`). Node 22.12 ou superior.

## Testes

```bash
npm test                                   # unitários (parsers com páginas reais salvas, otimizador, sugestões, importação)
npm run build && npm run test:e2e          # ponta a ponta no Edge, com lojas simuladas
npm run sonda -- "caderno 10 matérias" 88010000   # teste REAL: consulta todas as lojas agora
```

## Online (Netlify)

O site fica em https://kitescola.biazin.com.br (projeto Netlify `kitescola`). Para publicar: **`npm run publicar`** (com a árvore git limpa).

O script publica a partir de uma cópia limpa do git, sem nenhum `.env` local, e depois testa no site no ar que a proteção está ligada; se não estiver, volta para o deploy anterior. Não use `netlify deploy` direto da pasta do projeto: o adaptador copia o `.env.local` para dentro da função.

Variáveis da Netlify:
- `ML_CLIENT_ID` e `ML_CLIENT_SECRET`
- `TURNSTILE_SECRET_KEY` e `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (a chave pública entra no build)
- `KITESCOLA_SEGREDO`
- `KITESCOLA_NAVEGADOR=off` e `KITESCOLA_LOJAS_OFF=amazon`
- **Não definir** `KITESCOLA_LOCAL` na Netlify (ele desliga a proteção; na Netlify é ignorado, mas não deve existir).

Proteção (exigida por padrão, versão 0.9.0):
- Cada busca passa pelo Cloudflare Turnstile, com token de uso único conferido no servidor.
- A busca devolve um passe assinado (HMAC, nonce, 10 min, preso ao IP). `/api/otimizar` e `/api/importar` exigem o passe; `/api/passe` emite um passe para importar a planilha (com Turnstile).
- Limites: por IP (por hora) em cada rota e no máximo 10 chamadas por passe. Os contadores ficam no Netlify Blobs (loja `kitescola-limites`). Se o armazenamento falhar, a rota responde 503 (fecha).
- Sem as chaves, ou sem `KITESCOLA_SEGREDO`, as rotas recusam (503/403). Não há mais como deixar a proteção desligada por esquecimento.
- O IP vem de `x-nf-client-connection-ip`; na Netlify os cabeçalhos `x-forwarded-for` e `cf-connecting-ip` são ignorados.

Uso local: `KITESCOLA_LOCAL=1` desliga a proteção e os limites. O `iniciar.bat` e o e2e já definem a variável; para o `npm run dev`, ela fica em `.env.development.local`. **Nunca** coloque essa variável no `.env.local`, porque ele vai junto para a função da Netlify. Dentro da função (AWS Lambda) ela é ignorada.

Pendência conhecida: a CSP ainda tem `script-src 'unsafe-inline'` (o bootstrap do Next.js precisa, sem nonces). Não foi alterada nesta versão.

## Limitações

- Raspagem depende do HTML/APIs das lojas: quando uma loja muda, o adapter dela precisa de ajuste (os testes com fixtures ajudam a detectar).
- Em hospedagem serverless (Netlify/Vercel) não há navegador e os IPs de datacenter costumam ser bloqueados — o uso recomendado é local.
- Preços e fretes são os do momento da consulta; confirme no site antes de comprar.

## Amazon online

A Amazon só responde a navegador real, e a Netlify não tem navegador. Por isso ela fica desligada no site (`KITESCOLA_LOJAS_OFF=amazon`). A API oficial agora é a **Creators API**, que substituiu a PA-API 5 em 2026: usa OAuth e exige conta aprovada no Amazon Associados, com um mínimo de vendas indicadas. Quando houver acesso, o adaptador segue o mesmo modelo do Mercado Livre e da Shopee.

## Licença

[MIT](LICENSE).

