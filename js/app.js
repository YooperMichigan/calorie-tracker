// ============================================================================
// State
// ============================================================================

const state = {
  activeTab: "log",           // 'log' | 'meals' | 'summary'
  logDate: todayISO(),
  entries: [],                 // entries for state.logDate
  favorites: [],                // all favorites, cached

  mealsSearch: "",

  summaryMode: "weekly",       // 'weekly' | 'monthly'
  weekAnchor: todayISO(),
  monthAnchor: todayISO(),
  weeklyData: null,
  monthlyData: null,

  sheet: null,                 // current open sheet descriptor, or null
};

async function init() {
  ensureHiddenInputs();
  state.entries = await dbGetEntriesForDate(state.logDate);
  state.favorites = await dbGetAllFavorites();
  renderAll();
  attachGlobalListeners();
}

function ensureHiddenInputs() {
  const datePicker = document.createElement("input");
  datePicker.type = "date";
  datePicker.id = "hiddenDatePicker";
  datePicker.className = "date-nav-hidden-input";
  document.body.appendChild(datePicker);

  const filePicker = document.createElement("input");
  filePicker.type = "file";
  filePicker.accept = "application/json";
  filePicker.id = "importFileInput";
  filePicker.className = "date-nav-hidden-input";
  document.body.appendChild(filePicker);
}

// ============================================================================
// Data helpers
// ============================================================================

function sumTotals(entries) {
  return entries.reduce((acc, e) => {
    acc.calories += e.calories || 0;
    acc.protein += e.protein || 0;
    acc.carbs += e.carbs || 0;
    acc.fat += e.fat || 0;
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

async function refreshEntries() {
  state.entries = await dbGetEntriesForDate(state.logDate);
  // Any entry mutation can change weekly/monthly aggregates, so drop the cache
  // and let the summary view refetch next time it's shown.
  state.weeklyData = null;
  state.monthlyData = null;
}

async function refreshFavorites() {
  state.favorites = await dbGetAllFavorites();
}

async function refreshWeeklyData() {
  const range = weekRangeFor(state.weekAnchor);
  const all = await dbGetEntriesForDateRange(range.start, range.end);
  const byDate = new Map(range.days.map((d) => [d, []]));
  all.forEach((e) => { if (byDate.has(e.date)) byDate.get(e.date).push(e); });

  const dailyTotals = range.days.map((d) => ({ date: d, ...sumTotals(byDate.get(d)) }));
  const daysWithData = dailyTotals.filter((d) => d.calories > 0).length;
  const weekTotal = sumTotals(all);
  const divisor = Math.max(1, daysWithData);

  state.weeklyData = { range, dailyTotals, weekTotal, daysWithData, avg: {
    calories: weekTotal.calories / divisor,
    protein: weekTotal.protein / divisor,
    carbs: weekTotal.carbs / divisor,
    fat: weekTotal.fat / divisor,
  } };
}

async function refreshMonthlyData() {
  const range = monthRangeFor(state.monthAnchor);
  const all = await dbGetEntriesForDateRange(range.days[0], range.days[range.days.length - 1]);
  const byDate = new Map(range.days.map((d) => [d, []]));
  all.forEach((e) => { if (byDate.has(e.date)) byDate.get(e.date).push(e); });

  const dailyTotals = range.days.map((d) => ({ date: d, ...sumTotals(byDate.get(d)) }));
  const daysWithData = dailyTotals.filter((d) => d.calories > 0).length;
  const monthTotal = sumTotals(all);
  const divisor = Math.max(1, daysWithData);

  const mealTotals = { breakfast: 0, lunch: 0, dinner: 0, snacks: 0 };
  all.forEach((e) => { if (mealTotals[e.meal] !== undefined) mealTotals[e.meal] += e.calories || 0; });

  state.monthlyData = { range, dailyTotals, monthTotal, daysWithData, mealTotals, avg: {
    calories: monthTotal.calories / divisor,
    protein: monthTotal.protein / divisor,
    carbs: monthTotal.carbs / divisor,
    fat: monthTotal.fat / divisor,
  } };
}

// ============================================================================
// Toast
// ============================================================================

let toastTimer = null;
function showToast(message, type = "") {
  const root = document.getElementById("toast-root");
  clearTimeout(toastTimer);
  root.innerHTML = `<div class="toast ${type}">${escapeHtml(message)}</div>`;
  toastTimer = setTimeout(() => { root.innerHTML = ""; }, 2800);
}

// ============================================================================
// Chrome (tab bar + header) sync
// ============================================================================

const TAB_SUBTITLES = { log: "Daily food log", meals: "Saved meals for one-tap logging", summary: "Weekly & monthly trends" };

function syncChrome() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === state.activeTab);
  });
  document.getElementById("headerSubtitle").textContent = TAB_SUBTITLES[state.activeTab];
}

// ============================================================================
// Render dispatch
// ============================================================================

function renderAll() {
  syncChrome();
  renderMain();
  renderSheetRoot();
}

function renderMain() {
  const root = document.getElementById("view-root");
  if (state.activeTab === "log") root.innerHTML = renderLogView();
  else if (state.activeTab === "meals") root.innerHTML = renderMealsView();
  else root.innerHTML = renderSummaryView();
}

function renderSheetRoot() {
  const root = document.getElementById("sheet-root");
  if (!state.sheet) { root.innerHTML = ""; return; }
  root.innerHTML = renderSheet();
  afterSheetRender();
}

// ============================================================================
// Log view
// ============================================================================

