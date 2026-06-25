import os
import cv2
import numpy as np
import time

def test_loading():
    print("=== SentriSight AI Model Verification ===")
    
    # 1. Check imports
    try:
        from ultralytics import YOLO
        import torch
        print("[PASS] Successfully imported ultralytics and torch")
        print(f"       PyTorch version: {torch.__version__}")
        print(f"       CUDA Available: {torch.cuda.is_available()}")
    except ImportError as e:
        print(f"[FAIL] Import error: {e}")
        return False

    # 2. Check OpenCV
    try:
        import cv2
        print("[PASS] Successfully imported OpenCV")
    except ImportError as e:
        print(f"[FAIL] OpenCV import error: {e}")
        return False

    # 3. Create ModelHandler and Load models
    try:
        from model_handler import ModelHandler
        print("Initializing ModelHandler (this will download model weights if needed)...")
        start_time = time.time()
        handler = ModelHandler()
        print(f"[PASS] ModelHandler initialized in {time.time() - start_time:.2f} seconds")
    except Exception as e:
        print(f"[FAIL] ModelHandler initialization failed: {e}")
        return False

    # 4. Perform Mock Inference on dummy blank frame
    try:
        print("Creating mock image for inference test...")
        dummy_frame = np.zeros((360, 640, 3), dtype=np.uint8)
        
        print("Running process_frame on mock image...")
        start_time = time.time()
        processed_frame, stats = handler.process_frame(dummy_frame)
        print(f"[PASS] Inference run succeeded in {time.time() - start_time:.4f} seconds")
        print("       Stats:", stats)
    except Exception as e:
        print(f"[FAIL] Inference process failed: {e}")
        return False

    print("=== VERIFICATION COMPLETE: ALL SYSTEMS READY ===")
    return True

if __name__ == "__main__":
    success = test_loading()
    if not success:
        os._exit(1)
