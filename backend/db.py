import os
from pathlib import Path
import mysql.connector
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

from pymongo import MongoClient

def get_db():
    return mysql.connector.connect(
        host=os.getenv("MYSQL_HOST"),
        port=os.getenv("MYSQL_PORT"),
        user=os.getenv("MYSQL_USER"),
        password=os.getenv("MYSQL_PASSWORD"),
        database=os.getenv("MYSQL_DB")
    )

def get_mongo_col():
    client = MongoClient(os.getenv("MONGO_URI"))
    db = client[os.getenv("MONGO_DB")]
    return db[os.getenv("MONGO_COLLECTION")]

def get_uploads_dir() -> str:
    # 1. Check environment variable first
    uploads_dir = os.getenv("UPLOADS_DIR")
    if uploads_dir:
        return uploads_dir
        
    # 2. Try fetching dynamically from latest database entry
    try:
        db = get_db()
        cur = db.cursor(dictionary=True)
        cur.execute("SELECT file_path, relative_path FROM uploaded_images ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        cur.close()
        db.close()
        
        if row and row.get("file_path") and row.get("relative_path"):
            fpath = os.path.abspath(row["file_path"])
            rpath = row["relative_path"].replace("/", os.sep).replace("\\", os.sep)
            if rpath in fpath:
                r_parts = rpath.split(os.sep)
                if "uploads" in r_parts:
                    idx = r_parts.index("uploads")
                    suffix_parts = r_parts[idx:]
                    suffix_path = os.sep.join(suffix_parts)
                    if fpath.endswith(suffix_path):
                        resolved = fpath[:-len(suffix_path)].rstrip(os.sep) + os.sep + "uploads"
                        if os.path.exists(resolved):
                            return resolved
    except Exception:
        pass
        
    # 3. Local fallback for development/fresh install
    local_fallback = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
    os.makedirs(local_fallback, exist_ok=True)
    return local_fallback
