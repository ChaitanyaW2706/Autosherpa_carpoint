import os
import json
import base64
import requests
import gridfs
from pymongo import MongoClient
import mysql.connector
from dotenv import load_dotenv
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

# Setup MySQL Connection
def get_mysql_conn():
    return mysql.connector.connect(
        host=os.getenv("MYSQL_HOST"),
        port=os.getenv("MYSQL_PORT"),
        user=os.getenv("MYSQL_USER"),
        password=os.getenv("MYSQL_PASSWORD"),
        database=os.getenv("MYSQL_DB")
    )

# Setup MongoDB Connection
mongo_client = MongoClient(os.getenv("MONGO_URI"))
mongo_db = mongo_client[os.getenv("MONGO_DB")]
fs = gridfs.GridFS(mongo_db)

def upload_to_gridfs(bytes_data, filename, content_type="image/jpeg"):
    try:
        file_id = fs.put(bytes_data, filename=filename, content_type=content_type)
        return str(file_id)
    except Exception as e:
        print(f"Error uploading {filename}: {e}")
        return None

def process_image_string(image_str, car_id, prefix="car"):
    """
    Takes a base64 string or a URL, downloads/decodes it, uploads to GridFS, 
    and returns the new GridFS URL.
    """
    image_str = image_str.strip()
    if not image_str:
        return None
        
    try:
        if image_str.startswith("http"):
            # It's an external URL, download it
            resp = requests.get(image_str, timeout=10)
            if resp.status_code == 200:
                bytes_data = resp.content
                content_type = resp.headers.get('Content-Type', 'image/jpeg')
                file_id = upload_to_gridfs(bytes_data, f"{prefix}_{car_id}.jpg", content_type)
                if file_id:
                    return f"/images/{file_id}"
            else:
                print(f"Failed to download URL: {image_str} - Status: {resp.status_code}")
                return image_str # Fallback to original URL
                
        elif image_str.startswith("data:"):
            # It's a data URI (base64)
            header, encoded = image_str.split(",", 1)
            bytes_data = base64.b64decode(encoded)
            file_id = upload_to_gridfs(bytes_data, f"{prefix}_{car_id}.jpg")
            if file_id:
                return f"/images/{file_id}"
                
        elif len(image_str) > 100:
            # Assume it's raw base64
            # Attempt to strip any quotes just in case
            clean_str = image_str.strip('"').strip("'")
            try:
                bytes_data = base64.b64decode(clean_str)
                file_id = upload_to_gridfs(bytes_data, f"{prefix}_{car_id}.jpg")
                if file_id:
                    return f"/images/{file_id}"
            except Exception:
                pass
                
        # If it's none of the above or processing failed, return as is
        return image_str
    except Exception as e:
        print(f"Error processing image for car {car_id}: {e}")
        return image_str

def migrate_sales_cars():
    print("--- Migrating Sales Cars ---")
    conn = get_mysql_conn()
    cur = conn.cursor(dictionary=True)
    
    cur.execute("SELECT id, car_image_base64, brochure_pdf_base64 FROM sales_car_details")
    cars = cur.fetchall()
    
    update_count = 0
    
    for car in cars:
        car_id = car['id']
        car_image_raw = car['car_image_base64']
        brochure_raw = car['brochure_pdf_base64']
        
        new_car_images = []
        new_brochure = brochure_raw
        
        # Process Images
        if car_image_raw:
            try:
                if car_image_raw.startswith("["):
                    # JSON Array format
                    img_list = json.loads(car_image_raw)
                    for i, img in enumerate(img_list):
                        new_url = process_image_string(img, f"{car_id}_{i}")
                        if new_url:
                            new_car_images.append(new_url)
                else:
                    # Comma separated or single base64
                    img_list = car_image_raw.split(",")
                    # If it's a very long base64 string without commas (unlikely but possible), 
                    # split(",") won't hurt. However, if it's a data URI, it CONTAINS a comma:
                    # "data:image/jpeg;base64,/9j/..."
                    if car_image_raw.startswith("data:"):
                        img_list = [car_image_raw]
                    
                    for i, img in enumerate(img_list):
                        if img.strip():
                            new_url = process_image_string(img, f"{car_id}_{i}")
                            if new_url:
                                new_car_images.append(new_url)
            except Exception as e:
                print(f"Error parsing image JSON for sales car {car_id}: {e}")
        
        # Process Brochure
        if brochure_raw and len(brochure_raw) > 100: # Simple check if it's likely base64
            new_brochure = process_image_string(brochure_raw, f"{car_id}_brochure", "brochure")
        
        # Update if changed
        if new_car_images or (new_brochure != brochure_raw):
            new_images_json = json.dumps(new_car_images) if new_car_images else car_image_raw
            try:
                update_cur = conn.cursor()
                update_cur.execute(
                    "UPDATE sales_car_details SET car_image_base64=%s, brochure_pdf_base64=%s WHERE id=%s",
                    (new_images_json, new_brochure, car_id)
                )
                conn.commit()
                update_count += 1
                print(f"Updated sales car {car_id}")
            except Exception as e:
                print(f"Failed to update sales car {car_id}: {e}")
                conn.rollback()

    print(f"--- Completed Sales Cars (Updated {update_count} rows) ---")
    cur.close()
    conn.close()

