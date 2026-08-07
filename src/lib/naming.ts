/**
 * 变量名候选解析与五种写法的网格组织。
 *
 * 内置 NAMING_PROMPT 要求「每行一个候选、仅词组本身」，但 LLM 未必严格遵守，
 * 故对每行做轻量清洗：去掉项目符号、编号前缀、反引号与首尾空白。
 */

import { toStyle } from "./case-convert";
import type { NamingStyle } from "./config-types";

/** 命名结果的五列写法（顺序即界面自左向右的列序）。 */
export const GRID_STYLES: readonly NamingStyle[] = [
  "camel_case",
  "snake_case",
  "pascal_case",
  "kebab_case",
  "constant_case",
];

/** 网格行数上限——界面每列固定展示五行。 */
export const GRID_ROWS = 5;

/** 一行 = 同一个候选词的五种写法，按 [`GRID_STYLES`] 顺序。 */
export type NamingRow = Record<NamingStyle, string>;

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

/**
 * 把 LLM 输出组织为「每行一个候选词、每列一种写法」的网格。
 *
 * 模型少给行时只渲染实际行数（不填占位——空白格比假候选诚实）；
 * 多给时取前 [`GRID_ROWS`] 行。转换后为空的候选（纯符号行）丢弃。
 */
export function buildNamingGrid(raw: string): NamingRow[] {
  return parseCandidates(raw)
    .map((words) => {
      const row = {} as NamingRow;
      for (const style of GRID_STYLES) {
        row[style] = toStyle(words, style);
      }
      return row;
    })
    .filter((row) => row.camel_case.length > 0)
    .slice(0, GRID_ROWS);
}
