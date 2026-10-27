// Reads customer sample-data folders from disk and profiles them.
const fs = require('node:fs/promises');
const path = require('node:path');
const { buildProfile, labelFromFolder, FILES } = require('./profile');

const SAMPLE_DATA_DIR = path.resolve(__dirname, '../../../sample-data');

async function listSampleData(dir = SAMPLE_DATA_DIR) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => entry.name)
    .sort()
    .map(id => ({ id, label: labelFromFolder(id) }));
}

// Returns the profile, or null when `id` is not exactly one of the listed
// folder names (this is what rejects "../" and other path tricks).
async function loadProfile(id, dir = SAMPLE_DATA_DIR) {
  const folders = await listSampleData(dir);
  if (!folders.some(folder => folder.id === id)) return null;
  const files = {};
  for (const file of Object.values(FILES)) {
    try {
      files[file] = await fs.readFile(path.join(dir, id, file), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return buildProfile(id, files);
}

module.exports = { SAMPLE_DATA_DIR, listSampleData, loadProfile };
