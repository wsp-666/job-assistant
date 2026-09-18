"""
求职助手本地启动器 — 打包为 JobAssistant.exe。
桌面 GUI 窗口，后台启动服务，Edge 应用模式打开管理台。
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path

try:
    import tkinter as tk
    from tkinter import ttk
except ImportError:
    tk = None  # type: ignore[assignment]

CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0
DEV_ADMIN_URL = "http://127.0.0.1:5173"
RELEASE_ADMIN_URL = "http://127.0.0.1:8000"
API_HEALTH = "http://127.0.0.1:8000/health"


def get_project_root() -> Path:
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).resolve().parent
        for candidate in (exe_dir.parent, exe_dir):
            if (candidate / "apps" / "api").exists():
                return candidate
            if (candidate / "api" / "app").exists() and (candidate / "web").exists():
                return candidate
        return exe_dir.parent if (exe_dir.parent / ".venv").exists() else exe_dir
    return Path(__file__).resolve().parent.parent


def is_release_layout(root: Path) -> bool:
    return (root / "api" / "app").exists() and (root / "web").exists() and not (root / "apps").exists()


def has_bundled_web(root: Path) -> bool:
    candidates = (
        root / "apps" / "web" / "dist",
        root / "web",
        root / "release" / "web",
    )
    return any(
        (path / "index.html").is_file() and (path / "assets").is_dir() for path in candidates
    )


def find_python(root: Path) -> Path | None:
    for rel in (
        "runtime/Scripts/python.exe",
        ".venv/Scripts/python.exe",
        "venv/Scripts/python.exe",
    ):
        path = root / rel
        if path.is_file():
            return path
    return None


def find_edge() -> Path | None:
    if sys.platform != "win32":
        return None
    candidates = [
        Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"))
        / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Microsoft/Edge/Application/msedge.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/Edge/Application/msedge.exe",
    ]
    for path in candidates:
        if path.is_file():
            return path
    return None


def stop_ports(ports: tuple[int, ...] = (8000, 5173, 5174)) -> None:
    if sys.platform != "win32":
        return
    try:
        out = subprocess.check_output(
            ["netstat", "-ano"],
            text=True,
            errors="ignore",
            creationflags=CREATE_NO_WINDOW,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        return
    pids: set[str] = set()
    for line in out.splitlines():
        if "LISTENING" not in line:
            continue
        if not any(f":{port}" in line for port in ports):
            continue
        parts = re.split(r"\s+", line.strip())
        if not parts:
            continue
        pid = parts[-1]
        if pid.isdigit() and pid != "0":
            pids.add(pid)
    for pid in pids:
        subprocess.run(
            ["taskkill", "/PID", pid, "/F"],
            capture_output=True,
            creationflags=CREATE_NO_WINDOW,
        )


def stop_port(port: int) -> None:
    stop_ports((port,))


def http_ok(url: str, timeout: float = 0.8) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.status == 200
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def find_build_version(root: Path) -> str:
    candidates = (
        root / "apps" / "web" / "dist" / "build-version.txt",
        root / "web" / "build-version.txt",
        root / "release" / "web" / "build-version.txt",
    )
    for path in candidates:
        if path.is_file():
            try:
                text = path.read_text(encoding="utf-8").strip()
                if text:
                    return text
            except OSError:
                continue
    return str(int(time.time()))


def admin_url_with_version(root: Path, base_url: str) -> str:
    version = find_build_version(root)
    sep = "&" if "?" in base_url else "?"
    return f"{base_url}{sep}_v={urllib.parse.quote(version, safe='')}"


def admin_page_ok(url: str) -> bool:
    if not http_ok(url):
        return False
    try:
        with urllib.request.urlopen(url, timeout=1.2) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
    except (urllib.error.URLError, TimeoutError, OSError):
        return False
    return "<html" in html.lower() and len(html.strip()) > 100


def services_running(release: bool, bundled_web: bool = False) -> bool:
    if not http_ok(API_HEALTH):
        return False
    if release or bundled_web:
        return admin_page_ok(RELEASE_ADMIN_URL)
    return http_ok(DEV_ADMIN_URL)


class ServiceCore:
    def __init__(self) -> None:
        self.root = Path(get_project_root())
        self.release = is_release_layout(self.root)
        self.bundled_web = has_bundled_web(self.root)
        self.python = find_python(self.root)
        self.processes: list[subprocess.Popen] = []
        self._log_handles: list[object] = []
        self._started_by_us = False
        self.log_dir = self.root / "data"
        self.api_log = self.log_dir / "launcher-api.log"

    def _close_log_handles(self) -> None:
        for handle in self._log_handles:
            try:
                handle.flush()
                handle.close()
            except Exception:
                pass
        self._log_handles.clear()

    def _spawn(self, args: list[str] | str, cwd: Path, *, shell: bool = False, extra_env: dict | None = None) -> None:
        kwargs: dict = {"cwd": str(cwd), "shell": shell}
        if extra_env is not None:
            kwargs["env"] = extra_env
        if sys.platform == "win32":
            kwargs["creationflags"] = CREATE_NO_WINDOW
        if not shell and isinstance(args, list) and "uvicorn" in args:
            self.log_dir.mkdir(parents=True, exist_ok=True)
            log_file = open(self.api_log, "w", encoding="utf-8", errors="replace", buffering=1)
            self._log_handles.append(log_file)
            kwargs["stdout"] = log_file
            kwargs["stderr"] = subprocess.STDOUT
        self.processes.append(subprocess.Popen(args, **kwargs))

    def stop_all(self, *, blocking: bool = True, kill_ports: bool = False) -> None:
        procs = list(self.processes)
        self.processes.clear()
        for proc in procs:
            if proc.poll() is None:
                proc.terminate()
        self._close_log_handles()

        should_kill_ports = kill_ports or self._started_by_us
        self._started_by_us = False

        if not should_kill_ports:
            return

        def _kill_ports() -> None:
            stop_ports((8000, 5173, 5174))

        if blocking:
            _kill_ports()
        else:
            threading.Thread(target=_kill_ports, daemon=True).start()

    def _repair_pyvenv_cfg(self) -> bool:
        base = self.root / "runtime" / "base-python"
        cfg = self.root / "runtime" / "pyvenv.cfg"
        if not (base / "python.exe").is_file():
            return False
        version = "3.12.7"
        if cfg.is_file():
            try:
                for line in cfg.read_text(encoding="utf-8", errors="replace").splitlines():
                    if line.strip().lower().startswith("version ="):
                        version = line.split("=", 1)[1].strip() or version
                        break
            except OSError:
                pass
        try:
            cfg.write_text(
                f"home = {base}\ninclude-system-site-packages = false\nversion = {version}\n",
                encoding="utf-8",
            )
            return True
        except OSError:
            return False

    def validate_install(self) -> str:
        if not self.python or not self.python.is_file():
            return "未找到运行环境 runtime\\Scripts\\python.exe，请重新安装本程序"
        cfg = self.root / "runtime" / "pyvenv.cfg"
        if cfg.is_file():
            try:
                text = cfg.read_text(encoding="utf-8", errors="replace")
                for line in text.splitlines():
                    if line.strip().lower().startswith("home ="):
                        home = line.split("=", 1)[1].strip()
                        if home and not Path(home).exists():
                            if self._repair_pyvenv_cfg():
                                break
                            if not (self.root / "runtime" / "base-python" / "python.exe").is_file():
                                return (
                                    "安装不完整（缺少 runtime\\base-python）。"
                                    "请卸载后重新安装最新版 Setup.exe"
                                )
                            return (
                                "运行环境配置无效（指向不存在的 Python 路径）。"
                                "请运行安装目录中的「修复运行环境.bat」，或重新安装本程序"
                            )
                        break
            except OSError:
                pass
        if not (self._api_cwd() / "app" / "main.py").is_file():
            return "安装不完整（缺少 api 程序），请重新运行安装包"
        if self.release and not (self.root / "web" / "index.html").is_file():
            return "安装不完整（缺少 web 管理台），请重新运行安装包"
        return ""

    def _read_api_log_tail(self, max_chars: int = 1200) -> str:
        if not self.api_log.is_file():
            return ""
        try:
            return self.api_log.read_text(encoding="utf-8", errors="replace")[-max_chars:]
        except OSError:
            return ""

    def _process_exited(self) -> bool:
        return any(proc.poll() is not None for proc in self.processes)

    def _process_exit_code(self) -> int | None:
        for proc in self.processes:
            code = proc.poll()
            if code is not None:
                return code
        return None

    def _api_env(self) -> dict[str, str]:
        env = os.environ.copy()
        env["PYTHONNOUSERSITE"] = "1"
        env["PYTHONUTF8"] = "1"
        return env

    def _api_cwd(self) -> Path:
        return self.root / "api" if self.release else self.root / "apps" / "api"

    def _preflight_api(self) -> str:
        py = str(self.python)
        cwd = self._api_cwd()
        try:
            result = subprocess.run(
                [py, "-c", "import uvicorn; print('ok')"],
                cwd=str(cwd),
                env=self._api_env(),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=45,
                creationflags=CREATE_NO_WINDOW if sys.platform == "win32" else 0,
            )
        except subprocess.TimeoutExpired:
            return "运行环境预检超时，请查看 data\\launcher-api.log 或重新安装"
        except OSError as exc:
            return f"无法启动 Python：{exc}"

        if result.returncode == 0:
            return ""

        output = "\n".join(part.strip() for part in (result.stderr, result.stdout) if part and part.strip())
        if not output:
            return f"运行环境预检失败（退出码 {result.returncode}）"

        last_line = ""
        for line in reversed(output.splitlines()):
            text = line.strip()
            if text:
                last_line = text[:160]
                break
        return f"运行环境预检失败：{last_line or output[:160]}"

    def start_services(self, *, force: bool = False) -> None:
        install_error = self.validate_install()
        if install_error:
            raise RuntimeError(install_error)

        if not self.python:
            raise RuntimeError("未找到 Python 运行环境，请重新安装本程序")

        if not force and services_running(self.release, self.bundled_web):
            self._started_by_us = False
            return

        self.stop_all()
        preflight_error = self._preflight_api()
        if preflight_error:
            raise RuntimeError(preflight_error)

        self._started_by_us = True
        py = str(self.python)
        env = self._api_env()

        if self.release:
            self._spawn(
                [py, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
                self.root / "api",
                extra_env=env,
            )
        else:
            self._spawn(
                [py, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
                self.root / "apps" / "api",
                extra_env=env,
            )
            if not self.bundled_web:
                self._spawn("npx vite --host 127.0.0.1", self.root / "apps" / "web", shell=True)
            ext_dist = self.root / "apps" / "extension" / "dist"
            if not ext_dist.is_dir():
                self._spawn("npx vite", self.root / "apps" / "extension", shell=True)

    def wait_ready(self, seconds: int = 180) -> bool:
        deadline = time.time() + seconds
        while time.time() < deadline:
            if self._process_exited():
                return False
            if services_running(self.release, self.bundled_web):
                return True
            time.sleep(0.35)
        return False

    def admin_url(self) -> str:
        if self.release or self.bundled_web:
            return RELEASE_ADMIN_URL
        return DEV_ADMIN_URL

    def readiness_hint(self) -> str:
        api_ok = http_ok(API_HEALTH)
        if self.release or self.bundled_web:
            web_ok = admin_page_ok(RELEASE_ADMIN_URL)
            if not api_ok:
                return self._api_failure_hint()
            if not web_ok:
                return (
                    "API 已启动，但管理台前端资源加载失败。"
                    "请在 apps\\web 执行 npm run build 后重试。"
                )
            return ""
        web_ok = http_ok(DEV_ADMIN_URL)
        if not api_ok:
            return self._api_failure_hint()
        if not web_ok:
            return (
                "API 已启动，但 5173 前端未就绪。"
                "若未安装 Node.js，请在 apps\\web 执行 npm run build 后重试，"
                "或安装 Node.js。"
            )
        return ""

    def _api_failure_hint(self) -> str:
        log_path = self.api_log
        tail = self._read_api_log_tail()
        if tail:
            for keyword, message in (
                ("ModuleNotFoundError", "缺少程序依赖"),
                ("DLL load failed", "系统缺少运行库，请安装 Microsoft Visual C++ 2015-2022 运行库"),
                ("Address already in use", "端口 8000 被其他程序占用"),
                ("PermissionError", "权限不足或被安全软件拦截"),
                ("WinError 5", "权限不足或被安全软件拦截"),
            ):
                if keyword in tail:
                    return f"API 启动失败：{message}。日志：{log_path}"

            for line in reversed(tail.splitlines()):
                text = line.strip()
                if text and any(token in text for token in ("Error", "Traceback", "Exception", "ModuleNotFoundError")):
                    if len(text) > 120:
                        text = text[:117] + "..."
                    return f"API 启动失败：{text}。日志：{log_path}"

        if self._process_exited():
            exit_code = self._process_exit_code()
            code_text = f"（退出码 {exit_code}）" if exit_code is not None else ""
            tail = self._read_api_log_tail()
            if tail.strip():
                return f"API 进程已退出{code_text}，未能监听 8000 端口。日志：{log_path}"
            return (
                f"API 进程已退出{code_text}，未能监听 8000 端口。"
                "可能被安全软件拦截，请将安装目录加入白名单后重试。"
                f"日志：{log_path}"
            )

        return (
            "API 未在 8000 端口就绪。首次启动可能需 1-2 分钟；"
            f"若仍失败请查看 {log_path}，并尝试暂时关闭杀毒软件或以管理员重新安装"
        )

    def open_admin_app(self) -> None:
        url = admin_url_with_version(self.root, self.admin_url())
        edge = find_edge()
        if edge:
            subprocess.Popen(
                [
                    str(edge),
                    f"--app={url}",
                    "--new-window",
                    "--disable-http-cache",
                    "--disable-features=msEdgeSidebarV2",
                ],
            )
            return
        webbrowser.open(url)


class LauncherApp:
    def __init__(self) -> None:
        self.core = ServiceCore()
        self._busy = False
        self._running = False

        self.win = tk.Tk()
        self.win.title("求职助手")
        self.win.geometry("420x280")
        self.win.minsize(420, 280)
        self.win.resizable(False, False)
        self._center_window()
        self.win.configure(bg="#f5f6f8")
        self.win.protocol("WM_DELETE_WINDOW", self._on_close)

        style = ttk.Style()
        if sys.platform == "win32":
            style.theme_use("vista")

        header = tk.Frame(self.win, bg="#2563eb", height=72)
        header.pack(fill="x")
        header.pack_propagate(False)
        tk.Label(
            header,
            text="求职助手",
            font=("Microsoft YaHei UI", 16, "bold"),
            fg="white",
            bg="#2563eb",
        ).pack(anchor="w", padx=20, pady=(14, 0))
        tk.Label(
            header,
            text="本地一键启动 · 管理台与 BOSS 插件",
            font=("Microsoft YaHei UI", 9),
            fg="#dbeafe",
            bg="#2563eb",
        ).pack(anchor="w", padx=20, pady=(2, 0))

        body = tk.Frame(self.win, bg="#f5f6f8", padx=20, pady=16)
        body.pack(fill="both", expand=True)

        self.status_var = tk.StringVar(value="就绪，点击下方「一键启动」")
        status_frame = tk.Frame(body, bg="white", highlightbackground="#e5e7eb", highlightthickness=1)
        status_frame.pack(fill="x", pady=(0, 14))
        tk.Label(
            status_frame,
            textvariable=self.status_var,
            font=("Microsoft YaHei UI", 10),
            fg="#374151",
            bg="white",
            anchor="w",
            justify="left",
            wraplength=360,
            padx=12,
            pady=10,
        ).pack(fill="x")

        self.progress = ttk.Progressbar(body, mode="indeterminate", length=360)
        self.progress.pack(fill="x", pady=(0, 14))

        btn_row = tk.Frame(body, bg="#f5f6f8")
        btn_row.pack(fill="x")

        self.btn_start = ttk.Button(btn_row, text="一键启动", command=self._start_clicked, width=14)
        self.btn_start.grid(row=0, column=0, padx=(0, 8), pady=4)

        self.btn_admin = ttk.Button(btn_row, text="打开应用", command=self._open_admin, width=14, state="disabled")
        self.btn_admin.grid(row=0, column=1, pady=4)

        hint = "关闭本窗口将自动停止服务 · 首次使用请在 Edge 加载 extension 插件"
        tk.Label(
            body,
            text=hint,
            font=("Microsoft YaHei UI", 8),
            fg="#6b7280",
            bg="#f5f6f8",
            justify="left",
            anchor="w",
        ).pack(fill="x", pady=(10, 0))

        if not self.core.python:
            self.status_var.set("未找到 Python 运行环境，请重新安装本程序")
            self.btn_start.configure(state="disabled")
        else:
            install_error = self.core.validate_install()
            if install_error:
                self.status_var.set(install_error)
                self.btn_start.configure(state="disabled")
            elif services_running(self.core.release, self.core.bundled_web):
                self._set_running_ui(already=True)

    def _center_window(self) -> None:
        self.win.update_idletasks()
        w, h = 420, 280
        x = (self.win.winfo_screenwidth() - w) // 2
        y = (self.win.winfo_screenheight() - h) // 2
        self.win.geometry(f"{w}x{h}+{x}+{y}")

    def _set_busy(self, busy: bool, status: str | None = None) -> None:
        self._busy = busy
        if status:
            self.status_var.set(status)
        if busy:
            self.progress.start(12)
            self.btn_start.configure(state="disabled")
        else:
            self.progress.stop()
            if not self._running:
                self.btn_start.configure(state="normal")

    def _set_running_ui(self, *, already: bool = False) -> None:
        self._running = True
        self.progress.stop()
        self.btn_start.configure(state="disabled")
        self.btn_admin.configure(state="normal")
        if already:
            self.core._started_by_us = True
            self.status_var.set("服务已在运行，可直接打开应用；关闭本窗口将停止服务")
        else:
            self.status_var.set("运行中 · 打开应用使用，关闭本窗口将自动停止服务")

    def _start_clicked(self) -> None:
        if self._busy:
            return
        self._set_busy(True, "正在启动后台服务，请稍候…")
        threading.Thread(target=self._start_worker, daemon=True).start()

    def _start_worker(self) -> None:
        try:
            self.core.start_services(force=True)
            if services_running(self.core.release, self.core.bundled_web):
                ready = True
            else:
                self.win.after(0, lambda: self.status_var.set("等待 API 与应用就绪…"))
                ready = self.core.wait_ready()
            if not ready:
                hint = self.core.readiness_hint()
                self.win.after(0, lambda: self._start_failed(hint))
                return
            self.win.after(0, lambda: self._set_running_ui())
        except Exception as exc:
            self.win.after(0, lambda: self._start_error(str(exc)))

    def _start_failed(self, hint: str = "") -> None:
        self.core.stop_all()
        self._set_busy(False)
        self._running = False
        message = hint or "启动超时：请确认 8000 端口未被占用，并查看安装目录 data\\launcher-api.log"
        self.status_var.set(message)

    def _start_error(self, msg: str) -> None:
        self.core.stop_all()
        self._set_busy(False)
        self._running = False
        self.status_var.set(f"启动失败：{msg}")

    def _open_admin(self) -> None:
        if services_running(self.core.release, self.core.bundled_web):
            self.core.open_admin_app()
        else:
            self.status_var.set("服务未运行，请先点击「一键启动」")

    def _on_close(self) -> None:
        if self._running:
            threading.Thread(
                target=lambda: self.core.stop_all(blocking=True, kill_ports=True),
                daemon=False,
            ).start()
        else:
            self.core.processes.clear()
        self.win.destroy()

    def run(self) -> None:
        self.win.mainloop()


def main() -> None:
    if tk is None:
        print("tkinter 不可用", file=sys.stderr)
        sys.exit(1)
    LauncherApp().run()


if __name__ == "__main__":
    main()
