// Primary: parse markdown table directly — no AI needed for structured data
const parseMarkdownTable = (replyText) => {
  const lines = replyText.split("\n").filter((l) => l.trim());
  const tableLines = lines.filter((l) => l.includes("|"));
  if (tableLines.length < 3) return null;

  // FIX: move - to start of character class to treat it as literal dash
  const dataRows = tableLines.filter((l) => !l.match(/^\|[-\s|]+\|$/));
  if (dataRows.length < 2) return null;

  const rows = dataRows.map((l) =>
    l
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean)
  );

  const headers = rows[0];
  const dataRowsOnly = rows.slice(1);

  let labelCol = -1,
    valueCol = -1;

  for (let i = 0; i < headers.length; i++) {
    const colValues = dataRowsOnly.map((r) => r[i] || "");
    const numericCount = colValues.filter(
      (v) => !isNaN(parseFloat(v.replace(/[,₹$]/g, "")))
    ).length;
    if (numericCount === colValues.length && valueCol === -1) valueCol = i;
    else if (labelCol === -1) labelCol = i;
  }

  if (labelCol === -1 || valueCol === -1) return null;

  const labels = dataRowsOnly.map((r) => r[labelCol] || "");
  const values = dataRowsOnly.map((r) =>
    parseFloat((r[valueCol] || "0").replace(/[,₹$]/g, ""))
  );

  if (!labels.length || values.every((v) => isNaN(v))) return null;

  return {
    chartable: true,
    type: labels.length <= 6 ? "pie" : "bar",
    title: `${headers[labelCol]} vs ${headers[valueCol]}`,
    labels,
    values,
  };
};

// Fallback: HF API if no table found
const extractChartFromHF = async (replyText) => {
  const prompt = `<s>[INST] Extract chart data from this business data reply.
  Return ONLY valid JSON, no explanation, no markdown:
  {
    "chartable": true or false,
    "type": "bar" or "line" or "pie",
    "title": "short chart title",
    "labels": ["label1","label2",...],
    "values": [number1, number2,...]
  }
  If no numeric/comparative data exists, return {"chartable":false}.
  
  Reply:
  ${replyText} [/INST]`;

  const response = await fetch(
    "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.HF_API_TOKEN}`,
        "Content-Type": "application/json",
        "x-wait-for-model": "true",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 300,
          temperature: 0.1,
          return_full_text: false,
        },
      }),
    }
  );
  const data = await response.json();
  const rawText = data?.[0]?.generated_text || "";
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { chartable: false };
  return JSON.parse(jsonMatch[0]);
};

const extractChartFromText = async (replyText) => {
  // Try direct table parsing first — instant, no API needed
  const tableResult = parseMarkdownTable(replyText);
  if (tableResult) return tableResult;

  // Fallback to HF model for non-table numeric data
  return await extractChartFromHF(replyText);
};

module.exports = { extractChartFromText };
