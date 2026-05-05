import csv
import io
import json
from fastapi import APIRouter, Query, Body, HTTPException, UploadFile, File
from db import get_db
from datetime import datetime, timezone, timedelta
from typing import Optional

IST = timezone(timedelta(hours=5, minutes=30))

router = APIRouter()

def find_car_by_key(cur, key: str):
    """
    Smart lookup: tries serial_number → registration_number → chassis_number.
    Returns (row, where_clause, where_value) so callers can run their own UPDATE/DELETE.
    where_clause uses `id` when possible — the safest unique key.
    """
    for col in ("serial_number", "registration_number", "chassis_number"):
        cur.execute(f"SELECT * FROM carstockdata WHERE `{col}`=%s LIMIT 1", (key,))
        row = cur.fetchone()
        if row:
            car_id = row.get("id")
            if car_id:
                return row, "id=%s", car_id
            return row, f"`{col}`=%s", key
    return None, None, None

FIELD_KEY_MAP = {
    "back_view_image":  "back",
    "right_view_image": "right",
    "front_view_image": "front",
    "left_view_image":  "left",
    "interior_image":   "interior",
}
KEY_FIELD_MAP = {v: k for k, v in FIELD_KEY_MAP.items()}

def parse_image_store_py(raw):
    """Parse image_url value into a label-keyed dict {back, right, front, left, interior}."""
    if not raw:
        return {}
    s = str(raw).strip()
    if not s:
        return {}
    # Already an object
    if s.startswith("{"):
        try:
            obj = json.loads(s)
            return {k: v for k, v in obj.items() if v not in (None, "")}
        except Exception:
            return {}
    # Legacy array — map by position
    if s.startswith("["):
        try:
            arr = json.loads(s)
            keys = ["back", "right", "front", "left", "interior"]
            return {keys[i]: v for i, v in enumerate(arr) if i < len(keys) and v not in (None, "")}
        except Exception:
            return {}
    # Single value — treat as back view
    if s:
        return {"back": s}
    return {}

def build_legacy_image_url(item, fallback_image_url=None):
    """
    Merge incoming view fields + existing image_url into one JSON object.
    Format: {"back": "...", "right": "...", "front": "...", "left": "...", "interior": "..."}
    This label-based format never shifts on delete.
    """
    # Start from existing image_url (parse whatever format it is)
    existing_raw = item.get("image_url") if item.get("image_url") not in (None, "") else fallback_image_url
    img_dict = parse_image_store_py(existing_raw)

    # Merge new view fields sent in this request
    for field, key in FIELD_KEY_MAP.items():
        val = item.get(field)
        if val not in (None, ""):
            img_dict[key] = val

    if not img_dict:
        return None
    return json.dumps(img_dict)

