// Lightweight, dependency-free SVG chart builders. SVG attributes (fill,
// stroke) don't participate in the cascade the way CSS properties do, so
// they can't just reference var(--x) reliably here — instead we read the
// live computed CSS custom property values each time a chart is built,
// which keeps charts in sync with the current light/dark theme without
// needing to duplicate the palette in JS.

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getChartColors() {
  return {
    accent: cssVar("--accent"),
    muted: cssVar("--muted"),
    mutedDim: cssVar("--muted-2"),
    grid: cssVar("--border"),
    text: cssVar("--text"),
    protein: cssVar("--protein"),
    carbs: cssVar("--carbs"),
    fat: cssVar("--fat"),
    fiber: cssVar("--fiber"),
    water: cssVar("--water"),
    breakfast: cssVar("--meal-breakfast"),
    lunch: cssVar("--meal-lunch"),
    dinner: cssVar("--meal-dinner"),
    snacks: cssVar("--meal-snacks"),
  };
}

function svgBarChart(data, opts = {}) {
  const C = getChartColors();
  const width = opts.width || 320, height = opts.height || 170;
  const pad = { top: 16, right: 10, bottom: 22, left: 10 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...data.map((d) => d.value)) * 1.2;
  const slot = chartW / data.length;
  const barW = Math.min(34, slot * 0.5);

  const gridLines = [0.25, 0.5, 0.75, 1].map((f) => {
    const y = pad.top + chartH * (1 - f);
    return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="${C.grid}" stroke-width="1"/>`;
  }).join("");

  const bars = data.map((d, i) => {
    const x = pad.left + i * slot + (slot - barW) / 2;
    const barH = Math.max(2, (d.value / max) * chartH);
    const y = pad.top + chartH - barH;
    const color = d.color || C.accent;
    const label = escapeHtml(d.label);
    return `
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="4" fill="${color}"/>
      <text x="${(x + barW / 2).toFixed(1)}" y="${height - 6}" text-anchor="middle" font-size="9.5" fill="${C.muted}">${label}</text>
    `;
  }).join("");

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="xMidYMid meet">${gridLines}${bars}</svg>`;
}

// A dashed reference line at a target value, with a small label — used to
// mark a daily goal on a bar/line chart so it reads at a glance whether a
// given day was over or under. `anchor` picks which end of the chart the
// label sits at, so two goal lines in the same chart (svgDualBarChart)
// don't draw their labels on top of each other.
function goalLineSvg(value, max, pad, width, chartH, color, label, anchor = "end") {
  if (!value || value <= 0) return "";
  const y = pad.top + chartH - Math.min(1, value / max) * chartH;
  const x = anchor === "end" ? width - pad.right : pad.left;
  return `
    <line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width - pad.right}" y2="${y.toFixed(1)}" stroke="${color}" stroke-width="1.5" stroke-dasharray="5 3" opacity="0.85"/>
    <text x="${x.toFixed(1)}" y="${(y - 3).toFixed(1)}" text-anchor="${anchor}" font-size="8.5" fill="${color}">${escapeHtml(label)}</text>
  `;
}

function svgLineChart(data, opts = {}) {
  const C = getChartColors();
  const width = opts.width || 320, height = opts.height || 170;
  const pad = { top: 16, right: 10, bottom: 22, left: 10 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const goal = opts.goal || 0;
  const max = Math.max(1, ...data.map((d) => d.value), goal) * 1.15;
  const n = data.length;
  const stepX = n > 1 ? chartW / (n - 1) : 0;
  const color = opts.color || C.accent;

  const gridLines = [0.25, 0.5, 0.75, 1].map((f) => {
    const y = pad.top + chartH * (1 - f);
    return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="${C.grid}" stroke-width="1"/>`;
  }).join("");

  const goalLine = goalLineSvg(goal, max, pad, width, chartH, color, "Goal");

  const points = data.map((d, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + chartH - (d.value / max) * chartH;
    return { x, y, label: d.label, value: d.value };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${points[n - 1].x.toFixed(1)},${(pad.top + chartH).toFixed(1)} L${points[0].x.toFixed(1)},${(pad.top + chartH).toFixed(1)} Z`;

  const dots = points.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.2" fill="${color}"/>`).join("");

  // Thin out x-axis labels so they don't overlap when there are many days.
  const labelEvery = Math.ceil(n / 7);
  const labels = points.map((p, i) => {
    if (i % labelEvery !== 0 && i !== n - 1) return "";
    return `<text x="${p.x.toFixed(1)}" y="${height - 6}" text-anchor="middle" font-size="9" fill="${C.muted}">${escapeHtml(p.label)}</text>`;
  }).join("");

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="xMidYMid meet">
    ${gridLines}
    ${goalLine}
    <path d="${areaPath}" fill="${color}" fill-opacity="0.12" stroke="none"/>
    <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
    ${labels}
  </svg>`;
}

// Grouped bar chart for two series on independent scales (e.g. calories in
// kcal alongside water in oz — plotting them on a shared axis would make one
// series unreadable). Each series is normalized to its own max, so bar
// height compares a day to its own series' week, not to the other series.
function svgDualBarChart(dataA, dataB, opts = {}) {
  const C = getChartColors();
  const width = opts.width || 320, height = opts.height || 170;
  const pad = { top: 16, right: 10, bottom: 22, left: 10 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;
  const n = dataA.length;
  const goalA = opts.goalA || 0;
  const goalB = opts.goalB || 0;
  const maxA = Math.max(1, ...dataA.map((d) => d.value), goalA) * 1.2;
  const maxB = Math.max(1, ...dataB.map((d) => d.value), goalB) * 1.2;
  const slot = chartW / n;
  const barW = Math.min(16, slot * 0.28);
  const gap = 3;
  const colorA = opts.colorA || C.accent;
  const colorB = opts.colorB || C.water;

  const gridLines = [0.25, 0.5, 0.75, 1].map((f) => {
    const y = pad.top + chartH * (1 - f);
    return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="${C.grid}" stroke-width="1"/>`;
  }).join("");

  // Calorie goal label anchors right, water goal label anchors left, so the
  // two reference lines don't draw their text on top of each other when
  // they land close together.
  const goalLines = goalLineSvg(goalA, maxA, pad, width, chartH, colorA, "Cal Goal", "end")
    + goalLineSvg(goalB, maxB, pad, width, chartH, colorB, "Water Goal", "start");

  const bars = dataA.map((d, i) => {
    const bVal = dataB[i] ? dataB[i].value : 0;
    const centerX = pad.left + i * slot + slot / 2;
    const xA = centerX - barW - gap / 2;
    const xB = centerX + gap / 2;
    const hA = Math.max(2, (d.value / maxA) * chartH);
    const hB = Math.max(2, (bVal / maxB) * chartH);
    const yA = pad.top + chartH - hA;
    const yB = pad.top + chartH - hB;
    const label = escapeHtml(d.label);
    return `
      <rect x="${xA.toFixed(1)}" y="${yA.toFixed(1)}" width="${barW.toFixed(1)}" height="${hA.toFixed(1)}" rx="3" fill="${colorA}"/>
      <rect x="${xB.toFixed(1)}" y="${yB.toFixed(1)}" width="${barW.toFixed(1)}" height="${hB.toFixed(1)}" rx="3" fill="${colorB}"/>
      <text x="${centerX.toFixed(1)}" y="${height - 6}" text-anchor="middle" font-size="9.5" fill="${C.muted}">${label}</text>
    `;
  }).join("");

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="xMidYMid meet">${gridLines}${goalLines}${bars}</svg>`;
}

function svgDonutChart(segments, opts = {}) {
  const C = getChartColors();
  const size = opts.size || 160;
  const thickness = opts.thickness || 20;
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((s, d) => s + d.value, 0);

  let offset = 0;
  const arcs = segments.filter((s) => s.value > 0).map((seg) => {
    const frac = total > 0 ? seg.value / total : 0;
    const segLen = frac * circumference;
    const dasharray = `${segLen.toFixed(2)} ${(circumference - segLen).toFixed(2)}`;
    const dashoffset = -offset;
    offset += segLen;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${thickness}" stroke-dasharray="${dasharray}" stroke-dashoffset="${dashoffset.toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
  }).join("");

  const bg = total === 0 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.grid}" stroke-width="${thickness}"/>` : "";

  const centerTop = opts.centerValue ? `<text x="${cx}" y="${cy - 3}" text-anchor="middle" font-size="17" font-weight="600" fill="${C.text}">${escapeHtml(opts.centerValue)}</text>` : "";
  const centerBottom = opts.centerLabel ? `<text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="10" fill="${C.muted}">${escapeHtml(opts.centerLabel)}</text>` : "";

  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    ${bg}${arcs}
    ${centerTop}${centerBottom}
  </svg>`;
}
