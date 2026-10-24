"use client";

import ChoiceMenu from "@/components/ChoiceMenu";
import StdinPrompt from "@/components/StdinPrompt";
import Terminal from "@/components/Terminal";
import { useStory } from "@/hooks/useStory";

export default function Page() {
  const story = useStory();

  return (
    <Terminal
      lines={story.lines}
      cursor={story.cursor}
      effect={story.effect}
      onEffectEnd={story.onEffectEnd}
    >
      {story.pendingInput ? (
        <StdinPrompt
          prompt="投稿>"
          placeholder={story.pendingInput.placeholder}
          onSubmit={story.submitInput}
        />
      ) : story.pendingChoice ? (
        <ChoiceMenu
          prompt={story.pendingChoice.prompt}
          options={story.pendingChoice.options}
          onSelect={story.selectChoice}
        />
      ) : story.hint ? (
        <div className="dim flicker">{story.hint}</div>
      ) : null}
    </Terminal>
  );
}
