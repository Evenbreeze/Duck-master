import atexit
import logging
import os
import shutil
import subprocess
from pathlib import Path

from app import app
from config import DEBUG, VITE_BASE_API, DASHBOARD_PATH
from fastapi.staticfiles import StaticFiles

base_dir = Path(__file__).parent
build_dir = base_dir / 'build'
statics_dir = build_dir / 'statics'
logger = logging.getLogger("uvicorn.error")


def _normalize_dashboard_static_files() -> None:
    """
    Vite 默认输出 /assets/*，Marzban 约定挂载 /statics/。
    启动时复制并重写 index.html，避免 /dashboard/ 白屏（无需手改容器）。
    """
    if not build_dir.is_dir():
        return

    assets_dir = build_dir / 'assets'
    statics_dir.mkdir(parents=True, exist_ok=True)

    if assets_dir.is_dir():
        for item in assets_dir.iterdir():
            dest = statics_dir / item.name
            if item.is_file():
                shutil.copy2(item, dest)
            elif item.is_dir() and not dest.exists():
                shutil.copytree(item, dest, dirs_exist_ok=True)

    for name in ('index.html', '404.html'):
        path = build_dir / name
        if not path.is_file():
            continue
        text = path.read_text(encoding='utf-8')
        if '/assets/' not in text:
            continue
        path.write_text(text.replace('/assets/', '/statics/'), encoding='utf-8')
        logger.warning('dashboard: 已修正 %s 中 /assets/ → /statics/', name)


def build():
    proc = subprocess.Popen(
        ['npm', 'run', 'build', '--', '--outDir', build_dir, '--assetsDir', 'statics'],
        env={**os.environ, 'VITE_BASE_API': VITE_BASE_API},
        cwd=base_dir,
    )
    proc.wait()
    _normalize_dashboard_static_files()
    html = (build_dir / 'index.html').read_text(encoding='utf-8')
    (build_dir / '404.html').write_text(html, encoding='utf-8')


def run_dev():
    proc = subprocess.Popen(
        ['npm', 'run', 'dev', '--', '--host', '0.0.0.0', '--clearScreen', 'false',
         '--base', os.path.join(DASHBOARD_PATH, '')],
        env={**os.environ, 'VITE_BASE_API': VITE_BASE_API},
        cwd=base_dir,
    )
    atexit.register(proc.terminate)


def run_build():
    if not build_dir.is_dir():
        build()

    _normalize_dashboard_static_files()

    app.mount(
        DASHBOARD_PATH,
        StaticFiles(directory=build_dir, html=True),
        name="dashboard",
    )
    app.mount(
        '/statics/',
        StaticFiles(directory=statics_dir, html=False),
        name="statics",
    )
    legacy_assets = build_dir / 'assets'
    if legacy_assets.is_dir():
        app.mount(
            '/assets/',
            StaticFiles(directory=legacy_assets, html=False),
            name="dashboard-legacy-assets",
        )


@app.on_event("startup")
def startup():
    if DEBUG:
        run_dev()
    else:
        run_build()
