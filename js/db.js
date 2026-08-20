// IndexedDB data layer.
//
// Why IndexedDB instead of localStorage: this app accumulates many small rows
// over time (every logged food item, every day, indefinitely) rather than one
// row per day like a weight tracker. localStorage caps out around 5-10MB and
// requires parsing/serializing the *entire* dataset as JSON on every read or
// write, which gets slower as history grows. IndexedDB stores structured
// records natively, is queried by index (e.g. "all entries between two
// dates") without loading unrelated data, has a much higher storage ceiling,
// and its API is async so large reads never block the UI thread.

const DB_NAME = "calorieTrackerDB";
const DB_VERSION = 3;
const STORE_ENTRIES = "entries";
const STORE_FAVORITES = "favorites";
const STORE_WATER = "water";
const STORE_SUPPLEMENTS = "supplements";
const STORE_SAVED_SUPPLEMENTS = "savedSupplements";

let _dbPromise = null;

function dbOpen() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        const entries = db.createObjectStore(STORE_ENTRIES, { keyPath: "id" });
        entries.createIndex("date", "date", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_FAVORITES)) {
        db.createObjectStore(STORE_FAVORITES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_WATER)) {
        const water = db.createObjectStore(STORE_WATER, { keyPath: "id" });
        water.createIndex("date", "date", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SUPPLEMENTS)) {
        const supplements = db.createObjectStore(STORE_SUPPLEMENTS, { keyPath: "id" });
        supplements.createIndex("date", "date", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_SAVED_SUPPLEMENTS)) {
        db.createObjectStore(STORE_SAVED_SUPPLEMENTS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function txStore(storeName, mode) {
  return dbOpen().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------- entries ----------

async function dbAddEntry(entry) {
  const store = await txStore(STORE_ENTRIES, "readwrite");
  await reqToPromise(store.add(entry));
  return entry;
}

async function dbUpdateEntry(entry) {
  const store = await txStore(STORE_ENTRIES, "readwrite");
  await reqToPromise(store.put(entry));
  return entry;
}

async function dbDeleteEntry(id) {
  const store = await txStore(STORE_ENTRIES, "readwrite");
  await reqToPromise(store.delete(id));
}

async function dbGetEntriesForDate(dateISO) {
  const store = await txStore(STORE_ENTRIES, "readonly");
  const idx = store.index("date");
  return reqToPromise(idx.getAll(IDBKeyRange.only(dateISO)));
}

async function dbGetEntriesForDateRange(startISO, endISO) {
  const store = await txStore(STORE_ENTRIES, "readonly");
  const idx = store.index("date");
  return reqToPromise(idx.getAll(IDBKeyRange.bound(startISO, endISO)));
}

async function dbGetAllEntries() {
  const store = await txStore(STORE_ENTRIES, "readonly");
  return reqToPromise(store.getAll());
}

// ---------- favorites ----------

async function dbAddFavorite(fav) {
  const store = await txStore(STORE_FAVORITES, "readwrite");
  await reqToPromise(store.add(fav));
  return fav;
}

async function dbUpdateFavorite(fav) {
  const store = await txStore(STORE_FAVORITES, "readwrite");
  await reqToPromise(store.put(fav));
  return fav;
}

async function dbDeleteFavorite(id) {
  const store = await txStore(STORE_FAVORITES, "readwrite");
  await reqToPromise(store.delete(id));
}

async function dbGetAllFavorites() {
  const store = await txStore(STORE_FAVORITES, "readonly");
  const all = await reqToPromise(store.getAll());
  return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

// ---------- water ----------

async function dbAddWater(entry) {
  const store = await txStore(STORE_WATER, "readwrite");
  await reqToPromise(store.add(entry));
  return entry;
}

async function dbDeleteWater(id) {
  const store = await txStore(STORE_WATER, "readwrite");
  await reqToPromise(store.delete(id));
}

async function dbGetWaterForDate(dateISO) {
  const store = await txStore(STORE_WATER, "readonly");
  const idx = store.index("date");
  return reqToPromise(idx.getAll(IDBKeyRange.only(dateISO)));
}

async function dbGetWaterForDateRange(startISO, endISO) {
  const store = await txStore(STORE_WATER, "readonly");
  const idx = store.index("date");
  return reqToPromise(idx.getAll(IDBKeyRange.bound(startISO, endISO)));
}

async function dbGetAllWater() {
  const store = await txStore(STORE_WATER, "readonly");
  return reqToPromise(store.getAll());
}

// ---------- supplements ----------

async function dbAddSupplement(entry) {
  const store = await txStore(STORE_SUPPLEMENTS, "readwrite");
  await reqToPromise(store.add(entry));
  return entry;
}

async function dbDeleteSupplement(id) {
  const store = await txStore(STORE_SUPPLEMENTS, "readwrite");
  await reqToPromise(store.delete(id));
}

async function dbGetSupplementsForDate(dateISO) {
  const store = await txStore(STORE_SUPPLEMENTS, "readonly");
  const idx = store.index("date");
  return reqToPromise(idx.getAll(IDBKeyRange.only(dateISO)));
}

async function dbGetSupplementsForDateRange(startISO, endISO) {
  const store = await txStore(STORE_SUPPLEMENTS, "readonly");
  const idx = store.index("date");
  return reqToPromise(idx.getAll(IDBKeyRange.bound(startISO, endISO)));
}

async function dbGetAllSupplements() {
  const store = await txStore(STORE_SUPPLEMENTS, "readonly");
  return reqToPromise(store.getAll());
}

// ---------- saved supplements ----------

async function dbAddSavedSupplement(sup) {
  const store = await txStore(STORE_SAVED_SUPPLEMENTS, "readwrite");
  await reqToPromise(store.add(sup));
  return sup;
}

async function dbDeleteSavedSupplement(id) {
  const store = await txStore(STORE_SAVED_SUPPLEMENTS, "readwrite");
  await reqToPromise(store.delete(id));
}

async function dbGetAllSavedSupplements() {
  const store = await txStore(STORE_SAVED_SUPPLEMENTS, "readonly");
  const all = await reqToPromise(store.getAll());
  return all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

// ---------- bulk (backup/restore) ----------

const ALL_STORES = [STORE_ENTRIES, STORE_FAVORITES, STORE_WATER, STORE_SUPPLEMENTS, STORE_SAVED_SUPPLEMENTS];

async function dbClearAll() {
  const db = await dbOpen();
  const tx = db.transaction(ALL_STORES, "readwrite");
  ALL_STORES.forEach((name) => tx.objectStore(name).clear());
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbBulkPut(entries, favorites, water = [], supplements = [], savedSupplements = []) {
  const db = await dbOpen();
  const tx = db.transaction(ALL_STORES, "readwrite");
  const eStore = tx.objectStore(STORE_ENTRIES);
  const fStore = tx.objectStore(STORE_FAVORITES);
  const wStore = tx.objectStore(STORE_WATER);
  const sStore = tx.objectStore(STORE_SUPPLEMENTS);
  const ssStore = tx.objectStore(STORE_SAVED_SUPPLEMENTS);
  entries.forEach((e) => eStore.put(e));
  favorites.forEach((f) => fStore.put(f));
  water.forEach((w) => wStore.put(w));
  supplements.forEach((s) => sStore.put(s));
  savedSupplements.forEach((s) => ssStore.put(s));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
