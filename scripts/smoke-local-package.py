"""Exercise the actual extracted release with its bundled Node, not system Node."""
import glob
import http.cookiejar
import json
from pathlib import Path
import platform
import socket
import subprocess
import tempfile
import time
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
release = json.loads((ROOT / "desktop/release.json").read_text())["version"]
system = {"Darwin":"darwin", "Windows":"win", "Linux":"linux"}[platform.system()]
arch = {"x86_64":"x64", "AMD64":"x64", "arm64":"arm64", "aarch64":"arm64"}[platform.machine()]
archive = ROOT / f"releases/Hygieia-{release}-{system}-{arch}.zip"

with tempfile.TemporaryDirectory(prefix="hygieia-package-") as temporary:
    work = Path(temporary)
    with zipfile.ZipFile(archive) as package:
        package.extractall(work)
        for member in package.infolist():
            mode = member.external_attr >> 16
            if mode:
                (work / member.filename).chmod(mode & 0o777)
    folder = work / archive.stem
    executable = folder / "runtime" / ("node.exe" if system == "win" else "node")
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    data = work / "private-test-data"
    with open(work / "test-output.txt", "wb") as log:
        process = subprocess.Popen([str(executable), "--no-warnings", str(folder / "app/server.mjs"), "--data-dir", str(data), "--port", str(port), "--no-open"], stdout=log, stderr=log)
        try:
            for _ in range(100):
                if (data / "running.json").exists():
                    break
                if process.poll() is not None:
                    raise RuntimeError(f"Bundled runtime exited {process.returncode}: " + (work / "test-output.txt").read_text(errors="replace"))
                time.sleep(0.1)
            session = json.loads((data / "running.json").read_text())
            origin = f"http://127.0.0.1:{port}"
            client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
            with client.open(origin + "/_local/open?token=" + session["token"], timeout=10) as response:
                assert "local-ui.js" in response.read().decode()
            with client.open(origin + "/api/personal", timeout=10) as response:
                result = json.load(response)
                assert result["records"] == [] and result["owner"].startswith("local-")
            with client.open(origin + "/vendor/body-ocr/lang/chi_sim.traineddata.gz", timeout=10) as response:
                assert response.read(2) == b"\x1f\x8b"
            request = urllib.request.Request(origin + "/_local/stop", data=b"", headers={"Origin":origin}, method="POST")
            with client.open(request, timeout=10) as response:
                assert json.load(response)["ok"]
            assert process.wait(timeout=10) == 0
            print("PASS extracted release: bundled runtime, authorization, empty SQLite, OCR model, clean exit")
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=10)
