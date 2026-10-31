// エージェントの指示文（prompts/）。docs/設計まとめ.md「エージェントの指示文」を一字一句そのまま置いてある（tests/agents.test.ts で確かめる）
// 媒体には「共通の指示」と自分の指示をつなげて渡す。戦略と確認は、必要な決まりを自分の指示文に書いてあるので、共通の指示は付けない

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AgentName } from "./schemas";

export const PROMPT_FILES: Record<AgentName, string> = {
  戦略: "strategy.txt",
  媒体: "media.txt",
  確認: "check.txt",
};

/** 共通の指示を前に付けるエージェント */
const WITH_COMMON: readonly AgentName[] = ["媒体"];

export function readPrompt(file: string): string {
  return readFileSync(path.join(process.cwd(), "prompts", file), "utf8").replace(/\r\n/g, "\n").trimEnd();
}

interface AgentPrompt {
  file: string;
  system: string;
  sha256: string;
}

/** 渡す指示文。sha256 は渡した指示文の中身（直したときに、どの版で動かしたか見分ける） */
export function agentPrompt(agent: AgentName): AgentPrompt {
  const file = PROMPT_FILES[agent];
  const system = WITH_COMMON.includes(agent) ? `${readPrompt("common.txt")}\n\n${readPrompt(file)}` : readPrompt(file);
  return { file, system, sha256: createHash("sha256").update(system).digest("hex") };
}
