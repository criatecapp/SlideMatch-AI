export class AppError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class ValidationAppError extends AppError {
  constructor(message: string) {
    super(400, "validation_error", message);
  }
}

export class NotFoundAppError extends AppError {
  constructor(message: string) {
    super(404, "not_found", message);
  }
}

export class UnauthorizedAppError extends AppError {
  constructor(message = "Não autenticado") {
    super(401, "unauthorized", message);
  }
}

export class ForbiddenAppError extends AppError {
  constructor(message = "Sem permissão") {
    super(403, "forbidden", message);
  }
}

export class AIGenerationError extends AppError {
  constructor(message: string) {
    super(502, "ai_generation_error", message);
  }
}

// P1#2 — limite de uso temporário atingido. `retryAfterSeconds` vira o
// header Retry-After (seção http.ts) — nunca expõe detalhe interno do
// rate limiter, só quanto tempo esperar.
export class RateLimitAppError extends AppError {
  retryAfterSeconds: number;
  constructor(retryAfterSeconds: number, message = "Limite temporário atingido. Tente novamente em alguns minutos.") {
    super(429, "rate_limited", message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
