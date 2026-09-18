from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import ROOT_DIR, settings
from app.core.database import init_db
from app.routers import applications, api_profiles, auth, cloud_proxy, greetings, health, job_library, jobs, license, membership, resume, settings as settings_router, setup, stats

app = FastAPI(title="求职助手 API", version="2.0.0")

_NO_CACHE = "no-cache, no-store, must-revalidate, max-age=0"
_ASSET_CACHE = "public, max-age=31536000, immutable"


class WebCacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        path = request.url.path
        if path.startswith("/assets/"):
            response.headers["Cache-Control"] = _ASSET_CACHE
        elif not path.startswith("/api") and path not in {"/docs", "/redoc", "/openapi.json"}:
            response.headers["Cache-Control"] = _NO_CACHE
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response


app.add_middleware(WebCacheMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_origin_regex=(
        r"^(?:https?://(?:127\.0\.0\.1|localhost)(?::\d+)?"
        r"|chrome-extension://[a-p]{32})$"
    ),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)

if settings.is_cloud_server:
    app.include_router(license.router)
    app.include_router(auth.router)
    app.include_router(membership.router)
else:
    app.include_router(resume.router)
    app.include_router(jobs.router)
    app.include_router(applications.router)
    app.include_router(job_library.router)
    app.include_router(greetings.router)
    app.include_router(settings_router.router)
    app.include_router(api_profiles.router)
    app.include_router(stats.router)
    app.include_router(setup.router)
    if settings.uses_cloud_membership:
        app.include_router(cloud_proxy.router)
    else:
        app.include_router(license.router)
        app.include_router(auth.router)
        app.include_router(membership.router)


def _web_dist_dir() -> Path | None:
    root = ROOT_DIR
    candidates = (
        root / "apps" / "web" / "dist",
        root / "web",
        root / "release" / "web",
        root.parent / "web",
    )
    for candidate in candidates:
        if (candidate / "index.html").is_file() and (candidate / "assets").is_dir():
            return candidate
    return None


def _mount_web_spa(app: FastAPI, web_dir: Path, *, cloud_only: bool = False) -> None:
    index_path = web_dir / "index.html"
    assets_dir = web_dir / "assets"
    version_path = web_dir / "build-version.txt"
    web_root = web_dir.resolve()

    no_cache_headers = {
        "Cache-Control": _NO_CACHE,
        "Pragma": "no-cache",
        "Expires": "0",
    }

    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/build-version.txt", include_in_schema=False)
    async def serve_build_version():
        if not version_path.is_file():
            raise HTTPException(status_code=404, detail="build-version.txt missing")
        return FileResponse(version_path, media_type="text/plain", headers=no_cache_headers)

    allowed_spa_paths = None

    @app.get("/", include_in_schema=False)
    async def serve_index():
        if cloud_only:
            return Response(
                content="求职助手会员云服务运行中。运营后台：/wsp",
                media_type="text/plain; charset=utf-8",
            )
        if not index_path.is_file():
            raise HTTPException(status_code=404, detail="index.html missing")
        return FileResponse(index_path, media_type="text/html", headers=no_cache_headers)

    @app.get("/{spa_path:path}", include_in_schema=False)
    async def serve_spa(spa_path: str = ""):
        if spa_path.startswith("api") or spa_path in {"docs", "redoc", "openapi.json"}:
            raise HTTPException(status_code=404)
        if spa_path == "build-version.txt":
            raise HTTPException(status_code=404)

        if cloud_only and spa_path:
            head = spa_path.split("/")[0]
            if head not in {"login", "register", "forgot-password", "wsp"}:
                raise HTTPException(status_code=404)

        if spa_path:
            candidate = (web_dir / spa_path).resolve()
            try:
                candidate.relative_to(web_root)
            except ValueError:
                raise HTTPException(status_code=404) from None
            if candidate.is_file():
                return FileResponse(candidate, headers=no_cache_headers)

        if not index_path.is_file():
            raise HTTPException(status_code=404, detail="index.html missing")
        return FileResponse(index_path, media_type="text/html", headers=no_cache_headers)


@app.on_event("startup")
async def on_startup():
    init_db()
    web_dir = _web_dist_dir()
    if web_dir:
        _mount_web_spa(app, web_dir, cloud_only=settings.is_cloud_server)
