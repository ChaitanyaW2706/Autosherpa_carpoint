from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.sales      import router as sales_router
from routes.insurance  import router as insurance_router
from routes.history    import router as history_router
from routes.service    import router as service_router
from routes.block      import router as block_router, init_block_table
from routes.usedcar    import router as usedcar_router
from routes.locations   import router as locations_router
from routes.aboutus     import router as aboutus_router
from routes.refinancing import router as refinancing_router
from routes.auth       import router as auth_router, init_users_table
from db import get_mongo_col
from bson.objectid import ObjectId
import gridfs
from fastapi.responses import StreamingResponse
from fastapi import HTTPException

app = FastAPI(title="AutoSherpa Ops API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sales_router,     prefix="/sales",     tags=["Sales"])
app.include_router(insurance_router, prefix="/insurance", tags=["Insurance"])
app.include_router(history_router,   prefix="/history",   tags=["History"])
app.include_router(service_router,   prefix="/service",   tags=["Service"])
app.include_router(block_router,     prefix="/block",     tags=["Block"])
app.include_router(usedcar_router,   prefix="/usedcar",   tags=["UsedCar"])
app.include_router(locations_router, prefix="/locations", tags=["Locations"])
app.include_router(aboutus_router,   prefix="/aboutus",   tags=["AboutUs"])
app.include_router(refinancing_router, prefix="/refinancing", tags=["Refinancing"])
app.include_router(auth_router,     prefix="/auth",     tags=["Auth"])

# Create MySQL table on startup
@app.on_event("startup")
def on_startup():
    init_block_table()
    init_users_table()

@app.get("/")
def root():
    return {"message": "AutoSherpa Ops API is running"}

@app.get("/images/{file_id}")
def get_image(file_id: str):
    try:
        col = get_mongo_col()
        fs = gridfs.GridFS(col.database)
        grid_out = fs.get(ObjectId(file_id))
        return StreamingResponse(grid_out, media_type=grid_out.content_type or "image/jpeg")
    except Exception as e:
        raise HTTPException(status_code=404, detail="Image not found")