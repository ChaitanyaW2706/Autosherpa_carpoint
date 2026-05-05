from fastapi import APIRouter, Query, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from db import get_db
from datetime import datetime, timezone, timedelta
from typing import Optional
import pandas as pd
import io

IST = timezone(timedelta(hours=5, minutes=30))

router = APIRouter()

ROBILLSCUBE_COLUMNS = [
    "address", "billAmt", "billDate", "billNumber", "billStatus", "chassisNo", "color", 
    "customerName", "customerPhone", "customer_id", "engineNo", "isUploadedToday", "jobCardDate", 
    "jobCardNumber", "jobCardStatus", "jobcardLocation", "lastServiceDate", "lastServiceMeterReading", 
    "lastServiceType", "location_cityId", "location_name", "menuCodeDesc", "model", "modelGroup", 
    "originalWarrantystartDate", "saName", "saleDate", "serviceCategory", "shieldexpiryDate", 
    "taxiNonTaxi", "technician", "upload_id", "uploadeddate", "variant", "vehicleRegNo", "vehicle_id", 
    "warrantyyn", "workshopName", "workshop_id", "originalwarrantydate", "uploadType1", "uploadType2", 
    "uploadType3"
]

FORECAST_COLUMNS = [
    "workshopName", "LocationName", "vehicleNumber", "customerName", "vehicleRegNo",
    "customerPhone", "model", "modelgroup", "saleDate", "serviceDueBasedonTenure",
    "AverageRunning", "Mileagetobeaddedfornextvisit", "serviceDueBasedonMileage",
    "nextServiceDue", "nextServiceType", "nextservicetypeID", "RevisedForecastedServiceDue",
    "RevisednextServiceType", "RevisednextServiceTypeID", "ForecastYorN", "forecastLogic",
    "NotVisitedYearCount", "lastVisitLocation", "lastVisitDate", "lastVisitMileage",
    "LastVisitType", "LastVisitTypeID", "PreviousLastVisitDate", "LastServiceType",
    "LastserviceTypeID", "lastservicedate", "LastServiceMileage", "ServiceNoShowPeriod",
    "servicetype", "mileage", "EmailID", "fscount", "pscount", "MaxPSDate", "MaxFSDate",
    "SecondLastRODate", "SecondLastROMileage", "SecondLastVisitMileage", "TodayMileage",
    "CSTVisitType", "TotalVisitCount", "IdealVisitCount", "CustomerActiveORInactiveStatus",
    "MileageCount", "TenureCount", "DND", "ro_age_service_days", "ro_age_visit_days",
    "ro_age_service", "ro_age_service_id", "ro_age_visit", "ro_age_visit_id", "EWExpiry",
    "MCPExpiry", "ModelCategory", "Negative_Disposition", "Negative_Disposition_Date",
    "Negative_Disposition_Type", "Created_DateTime", "workshop_id", "location_id",
    "modelcat", "dnd_1", "customer_id", "Negative_Disposition_ID", "pincode",
    "ifccount", "ipccount", "tenure_servicetype", "mileage_servicetype"
]


def _to_iso(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if value is None:
        return ""
    return str(value)


def _parse_date(value: Optional[str]):
    if not value:
        return None
    try:
        date = datetime.fromisoformat(value)
    except Exception:
        return None
    if isinstance(date, datetime):
        return date.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=IST)
    return None