@router.post("/stock")
def create_used_car_stock(item: dict = Body(...)):
    db = get_db()
    cur = db.cursor()
    try:
        # Try with new image fields first, fallback if columns don't exist
        try:
            cur.execute(
                """
                INSERT INTO carstockdata
                (`serial_number`, `make`, `model`, `variant`, `color`, `fuel_type`,
                 `registration_number`, `registration_date`, `rc_status`, `rc_expiry_date`,
                 `chassis_number`, `engine_number`, `manufacturing_year`, `manufacturing_month`,
                 `owner_serial_number`, `mileage_km`, `cubic_capacity_cc`, `emission_norms`,
                 `transmission_type`, `vehicle_category`, `insurance_type`, `insurance_expiry_date`,
                 `estimated_selling_price`, `ready_for_sales`, `image_url`, `back_view_image`, 
                 `right_view_image`, `front_view_image`, `left_view_image`, `interior_image`, 
                 `type`, `CreatedAt`, `Category`)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    item.get("serial_number"),
                    item.get("make"),
                    item.get("model"),
                    item.get("variant"),
                    item.get("color"),
                    item.get("fuel_type"),
                    item.get("registration_number"),
                    item.get("registration_date") or None,
                    item.get("rc_status"),
                    item.get("rc_expiry_date") or None,
                    item.get("chassis_number"),
                    item.get("engine_number"),
                    item.get("manufacturing_year"),
                    item.get("manufacturing_month"),
                    item.get("owner_serial_number"),
                    item.get("mileage_km"),
                    item.get("cubic_capacity_cc"),
                    item.get("emission_norms"),
                    item.get("transmission_type"),
                    item.get("vehicle_category"),
                    item.get("insurance_type"),
                    item.get("insurance_expiry_date") or None,
                    item.get("estimated_selling_price"),
                    item.get("ready_for_sales"),
                    item.get("image_url"),
                    item.get("back_view_image"),
                    item.get("right_view_image"),
                    item.get("front_view_image"),
                    item.get("left_view_image"),
                    item.get("interior_image"),
                    item.get("type"),
                    item.get("CreatedAt") or None,
                    item.get("Category"),
                )
            )
        except:
            # Fallback for old schema without image view columns
            fallback_image_url = build_legacy_image_url(item, item.get("image_url"))
            cur.execute(
                """
                INSERT INTO carstockdata
                (`serial_number`, `make`, `model`, `variant`, `color`, `fuel_type`,
                 `registration_number`, `registration_date`, `rc_status`, `rc_expiry_date`,
                 `chassis_number`, `engine_number`, `manufacturing_year`, `manufacturing_month`,
                 `owner_serial_number`, `mileage_km`, `cubic_capacity_cc`, `emission_norms`,
                 `transmission_type`, `vehicle_category`, `insurance_type`, `insurance_expiry_date`,
                 `estimated_selling_price`, `ready_for_sales`, `image_url`, `type`, `CreatedAt`, `Category`)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                """,
                (
                    item.get("serial_number"),
                    item.get("make"),
                    item.get("model"),
                    item.get("variant"),
                    item.get("color"),
                    item.get("fuel_type"),
                    item.get("registration_number"),
                    item.get("registration_date") or None,
                    item.get("rc_status"),
                    item.get("rc_expiry_date") or None,
                    item.get("chassis_number"),
                    item.get("engine_number"),
                    item.get("manufacturing_year"),
                    item.get("manufacturing_month"),
                    item.get("owner_serial_number"),
                    item.get("mileage_km"),
                    item.get("cubic_capacity_cc"),
                    item.get("emission_norms"),
                    item.get("transmission_type"),
                    item.get("vehicle_category"),
                    item.get("insurance_type"),
                    item.get("insurance_expiry_date") or None,
                    item.get("estimated_selling_price"),
                    item.get("ready_for_sales"),
                    fallback_image_url,
                    item.get("type"),
                    item.get("CreatedAt") or None,
                    item.get("Category"),
                )
            )
        db.commit()
        return {"message": "Used car inventory uploaded successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/stock")
def get_used_car_stock(
    search: str = Query(None, description="Search text for make/model/variant/color/registration"),
    make: str = Query(None, description="Filter by make"),
    model: str = Query(None, description="Filter by model"),
):
    db = get_db()
    cur = db.cursor(dictionary=True)
    query = "SELECT * FROM carstockdata"
    conditions = []
    params = []

    if search:
        conditions.append(
            "CONCAT_WS(' ', make, model, variant, color, registration_number, chassis_number) LIKE %s"
        )
        params.append(f"%{search}%")

    if make:
        conditions.append("make = %s")
        params.append(make)

    if model:
        conditions.append("model = %s")
        params.append(model)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    query += " ORDER BY CreatedAt DESC"
    cur.execute(query, tuple(params))
    return cur.fetchall()


@router.get("/stock/{serial_number}")
def get_used_car_stock_item(serial_number: str):
    db = get_db()
    cur = db.cursor(dictionary=True)
    row, _, _ = find_car_by_key(cur, serial_number)
    if not row:
        raise HTTPException(status_code=404, detail="Used car stock item not found")
    return row


@router.put("/stock/{serial_number}")
def update_used_car_stock(serial_number: str, item: dict = Body(...)):
    db = get_db()
    cur = db.cursor(dictionary=True)
    existing, where_clause, where_value = find_car_by_key(cur, serial_number)
    if not existing:
        raise HTTPException(status_code=404, detail="Used car stock item not found")

    def preserve(key):
        value = item.get(key)
        return existing.get(key) if value in (None, "") else value

    try:
        # Try with new image fields first
        try:
            cur.execute(
                """
                UPDATE carstockdata SET
                    serial_number=%s,
                    make=%s,
                    model=%s,
                    variant=%s,
                    color=%s,
                    fuel_type=%s,
                    registration_number=%s,
                    registration_date=%s,
                    rc_status=%s,
                    rc_expiry_date=%s,
                    chassis_number=%s,
                    engine_number=%s,
                    manufacturing_year=%s,
                    manufacturing_month=%s,
                    owner_serial_number=%s,
                    mileage_km=%s,
                    cubic_capacity_cc=%s,
                    emission_norms=%s,
                    transmission_type=%s,
                    vehicle_category=%s,
                    insurance_type=%s,
                    insurance_expiry_date=%s,
                    estimated_selling_price=%s,
                    ready_for_sales=%s,
                    image_url=%s,
                    back_view_image=%s,
                    right_view_image=%s,
                    front_view_image=%s,
                    left_view_image=%s,
                    interior_image=%s,
                    type=%s,
                    CreatedAt=%s,
                    Category=%s
                WHERE {where_clause}
                """,
                (
                    preserve("serial_number"),
                    preserve("make"),
                    preserve("model"),
                    preserve("variant"),
                    preserve("color"),
                    preserve("fuel_type"),
                    preserve("registration_number"),
                    preserve("registration_date"),
                    preserve("rc_status"),
                    preserve("rc_expiry_date"),
                    preserve("chassis_number"),
                    preserve("engine_number"),
                    preserve("manufacturing_year"),
                    preserve("manufacturing_month"),
                    preserve("owner_serial_number"),
                    preserve("mileage_km"),
                    preserve("cubic_capacity_cc"),
                    preserve("emission_norms"),
                    preserve("transmission_type"),
                    preserve("vehicle_category"),
                    preserve("insurance_type"),
                    preserve("insurance_expiry_date"),
                    preserve("estimated_selling_price"),
                    preserve("ready_for_sales"),
                    preserve("image_url"),
                    preserve("back_view_image"),
                    preserve("right_view_image"),
                    preserve("front_view_image"),
                    preserve("left_view_image"),
                    preserve("interior_image"),
                    preserve("type"),
                    preserve("CreatedAt"),
                    preserve("Category"),
                    where_value,
                )
            )
        except:
            # Fallback for old schema without image view columns
            # Always merge via build_legacy_image_url so object format is maintained
            # and existing images are never lost when uploading just one view
            existing_image_url = existing.get("image_url")
            merged_item = dict(item)
            merged_item["image_url"] = existing_image_url  # ensure existing images are base
            legacy_image_url = build_legacy_image_url(merged_item, existing_image_url)
            cur.execute(
                f"""
                UPDATE carstockdata SET
                    serial_number=%s,
                    make=%s,
                    model=%s,
                    variant=%s,
                    color=%s,
                    fuel_type=%s,
                    registration_number=%s,
                    registration_date=%s,
                    rc_status=%s,
                    rc_expiry_date=%s,
                    chassis_number=%s,
                    engine_number=%s,
                    manufacturing_year=%s,
                    manufacturing_month=%s,
                    owner_serial_number=%s,
                    mileage_km=%s,
                    cubic_capacity_cc=%s,
                    emission_norms=%s,
                    transmission_type=%s,
                    vehicle_category=%s,
                    insurance_type=%s,
                    insurance_expiry_date=%s,
                    estimated_selling_price=%s,
                    ready_for_sales=%s,
                    image_url=%s,
                    type=%s,
                    CreatedAt=%s,
                    Category=%s
                WHERE {where_clause}
                """,
                (
                    preserve("serial_number"),
                    preserve("make"),
                    preserve("model"),
                    preserve("variant"),
                    preserve("color"),
                    preserve("fuel_type"),
                    preserve("registration_number"),
                    preserve("registration_date"),
                    preserve("rc_status"),
                    preserve("rc_expiry_date"),
                    preserve("chassis_number"),
                    preserve("engine_number"),
                    preserve("manufacturing_year"),
                    preserve("manufacturing_month"),
                    preserve("owner_serial_number"),
                    preserve("mileage_km"),
                    preserve("cubic_capacity_cc"),
                    preserve("emission_norms"),
                    preserve("transmission_type"),
                    preserve("vehicle_category"),
                    preserve("insurance_type"),
                    preserve("insurance_expiry_date"),
                    preserve("estimated_selling_price"),
                    preserve("ready_for_sales"),
                    legacy_image_url,
                    preserve("type"),
                    preserve("CreatedAt"),
                    preserve("Category"),
                    where_value,
                )
            )
        db.commit()
        return {"message": "Used car stock item updated successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/stock/{serial_number}")
def delete_used_car_stock(serial_number: str):
    db = get_db()
    cur = db.cursor(dictionary=True)
    existing, where_clause, where_value = find_car_by_key(cur, serial_number)
    if not existing:
        raise HTTPException(status_code=404, detail="Used car stock item not found")
    try:
        cur.execute(f"DELETE FROM carstockdata WHERE {where_clause}", (where_value,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Used car stock item not found")
        db.commit()
        return {"message": "Used car stock item deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# -------------------- BULK UPLOADS --------------------

@router.post("/bulk-upload-used-cars")
async def bulk_upload_used_cars(file: UploadFile = File(...)):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")
    
    content = await file.read()
    decoded = content.decode('utf-8').splitlines()
    reader = csv.DictReader(decoded)
    
    db = get_db()
    cur = db.cursor()
    success_count = 0
    
    def parse_db_date(date_str):
        if not date_str:
            return None
        date_str = str(date_str).strip()
        if len(date_str) == 10:
            if date_str[2] in ('-', '/') and date_str[5] in ('-', '/'):
                return f"{date_str[6:10]}-{date_str[3:5]}-{date_str[0:2]}"
        return date_str
    
    try:
        for row in reader:
            # Mapping based on user screenshot
            reg_no = row.get("registration_number")
            make = row.get("make")
            model = row.get("model")
            
            if not reg_no or not make or not model:
                continue

            rc_expiry_val = parse_db_date(row.get("rc_expiry_date"))
            ins_expiry_val = parse_db_date(row.get("insurance_exp"))

            try:
                cur.execute("""
                    INSERT INTO carstockdata
                    (`registration_number`, `make`, `model`, `variant`, `type`, 
                     `manufacturing_year`, `fuel_type`, `transmission_type`, `mileage_km`, 
                     `estimated_selling_price`, `color`, `cubic_capacity_cc`, `rc_status`, 
                     `rc_expiry_date`, `engine_number`, `chassis_number`, `emission_norms`, 
                     `insurance_expiry_date`, `insurance_type`, `ready_for_sales`, `Category`)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    reg_no,
                    make,
                    model,
                    row.get("variant"),
                    row.get("car_type"),
                    row.get("manufacturing_year"),
                    row.get("fuel_type"),
                    row.get("transmission"),
                    row.get("mileage_km"),
                    row.get("estimated_selling_price"),
                    row.get("color"),
                    row.get("cubic_cap"),
                    row.get("rc_status"),
                    rc_expiry_val,
                    row.get("engine_no"),
                    row.get("chassis_no"),
                    row.get("emission_norm"),
                    ins_expiry_val,
                    row.get("insurance_company"),
                    row.get("ready_for_sales"),
                    row.get("category")
                ))
                success_count += 1
            except Exception as row_err:
                print(f"Error inserting row {row}: {row_err}")
                continue
            
        db.commit()
        return {"message": f"Successfully uploaded {success_count} used cars"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/bulk-update-used-status")
async def bulk_update_used_status(file: UploadFile = File(...)):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")
    
    content = await file.read()
    decoded = content.decode('utf-8').splitlines()
    reader = csv.DictReader(decoded)
    
    db = get_db()
    cur = db.cursor()
    update_count = 0
    
    try:
        for row in reader:
            reg_no = row.get("registration_number")
            status = row.get("status")
            
            if not reg_no or not status:
                continue
            
            # Update 'ready_for_sales' or 'status' column if it exists
            # We will try to update 'status' first, if fails then fallback to nothing or specific column
            try:
                cur.execute("UPDATE carstockdata SET status = %s WHERE registration_number = %s", (status, reg_no))
            except:
                # Fallback: maybe the column is ready_for_sales
                cur.execute("UPDATE carstockdata SET ready_for_sales = %s WHERE registration_number = %s", (status, reg_no))
            
            update_count += cur.rowcount
            
        db.commit()
        return {"message": f"Successfully updated status for {update_count} cars"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# -------------------- ACTION ITEMS (Test Drives & Appointments) --------------------

def _to_iso(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if value is None:
        return ""
    return str(value)


def _fmt_usedcar_item(row: dict, source: str) -> dict:
    appointment_date = row.get("appointment_date") or row.get("td_date") or "-"
    appointment_time = row.get("appointment_time") or row.get("td_time") or "-"
    location = row.get("location") or row.get("td_address") or row.get("city") or "-"

    return {
        "id": row.get("id"),
        "module": "usedcar",
        "source": source,
        "customer_name": row.get("customer_name") or row.get("name") or "-",
        "phone": row.get("contact_number") or row.get("phone") or "-",
        "appointment_date": str(appointment_date),
        "appointment_time": str(appointment_time),
        "status": row.get("status") or row.get("proceed_option") or "-",
        "details": row.get("sell_plan") or row.get("proceed_option") or "-",
        "location": location,
        "brand": row.get("brand") or row.get("cur_brand") or "-",
        "model": row.get("model") or row.get("cur_model") or "-",
        "item_type": source,
        "created_at": _to_iso(row.get("created_at")),
    }


@router.get("/action-items")
def get_usedcar_action_items(
    period: Optional[str] = Query("all", description="today|yesterday|week|15days|all"),
    limit: int = Query(200, ge=1, le=500),
):
    """Return used car related records: valuations and valuation selections."""
    now_utc = datetime.now(timezone.utc)
    today_ist = now_utc.astimezone(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    date_filter = ""
    params = []

    if period == "yesterday":
        target_date = today_ist - timedelta(days=1)
        start_utc = target_date.astimezone(timezone.utc)
        end_utc = today_ist.astimezone(timezone.utc)
        date_filter = " WHERE created_at >= %s AND created_at < %s"
        params = [start_utc, end_utc]
    elif period == "week":
        start_ist = today_ist - timedelta(days=6)
        start_utc = start_ist.astimezone(timezone.utc)
        date_filter = " WHERE created_at >= %s"
        params = [start_utc]
    elif period == "15days":
        start_ist = today_ist - timedelta(days=14)
        start_utc = start_ist.astimezone(timezone.utc)
        date_filter = " WHERE created_at >= %s"
        params = [start_utc]
    elif period == "today":
        start_utc = today_ist.astimezone(timezone.utc)
        date_filter = " WHERE created_at >= %s"
        params = [start_utc]

    db = get_db()
    cur = db.cursor(dictionary=True)
    items = []

    def _fetch(query_text: str, query_params: list):
        try:
            cur.execute(query_text, query_params)
            return cur.fetchall()
        except Exception:
            return []

    table_queries = [
        (
            "Valuation Selection",
            f"SELECT id, contact_number, customer_name, td_date AS appointment_date, td_time AS appointment_time, created_at, city, cur_brand, cur_model, proceed_option FROM valuation_selections{date_filter} ORDER BY created_at DESC LIMIT %s",
        ),
        (
            "Valuation",
            f"SELECT id, name, phone, location, brand, model, created_at FROM valuations{date_filter} ORDER BY created_at DESC LIMIT %s",
        ),
    ]

    for source, query_text in table_queries:
        query_params = params.copy()
        query_params.append(limit)
        rows = _fetch(query_text, query_params)
        items.extend([_fmt_usedcar_item(row, source) for row in rows])

    cur.close()
    db.close()

    items.sort(key=lambda item: item.get("created_at") or "", reverse=True)

    return {
        "period": period,
        "count": len(items),
        "items": items[:limit],
    }


# -------------------- REMOVE IMAGE(S) --------------------

def get_existing_image_columns(cur) -> list:
    """Return which image columns actually exist in carstockdata table."""
    cur.execute("SHOW COLUMNS FROM carstockdata")
    all_cols = {row["Field"] for row in cur.fetchall()}
    candidates = ["image_url", "back_view_image", "right_view_image", "front_view_image", "left_view_image", "interior_image"]
    return [c for c in candidates if c in all_cols]

@router.put("/stock/{serial_number}/remove-image")
def remove_car_image(serial_number: str, body: dict = Body(...)):
    """
    Remove one or all car images.
    body = { "field": "back_view_image" }   -> removes single image
    body = { "field": "all" }               -> removes all image columns that exist
    Gracefully handles old schema (only image_url) vs new schema (view columns).
    """
    db = get_db()
    cur = db.cursor(dictionary=True)
    existing, where_clause, where_value = find_car_by_key(cur, serial_number)
    if not existing:
        raise HTTPException(status_code=404, detail="Used car stock item not found")

    field = body.get("field", "")
    existing_img_cols = get_existing_image_columns(cur)
    valid_single_fields = ["back_view_image", "right_view_image", "front_view_image",
                           "left_view_image", "interior_image", "image_url"]

    # Map field name → key used inside the stored JSON object
    FIELD_KEY_MAP = {
        "back_view_image":  "back",
        "right_view_image": "right",
        "front_view_image": "front",
        "left_view_image":  "left",
        "interior_image":   "interior",
    }

    def parse_image_store(raw):
        """Parse image_url value into a dict {back,right,front,left,interior}."""
        if not raw:
            return {}
        raw = str(raw).strip()
        # Already a JSON object
        if raw.startswith("{"):
            try:
                return json.loads(raw)
            except Exception:
                return {}
        # Legacy JSON array — map by position
        if raw.startswith("["):
            try:
                arr = json.loads(raw)
                keys = ["back", "right", "front", "left", "interior"]
                return {keys[i]: v for i, v in enumerate(arr) if i < len(keys) and v not in (None, "")}
            except Exception:
                return {}
        # Single URL/base64 — treat as back view
        return {"back": raw}

    try:
        if field == "all":
            # ── New schema ──────────────────────────────────────────────────
            if any(c != "image_url" for c in existing_img_cols):
                cols = [c for c in existing_img_cols]
                set_clause = ", ".join([f"`{c}`=NULL" for c in cols])
                cur.execute(f"UPDATE carstockdata SET {set_clause} WHERE {where_clause}", (where_value,))
            # ── Old schema (image_url only) ─────────────────────────────────
            elif "image_url" in existing_img_cols:
                cur.execute(
                    f"UPDATE carstockdata SET `image_url`=NULL WHERE {where_clause}",
                    (where_value,)
                )
            else:
                raise HTTPException(status_code=400, detail="No image columns found in database")

        elif field in valid_single_fields:
            # ── New schema: dedicated column exists ─────────────────────────
            if field in existing_img_cols and field != "image_url":
                cur.execute(
                    f"UPDATE carstockdata SET `{field}`=NULL WHERE {where_clause}",
                    (where_value,)
                )
            # ── Old schema: packed into image_url as JSON object ────────────
            elif "image_url" in existing_img_cols:
                raw = existing.get("image_url") or ""
                img_dict = parse_image_store(raw)
                key = FIELD_KEY_MAP.get(field)
                if key and key in img_dict:
                    del img_dict[key]
                new_val = json.dumps(img_dict) if img_dict else None
                cur.execute(
                    f"UPDATE carstockdata SET `image_url`=%s WHERE {where_clause}",
                    (new_val, where_value)
                )
            else:
                raise HTTPException(status_code=400, detail=f"Column '{field}' not found in database schema")
        else:
            raise HTTPException(status_code=400, detail=f"Invalid field: {field}")

        db.commit()
        return {"message": "Image(s) removed successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        db.close()