/**
 * 标识符写法转换。
 *
 * 命名功能一次请求只取回若干「中性候选词」（小写空格分隔的英文词组，
 * 如 `get user profile`），五种写法在本地铺开。这样一次生成只花一次模型调用，
 * 且五列严格逐行对齐——同一行就是同一个词的五种形态，用户可横向挑词、
 * 再按当前语言取对应那一列。
 */

import type { NamingStyle } from "./config-types";

/**
 * 把任意形态的标识符拆成小写词元。
 *
 * 兼容模型未严格遵守「小写空格分隔」时的各种输出：驼峰、下划线、连字符、
 * 点号、多余空白，以及 `HTTPServer` 这类连续大写后接词的边界。
 */
export function splitWords(input: string): string[] {
  return input
    .trim()
    // 连续大写与后随单词的边界：HTTPServer → HTTP Server
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    // 小写/数字与大写的边界：getUser → get User
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    // 其余分隔符统一成空格
    .replace(/[^A-Za-z\d]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => w.toLowerCase());
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** 按目标写法拼接词元；输入无有效词元时返回空串。 */
export function toStyle(input: string, style: NamingStyle): string {
  const words = splitWords(input);
  if (words.length === 0) return "";
  switch (style) {
    case "camel_case":
      return words
        .map((w, i) => (i === 0 ? w : capitalize(w)))
        .join("");
    case "pascal_case":
      return words.map(capitalize).join("");
    case "snake_case":
      return words.join("_");
    case "kebab_case":
      return words.join("-");
    case "constant_case":
      return words.join("_").toUpperCase();
  }
}
