// Limites de produção (auditoria de prontidão — P1#1/#2/#3) — únicos
// números "mágicos" de custo/abuso do sistema, centralizados aqui pra
// nunca precisar caçar um valor espalhado pelo código.

// P1#1 — teto de slides por apresentação. 30 é o valor sugerido e
// confirmado adequado: o gerador já limita maxAttempts a 5 (admin,
// settingsService) e o retry local do Auto-Fix soma no máximo mais 1
// tentativa por seção — 30 seções × 5 tentativas × 2 (retry local) = até
// 300 chamadas OpenAI no pior caso absoluto (era ~1000 com o teto antigo
// de 100), e o Render QA roda só 1x por seção (30 renders no máximo),
// não por tentativa. Ainda cabe com folga dentro do maxDuration:60 das
// rotas de geração pro caso comum (poucas seções falhando).
export const MAX_SLIDES = 30;

// Tempo além do qual uma apresentação presa em "analyzing"/"generating"
// é considerada travada (função morta pelo timeout do runtime antes do
// catch rodar) e pode ser recuperada automaticamente na próxima leitura.
// maxDuration das rotas de geração é 60s (vercel.json) — 5 minutos dá
// margem generosa (5x) pra nunca marcar como falha uma geração que ainda
// está dentro do tempo normal, mesmo com variação de latência da OpenAI.
export const STALE_GENERATION_MS = 5 * 60 * 1000;

// P1#3 — tamanho máximo dos campos de texto livre que alimentam prompts
// de IA. Generosos o bastante pra conteúdo real (um artigo longo cabe em
// 100k caracteres) — o objetivo é barrar abuso (múltiplos MB), não
// apertar uso legítimo.
export const TEXT_LIMITS = {
  projectContent: 100_000,
  projectDescription: 5_000,
  projectObjective: 5_000,
  projectAudience: 2_000,
  projectStyle: 2_000,
  editCommand: 5_000,
} as const;

// P1#2 — rate limit por usuário autenticado (uid do token Firebase, nunca
// enviado pelo cliente). Janela fixa de 10 minutos, guardada no
// Firestore (já é a base do sistema — sem infra nova).
export const RATE_LIMITS = {
  generate: { max: 5, windowMs: 10 * 60 * 1000 },
  edit: { max: 30, windowMs: 10 * 60 * 1000 },
} as const;
