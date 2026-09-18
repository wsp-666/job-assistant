#!/usr/bin/env python3
"""列出数据库中所有会员 Key 记录（明文 Key 仅生成时显示一次，库中只存哈希）。"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "job_assistant.db"


def main() -> None:
    if not DB.exists():
        print("数据库不存在，尚未生成过任何 Key。")
        print(f"路径: {DB}")
        sys.exit(0)

    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='license_keys'")
    if not cur.fetchone():
        print("license_keys 表不存在，尚未生成过 Key。")
        sys.exit(0)

    cur.execute(
        """
        SELECT id, plan, label, note, expires_at, max_activations, activation_count, is_revoked, created_at
        FROM license_keys ORDER BY id
        """
    )
    rows = cur.fetchall()

    cur.execute("SELECT value_json FROM settings WHERE key='license_activation'")
    act_row = cur.fetchone()
    active_id = None
    if act_row:
        try:
            active_id = json.loads(act_row["value_json"]).get("license_id")
        except json.JSONDecodeError:
            pass

    if not rows:
        print("当前没有任何 Key 记录。")
        sys.exit(0)

    print(f"共 {len(rows)} 条 Key 记录（明文 Key 不保存在数据库中）\n")
    headers = ["ID", "套餐", "标签", "备注", "到期", "已激活", "上限", "停用", "本机激活", "创建时间"]
    data = []
    for r in rows:
        data.append([
            str(r["id"]),
            r["plan"] or "",
            r["label"] or "",
            r["note"] or "",
            r["expires_at"] or "永久",
            str(r["activation_count"]),
            str(r["max_activations"]),
            "是" if r["is_revoked"] else "否",
            "是" if r["id"] == active_id else "否",
            (r["created_at"] or "")[:19],
        ])

    # markdown table
    print("| " + " | ".join(headers) + " |")
    print("| " + " | ".join(["---"] * len(headers)) + " |")
    for row in data:
        print("| " + " | ".join(row) + " |")

    conn.close()


if __name__ == "__main__":
    main()
