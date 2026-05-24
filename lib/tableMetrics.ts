function normalizeText(text: string) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function levenshteinDistance(a: string, b: string) {
  const left = Array.from(a);
  const right = Array.from(b);
  const dp: number[] = new Array(right.length + 1).fill(0).map((_, i) => i);

  for (let i = 1; i <= left.length; i += 1) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const temp = dp[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }

  return dp[right.length];
}

export function anlsSimilarity(predicted: string, gold: string) {
  const p = normalizeText(predicted);
  const g = normalizeText(gold);
  if (!p && !g) return 1;
  if (!p || !g) return 0;
  const denom = Math.max(p.length, g.length);
  if (!denom) return 1;
  return Math.max(0, 1 - levenshteinDistance(p, g) / denom);
}

function tableToHtmlLike(table: any) {
  const headers = Array.isArray(table?.headers) ? table.headers.map((cell: any) => `<th>${normalizeText(cell)}</th>`).join("") : "";
  const rows = Array.isArray(table?.rows)
    ? table.rows
        .map((row: any[]) => `<tr>${(Array.isArray(row) ? row : []).map((cell) => `<td>${normalizeText(cell)}</td>`).join("")}</tr>`)
        .join("")
    : "";
  return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

export function tedsLikeSimilarity(predictedTable: any, goldTable: any) {
  const predicted = tableToHtmlLike(predictedTable);
  const gold = tableToHtmlLike(goldTable);
  if (!predicted && !gold) return 1;
  if (!predicted || !gold) return 0;
  const denom = Math.max(predicted.length, gold.length);
  if (!denom) return 1;
  return Math.max(0, 1 - levenshteinDistance(predicted, gold) / denom);
}

export function summarizeTableMetrics(predictedTable: any, goldTable: any) {
  return {
    anls: anlsSimilarity(JSON.stringify(predictedTable || {}), JSON.stringify(goldTable || {})),
    teds_like: tedsLikeSimilarity(predictedTable, goldTable),
  };
}
