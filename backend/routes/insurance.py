from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from db import get_db   
import io
import pandas as pd

router = APIRouter()

FORECASTED_COLUMNS = [
    "VehicleRegnNo", "customerName", "phonenumber", "vehicle_id",
    "customer_id", "location_id", "chassisNo", "saledate", "policyeffectivedate",
    "policyexpirydate", "renewaltype", "Campaign", "insurancecompanyname",
    "IsAssigned", "assigneddate", "crename", "lastdisposition", "created_date",
    "updated_date", "duedateEdited", "PolicyDueDateUpdatedDate", "PolicyDueDateUpdatedByUser"
]

INDIVIDUAL_COLUMNS = [
    "policyno", "policytype", "policyissuedate", "policyissuetime",
    "riskinceptiondate", "insurancecompany", "policyexpirydate", "automembership",
    "automembershippremium", "panoofperson", "pasuminsuredperperson", "papremium",
    "odpremium", "tppremium", "tppdextnsumassured", "tppdextnpremium", "voluntaryexcesslimit",
    "voluntaryexcesspremium", "geographicextnpremium", "drivercover", "legalliabilitynoofperson",
    "drivercoverpremium", "employerliabilitynoofemployees", "employerlabilitypremium",
    "servicetaxamount", "electricalaccessoriesvalue", "nonElectricalaccessoriesvalue",
    "electricalaccessoriespremium", "nonelectricalaccessoriespremium", "cngkitvalue",
    "cngpremium", "partapremium", "partbpremium", "premium", "grosstotalpremium",
    "compulsoryexcess", "previouspolicyno", "freshrenewal", "paymentstatus", "previousinsurer",
    "malusncbvalue", "maluspremium", "cancelstatus", "cancelleddate", "cancelledremarks",
    "64vbverifiedstatus", "zerodepstatus", "zerodeppremium", "enginecoverpremium", "rtipremium",
    "expiredremarks", "freescheme", "renewalstatus", "mirenewalbreakup", "mirenewalstatus",
    "previouspolicyissuedate", "previouspolicyexpirydate", "cancellationremarksbydealer",
    "dealerscancellationexecutive", "cancellationtime", "chequeof", "remunerationpaid",
    "autodebitstatus", "blockedby", "blockeddate", "blockedremarks", "requestsubmissiondate",
    "ccaverifieddate", "odcancelledremarks", "statusremarks", "odcancellationdate", "proposalnumber",
    "ncbpreviouspolicyno", "ncbpreviousinsurer", "claimcount", "customername", "city",
    "dateofbirth", "customerpincode", "customerstate", "submodel", "dealer", "dealeraddress",
    "dealerphoneno", "VehicleRegnNo", "vehicletype", "engineno", "chassisno", "showroomprice",
    "yearofmanufacture", "dealeroutletcity", "mulvariant", "mulcolor", "dealersexecutive",
    "dealercode", "forcode", "vehiclesaledate", "insureddeclaredvalue", "antitheftdeviceinstalled",
    "vin", "region", "financed", "financecompany", "otherfinancecompany", "paymentreconciliation",
    "reconciliationinstrumentno", "reconciliationinstrumentdrawnon", "reconciliationinstrumentdate",
    "reconciliationinstrumentamount", "depositno", "muldepositno", "reconciliationdate",
    "64vbdepositno", "chequeno1", "chequeamount1", "creditamount1", "creditdate1", "collectiondate1",
    "grosspremiumamount", "creditnoteno", "confirmeddate", "remarks", "claims", "workshop_id",
    "location", "campaignFromDate", "campaignToDate", "uploadid", "locType", "webpolicystatusyn",
    "consumablepremium", "rsapremium", "keyprotectpremium"
]


