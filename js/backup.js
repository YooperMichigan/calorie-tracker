// Export/restore local data as a JSON file, since everything lives only on-device.

async function exportBackup() {
  const [entries, favorites] = await Promise.all([dbGetAllEntries(), dbGetAllFavorites()]);
  const payload = {
    app: "calorie-tracker",
    version: 1,
    exportedAt: new Date().toISOString(),
    entries,
    favorites,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = todayISO();
  a.href = url;
  a.download = `calorie-tracker-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { entryCount: entries.length, favoriteCount: favorites.length };
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

  if (entries.length === 0 && favorites.length === 0) {
    throw new Error("No valid entries or favorites found in that file.");
  }

  await dbClearAll();
  await dbBulkPut(entries, favorites);
  return { entryCount: entries.length, favoriteCount: favorites.length };
}
