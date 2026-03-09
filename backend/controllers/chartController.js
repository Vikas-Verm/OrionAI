const { extractChartFromText } = require("../services/chartService");

const extractChart = async (req, res) => {
  try {
    const { replyText } = req.body;
    if (!replyText)
      return res.status(400).json({ error: "replyText is required" });

    const result = await extractChartFromText(replyText);
    console.log("result", result);
    res.json(result);
  } catch (e) {
    console.error("Chart extraction failed:", e);
    res.json({ chartable: false });
  }
};

module.exports = { extractChart };
