from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel, Field, validator
from typing import Optional, Any
from db import get_db 

router = APIRouter()

class RefinancingLeadCreate(BaseModel):
    customer_name: str = Field(..., example="John Doe")
    phone_number: str = Field(..., example="+919876543210")
    city: Optional[str] = Field(None, example="Bengaluru")
    intent_type: str = Field(..., example="loan_against_car")
    car_brand: Optional[str] = Field(None, example="Hyundai")
    car_model: Optional[str] = Field(None, example="Creta")
    year_of_manufacture: Optional[Any] = Field(None, example=2022)
    has_existing_loan: Optional[Any] = Field(False)
    remaining_loan_amt: Optional[Any] = Field(None, example=200000)
    loan_requirement: Optional[Any] = Field(None, example=500000)
    contact_preference: Optional[str] = Field(None, example="phone")
    status: Optional[str] = Field("new", example="new")
    
    @validator('year_of_manufacture', pre=True, always=False)
    def validate_year(cls, v):
        if v is None or v == '':
            return None
        try:
            return int(v)
        except (ValueError, TypeError):
            return None
    
    @validator('has_existing_loan', pre=True, always=False)
    def validate_bool(cls, v):
        if v is None or v == '':
            return False
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            # Handle "Yes"/"No", "true"/"false", "1"/"0"
            return v.lower() in ('yes', 'true', '1', 'on')
        return bool(v)
    
    @validator('remaining_loan_amt', 'loan_requirement', pre=True, always=False)
    def validate_float(cls, v):
        # Handle None, empty, and NULL string
        if v is None or v == '' or (isinstance(v, str) and v.upper() == 'NULL'):
            return None
        
        # Already numeric
        if isinstance(v, (int, float)):
            return float(v) if v != 0 else None
        
        # String parsing
        if isinstance(v, str):
            # Remove currency symbols and extra whitespace
            cleaned = v.replace('₹', '').replace('$', '').replace(',', '').strip()
            
            # Handle ranges like "2–5 Lakh" or "2-5 Lakh" -> take first value
            if '–' in cleaned:
                cleaned = cleaned.split('–')[0].strip()
            elif '-' in cleaned and not cleaned.startswith('-'):
                # Avoid splitting negative numbers
                cleaned = cleaned.split('-')[0].strip()
            
            # Handle "Lakh" or "Crore" multipliers
            cleaned_lower = cleaned.lower()
            if 'lakh' in cleaned_lower:
                cleaned = cleaned_lower.replace('lakh', '').strip()
                try:
                    amount = float(cleaned)
                    return amount * 100000 if amount > 0 else None
                except (ValueError, TypeError):
                    return None
            elif 'crore' in cleaned_lower:
                cleaned = cleaned_lower.replace('crore', '').strip()
                try:
                    amount = float(cleaned)
                    return amount * 10000000 if amount > 0 else None
                except (ValueError, TypeError):
                    return None
            
            # Try direct float conversion
            try:
                amount = float(cleaned)
                return amount if amount > 0 else None
            except (ValueError, TypeError):
                return None
        
        return None

