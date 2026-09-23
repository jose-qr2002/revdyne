const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ttsEngineManager = require('./ttsEngineManager');

const TIMEOUT_MS = 15000;

function synthesizeWithPiper(text, voiceModel) {
  return new Promise((resolve, reject) => {
    let executable;
    try { executable = ttsEngineManager.getExecutablePath('piper'); }
    catch (e) { return reject(e); }

    if (!fs.existsSync(executable)) {
      return reject(new Error('Piper no está instalado. Ve a "Voces y Motores" para instalarlo.'));
    }

    const modelPath = path.join(ttsEngineManager.getVoicesDir('piper'), `${voiceModel}.onnx`);
    if (!fs.existsSync(modelPath)) {
      return reject(new Error(`No se encontró la voz "${voiceModel}". Instálala desde "Voces y Motores".`));
    }

    const outputPath = path.join(os.tmpdir(), `piper_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);
    const piper = spawn(executable, ['--model', modelPath, '--output_file', outputPath]);

    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      piper.kill();
      reject(new Error('Piper no respondió a tiempo'));
    }, TIMEOUT_MS);

    piper.stderr.on('data', c => { stderr += c.toString(); });
    piper.on('error', err => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      reject(new Error(`No se pudo ejecutar Piper: ${err.message}`));
    });
    piper.on('close', code => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (code !== 0) return reject(new Error(`Piper terminó con código ${code}: ${stderr}`));
      fs.readFile(outputPath, (err, buffer) => {
        fs.unlink(outputPath, () => {});
        if (err) return reject(new Error('Piper no generó el audio esperado'));
        resolve(buffer);
      });
    });

    piper.stdin.write(text);
    piper.stdin.end();
  });
}

module.exports = { synthesizeWithPiper };