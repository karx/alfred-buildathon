const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

/**
 * Native OS folder dialog (blocks until user picks or cancels).
 * Windows: WinForms FolderBrowserDialog via PowerShell STA
 * macOS:   osascript choose folder
 * Linux:   zenity or kdialog when available
 */
async function pickFolderNative({ startPath } = {}) {
  const platform = process.platform;
  const start = startPath && fs.existsSync(startPath) ? path.resolve(startPath) : os.homedir();

  try {
    if (platform === "win32") {
      return await pickWindows(start);
    }
    if (platform === "darwin") {
      return await pickMac(start);
    }
    return await pickLinux(start);
  } catch (err) {
    return {
      ok: false,
      cancelled: false,
      message: err.message || "Folder picker failed",
    };
  }
}

async function pickWindows(startPath) {
  // STA required for WinForms; escape single quotes for PowerShell string
  const startEsc = String(startPath).replace(/'/g, "''");
  const script = `
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select Alfred vault folder'
$dialog.ShowNewFolderButton = $true
try { $dialog.SelectedPath = '${startEsc}' } catch {}
$dialog.UseDescriptionForTitle = $true
$r = $dialog.ShowDialog()
if ($r -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::Out.Write($dialog.SelectedPath)
} else {
  [Console]::Error.Write('CANCELLED')
  exit 2
}
`.trim();

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: false, timeout: 5 * 60 * 1000, maxBuffer: 1024 * 1024 }
    );
    const selected = String(stdout || "").trim();
    if (!selected) {
      return { ok: false, cancelled: true, message: "No folder selected" };
    }
    return { ok: true, path: path.resolve(selected) };
  } catch (err) {
    if (err.code === 2 || /CANCELLED/i.test(String(err.stderr || ""))) {
      return { ok: false, cancelled: true, message: "Cancelled" };
    }
    throw err;
  }
}

async function pickMac(startPath) {
  const startEsc = String(startPath).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  try {
    const { stdout } = await execFileAsync(
      "osascript",
      [
        "-e",
        `POSIX path of (choose folder with prompt "Select Alfred vault folder" default location POSIX file "${startEsc}")`,
      ],
      { timeout: 5 * 60 * 1000 }
    );
    const selected = String(stdout || "").trim().replace(/\/$/, "");
    if (!selected) return { ok: false, cancelled: true, message: "Cancelled" };
    return { ok: true, path: path.resolve(selected) };
  } catch (err) {
    // User cancel → exit 1 from osascript
    if (err.code === 1 || /User canceled/i.test(String(err.stderr || err.message))) {
      return { ok: false, cancelled: true, message: "Cancelled" };
    }
    throw err;
  }
}

async function pickLinux(startPath) {
  const candidates = [
    ["zenity", ["--file-selection", "--directory", `--filename=${startPath}/`, "--title=Select Alfred vault folder"]],
    ["kdialog", ["--getexistingdirectory", startPath, "Select Alfred vault folder"]],
  ];
  for (const [bin, args] of candidates) {
    try {
      const { stdout } = await execFileAsync(bin, args, { timeout: 5 * 60 * 1000 });
      const selected = String(stdout || "").trim();
      if (selected) return { ok: true, path: path.resolve(selected) };
    } catch (err) {
      if (err.code === 1) return { ok: false, cancelled: true, message: "Cancelled" };
      // try next dialog tool
    }
  }
  return {
    ok: false,
    cancelled: false,
    message: "No native folder dialog available (install zenity or kdialog), use the in-page browser",
  };
}

/** List Windows drive roots that exist, or ["/"] on POSIX. */
function listRoots() {
  if (process.platform === "win32") {
    const roots = [];
    for (const letter of "CDEFGHIJKLMNOPQRSTUVWXYZ") {
      const p = `${letter}:\\`;
      try {
        fs.accessSync(p);
        roots.push(p);
      } catch {
        /* skip */
      }
    }
    return roots.length ? roots : [os.homedir()];
  }
  return ["/"];
}

/**
 * List immediate subdirectories of `dirPath` for the in-page browser.
 * @param {string} [dirPath] - absolute path; empty → home or roots
 */
async function listDirectory(dirPath) {
  let resolved;
  if (!dirPath || !String(dirPath).trim()) {
    resolved = os.homedir();
  } else {
    resolved = path.resolve(dirPath);
  }

  // At drive root on Windows parent is itself; expose multi-root at special ""
  let entries = [];
  let parent = null;
  let exists = true;

  try {
    const stats = await fs.promises.stat(resolved);
    if (!stats.isDirectory()) {
      return { ok: false, message: "Not a directory", path: resolved };
    }
  } catch {
    exists = false;
    return {
      ok: false,
      message: "Path does not exist",
      path: resolved,
      parent: path.dirname(resolved),
      entries: [],
    };
  }

  const parentCandidate = path.dirname(resolved);
  if (parentCandidate !== resolved) {
    parent = parentCandidate;
  } else if (process.platform === "win32") {
    parent = null; // at drive root — UI can jump to roots list
  }

  const names = await fs.promises.readdir(resolved, { withFileTypes: true });
  entries = names
    .filter((d) => {
      if (!d.isDirectory()) return false;
      if (d.name === "." || d.name === "..") return false;
      // skip common noise
      if (d.name === "node_modules" || d.name === ".git") return false;
      return true;
    })
    .map((d) => ({
      name: d.name,
      path: path.join(resolved, d.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return {
    ok: true,
    path: resolved,
    parent,
    roots: listRoots(),
    home: os.homedir(),
    entries,
    exists,
  };
}

/**
 * Validate a vault path for the settings UI (does not require adapter).
 */
async function checkFolder(dirPath) {
  if (!dirPath || !String(dirPath).trim()) {
    return { ok: false, exists: false, message: "Enter a vault path" };
  }
  const resolved = path.resolve(String(dirPath).trim());
  try {
    const stats = await fs.promises.stat(resolved);
    if (!stats.isDirectory()) {
      return { ok: false, exists: true, isDirectory: false, path: resolved, message: "Path exists but is not a folder" };
    }
    await fs.promises.access(resolved, fs.constants.R_OK);
    let writable = true;
    try {
      await fs.promises.access(resolved, fs.constants.W_OK);
    } catch {
      writable = false;
    }

    // Light PARA / Obsidian hints
    const markers = ["0 Inbox", "1 Projects", ".obsidian", "Daily", "Templates"];
    const found = [];
    for (const m of markers) {
      try {
        const st = await fs.promises.stat(path.join(resolved, m));
        if (st.isDirectory()) found.push(m);
      } catch {
        /* missing */
      }
    }

    return {
      ok: true,
      exists: true,
      isDirectory: true,
      readable: true,
      writable,
      path: resolved,
      markers: found,
      looksLikeVault: found.length > 0,
      message: found.length
        ? `Readable folder · looks like a vault (${found.join(", ")})`
        : writable
          ? "Readable folder · empty or non-PARA (Initialize PARA after connect)"
          : "Readable folder (read-only)",
    };
  } catch (err) {
    if (err.code === "ENOENT") {
      return {
        ok: false,
        exists: false,
        path: resolved,
        message: "Folder does not exist yet (enable createIfMissing to create on connect)",
      };
    }
    return { ok: false, exists: false, path: resolved, message: err.message };
  }
}

module.exports = {
  pickFolderNative,
  listDirectory,
  listRoots,
  checkFolder,
};
