"use client";

import AdminCrudManager from "@/components/admin/AdminCrudManager";

const STATUS_OPTIONS = [
  "ANALYSIS", "SIGNAL", "ACTIVE", "TP1_HIT", "TP2_HIT", "TP3_HIT",
  "WON", "LOST", "CANCELLED", "CLOSED"
];

const fields = [
  { name: "pair", label: "Currency Pair (e.g. EUR/USD)", type: "text", required: true },
  { name: "direction", label: "Direction", type: "select", options: ["BUY", "SELL"], required: true },
  { name: "title", label: "Analysis Title", type: "text", required: true, wide: true },
  { name: "entry", label: "Entry Price / Zone", type: "text" },
  { name: "stopLoss", label: "Stop Loss", type: "text" },
  { name: "takeProfit1", label: "Take Profit 1", type: "text" },
  { name: "takeProfit2", label: "Take Profit 2", type: "text" },
  { name: "takeProfit3", label: "Take Profit 3", type: "text" },
  { name: "riskReward", label: "Risk/Reward", type: "text" },
  { name: "timeframe", label: "Timeframe (e.g. 4H)", type: "text" },
  { name: "status", label: "Status", type: "select", options: STATUS_OPTIONS, required: true },
  { name: "keySupportLevels", label: "Key Support Levels", type: "text" },
  { name: "keyResistanceLevels", label: "Key Resistance Levels", type: "text" },
  { name: "chartImage", label: "Chart Image", type: "image", wide: true },
  { name: "marketStructure", label: "Market Structure", type: "textarea", wide: true },
  { name: "technicalAnalysis", label: "Technical Analysis", type: "textarea", wide: true },
  { name: "fundamentalContext", label: "Fundamental Context", type: "textarea", wide: true },
  { name: "tradeSetupExplanation", label: "Trade Setup Explanation", type: "textarea", wide: true },
  { name: "riskWarning", label: "Risk Warning", type: "textarea", wide: true },
  { name: "published", label: "Published (visible on public site)", type: "checkbox" }
];

const columns = [
  { key: "pair", label: "Pair" },
  { key: "direction", label: "Direction" },
  { key: "status", label: "Status" },
  { key: "timeframe", label: "Timeframe" }
];

export default function AdminForexPage() {
  return (
    <AdminCrudManager
      endpoint="/api/forex"
      title="Forex Analysis"
      fields={fields}
      columns={columns}
      emptyLabel="No forex analyses yet. Click 'Create New' to publish your first one."
    />
  );
}
