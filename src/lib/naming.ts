/**
 * 变量名候选解析。
 *
 * 内置 NAMING_PROMPT 要求「每行一个候选、仅标识符本身」，但 LLM 未必严格遵守，
 * 故对每行做轻量清洗：去掉项目符号、编号前缀、反引号与首尾空白。
 */

/** 从 LLM 的多行输出解析候选标识符列表（顺序保持，空行丢弃）。 */
export function parseCandidates(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^[-*•]\s*/, "") // 项目符号
        .replace(/^\d+[.)]\s*/, "") // 编号：1. / 1)
        .replace(/`/g, "") // 反引号
        .trim(),
    )
    .filter((line) => line.length > 0);
}
