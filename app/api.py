import asyncio
from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import os
from app import database as db
from app.services import locket, nextdns
from app.config import *
from app.bot import setup_bot
from telegram import Update
import uuid

app = FastAPI()

# Global bot application for webhook
bot_app = setup_bot()

# In-memory storage for active requests (Mini App progress)
active_requests = {}

class ResolveRequest(BaseModel):
    username: str

class ActivateRequest(BaseModel):
    uid: str
    username: str
    user_id: int

@app.get("/")
async def read_index():
    return FileResponse('web/index.html')

@app.post("/api/webhook")
async def telegram_webhook(request: Request):
    """Entry point for Telegram Webhook"""
    data = await request.json()
    update = Update.de_json(data, bot_app.bot)
    await bot_app.process_update(update)
    return {"status": "ok"}

@app.get("/api/stats")
async def get_stats():
    return db.get_stats()

@app.post("/api/resolve")
async def resolve_username(req: ResolveRequest):
    uid = await locket.resolve_uid(req.username)
    if not uid:
        return {"success": False, "error": "User not found"}
    
    status = await locket.check_status(uid)
    status_text = "Free (Inactive)"
    if status and status.get("active"):
        status_text = f"Gold Active (Exp: {status['expires']})"
        
    return {"success": True, "uid": uid, "status_text": status_text}

@app.post("/api/activate")
async def activate_gold(req: ActivateRequest):
    # Check limit
    if req.user_id != ADMIN_ID and not db.check_can_request(req.user_id):
        return {"success": False, "error": "Daily limit reached"}

    request_id = str(uuid.uuid4())
    active_requests[request_id] = {
        "completed": False,
        "success": False,
        "logs": ["[*] Initializing injection..."],
        "nextdns_link": "",
        "nextdns_id": ""
    }

    # Start background task
    asyncio.create_task(process_activation(request_id, req.uid, req.username, req.user_id))
    
    return {"success": True, "request_id": request_id}

@app.get("/api/status/{request_id}")
async def get_status(request_id: str):
    if request_id not in active_requests:
        raise HTTPException(status_code=404, detail="Request not found")
    return active_requests[request_id]

async def process_activation(request_id, uid, username, user_id):
    def log_callback(msg):
        clean_msg = msg.replace('\033[94m', '').replace('\033[92m', '').replace('\033[93m', '').replace('\033[91m', '').replace('\033[0m', '').replace('\033[1m', '')
        if request_id in active_requests:
            active_requests[request_id]["logs"].append(clean_msg)

    # Pick a random token set or round-robin if multiple workers
    import random
    token_config = random.choice(TOKEN_SETS)

    success, msg_result = await locket.inject_gold(uid, token_config, log_callback)
    
    db.log_request(user_id, uid, "SUCCESS" if success else "FAIL")
    
    if success:
        if user_id != ADMIN_ID:
            db.increment_usage(user_id)
            
        pid, link = await nextdns.create_profile(NEXTDNS_KEY, log_callback)
        active_requests[request_id].update({
            "completed": True,
            "success": True,
            "nextdns_link": link,
            "nextdns_id": pid
        })
    else:
        active_requests[request_id].update({
            "completed": True,
            "success": False,
            "error": msg_result
        })

# Serve other static files
app.mount("/", StaticFiles(directory="web"), name="static")
