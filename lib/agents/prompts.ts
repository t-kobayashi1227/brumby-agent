// エージェントの指示文（prompts/）。docs/設計まとめ.md「エージェントの指示文」を一字一句そのまま置いてある（tests/prompts.test.ts で確かめる）
// 各エージェントには「共通の指示」と自分の指示をつなげて渡す。作り直しの依頼文（rebuild.txt）は設計まとめに無く、段階4で足したもの

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AgentName } from "./schemas";

export const PROMPT_FILES: Record<AgentName, string> = {
  物件: "property.txt",
  立地: "location.txt",
  価格: "price.txt",
  買い手: "buyer.txt",
  メイン: "main.txt",
  媒体: "media.txt",
  確認: "check.txt",
};

export function readPrompt(file: string): string {
  return readFileSync(path.join(process.cwd(), "prompts", file), "utf8").replace(/\r\n/g, "\n").trimEnd();
}

export interface AgentPrompt {
  file: string;
  system: string;
  sha256: string;
}

/** 共通の指示＋自分の指示。sha256 は渡した指示文の中身（直したときに、どの版で動かしたか見分ける） */
export function agentPrompt(agent: AgentName): AgentPrompt {
  const file = PROMPT_FILES[agent];
  const system = `${readPrompt("common.txt")}\n\n${readPrompt(file)}`;
  return { file, system, sha256: createHash("sha256").update(system).digest("hex") };
}

/** 作り直しの依頼文。{problems} に問題のある文の一覧が入る */
export function rebuildMessage(problems: string[]): string {
  return readPrompt("rebuild.txt").replace("{problems}", problems.map((p) => `- ${p}`).join("\n"));
}
