/**
 * 全局节奏配置。
 * 打字机速度是路演节奏的命门：太快没仪式感，太慢超时。90 秒演出建议 14~20ms/字。
 */
export const TYPE_SPEED_MS = 16; // 每个字符的揭示间隔
export const LINE_HOLD_MS = 110; // 一行打完后停留

/** 估算一段文本打完后所需时间（毫秒），剧情编排用它来 await */
export function typingDuration(text: string): number {
  return text.length * TYPE_SPEED_MS + LINE_HOLD_MS;
}

/** 估算一组行打完后的总时长 */
export function linesDuration(lines: { text: string; instant?: boolean }[]): number {
  return lines.reduce(
    (acc, l) => acc + (l.instant ? 40 : typingDuration(l.text)),
    0
  );
}

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 愿力解锁阈值 */
export const REWRITE_THRESHOLD = 40;