def _fmt_service_item(row: dict, source: str) -> dict:
    appointment_date = row.get("appointment_date") or "-"
    appointment_time = row.get("appointment_time") or "-"
    location = row.get("pickup_address") or row.get("location") or row.get("city") or "-"
    item_type = source

    return {
        "id": row.get("id"),
        "module": "service",
        "source": source,
        "customer_name": row.get("full_name") or row.get("customer_name") or row.get("name") or row.get("vehicle_reg") or "-",
        "phone": row.get("customer_phone") or row.get("phone_number") or row.get("phone") or "-",
        "vehicle_reg": row.get("vehicle_reg") or "-",
        "estimate_type": row.get("estimate_type") or "-",
        "service_preference": row.get("service_preference") or "-",
        "appointment_date": str(appointment_date),
        "appointment_time": str(appointment_time),
        "status": row.get("status") or "-",
        "details": row.get("service_preference") or row.get("estimate_type") or row.get("estimated_cost") or "-",
        "location": location,
        "brand": row.get("brand") or row.get("cur_brand") or "-",
        "model": row.get("model") or row.get("cur_model") or "-",
        "item_type": item_type,
        "created_at": _to_iso(row.get("created_at") or row.get("booking_timestamp") or row.get("request_timestamp")),
    }


@router.get("/action-items")
def get_service_action_items(
    period: Optional[str] = Query("all", description="all|week|month|custom"),
    start_date: Optional[str] = Query(None, description="Custom start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="Custom end date YYYY-MM-DD"),
    limit: int = Query(200, ge=1, le=500),
):
    """Return service-related appointment and estimate records with optional date range filtering."""
    now_utc = datetime.now(timezone.utc)
    today_ist = now_utc.astimezone(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    date_filter = ""
    params = []

    if period == "custom" and start_date and end_date:
        start_dt = _parse_date(start_date)
        end_dt = _parse_date(end_date)
        if start_dt and end_dt:
            end_dt = end_dt + timedelta(days=1)
            start_utc = start_dt.astimezone(timezone.utc)
            end_utc = end_dt.astimezone(timezone.utc)
            date_filter = " WHERE created_at >= %s AND created_at < %s"
            params = [start_utc, end_utc]
    elif period == "week":
        start_ist = today_ist - timedelta(days=6)
        start_utc = start_ist.astimezone(timezone.utc)
        date_filter = " WHERE created_at >= %s"
        params = [start_utc]
    elif period == "month":
        start_ist = today_ist - timedelta(days=29)
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
            "Service Estimate",
            f"SELECT id, phone_number, vehicle_reg, estimate_type, status, request_timestamp AS created_at, estimated_cost FROM service_estimate_requests{date_filter.replace('created_at', 'request_timestamp')} ORDER BY request_timestamp DESC LIMIT %s",
        ),
        (
            "Service Appointment",
            f"SELECT id, full_name, customer_phone, appointment_date, timing AS appointment_time, status, booking_timestamp AS created_at, pickup_address, service_preference, vehicle_reg FROM appointment_bookings{date_filter.replace('created_at', 'booking_timestamp')} ORDER BY booking_timestamp DESC LIMIT %s",
        ),
    ]

    for source, query_text in table_queries:
        query_params = params.copy()
        query_params.append(limit)
        rows = _fetch(query_text, query_params)
        items.extend([_fmt_service_item(row, source) for row in rows])

    cur.close()
    db.close()

    items.sort(key=lambda item: item.get("created_at") or "", reverse=True)

    return {
        "period": period,
        "count": len(items),
        "items": items[:limit],
    }


