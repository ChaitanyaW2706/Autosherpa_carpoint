from fastapi import APIRouter, Body, HTTPException
from db import get_db

router = APIRouter()

@router.post("/aboutus")
def create_or_update_aboutus(item: dict = Body(...)):
    """Create or update About Us section"""
    db = get_db()
    cur = db.cursor(dictionary=True)
    
    try:
        # Check if record exists
        cur.execute("SELECT id FROM dealership_aboutus LIMIT 1")
        existing = cur.fetchone()
        
        if existing:
            # Update existing record
            cur.execute(
                """
                UPDATE dealership_aboutus SET
                    dealership_name = %s,
                    tagline = %s,
                    about_description = %s,
                    brand = %s,
                    modules = %s,
                    updated_at = NOW()
                WHERE id = %s
                """,
                (
                    item.get("dealership_name"),
                    item.get("tagline"),
                    item.get("about_description"),
                    item.get("brand"),
                    item.get("modules"),  # Comma-separated modules
                    existing["id"]
                )
            )
            db.commit()
            return {"message": "About Us updated successfully", "id": existing["id"]}
        else:
            # Create new record
            cur.execute(
                """
                INSERT INTO dealership_aboutus
                (dealership_name, tagline, about_description, brand, modules, created_at)
                VALUES (%s, %s, %s, %s, %s, NOW())
                """,
                (
                    item.get("dealership_name"),
                    item.get("tagline"),
                    item.get("about_description"),
                    item.get("brand"),
                    item.get("modules"),  # Comma-separated modules
                )
            )
            db.commit()
            return {"message": "About Us created successfully", "id": cur.lastrowid}
            
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/aboutus")
def get_aboutus():
    """Get About Us section"""
    db = get_db()
    cur = db.cursor(dictionary=True)
    cur.execute("SELECT * FROM dealership_aboutus LIMIT 1")
    result = cur.fetchone()
    
    if not result:
        raise HTTPException(status_code=404, detail="About Us not found")
    
    # Parse modules back to array if they exist
    if result.get("modules"):
        result["modules"] = result["modules"].split(",")
    else:
        result["modules"] = []
    
    return result
