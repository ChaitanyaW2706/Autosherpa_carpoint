from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime, timezone, timedelta
from db import get_db, get_mongo_col
from typing import Optional
import os, re

IST = timezone(timedelta(hours=5, minutes=30))


# ── Router ─────────────────────────────────────────────────────────────────────
router = APIRouter()

col = get_mongo_col()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _detect_module(session: dict) -> str:
    """
    Detect module from DB structure:
      summary.lead_type      → "sales" | "insurance" | "service" | "used_cars"
      summary.insurance_renewal → insurance
      summary.searched_cars  → sales (non-empty list)
    Fallback: scan message text keywords.
    """
    summary = session.get("summary") or {}

    # 1. summary.lead_type (most reliable — set explicitly by flows)
    lead = str(summary.get("lead_type") or "").lower().strip()
    if lead in ("sales", "new_cars", "new cars"):
        return "sales"
    if lead in ("insurance", "renewal"):
        return "insurance"
    if lead in ("service",):
        return "service"
    if lead in ("used_cars", "used cars"):
        return "used_cars"
    if "sales" in lead or "car" in lead:
        return "sales"
    if "insurance" in lead or "renewal" in lead:
        return "insurance"
    if "service" in lead:
        return "service"
    if "used_cars" in lead or "used cars" in lead:
        return "used_cars"
    if "refinancing" in lead or "refinance" in lead or "loan" in lead:
        return "refinancing"
    if "contact" in lead or "address" in lead or "location" in lead:
        return "contact"
    if "about" in lead or "company" in lead:
        return "about_us"

    # 2. summary.insurance_renewal flag
    if summary.get("insurance_renewal") is True:
        return "insurance"

    # 3. summary.searched_cars (non-empty → sales inquiry)
    searched = summary.get("searched_cars")
    if isinstance(searched, list) and len(searched) > 0:
        return "sales"

    # 4. Scan message text keywords
    sales_kw     = {"sales", "car", "vehicle", "price", "variant", "mileage",
                    "buy", "book", "test_drive", "brochure", "model", "creta",
                    "hyundai", "i20", "tucson", "verna", "alcazar"}
    insurance_kw = {"insurance", "policy", "renewal", "claim", "rc", "registration",
                    "premium", "cover", "insure", "expire", "document", "idv"}
    service_kw   = {"service", "repair", "oil", "tyre", "brake", "engine",
                    "service_booking", "appointment", "workshop", "maintenance"}
    used_kw      = {"used", "second", "pre-owned", "preowned", "old car", "budget"}
    refinancing_kw = {"refinance", "refinancing", "loan", "interest", "emi", "finance"}
    contact_kw    = {"contact", "address", "location", "email", "phone", "call", "whatsapp", "branch", "office"}
    about_kw      = {"about", "company", "who are you", "mission", "vision", "team"}

    s, ins, svc, usd, ref, cnt, abu = 0, 0, 0, 0, 0, 0, 0
    for msg in session.get("messages", []):
        combined = ((msg.get("intent") or "") + " " + (msg.get("text") or "")).lower()
        s   += sum(1 for k in sales_kw     if k in combined)
        ins += sum(1 for k in insurance_kw if k in combined)
        svc += sum(1 for k in service_kw   if k in combined)
        usd += sum(1 for k in used_kw      if k in combined)
        ref += sum(1 for k in refinancing_kw if k in combined)
        cnt += sum(1 for k in contact_kw    if k in combined)
        abu += sum(1 for k in about_kw      if k in combined)

    if s == 0 and ins == 0 and svc == 0 and usd == 0 and ref == 0 and cnt == 0 and abu == 0:
        return "general"

    if ref > 0:
        return "refinancing"
    if cnt > 0:
        return "contact"
    if abu > 0:
        return "about_us"

    best = max(s, ins, svc, usd)
    if   best == ins: return "insurance"
    if   best == svc: return "service"
    if   best == usd: return "used_cars"
    return "sales"