class RefinancingLeadUpdate(BaseModel):
    customer_name: Optional[str] = None
    phone_number: Optional[str] = None
    city: Optional[str] = None
    intent_type: Optional[str] = None
    car_brand: Optional[str] = None
    car_model: Optional[str] = None
    year_of_manufacture: Optional[Any] = None
    has_existing_loan: Optional[Any] = None
    remaining_loan_amt: Optional[Any] = None
    loan_requirement: Optional[Any] = None
    contact_preference: Optional[str] = None
    status: Optional[str] = None
    
    @validator('year_of_manufacture', pre=True, always=False)
    def validate_year(cls, v):
        if v is None or v == '':
            return None
        try:
            return int(v)
        except (ValueError, TypeError):
            return None
    
    @validator('has_existing_loan', pre=True, always=False)
    def validate_bool(cls, v):
        if v is None or v == '':
            return None
        if isinstance(v, bool):
            return v
        if isinstance(v, str):
            # Handle "Yes"/"No", "true"/"false", "1"/"0"
            return v.lower() in ('yes', 'true', '1', 'on')
        return bool(v)
    
    @validator('remaining_loan_amt', 'loan_requirement', pre=True, always=False)
    def validate_float(cls, v):
        # Handle None, empty, and NULL string
        if v is None or v == '' or (isinstance(v, str) and v.upper() == 'NULL'):
            return None
        
        # Already numeric
        if isinstance(v, (int, float)):
            return float(v) if v != 0 else None
        
        # String parsing
        if isinstance(v, str):
            # Remove currency symbols and extra whitespace
            cleaned = v.replace('₹', '').replace('$', '').replace(',', '').strip()
            
            # Handle ranges like "2–5 Lakh" or "2-5 Lakh" -> take first value
            if '–' in cleaned:
                cleaned = cleaned.split('–')[0].strip()
            elif '-' in cleaned and not cleaned.startswith('-'):
                # Avoid splitting negative numbers
                cleaned = cleaned.split('-')[0].strip()
            
            # Handle "Lakh" or "Crore" multipliers
            cleaned_lower = cleaned.lower()
            if 'lakh' in cleaned_lower:
                cleaned = cleaned_lower.replace('lakh', '').strip()
                try:
                    amount = float(cleaned)
                    return amount * 100000 if amount > 0 else None
                except (ValueError, TypeError):
                    return None
            elif 'crore' in cleaned_lower:
                cleaned = cleaned_lower.replace('crore', '').strip()
                try:
                    amount = float(cleaned)
                    return amount * 10000000 if amount > 0 else None
                except (ValueError, TypeError):
                    return None
            
            # Try direct float conversion
            try:
                amount = float(cleaned)
                return amount if amount > 0 else None
            except (ValueError, TypeError):
                return None
        
        return None

@router.get("/leads")
def get_refinancing_leads(status: str = Query(None, description="new|contacted|approved"), intent: str = Query(None, description="refinancing|loan_against_car|loan_transfer|eligibility")):
    """
    Get refinancing leads filtered by status and/or intent_type.
    Returns customer_name, phone_number, city, and other details.
    """
    db = get_db()
    cur = db.cursor(dictionary=True)
    
    try:
        query = """
            SELECT 
                id,
                customer_name,
                phone_number,
                city,
                car_brand,
                car_model,
                year_of_manufacture,
                has_existing_loan,
                remaining_loan_amt,
                loan_requirement,
                contact_preference,
                intent_type,
                status,
                created_at
            FROM refinancing_leads
        """
        
        conditions = []
        params = []
        
        if status and status.lower() in ["new", "contacted", "approved"]:
            conditions.append("status = %s")
            params.append(status.lower())
        
        if intent and intent.lower() in ["refinancing", "loan_against_car", "loan_transfer", "eligibility"]:
            # Use case-insensitive pattern matching for intent_type
            intent_lower = intent.lower()
            if intent_lower == "loan_against_car":
                conditions.append("(LOWER(intent_type) LIKE '%against%car%' OR LOWER(intent_type) LIKE '%loan%against%' OR LOWER(intent_type) = 'loan_against_car')")
            elif intent_lower == "loan_transfer":
                conditions.append("(LOWER(intent_type) LIKE '%transfer%' OR LOWER(intent_type) = 'loan_transfer')")
            elif intent_lower == "refinancing":
                conditions.append("(LOWER(intent_type) LIKE '%emi%' OR LOWER(intent_type) LIKE '%refinanc%' OR LOWER(intent_type) = 'refinancing')")
            elif intent_lower == "eligibility":
                conditions.append("(LOWER(intent_type) LIKE '%eligib%' OR LOWER(intent_type) = 'eligibility')")
        
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
        
        query += " ORDER BY created_at DESC"
        
        cur.execute(query, params)
        leads = cur.fetchall()
        
        return {
            "status": status or "all",
            "intent": intent or "all",
            "count": len(leads),
            "leads": leads
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e),
            "leads": []
        }


