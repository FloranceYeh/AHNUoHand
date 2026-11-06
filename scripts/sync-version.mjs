import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = path.join(root, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const version = packageJson.version;

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Invalid package version: ${version}`);
}

const [major, minor, patch] = version.split("-")[0].split(".").map(Number);
const androidVersionCode = major * 1_000_000 + minor * 1_000 + patch;
if (androidVersionCode > 2_100_000_000) {
  throw new Error(`Android versionCode is out of range: ${androidVersionCode}`);
}

const tauriConfigPath = path.join(root, "src-tauri", "tauri.conf.json");
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"));
if (tauriConfig.version !== "../package.json") {
  tauriConfig.version = "../package.json";
  fs.writeFileSync(
    tauriConfigPath,
    `${JSON.stringify(tauriConfig, null, 2)}\n`,
    "utf8",
  );
}

const cargoPath = path.join(root, "src-tauri", "Cargo.toml");
const cargo = fs.readFileSync(cargoPath, "utf8");
if (!/(\[package\][\s\S]*?\r?\nversion = )"[^"]+"/.test(cargo)) {
  throw new Error("Could not find the Rust package version in Cargo.toml");
}
const nextCargo = cargo.replace(
  /(\[package\][\s\S]*?\r?\nversion = )"[^"]+"/,
  `$1"${version}"`,
);
if (nextCargo !== cargo) fs.writeFileSync(cargoPath, nextCargo, "utf8");

const cargoLockPath = path.join(root, "src-tauri", "Cargo.lock");
const cargoLock = fs.readFileSync(cargoLockPath, "utf8");
if (
  !/(\[\[package\]\]\r?\nname = "ahnuohand"\r?\nversion = )"[^"]+"/.test(
    cargoLock,
  )
) {
  throw new Error("Could not find the application package in Cargo.lock");
}
const nextCargoLock = cargoLock.replace(
  /(\[\[package\]\]\r?\nname = "ahnuohand"\r?\nversion = )"[^"]+"/,
  `$1"${version}"`,
);
if (nextCargoLock !== cargoLock) {
  fs.writeFileSync(cargoLockPath, nextCargoLock, "utf8");
}

console.log(
  `[version] ${packageJson.name} ${version} (Android versionCode ${androidVersionCode})`,
);
