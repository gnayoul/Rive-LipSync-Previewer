/** 文本识别输入的加权长度上限（纯中文约 300 字，纯英文约 600 字符）。 */
export const WEIGHTED_TEXT_LIMIT = 600

/**
 * 汉字 / 日文假名 / 韩文 / emoji → 2 单位；
 * 其余（英文、数字、半角标点、空格等）→ 1 单位。
 */
const DOUBLE_UNIT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}]/u

function unitCost(char: string): number {
  return DOUBLE_UNIT.test(char) ? 2 : 1
}

/** 计算文本的加权长度（按 Unicode 码点遍历）。 */
export function getWeightedLength(text: string): number {
  let total = 0
  for (const char of text) {
    total += unitCost(char)
  }
  return total
}

/**
 * 将文本截断到不超过 maxUnits 加权单位。
 * 若下一个字符会超限则停止（不会半截多单位字符）。
 */
export function clampWeightedText(
  text: string,
  maxUnits: number = WEIGHTED_TEXT_LIMIT,
): string {
  if (getWeightedLength(text) <= maxUnits) return text

  let result = ""
  let units = 0
  for (const char of text) {
    const cost = unitCost(char)
    if (units + cost > maxUnits) break
    result += char
    units += cost
  }
  return result
}
