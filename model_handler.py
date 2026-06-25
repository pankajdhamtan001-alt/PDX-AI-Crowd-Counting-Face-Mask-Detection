import os
import cv2
import numpy as np
import time
import threading
from ultralytics import YOLO
from huggingface_hub import hf_hub_download

class ModelHandler:
    def __init__(self):
        self.lock = threading.Lock()
        self.person_model = None
        self.mask_model = None
        self.load_models()

    def load_models(self):
        # Load Person Detection Model (yolov8n.pt)
        print("Loading Person Detection Model (yolov8n.pt)...")
        self.person_model = YOLO("yolov8n.pt")
        
        # Load Face Mask Detection Model
        print("Loading Face Mask Detection Model...")
        try:
            # Try to download Nma/Face-Mask-yolov8
            mask_model_path = hf_hub_download(repo_id="Nma/Face-Mask-yolov8", filename="best.pt")
            self.mask_model = YOLO(mask_model_path)
            print(f"Successfully loaded Face Mask Model from Nma/Face-Mask-yolov8. Classes: {self.mask_model.names}")
        except Exception as e:
            print(f"Error loading Nma/Face-Mask-yolov8: {e}")
            print("Attempting fallback to keremberke/yolov8s-protective-equipment-detection...")
            try:
                self.mask_model = YOLO("keremberke/yolov8s-protective-equipment-detection")
                print(f"Successfully loaded fallback Protective Equipment Model. Classes: {self.mask_model.names}")
            except Exception as e2:
                print(f"Error loading fallback model: {e2}")
                # We can load a general yolov8n face detector or use standard yolov8n as a placeholder
                print("Falling back to standard yolov8n.pt for general face detection if possible...")
                self.mask_model = self.person_model

    def process_frame(self, frame, conf_threshold=0.25):
        with self.lock:
            # Run person detector (Class 0: person)
            person_results = self.person_model(frame, classes=[0], conf=conf_threshold, verbose=False)
            
            # Run mask detector
            mask_results = self.mask_model(frame, conf=conf_threshold, verbose=False)
            
            person_count = 0
            mask_count = 0
            no_mask_count = 0
            detections = []
    
            # Process person detections
            for result in person_results:
                boxes = result.boxes
                for box in boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    conf = float(box.conf[0])
                    person_count += 1
                    
                    # Draw bounding box for person (Cyber Blue - BGR: 246, 130, 59 -> RGB is Blueish)
                    # BGR for Cyber Blue: (246, 130, 59) -> Blue is 246, Green is 130, Red is 59
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (246, 130, 59), 2)
                    cv2.putText(frame, f"Person {conf:.2f}", (x1, y1 - 10), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (246, 130, 59), 1, cv2.LINE_AA)
                    
                    detections.append({
                        "type": "person",
                        "bbox": [x1, y1, x2, y2],
                        "conf": conf
                    })
    
            # Process mask detections
            for result in mask_results:
                boxes = result.boxes
                for box in boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    conf = float(box.conf[0])
                    cls = int(box.cls[0])
                    class_name = self.mask_model.names[cls].lower()
                    
                    is_mask = False
                    is_no_mask = False
                    
                    # Check for mask vs no-mask based on model class names
                    # Nma/Face-Mask-yolov8 has classes: 0: 'face' (no mask), 1: 'face_masked' (with mask)
                    # keremberke model has classes: 3: 'mask', 7: 'no_mask'
                    if 'with_mask' in class_name or class_name == 'mask' or 'face_masked' in class_name:
                        is_mask = True
                    elif 'without_mask' in class_name or 'no_mask' in class_name or 'incorrect' in class_name or class_name == 'face' or class_name == 'no-mask' or class_name == 'without-mask':
                        is_no_mask = True
                    
                    # If we had to fallback to yolov8n (person model), let's treat anything that isn't person as no_mask
                    if self.mask_model == self.person_model:
                        # Dummy classification for testing
                        is_no_mask = True
                    
                    if is_mask:
                        mask_count += 1
                        # Emerald Green BGR: (129, 185, 16)
                        color = (129, 185, 16)
                        label = f"Mask {conf:.2f}"
                        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                        cv2.putText(frame, label, (x1, y1 - 10), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1, cv2.LINE_AA)
                        detections.append({
                            "type": "mask",
                            "bbox": [x1, y1, x2, y2],
                            "conf": conf
                        })
                    elif is_no_mask:
                        no_mask_count += 1
                        # Neon Red BGR: (68, 68, 239)
                        color = (68, 68, 239)
                        label = f"No Mask {conf:.2f}"
                        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                        cv2.putText(frame, label, (x1, y1 - 10), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1, cv2.LINE_AA)
                        detections.append({
                            "type": "no_mask",
                            "bbox": [x1, y1, x2, y2],
                            "conf": conf
                        })
    
            return frame, {
                "crowd_count": person_count,
                "mask_count": mask_count,
                "no_mask_count": no_mask_count,
                "detections": detections
            }

    def process_video(self, input_path, output_path, conf_threshold=0.25):
        cap = cv2.VideoCapture(input_path)
        if not cap.isOpened():
            raise Exception("Error opening video file")

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        
        # Use H264 codec for web compatibility if possible, fallback to mp4v
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))
        
        frames_processed = 0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                
                processed_frame, _ = self.process_frame(frame, conf_threshold)
                out.write(processed_frame)
                frames_processed += 1
                
                # Limit processing to a reasonable number if it is too long, e.g. 500 frames for safety
                if frames_processed > 600:
                    print("Video is too long, truncating processing to 600 frames.")
                    break
        finally:
            cap.release()
            out.release()
            
        return frames_processed
