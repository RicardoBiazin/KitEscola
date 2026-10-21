# Changelog

## 0.9.1 — 2026-10-21

- Repositório público, com licença **MIT** e histórico novo, começando nesta versão. O histórico de desenvolvimento anterior (0.1.0 a 0.9.0) ficou num repositório privado.
- Páginas de teste da Amazon e da Kalunga (`tests/fixtures`) reduzidas aos cartões de produto. Saíram cabeçalho, scripts, formulários e dados de sessão anônima, e os arquivos caíram de 2,4 MB para 0,8 MB. Os testes dos parsers continuam os mesmos.
- Next.js 15.5.28 e `npm audit fix` (sharp, source-map-js, @vitest/mocker). `npm audit --omit=dev` sem vulnerabilidades. Resta só `braces` (alerta sem correção, para todas as versões), que entra apenas pelo plugin de ESLint, em desenvolvimento.
- Amazon online: segue desligada na Netlify (não há navegador). O caminho oficial agora é a **Creators API**, que substituiu a PA-API 5 em 2026 e exige conta no Amazon Associados com vendas indicadas.

## 0.9.0 — 2026-10-14

Correções de segurança (varredura de 2026-10-14; nenhum problema crítico ou alto).

- **Proteção exigida por padrão** (`src/lib/protecao.ts`): antes, sem `TURNSTILE_SECRET_KEY` a verificação ficava desligada, e só `KITESCOLA_EXIGIR_TURNSTILE=1` fechava a porta. Agora a proteção só é desligada com `KITESCOLA_LOCAL=1`, e essa variável é ignorada quando a função roda na Netlify. `KITESCOLA_EXIGIR_TURNSTILE` deixou de ter efeito.
- **Passe com nonce e limites de uso** (`src/lib/limites.ts`): cada passe vale no máximo 10 chamadas de `/api/otimizar` e `/api/importar`. Limite por IP por hora em cada rota (busca 60, passe 60, otimizar 60, importar 30). Os contadores ficam no **Netlify Blobs** (`@netlify/blobs`, nova dependência), porque a função roda em várias instâncias. Se o armazenamento falhar, a rota responde 503.
- **Nova rota `/api/passe`**: emite passe com Turnstile para a importação da planilha (que acontece antes da busca).
- **`/api/importar`**: exige passe; confere o tamanho antes de montar o formulário e corta o corpo que passar de 5 MB enquanto chega; lê no máximo 500 linhas por aba e 5 abas (`sheetRows`).
- **Entrada validada** (`src/lib/entrada.ts`): `/api/otimizar` confere cada oferta (antes, um `null` em `ofertas` dava erro 500); `sku` e `seller` só aceitam `^[\w-]{1,40}$` (vão para o corpo da simulação VTEX); fretes conferidos.
- **Erros sem detalhe técnico**: a busca não envia mais `String(e)` nem o texto de erro das lojas ao navegador; o detalhe vai só para o log do servidor.
- **Links dos resultados** só para `http:` e `https:` (`javascript:` vira texto sem link).
- **IP**: na Netlify, `x-forwarded-for` e `cf-connecting-ip` são ignorados (eram forjáveis). Fora dela, continuam como antes.
- **Pendência conhecida**: a CSP ainda tem `script-src 'unsafe-inline'`, necessário para o bootstrap do Next.js sem nonces. Não foi alterada nesta versão.
- Requisito: Node 22.12 ou superior (exigido pelo `@netlify/blobs`).

Para atualizar na Netlify: não definir `KITESCOLA_LOCAL`; conferir que `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` e `KITESCOLA_SEGREDO` existem; `KITESCOLA_EXIGIR_TURNSTILE` pode ser removida.

## 0.8.0 — 2026-09-26

- **eFácil** incluída: busca pelos dados da página (nome, preço, disponibilidade, foto) e frete estimado. O cálculo de frete da loja exige sessão na plataforma dela.
- **Magalu** continua de fora: bloqueia (403) qualquer acesso automatizado, até navegador.
- Relevância: tesoura, lápis etc. de outros usos (unha, cabelo, costura, cozinha, maquiagem...) não passam mais por material escolar; "escolar" deixou de ser palavra obrigatória (ex.: "mochila escolar" aceita "Mochila Infantil").

