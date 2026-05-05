# sales.py - Fixed version
import csv
import io
import json
from fastapi import APIRouter, Query, Body, HTTPException, UploadFile, File
from db import get_db
import pandas as pd

router = APIRouter()

# -------------------- GET LISTS --------------------
@router.get("/colors")
def get_colors():
    db = get_db()
    cur = db.cursor(dictionary=True)
    cur.execute("SELECT id, car_id, color_name FROM car_colors")
    return cur.fetchall()

@router.get("/fuel-types")
def get_fuel_types():
    db = get_db()
    cur = db.cursor(dictionary=True)
    cur.execute("SELECT id, car_id, fuel_type FROM car_fuel_types")
    return cur.fetchall()

@router.get("/transmissions")
def get_transmissions():
    db = get_db()
    cur = db.cursor(dictionary=True)
    cur.execute("SELECT id, car_id, transmission_type FROM car_transmissions")
    return cur.fetchall()

@router.get("/car-types")
def get_car_types():
    db = get_db()
    cur = db.cursor(dictionary=True)
    cur.execute("SELECT id, type_name FROM car_types ORDER BY type_name")
    return cur.fetchall()


def resolve_car_type_id(cur, type_id=None, custom_type_name=None):
    if custom_type_name:
        custom_type_name = custom_type_name.strip()
        if custom_type_name:
            cur.execute("SELECT id FROM car_types WHERE type_name=%s", (custom_type_name,))
            existing = cur.fetchone()
            if existing:
                if isinstance(existing, dict):
                    return existing.get("id")
                return existing[0]
            cur.execute("INSERT INTO car_types (type_name) VALUES (%s)", (custom_type_name,))
            return cur.lastrowid
    if type_id:
        return int(type_id)
    return None


# -------------------- GET ALL CARS (FOR DROPDOWN) --------------------
@router.get("/cars-all")
def get_all_cars():
    db = get_db()
    cur = db.cursor(dictionary=True)
    cur.execute("""
        SELECT id, make, model, variant
        FROM sales_car_details
        ORDER BY make, model
    """)
    return cur.fetchall()


# -------------------- GET CARS (FULL DETAILS) --------------------
@router.get("/cars-full")
def get_cars_full(car_id: int = Query(None)):
    db = get_db()
    cur = db.cursor(dictionary=True)

    query = """
    SELECT 
        s.id,
        s.make,
        s.model,
        s.variant,
        s.mileage_kmph,
        s.`Ex-Showroom Price Base Model` AS ex_showroom_price_base,
        s.`Ex-Showroom Price Top Model` AS ex_showroom_price_top,
        s.car_image_base64,
        s.brochure_pdf_base64,
        s.type_id,
        t.type_name AS type_name,
        s.description,
        cf.fuel_type AS fuel_type,
        tr.transmission_type AS transmission_type,
        col.color_name AS color_name,
        s.status
    FROM sales_car_details s
    LEFT JOIN car_types t ON t.id = s.type_id
    LEFT JOIN car_fuel_types cf ON cf.car_id = s.id
    LEFT JOIN car_transmissions tr ON tr.car_id = s.id
    LEFT JOIN car_colors col ON col.car_id = s.id
    """

    if car_id:
        query += " WHERE s.id = %s"
        cur.execute(query, (car_id,))
    else:
        cur.execute(query)

    return cur.fetchall()


