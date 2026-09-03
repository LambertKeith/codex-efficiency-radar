import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
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

async function readWindowsPackageMetadata(packageName) {
  const script = [
    `$package = Get-AppxPackage -Name '${packageName.replaceAll("'", "''")}'`,
    `if ($null -eq $package) { exit 4 }`,
    `$manifest = Get-AppxPackageManifest -Package $package`,
    `$applicationId = @($manifest.Package.Applications.Application)[0].Id`,
    `$exe = Join-Path $package.InstallLocation 'app\\ChatGPT.exe'`,
    `[pscustomobject]@{`,
    `  Name = $package.Name`,
    `  PackageFullName = $package.PackageFullName`,
    `  PackageFamilyName = $package.PackageFamilyName`,
    `  ApplicationId = $applicationId`,
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
  return JSON.parse(stdout.trim());
}

async function locateWindowsPackage(packageName) {
  const metadata = await readWindowsPackageMetadata(packageName);
  const executablePath = path.join(metadata.InstallLocation, "app", "ChatGPT.exe");
  const asarPath = path.join(metadata.InstallLocation, "app", "resources", "app.asar");
  const owlAppPath = path.join(metadata.InstallLocation, "app", "resources", "owl-app.ini");
  await Promise.all([access(executablePath), access(asarPath), access(owlAppPath)]);
  const owlAppIni = await readFile(owlAppPath, "utf8");
  const appVersion = /^AppVersion=(.+)$/im.exec(owlAppIni)?.[1]?.trim();
  if (!appVersion) throw new Error(`无法从 ${owlAppPath} 读取 AppVersion。`);
  const applicationId = metadata.ApplicationId?.trim();
  if (!metadata.PackageFamilyName || !applicationId) {
    throw new Error("Codex Windows 包缺少 Package Family Name 或 Application ID。");
  }

  return {
    platform: "win32",
    arch: process.arch,
    name: metadata.Name,
    packageFullName: metadata.PackageFullName,
    packageFamilyName: metadata.PackageFamilyName,
    applicationId,
    appUserModelId: `${metadata.PackageFamilyName}!${applicationId}`,
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

async function readMacPackageStamp(appPaths = []) {
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
  const info = await stat(path.join(appBundlePath, "Contents", "Info.plist"));
  const asar = await stat(path.join(appBundlePath, "Contents", "Resources", "app.asar"));
  return ["darwin", process.arch, appBundlePath, info.size, info.mtimeMs, asar.size, asar.mtimeMs]
    .join("|");
}

export async function getCodexPackageStamp(packageName, options = {}) {
  if (process.platform === "win32") {
    const metadata = await readWindowsPackageMetadata(packageName);
    return ["win32", process.arch, metadata.Version, metadata.InstallLocation].join("|");
  }
  if (process.platform === "darwin") return readMacPackageStamp(options.appPaths);
  throw new Error(`当前平台 ${process.platform} 没有受支持的 Codex 桌面选择器增强。`);
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
  try {
    process.kill(processId, "SIGTERM");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
    // 进程在发现与终止之间已经退出，目标状态已经满足。
  }
}

const WINDOWS_ACTIVATOR_SOURCE = String.raw`
using System;
using System.Runtime.InteropServices;

[ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IApplicationActivationManager {
  [PreserveSig]
  int ActivateApplication(
    [MarshalAs(UnmanagedType.LPWStr)] string appUserModelId,
    [MarshalAs(UnmanagedType.LPWStr)] string arguments,
    uint options,
    out uint processId
  );
  [PreserveSig]
  int ActivateForFile(string appUserModelId, IntPtr itemArray, string verb, out uint processId);
  [PreserveSig]
  int ActivateForProtocol(string appUserModelId, IntPtr itemArray, out uint processId);
}

[ComImport, Guid("45ba127d-10a8-46ea-8ab7-56ea9078943c")]
class ApplicationActivationManager {}

public static class CodexPackagedAppActivator {
  public static void Probe() {
    var manager = new ApplicationActivationManager();
    Marshal.FinalReleaseComObject(manager);
  }

  public static uint Activate(string appUserModelId, string arguments) {
    var manager = (IApplicationActivationManager)new ApplicationActivationManager();
    uint processId;
    var result = manager.ActivateApplication(appUserModelId, arguments ?? String.Empty, 0, out processId);
    if (result < 0) Marshal.ThrowExceptionForHR(result);
    return processId;
  }
}
`;

function encodedPowerShellValue(value) {
  return Buffer.from(String(value), "utf16le").toString("base64");
}

function windowsActivatorPreamble(source = WINDOWS_ACTIVATOR_SOURCE) {
  const sourceBase64 = encodedPowerShellValue(source);
  return [
    `$source = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${sourceBase64}'))`,
    `Add-Type -TypeDefinition $source -Language CSharp -ErrorAction Stop`
  ];
}

export function buildWindowsActivationScript(source, appUserModelId, activationArguments) {
  const appUserModelIdBase64 = encodedPowerShellValue(appUserModelId);
  const argumentsBase64 = encodedPowerShellValue(activationArguments);
  return [
    ...windowsActivatorPreamble(source),
    `$appUserModelId = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${appUserModelIdBase64}'))`,
    `$arguments = [Text.Encoding]::Unicode.GetString([Convert]::FromBase64String('${argumentsBase64}'))`,
    `$processId = [CodexPackagedAppActivator]::Activate($appUserModelId, $arguments)`,
    `[pscustomobject]@{ ProcessId = $processId } | ConvertTo-Json -Compress`
  ].join("\n");
}

async function runWindowsActivationScript(script) {
  return execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
  );
}

export async function preflightWindowsPackagedAppActivation(appUserModelId) {
  if (process.platform !== "win32") return;
  if (typeof appUserModelId !== "string" || !appUserModelId.includes("!")) {
    throw new Error("Codex Windows 包缺少有效的 AppUserModelID。");
  }
  const script = [...windowsActivatorPreamble(), `[CodexPackagedAppActivator]::Probe()`].join("\n");
  await runWindowsActivationScript(script);
}

export async function activateWindowsPackagedApp(appUserModelId, launchArguments = []) {
  if (process.platform !== "win32") {
    throw new Error("Windows 打包应用激活接口只能在 Windows 上使用。");
  }
  if (typeof appUserModelId !== "string" || !appUserModelId.includes("!")) {
    throw new Error("Codex Windows 包缺少有效的 AppUserModelID。");
  }
  const argumentString = Array.isArray(launchArguments)
    ? launchArguments.join(" ")
    : String(launchArguments ?? "");
  const script = buildWindowsActivationScript(
    WINDOWS_ACTIVATOR_SOURCE,
    appUserModelId,
    argumentString
  );
  const { stdout } = await runWindowsActivationScript(script);
  const result = JSON.parse(stdout.trim());
  const processId = Number(result.ProcessId);
  if (!Number.isInteger(processId) || processId <= 0) {
    throw new Error("Windows 打包应用激活接口没有返回有效进程 ID。");
  }
  return processId;
}

export async function restoreWindowsPackagedApp(appUserModelId) {
  try {
    return await activateWindowsPackagedApp(appUserModelId, []);
  } catch {
    const shellTarget = `shell:AppsFolder\\${appUserModelId}`;
    await execFileAsync("explorer.exe", [shellTarget], { windowsHide: true });
    return null;
  }
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
    if (target.appUserModelId && target.appUserModelId !== installation.appUserModelId) return false;
    if (target.bundleIdentifier && target.bundleIdentifier !== installation.bundleIdentifier) return false;
    if (target.teamIdentifier && target.teamIdentifier !== installation.teamIdentifier) return false;
    return true;
  }) ?? null;
}
