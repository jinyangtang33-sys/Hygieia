"""Package only the built local app and an official, checksum-verified Node binary."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import stat
import subprocess
import tarfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def download(url, destination):
    with urllib.request.urlopen(url, timeout=90) as response, open(destination, "wb") as output:
        shutil.copyfileobj(response, output)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--platform", choices=["darwin-x64", "darwin-arm64", "win-x64", "linux-x64", "linux-arm64"])
    options = parser.parse_args()
    system = {"Darwin": "darwin", "Windows": "win", "Linux": "linux"}.get(platform.system())
    architecture = {"x86_64": "x64", "AMD64": "x64", "arm64": "arm64", "aarch64": "arm64"}.get(platform.machine())
    target = options.platform or f"{system}-{architecture}"
    if target not in ["darwin-x64", "darwin-arm64", "win-x64", "linux-x64", "linux-arm64"]:
        raise SystemExit(f"Unsupported platform: {target}")
    app = ROOT / "dist/local"
    if not (app / "server.mjs").exists():
        raise SystemExit("Run node scripts/build-local.mjs first")
    version = json.loads((ROOT / "desktop/release.json").read_text(encoding="utf-8"))["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[a-z0-9.]+)?", version):
        raise SystemExit("Invalid release version")
    cache = ROOT / "dist/runtime-cache"
    cache.mkdir(parents=True, exist_ok=True)
    checksums = cache / "SHASUMS256.txt"
    download("https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt", checksums)
    extension = ".zip" if target.startswith("win-") else ".tar.gz"
    pattern = re.compile(r"^([a-f0-9]{64})\s+(node-(v22\.\d+\.\d+)-" + re.escape(target + extension) + r")$")
    selected = [match for line in checksums.read_text(encoding="utf-8").splitlines() if (match := pattern.fullmatch(line.strip()))]
    if len(selected) != 1:
        raise SystemExit("Official runtime checksum entry missing or ambiguous")
    expected, filename, node_version = selected[0].groups()
    archive = cache / filename
    url = f"https://nodejs.org/dist/{node_version}/{filename}"
    if not archive.exists() or hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
        download(url, archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
        archive.unlink(missing_ok=True)
        raise SystemExit("Official Node runtime SHA-256 mismatch")
    name = f"Hygieia-{version}-{target}"
    output = ROOT / "releases" / name
    if output.exists():
        shutil.rmtree(output)
    (output / "runtime").mkdir(parents=True)
    shutil.copytree(app, output / "app")
    prefix = filename.removesuffix(extension)
    binary = "node.exe" if target.startswith("win-") else "bin/node"
    if extension == ".zip":
        with zipfile.ZipFile(archive) as source:
            runtime = source.read(f"{prefix}/{binary}")
            license_text = source.read(f"{prefix}/LICENSE")
    else:
        with tarfile.open(archive, "r:gz") as source:
            # Extract two exact files, never extract an archive-supplied path.
            runtime = source.extractfile(f"{prefix}/{binary}").read()
            license_text = source.extractfile(f"{prefix}/LICENSE").read()
    executable = output / "runtime" / ("node.exe" if target.startswith("win-") else "node")
    executable.write_bytes(runtime)
    executable.chmod(0o755)
    signing = "upstream-unmodified"
    if target.startswith("darwin-"):
        if platform.system() != "Darwin":
            raise SystemExit("Build macOS packages on macOS so the executable signature can be verified")
        # Sign the newly written Mach-O even if static verification accepts the
        # upstream signature. This is not Developer ID or Apple notarization.
        subprocess.run(["codesign", "--force", "--sign", "-", str(executable)], check=True)
        signing = "ad-hoc-not-notarized"
        subprocess.run(["codesign", "--verify", str(executable)], check=True)
    (output / "runtime/NODE-LICENSE.txt").write_bytes(license_text)
    (output / "runtime/PROVENANCE.json").write_text(json.dumps({"version": node_version, "archive": filename, "url": url, "sha256": expected, "executableSigning": signing}, indent=2) + "\n", encoding="utf-8")
    if target.startswith("win-"):
        launcher = output / "Start-Hygieia.cmd"
        launcher.write_bytes(b'@echo off\r\ncd /d "%~dp0"\r\n"runtime\\node.exe" --no-warnings "app\\server.mjs"\r\nif errorlevel 1 pause\r\n')
    else:
        launcher = output / ("启动观己.command" if target.startswith("darwin-") else "Start-Hygieia.sh")
        launcher.write_text('#!/bin/sh\ncd -- "$(dirname -- "$0")" || exit 1\n./runtime/node --no-warnings app/server.mjs\nresult=$?\nif [ "$result" -ne 0 ]; then\n  printf "启动未完成，请查看上方提示。按回车关闭。\\n"\n  read -r answer\nfi\nexit "$result"\n', encoding="utf-8")
        launcher.chmod(0o755)
    shutil.copy2(ROOT / "docs/LOCAL_EDITION.md", output / "使用说明.md")
    for file in ["LICENSE", "THIRD_PARTY_NOTICES.md"]:
        shutil.copy2(ROOT / file, output / file)
    manifest = {}
    for file in sorted(output.rglob("*")):
        if file.is_symlink():
            raise SystemExit("Symlinks are not allowed in the release")
        if file.is_file():
            manifest[file.relative_to(output).as_posix()] = hashlib.sha256(file.read_bytes()).hexdigest()
    (output / "FILES-SHA256.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    zipped = Path(str(output) + ".zip")
    with zipfile.ZipFile(zipped, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive_file:
        for file in sorted(output.rglob("*")):
            if file.is_file():
                info = zipfile.ZipInfo.from_file(file, file.relative_to(output.parent).as_posix())
                # Keep POSIX executable bits even when building on Windows.
                info.create_system = 3
                mode = 0o755 if file == executable or file == launcher and not target.startswith("win-") else 0o644
                info.external_attr = (stat.S_IFREG | mode) << 16
                archive_file.writestr(info, file.read_bytes(), compress_type=zipfile.ZIP_DEFLATED)
    checksum_file = Path(str(zipped) + ".sha256")
    checksum_file.write_text(hashlib.sha256(zipped.read_bytes()).hexdigest() + "  " + zipped.name + "\n", encoding="utf-8")
    print(f"Packaged {zipped.name}; verified Node {node_version}; {len(manifest)} app/runtime files")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output_file:
            output_file.write(f"platform={target}\nversion={version}\n")


if __name__ == "__main__":
    main()
