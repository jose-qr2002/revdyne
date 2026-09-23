const fs = require('fs');
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');
const paths = require('../paths');
const catalog = require('../data/ttsEngineCatalog.json');
const voiceCatalog = require('../data/ttsVoiceCatalog.json');

function getPlatformConfig(engineId) {
  const engine = catalog[engineId];
  if (!engine) throw new Error(`Motor desconocido: "${engineId}"`);
  const platformConfig = engine.platforms[process.platform];
  if (!platformConfig) throw new Error(`"${engine.label}" no tiene versión para ${process.platform}`);
  return platformConfig;
}

function getExecutablePath(engineId) {
  return path.join(paths.engineRootDir(engineId), getPlatformConfig(engineId).executablePath);
}

function getVoicesDir(engineId) {
  return path.join(paths.engineRootDir(engineId), 'voices');
}

function isInstalled(engineId) {
  try { return fs.existsSync(getExecutablePath(engineId)); }
  catch { return false; }
}

function listEnginesWithStatus() {
  return Object.entries(catalog).map(([id, meta]) => ({
    id, ...meta,
    installed: isInstalled(id),
    supportedOnThisPlatform: !!meta.platforms[process.platform]
  }));
}

async function installEngine(engineId) {
  const platformConfig = getPlatformConfig(engineId);
  const rootDir = paths.engineRootDir(engineId);
  fs.mkdirSync(rootDir, { recursive: true });
  fs.mkdirSync(getVoicesDir(engineId), { recursive: true });

  const tmpZipPath = path.join(os.tmpdir(), `${engineId}_${Date.now()}.zip`);
  const response = await fetch(platformConfig.downloadUrl);
  if (!response.ok) throw new Error(`Descarga falló: HTTP ${response.status}`);
  fs.writeFileSync(tmpZipPath, Buffer.from(await response.arrayBuffer()));

  try {
    new AdmZip(tmpZipPath).extractAllTo(rootDir, true);
  } finally {
    fs.unlink(tmpZipPath, () => {});
  }

  if (!isInstalled(engineId)) {
    throw new Error('Se descargó pero no se encontró el ejecutable esperado (revisa executablePath en el catálogo)');
  }
  return true;
}

function uninstallEngine(engineId) {
  const rootDir = paths.engineRootDir(engineId);
  if (fs.existsSync(rootDir)) fs.rmSync(rootDir, { recursive: true, force: true });
  return true;
}

function listVoices(engineId) {
  const voicesDir = getVoicesDir(engineId);
  if (!fs.existsSync(voicesDir)) return [];
  return fs.readdirSync(voicesDir)
    .filter(f => f.endsWith('.onnx'))
    .map(f => f.replace(/\.onnx$/, ''));
}

function listCatalogVoices(engineId) {
  const presets = voiceCatalog[engineId] || [];
  const installed = new Set(listVoices(engineId));
  return presets.map(v => ({ ...v, installed: installed.has(v.id) }));
}

async function installVoice(engineId, onnxUrl) {
  if (!onnxUrl.endsWith('.onnx')) throw new Error('La URL debe apuntar directo a un archivo .onnx');

  const jsonUrl = `${onnxUrl}.json`;
  const voicesDir = getVoicesDir(engineId);
  fs.mkdirSync(voicesDir, { recursive: true });

  const voiceId = path.basename(onnxUrl).replace(/\.onnx$/, '');
  const [onnxRes, jsonRes] = await Promise.all([fetch(onnxUrl), fetch(jsonUrl)]);
  if (!onnxRes.ok) throw new Error(`No se pudo descargar el modelo: HTTP ${onnxRes.status}`);
  if (!jsonRes.ok) throw new Error(`No se pudo descargar la config (.onnx.json): HTTP ${jsonRes.status}`);

  fs.writeFileSync(path.join(voicesDir, `${voiceId}.onnx`), Buffer.from(await onnxRes.arrayBuffer()));
  fs.writeFileSync(path.join(voicesDir, `${voiceId}.onnx.json`), Buffer.from(await jsonRes.arrayBuffer()));
  return voiceId;
}

function uninstallVoice(engineId, voiceId) {
  const voicesDir = getVoicesDir(engineId);
  let removed = false;
  [`${voiceId}.onnx`, `${voiceId}.onnx.json`].forEach(f => {
    const p = path.join(voicesDir, f);
    if (fs.existsSync(p)) { fs.unlinkSync(p); removed = true; }
  });
  return removed;
}

module.exports = {
  listEnginesWithStatus, installEngine, uninstallEngine,
  getExecutablePath, getVoicesDir, listVoices, listCatalogVoices, installVoice, uninstallVoice, 
};