@router.get("/debug")
def debug_refinancing_data():
    """
    Debug endpoint to see what actual data exists in the database.
    """
    db = get_db()
    cur = db.cursor(dictionary=True)
    
    try:
        # Check all data with intent_type
        cur.execute("SELECT id, customer_name, intent_type, status FROM refinancing_leads LIMIT 50")
        all_data = cur.fetchall()
        
        # Check distinct intent_type values with exact values and counts
        cur.execute("SELECT DISTINCT intent_type, COUNT(*) as count FROM refinancing_leads GROUP BY intent_type")
        intent_breakdown = cur.fetchall()
        
        # Check for NULL intent_type
        cur.execute("SELECT COUNT(*) as null_count FROM refinancing_leads WHERE intent_type IS NULL OR intent_type = ''")
        null_result = cur.fetchone()
        null_count = null_result.get("null_count", 0) if null_result else 0
        
        # Check total
        cur.execute("SELECT COUNT(*) as total FROM refinancing_leads")
        total = cur.fetchone()
        
        return {
            "total_records": total.get("total", 0) if total else 0,
            "null_intent_type_count": null_count,
            "sample_data": all_data,
            "distinct_intent_types": intent_breakdown
        }
    except Exception as e:
        return {
            "error": str(e),
            "message": "Failed to fetch debug data"
        }


@router.get("/stats")
def get_refinancing_stats():
    """
    Get refinancing statistics - count of leads by intent type and total.
    Handles various intent_type values and normalizes them.
    """
    db = get_db()
    cur = db.cursor(dictionary=True)
    
    try:
        # Get total count
        cur.execute("SELECT COUNT(*) as total FROM refinancing_leads")
        total_result = cur.fetchone()
        total = total_result.get("total", 0) if total_result else 0
        
        # Map various intent type values to standard types
        intent_mapping_query = """
            SELECT 
                CASE 
                    WHEN LOWER(intent_type) LIKE '%against%car%' OR LOWER(intent_type) LIKE '%loan%against%' THEN 'loan_against_car'
                    WHEN LOWER(intent_type) LIKE '%transfer%' OR LOWER(intent_type) LIKE '%transfer%loan%' THEN 'loan_transfer'
                    WHEN LOWER(intent_type) LIKE '%emi%' OR LOWER(intent_type) LIKE '%refinanc%' THEN 'refinancing'
                    WHEN LOWER(intent_type) LIKE '%eligib%' THEN 'eligibility'
                    ELSE LOWER(COALESCE(intent_type, ''))
                END as normalized_type,
                COUNT(*) as count
            FROM refinancing_leads
            GROUP BY normalized_type
        """
        
        cur.execute(intent_mapping_query)
        intent_stats_raw = cur.fetchall()
        intent_stats = {}
        
        # Initialize all intent types
        for intent in ["loan_against_car", "loan_transfer", "refinancing", "eligibility"]:
            intent_stats[intent] = 0
        
        # Fill in counts from DB
        for row in intent_stats_raw:
            intent = row.get("normalized_type", "").lower()
            count = row.get("count", 0)
            if intent in intent_stats:
                intent_stats[intent] = count
        
        return {
            "total": total,
            "loan_against_car": intent_stats.get("loan_against_car", 0),
            "loan_transfer": intent_stats.get("loan_transfer", 0),
            "refinancing": intent_stats.get("refinancing", 0),
            "eligibility": intent_stats.get("eligibility", 0)
        }
    except Exception as e:
        return {
            "total": 0,
            "loan_against_car": 0,
            "loan_transfer": 0,
            "refinancing": 0,
            "eligibility": 0,
            "error": str(e)
        }


@router.post("/leads")
def create_refinancing_lead(lead: RefinancingLeadCreate):
    db = get_db()
    cur = db.cursor(dictionary=True)

    try:
        # Check if phone number already exists
        cur.execute(
            "SELECT id, customer_name FROM refinancing_leads WHERE phone_number = %s",
            (lead.phone_number,)
        )
        existing_lead = cur.fetchone()
        
        if existing_lead:
            raise HTTPException(
                status_code=409,
                detail=f"Phone number already exists in system for customer '{existing_lead.get('customer_name')}'"
            )
        
        # Convert boolean to 0/1 for MySQL
        has_loan = 1 if lead.has_existing_loan else 0
        
        cur.execute(
            "INSERT INTO refinancing_leads (customer_name, phone_number, city, intent_type, car_brand, car_model, year_of_manufacture, has_existing_loan, remaining_loan_amt, loan_requirement, contact_preference, status) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            (
                lead.customer_name,
                lead.phone_number,
                lead.city,
                lead.intent_type,
                lead.car_brand,
                lead.car_model,
                lead.year_of_manufacture,
                has_loan,
                lead.remaining_loan_amt,
                lead.loan_requirement,
                lead.contact_preference,
                lead.status.lower(),
            )
        )
        db.commit()
        return {"success": True, "message": "Lead created successfully", "lead_id": cur.lastrowid}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/leads/{lead_id}")
