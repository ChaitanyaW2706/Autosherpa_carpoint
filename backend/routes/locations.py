from fastapi import APIRouter, Query, Body, HTTPException
from db import get_db

router = APIRouter()

LOCATIONS_COLUMNS = [
    "location_name", "address", "phone", "email", "hours", 
    "latitude", "longitude", "map_url", "status", "module"
]

@router.post("/locations")
def create_location(item: dict = Body(...)):
    """Create a new location/contact point"""
    db = get_db()
    cur = db.cursor()
    try:
        cur.execute(
            """
            INSERT INTO dealer_locations
            (`location_name`, `address`, `phone`, `email`, `hours`, `latitude`, `longitude`, `map_url`, `status`, `module`, `created_at`)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
            """,
            (
                item.get("location_name"),
                item.get("address"),
                item.get("phone"),
                item.get("email"),
                item.get("hours"),
                item.get("latitude"),
                item.get("longitude"),
                item.get("map_url"),
                item.get("status", "active"),
                item.get("module", "All"),
            )
        )
        db.commit()
        return {"message": "Location created successfully", "id": cur.lastrowid}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/locations")
def get_locations(status: str = Query(None, description="Filter by status (active/inactive)")):
    """Get all locations"""
    db = get_db()
    cur = db.cursor(dictionary=True)
    
    if status:
        cur.execute("SELECT * FROM dealer_locations WHERE status = %s ORDER BY created_at DESC", (status,))
    else:
        cur.execute("SELECT * FROM dealer_locations ORDER BY created_at DESC")
    
    return cur.fetchall()


@router.get("/locations/{location_id}")
def get_location(location_id: int):
    """Get a specific location by ID"""
    db = get_db()
    cur = db.cursor(dictionary=True)
    cur.execute("SELECT * FROM dealer_locations WHERE id=%s", (location_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Location not found")
    return row


@router.put("/locations/{location_id}")
def update_location(location_id: int, item: dict = Body(...)):
    """Update a location"""
    db = get_db()
    cur = db.cursor(dictionary=True)
    cur.execute("SELECT * FROM dealer_locations WHERE id=%s", (location_id,))
    existing = cur.fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Location not found")

    def preserve(key):
        value = item.get(key)
        return existing.get(key) if value in (None, "") else value

    try:
        cur.execute(
            """
            UPDATE dealer_locations SET
                location_name=%s,
                address=%s,
                phone=%s,
                email=%s,
                hours=%s,
                latitude=%s,
                longitude=%s,
                map_url=%s,
                status=%s,
                module=%s
            WHERE id=%s
            """,
            (
                preserve("location_name"),
                preserve("address"),
                preserve("phone"),
                preserve("email"),
                preserve("hours"),
                preserve("latitude"),
                preserve("longitude"),
                preserve("map_url"),
                preserve("status"),
                preserve("module"),
                location_id,
            )
        )
        db.commit()
        return {"message": "Location updated successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/locations/{location_id}")
def delete_location(location_id: int):
    """Delete a location"""
    db = get_db()
    cur = db.cursor()
    try:
        cur.execute("DELETE FROM dealer_locations WHERE id=%s", (location_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Location not found")
        db.commit()
        return {"message": "Location deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
