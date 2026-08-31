import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function sha256(filePath) {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex").toUpperCase();
}

async function locateWindowsPackage(packageName) {
  const script = [
    `$package = Get-AppxPackage -Name '${packageName.replaceAll("'", "''")}'`,
    `if ($null -eq $package) { exit 4 }`,
    `$exe = Join-Path $package.InstallLocation 'app\\ChatGPT.exe'`,
    `[pscustomobject]@{`,
    `  Name = $package.Name`,
    `  PackageFullName = $package.PackageFullName`,
    `  InstallLocation = $package.InstallLocation`,
    `  Version = $package.Version.ToString()`,
    `  ExecutableVersion = (Get-Item -LiteralPath $exe).VersionInfo.ProductVersion`,
    `} | ConvertTo-Json -Compress`
  ].join("\n");

  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, maxBuffer: 1024 * 1024 }
  );
  const metadata = JSON.parse(stdout.trim());
  const executablePath = path.join(metadata.InstallLocation, "app", "ChatGPT.exe");
  const asarPath = path.join(metadata.InstallLocation, "app", "resources", "app.asar");
  const owlAppPath = path.join(metadata.InstallLocation, "app", "resources", "owl-app.ini");
  await Promise.all([access(executablePath), access(asarPath), access(owlAppPath)]);
  const owlAppIni = await readFile(owlAppPath, "utf8");
  const appVersion = /^AppVersion=(.+)$/im.exec(owlAppIni)?.[1]?.trim();
  if (!appVersion) throw new Error(`无法从 ${owlAppPath} 读取 AppVersion。`);

  return {
    platform: "win32",
    arch: process.arch,
    name: metadata.Name,
    packageFullName: metadata.PackageFullName,
    packageVersion: metadata.Version,
    appVersion,
    executableVersion: metadata.ExecutableVersion,
    installLocation: metadata.InstallLocation,
    executablePath,
    asarPath,
    asarSha256: await sha256(asarPath)
  };
}

async function firstAccessible(paths) {
  for (const candidate of paths) {
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    if (await access(resolved).then(() => true, () => false)) return resolved;
  }
  return null;
}

async function locateMacPackage(appPaths = []) {
  const appBundlePath = await firstAccessible([
    process.env.CODEX_APP_PATH,
    ...appPaths,
    "/Applications/ChatGPT.app",
    "/Applications/Codex.app",
    path.join(os.homedir(), "Applications", "ChatGPT.app"),
    path.join(os.homedir(), "Applications", "Codex.app")
  ]);
  if (!appBundlePath) {
    throw new Error("未找到 Codex macOS 应用。可通过 CODEX_APP_PATH 指定 .app 路径。");
  }

  const contentsPath = path.join(appBundlePath, "Contents");
  const infoPath = path.join(contentsPath, "Info.plist");
  const resourcesPath = path.join(contentsPath, "Resources");
  const asarPath = path.join(resourcesPath, "app.asar");
  const owlAppPath = path.join(resourcesPath, "owl-app.ini");
  await Promise.all([access(infoPath), access(asarPath), access(owlAppPath)]);

  const { stdout: plistJson } = await execFileAsync(
    "/usr/bin/plutil",
    ["-convert", "json", "-o", "-", infoPath],
    { maxBuffer: 1024 * 1024 }
  );
  const plist = JSON.parse(plistJson);
  const executablePath = path.join(contentsPath, "MacOS", plist.CFBundleExecutable);
  await access(executablePath);

  const owlAppIni = await readFile(owlAppPath, "utf8");
  const appVersion = /^AppVersion=(.+)$/im.exec(owlAppIni)?.[1]?.trim();
  if (!appVersion) throw new Error(`无法从 ${owlAppPath} 读取 AppVersion。`);

  await execFileAsync(
    "/usr/bin/codesign",
    ["--verify", "--deep", "--strict", appBundlePath],
    { maxBuffer: 1024 * 1024 }
  );
  await execFileAsync(
    "/usr/sbin/spctl",
    ["--assess", "--type", "execute", appBundlePath],
    { maxBuffer: 1024 * 1024 }
  );
  const { stderr: signature } = await execFileAsync(
    "/usr/bin/codesign",
    ["-dv", "--verbose=4", appBundlePath],
    { maxBuffer: 1024 * 1024 }
  );
  const teamIdentifier = /^TeamIdentifier=(.+)$/m.exec(signature)?.[1]?.trim();
  const bundleIdentifier = plist.CFBundleIdentifier;
  const packageVersion = String(plist.CFBundleVersion);
  const executableVersion = plist.ChromiumBaseVersion;
  if (!bundleIdentifier || !packageVersion || !executableVersion || !teamIdentifier) {
    throw new Error("Codex macOS 应用缺少版本、Bundle ID 或签名 Team ID。");
  }

  return {
    platform: "darwin",
    arch: process.arch,
    name: plist.CFBundleDisplayName ?? plist.CFBundleName,
    packageFullName: `${bundleIdentifier}_${packageVersion}_${process.arch}`,
    packageVersion,
    appVersion,
    executableVersion,
    bundleIdentifier,
    teamIdentifier,
    installLocation: appBundlePath,
    appBundlePath,
    executablePath,
    asarPath,
    asarSha256: await sha256(asarPath)
  };
}

