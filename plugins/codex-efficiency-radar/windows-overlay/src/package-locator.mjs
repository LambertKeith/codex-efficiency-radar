import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function sha256(filePath) {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex").toUpperCase();
}

export async function locateCodexPackage(packageName) {
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

export async function findCodexMainProcess(executablePath) {
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

export async function isCodexMainProcessRunning(executablePath) {
  return Boolean(await findCodexMainProcess(executablePath));
}

export function matchCompatibility(installation, compatibility) {
  return compatibility.targets.find(
    (target) =>
      target.packageVersion === installation.packageVersion &&
      target.appVersion === installation.appVersion &&
      target.executableVersion === installation.executableVersion &&
      target.asarSha256.toUpperCase() === installation.asarSha256.toUpperCase()
  ) ?? null;
}
