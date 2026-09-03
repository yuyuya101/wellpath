/**
 * 本地大模型客户端（Ollama）。
 *
 * 设计原则（3.1 约束：模型不允许产出健康数值，只做自然语言个性化建议）：
 * - 只负责把已经算好的健康数值/画像转述给本地 Ollama，并返回自然语言建议；
 * - 线上（Netlify）访问不到用户本机的 127.0.0.1:11434，fetch 会立即失败，
 *   上层 insightService 据此回退到确定性规则建议，保证线上永不因此报错；
 * - 通过 OLLAMA_BASE_URL / OLLAMA_MODEL 环境变量可覆盖（默认本机 deepseek-r1:1.5b）。
 */

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'deepseek-r1:1.5b';

interface OllamaGenerateResponse {
  response?: string;
  model?: string;
}

export function ollamaConfig() {
  return {
    baseUrl: process.env.OLLAMA_BASE_URL ?? DEFAULT_BASE_URL,
    model: process.env.OLLAMA_MODEL ?? DEFAULT_MODEL,
  };
}

/**
 * 调用本地 Ollama /api/generate（非流式）。
 * 不可达、超时或非 2xx 都抛错，由上层决定是否回退。
 */
export async function askLocalOllama(prompt: string, timeoutMs = 40000): Promise<{ text: string; model: string }> {
  const { baseUrl, model } = ollamaConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature: 0.6, num_predict: 700 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ollama responded ${res.status}`);
    const data = (await res.json()) as OllamaGenerateResponse;
    // /api/generate 已把思考链放在 thinking 字段；这里再兜底剥离内联 <think>。
    const text = (data.response ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!text) throw new Error('ollama returned empty response');
    return { text, model: data.model ?? model };
  } finally {
    clearTimeout(timer);
  }
}

/** 把模型输出整理成去空、去序号、限量的建议条目；无法拆分时整体作为一条。 */
export function toTipList(raw: string, max = 6): string[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter((l) => l.length > 0);
  const tips = (lines.length > 1 ? lines : [raw.trim()]).slice(0, max);
  return tips.map((t) => t.replace(/\s+/g, ' '));
}
