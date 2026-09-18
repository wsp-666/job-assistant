from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.config import ROOT_DIR, settings

router = APIRouter(prefix="/api/setup", tags=["setup"])


@router.get("/paths")
def install_paths():
    """返回本机安装目录与 Edge 插件目录的绝对路径。"""
    if not settings.is_local_app:
        raise HTTPException(404, "仅本机应用可用")

    extension_dir = ROOT_DIR / "extension"
    manifest = extension_dir / "manifest.json"
    return {
        "install_dir": str(ROOT_DIR.resolve()),
        "extension_dir": str(extension_dir.resolve()) if manifest.is_file() else "",
    }
