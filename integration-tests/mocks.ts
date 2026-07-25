import type { Mock } from 'vitest';

export function mockLlmResponse(mockChatComplete: Mock, content: string) {
  mockChatComplete.mockResolvedValue({
    content,
    model: 'test-model',
    finishReason: 'stop',
    usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    durationMs: 100,
  });
}

export function mockLlmJsonResponse(mockChatComplete: Mock, obj: unknown) {
  mockLlmResponse(mockChatComplete, JSON.stringify(obj, null, 2));
}