def migrate_used_cars():
    print("--- Migrating Used Cars ---")
    conn = get_mysql_conn()
    cur = conn.cursor(dictionary=True)
    
    # Check what columns exist
    cur.execute("SHOW COLUMNS FROM carstockdata")
    all_cols = {row["Field"] for row in cur.fetchall()}
    
    has_image_url = "image_url" in all_cols
    has_view_cols = "back_view_image" in all_cols
    
    if not has_image_url and not has_view_cols:
        print("No image columns found in carstockdata.")
        return
        
    cur.execute("SELECT * FROM carstockdata")
    cars = cur.fetchall()
    
    update_count = 0
    
    for car in cars:
        car_id = car.get('id') or car.get('serial_number')
        where_col = 'id' if 'id' in car else 'serial_number'
        updated = False
        update_params = []
        update_cols = []
        
        # Process legacy image_url column
        if has_image_url and car.get('image_url'):
            raw = car['image_url']
            parsed_dict = {}
            if raw.startswith("{"):
                try:
                    parsed_dict = json.loads(raw)
                except:
                    pass
            elif raw.startswith("["):
                try:
                    arr = json.loads(raw)
                    keys = ["back", "right", "front", "left", "interior"]
                    parsed_dict = {keys[i]: v for i, v in enumerate(arr) if i < len(keys) and v}
                except:
                    pass
            else:
                parsed_dict = {"back": raw}
                
            new_dict = {}
            for k, v in parsed_dict.items():
                new_url = process_image_string(v, f"used_{car_id}_{k}")
                if new_url:
                    new_dict[k] = new_url
                    
            if new_dict:
                new_json = json.dumps(new_dict)
                if new_json != raw:
                    update_cols.append("`image_url`=%s")
                    update_params.append(new_json)
                    updated = True
        
        # Process individual view columns
        if has_view_cols:
            for view_col in ["back_view_image", "right_view_image", "front_view_image", "left_view_image", "interior_image"]:
                if car.get(view_col):
                    new_url = process_image_string(car[view_col], f"used_{car_id}_{view_col}")
                    if new_url and new_url != car[view_col]:
                        update_cols.append(f"`{view_col}`=%s")
                        update_params.append(new_url)
                        updated = True
        
        if updated:
            try:
                update_cur = conn.cursor()
                set_clause = ", ".join(update_cols)
                update_params.append(car_id)
                update_cur.execute(f"UPDATE carstockdata SET {set_clause} WHERE {where_col}=%s", tuple(update_params))
                conn.commit()
                update_count += 1
                print(f"Updated used car {car_id}")
            except Exception as e:
                print(f"Failed to update used car {car_id}: {e}")
                conn.rollback()

    print(f"--- Completed Used Cars (Updated {update_count} rows) ---")
    cur.close()
    conn.close()

if __name__ == "__main__":
    print("Starting Migration...")
    migrate_sales_cars()
    migrate_used_cars()
    print("Migration Complete.")