function renderLogView() {
  const rel = formatDateRelative(state.logDate);
  const totals = sumTotals(state.entries);

  const mealSections = MEAL_ORDER.map((meal) => {
    const mealEntries = state.entries.filter((e) => e.meal === meal);
    const mealKcal = sumTotals(mealEntries).calories;
    const rows = mealEntries.length
      ? mealEntries.map(renderEntryRow).join("")
      : `<div class="empty-meal">Nothing logged yet</div>`;
    return `
      <section class="meal-section">
        <div class="meal-header">
          <div class="meal-title-wrap">
            <span class="meal-title">${MEAL_LABELS[meal]}</span>
            <span class="meal-kcal">${fmtNum(mealKcal)} kcal</span>
          </div>
          <button class="add-btn" data-action="open-add-sheet" data-meal="${meal}" aria-label="Add to ${MEAL_LABELS[meal]}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
        <div class="entry-list">${rows}</div>
      </section>
    `;
  }).join("");

  return `
    <div class="date-nav">
      <button class="date-nav-btn" data-action="day-prev" aria-label="Previous day">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="date-nav-label" data-action="day-pick">
        <span class="date-nav-main">${rel || formatDateLabel(state.logDate)}</span>
        <span class="date-nav-sub">${rel ? formatDateLabel(state.logDate) : ""}</span>
      </div>
      ${state.logDate !== todayISO() ? `<button class="today-btn" data-action="day-today">Today</button>` : `<span style="width:34px"></span>`}
      <button class="date-nav-btn" data-action="day-next" aria-label="Next day">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>

    <div class="totals-row">
      <div class="total-card">
        <span class="total-label">Calories</span>
        <span class="total-value accent">${fmtNum(totals.calories)}</span>
      </div>
      <div class="total-card protein">
        <span class="total-label">Protein</span>
        <span class="total-value">${fmtNum(totals.protein)}<span class="total-unit">g</span></span>
      </div>
      <div class="total-card carbs">
        <span class="total-label">Carbs</span>
        <span class="total-value">${fmtNum(totals.carbs)}<span class="total-unit">g</span></span>
      </div>
      <div class="total-card fat">
        <span class="total-label">Fat</span>
        <span class="total-value">${fmtNum(totals.fat)}<span class="total-unit">g</span></span>
      </div>
    </div>

    ${mealSections}
  `;
}

function renderEntryRow(e) {
  return `
    <div class="entry-row" data-action="edit-entry" data-id="${e.id}">
      <div class="entry-main">
        <div class="entry-name">${escapeHtml(e.name)}</div>
        <div class="entry-meta">
          <span>${fmtNum(e.quantity, 2)} × ${escapeHtml(e.unit || "serving")}</span>
          <span class="entry-macro-p">P ${fmtNum(e.protein)}g</span>
          <span class="entry-macro-c">C ${fmtNum(e.carbs)}g</span>
          <span class="entry-macro-f">F ${fmtNum(e.fat)}g</span>
        </div>
      </div>
      <div class="entry-kcal">${fmtNum(e.calories)}</div>
      <button class="entry-del" data-action="delete-entry" data-id="${e.id}" aria-label="Delete">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
      </button>
    </div>
  `;
}

// ============================================================================
// My Meals view
// ============================================================================

function renderMealsView() {
  const q = state.mealsSearch.trim().toLowerCase();
  const list = state.favorites.filter((f) => !q || f.name.toLowerCase().includes(q));

  const rows = list.length ? list.map(renderFavRow).join("") : `
    <div class="empty-meal" style="padding:28px 10px;">
      ${state.favorites.length ? "No saved meals match your search." : "No saved meals yet. Tap “New Meal” to add one, or check “Save as favorite” when logging food."}
    </div>`;

  return `
    <button class="btn btn-primary btn-block" data-action="new-favorite" style="margin-bottom:14px;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      New Meal
    </button>
    <div class="search-wrap">
      <span class="search-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></span>
      <input type="search" id="mealsSearchInput" placeholder="Search saved meals" value="${escapeHtml(state.mealsSearch)}">
    </div>
    <div class="fav-list">${rows}</div>
  `;
}

function renderFavRow(f) {
  const totals = sumTotals(f.items);
  return `
    <div class="fav-row" data-action="log-favorite-prompt" data-id="${f.id}">
      <div class="fav-main">
        <div class="fav-name">${escapeHtml(f.name)}</div>
        <div class="fav-meta">${f.items.length} item${f.items.length === 1 ? "" : "s"} · ${fmtNum(totals.calories)} kcal</div>
      </div>
      <div class="fav-actions">
        <button class="fav-icon-btn" data-action="edit-favorite" data-id="${f.id}" aria-label="Edit">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
        </button>
        <button class="fav-icon-btn" data-action="delete-favorite" data-id="${f.id}" aria-label="Delete">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
        </button>
      </div>
    </div>
  `;
}

// ============================================================================
// Summary view
// ============================================================================

function renderSummaryView() {
  const modeTabs = `
    <div class="section-tabs">
      <button class="section-tab ${state.summaryMode === "weekly" ? "active" : ""}" data-action="summary-mode" data-mode="weekly">Weekly</button>
      <button class="section-tab ${state.summaryMode === "monthly" ? "active" : ""}" data-action="summary-mode" data-mode="monthly">Monthly</button>
    </div>
  `;
  return modeTabs + (state.summaryMode === "weekly" ? renderWeeklySummary() : renderMonthlySummary());
}

