export interface AiResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: string;
  latencyMs: number;
}

export interface AiProvider {
  name: string;
  ask(
    systemPrompt: string,
    userMessage: string,
    options?: { maxTokens?: number; model?: string },
  ): Promise<AiResponse>;
  askWithImage(
    systemPrompt: string,
    imageBase64: string,
    userMessage: string,
    options?: { maxTokens?: number; model?: string; mediaType?: string },
  ): Promise<AiResponse>;
  compareImages(
    systemPrompt: string,
    img1Base64: string,
    img2Base64: string,
    userMessage: string,
    options?: { maxTokens?: number; model?: string },
  ): Promise<AiResponse>;
}