# ---------------------------
# GET INSURANCE RENEWALS
# ---------------------------
@router.get("/renewals")
def get_renewals():
    db = get_db()
    cur = db.cursor(dictionary=True)

    cur.execute("""
        SELECT 
            id,
            mobile_number,
            vehicle_reg_no,
            customer_name,
            renewal_type,
            appointment_mode,
            appointment_date,
            appointment_time,
            address,
            created_at
        FROM insurance_renewal_requests
        ORDER BY id DESC
    """)

    rows = cur.fetchall()
    cur.close()
    db.close()
    return rows


# ---------------------------
# GET INSURANCE ESTIMATES
# ---------------------------
@router.get("/estimates")
def get_estimates():
    db = get_db()
    cur = db.cursor(dictionary=True)

    cur.execute("""
        SELECT 
            id,
            mobile_number,
            customer_name,
            vehicle_reg_no,
            document_name,
            document_type,
            file_size,
            created_at,
            updated_at
        FROM insurance_estimate_requests
        ORDER BY id DESC
    """)

    rows = cur.fetchall()
    cur.close()
    db.close()
    return rows


# ---------------------------
# VIEW / DOWNLOAD ESTIMATE DOCUMENT (BLOB)
# ---------------------------
@router.get("/estimates/{estimate_id}/document")
def view_or_download_estimate_document(estimate_id: int):
    db = get_db()
    cur = db.cursor(dictionary=True)

    cur.execute("""
        SELECT document_name, document_data, document_type
        FROM insurance_estimate_requests
        WHERE id = %s
    """, (estimate_id,))

    row = cur.fetchone()
    cur.close()
    db.close()

    if not row:
        raise HTTPException(status_code=404, detail="Document not found")

    file_bytes = row["document_data"]
    file_name = row["document_name"]
    file_type = row["document_type"]

    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=file_type,
        headers={
            "Content-Disposition": f'inline; filename="{file_name}"'
        }
    )





# ---------------------------
# DOWNLOAD EXCEL TEMPLATES
# ---------------------------
@router.get("/template/{table_type}")
def get_template(table_type: str):
    if table_type == "forecasted":
        columns = list(FORECASTED_COLUMNS)
        filename = "insuranceforecasteddata_template.xlsx"
    elif table_type == "individual":
        columns = list(INDIVIDUAL_COLUMNS)
        filename = "individualreport_template.xlsx"
    else:
        raise HTTPException(status_code=400, detail="Invalid table type")

    df = pd.DataFrame(columns=columns)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False)
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )


