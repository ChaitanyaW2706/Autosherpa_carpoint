from fastapi import APIRouter
from fastapi.responses import JSONResponse
from db import get_db

router = APIRouter()



# ── Create table if not exists (call once on startup) ─────────────────────────
def init_block_table():
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS blocked_numbers (
                id         INT AUTO_INCREMENT PRIMARY KEY,
                phone      VARCHAR(20) UNIQUE NOT NULL,
                blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        db.commit()
        cur.close()
        db.close()
    except Exception as e:
        print(f"[block] DB init error: {e}")


# ── GET  /block/list  →  all blocked numbers ──────────────────────────────────
@router.get("/list")
def get_blocked_list():
    try:
        db  = get_db()
        cur = db.cursor(dictionary=True)
        cur.execute("SELECT id, phone, blocked_at FROM blocked_numbers ORDER BY blocked_at DESC")
        rows = cur.fetchall()
        cur.close(); db.close()

        # Convert datetime to string for JSON
        for r in rows:
            if r.get("blocked_at"):
                r["blocked_at"] = str(r["blocked_at"])

        return {"blocked": rows}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


# ── POST /block/add   →  block a number ──────────────────────────────────────
@router.post("/add")
async def block_number(payload: dict):
    phone = (payload.get("phone") or "").strip()
    if not phone:
        return JSONResponse(status_code=400, content={"detail": "Phone is required"})

    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute(
            "INSERT IGNORE INTO blocked_numbers (phone) VALUES (%s)",
            (phone,)
        )
        db.commit()
        affected = cur.rowcount
        cur.close(); db.close()

        if affected == 0:
            return {"message": "Already blocked", "phone": phone}
        return {"message": "Blocked successfully", "phone": phone}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


# ── DELETE /block/remove/{phone}  →  unblock ─────────────────────────────────
@router.delete("/remove/{phone}")
def unblock_number(phone: str):
    phone = phone.strip()
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("DELETE FROM blocked_numbers WHERE phone = %s", (phone,))
        db.commit()
        affected = cur.rowcount
        cur.close(); db.close()

        if affected == 0:
            return JSONResponse(status_code=404, content={"detail": "Number not in block list"})
        return {"message": "Unblocked successfully", "phone": phone}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


# ── GET /block/check/{phone}  →  is this number blocked? ─────────────────────
@router.get("/check/{phone}")
def check_blocked(phone: str):
    try:
        db  = get_db()
        cur = db.cursor()
        cur.execute("SELECT id FROM blocked_numbers WHERE phone = %s", (phone.strip(),))
        row = cur.fetchone()
        cur.close(); db.close()
        return {"phone": phone, "blocked": row is not None}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


















