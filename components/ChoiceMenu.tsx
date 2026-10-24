"use client";

import { useEffect, useState } from "react";
import type * as React from "react";
import type { ChoiceTone } from "@/lib/types";

export interface ChoiceOption {
  id: string;
  label: string;
  hint?: string;
  tone?: ChoiceTone;
}

interface ChoiceMenuProps {
  prompt: string;
  options: ChoiceOption[];
  onSelect: (id: string) => void;
}

export default function ChoiceMenu({
  prompt,
  options,
  onSelect,
}: ChoiceMenuProps): React.JSX.Element {
  const [active, setActive] = useState(0);

  // 选项集合变化时（id 序列不同）重置高亮到第一项
  const optionsKey = options.map((o) => o.id).join("|");
  useEffect(() => {
    setActive(0);
  }, [optionsKey]);

  // 选项数量收缩时把越界的高亮拉回范围内
  useEffect(() => {
    setActive((a) => (a < options.length ? a : 0));
  }, [options.length]);

  // 全局键盘：上下左右循环移动、Enter 确认、数字键直选
  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (options.length === 0) return;
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        setActive((a) => (a - 1 + options.length) % options.length);
      } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        setActive((a) => (a + 1) % options.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const current = options[active];
        if (current) onSelect(current.id);
      } else if (/^[1-9]$/.test(event.key)) {
        const target = options[Number(event.key) - 1];
        if (target) {
          event.preventDefault();
          onSelect(target.id);
        }
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [options, active, onSelect]);

  return (
    <div className="menu">
      <div className="menu-prompt">{prompt}</div>
      {options.map((option, index) => {
        const toneCls =
          option.tone === "kind"
            ? "tone-kind"
            : option.tone === "cruel"
              ? "tone-cruel"
              : "";
        const itemClass = ["menu-item", toneCls, index === active ? "is-active" : ""]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={option.id}
            type="button"
            className={itemClass}
            onMouseEnter={() => setActive(index)}
            onClick={() => onSelect(option.id)}
          >
            <span className="key">[{index + 1}]</span> {option.label}
            {option.hint ? <span className="hint">{option.hint}</span> : null}
          </button>
        );
      })}
      <div className="menu-foot">[ ↑↓ 选择 · Enter 确认 · 数字键直选 ]</div>
    </div>
  );
}
