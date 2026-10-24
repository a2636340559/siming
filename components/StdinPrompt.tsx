"use client";

import { useState } from "react";
import type * as React from "react";

interface StdinPromptProps {
  /** 提示符，如 "投稿>" */
  prompt: string;
  placeholder?: string;
  onSubmit: (text: string) => void;
  autoFocus?: boolean;
}

export default function StdinPrompt({
  prompt,
  placeholder,
  onSubmit,
  autoFocus = true,
}: StdinPromptProps): React.JSX.Element {
  const [value, setValue] = useState("");

  // Enter 提交：去掉首尾空格，空值不提交
  function handleKeydown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    const text = value.trim();
    if (!text) return;
    onSubmit(text);
    setValue("");
  }

  return (
    <div className="stdin">
      <span className="caret">{prompt}</span>
      <input
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeydown}
      />
    </div>
  );
}
