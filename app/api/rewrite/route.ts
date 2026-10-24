/**
 * /api/rewrite —— 司命 AI 服务的流式入口。
 *
 * 前端 POST 一个 AiEnvelope：
 *   { mode: "rewrite" | "verdict", payload: RewriteRequest | VerdictRequest }
 * 服务端把它转成 DeepSeek 的 chat/completions 请求（stream: true），
 * 再把上游的 SSE 流解析成纯文本流回给前端，逐字驱动打字机。
 *
 * 这里只做"管道"，不做任何兜底文案——兜底由前端负责。
 */

import { buildRewriteMessages, buildVerdictMessages } from "@/lib/prompts";
import type { AiEnvelope, RewriteRequest, VerdictRequest } from "@/lib/types";

export const runtime = "nodejs";

/** 上游默认地址（可由 .env.local 覆盖） */
const DEFAULT_BASE_URL = "https://api.deepseek.com";
/** 上游默认模型（可由 .env.local 覆盖） */
const DEFAULT_MODEL = "deepseek-chat";

/** 统一的 JSON 错误响应 */
function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/** unknown 收窄：是否为普通对象 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 校验 RewriteRequest 的关键字段，避免下游构造 prompt 时崩溃 */
function isRewriteRequest(value: unknown): value is RewriteRequest {
  if (!isRecord(value)) return false;
  return (
    typeof value.blackHistory === "string" &&
    typeof value.node === "string" &&
    typeof value.choice === "string" &&
    (value.tone === "kind" || value.tone === "cruel" || value.tone === "neutral") &&
    Array.isArray(value.history) &&
    value.history.every((item) => typeof item === "string")
  );
}

/** 校验 VerdictRequest 的关键字段 */
function isVerdictRequest(value: unknown): value is VerdictRequest {
  if (!isRecord(value)) return false;
  return (
    typeof value.kind === "number" &&
    typeof value.cruel === "number" &&
    Array.isArray(value.history) &&
    value.history.every((item) => typeof item === "string")
  );
}

/** 校验请求信封 AiEnvelope */
function isAiEnvelope(value: unknown): value is AiEnvelope {
  if (!isRecord(value)) return false;
  if (value.mode === "rewrite") return isRewriteRequest(value.payload);
  if (value.mode === "verdict") return isVerdictRequest(value.payload);
  return false;
}

/** 是否为 SSE 的结束标记 `data: [DONE]` */
function isDoneLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "data: [DONE]" || trimmed === "data:[DONE]";
}

/**
 * 解析单条 SSE 行，抽出 `choices[0].delta.content`。
 * 非数据行 / 无增量内容 / 解析失败统一返回 null。
 */
function parseStreamLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;

  const payload = trimmed.slice(5).trim();
  if (!payload || payload === "[DONE]") return null;

  try {
    const parsed: unknown = JSON.parse(payload);
    if (!isRecord(parsed)) return null;

    const choices = parsed.choices;
    if (!Array.isArray(choices) || choices.length === 0) return null;

    const first = choices[0];
    if (!isRecord(first)) return null;

    const delta = first.delta;
    if (!isRecord(delta)) return null;

    const content = delta.content;
    return typeof content === "string" && content.length > 0 ? content : null;
  } catch {
    // 半包 / 非法 JSON：跳过，等下一段
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  // 1. 解析并校验请求体
  let envelope: AiEnvelope;
  try {
    const body: unknown = await request.json();
    if (!isAiEnvelope(body)) return jsonError(400, "请求体非法：不是合法的 AiEnvelope");
    envelope = body;
  } catch {
    return jsonError(400, "请求体非法：无法解析为 JSON");
  }

  // 2. 检查密钥，未配置则让前端走兜底
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return jsonError(503, "AI 服务未配置（缺少 DEEPSEEK_API_KEY）");
  }

  // 3. 按模式构造 messages
  const messages =
    envelope.mode === "rewrite"
      ? buildRewriteMessages(envelope.payload)
      : buildVerdictMessages(envelope.payload);

  const baseUrl = (process.env.DEEPSEEK_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL;

  // 4. 请求上游（流式）
  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: 0.9,
        max_tokens: 400,
        messages,
      }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "未知错误";
    return jsonError(502, `无法连接 AI 上游：${detail}`);
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return jsonError(502, `上游返回 ${upstream.status}：${text.slice(0, 500)}`);
  }
  if (!upstream.body) {
    return jsonError(502, "上游未返回数据流");
  }

  // 5. 把上游 SSE 流转成纯文本流
  const upstreamBody = upstream.body;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstreamBody.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer = "";
      let finished = false;

      // 处理一批完整行；遇到 [DONE] 置 finished
      const flushLines = (lines: string[]): void => {
        for (const line of lines) {
          if (isDoneLine(line)) {
            finished = true;
            return;
          }
          const content = parseStreamLine(line);
          if (content) controller.enqueue(encoder.encode(content));
        }
      };

      try {
        while (!finished) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // 最后一段可能是半包，留到下一轮
          flushLines(lines);
        }

        // 流结束：冲洗解码器，并处理没有以换行结尾的残余 buffer
        buffer += decoder.decode();
        if (!finished && buffer.length > 0) {
          flushLines([buffer]);
        }
      } catch {
        // 上游读取异常：忽略，正常 close，避免前端挂死
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