## 0.7.0 — 2026-09-26

- **Shopee pronta** pela API oficial de afiliados (GraphQL `productOfferV2`, assinatura SHA256): busca por palavra-chave, link de afiliado e frete estimado por vendedor. Liga sozinha quando `SHOPEE_APP_ID` e `SHOPEE_SECRET` estiverem configurados.
- Lojas VTEX mais resistentes: um 403/429 passageiro é repetido uma vez; se a busca inteligente estiver bloqueada ou só devolver um redirecionamento (ex.: "caderno" → página de promoção), usa a busca do catálogo.
- **Le Biscuit removida**: o Cloudflare da loja barra requisições automatizadas de servidor de propósito.

## 0.6.0 — 2026-09-25

- Nova aba **Tudo em uma loja**: ranking de todas as lojas para a lista inteira, num pedido só, com o frete do carrinho completo confirmado pela loja e a diferença para o carrinho mais barato.
- Log da função: um resumo por busca (lojas, estado, ofertas e tempo de cada uma, sem IP nem CEP), para acompanhar pela Netlify.
- React 19.1.9 (o site recebeu varredura automática de "Server Actions"; o Next 15.5.26 já estava corrigido).

## 0.5.0 — 2026-09-25

- Pronto para rodar online (Netlify): `netlify.toml`, cabeçalhos de segurança (CSP, HSTS, nosniff) e rotas com limite de 60 s.
- Proteção anti-robô: cada busca exige um token do Cloudflare Turnstile, conferido no servidor. A busca devolve um passe assinado (HMAC, 10 min, preso ao IP) que libera o `/api/otimizar`. Online (`KITESCOLA_EXIGIR_TURNSTILE=1`), sem as chaves configuradas a busca fica fechada em vez de aberta.
- Online, a Amazon fica desligada (não há navegador na Netlify); o Mercado Livre vai pela API.

## 0.4.0 — 2026-09-25

- Quantidade maior que 1: busca também "kit <item>" em cada loja e escolhe o que sai mais barato no total (ex.: 10 colas → 1 kit com 12). O frete continua simulado com o que será comprado de fato.
- Carrinhos e tabela mostram a quantidade pedida, o tamanho do kit e o **preço por unidade**.
- Relevância: "cola bastão" não aceita mais bastão de cola quente para pistola (grupo quente/pistola/silicone só vale se o item pedir).

## 0.3.0 — 2026-09-25

- Mercado Livre pela **API oficial** (token de aplicativo, client_credentials): busca no catálogo filtrada por categoria e preço por vendedor, com "frete grátis" por anúncio. Acaba o bloqueio anti-robô e a busca completa cai de ~75 s para ~15 s. O navegador fica de reserva quando não há credenciais ou a API falha.

## 0.2.0 — 2026-09-25

- Comparação por loja: novas linhas **Frete** (valor, real/estimado e prazo) e **Total na loja**, com o menor total em destaque e aviso quando a loja não tem todos os itens.
- Melhores carrinhos: sempre até **3 opções** (mais barato; menos lojas; tudo em uma loja; e as próximas mais baratas), renomeadas depois da confirmação do frete.
- Frete VTEX por **pacote de vendedor**: comprar um item só não usa mais o rateio do frete (que saía mais barato que o real); em marketplace, cada vendedor paga o seu frete.

## 0.1.0 — 2026-09-24

Primeira versão.

- Lista de materiais: digitada, colada como texto livre ou importada de planilha (XLSX/XLS/ODS/CSV).
- Busca em 12 lojas: Kalunga, 9 lojas VTEX (Carrefour, Americanas, Atacadão, Ri Happy, PB Kids, Le Biscuit, Savegnago, Bistek, Giassi), Amazon e Mercado Livre (as duas últimas via Edge/Chrome).
- Frete real por CEP nas lojas VTEX (com entrega e preço regional conferidos por item); estimado nas demais.
- Opção de retirada grátis em loja.
- Otimizador de carrinho: mais barato no total, menos lojas e tudo em uma loja.
- Sugestões por série e itens complementares.
- Testes unitários com páginas reais salvas, e2e com lojas simuladas e script `sonda` para teste real.