@router.get("/export")
def export_service_records(
    period: Optional[str] = Query("all", description="all|week|month|custom"),
    start_date: Optional[str] = Query(None, description="Custom start date YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="Custom end date YYYY-MM-DD"),
    limit: int = Query(2000, ge=1, le=20000),
):
    """Export filtered service records to Excel."""
    now_utc = datetime.now(timezone.utc)
    today_ist = now_utc.astimezone(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    date_filter = ""
    params = []

    if period == "custom" and start_date and end_date:
        start_dt = _parse_date(start_date)
        end_dt = _parse_date(end_date)
        if start_dt and end_dt:
            end_dt = end_dt + timedelta(days=1)
            start_utc = start_dt.astimezone(timezone.utc)
            end_utc = end_dt.astimezone(timezone.utc)
            date_filter = " WHERE created_at >= %s AND created_at < %s"
            params = [start_utc, end_utc]
    elif period == "week":
        start_ist = today_ist - timedelta(days=6)
        start_utc = start_ist.astimezone(timezone.utc)
        date_filter = " WHERE created_at >= %s"
        params = [start_utc]
    elif period == "month":
        start_ist = today_ist - timedelta(days=29)
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
            "Service Estimate",
            f"SELECT id, phone_number, vehicle_reg, estimate_type, status, request_timestamp AS created_at, estimated_cost FROM service_estimate_requests{date_filter.replace('created_at', 'request_timestamp')} ORDER BY request_timestamp DESC LIMIT %s",
        ),
        (
            "Service Appointment",
            f"SELECT id, full_name, customer_phone, appointment_date, timing AS appointment_time, status, booking_timestamp AS created_at, pickup_address, service_preference, vehicle_reg FROM appointment_bookings{date_filter.replace('created_at', 'booking_timestamp')} ORDER BY booking_timestamp DESC LIMIT %s",
        ),
    ]

    for source, query_text in table_queries:
        query_params = params.copy()
        query_params.append(limit)
        rows = _fetch(query_text, query_params)
        items.extend([_fmt_service_item(row, source) for row in rows])

    cur.close()
    db.close()

    df = pd.DataFrame(items)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Service Records")
    output.seek(0)

    filename = f"service_records_{period if period else 'all'}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@router.get("/template/robillscube")
def get_robillscube_template():
    df = pd.DataFrame(columns=ROBILLSCUBE_COLUMNS)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="robillscube_template.xlsx"',
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )

@router.post("/upload/robillscube")
async def upload_robillscube(file: UploadFile = File(...)):
    if not file.filename.endswith((".xlsx", ".csv")):
        raise HTTPException(status_code=400, detail="File must be Excel or CSV")
        
    try:
        import numpy as np

        contents = await file.read()
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))

        df.columns = [str(col).strip() for col in df.columns]

        safe_cols = [
            col for col in df.columns
            if col in ROBILLSCUBE_COLUMNS and col != "id"
        ]
        if not safe_cols:
            raise HTTPException(
                status_code=400,
                detail="No valid columns found. Please use the provided template."
            )
        df = df[safe_cols]

        def clean_value(val):
            if val is None: return None
            try:
                if pd.isna(val): return None
            except: pass
            if isinstance(val, pd.Timestamp): return val.strftime('%Y-%m-%d %H:%M:%S')
            if isinstance(val, np.integer): return int(val)
            if isinstance(val, np.floating): return float(val)
            return val

        data = [tuple(clean_value(v) for v in row) for row in df.values]

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")

    db = get_db()
    cur = db.cursor()
    try:
        cur.execute("""
            SELECT DATA_TYPE, EXTRA FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'robillscube' AND COLUMN_NAME = 'id'
            AND TABLE_SCHEMA = DATABASE()
        """)
        row = cur.fetchone()
        if row and 'auto_increment' not in row[1].lower():
            try:
                cur.execute("""
                    ALTER TABLE `robillscube`
                    MODIFY COLUMN `id` INT AUTO_INCREMENT
                """)
                db.commit()
            except Exception as alter_err:
                print("Could not auto-alter id column for robillscube:", alter_err)

        columns = df.columns.tolist()
        placeholders = ", ".join(["%s"] * len(columns))
        columns_str = ", ".join([f"`{col}`" for col in columns])

        update_clause = ", ".join([f"`{col}`=VALUES(`{col}`)" for col in columns if col != "id"])
        sql = f"INSERT INTO `robillscube` ({columns_str}) VALUES ({placeholders})"
        if update_clause:
            sql += f" ON DUPLICATE KEY UPDATE {update_clause}"

        cur.executemany(sql, data)
        db.commit()

        return {"message": f"Successfully uploaded {len(data)} records to robillscube."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        cur.close()
        db.close()
@router.get("/template/forecast")
def get_forecast_template():
    df = pd.DataFrame(columns=FORECAST_COLUMNS)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="forecast_template.xlsx"',
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )

