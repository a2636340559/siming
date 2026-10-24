/**
 * 司命 · 共享类型契约
 * M1（终端 UI）、M2（AI 服务）、M3（剧情内核）都依赖这里的定义，不要随意改动。
 */

/** 终端行的颜色语义：善意用 amber，恶意用 red，系统用 green */
export type Tone = "green" | "amber" | "red" | "dim" | "white";

/** 一行终端输出 */
export interface TerminalLine {
  /** 唯一 id，用于打字机去重 */
  id: string;
  /** 行内容 */
  text: string;
  /** 颜色语义，默认 green */
  tone?: Tone;
  /** 行前缀，如 "司命：" */
  prefix?: string;
  /** 跳过逐字动画，整行瞬间出现 */
  instant?: boolean;
  /** 行前插入的空行数 */
  gapBefore?: number;
}

/** 选择的道德倾向 */
export type ChoiceTone = "kind" | "cruel" | "neutral";

/** 关键节点的一个选项 */
export interface Choice {
  id: string;
  label: string;
  hint?: string;
  tone: ChoiceTone;
  /** AI 不可用 / 超时时使用的兜底补写文案 */
  fallback: string;
  /** 该选择带来的愿力增量 */
  willpower?: number;
  /** 该选择写入的标记 */
  flag?: string;
}

/** 黑历史中的一个关键节点 */
export interface StoryNode {
  id: string;
  title: string;
  /** 场景叙述，多行 */
  scene: string[];
  choices: Choice[];
  /** 是否为高潮节点（需要愿力解锁"改写"） */
  climax?: boolean;
  /** 进入该节点所需的愿力 */
  requiresWillpower?: number;
}

/** 一条黑历史 */
export interface BlackHistory {
  id: string;
  /** 文件系统风格的文件名 */
  fileName: string;
  /** ls -la 的元信息列（权限 / 大小 / 日期） */
  meta: string;
  /** 权限不足（不可打开，纯展示彩蛋） */
  locked?: boolean;
  /** 一句话摘要 */
  summary: string;
  /** 关键节点 */
  nodes: StoryNode[];
}

/** AI 补写请求体（前端 -> /api/rewrite） */
export interface RewriteRequest {
  /** 黑历史标题 */
  blackHistory: string;
  /** 当前节点标题 */
  node: string;
  /** 玩家所选选项文案 */
  choice: string;
  /** 选择倾向 */
  tone: ChoiceTone;
  /** 之前节点产生的走向摘要 */
  history: string[];
}

/** 结局评语生成请求体 */
export interface VerdictRequest {
  /** 善意选择次数 */
  kind: number;
  /** 恶意选择次数 */
  cruel: number;
  /** 玩家做过的关键选择摘要 */
  history: string[];
}

/** /api/rewrite 的请求信封 */
export type AiEnvelope =
  | { mode: "rewrite"; payload: RewriteRequest }
  | { mode: "verdict"; payload: VerdictRequest };

/** 结算评价 */
export interface Verdict {
  kind: number;
  cruel: number;
  title: string;
  comment: string;
}

/** 终端特效名 */
export type EffectName = "flash" | "glitch" | "shake" | "clear" | "none";