def _last_user_msg(session: dict) -> str:
    """Return last user message text (truncated)."""
    for msg in reversed(session.get("messages", [])):
        if msg.get("sender") == "user":
            t = (msg.get("text") or "").strip()
            # Skip internal IDs / button IDs
            if t and not t.startswith("menu_") and not t.startswith("__"):
                return t[:90] + ("…" if len(t) > 90 else "")
    return "Started conversation"


def _fmt_phone(phone: str) -> str:
    if phone and phone.startswith("91") and len(phone) > 10:
        return "+91 " + phone[2:]
    return phone or "—"


def _parse_ts(ts):
    """Safely parse ts field — could be datetime or string."""
    if isinstance(ts, datetime):
        return ts
    if isinstance(ts, str):
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            pass
    return None


def _fmt_session(s: dict) -> dict:
    start = s.get("start_time")
    end   = s.get("end_time")

    start = _parse_ts(start) if not isinstance(start, datetime) else start
    end   = _parse_ts(end)   if not isinstance(end,   datetime) else end

    # Convert UTC → IST (UTC+5:30)
    if isinstance(start, datetime):
        if start.tzinfo is None:
            start = start.replace(tzinfo=timezone.utc)
        start = start.astimezone(IST)
    if isinstance(end, datetime):
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        end = end.astimezone(IST)

    date_str = start.strftime("%Y-%m-%d")  if isinstance(start, datetime) else "—"
    time_str = start.strftime("%I:%M %p")  if isinstance(start, datetime) else ""

    if isinstance(end, datetime) and isinstance(start, datetime):
        secs     = max(0, int((end - start).total_seconds()))
        duration = f"{secs // 60}m {secs % 60}s"
    else:
        duration = "Active"

    # Message count (user + bot)
    messages      = s.get("messages", [])
    msg_count     = len(messages)
    user_msg_count = sum(1 for m in messages if m.get("sender") == "user")
    bot_msg_count  = sum(1 for m in messages if m.get("sender") == "bot")

    return {
        "id"             : str(s["_id"]),
        "user_phone"     : _fmt_phone(s.get("user_phone", "")),
        "raw_phone"      : s.get("user_phone", ""),
        "platform"       : s.get("platform", "whatsapp"),
        "module"         : _detect_module(s),
        "action"         : _last_user_msg(s),
        "message_count"  : msg_count,
        "user_msg_count" : user_msg_count,
        "bot_msg_count"  : bot_msg_count,
        "status"         : s.get("status", ""),
        "date"           : date_str,
        "time"           : time_str,
        "duration"       : duration,
        "summary"        : s.get("summary") or {},
    }


def _fmt_message(msg: dict) -> dict:
    """Format a single message for frontend chat display."""
    ts   = _parse_ts(msg.get("ts"))
    if isinstance(ts, datetime):
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        ts = ts.astimezone(IST)
    text = msg.get("text") or ""

    # Detect special message types from text prefix
    msg_type = "text"
    if text.startswith("[IMAGE]"):
        msg_type = "image"
        text = text.replace("[IMAGE]", "").strip()
    elif text.startswith("[DOCUMENT]"):
        msg_type = "document"
        text = text.replace("[DOCUMENT]", "").strip()

    return {
        "sender"  : msg.get("sender", ""),
        "side"    : "right" if msg.get("sender") == "user" else "left",
        "text"    : text,
        "type"    : msg_type,         # "text" | "image" | "document"
        "intent"  : msg.get("intent") or "",
        "time"    : ts.strftime("%I:%M %p") if ts else "",
        "ts_iso"  : ts.isoformat()          if ts else "",
    }