function renderWeeklySummary() {
  if (!state.weeklyData) return `<div class="chart-empty">Loading…</div>`;
  const d = state.weeklyData;
  const isCurrentWeek = weekRangeFor(todayISO()).start === d.range.start;

  const barData = d.dailyTotals.map((day) => ({
    label: WEEKDAY_SHORT[parseISO(day.date).getDay()],
    value: day.calories,
  }));

  const pKcal = d.weekTotal.protein * 4, cKcal = d.weekTotal.carbs * 4, fKcal = d.weekTotal.fat * 9;
  const macroTotalKcal = pKcal + cKcal + fKcal;
  const donut = svgDonutChart(
    [
      { label: "Protein", value: pKcal, color: CHART_COLORS.protein },
      { label: "Carbs", value: cKcal, color: CHART_COLORS.carbs },
      { label: "Fat", value: fKcal, color: CHART_COLORS.fat },
    ],
    { size: 160, thickness: 22, centerValue: fmtNum(d.weekTotal.calories), centerLabel: "kcal total" }
  );

  return `
    <div class="date-nav">
      <button class="date-nav-btn" data-action="week-prev" aria-label="Previous week">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="date-nav-label"><span class="date-nav-main">${formatWeekLabel(d.range)}</span></div>
      ${!isCurrentWeek ? `<button class="today-btn" data-action="week-today">This Week</button>` : `<span style="width:34px"></span>`}
      <button class="date-nav-btn" data-action="week-next" aria-label="Next week">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>

    <div class="summary-cards">
      <div class="summary-card">
        <div class="summary-card-label">Total Calories</div>
        <div class="summary-card-value">${fmtNum(d.weekTotal.calories)}</div>
        <div class="summary-card-sub">across ${d.daysWithData} logged day${d.daysWithData === 1 ? "" : "s"}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Daily Average</div>
        <div class="summary-card-value">${fmtNum(d.avg.calories)}<span class="total-unit"> kcal</span></div>
        <div class="macro-mini-row">
          <span class="p">P ${fmtNum(d.avg.protein)}g</span>
          <span class="c">C ${fmtNum(d.avg.carbs)}g</span>
          <span class="f">F ${fmtNum(d.avg.fat)}g</span>
        </div>
      </div>
    </div>

    <div class="chart-card">
      <div class="chart-title">Daily Calories</div>
      ${d.weekTotal.calories > 0 ? svgBarChart(barData) : `<div class="chart-empty">No entries logged this week</div>`}
    </div>

    <div class="chart-card" style="display:flex; flex-direction:column; align-items:center;">
      <div class="chart-title" style="align-self:flex-start;">Macro Breakdown</div>
      ${macroTotalKcal > 0 ? donut : `<div class="chart-empty">No entries logged this week</div>`}
      ${macroTotalKcal > 0 ? `
        <div class="legend-row">
          <span class="legend-item"><span class="legend-dot" style="background:${CHART_COLORS.protein}"></span>Protein ${Math.round(pKcal / macroTotalKcal * 100)}% · ${fmtNum(d.weekTotal.protein)}g</span>
          <span class="legend-item"><span class="legend-dot" style="background:${CHART_COLORS.carbs}"></span>Carbs ${Math.round(cKcal / macroTotalKcal * 100)}% · ${fmtNum(d.weekTotal.carbs)}g</span>
          <span class="legend-item"><span class="legend-dot" style="background:${CHART_COLORS.fat}"></span>Fat ${Math.round(fKcal / macroTotalKcal * 100)}% · ${fmtNum(d.weekTotal.fat)}g</span>
        </div>
      ` : ""}
    </div>
  `;
}

