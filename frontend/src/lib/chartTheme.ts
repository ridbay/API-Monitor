export const CHART_COLORS = {
  grid: "#1c2233",
  axis: "#5c6478",
  brand: "#818cf8",
  accent: "#c084fc",
  success: "#34d399",
  warning: "#fbbf24",
  failure: "#f87171",
};

export const chartGridProps = {
  stroke: CHART_COLORS.grid,
  strokeDasharray: "3 3",
  vertical: false,
};

export const chartAxisProps = {
  tick: { fontSize: 12, fill: CHART_COLORS.axis },
  axisLine: { stroke: "#232a3b" },
  tickLine: false,
};

export const chartTooltipProps = {
  contentStyle: {
    background: "#151a28",
    border: "1px solid #2d3548",
    borderRadius: 10,
    boxShadow: "0 12px 32px -8px rgba(0,0,0,0.6)",
    fontSize: 13,
    color: "#eef0f5",
  },
  labelStyle: { color: "#9199ae", marginBottom: 4 },
  itemStyle: { padding: 0 },
  cursor: { fill: "rgba(255,255,255,0.04)" },
};