def _to_iso(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if value is None:
        return ""
    return str(value)


def _fmt_action_item(row: dict, module: str, source: str) -> dict:
    def _first(*keys):
        for key in keys:
            value = row.get(key)
            if value is not None and value != "":
                return value
        return ""

    appointment_date_obj = _first("appointment_date", "created_at", "date")
    appointment_time_obj = _first("appointment_time", "time")

    appointment_date = "-"
    appointment_time = "-"

    if isinstance(appointment_date_obj, datetime):
        appointment_date = appointment_date_obj.strftime("%Y-%m-%d")
        if not appointment_time_obj:
            appointment_time = appointment_date_obj.strftime("%I:%M %p")
    elif appointment_date_obj:
        appointment_date = str(appointment_date_obj)

    if isinstance(appointment_time_obj, datetime):
        appointment_time = appointment_time_obj.strftime("%I:%M %p")
    elif appointment_time_obj:
        appointment_time = str(appointment_time_obj)

    location = _first("location", "city", "address", "customer_address", "pickup_address", "td_address")
    item_type = _first("appointment_type", "test_drive_type", "type") or source

    if str(item_type).strip() == "Showroom Visit":
        if not location or location == "-":
            location = "Sherpa Showroom - Main Branch, Bangalore"

    # Insurance specific logic
    vehicle_no = "-"
    if module == "insurance":
        mode = row.get("appointment_mode")
        if mode == "Field Visit":
            location = row.get("address") or "-"
        elif mode in ("Online", "Walk-In"):
            location = mode
        else:
            # Fallback for estimates or missing modes
            location = row.get("address") or mode or (source if source == "Insurance Estimate" else "-")
        
        vehicle_no = row.get("vehicle_reg_no") or "-"

    return {
        "id": row.get("id"),
        "module": module,
        "source": source,
        "customer_name": _first("customer_name", "name", "customer", "full_name") or "-",
        "phone": _first("phone_number", "mobile_number", "contact_number", "mobile", "customer_phone", "phone") or "-",
        "appointment_date": appointment_date or "-",
        "appointment_time": appointment_time or "-",
        "status": _first("status") or "-",
        "details": _first("intent_type", "renewal_type", "appointment_mode", "loan_requirement", "service_type", "service_preference") or "-",
        "location": location or "-",
        "brand": _first("brand", "car_brand", "cur_brand") or "-",
        "model": _first("model", "car_model", "cur_model") or "-",
        "vehicle_no": vehicle_no,
        "item_type": item_type,
        "created_at": _to_iso(row.get("created_at") or row.get("booking_timestamp")),
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/stats")
def get_stats(period: Optional[str] = Query("today", description="today|yesterday|week|15days")):
    """
    Stats cards — unique daily enquiries and trend counts.
    Returns unique customer counts per module for the specified period.
    """
    now_utc = datetime.now(timezone.utc)
    today_ist = now_utc.astimezone(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Handle different periods
    if period == "yesterday":
        target_date = today_ist - timedelta(days=1)
        start_utc = target_date.astimezone(timezone.utc)
        end_utc = today_ist.astimezone(timezone.utc)
        query = {"start_time": {"$gte": start_utc, "$lt": end_utc}}
        period_label = "yesterday"
    elif period == "week":
        start_ist = today_ist - timedelta(days=6)
        start_utc = start_ist.astimezone(timezone.utc)
        query = {"start_time": {"$gte": start_utc}}
        period_label = "last_7_days"
    elif period == "15days":
        start_ist = today_ist - timedelta(days=14)
        start_utc = start_ist.astimezone(timezone.utc)
        query = {"start_time": {"$gte": start_utc}}
        period_label = "last_15_days"
    elif period == "all":
        query = {}
        period_label = "all_time"
    else:  # today
        start_utc = today_ist.astimezone(timezone.utc)
        query = {"start_time": {"$gte": start_utc}}
        period_label = "today"
    
    # Also get 15-day trend data
    start_15_days_utc = (today_ist - timedelta(days=14)).astimezone(timezone.utc)
    trend_query = {"start_time": {"$gte": start_15_days_utc}}
    
    # Execute queries
    docs = list(col.find(query, {"user_phone": 1, "start_time": 1, "summary": 1, "messages": 1}))
    trend_docs = list(col.find(trend_query, {"user_phone": 1, "start_time": 1}))
    
    categories = {
        "sales": set(),
        "used_cars": set(),
        "service": set(),
        "insurance": set(),
        "refinancing": set(),
        "about_us": set(),
        "contact": set(),
        "general": set(),
    }
    
    # Process main period docs - count UNIQUE users per module
    for doc in docs:
        phone = (doc.get("user_phone") or "").strip()
        if not phone:
            phone = str(doc.get("_id"))
        
        module = _detect_module(doc)
        if module not in categories:
            module = "general"
        categories[module].add(phone)
    
    # Process trend data
    trend_cache = {}
    for i in range(15):
        date_key = (today_ist - timedelta(days=14 - i)).strftime("%Y-%m-%d")
        trend_cache[date_key] = set()
    
    for doc in trend_docs:
        phone = (doc.get("user_phone") or "").strip()
        if not phone:
            phone = str(doc.get("_id"))
        
        start = doc.get("start_time")
        if not isinstance(start, datetime):
            start = _parse_ts(start)
        
        if isinstance(start, datetime):
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
            start_ist = start.astimezone(IST)
            date_key = start_ist.strftime("%Y-%m-%d")
            if date_key in trend_cache:
                trend_cache[date_key].add(phone)
    
    total_sessions = col.count_documents({})
    active_sessions = col.count_documents({"status": "active"})
    by_module = {k: len(v) for k, v in categories.items()}
    
    # Calculate total unique users for the period
    total_unique_users = sum(by_module.values())
    
    return {
        "total": total_sessions,
        "active": active_sessions,
        "by_module": by_module,
        "today_counts": by_module,  # For compatibility with older frontend code
        "period_counts": by_module,
        "total_unique_users": total_unique_users,
        "trend": [
            {"date": date_key, "count": len(trend_cache[date_key])}
            for date_key in sorted(trend_cache.keys())
        ],
        "period": period_label,
        "period_label": period_label,
    }


@router.get("/action-items")
def get_action_items(
    period: Optional[str] = Query("15days", description="today|yesterday|week|15days|all"),
    filter_module: Optional[str] = Query(None, alias="module", description="Filter by module name"),
    limit: int = Query(50, ge=1, le=200),
):
    """Return recent action items from appointment/test-drive tables across modules."""
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
            "service",
            "Service Appointment",
            f"SELECT id, full_name, customer_phone, appointment_date, timing AS appointment_time, status, booking_timestamp AS created_at, pickup_address, service_preference FROM appointment_bookings{date_filter.replace('created_at', 'booking_timestamp')} ORDER BY booking_timestamp DESC LIMIT %s",
        ),
        (
            "used_cars",
            "Used Car Test Drive",
            f"SELECT b.id, b.name AS customer_name, b.phone, b.test_drive_date AS appointment_date, b.test_drive_time AS appointment_time, b.created_at, b.location, s.make AS brand, s.model AS model FROM bookings b LEFT JOIN carstockdata s ON b.car_serial_number = s.serial_number {date_filter.replace('WHERE ', 'WHERE b.')} ORDER BY b.created_at DESC LIMIT %s",
        ),
        (
            "used_cars",
            "Valuation Selection",
            f"SELECT id, contact_number, customer_name, td_date AS appointment_date, td_time AS appointment_time, created_at, city, cur_brand, cur_model, proceed_option FROM valuation_selections{date_filter} ORDER BY created_at DESC LIMIT %s",
        ),
        (
            "used_cars",
            "Valuation",
            f"SELECT id, name, phone, location, brand, model, created_at FROM valuations{date_filter} ORDER BY created_at DESC LIMIT %s",
        ),
        (
            "sales",
            "Sales Appointment",
            f"SELECT a.id, a.customer_name, a.mobile_number, a.appointment_type, a.preferred_when AS appointment_date, a.preferred_time AS appointment_time, a.status, a.created_at, a.customer_address, a.car_model, c.make AS brand FROM sales_appointments a LEFT JOIN sales_car_details c ON a.car_model = c.model {date_filter.replace('WHERE ', 'WHERE a.')} ORDER BY a.created_at DESC LIMIT %s",
        ),
        (
            "insurance",
            "Insurance Renewal",
            f"SELECT id, mobile_number, customer_name, appointment_date, appointment_time, status, created_at, renewal_type, address, appointment_mode, vehicle_reg_no FROM insurance_renewal_requests{date_filter} ORDER BY created_at DESC LIMIT %s",
        ),
        (
            "insurance",
            "Insurance Estimate",
            f"SELECT id, mobile_number, customer_name, created_at, status, vehicle_reg_no FROM insurance_estimate_requests{date_filter} ORDER BY created_at DESC LIMIT %s",
        ),
        (
            "refinancing",
            "Refinancing Lead",
            f"SELECT id, phone_number, customer_name, intent_type, status, created_at, city, car_brand, car_model, loan_requirement FROM refinancing_leads{date_filter} ORDER BY created_at DESC LIMIT %s",
        ),
    ]

    for item_module, source, query_text in table_queries:
        query_params = params.copy()
        query_params.append(limit)
        rows = _fetch(query_text, query_params)
        items.extend([_fmt_action_item(row, item_module, source) for row in rows])

    if filter_module:
        module_norm = filter_module.strip().lower()
        items = [item for item in items if str(item.get("module") or "").lower() == module_norm]

    cur.close()
    db.close()

    items.sort(key=lambda item: item.get("created_at") or "", reverse=True)

    return {
        "period": period,
        "count": len(items),
        "items": items[:limit],
    }


@router.get("/sessions")
def get_sessions(
    module:    Optional[str] = Query(None, description="sales|insurance|service|used_cars|general"),
    search:    Optional[str] = Query(None, description="Phone number search (partial)"),
    status:    Optional[str] = Query(None, description="active | closed"),
    date_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_to:   Optional[str] = Query(None, description="YYYY-MM-DD"),
    limit: int = Query(200, ge=1, le=500),
    skip:  int = Query(0,   ge=0),
):
    """List sessions with optional filters. Sorted newest first."""
    query: dict = {}

    if search:
        query["user_phone"] = {"$regex": re.escape(search.strip()), "$options": "i"}

    if status in ("active", "closed"):
        query["status"] = status

    if date_from or date_to:
        dt_q: dict = {}
        if date_from:
            dt_q["$gte"] = datetime.strptime(date_from, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        if date_to:
            dt_q["$lte"] = datetime.strptime(date_to, "%Y-%m-%d").replace(
                hour=23, minute=59, second=59, tzinfo=timezone.utc)
        query["start_time"] = dt_q

    # Fetch more rows when module filter is active (derived field)
    fetch  = limit * 8 if module else limit
    cursor = col.find(query).sort("start_time", -1).skip(skip).limit(fetch)
    sessions = [_fmt_session(s) for s in cursor]

    if module:
        sessions = [s for s in sessions if s["module"] == module][:limit]

    return {"total": len(sessions), "sessions": sessions}


@router.get("/sessions/{session_id}")
def get_session_detail(
    session_id: str,
    sender:  Optional[str] = Query(None, description="user | bot — filter messages"),
    keyword: Optional[str] = Query(None, description="keyword search in message text"),
):
    """Full chat detail for one session. Returns WhatsApp-style messages."""
    try:
        oid = ObjectId(session_id)
    except Exception:
        return JSONResponse(status_code=400, content={"detail": "Invalid ID"})

    s = col.find_one({"_id": oid})
    if not s:
        return JSONResponse(status_code=404, content={"detail": "Not found"})

    raw_messages = s.get("messages", [])
    messages     = []
    for msg in raw_messages:
        # sender filter
        if sender and msg.get("sender") != sender:
            continue
        # keyword filter
        if keyword and keyword.lower() not in (msg.get("text") or "").lower():
            continue
        messages.append(_fmt_message(msg))

    result                 = _fmt_session(s)
    result["messages"]     = messages
    result["total_messages"] = len(raw_messages)
    result["filtered_count"] = len(messages)
    return result