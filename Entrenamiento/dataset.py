import os, json, numpy as np
import cv2
import mediapipe as mp
from collections import defaultdict

# === CONFIG ===
DATA_DIR = r"C:\Users\blanf\OneDrive\Escritorio\manitas\REACT_ManitasABC\public\assets\images\manos"
CLASSES = ["a","e","i","m","o","r","u"]
VALID_EXTS = (".jpg",".jpeg",".png",".bmp",".webp")

print("== Extracción de landmarks ==")
print("DATA_DIR:", DATA_DIR, "  existe?", os.path.isdir(DATA_DIR))

mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=True,
    max_num_hands=1,
    model_complexity=0,           # rápido para fotos
    min_detection_confidence=0.30 # tolerante para no perder manos
)

def iter_image_paths(folder):
    """Recorre recursivo y filtra por extensión."""
    if not os.path.isdir(folder):
        return
    for root, _, files in os.walk(folder):
        for fname in files:
            if os.path.splitext(fname.lower())[1] in VALID_EXTS:
                yield os.path.join(root, fname)

def extract_landmarks_from_image(path):
    img = cv2.imread(path)
    if img is None:
        return None

    # Redimensionar si es muy pequeña
    h, w = img.shape[:2]
    max_side = max(h, w)
    if max_side < 480:
        scale = 480 / max_side
        img = cv2.resize(
            img,
            (int(w * scale), int(h * scale)),
            interpolation=cv2.INTER_LINEAR
        )

    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    try:
        res = hands.process(img_rgb)
    except Exception as e:
        print("⚠️ Error mediapipe en:", path, "->", e)
        return None

    if not res.multi_hand_landmarks:
        return None

    lm = res.multi_hand_landmarks[0].landmark
    pts = [{"x": p.x, "y": p.y, "z": getattr(p, "z", 0.0)} for p in lm]  # 21 puntos
    return pts

def dist2D(a, b):
    dx = (a["x"] - b["x"])
    dy = (a["y"] - b["y"])
    return float((dx*dx + dy*dy) ** 0.5)

def normalize_landmarks(pts):
    """
    Normalización MATCH con React:
    - base = muñeca (0)
    - ref = punto 9 (MCP dedo medio), si no existe usa 12/5/17
    - escala = distancia base-ref
    """
    base = pts[0]
    ref = pts[9] if len(pts) > 9 else (
          pts[12] if len(pts) > 12 else (
          pts[5]  if len(pts) > 5  else (
          pts[17] if len(pts) > 17 else base)))

    scale = dist2D(base, ref)
    if not np.isfinite(scale) or scale < 1e-6:
        scale = 1.0

    flat = []
    for p in pts:
        flat.extend([
            (p["x"] - base["x"]) / scale,
            (p["y"] - base["y"]) / scale,
            (p["z"] - base["z"]) / scale,
        ])
    return np.array(flat, dtype=np.float32)  # (63,)

# --- Conteo previo para diagnóstico ---
total_imgs = 0
for c in CLASSES:
    folder = os.path.join(DATA_DIR, c)
    n = sum(1 for _ in iter_image_paths(folder))
    print(f"Clase '{c}': {n} imágenes -> {folder}")
    total_imgs += n

print("Total imágenes encontradas:", total_imgs)
if total_imgs == 0:
    print("❌ No hay imágenes. Revisa DATA_DIR y subcarpetas por clase.")
    hands.close()
    raise SystemExit

# --- Extracción ---
X, y, skipped = [], [], []
ok_by_class = defaultdict(int)
skip_by_class = defaultdict(int)

for label in CLASSES:
    folder = os.path.join(DATA_DIR, label)
    for path in iter_image_paths(folder):
        pts = extract_landmarks_from_image(path)
        if pts is None:
            skipped.append(path)
            skip_by_class[label] += 1
            continue

        feat = normalize_landmarks(pts)
        X.append(feat)
        y.append(label)
        ok_by_class[label] += 1

# --- Guardado con failsafe ---
with open("skipped.json", "w", encoding="utf-8") as f:
    json.dump(skipped, f, indent=2, ensure_ascii=False)

if not X:
    print("❌ No se extrajo ninguna mano. Revisa 'skipped.json'.")
    print("Sugerencias: baja min_detection_confidence a 0.25, usa fotos con la mano grande/centrada, buena luz, sin recortes.")
    print("Saltadas por clase:", dict(skip_by_class))
    hands.close()
    raise SystemExit

X = np.stack(X)  # (N, 63)
y = np.array(y)
label_to_idx = {c: i for i, c in enumerate(CLASSES)}
y_idx = np.array([label_to_idx[l] for l in y], dtype=np.int64)

np.save("X_landmarks.npy", X)
np.save("y_labels.npy", y)
np.save("y_labels_idx.npy", y_idx)
with open("classes.json", "w", encoding="utf-8") as f:
    json.dump(CLASSES, f, indent=2, ensure_ascii=False)
with open("label_to_idx.json", "w", encoding="utf-8") as f:
    json.dump(label_to_idx, f, indent=2, ensure_ascii=False)

hands.close()
print("✅ Listo. X:", X.shape, "  Saltadas:", len(skipped))
print("OK por clase:", dict(ok_by_class))
print("Saltadas por clase:", dict(skip_by_class))
