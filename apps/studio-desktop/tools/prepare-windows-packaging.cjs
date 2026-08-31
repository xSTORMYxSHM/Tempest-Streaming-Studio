const fs = require("node:fs");
const path = require("node:path");

if (process.platform !== "win32") {
  process.exit(0);
}

const electronBuilderPackage = require.resolve("electron-builder/package.json");
const appBuilderPackage = require.resolve("app-builder-lib/package.json", {
  paths: [path.dirname(electronBuilderPackage)]
});
const nsisTargetPath = path.join(
  path.dirname(appBuilderPackage),
  "out",
  "targets",
  "nsis",
  "NsisTarget.js"
);

const source = fs.readFileSync(nsisTargetPath, "utf8");
const readerCall = "await nsisUtil_1.UninstallerReader.exec(installerPath, uninstallerPath);";
const readerCallCount = source.split(readerCall).length - 1;

if (readerCallCount >= 2) {
  console.log("Windows Application Control-safe NSIS extraction is ready.");
  process.exit(0);
}

const nativeExecution =
  '            await wineVm.exec(installerPath, [], { env: { __COMPAT_LAYER: "RunAsInvoker" } });';
const executionIndex = source.indexOf(nativeExecution);
const blockStart = source.lastIndexOf("        else {", executionIndex);
const blockEndMarker = "        }";
const blockEnd = source.indexOf(blockEndMarker, executionIndex);

if (executionIndex < 0 || blockStart < 0 || blockEnd < 0) {
  throw new Error(
    "Electron Builder's NSIS extraction code changed; update prepare-windows-packaging.cjs before packaging."
  );
}

const originalBlock = source.slice(blockStart, blockEnd + blockEndMarker.length);
if (!originalBlock.includes("const wineVm = new WineVm_1.WineVmManager")) {
  throw new Error("Refusing to patch an unexpected Electron Builder code block.");
}

const patched =
  source.slice(0, blockStart) +
  `        else {\n            ${readerCall}\n        }` +
  source.slice(blockEnd + blockEndMarker.length);

fs.writeFileSync(nsisTargetPath, patched, "utf8");
console.log("Enabled Windows Application Control-safe NSIS extraction.");
