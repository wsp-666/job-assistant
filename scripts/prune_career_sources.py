"""将本地招聘源裁剪为精选目录（删除历史批量导入）。"""
from app.core.database import SessionLocal, init_db
from app.services.career_sites_store import load_career_site_config, prune_career_sources_to_curated


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        before = len(load_career_site_config(db).sources)
        # load 已触发自动裁剪；再显式执行一次确保干净
        removed, after = prune_career_sources_to_curated(db)
        config = load_career_site_config(db)
        print(f"清理完成：{before} -> {len(config.sources)}（删除 {removed} 个）")
        for item in config.sources:
            print(f"  - {item.company} [{item.origin}] {item.list_url}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
