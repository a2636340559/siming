/**
 * lib/ai.ts —— 前端侧的流式调用封装。
 * 被 'use client' 页面使用：把打字机的 onChunk 接到 /api/rewrite 的文本流上。
 *
 * 返回值语义（调用方据此决定是否使用预置兜底文案）：
 *   true  —— 成功收到任意内容并已回调
 *   false —— 网络错误 / 非 2xx / 超时 / 一个字符都没收到
 * 函数内部一律不抛异常。
 */

import type { AiEnvelope, RewriteRequest, VerdictRequest } from "./types";

/** 默认超时（毫秒）：路演节奏下不能让观众干等 */
const DEFAULT_TIMEOUT_MS = 15_000;

/** 收到文本片段时的回调 */
type ChunkHandler = (text: string) => void;

/**
 * 私有 helper：把信封 POST 到 /api/rewrite，边读边回调。
 * streamRewrite / streamVerdict 共用这段解析逻辑。
 */
async function streamEnvelope(
  envelope: AiEnvelope,
  onChunk: ChunkHandler,
  signal?: AbortSignal
): Promise<boolean> {
  // 用内部 controller 组合「外部 signal」与「超时」
  const controller = new AbortController();
  const abortFromOutside = (): void => controller.abort();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", abortFromOutside);
    }
  }

  let received = false;
  try {
    const res = await fetch("/api/rewrite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) return false;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        const text = decoder.decode(value, { stream: true });
        if (text.length > 0) {
          received = true;
          onChunk(text);
        }
      }

      // 冲洗解码器中残留的多字节字符
      const tail = decoder.decode();
      if (tail.length > 0) {
        received = true;
        onChunk(tail);
      }
    } finally {
      reader.releaseLock();
    }

    return received;
  } catch {
    // 网络错误 / 非 2xx / 超时 / abort 统一返回 false
    return false;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", abortFromOutside);
  }
}

/** 命运补写：流式生成，逐段回调 */
export async function streamRewrite(
  req: RewriteRequest,
  onChunk: ChunkHandler,
  signal?: AbortSignal
): Promise<boolean> {
  return streamEnvelope({ mode: "rewrite", payload: req }, onChunk, signal);
}

/** 结算评语：流式生成，逐段回调 */
export async function streamVerdict(
  req: VerdictRequest,
  onChunk: ChunkHandler,
  signal?: AbortSignal
): Promise<boolean> {
  return streamEnvelope({ mode: "verdict", payload: req }, onChunk, signal);
}
