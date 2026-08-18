// Shared date/formatting/id helpers used across the app.

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayISO() {
  return isoDate(new Date());
}

function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function addMonths(iso, n) {
  const d = parseISO(iso);
  d.setMonth(d.getMonth() + n);
  return isoDate(d);
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function formatDateLabel(iso) {
  const d = parseISO(iso);
  return `${WEEKDAY_SHORT[d.getDay()]}, ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function formatDateRelative(iso) {
  const today = todayISO();
  const yest = addDays(today, -1);
  const tom = addDays(today, 1);
  if (iso === today) return "Today";
  if (iso === yest) return "Yesterday";
  if (iso === tom) return "Tomorrow";
  return null;
}

// Monday-start week containing `iso`. Returns { start, end, days: [7 iso strings] }.
function weekRangeFor(iso) {
  const d = parseISO(iso);
  const dow = d.getDay(); // 0=Sun..6=Sat
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const start = isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday));
  const days = [];
  for (let i = 0; i < 7; i++) days.push(addDays(start, i));
  return { start, end: days[6], days };
}

function formatWeekLabel(range) {
  const s = parseISO(range.start), e = parseISO(range.end);
  const sameMonth = s.getMonth() === e.getMonth();
  const sMonth = MONTH_SHORT[s.getMonth()], eMonth = MONTH_SHORT[e.getMonth()];
  if (sameMonth) return `${sMonth} ${s.getDate()}–${e.getDate()}, ${e.getFullYear()}`;
  return `${sMonth} ${s.getDate()} – ${eMonth} ${e.getDate()}, ${e.getFullYear()}`;
}

// Returns { year, month (0-11), days: [iso...] } for the month containing `iso`.
function monthRangeFor(iso) {
  const d = parseISO(iso);
  const year = d.getFullYear(), month = d.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(isoDate(new Date(year, month, i)));
  }
  return { year, month, days };
}

function formatMonthLabel(range) {
  return `${MONTH_LONG[range.month]} ${range.year}`;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function fmtNum(n, decimals = 0) {
  if (n === null || n === undefined || isNaN(n)) return "0";
  const factor = 10 ** decimals;
  const rounded = Math.round(n * factor) / factor;
  return rounded.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const MEAL_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snacks: "Snacks" };
const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snacks"];
