/**
 * 「司命」提示词构造。
 * 纯函数，不依赖网络 / 环境变量，方便单测与复用。
 * 「司命」人设是这段 demo 的灵魂：执掌命运的神，看过太多人的一生，
 * 因此不惊讶、不评判、不动怒、也不亲近——只有平静的见证。
 */

import type { ChoiceTone, RewriteRequest, VerdictRequest } from "./types";

/** 一条对话消息（对齐 OpenAI / DeepSeek Chat Completions 格式） */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 选择倾向 -> 中文标签，用于 user message 里的人类可读描述 */
const TONE_LABEL: Record<ChoiceTone, string> = {
  kind: "善意",
  cruel: "恶意",
  neutral: "中性",
};

/** 补写时按倾向追加的语气约束（都保持神性的平视，不夸不贬） */
const REWRITE_TONE_RULES: Record<ChoiceTone, string> = {
  kind: "语气要求：平静里透出一点微光。不夸奖，不煽情，也不替当事人感慨；只如实写出这一步落在了哪里，让那件事本身显出分量。",
  cruel:
    "语气要求：平静地陈述因果，不带责备，也不冷嘲。写出这一步之后事情如何发展，像一个已经看过结局的人在复述，让后果自己说话。",
  neutral: "语气要求：平静地叙述，克制，留白，不评判，不煽情。",
};

/** 把走向摘要渲染成逐条文本，为空时给出占位 */
function formatHistory(history: string[]): string {
  if (!history || history.length === 0) return "（无）";
  return history.map((item) => `- ${item}`).join("\n");
}

/**
 * 构造「命运补写」的 messages。
 * 场景：玩家在黑历史的关键节点做出选择，司命补写"这个选择之后，命运如何发展"。
 */
export function buildRewriteMessages(req: RewriteRequest): ChatMessage[] {
  const system = [
    '你是"司命"，执掌命运的神，也是这间"命运回收站"的守门人。',
    "你看过太多人的一生，所以不惊讶、不评判、不动怒，也不与人亲近。你是这些往事唯一的见证者。",
    "你说话平静、克制、有分量，像在陈述一条早已写定的规律。你不是朋友，也不是审判者，只是那本账的保管人。",
    "",
    '现在，用户在一段黑历史的关键节点上做出了选择，你要替他补写"这个选择之后，命运如何发展"。',
    "",
    "【输出硬约束】",
    "- 只输出命运补写的正文，长度控制在 80~140 个汉字。",
    '- 不要标题，不要引号，不要 markdown，不要"命运补写："之类的任何前缀，不要解释你在做什么，不要分点罗列。',
    '- 视角使用第二人称"你"。',
    "- 必须具体、有画面感：写出时间、场景、动作、对白碎片，像一段真真切切发生过的小事。",
    "- 严禁空泛的鸡汤、排比句和总结陈词。",
    "- 不调侃，不讽刺，不亲昵，不说教，不给当事人下道德判断。",
    "",
    REWRITE_TONE_RULES[req.tone],
  ].join("\n");

  const user = [
    `黑历史：《${req.blackHistory}》`,
    `当前节点：${req.node}`,
    `玩家的选择：${req.choice}`,
    `选择倾向：${TONE_LABEL[req.tone]}`,
    "之前的走向：",
    formatHistory(req.history),
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * 构造「结算评语」的 messages。
 * 场景：一整段黑历史结束，司命给出最后一句评语（路演爆点）。
 */
export function buildVerdictMessages(req: VerdictRequest): ChatMessage[] {
  const system = [
    '你是"司命"，执掌命运的神，也是这间"命运回收站"的守门人。',
    "你看过太多人的一生，所以不惊讶、不评判、不动怒，也不与人亲近。你说话平静、克制、有分量。",
    "现在到了结算时刻，你要给这个人一整段黑历史，下最后一句评语。",
    "",
    "【输出硬约束】",
    "- 只输出 30~70 个汉字的评语。",
    "- 不要标题，不要引号，不要 markdown，不要任何前缀，不要解释。",
    "",
    "【情绪设计（关键，务必遵守）】",
    "- 通篇不批判、不说教、不调侃、不亲昵，也不刻意安慰。",
    "- 若善意的选择多于恶意：可以给一句微微明亮的收束，但仍要保持克制，只陈述事实。",
    '- 若恶意的选择多于或等于善意：不做审判，只平静地陈述"这条路他也走过，并从中得到了什么、看清了什么"。落点不悲凉，也不强行温暖。',
    "- 结尾要有重量，像在命运簿上盖下一枚印，而不是拍一下肩膀。",
  ].join("\n");

  const user = [
    `善意选择次数：${req.kind}`,
    `恶意选择次数：${req.cruel}`,
    "他做过的关键选择：",
    formatHistory(req.history),
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
