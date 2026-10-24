"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type * as React from "react";
import type { EffectName, TerminalLine, Tone } from "@/lib/types";
import { TYPE_SPEED_MS } from "@/lib/config";

interface TerminalProps {
  lines: TerminalLine[];
  /** 底部自定义区域（选择菜单 / 输入框会塞进来） */
  children?: React.ReactNode;
  /** 是否在底部显示闪烁光标 */
  cursor?: boolean;
  /** 一次性特效；undefined 或 "none" 表示无 */
  effect?: EffectName;
  /** 特效播放结束后回调（父组件据此清空 effect） */
  onEffectEnd?: () => void;
  className?: string;
}

// 特效固定时长（毫秒），与 globals.css 动画节奏对齐
const EFFECT_DURATION_MS: Record<"flash" | "glitch" | "shake", number> = {
  flash: 450,
  glitch: 750,
  shake: 400,
};

// Tone 语义色映射到全局类名，默认 green
function toneClass(tone?: Tone): string {
  switch (tone) {
    case "amber":
      return "tone-amber";
    case "red":
      return "tone-red";
    case "dim":
      return "tone-dim";
    case "white":
      return "tone-white";
    default:
      return "tone-green";
  }
}

export default function Terminal({
  lines,
  children,
  cursor,
  effect,
  onEffectEnd,
  className,
}: TerminalProps): React.JSX.Element {
  // 逐行已揭示的字符数（key = line.id）
  const [revealed, setRevealed] = useState<Record<string, number>>({});
  const bodyRef = useRef<HTMLDivElement>(null);
  const onEffectEndRef = useRef(onEffectEnd);

  // 用 ref 持有回调，避免父组件重渲染时特效定时器被反复重启
  useEffect(() => {
    onEffectEndRef.current = onEffectEnd;
  }, [onEffectEnd]);

  // 清理已消失行的进度；lines 清空时整体重置，保证新一轮从 0 开始
  useEffect(() => {
    setRevealed((prev) => {
      if (lines.length === 0) {
        return Object.keys(prev).length === 0 ? prev : {};
      }
      let changed = false;
      const next: Record<string, number> = {};
      for (const line of lines) {
        const cur = prev[line.id];
        if (cur === undefined) continue;
        const clamped = cur > line.text.length ? line.text.length : cur;
        next[line.id] = clamped;
        if (clamped !== cur) changed = true;
      }
      if (!changed && Object.keys(prev).length !== Object.keys(next).length) {
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [lines]);

  // 串行打字机：始终只推进最靠前、尚未打完的非 instant 行
  useEffect(() => {
    const activeIndex = lines.findIndex(
      (line) => !line.instant && (revealed[line.id] ?? 0) < line.text.length
    );
    if (activeIndex === -1) return;
    const line = lines[activeIndex];
    const timer = setTimeout(() => {
      setRevealed((prev) => {
        const cur = prev[line.id] ?? 0;
        if (cur >= line.text.length) return prev;
        return { ...prev, [line.id]: cur + 1 };
      });
    }, TYPE_SPEED_MS);
    return () => clearTimeout(timer);
  }, [lines, revealed]);

  // 每次内容变化后自动滚到底部
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  // 一次性特效：设定固定时长后回调，"clear" 立即回调
  useEffect(() => {
    if (!effect || effect === "none") return;
    if (effect === "clear") {
      onEffectEndRef.current?.();
      return;
    }
    const timer = setTimeout(() => {
      onEffectEndRef.current?.();
    }, EFFECT_DURATION_MS[effect]);
    return () => clearTimeout(timer);
  }, [effect]);

  const activeIndex = lines.findIndex(
    (line) => !line.instant && (revealed[line.id] ?? 0) < line.text.length
  );
  const allDone = activeIndex === -1;

  const shellClass = [
    "shell",
    effect === "glitch" ? "glitch" : "",
    effect === "shake" ? "shake" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClass}>
      <div className="term-head">
        <span className="dot" />
        <span>司命 v0.1 · 命运回收池</span>
        <span className="dim" style={{ marginLeft: "auto" }}>
          SESSION: 001
        </span>
      </div>

      <div className="term-body" ref={bodyRef}>
        {lines.map((line, index) => {
          const shown = line.instant
            ? line.text
            : line.text.slice(0, revealed[line.id] ?? 0);
          const showCursor =
            index === activeIndex ||
            (allDone && cursor === true && index === lines.length - 1);
          const gaps = line.gapBefore ?? 0;
          return (
            <Fragment key={line.id}>
              {Array.from({ length: gaps }).map((_, g) => (
                <div key={`${line.id}-gap-${g}`} className="line">
                  {"\u00a0"}
                </div>
              ))}
              <div className={`line ${toneClass(line.tone)}`}>
                {line.prefix ? <span className="prefix">{line.prefix}</span> : null}
                <span>{shown}</span>
                {showCursor ? <span className="cursor" /> : null}
              </div>
            </Fragment>
          );
        })}
      </div>

      <div className="term-foot">{children}</div>

      {effect === "flash" ? <div className="flash" /> : null}
    </div>
  );
}
