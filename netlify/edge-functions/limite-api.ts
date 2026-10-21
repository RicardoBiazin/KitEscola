// Limite de rajada por IP nas rotas da API, aplicado pela própria Netlify (sem armazenamento).
// Passou do limite: a Netlify responde 429 antes de chegar à função.
// A função não faz nada além de deixar a requisição seguir.
export default async () => undefined;

export const config = {
  path: "/api/*",
  rateLimit: {
    action: "rate_limit",
    aggregateBy: ["ip", "domain"],
    windowSize: 60,
    windowLimit: 20,
  },
};
