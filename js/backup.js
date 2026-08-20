// Export/restore local data as a JSON file, since everything lives only on-device.

async function exportBackup() {
  const [entries, favorites, water] = await Promise.all([dbGetAllEntries(), dbGetAllFavorites(), dbGetAllWater()]);
  const payload = {
    app: "calorie-tracker",
    version: 2,
    exportedAt: new Date().toISOString(),
    entries,
    favorites,
    water,
    goals: getGoals(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const filename = `calorie-tracker-backup-${todayISO()}.json`;

  // Prefer the native share sheet (lets you AirDrop, save to Files, etc.)
  // over a plain download link, which on iOS Safari just opens the JSON in
  // an in-browser document viewer instead of doing anything useful.
  try {
    const file = new File([blob], filename, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return { entryCount: entries.length, favoriteCount: favorites.length, waterCount: water.length };
    }
  } catch (e) {
    // user cancelled the share sheet or it failed silently — fall through to download
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { entryCount: entries.length, favoriteCount: favorites.length, waterCount: water.length };
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function isValidEntry(e) {
  return e && typeof e.id === "string" && typeof e.date === "string" && typeof e.meal === "string" && typeof e.calories === "number";
}

function isValidFavorite(f) {
  return f && typeof f.id === "string" && typeof f.name === "string" && Array.isArray(f.items);
}

function isValidWater(w) {
  return w && typeof w.id === "string" && typeof w.date === "string" && typeof w.amount === "number";
}

// Replaces all local data with the contents of the backup file.
async function importBackupFile(file) {
  const text = await readFileAsText(file);
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error("That file isn't valid JSON.");
  }

  const entries = Array.isArray(parsed.entries) ? parsed.entries.filter(isValidEntry) : [];
  const favorites = Array.isArray(parsed.favorites) ? parsed.favorites.filter(isValidFavorite) : [];
  const water = Array.isArray(parsed.water) ? parsed.water.filter(isValidWater) : [];

  if (entries.length === 0 && favorites.length === 0 && water.length === 0) {
    throw new Error("No valid entries, saved meals, or water logs found in that file.");
  }

  await dbClearAll();
  await dbBulkPut(entries, favorites, water);
  if (parsed.goals && typeof parsed.goals === "object") setGoals(parsed.goals);
  return { entryCount: entries.length, favoriteCount: favorites.length, waterCount: water.length };
}