def update_refinancing_lead(lead_id: int, lead: RefinancingLeadUpdate):
    db = get_db()
    cur = db.cursor(dictionary=True)

    try:
        # If phone number is being updated, check if it already exists for a different lead
        if lead.phone_number:
            cur.execute(
                "SELECT id, customer_name FROM refinancing_leads WHERE phone_number = %s AND id != %s",
                (lead.phone_number, lead_id)
            )
            existing_lead = cur.fetchone()
            
            if existing_lead:
                raise HTTPException(
                    status_code=409,
                    detail=f"Phone number already exists for customer '{existing_lead.get('customer_name')}'"
                )
        
        update_fields = []
        values = []

        # Build update query from provided fields
        lead_dict = lead.dict(exclude_unset=True)
        
        for field_name, value in lead_dict.items():
            # Skip None values to preserve existing data
            if value is None:
                continue
            
            # Convert booleans to 0/1 for MySQL
            if isinstance(value, bool):
                value = 1 if value else 0
            
            # Lowercase status values
            if field_name == "status" and isinstance(value, str):
                value = value.lower()
            
            update_fields.append(f"{field_name} = %s")
            values.append(value)

        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields provided for update")

        values.append(lead_id)
        query = f"UPDATE refinancing_leads SET {', '.join(update_fields)} WHERE id = %s"

        cur.execute(query, tuple(values))
        db.commit()
        return {"success": True, "message": f"Lead {lead_id} updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/leads/{lead_id}")
def delete_refinancing_lead(lead_id: int):
    db = get_db()
    cur = db.cursor()

    try:
        cur.execute("DELETE FROM refinancing_leads WHERE id = %s", (lead_id,))
        db.commit()
        return {"success": True, "message": f"Lead {lead_id} deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/leads/{lead_id}/status")
def update_lead_status(lead_id: int, new_status: str = Query(..., description="new|contacted|approved")):
    """
    Update the status of a refinancing lead.
    """
    db = get_db()
    cur = db.cursor()
    
    if new_status.lower() not in ["new", "contacted", "approved"]:
        return {"error": "Invalid status. Must be: new, contacted, or approved"}
    
    try:
        cur.execute(
            "UPDATE refinancing_leads SET status = %s WHERE id = %s",
            (new_status.lower(), lead_id)
        )
        db.commit()
        return {"message": f"Lead {lead_id} updated to {new_status}", "success": True}
    except Exception as e:
        db.rollback()
        return {"error": str(e), "success": False}


@router.post("/normalize-intent-types")
def normalize_intent_types():
    """
    Normalize all intent_type values in database to standard values.
    Maps various user-entered values to standard intent types.
    """
    db = get_db()
    cur = db.cursor()
    
    try:
        # Normalize loan_against_car
        cur.execute(
            "UPDATE refinancing_leads SET intent_type = 'loan_against_car' WHERE LOWER(intent_type) LIKE '%against%car%' OR LOWER(intent_type) LIKE '%loan%against%'"
        )
        
        # Normalize loan_transfer
        cur.execute(
            "UPDATE refinancing_leads SET intent_type = 'loan_transfer' WHERE LOWER(intent_type) LIKE '%transfer%' AND LOWER(intent_type) NOT LIKE '%emi%' AND LOWER(intent_type) NOT LIKE '%refinanc%'"
        )
        
        # Normalize refinancing
        cur.execute(
            "UPDATE refinancing_leads SET intent_type = 'refinancing' WHERE LOWER(intent_type) LIKE '%emi%' OR LOWER(intent_type) LIKE '%reduce%' OR LOWER(intent_type) LIKE '%refinanc%'"
        )
        
        # Normalize eligibility
        cur.execute(
            "UPDATE refinancing_leads SET intent_type = 'eligibility' WHERE LOWER(intent_type) LIKE '%check%' OR LOWER(intent_type) LIKE '%eligib%'"
        )
        
        db.commit()
        
        # Return updated stats
        cur.execute("SELECT intent_type, COUNT(*) as count FROM refinancing_leads GROUP BY intent_type")
        stats = cur.fetchall()
        
        return {
            "success": True,
            "message": "Intent types normalized successfully",
            "updated_stats": stats
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