# ---------------------------
# UPLOAD DATA FROM EXCEL
# ---------------------------
@router.post("/upload/{table_type}")
async def upload_data(table_type: str, file: UploadFile = File(...)):
    if not file.filename.endswith((".xlsx", ".csv")):
        raise HTTPException(status_code=400, detail="File must be Excel or CSV")

    # Determine table config FIRST so we can whitelist columns
    if table_type == "forecasted":
        table_name = "insuranceforecasteddata"
        pk = "VehicleRegnNo"
        allowed_columns = FORECASTED_COLUMNS
    elif table_type == "individual":
        table_name = "individualreport"
        pk = "VehicleRegnNo"
        allowed_columns = INDIVIDUAL_COLUMNS
    else:
        raise HTTPException(status_code=400, detail="Invalid table type")

    try:
        import numpy as np

        contents = await file.read()
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))

        # Step 1: Normalize column names to plain strings
        df.columns = [str(col).strip() for col in df.columns]
        
        # Step 2: WHITELIST FILTER — keep only schema columns, drop id too.
        # id is AUTO_INCREMENT on the DB, never inserted from file.
        safe_cols = [
            col for col in df.columns
            if col in allowed_columns and col != "id"
        ]
        if not safe_cols:
            raise HTTPException(
                status_code=400,
                detail="No valid columns found. Please use the provided template."
            )
        df = df[safe_cols]

        # Step 3: Convert every cell to a MySQL-safe Python native type.
        # df.where(pd.notnull(...), None) does NOT work reliably on mixed numpy
        # types — numpy NaN/Timestamp/int64 must be converted explicitly.
        def clean_value(val):
            if val is None:
                return None
            try:
                if pd.isna(val):
                    return None
            except (TypeError, ValueError):
                pass
            if isinstance(val, pd.Timestamp):
                return val.strftime('%Y-%m-%d %H:%M:%S')
            if isinstance(val, np.integer):
                return int(val)
            if isinstance(val, np.floating):
                return float(val)
            return val

        data = [tuple(clean_value(v) for v in row) for row in df.values]

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")

    db = get_db()
    cur = db.cursor()
    try:
        # Ensure id is AUTO_INCREMENT INT on the forecasted table
        # (run once — safe to run every time, IF/ELSE guards it)
        if table_type == "forecasted":
            cur.execute("""
                SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = %s AND COLUMN_NAME = 'id'
                AND TABLE_SCHEMA = DATABASE()
            """, (table_name,))
            row = cur.fetchone()
            if row and row[0].lower() in ('varchar', 'char', 'text'):
                cur.execute(f"""
                    ALTER TABLE `{table_name}`
                    MODIFY COLUMN `id` INT NOT NULL AUTO_INCREMENT
                """)
                db.commit()
        
        # Ensure id is AUTO_INCREMENT INT on the individualreport table
        if table_type == "individual":
            cur.execute("""
                SELECT DATA_TYPE, EXTRA FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = %s AND COLUMN_NAME = 'id'
                AND TABLE_SCHEMA = DATABASE()
            """, (table_name,))
            row = cur.fetchone()
            if row and 'auto_increment' not in row[1].lower():
                try:
                    # Modify to be INT AUTO_INCREMENT. Requires it to be a key.
                    # Add unique key if it's not already primary to avoid MySQL errors.
                    cur.execute(f"""
                        ALTER TABLE `{table_name}`
                        MODIFY COLUMN `id` INT AUTO_INCREMENT UNIQUE
                    """)
                    db.commit()
                except Exception as alter_err:
                    print("Could not auto-alter id column for individual:", alter_err)

        columns = df.columns.tolist()
        placeholders = ", ".join(["%s"] * len(columns))
        columns_str = ", ".join([f"`{col}`" for col in columns])

        # ON DUPLICATE KEY UPDATE — upsert on the real PK (VehicleRegnNo)
        update_clause = ", ".join([f"`{col}`=VALUES(`{col}`)" for col in columns if col != pk])

        sql = f"INSERT INTO `{table_name}` ({columns_str}) VALUES ({placeholders})"
        if update_clause:
            sql += f" ON DUPLICATE KEY UPDATE {update_clause}"

        cur.executemany(sql, data)
        db.commit()

        return {"message": f"Successfully uploaded {len(data)} records to {table_name}."}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        cur.close()
        db.close()


# ---------------------------
# PREVIEW UPLOADED TABLE DATA
# ---------------------------
@router.get("/preview/{table_type}")
def preview_table(table_type: str, page: int = 1, page_size: int = 10):
    if table_type == "forecasted":
        table_name = "insuranceforecasteddata"
        columns = FORECASTED_COLUMNS
    elif table_type == "individual":
        table_name = "individualreport"
        columns = INDIVIDUAL_COLUMNS
    else:
        raise HTTPException(status_code=400, detail="Invalid table type")

    db = get_db()
    cur = db.cursor(dictionary=True)

    try:
        # Get total count
        cur.execute(f"SELECT COUNT(*) as total FROM `{table_name}`")
        total = cur.fetchone()["total"]

        # Get paginated data
        offset = (page - 1) * page_size
        cur.execute(f"SELECT * FROM `{table_name}` LIMIT %s OFFSET %s", (page_size, offset))
        rows = cur.fetchall()

        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "columns": columns,
            "rows": rows
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    finally:
        cur.close()
        db.close()