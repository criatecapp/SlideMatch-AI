import OpenAI from "openai";
import type { ZodType } from "zod";
import { z } from "zod";
import {
  ContentAnalysisSchema,
  ContentMapSchema,
  DesignDirectionSchema,
  EditCommandResultSchema,
  ImageAnalysisSchema,
  PresentationPlanSchema,
  type ContentAnalysis,
  type ContentMap,
  type DesignDirection,
  type EditCommandResult,
  type ImageAnalysis,
  type PresentationPlan,
} from "../schemas/ai";
import type { AIProvider, ImageInput } from "./aiProvider";
import { AIGenerationError } from "../errors";

export interface OpenAIProviderConfig {
  apiKey?: string;
  model?: string;
}

export class OpenAIProvider implements AIProvider {
  private apiKey?: string;
  private model: string;
  private _client?: OpenAI;

  constructor(config: OpenAIProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
    this.model = config.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  }

  private get client(): OpenAI {
    if (!this.apiKey) throw new Error("OPENAI_API_KEY is not configured");
    if (!this._client) this._client = new OpenAI({ apiKey: this.apiKey });
    return this._client;
  }

  // Vinculado por `z.output<S>` (não por `ZodType<T>` direto) — evita um
  // problema conhecido de inferência do TS com o parâmetro `Input` de
  // ZodType quando o schema usa `.default()`, onde T acabava resolvendo
  // pro tipo de entrada (campos opcionais) em vez do tipo de saída.
  private async callJson<S extends ZodType<any>>(params: {
    systemPrompt: string;
    userContent: string | OpenAI.Chat.ChatCompletionContentPart[];
    schema: S;
    temperature?: number;
  }): Promise<z.output<S>> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userContent as any },
    ];
    const raw = await this.complete(messages, params.temperature ?? 0.4);
    const first = params.schema.safeParse(safeJsonParse(raw));
    if (first.success) return first.data;

    messages.push({ role: "assistant", content: raw });
    messages.push({
      role: "user",
      content:
        "Sua resposta anterior não é um JSON válido para o schema esperado. " +
        `Erro: ${first.error.message}. Responda de novo APENAS com o JSON corrigido, sem comentários.`,
    });
    const retryRaw = await this.complete(messages, params.temperature ?? 0.4);
    const second = params.schema.safeParse(safeJsonParse(retryRaw));
    if (second.success) return second.data;

    throw new AIGenerationError(`Model output did not match schema after repair: ${second.error.message}`);
  }

  private async complete(messages: OpenAI.Chat.ChatCompletionMessageParam[], temperature: number): Promise<string> {
    let response;
    try {
      response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        response_format: { type: "json_object" },
        temperature,
      });
    } catch (err: any) {
      // Erro de rede/autenticação/rate-limit da OpenAI não deve vazar como
      // 500 genérico — vira AIGenerationError, que a rota mapeia pra uma
      // mensagem legível (section 34: nunca "Something went wrong").
      if (err?.status === 401) throw new AIGenerationError("Chave da OpenAI inválida ou não configurada. Verifique OPENAI_API_KEY.");
      if (err?.status === 429) throw new AIGenerationError("Limite de uso da OpenAI atingido. Tente novamente em instantes.");
      throw new AIGenerationError(`Falha ao chamar o modelo de IA: ${err?.message ?? String(err)}`);
    }
    const content = response.choices[0]?.message?.content;
    if (!content) throw new AIGenerationError("Empty response from model");
    return content;
  }

  async analyzeContent(params: { text: string; objective: string; audience: string; style: string }): Promise<ContentAnalysis> {
    const system =
      "Você é o Content Analyzer de um sistema de apresentações. Interprete o pedido do " +
      "usuário e extraia SÓ o que precisa ser dito — NÃO decida posicionamento, layout ou " +
      "template, isso é responsabilidade de outros componentes. Responda em JSON com: topic " +
      "(string), audience (string), tone (string), summary (string), keyPoints (lista de " +
      "strings), suggestedPurposes (lista de propósitos de seção em inglês snake_case, ex: " +
      "introduction, concept, risks, best_practices, conclusion — quantas fizerem sentido pro " +
      "conteúdo, sem forçar uma estrutura fixa).";
    const user = `Objetivo: ${params.objective}\nPúblico: ${params.audience}\nEstilo: ${params.style}\n\nConteúdo:\n${params.text}`;
    return this.callJson({ systemPrompt: system, userContent: user, schema: ContentAnalysisSchema });
  }

  async analyzeImages(params: { images: ImageInput[] }): Promise<ImageAnalysis[]> {
    const system =
      "Você analisa imagens pra uso em uma apresentação. Pra CADA imagem, identifique role " +
      "(hero_image, background, icon_source…), subject, orientation (landscape|portrait|" +
      "square), aspectRatio (ex: '16:9'), e focalPoint {x,y} fração 0-1 de onde está o " +
      "assunto principal (use {x:0.5,y:0.5} se não houver assunto claro). Preserve mediaId " +
      "exatamente como recebido. Responda em JSON com a chave 'items'.";
    const content: OpenAI.Chat.ChatCompletionContentPart[] = [
      { type: "text", text: JSON.stringify(params.images.map((i) => ({ mediaId: i.mediaId }))) },
    ];
    for (const img of params.images) {
      if (img.url) content.push({ type: "image_url", image_url: { url: img.url } });
    }
    const itemsSchema = z.object({ items: z.array(ImageAnalysisSchema) });
    const result = await this.callJson({ systemPrompt: system, userContent: content, schema: itemsSchema });
    return result.items;
  }

  async planPresentation(params: {
    contentAnalysis: ContentAnalysis;
    constraints: { minSlides: number; maxSlides: number };
  }): Promise<PresentationPlan> {
    const system =
      "Você é o Presentation Planner. Defina quantos slides a apresentação precisa, o " +
      "propósito de cada um, o tipo de conteúdo (text|image|data|mixed|list|quote|timeline) " +
      "e um ritmo visual — evite repetir o mesmo contentType em slides consecutivos sem " +
      "motivo. Respeite os limites min/max informados. Responda em JSON com: slideCount " +
      "(int), reasoning (string), sections (lista ordenada de {order, purpose, contentType, " +
      "estimatedImages, textDensity}).";
    const user = JSON.stringify({ contentAnalysis: params.contentAnalysis, constraints: params.constraints });
    return this.callJson({ systemPrompt: system, userContent: user, schema: PresentationPlanSchema });
  }

  async mapContentToSlots(params: {
    contentAnalysis: ContentAnalysis;
    section: { order: number; purpose: string; contentType: string };
    layout: import("../schemas/template").Layout;
    availableImages: ImageAnalysis[];
  }): Promise<ContentMap> {
    const system =
      "Você é o Content Mapper. Preencha os slots de UM layout específico com conteúdo real " +
      "da apresentação, respeitando o papel (role) e os limites (maxCharacters/maxLines) de " +
      "cada slot. NÃO invente slotId — use exclusivamente os IDs fornecidos em " +
      "availableSlotIds. Se um slot não tiver conteúdo adequado, deixe-o de fora do " +
      "resultado (nunca invente conteúdo genérico só pra preencher). Pra slots de imagem, " +
      "escreva um imageQuery descrevendo a imagem ideal (o casamento com uma imagem real " +
      "acontece em outra etapa). Pra slots kind=chart, use dataPoints (lista de {label, " +
      "value} com números REAIS extraídos do conteúdo — nunca invente números que não " +
      "estão no texto) e chartTitle. Pra slots kind=table, use tableRows (lista de listas " +
      "de string, primeira linha é o cabeçalho). Se não houver dado numérico real no " +
      "conteúdo pra um slot de chart/table, deixe-o de fora do resultado. Responda em JSON " +
      "com a chave 'slotAssignments': lista de {slotId, textValue?, imageQuery?, listItems?, " +
      "statValue?, chartTitle?, dataPoints?, tableRows?}.";
    const user = JSON.stringify({
      contentAnalysis: params.contentAnalysis,
      section: params.section,
      availableSlotIds: params.layout.slots.map((s) => s.id),
      slots: params.layout.slots.map((s) => ({ id: s.id, kind: s.kind, role: s.role, maxCharacters: s.maxCharacters, maxLines: s.maxLines })),
      availableImages: params.availableImages,
    });
    return this.callJson({ systemPrompt: system, userContent: user, schema: ContentMapSchema, temperature: 0.5 });
  }

  async planArtDirection(params: { contentAnalysis: ContentAnalysis; presentationPlan: PresentationPlan }): Promise<DesignDirection> {
    const system =
      "Você é o Art Director. NÃO desenhe o slide — defina a direção visual geral: style " +
      "(string livre, ex: premium_corporate), density (low|medium|high), imageTreatment " +
      "(string livre, ex: full_bleed, inset, duotone), textDensity (low|medium|high), " +
      "accentUsage (subtle|moderate|bold), e rationale explicando a escolha com base no " +
      "público e tom do conteúdo. Responda em JSON com exatamente essas chaves.";
    const user = JSON.stringify({ contentAnalysis: params.contentAnalysis, presentationPlan: params.presentationPlan });
    return this.callJson({ systemPrompt: system, userContent: user, schema: DesignDirectionSchema, temperature: 0.6 });
  }

  async editSlide(params: { slide: Record<string, unknown>; command: string }): Promise<EditCommandResult> {
    const system =
      "O usuário pediu uma alteração em linguagem natural num slide já composto. Altere só " +
      "o necessário — se o comando for 'troque a imagem', não altere título, cores, posição " +
      "ou tipografia a menos que seja necessário. Responda em JSON com: summary (string), " +
      "ops (lista de {action: set_text|replace_image|adjust_style|regenerate_content|" +
      "remove_element|add_element, slotId?, value?}).";
    const user = JSON.stringify({ slide: params.slide, command: params.command });
    return this.callJson({ systemPrompt: system, userContent: user, schema: EditCommandResultSchema });
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