export async function locateCodexPackage(packageName, options = {}) {
  if (process.platform === "win32") return locateWindowsPackage(packageName);
  if (process.platform === "darwin") return locateMacPackage(options.appPaths);
  throw new Error(`当前平台 ${process.platform} 没有受支持的 Codex 桌面选择器增强。`);
}

export function parseProcessList(output) {
  return output
    .split(/\r?\n/)
    .map((line) => /^\s*(\d+)\s+(.+)$/.exec(line))
    .filter(Boolean)
    .map((match) => ({ processId: Number(match[1]), commandLine: match[2] }));
}

export function findMatchingMainProcess(processes, executablePath) {
  return processes.find(({ commandLine }) =>
    commandLine === executablePath || commandLine.startsWith(`${executablePath} `)
  ) ?? null;
}

export function isManagedNodeCommand(commandLine, scriptPaths) {
  return scriptPaths.some((scriptPath) => {
    const marker = ` ${scriptPath}`;
    const markerIndex = commandLine.indexOf(marker);
    if (markerIndex <= 0) return false;
    const executablePath = commandLine.slice(0, markerIndex);
    const remainingArguments = commandLine.slice(markerIndex + marker.length);
    return (
      path.basename(executablePath) === "node" &&
      /^(?:\s+--(?:attach|diagnose|ignore-pid=\d+))*\s*$/.test(remainingArguments)
    );
  });
}

async function findWindowsMainProcess(executablePath) {
  const escapedPath = executablePath.replaceAll("'", "''");
  const script = [
    `$match = Get-CimInstance Win32_Process -Filter \"Name='ChatGPT.exe'\" |`,
    `  Where-Object { $_.ExecutablePath -eq '${escapedPath}' -and $_.CommandLine -notmatch '--type=' } |`,
    `  Select-Object -First 1`,
    `if ($null -ne $match) {`,
    `  [pscustomobject]@{ ProcessId = $match.ProcessId; CommandLine = $match.CommandLine } |`,
    `    ConvertTo-Json -Compress`,
    `}`
  ].join("\n");
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, maxBuffer: 1024 * 1024 }
  );
  const value = stdout.trim();
  if (!value) return null;
  const process = JSON.parse(value);
  return { processId: Number(process.ProcessId), commandLine: process.CommandLine };
}

export async function findCodexMainProcess(executablePath) {
  if (process.platform === "win32") return findWindowsMainProcess(executablePath);
  const { stdout } = await execFileAsync("/bin/ps", ["-axww", "-o", "pid=,command="], {
    maxBuffer: 4 * 1024 * 1024
  });
  return findMatchingMainProcess(parseProcessList(stdout), executablePath);
}

export async function isCodexMainProcessRunning(executablePath) {
  return Boolean(await findCodexMainProcess(executablePath));
}

export async function terminateCodexMainProcess(processId) {
  if (process.platform === "win32") {
    await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Stop-Process -Id ${processId} -ErrorAction SilentlyContinue`
      ],
      { windowsHide: true }
    );
    return;
  }
  process.kill(processId, "SIGTERM");
}

export function matchCompatibility(installation, compatibility) {
  const installationPlatform = installation.platform ?? "win32";
  return compatibility.targets.find((target) => {
    const targetPlatform = target.platform ?? "win32";
    const commonMatch =
      targetPlatform === installationPlatform &&
      target.packageVersion === installation.packageVersion &&
      target.appVersion === installation.appVersion &&
      target.executableVersion === installation.executableVersion &&
      target.asarSha256.toUpperCase() === installation.asarSha256.toUpperCase();
    if (!commonMatch) return false;
    if (target.arch && target.arch !== installation.arch) return false;
    if (target.bundleIdentifier && target.bundleIdentifier !== installation.bundleIdentifier) return false;
    if (target.teamIdentifier && target.teamIdentifier !== installation.teamIdentifier) return false;
    return true;
  }) ?? null;
}