# -------------------- CAR CRUD (MASTER TABLE) --------------------
@router.post("/cars")
def add_car(car: dict = Body(...)):
    db = get_db()
    cur = db.cursor()
    try:
        image_value = car.get("car_images_base64") or car.get("car_image_base64")
        if isinstance(image_value, list):
            image_value = json.dumps(image_value)
        resolved_type_id = resolve_car_type_id(cur, car.get("type_id"), car.get("custom_type_name"))
        cur.execute("""
            INSERT INTO sales_car_details 
            (make, model, variant, mileage_kmph, 
             `Ex-Showroom Price Base Model`, `Ex-Showroom Price Top Model`,
             car_image_base64, brochure_pdf_base64, type_id, description)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            car["make"],
            car["model"],
            car["variant"],
            int(car["mileage_kmph"]),
            int(car.get("ex_showroom_price_base", 0)),
            int(car.get("ex_showroom_price_top", 0)),
            image_value,
            car.get("brochure_pdf_base64"),
            resolved_type_id,
            car.get("description")
        ))
        car_id = cur.lastrowid
        
        # Insert related data
        colors = car.get("colors", [])
        for color in colors:
            if color.strip():
                cur.execute("INSERT INTO car_colors (car_id, color_name) VALUES (%s, %s)", (car_id, color.strip()))
        
        fuels = car.get("fuels", [])
        for fuel in fuels:
            if fuel.strip():
                cur.execute("INSERT INTO car_fuel_types (car_id, fuel_type) VALUES (%s, %s)", (car_id, fuel.strip()))
        
        transmissions = car.get("transmissions", [])
        for trans in transmissions:
            if trans.strip():
                cur.execute("INSERT INTO car_transmissions (car_id, transmission_type) VALUES (%s, %s)", (car_id, trans.strip()))
        
        db.commit()
        return {"message": "Car added successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/cars/{car_id}")
def update_car(car_id: int, car: dict = Body(...)):
    db = get_db()
    cur = db.cursor(dictionary=True)
    try:
        cur.execute("SELECT car_image_base64, brochure_pdf_base64 FROM sales_car_details WHERE id=%s", (car_id,))
        existing = cur.fetchone() or {}

        image_value = car.get("car_images_base64") or car.get("car_image_base64")
        if isinstance(image_value, list):
            image_value = json.dumps(image_value)
        if image_value is None:
            image_value = existing.get("car_image_base64")

        brochure_value = car.get("brochure_pdf_base64")
        if brochure_value is None:
            brochure_value = existing.get("brochure_pdf_base64")

        new_type_id = resolve_car_type_id(cur, car.get("type_id"), car.get("custom_type_name"))
        cur.execute("""
            UPDATE sales_car_details 
            SET make=%s,
                model=%s,
                variant=%s,
                mileage_kmph=%s,
                `Ex-Showroom Price Base Model`=%s,
                `Ex-Showroom Price Top Model`=%s,
                car_image_base64=%s,
                brochure_pdf_base64=%s,
                type_id=%s,
                description=%s
            WHERE id=%s
        """, (
            car["make"],
            car["model"],
            car["variant"],
            car["mileage_kmph"],
            car.get("ex_showroom_price_base", 0),
            car.get("ex_showroom_price_top", 0),
            image_value,
            brochure_value,
            new_type_id,
            car.get("description"),
            car_id
        ))

        # Delete existing related records
        cur.execute("DELETE FROM car_colors WHERE car_id=%s", (car_id,))
        cur.execute("DELETE FROM car_fuel_types WHERE car_id=%s", (car_id,))
        cur.execute("DELETE FROM car_transmissions WHERE car_id=%s", (car_id,))

        # Insert new related records
        colors = car.get("colors") or []
        if colors:
            for color in colors:
                cur.execute("INSERT INTO car_colors (car_id, color_name) VALUES (%s, %s)", (car_id, color))

        fuel_types = car.get("fuel_types") or car.get("fuels") or []
        if fuel_types:
            for fuel in fuel_types:
                cur.execute("INSERT INTO car_fuel_types (car_id, fuel_type) VALUES (%s, %s)", (car_id, fuel))

        transmissions = car.get("transmissions") or []
        if transmissions:
            for transmission in transmissions:
                cur.execute("INSERT INTO car_transmissions (car_id, transmission_type) VALUES (%s, %s)", (car_id, transmission))

        db.commit()
        return {"message": "Car updated"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/cars/{car_id}")
def delete_car(car_id: int):
    db = get_db()
    cur = db.cursor()
    try:
        cur.execute("DELETE FROM sales_car_details WHERE id=%s", (car_id,))
        db.commit()
        return {"message": "Car deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# -------------------- COLORS CRUD --------------------
@router.post("/cars/{car_id}/colors")
def add_color(car_id: int, color_name: str = Body(...)):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT 1 FROM car_colors WHERE car_id=%s AND color_name=%s", (car_id, color_name))
    if cur.fetchone():
        return {"message": "Color already exists"}

    try:
        cur.execute("INSERT INTO car_colors (car_id, color_name) VALUES (%s,%s)", (car_id, color_name))
        db.commit()
        return {"message": "Color added"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/colors/{id}")
def delete_color(id: int):
    db = get_db()
    cur = db.cursor()
    try:
        cur.execute("DELETE FROM car_colors WHERE id=%s", (id,))
        db.commit()
        return {"message": "Color deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# -------------------- FUEL TYPES CRUD --------------------
@router.post("/cars/{car_id}/fuel-types")
def add_fuel(car_id: int, fuel_type: str = Body(...)):
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT 1 FROM car_fuel_types WHERE car_id=%s AND fuel_type=%s", (car_id, fuel_type))
    if cur.fetchone():
        return {"message": "Fuel type already exists"}

    try:
        cur.execute("INSERT INTO car_fuel_types (car_id, fuel_type) VALUES (%s,%s)", (car_id, fuel_type))
        db.commit()
        return {"message": "Fuel type added"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/fuel-types/{id}")
def delete_fuel(id: int):
    db = get_db()
    cur = db.cursor()
    try:
        cur.execute("DELETE FROM car_fuel_types WHERE id=%s", (id,))
        db.commit()
        return {"message": "Fuel type deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# -------------------- TRANSMISSION CRUD --------------------
@router.post("/cars/{car_id}/transmissions")
def add_transmission(car_id: int, transmission_type: str = Body(...)):
    db = get_db()
    cur = db.cursor()
    cur.execute(
        "SELECT 1 FROM car_transmissions WHERE car_id=%s AND transmission_type=%s",
        (car_id, transmission_type)
    )
    if cur.fetchone():
        return {"message": "Transmission already exists"}

    try:
        cur.execute(
            "INSERT INTO car_transmissions (car_id, transmission_type) VALUES (%s,%s)",
            (car_id, transmission_type)
        )
        db.commit()
        return {"message": "Transmission added"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/transmissions/{id}")
def delete_transmission(id: int):
    db = get_db()
    cur = db.cursor()
    try:
        cur.execute("DELETE FROM car_transmissions WHERE id=%s", (id,))
        db.commit()
        return {"message": "Transmission deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# -------------------- FAST META ENDPOINT (NO IMAGES - FOR FAST INITIAL LOAD) --------------------
@router.get("/cars-meta")
def get_cars_meta(car_id: int = Query(None)):
    """Returns all car details EXCEPT base64 images/brochures - for fast initial page load."""
    db = get_db()
    cur = db.cursor(dictionary=True)

    query = """
    SELECT 
        s.id,
        s.make,
        s.model,
        s.variant,
        s.mileage_kmph,
        s.`Ex-Showroom Price Base Model` AS ex_showroom_price_base,
        s.`Ex-Showroom Price Top Model` AS ex_showroom_price_top,
        s.type_id,
        t.type_name AS type_name,
        s.description
    FROM sales_car_details s
    LEFT JOIN car_types t ON t.id = s.type_id
    """

    if car_id:
        query += " WHERE s.id = %s"
        cur.execute(query, (car_id,))
    else:
        cur.execute(query)

    cars = cur.fetchall()

    if not cars:
        return []

    car_ids = [c["id"] for c in cars]
    fmt = ",".join(["%s"] * len(car_ids))

    cur.execute(f"SELECT car_id, fuel_type FROM car_fuel_types WHERE car_id IN ({fmt})", car_ids)
    fuels_map = {}
    for row in cur.fetchall():
        fuels_map.setdefault(row["car_id"], []).append({"fuel_type": row["fuel_type"]})

    cur.execute(f"SELECT car_id, transmission_type FROM car_transmissions WHERE car_id IN ({fmt})", car_ids)
    trans_map = {}
    for row in cur.fetchall():
        trans_map.setdefault(row["car_id"], []).append({"transmission_type": row["transmission_type"]})

    cur.execute(f"SELECT car_id, color_name FROM car_colors WHERE car_id IN ({fmt})", car_ids)
    colors_map = {}
    for row in cur.fetchall():
        colors_map.setdefault(row["car_id"], []).append({"color_name": row["color_name"]})

    for car in cars:
        cid = car["id"]
        car["fuels"] = fuels_map.get(cid, [])
        car["transmissions"] = trans_map.get(cid, [])
        car["colors"] = colors_map.get(cid, [])
        car["car_image_base64"] = None  # placeholder - loaded lazily

    return cars


# -------------------- IMAGE-ONLY ENDPOINT (FOR LAZY LOADING) --------------------
@router.get("/cars-image/{car_id}")
def get_car_image(car_id: int):
    """Returns only the image base64 for a single car - called lazily after page renders."""
    db = get_db()
    cur = db.cursor(dictionary=True)
    cur.execute("SELECT id, car_image_base64 FROM sales_car_details WHERE id=%s", (car_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Car not found")
    return {"id": row["id"], "car_image_base64": row["car_image_base64"]}


# -------------------- GROUPED VIEW (FOR UI DROPDOWN FLOW) --------------------
@router.get("/cars-grouped")
def get_cars_grouped(car_id: int = Query(None)):
    db = get_db()
    cur = db.cursor(dictionary=True)

    query = """
    SELECT 
        s.id,
        s.make,
        s.model,
        s.variant,
        s.mileage_kmph,
        s.`Ex-Showroom Price Base Model` AS ex_showroom_price_base,
        s.`Ex-Showroom Price Top Model` AS ex_showroom_price_top,
        s.car_image_base64,
        s.brochure_pdf_base64,
        s.type_id,
        t.type_name AS type_name,
        s.description
    FROM sales_car_details s
    LEFT JOIN car_types t ON t.id = s.type_id
    """

    if car_id:
        query += " WHERE s.id = %s"
        cur.execute(query, (car_id,))
    else:
        cur.execute(query)

    cars = cur.fetchall()

    for car in cars:
        cid = car["id"]

        cur.execute("SELECT id, fuel_type FROM car_fuel_types WHERE car_id=%s", (cid,))
        car["fuels"] = cur.fetchall()

        cur.execute("SELECT id, transmission_type FROM car_transmissions WHERE car_id=%s", (cid,))
        car["transmissions"] = cur.fetchall()

        cur.execute("SELECT id, color_name FROM car_colors WHERE car_id=%s", (cid,))
        car["colors"] = cur.fetchall()

    return cars


# -------------------- COLORS UPDATE --------------------
@router.put("/cars/{car_id}/colors/{color_id}")
def update_color(car_id: int, color_id: int, color_name: str = Body(...)):
    db = get_db()
    cur = db.cursor()
    try:
        cur.execute(
            """
            UPDATE car_colors 
            SET color_name = %s 
            WHERE id = %s AND car_id = %s
            """,
            (color_name, color_id, car_id)
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Color not found or doesn't belong to this car")
        db.commit()
        return {"message": "Color updated successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# -------------------- FUEL TYPES UPDATE --------------------
@router.put("/cars/{car_id}/fuel-types/{fuel_id}")
def update_fuel(car_id: int, fuel_id: int, fuel_type: str = Body(...)):
    db = get_db()
    cur = db.cursor()
    try:
        cur.execute(
            """
            UPDATE car_fuel_types 
            SET fuel_type = %s 
            WHERE id = %s AND car_id = %s
            """,
            (fuel_type, fuel_id, car_id)
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Fuel type not found or doesn't belong to this car")
        db.commit()
        return {"message": "Fuel type updated successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# -------------------- TRANSMISSIONS UPDATE --------------------
@router.put("/cars/{car_id}/transmissions/{transmission_id}")
def update_transmission(car_id: int, transmission_id: int, transmission_type: str = Body(...)):
    db = get_db()
    cur = db.cursor()
    try:
        cur.execute(
            """
            UPDATE car_transmissions 
            SET transmission_type = %s 
            WHERE id = %s AND car_id = %s
            """,
            (transmission_type, transmission_id, car_id)
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Transmission not found or doesn't belong to this car")
        db.commit()
        return {"message": "Transmission updated successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# -------------------- BULK UPLOADS --------------------

@router.post("/bulk-upload-cars")
async def bulk_upload_cars(file: UploadFile = File(...)):
    filename = file.filename.lower()
    if not (filename.endswith('.csv') or filename.endswith('.xls') or filename.endswith('.xlsx')):
        raise HTTPException(status_code=400, detail="Only CSV, XLS, and XLSX files are supported")
    
    def get_csv_value(row, *keys):
        # Try exact match first
        for key in keys:
            if key in row:
                value = row.get(key)
                if value is not None:
                    val_str = str(value).strip()
                    if val_str and val_str.lower() != 'nan':
                        return val_str
        
        # Flexible matching: case-insensitive with whitespace handling
        row_keys_lower = {k.lower().strip(): k for k in row.keys()}
        for key in keys:
            key_lower = key.lower().strip()
            if key_lower in row_keys_lower:
                actual_key = row_keys_lower[key_lower]
                value = row.get(actual_key)
                if value is not None:
                    val_str = str(value).strip()
                    if val_str and val_str.lower() != 'nan':
                        return val_str
        return ""

    def parse_list_field(value):
        if not value:
            return []
        return [item.strip() for item in str(value).replace(';', ',').split(',') if item.strip()]

    content = await file.read()
    
    # Parse Excel or CSV files
    if filename.endswith('.xlsx') or filename.endswith('.xls'):
        df = pd.read_excel(io.BytesIO(content))
        # Normalize column names: strip whitespace and handle NaN values
        df.columns = df.columns.str.strip()
        reader = df.fillna('').to_dict('records')
    else:
        decoded = content.decode('utf-8').splitlines()
        reader = csv.DictReader(decoded)
    
    db = get_db()
    cur = db.cursor()
    success_count = 0
    
    try:
        for row in reader:
            make = get_csv_value(row, "Brand", "Make")
            model = get_csv_value(row, "Model")
            variant = get_csv_value(row, "Variant Type", "Variant")
            price_base = get_csv_value(row, "Price Base", "Ex-Showroom Price Base Model", "Ex-Showroom Price Base")
            price_top = get_csv_value(row, "Price Top", "Ex-Showroom Price Top Model", "Ex-Showroom Price Top")
            fuel = get_csv_value(row, "Fuel", "Fuel Type")
            transmission = get_csv_value(row, "Trans", "Transmission", "Transmission Type")
            mileage = get_csv_value(row, "Mileage", "Mileage (KMPL)", "Avg Mileage", "KMPL", "Avg Mileage (KMPL)")
            color = get_csv_value(row, "Color", "Colors")
            desc = get_csv_value(row, "Description", "Desc")

            if not make or not model:
                continue

            try:
                if mileage:
                    import re
                    mileage_clean = re.sub(r'[^\d.]', '', str(mileage))
                    mileage = int(float(mileage_clean)) if mileage_clean else 0
                else:
                    mileage = 0
            except (ValueError, TypeError):
                mileage = 0
            try:
                price_base = int(float(price_base)) if price_base else 0
            except (ValueError, TypeError):
                price_base = 0
            try:
                price_top = int(float(price_top)) if price_top else 0
            except (ValueError, TypeError):
                price_top = 0

            try:
                cur.execute("""
                    INSERT INTO sales_car_details 
                    (make, model, variant, mileage_kmph, `Ex-Showroom Price Base Model`, `Ex-Showroom Price Top Model`, description)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (make, model, variant, mileage, price_base, price_top, desc))
                
                car_id = cur.lastrowid
                
                for fuel_type in parse_list_field(fuel):
                    cur.execute("INSERT INTO car_fuel_types (car_id, fuel_type) VALUES (%s, %s)", (car_id, fuel_type))
                for transmission_type in parse_list_field(transmission):
                    cur.execute("INSERT INTO car_transmissions (car_id, transmission_type) VALUES (%s, %s)", (car_id, transmission_type))
                for color_name in parse_list_field(color):
                    cur.execute("INSERT INTO car_colors (car_id, color_name) VALUES (%s, %s)", (car_id, color_name))
                
                success_count += 1
            except Exception as row_err:
                print(f"Error inserting row {row}: {row_err}")
                continue
            
        db.commit()
        return {"message": f"Successfully uploaded {success_count} cars"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))