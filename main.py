import os
import cv2
import numpy as np
import base64
import time
import shutil
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from model_handler import ModelHandler

app = FastAPI(title="PDX AI — Crowd & Mask Detection API")

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model handler instance
model_handler = None

# Ensure required directories exist
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
PROCESSED_DIR = os.path.join(STATIC_DIR, "processed")
TEMP_DIR = os.path.join(os.path.dirname(__file__), "temp")

os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(PROCESSED_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)

@app.on_event("startup")
def startup_event():
    global model_handler
    print("Initializing models. This may take a few seconds...")
    try:
        model_handler = ModelHandler()
        print("Models initialized successfully.")
    except Exception as e:
        print(f"Error starting up models: {e}")

@app.get("/api/health")
def health_check():
    status = "ready" if model_handler is not None else "loading"
    return {"status": status}

@app.post("/api/upload-photo")
async def upload_photo(file: UploadFile = File(...), conf: float = 0.25):
    if model_handler is None:
        raise HTTPException(status_code=503, detail="Models are still loading. Please try again in a few seconds.")
        
    try:
        # Read image bytes
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image file")
            
        start_time = time.time()
        # Process frame in thread pool
        processed_img, stats = await asyncio.to_thread(model_handler.process_frame, img, conf_threshold=conf)
        process_time = time.time() - start_time
        
        # Encode back to base64
        _, buffer = cv2.imencode('.jpg', processed_img)
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        
        stats["process_time_sec"] = round(process_time, 3)
        
        return {
            "image": f"data:image/jpeg;base64,{img_base64}",
            "stats": stats
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@app.post("/api/upload-video")
async def upload_video(file: UploadFile = File(...), conf: float = 0.25):
    if model_handler is None:
        raise HTTPException(status_code=503, detail="Models are still loading. Please try again in a few seconds.")
        
    try:
        # Generate clean filename and paths
        filename = f"{int(time.time())}_{file.filename}"
        input_path = os.path.join(TEMP_DIR, filename)
        output_filename = f"processed_{filename.split('.')[0]}.mp4"
        output_path = os.path.join(PROCESSED_DIR, output_filename)
        
        # Save uploaded file
        with open(input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Process video in thread pool
        start_time = time.time()
        frames_processed = await asyncio.to_thread(model_handler.process_video, input_path, output_path, conf_threshold=conf)
        process_time = time.time() - start_time
        
        # Clean up input file
        if os.path.exists(input_path):
            os.remove(input_path)
            
        return {
            "video_url": f"/processed/{output_filename}",
            "frames_processed": frames_processed,
            "process_time_sec": round(process_time, 2)
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Video processing failed: {str(e)}")

@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket client connected for live stream")
    
    last_frame_time = time.time()
    
    try:
        import json
        while True:
            # Receive base64 frame from client
            data = await websocket.receive_text()
            
            # Parse JSON payload (conf slider value + image data)
            conf_threshold = 0.25
            image_data = data
            try:
                payload = json.loads(data)
                image_data = payload.get("image", data)
                conf_threshold = float(payload.get("conf", 0.25))
            except Exception:
                pass
            
            if model_handler is None:
                # If models aren't ready, echo frame back with loading message
                await websocket.send_json({
                    "image": image_data,
                    "stats": {"crowd_count": 0, "mask_count": 0, "no_mask_count": 0, "loading": True}
                })
                continue
                
            try:
                # Decode base64 image
                header, encoded = image_data.split(",", 1) if "," in image_data else ("", image_data)
                img_data = base64.b64decode(encoded)
                nparr = np.frombuffer(img_data, np.uint8)
                img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
                
                if img is not None:
                    # Run models in thread pool
                    processed_img, stats = await asyncio.to_thread(
                        model_handler.process_frame, img, conf_threshold=conf_threshold
                    )
                    
                    # Calculate FPS
                    curr_time = time.time()
                    fps = 1.0 / (curr_time - last_frame_time)
                    last_frame_time = curr_time
                    stats["fps"] = round(fps, 1)
                    
                    # Encode processed image
                    _, buffer = cv2.imencode('.jpg', processed_img)
                    img_base64 = base64.b64encode(buffer).decode('utf-8')
                    
                    # Send back results
                    await websocket.send_json({
                        "image": f"data:image/jpeg;base64,{img_base64}",
                        "stats": stats
                    })
            except Exception as e:
                # Send error details without crashing connection
                await websocket.send_json({"error": str(e)})
                
    except WebSocketDisconnect:
        print("WebSocket client disconnected")
    except Exception as e:
        print(f"WebSocket connection error: {e}")

# Mount static folder (this serves index.html and all frontend code)
app.mount("/processed", StaticFiles(directory=PROCESSED_DIR), name="processed")
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    # Start server with reload exclusions to avoid restarts during file uploads
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        reload_dirs=[os.path.dirname(__file__)],
        reload_excludes=["*.jpg", "*.png", "*.mp4", "temp/*", "static/*"]
    )