@router.post("/upload/forecast")
async def upload_forecast(file: UploadFile = File(...)):
    if not file.filename.endswith((".xlsx", ".csv")):
        raise HTTPException(status_code=400, detail="File must be Excel or CSV")
        
    try:
        import numpy as np

        contents = await file.read()
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))

        df.columns = [str(col).strip() for col in df.columns]

        # vehicle_id should not be in the upload as it's auto-increment
        safe_cols = [
            col for col in df.columns
            if col in FORECAST_COLUMNS and col != "vehicle_id"
        ]
        if not safe_cols:
            raise HTTPException(
                status_code=400,
                detail="No valid columns found. Please use the provided template."
            )
        df = df[safe_cols]

        def clean_value(val):
            if val is None: return None
            try:
                if pd.isna(val): return None
            except: pass
            if isinstance(val, pd.Timestamp): return val.strftime('%Y-%m-%d %H:%M:%S')
            if isinstance(val, np.integer): return int(val)
            if isinstance(val, np.floating): return float(val)
            return val

        data = [tuple(clean_value(v) for v in row) for row in df.values]

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")

    db = get_db()
    cur = db.cursor()
    try:
        # Ensure vehicle_id is auto_increment if not already
        cur.execute("""
            SELECT DATA_TYPE, EXTRA FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = 'bicoe_forecast_cube' AND COLUMN_NAME = 'vehicle_id'
            AND TABLE_SCHEMA = DATABASE()
        """)
        row = cur.fetchone()
        if row and 'auto_increment' not in row[1].lower():
            try:
                cur.execute("ALTER TABLE `bicoe_forecast_cube` MODIFY COLUMN `vehicle_id` INT AUTO_INCREMENT")
                db.commit()
            except Exception as e:
                print(f"Warning: Could not alter vehicle_id to auto_increment: {e}")

        columns = df.columns.tolist()
        placeholders = ", ".join(["%s"] * len(columns))
        columns_str = ", ".join([f"`{col}`" for col in columns])

        update_clause = ", ".join([f"`{col}`=VALUES(`{col}`)" for col in columns if col != "vehicle_id"])
        sql = f"INSERT INTO `bicoe_forecast_cube` ({columns_str}) VALUES ({placeholders})"
        if update_clause:
            sql += f" ON DUPLICATE KEY UPDATE {update_clause}"

        cur.executemany(sql, data)
        db.commit()

        return {"message": f"Successfully uploaded {len(data)} records to forecast table."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        cur.close()
        db.close()


# ---------------------------
# PREVIEW TABLE DATA
# ---------------------------
@router.get("/preview/{table_type}")
def preview_service_table(table_type: str, page: int = 1, page_size: int = 10):
    if table_type == "robillscube":
        table_name = "robillscube"
        columns = ROBILLSCUBE_COLUMNS
    elif table_type == "forecast":
        table_name = "bicoe_forecast_cube"
        columns = FORECAST_COLUMNS
    else:
        raise HTTPException(status_code=400, detail="Invalid table type")

    db = get_db()
    cur = db.cursor(dictionary=True)

    try:
        cur.execute(f"SELECT COUNT(*) as total FROM `{table_name}`")
        total = cur.fetchone()["total"]

        offset = (page - 1) * page_size
        cur.execute(f"SELECT * FROM `{table_name}` LIMIT %s OFFSET %s", (page_size, offset))
        rows = cur.fetchall()

        # Convert non-serializable values
        serialized_rows = []
        for row in rows:
            serialized = {}
            for k, v in row.items():
                if isinstance(v, datetime):
                    serialized[k] = v.isoformat()
                elif v is None:
                    serialized[k] = ""
                else:
                    serialized[k] = str(v)
            serialized_rows.append(serialized)

        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "columns": columns,
            "rows": serialized_rows
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        cur.close()
        db.close()