function renderMonthlySummary() {
  if (!state.monthlyData) return `<div class="chart-empty">Loading…</div>`;
  const d = state.monthlyData;
  const thisMonth = monthRangeFor(todayISO());
  const isCurrentMonth = thisMonth.year === d.range.year && thisMonth.month === d.range.month;

  const lineData = d.dailyTotals.map((day) => ({ label: String(parseISO(day.date).getDate()), value: day.calories }));

  const mealColors = { breakfast: CHART_COLORS.breakfast, lunch: CHART_COLORS.lunch, dinner: CHART_COLORS.dinner, snacks: CHART_COLORS.snacks };
  const mealTotal = MEAL_ORDER.reduce((s, m) => s + d.mealTotals[m], 0);
  const mealDonut = svgDonutChart(
    MEAL_ORDER.map((m) => ({ label: MEAL_LABELS[m], value: d.mealTotals[m], color: mealColors[m] })),
    { size: 160, thickness: 22, centerValue: fmtNum(mealTotal), centerLabel: "kcal total" }
  );

  return `
    <div class="date-nav">
      <button class="date-nav-btn" data-action="month-prev" aria-label="Previous month">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="date-nav-label"><span class="date-nav-main">${formatMonthLabel(d.range)}</span></div>
      ${!isCurrentMonth ? `<button class="today-btn" data-action="month-today">This Month</button>` : `<span style="width:34px"></span>`}
      <button class="date-nav-btn" data-action="month-next" aria-label="Next month">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>

    <div class="summary-cards">
      <div class="summary-card">
        <div class="summary-card-label">Total Calories</div>
        <div class="summary-card-value">${fmtNum(d.monthTotal.calories)}</div>
        <div class="summary-card-sub">across ${d.daysWithData} logged day${d.daysWithData === 1 ? "" : "s"}</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-label">Daily Average</div>
        <div class="summary-card-value">${fmtNum(d.avg.calories)}<span class="total-unit"> kcal</span></div>
        <div class="macro-mini-row">
          <span class="p">P ${fmtNum(d.avg.protein)}g</span>
          <span class="c">C ${fmtNum(d.avg.carbs)}g</span>
          <span class="f">F ${fmtNum(d.avg.fat)}g</span>
        </div>
      </div>
    </div>

    <div class="chart-card">
      <div class="chart-title">Daily Calorie Trend</div>
      ${d.monthTotal.calories > 0 ? svgLineChart(lineData) : `<div class="chart-empty">No entries logged this month</div>`}
    </div>

    <div class="chart-card" style="display:flex; flex-direction:column; align-items:center;">
      <div class="chart-title" style="align-self:flex-start;">Calories by Meal</div>
      ${mealTotal > 0 ? mealDonut : `<div class="chart-empty">No entries logged this month</div>`}
      ${mealTotal > 0 ? `
        <div class="legend-row">
          ${MEAL_ORDER.map((m) => `<span class="legend-item"><span class="legend-dot" style="background:${mealColors[m]}"></span>${MEAL_LABELS[m]} ${Math.round(d.mealTotals[m] / mealTotal * 100)}%</span>`).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

// ============================================================================
// Sheets
// ============================================================================

function renderSheet() {
  const s = state.sheet;
  if (s.type === "add") return renderAddSheet(s);
  if (s.type === "edit-entry") return renderEditEntrySheet(s);
  if (s.type === "meal-slot-picker") return renderMealSlotPickerSheet(s);
  if (s.type === "new-favorite") return renderFavoriteBuilderSheet(s);
  if (s.type === "menu") return renderMenuSheet(s);
  return "";
}

function sheetWrap(title, bodyHtml) {
  return `
    <div class="overlay" data-action="overlay-close">
      <div class="sheet" data-stop-close>
        <div class="sheet-header">
          <span class="sheet-title">${escapeHtml(title)}</span>
          <button class="sheet-close" data-action="close-sheet">Close</button>
        </div>
        <div class="sheet-body">${bodyHtml}</div>
      </div>
    </div>
  `;
}

// ---------- Add-to-meal sheet (scan / manual / favorites) ----------

function renderAddSheet(s) {
  const tabs = `
    <div class="segmented">
      <button class="segmented-btn ${s.tab === "scan" ? "active" : ""}" data-action="add-sheet-tab" data-tab="scan">Scan</button>
      <button class="segmented-btn ${s.tab === "manual" ? "active" : ""}" data-action="add-sheet-tab" data-tab="manual">Manual</button>
      <button class="segmented-btn ${s.tab === "favorites" ? "active" : ""}" data-action="add-sheet-tab" data-tab="favorites">My Meals</button>
    </div>
  `;
  let body = "";
  if (s.tab === "scan") body = renderScanTab(s);
  else if (s.tab === "manual") body = renderManualTab(s);
  else body = renderFavoritesTab(s);

  return sheetWrap(`Add to ${MEAL_LABELS[s.meal]}`, tabs + body);
}

function renderScanTab(s) {
  if (s.scanError) {
    return `
      <div class="scan-status">${escapeHtml(s.scanError)}</div>
      <button class="btn btn-secondary btn-block" data-action="rescan">Try Again</button>
      <button class="link-btn" data-action="add-sheet-tab" data-tab="manual" style="display:block; text-align:center; margin-top:10px;">Enter manually instead</button>
    `;
  }

  if (s.lookupLoading) {
    return `<div class="scan-status">Looking up product…</div>`;
  }

  if (s.product) {
    if (!s.product.found) {
      return `
        <div class="scan-status">No match found for barcode ${escapeHtml(s.product.barcode)}.</div>
        <button class="btn btn-primary btn-block" data-action="manual-from-scan">Enter Manually</button>
        <button class="link-btn" data-action="rescan" style="display:block; text-align:center; margin-top:10px;">Scan again</button>
      `;
    }
    const p = s.product;
    const qty = s.qty;
    const total = { calories: p.perUnit.calories * qty, protein: p.perUnit.protein * qty, carbs: p.perUnit.carbs * qty, fat: p.perUnit.fat * qty };
    return `
      <div class="product-card">
        <div class="product-name">${escapeHtml(p.name)}</div>
        ${p.brand ? `<div class="product-brand">${escapeHtml(p.brand)}</div>` : ""}
        <div class="field-label">Quantity (× ${escapeHtml(p.baseLabel)})</div>
        <div class="stepper" style="margin:6px 0 4px;">
          <button class="stepper-btn" data-action="scan-qty" data-delta="-0.25">−</button>
          <span class="stepper-value">${fmtNum(qty, 2)}</span>
          <button class="stepper-btn" data-action="scan-qty" data-delta="0.25">+</button>
        </div>
        <div class="macro-chip-row">
          <span class="macro-chip kcal">${fmtNum(total.calories)} kcal</span>
          <span class="macro-chip p">P ${fmtNum(total.protein)}g</span>
          <span class="macro-chip c">C ${fmtNum(total.carbs)}g</span>
          <span class="macro-chip f">F ${fmtNum(total.fat)}g</span>
        </div>
      </div>
      <div class="checkbox-row fav-checkbox-hint">
        <input type="checkbox" id="scanSaveFav" ${s.saveFav ? "checked" : ""}>
        <label for="scanSaveFav">Save as favorite too</label>
      </div>
      <button class="btn btn-primary btn-block" data-action="confirm-scan-add">Add to ${MEAL_LABELS[s.meal]}</button>
      <button class="link-btn" data-action="rescan" style="display:block; text-align:center; margin-top:10px;">Scan a different item</button>
    `;
  }

  return `
    <div class="scan-wrap"><div id="qr-reader"></div></div>
    <div class="scan-hint">Point the camera at a barcode (UPC/EAN).</div>
    <div class="scan-hint" id="scanDiag">Starting camera…</div>
    <button class="link-btn" data-action="add-sheet-tab" data-tab="manual" style="display:block; text-align:center;">Can't scan it? Enter manually</button>
  `;
}

function renderManualTab(s) {
  const m = s.manual;
  return `
    <form id="manualEntryForm">
      <div class="field-wrap">
        <span class="field-label">Food name</span>
        <input type="text" name="name" placeholder="e.g. Grilled chicken breast" value="${escapeHtml(m.name)}" required>
      </div>
      <div class="form-grid">
        <div class="field-wrap">
          <span class="field-label">Quantity</span>
          <input type="number" name="quantity" step="0.25" min="0.25" value="${m.quantity}" required>
        </div>
        <div class="field-wrap">
          <span class="field-label">Unit</span>
          <input type="text" name="unit" placeholder="e.g. serving, g, cup" value="${escapeHtml(m.unit)}" required>
        </div>
      </div>
      <div class="form-grid-3">
        <div class="field-wrap">
          <span class="field-label">Calories</span>
          <input type="number" name="calories" step="1" min="0" value="${m.calories}" required>
        </div>
        <div class="field-wrap">
          <span class="field-label">Protein (g)</span>
          <input type="number" name="protein" step="0.1" min="0" value="${m.protein}">
        </div>
        <div class="field-wrap">
          <span class="field-label">Carbs (g)</span>
          <input type="number" name="carbs" step="0.1" min="0" value="${m.carbs}">
        </div>
      </div>
      <div class="form-grid">
        <div class="field-wrap">
          <span class="field-label">Fat (g)</span>
          <input type="number" name="fat" step="0.1" min="0" value="${m.fat}">
        </div>
      </div>
      <div class="checkbox-row">
        <input type="checkbox" id="manualSaveFav" ${s.saveFav ? "checked" : ""}>
        <label for="manualSaveFav">Save as favorite too</label>
      </div>
      <button type="submit" class="btn btn-primary btn-block">Add to ${MEAL_LABELS[s.meal]}</button>
    </form>
  `;
}

function renderFavoritesTab(s) {
  const q = (s.favSearch || "").trim().toLowerCase();
  const list = state.favorites.filter((f) => !q || f.name.toLowerCase().includes(q));
  const rows = list.length ? list.map((f) => {
    const totals = sumTotals(f.items);
    return `
      <div class="fav-row" data-action="log-favorite-direct" data-id="${f.id}">
        <div class="fav-main">
          <div class="fav-name">${escapeHtml(f.name)}</div>
          <div class="fav-meta">${f.items.length} item${f.items.length === 1 ? "" : "s"} · ${fmtNum(totals.calories)} kcal</div>
        </div>
      </div>
    `;
  }).join("") : `<div class="empty-meal">No saved meals${q ? " match your search" : " yet"}.</div>`;

  return `
    <div class="search-wrap">
      <span class="search-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></span>
      <input type="search" id="addFavSearchInput" placeholder="Search saved meals" value="${escapeHtml(s.favSearch || "")}">
    </div>
    <div class="fav-list">${rows}</div>
  `;
}

// ---------- Edit entry sheet ----------

function renderEditEntrySheet(s) {
  const e = s.entry;
  const canRescale = !!e.perUnit;
  return sheetWrap("Edit Entry", `
    <form id="editEntryForm">
      <div class="field-wrap">
        <span class="field-label">Food name</span>
        <input type="text" name="name" value="${escapeHtml(e.name)}" required>
      </div>
      <div class="field-wrap">
        <span class="field-label">Meal</span>
        <select name="meal">
          ${MEAL_ORDER.map((m) => `<option value="${m}" ${m === e.meal ? "selected" : ""}>${MEAL_LABELS[m]}</option>`).join("")}
        </select>
      </div>
      <div class="form-grid">
        <div class="field-wrap">
          <span class="field-label">Quantity</span>
          <input type="number" name="quantity" step="0.25" min="0.25" value="${e.quantity}" required>
        </div>
        <div class="field-wrap">
          <span class="field-label">Unit</span>
          <input type="text" name="unit" value="${escapeHtml(e.unit || "")}" required>
        </div>
      </div>
      ${canRescale ? `<div class="scan-hint" style="text-align:left; margin:-2px 0 10px;">Nutrition values below scale automatically with quantity for scanned items.</div>` : ""}
      <div class="form-grid-3">
        <div class="field-wrap">
          <span class="field-label">Calories</span>
          <input type="number" name="calories" step="1" min="0" value="${fmtNum(e.calories,1)}" ${canRescale ? "readonly" : ""} required>
        </div>
        <div class="field-wrap">
          <span class="field-label">Protein (g)</span>
          <input type="number" name="protein" step="0.1" min="0" value="${fmtNum(e.protein,1)}" ${canRescale ? "readonly" : ""}>
        </div>
        <div class="field-wrap">
          <span class="field-label">Carbs (g)</span>
          <input type="number" name="carbs" step="0.1" min="0" value="${fmtNum(e.carbs,1)}" ${canRescale ? "readonly" : ""}>
        </div>
      </div>
      <div class="form-grid">
        <div class="field-wrap">
          <span class="field-label">Fat (g)</span>
          <input type="number" name="fat" step="0.1" min="0" value="${fmtNum(e.fat,1)}" ${canRescale ? "readonly" : ""}>
        </div>
      </div>
      <button type="submit" class="btn btn-primary btn-block" style="margin-bottom:8px;">Save Changes</button>
      <button type="button" class="btn btn-danger btn-block" data-action="delete-entry" data-id="${e.id}">Delete Entry</button>
    </form>
  `);
}

// ---------- Meal slot picker (from My Meals tab) ----------

function renderMealSlotPickerSheet(s) {
  const fav = state.favorites.find((f) => f.id === s.favId);
  if (!fav) return sheetWrap("Add Meal", `<div class="empty-meal">This saved meal no longer exists.</div>`);
  return sheetWrap(`Add "${fav.name}" to…`, `
    <div class="meal-slot-grid">
      ${MEAL_ORDER.map((m) => `<button class="meal-slot-btn" data-action="pick-meal-slot" data-meal="${m}" data-fav-id="${fav.id}">${MEAL_LABELS[m]}</button>`).join("")}
    </div>
  `);
}

// ---------- New/edit favorite builder ----------

function renderFavoriteBuilderSheet(s) {
  const itemRows = s.items.length ? s.items.map((it, i) => `
    <div class="fav-item-row">
      <div>
        <div class="fav-item-name">${escapeHtml(it.name)}</div>
        <div class="fav-item-kcal">${fmtNum(it.quantity, 2)} × ${escapeHtml(it.unit)} · ${fmtNum(it.calories)} kcal</div>
      </div>
      <button class="fav-item-del" data-action="remove-fav-item" data-index="${i}" aria-label="Remove">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
  `).join("") : `<div class="empty-meal" style="margin-bottom:10px;">No items added yet.</div>`;

  const addItemForm = s.addingItem ? `
    <form id="favItemForm" style="margin-top:10px; padding-top:12px; border-top:1px solid var(--border);">
      <div class="field-wrap">
        <span class="field-label">Food name</span>
        <input type="text" name="name" placeholder="e.g. Brown rice" required>
      </div>
      <div class="form-grid">
        <div class="field-wrap">
          <span class="field-label">Quantity</span>
          <input type="number" name="quantity" step="0.25" min="0.25" value="1" required>
        </div>
        <div class="field-wrap">
          <span class="field-label">Unit</span>
          <input type="text" name="unit" placeholder="e.g. cup" value="serving" required>
        </div>
      </div>
      <div class="form-grid-3">
        <div class="field-wrap">
          <span class="field-label">Calories</span>
          <input type="number" name="calories" step="1" min="0" value="0" required>
        </div>
        <div class="field-wrap">
          <span class="field-label">Protein (g)</span>
          <input type="number" name="protein" step="0.1" min="0" value="0">
        </div>
        <div class="field-wrap">
          <span class="field-label">Carbs (g)</span>
          <input type="number" name="carbs" step="0.1" min="0" value="0">
        </div>
      </div>
      <div class="form-grid">
        <div class="field-wrap">
          <span class="field-label">Fat (g)</span>
          <input type="number" name="fat" step="0.1" min="0" value="0">
        </div>
      </div>
      <button type="submit" class="btn btn-secondary btn-block">Add Item</button>
    </form>
  ` : `<button class="btn btn-secondary btn-block" data-action="show-add-item-form" style="margin-top:4px;">+ Add Item</button>`;

  return sheetWrap(s.editingFavId ? "Edit Saved Meal" : "New Saved Meal", `
    <div class="field-wrap">
      <span class="field-label">Meal name</span>
      <input type="text" id="favNameInput" placeholder="e.g. Post-workout shake" value="${escapeHtml(s.name)}">
    </div>
    ${itemRows}
    ${addItemForm}
    <div style="display:flex; gap:8px; margin-top:16px;">
      ${s.editingFavId ? `<button class="btn btn-danger" data-action="delete-favorite" data-id="${s.editingFavId}">Delete</button>` : ""}
      <button class="btn btn-primary" style="flex:1;" data-action="save-favorite">Save Meal</button>
    </div>
  `);
}

// ---------- Menu (backup) sheet ----------

function renderMenuSheet() {
  return sheetWrap("Backup & Restore", `
    <p class="scan-hint" style="text-align:left; margin-bottom:16px;">All data lives only on this device. Export a backup regularly, or before switching phones.</p>
    <button class="backup-btn" data-action="export-backup" style="margin-bottom:10px;">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
      Export Backup (JSON)
    </button>
    <button class="backup-btn" data-action="trigger-import">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
      Restore from Backup
    </button>
  `);
}

// ============================================================================
// Post-render hooks (scanner start, autofocus)
// ============================================================================

function afterSheetRender() {
  const s = state.sheet;
  if (s && s.type === "add" && s.tab === "scan" && !s.product && !s.lookupLoading && !s.scanError) {
    startScanner();
  }
  const nameInput = document.getElementById("favNameInput");
  if (nameInput) nameInput.addEventListener("blur", () => { state.sheet.name = nameInput.value; });
}

function startScanner() {
  BarcodeScanner.start("qr-reader", onBarcodeDetected, onScanFailure, updateScanDiag);
}

function updateScanDiag(info) {
  const el = document.getElementById("scanDiag");
  if (!el) return;
  if (info.started) { el.textContent = "Camera started — scanning…"; return; }
  const ready = ["no data", "metadata only", "current data", "future data", "enough data"][info.videoReadyState] || info.videoReadyState;
  el.textContent = `Live: ${info.videoWidth}×${info.videoHeight} (${ready}) · attempts: ${info.frameCount} · last: ${info.lastMessage}`;
}

async function onBarcodeDetected(code) {
  await BarcodeScanner.stop();
  if (!state.sheet || state.sheet.type !== "add") return;
  state.sheet.lookupLoading = true;
  renderSheetRoot();
  try {
    const product = await lookupBarcode(code);
    if (!state.sheet) return;
    state.sheet.lookupLoading = false;
    state.sheet.product = product;
    state.sheet.qty = 1;
  } catch (err) {
    if (!state.sheet) return;
    state.sheet.lookupLoading = false;
    state.sheet.scanError = err.message || "Lookup failed.";
  }
  renderSheetRoot();
}

function onScanFailure(msg) {
  if (!state.sheet || state.sheet.type !== "add") return;
  state.sheet.scanError = msg;
  renderSheetRoot();
}

// ============================================================================
// Action handling
// ============================================================================

function newManualDraft() {
  return { name: "", quantity: 1, unit: "serving", calories: 0, protein: 0, carbs: 0, fat: 0 };
}

async function closeSheet() {
  await BarcodeScanner.stop();
  state.sheet = null;
  renderSheetRoot();
}

async function handleAction(action, ds, el) {
  switch (action) {
    // ---- tab bar ----
    case "switch-tab": {
      state.activeTab = ds.tab;
      if (ds.tab === "summary") await ensureSummaryDataLoaded();
      renderAll();
      break;
    }

    // ---- day nav ----
    case "day-prev": state.logDate = addDays(state.logDate, -1); await refreshEntries(); renderMain(); break;
    case "day-next": state.logDate = addDays(state.logDate, 1); await refreshEntries(); renderMain(); break;
    case "day-today": state.logDate = todayISO(); await refreshEntries(); renderMain(); break;
    case "day-pick": {
      const input = document.getElementById("hiddenDatePicker");
      input.value = state.logDate;
      if (input.showPicker) input.showPicker(); else input.click();
      break;
    }

    // ---- add sheet ----
    case "open-add-sheet":
      state.sheet = { type: "add", meal: ds.meal, tab: "scan", product: null, lookupLoading: false, scanError: null, qty: 1, saveFav: false, manual: newManualDraft(), favSearch: "" };
      renderSheetRoot();
      break;
    case "add-sheet-tab":
      await BarcodeScanner.stop();
      state.sheet.tab = ds.tab;
      if (ds.tab === "scan") { state.sheet.product = null; state.sheet.scanError = null; }
      renderSheetRoot();
      break;
    case "rescan":
      state.sheet.product = null; state.sheet.scanError = null; state.sheet.lookupLoading = false;
      renderSheetRoot();
      break;
    case "manual-from-scan": {
      const barcode = state.sheet.product && state.sheet.product.barcode;
      state.sheet.tab = "manual";
      state.sheet.manual = newManualDraft();
      state.sheet.scannedBarcode = barcode || null;
      renderSheetRoot();
      break;
    }
    case "scan-qty": {
      const delta = parseFloat(ds.delta);
      state.sheet.qty = Math.max(0.25, Math.round((state.sheet.qty + delta) * 100) / 100);
      renderSheetRoot();
      break;
    }
    case "confirm-scan-add": {
      const s = state.sheet;
      const p = s.product;
      const saveFav = !!document.getElementById("scanSaveFav")?.checked;
      const entry = {
        id: uuid(), date: state.logDate, meal: s.meal,
        name: p.name, quantity: s.qty, unit: p.baseLabel,
        calories: round1(p.perUnit.calories * s.qty),
        protein: round1(p.perUnit.protein * s.qty),
        carbs: round1(p.perUnit.carbs * s.qty),
        fat: round1(p.perUnit.fat * s.qty),
        perUnit: p.perUnit, source: "barcode", barcode: p.barcode, createdAt: Date.now(),
      };
      await dbAddEntry(entry);
      if (saveFav) await saveEntryAsFavorite(entry);
      await refreshEntries();
      if (saveFav) await refreshFavorites();
      await closeSheet();
      renderMain();
      showToast(`Added to ${MEAL_LABELS[s.meal]}`, "success");
      break;
    }
    case "log-favorite-direct": {
      const fav = state.favorites.find((f) => f.id === ds.id);
      if (fav) {
        const meal = state.sheet.meal;
        await logFavoriteToMeal(fav, meal, state.logDate);
        await refreshEntries();
        await closeSheet();
        renderMain();
        showToast(`Added "${fav.name}" to ${MEAL_LABELS[meal]}`, "success");
      }
      break;
    }

    // ---- entries ----
    case "edit-entry": {
      const entry = state.entries.find((e) => e.id === ds.id);
      if (entry) { state.sheet = { type: "edit-entry", entry: { ...entry } }; renderSheetRoot(); }
      break;
    }
    case "delete-entry": {
      const id = ds.id;
      const fromSheet = state.sheet && state.sheet.type === "edit-entry";
      await dbDeleteEntry(id);
      await refreshEntries();
      if (fromSheet) await closeSheet();
      renderMain();
      showToast("Entry deleted", "success");
      break;
    }

    // ---- my meals ----
    case "new-favorite":
      state.sheet = { type: "new-favorite", name: "", items: [], addingItem: false, editingFavId: null };
      renderSheetRoot();
      break;
    case "edit-favorite": {
      const fav = state.favorites.find((f) => f.id === ds.id);
      if (fav) {
        state.sheet = { type: "new-favorite", name: fav.name, items: JSON.parse(JSON.stringify(fav.items)), addingItem: false, editingFavId: fav.id };
        renderSheetRoot();
      }
      break;
    }
    case "delete-favorite": {
      if (confirm("Delete this saved meal? This can't be undone.")) {
        await dbDeleteFavorite(ds.id);
        await refreshFavorites();
        await closeSheet();
        renderMain();
        showToast("Saved meal deleted", "success");
      }
      break;
    }
    case "show-add-item-form":
      state.sheet.addingItem = true;
      renderSheetRoot();
      break;
    case "remove-fav-item":
      state.sheet.items.splice(parseInt(ds.index, 10), 1);
      renderSheetRoot();
      break;
    case "save-favorite": {
      const s = state.sheet;
      const nameInput = document.getElementById("favNameInput");
      const name = (nameInput ? nameInput.value : s.name).trim();
      if (!name) { showToast("Give this saved meal a name.", "error"); break; }
      if (s.items.length === 0) { showToast("Add at least one item.", "error"); break; }
      const fav = {
        id: s.editingFavId || uuid(),
        name,
        items: s.items,
        createdAt: s.editingFavId ? (state.favorites.find((f) => f.id === s.editingFavId)?.createdAt || Date.now()) : Date.now(),
        updatedAt: Date.now(),
      };
      if (s.editingFavId) await dbUpdateFavorite(fav); else await dbAddFavorite(fav);
      await refreshFavorites();
      await closeSheet();
      renderMain();
      showToast("Saved meal saved", "success");
      break;
    }
    case "log-favorite-prompt":
      state.sheet = { type: "meal-slot-picker", favId: ds.id };
      renderSheetRoot();
      break;
    case "pick-meal-slot": {
      const fav = state.favorites.find((f) => f.id === ds.favId);
      if (fav) {
        await logFavoriteToMeal(fav, ds.meal, state.logDate);
        await refreshEntries();
        await closeSheet();
        showToast(`Added "${fav.name}" to ${MEAL_LABELS[ds.meal]}`, "success");
        renderMain();
      }
      break;
    }

    // ---- summary ----
    case "summary-mode":
      state.summaryMode = ds.mode;
      await ensureSummaryDataLoaded();
      renderMain();
      break;
    case "week-prev": state.weekAnchor = addDays(weekRangeFor(state.weekAnchor).start, -1); await refreshWeeklyData(); renderMain(); break;
    case "week-next": state.weekAnchor = addDays(weekRangeFor(state.weekAnchor).end, 1); await refreshWeeklyData(); renderMain(); break;
    case "week-today": state.weekAnchor = todayISO(); await refreshWeeklyData(); renderMain(); break;
    case "month-prev": state.monthAnchor = addMonths(state.monthAnchor, -1); await refreshMonthlyData(); renderMain(); break;
    case "month-next": state.monthAnchor = addMonths(state.monthAnchor, 1); await refreshMonthlyData(); renderMain(); break;
    case "month-today": state.monthAnchor = todayISO(); await refreshMonthlyData(); renderMain(); break;

    // ---- menu / backup ----
    case "open-menu": state.sheet = { type: "menu" }; renderSheetRoot(); break;
    case "export-backup": {
      const { entryCount, favoriteCount } = await exportBackup();
      showToast(`Exported ${entryCount} entries, ${favoriteCount} saved meals`, "success");
      break;
    }
    case "trigger-import": document.getElementById("importFileInput").click(); break;

    // ---- sheet chrome ----
    case "close-sheet": await closeSheet(); break;

    default: break;
  }
}

async function saveEntryAsFavorite(entry) {
  const fav = {
    id: uuid(),
    name: entry.name,
    items: [{ name: entry.name, quantity: entry.quantity, unit: entry.unit, calories: entry.calories, protein: entry.protein, carbs: entry.carbs, fat: entry.fat, perUnit: entry.perUnit || null }],
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await dbAddFavorite(fav);
}

async function logFavoriteToMeal(fav, meal, date) {
  await Promise.all(fav.items.map((item) => dbAddEntry({
    id: uuid(), date, meal,
    name: item.name, quantity: item.quantity, unit: item.unit,
    calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat,
    perUnit: item.perUnit || null, source: "favorite", barcode: null, createdAt: Date.now(),
  })));
}

async function ensureSummaryDataLoaded() {
  if (state.summaryMode === "weekly" && !state.weeklyData) await refreshWeeklyData();
  if (state.summaryMode === "monthly" && !state.monthlyData) await refreshMonthlyData();
}

// ============================================================================
// Global event delegation (attached once)
// ============================================================================

function attachGlobalListeners() {
  document.addEventListener("click", (e) => {
    const target = e.target.closest("[data-action]");
    if (!target) return;

    if (target.dataset.action === "overlay-close") {
      if (e.target !== target) return; // click landed on sheet content, not the backdrop
      closeSheet();
      return;
    }
    e.stopPropagation();
    handleAction(target.dataset.action, target.dataset, target);
  });

  document.addEventListener("submit", async (e) => {
    if (e.target.id === "manualEntryForm") {
      e.preventDefault();
      const fd = new FormData(e.target);
      const s = state.sheet;
      const entry = {
        id: uuid(), date: state.logDate, meal: s.meal,
        name: fd.get("name").trim(),
        quantity: parseFloat(fd.get("quantity")) || 1,
        unit: fd.get("unit").trim() || "serving",
        calories: parseFloat(fd.get("calories")) || 0,
        protein: parseFloat(fd.get("protein")) || 0,
        carbs: parseFloat(fd.get("carbs")) || 0,
        fat: parseFloat(fd.get("fat")) || 0,
        perUnit: null, source: "manual", barcode: s.scannedBarcode || null, createdAt: Date.now(),
      };
      const saveFav = !!document.getElementById("manualSaveFav")?.checked;
      await dbAddEntry(entry);
      if (saveFav) await saveEntryAsFavorite(entry);
      await refreshEntries();
      if (saveFav) await refreshFavorites();
      await closeSheet();
      renderMain();
      showToast(`Added to ${MEAL_LABELS[entry.meal]}`, "success");
      return;
    }

    if (e.target.id === "editEntryForm") {
      e.preventDefault();
      const fd = new FormData(e.target);
      const s = state.sheet;
      const quantity = parseFloat(fd.get("quantity")) || 1;
      const updated = { ...s.entry, name: fd.get("name").trim(), meal: fd.get("meal"), quantity, unit: fd.get("unit").trim() };
      if (s.entry.perUnit) {
        updated.calories = round1(s.entry.perUnit.calories * quantity);
        updated.protein = round1(s.entry.perUnit.protein * quantity);
        updated.carbs = round1(s.entry.perUnit.carbs * quantity);
        updated.fat = round1(s.entry.perUnit.fat * quantity);
      } else {
        updated.calories = parseFloat(fd.get("calories")) || 0;
        updated.protein = parseFloat(fd.get("protein")) || 0;
        updated.carbs = parseFloat(fd.get("carbs")) || 0;
        updated.fat = parseFloat(fd.get("fat")) || 0;
      }
      await dbUpdateEntry(updated);
      await refreshEntries();
      await closeSheet();
      renderMain();
      showToast("Entry updated", "success");
      return;
    }

    if (e.target.id === "favItemForm") {
      e.preventDefault();
      const fd = new FormData(e.target);
      state.sheet.items.push({
        name: fd.get("name").trim(),
        quantity: parseFloat(fd.get("quantity")) || 1,
        unit: fd.get("unit").trim() || "serving",
        calories: parseFloat(fd.get("calories")) || 0,
        protein: parseFloat(fd.get("protein")) || 0,
        carbs: parseFloat(fd.get("carbs")) || 0,
        fat: parseFloat(fd.get("fat")) || 0,
        perUnit: null,
      });
      state.sheet.addingItem = false;
      renderSheetRoot();
      return;
    }
  });

  document.addEventListener("input", (e) => {
    if (e.target.id === "mealsSearchInput") {
      state.mealsSearch = e.target.value;
      renderMain();
      // restore focus + caret since innerHTML replace drops it
      const el = document.getElementById("mealsSearchInput");
      el.focus(); el.selectionStart = el.selectionEnd = el.value.length;
    }
    if (e.target.id === "addFavSearchInput") {
      state.sheet.favSearch = e.target.value;
      renderSheetRoot();
      const el = document.getElementById("addFavSearchInput");
      el.focus(); el.selectionStart = el.selectionEnd = el.value.length;
    }
    if (e.target.id === "favNameInput") {
      state.sheet.name = e.target.value;
    }
    if (e.target.name === "quantity" && e.target.closest("#editEntryForm")) {
      const perUnit = state.sheet.entry.perUnit;
      if (perUnit) {
        const q = parseFloat(e.target.value) || 0;
        const form = e.target.closest("#editEntryForm");
        form.querySelector('[name="calories"]').value = round1(perUnit.calories * q);
        form.querySelector('[name="protein"]').value = round1(perUnit.protein * q);
        form.querySelector('[name="carbs"]').value = round1(perUnit.carbs * q);
        form.querySelector('[name="fat"]').value = round1(perUnit.fat * q);
      }
    }
  });

  document.addEventListener("change", async (e) => {
    if (e.target.id === "hiddenDatePicker") {
      state.logDate = e.target.value || state.logDate;
      await refreshEntries();
      renderMain();
    }
    if (e.target.id === "importFileInput") {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      if (!confirm("Restoring will replace all current data on this device with the contents of the backup file. Continue?")) return;
      try {
        const { entryCount, favoriteCount } = await importBackupFile(file);
        await refreshEntries();
        await refreshFavorites();
        state.weeklyData = null; state.monthlyData = null;
        await closeSheet();
        renderAll();
        showToast(`Restored ${entryCount} entries, ${favoriteCount} saved meals`, "success");
      } catch (err) {
        showToast(err.message || "Restore failed", "error");
      }
    }
  });

  document.getElementById("menuBtn").addEventListener("click", () => handleAction("open-menu", {}, null));
}

init();
