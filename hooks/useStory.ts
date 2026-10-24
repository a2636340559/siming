"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChoiceOption } from "@/components/ChoiceMenu";
import { streamRewrite, streamVerdict } from "@/lib/ai";
import { REWRITE_THRESHOLD, TYPE_SPEED_MS, delay, linesDuration } from "@/lib/config";
import type { Choice, EffectName, TerminalLine, Tone } from "@/lib/types";
import { FALLBACK_VERDICT, MAIN, NARRATIVE, POOL, VIGNETTE } from "@/data/story";

interface PendingChoice {
  prompt: string;
  options: ChoiceOption[];
}

interface PendingInput {
  prompt: string;
  placeholder?: string;
}

type OutLine = Omit<TerminalLine, "id">;

/** 选择倾向 -> 颜色：善意暖色，恶意红色，中性白 */
const TONE_OF: Record<string, Tone> = {
  kind: "amber",
  cruel: "red",
  neutral: "white",
};

export function useStory() {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [effect, setEffect] = useState<EffectName>("none");
  const [cursor, setCursor] = useState(true);
  const [hint, setHint] = useState<string | null>(NARRATIVE.idle);
  const [pendingChoice, setPendingChoice] = useState<PendingChoice | null>(null);
  const [pendingInput, setPendingInput] = useState<PendingInput | null>(null);

  const seq = useRef(0);
  const booted = useRef(false);
  const resolveChoice = useRef<((id: string) => void) | null>(null);
  const resolveInput = useRef<((text: string) => void) | null>(null);
  const resolveStart = useRef<(() => void) | null>(null);
  const resolveEffect = useRef<(() => void) | null>(null);

  /* ---------------- 基础输出原语 ---------------- */

  const push = useCallback(async (out: OutLine[]) => {
    const ready = out.map((o) => ({ ...o, id: `l${seq.current++}` }));
    setLines((prev) => [...prev, ...ready]);
    await delay(linesDuration(ready));
  }, []);

  const waitEffect = useCallback((name: EffectName) => {
    setEffect(name);
    return new Promise<void>((res) => {
      resolveEffect.current = res;
    });
  }, []);

  const onEffectEnd = useCallback(() => {
    setEffect("none");
    const r = resolveEffect.current;
    resolveEffect.current = null;
    r?.();
  }, []);

  const askChoice = useCallback((prompt: string, options: ChoiceOption[]) => {
    setPendingChoice({ prompt, options });
    return new Promise<string>((res) => {
      resolveChoice.current = res;
    });
  }, []);

  const selectChoice = useCallback((id: string) => {
    setPendingChoice(null);
    const r = resolveChoice.current;
    resolveChoice.current = null;
    r?.(id);
  }, []);

  const askInput = useCallback((prompt: string, placeholder?: string) => {
    setPendingInput({ prompt, placeholder });
    return new Promise<string>((res) => {
      resolveInput.current = res;
    });
  }, []);

  const submitInput = useCallback((text: string) => {
    setPendingInput(null);
    const r = resolveInput.current;
    resolveInput.current = null;
    r?.(text);
  }, []);

  /* ---------------- 流式输出一行（AI 补写 / 兜底） ---------------- */

  const streamLine = useCallback(
    async (
      tone: Tone,
      run: (onChunk: (t: string) => void) => Promise<boolean>,
      fallbackText: string
    ) => {
      const id = `l${seq.current++}`;
      const startedAt = Date.now();
      let acc = "";

      setLines((prev) => [...prev, { id, text: "", tone }]);

      const ok = await run((t) => {
        acc += t;
        setLines((prev) => prev.map((l) => (l.id === id ? { ...l, text: acc } : l)));
      });

      if (!ok || acc.trim().length === 0) {
        acc = fallbackText;
        setLines((prev) =>
          prev.map((l) => (l.id === id ? { ...l, text: fallbackText, tone: "dim" } : l))
        );
      }

      // 等打字机把已到达的字符追平
      const backlog = acc.length * TYPE_SPEED_MS - (Date.now() - startedAt);
      await delay(Math.max(200, backlog) + 260);
    },
    []
  );

  /* ---------------- 主流程 ---------------- */

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    void (async () => {
      /* 1. 开机自检 */
      await push(
        NARRATIVE.boot.map((t, i) => ({
          text: t,
          tone: i === NARRATIVE.boot.length - 1 ? ("amber" as Tone) : ("dim" as Tone),
          instant: i < 3,
        }))
      );

      setHint(null);
      await push([{ text: "", instant: true }]);
      await push([{ text: NARRATIVE.greeting, tone: "white" }]);

      /* 2. 等主持人在台上按键启动 */
      setCursor(true);
      setHint(NARRATIVE.idle);
      await new Promise<void>((res) => {
        resolveStart.current = res;
      });
      setHint(null);

      /* 3. 列出回收池 */
      await push([{ text: "", instant: true }]);
      await push([{ text: NARRATIVE.poolCmd, tone: "white" }]);
      await push([{ text: NARRATIVE.poolTotal, tone: "dim" }]);
      await push(
        POOL.map((bh) => ({
          text: `${bh.meta}  ${bh.fileName}${bh.locked ? "   ⚠ 权限不足" : ""}`,
          tone: (bh.locked ? "red" : "green") as Tone,
        }))
      );
      await push([{ text: NARRATIVE.poolNote, tone: "white" }]);

      /* 4. 选一条打开（锁定项循环拒绝） */
      let opened = "";
      while (opened !== MAIN.id) {
        const pick = await askChoice(
          "打开哪一条？",
          POOL.map((bh) => ({
            id: bh.id,
            label: bh.fileName,
            hint: bh.locked ? "⚠ 权限不足" : bh.summary,
            tone: bh.locked ? "cruel" : "neutral",
          }))
        );
        const target = POOL.find((b) => b.id === pick);
        if (!target || target.locked) {
          await push([{ text: "司命：这一页尚未解锁。此刻的你，还推不开它。", tone: "red" }]);
          continue;
        }
        opened = target.id;
      }

      /* 5. 解析关键节点 */
      await push([{ text: "", instant: true }]);
      await push([{ text: NARRATIVE.openCmd, tone: "white" }]);
      await push([{ text: NARRATIVE.parseCmd, tone: "dim" }]);
      await push(NARRATIVE.timeline.map((t) => ({ text: t, tone: "amber" as Tone })));
      await push([{ text: NARRATIVE.timelineNote, tone: "white" }]);

      /* 6. 插曲：阿哲的黑历史（预置演出，不调 AI） */
      let willpower = 0;
      let kindCount = 0;
      let cruelCount = 0;
      const history: string[] = [];
      let azheFriend = false;

      await push([{ text: "", instant: true }]);
      await push([{ text: "", instant: true }]);
      await push([{ text: NARRATIVE.vignetteHead, tone: "amber" }]);
      await push([{ text: `[${VIGNETTE.from}] 向你投递了一条黑历史`, tone: "dim" }]);
      await push([
        { text: `  ${VIGNETTE.entryDate}  ${VIGNETTE.entryTitle}`, tone: "green" },
      ]);

      const vzPick = await askChoice(
        `愿力 ${willpower} · ${VIGNETTE.prompt}`,
        VIGNETTE.choices.map((c) => toOption(c))
      );
      const vz = VIGNETTE.choices.find((c) => c.id === vzPick)!;
      willpower += vz.willpower ?? 0;
      if (vz.tone === "kind") kindCount++;
      else if (vz.tone === "cruel") cruelCount++;
      azheFriend = vz.tone === "kind";
      history.push(`插曲：面对阿哲的黑历史，你选择了「${vz.label}」`);

      await push(
        (azheFriend ? VIGNETTE.result.kind : VIGNETTE.result.cruel).map((t) => ({
          text: t,
          tone: (azheFriend ? "amber" : "red") as Tone,
        }))
      );
      await push([
        {
          text: `愿力 ${willpower >= 0 ? "+" : ""}${willpower} · 当前 ${willpower}`,
          tone: "dim",
        },
      ]);
      await push([{ text: NARRATIVE.backToMain, tone: "white" }]);

      /* 7. 主线三个关键节点 */
      for (const node of MAIN.nodes) {
        await push([{ text: "", instant: true }]);
        await push([{ text: `—— ${node.title} ——`, tone: "amber" }]);
        await push(node.scene.map((t) => ({ text: t, tone: "green" as Tone })));

        /* 高潮节点：愿力检定 + 阿哲登场 */
        if (node.climax) {
          if (willpower >= (node.requiresWillpower ?? 0)) {
            await push([
              { text: NARRATIVE.climaxOk, tone: "white" },
              {
                text: `愿力 ${willpower}/${node.requiresWillpower} · 授权通过`,
                tone: "green",
              },
            ]);
          } else {
            await push([
              { text: NARRATIVE.climaxLow, tone: "red" },
              { text: `需要愿力 ${node.requiresWillpower}，你有 ${willpower}。`, tone: "dim" },
            ]);
          }
          await delay(320);
          await push([
            {
              text: azheFriend ? NARRATIVE.azheHelp : NARRATIVE.azheHurt,
              tone: azheFriend ? "amber" : "red",
            },
          ]);
        }

        const pick = await askChoice(
          `愿力 ${willpower} · 阈值 ${REWRITE_THRESHOLD} · ${node.title} — 你怎么选？`,
          node.choices.map((c) => toOption(c))
        );
        const choice = node.choices.find((c) => c.id === pick)!;
        willpower += choice.willpower ?? 0;
        if (choice.tone === "kind") kindCount++;
        else if (choice.tone === "cruel") cruelCount++;
        history.push(`《${node.title}》：你选择了「${choice.label}」`);

        await streamLine(
          TONE_OF[choice.tone] ?? "green",
          (onChunk) =>
            streamRewrite(
              {
                blackHistory: MAIN.fileName,
                node: node.title,
                choice: choice.label,
                tone: choice.tone,
                history,
              },
              onChunk
            ),
          choice.fallback
        );

        await push([
          {
            text: `愿力 ${choice.willpower && choice.willpower > 0 ? "+" : ""}${choice.willpower ?? 0} · 当前 ${willpower}`,
            tone: "dim",
          },
        ]);
      }

      /* 8. 结算 */
      await push([{ text: "", instant: true }]);
      await push([{ text: NARRATIVE.settleCmd, tone: "white" }]);
      await push([{ text: NARRATIVE.settleHead, tone: "white" }]);
      await push([
        { text: `  善意选择 ${kindCount} 次   恶意选择 ${cruelCount} 次`, tone: "green" },
        { text: `  愿力结余 ${willpower}`, tone: "dim" },
      ]);

      const positive = kindCount > cruelCount;
      await streamLine(
        positive ? "amber" : "white",
        (onChunk) =>
          streamVerdict(
            { kind: kindCount, cruel: cruelCount, history },
            onChunk
          ),
        positive ? FALLBACK_VERDICT.good : FALLBACK_VERDICT.bad
      );

      /* 9. 删不掉的名场面 */
      await push([{ text: "", instant: true }]);
      await push([{ text: NARRATIVE.deleteAsk, tone: "white" }]);
      const del = await askChoice("这一步不可逆。", [
        { id: "del", label: "永久删除这条黑历史", hint: "rm -rf", tone: "cruel" },
        { id: "keep", label: "算了，留着吧", hint: "保留", tone: "neutral" },
      ]);

      if (del === "del") {
        await waitEffect("glitch");
        await push([{ text: NARRATIVE.deleteCmd, tone: "white" }]);
        await push([{ text: NARRATIVE.deleteStep, tone: "green" }]);
        await delay(260);
        await push([{ text: NARRATIVE.deleteDone, tone: "green" }]);
        await delay(520);
        await push([
          { text: NARRATIVE.deleteSector, tone: "dim" },
          { text: NARRATIVE.deleteRecover, tone: "dim" },
        ]);
        await waitEffect("flash");
        await waitEffect("shake");
        await push([
          { text: NARRATIVE.deleteRestored, tone: "red" },
          { text: `${MAIN.meta}  ${MAIN.fileName}`, tone: "red" },
        ]);
        await push([{ text: NARRATIVE.deleteLine, tone: "white" }]);
      } else {
        await push([{ text: "司命：那就留着。有些东西，留着比抹去更合适。", tone: "white" }]);
      }

      /* 10. 彩蛋：现场投稿 */
      await push([{ text: "", instant: true }]);
      await push([{ text: NARRATIVE.submitHead, tone: "amber" }]);
      await push([{ text: NARRATIVE.submitFrom, tone: "dim" }]);
      await push([{ text: NARRATIVE.submitAsk, tone: "white" }]);

      const text = await askInput("投稿>", NARRATIVE.submitPlaceholder);
      await push([{ text: `-rw-r--r--  you   4.2K  刚刚   ${text}`, tone: "white" }]);
      await streamLine(
        "amber",
        (onChunk) =>
          streamRewrite(
            {
              blackHistory: text,
              node: "刚刚投递",
              choice: "把这条黑历史交出来，交给司命看一眼",
              tone: "neutral",
              history: [],
            },
            onChunk
          ),
        "司命：已归档。这一条，命运暂为你保管。"
      );

      /* 11. 结束 */
      await push([{ text: "", instant: true }]);
      await push(NARRATIVE.ending.map((t) => ({ text: t, tone: "white" as Tone })));
      setCursor(true);
      setHint(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* 启动闸门：任意键开始 */
  useEffect(() => {
    const onKey = () => {
      const r = resolveStart.current;
      resolveStart.current = null;
      r?.();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onKey);
    };
  }, []);

  return {
    lines,
    cursor,
    effect,
    hint,
    pendingChoice,
    pendingInput,
    onEffectEnd,
    selectChoice,
    submitInput,
  };
}

function toOption(c: Choice): ChoiceOption {
  return { id: c.id, label: c.label, hint: c.hint, tone: c.tone };
}
