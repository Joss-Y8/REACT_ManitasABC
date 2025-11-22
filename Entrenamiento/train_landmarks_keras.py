# Entrenamiento/train_landmarks_keras.py
import os, json, subprocess, sys
import numpy as np
import tensorflow as tf

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from tensorflow.keras.utils import to_categorical


# ======================
# CONFIG
# ======================
EPOCHS = 60
BATCH = 32
SEED = 42

# Clases conflictivas (muy parecidas)
TARGET_HARD = ["r", "u"]

# Aumentos por muestra para clases difíciles
AUG_MULT = {"r": 6, "u": 6}

# Parámetros de augment
AUG_ANGLE_DEG = 10.0
AUG_NOISE_STD = 0.015
AUG_SCALE_JITTER = 0.03

# Focal loss
FOCAL_GAMMA = 2.0
FOCAL_ALPHA = 0.75

np.random.seed(SEED)
tf.random.set_seed(SEED)


# ======================
# PATHS (según tu estructura)
# ======================
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
TRAIN_DIR = os.path.join(ROOT_DIR, "Entrenamiento")
PUBLIC_MODEL_DIR = os.path.join(ROOT_DIR, "public", "model")

X_PATH = os.path.join(TRAIN_DIR, "X_landmarks.npy")
YIDX_PATH = os.path.join(TRAIN_DIR, "y_labels_idx.npy")
CLASSES_PATH = os.path.join(TRAIN_DIR, "classes.json")

H5_OUT = os.path.join(TRAIN_DIR, "model_landmarks.h5")


# ======================
# LOAD DATASET
# ======================
print("== Cargando dataset ==")
print("ROOT_DIR:", ROOT_DIR)
print("TRAIN_DIR:", TRAIN_DIR)

X = np.load(X_PATH).astype(np.float32)          # (N,63)
y_idx = np.load(YIDX_PATH).astype(np.int64)     # (N,)

with open(CLASSES_PATH, "r", encoding="utf-8") as f:
    CLASSES = json.load(f)

label_to_idx = {c:i for i,c in enumerate(CLASSES)}
idx_to_label = {i:c for c,i in label_to_idx.items()}

num_classes = len(CLASSES)

print("X:", X.shape, "num_classes:", num_classes)
print("Clases:", CLASSES)


# ======================
# AUGMENT EN FEATURES (landmarks)
# ======================
def augment_feat(feat, n_aug=3):
    """
    feat: (63,) = 21 puntos xyz normalizados
    rotación ligera XY + jitter escala + ruido
    """
    pts = feat.reshape(-1, 3)
    out = []
    for _ in range(n_aug):
        # rotación XY
        theta = np.deg2rad(np.random.uniform(-AUG_ANGLE_DEG, AUG_ANGLE_DEG))
        c, s = np.cos(theta), np.sin(theta)
        R = np.array([[c, -s],
                      [s,  c]], dtype=np.float32)

        xy = pts[:, :2] @ R.T
        z  = pts[:, 2:3]

        # jitter de escala
        scale = np.random.uniform(1.0 - AUG_SCALE_JITTER, 1.0 + AUG_SCALE_JITTER)
        xy *= scale
        z  *= scale

        new_pts = np.concatenate([xy, z], axis=1)

        # ruido gaussiano mínimo
        new_pts += np.random.normal(0, AUG_NOISE_STD, new_pts.shape).astype(np.float32)

        out.append(new_pts.reshape(-1))
    return out


print("== Augment dirigido a r y u ==")
X_aug, y_aug = [], []
for feat, yi in zip(X, y_idx):
    lab = idx_to_label[int(yi)]
    if lab in TARGET_HARD:
        n_aug = AUG_MULT.get(lab, 4)
        for f2 in augment_feat(feat, n_aug=n_aug):
            X_aug.append(f2)
            y_aug.append(yi)

if X_aug:
    X_aug = np.vstack(X_aug).astype(np.float32)
    y_aug = np.array(y_aug, dtype=np.int64)
    X = np.vstack([X, X_aug])
    y_idx = np.concatenate([y_idx, y_aug])

print("Dataset final:", X.shape, y_idx.shape)


# ======================
# SPLIT
# ======================
X_train, X_test, y_train, y_test = train_test_split(
    X, y_idx, test_size=0.2, stratify=y_idx, random_state=SEED
)


# ======================
# SCALER (como espera tu app)
# ======================
scaler = StandardScaler()
X_train_sc = scaler.fit_transform(X_train).astype(np.float32)
X_test_sc  = scaler.transform(X_test).astype(np.float32)


# guardamos scaler para React (public/model)
os.makedirs(PUBLIC_MODEL_DIR, exist_ok=True)

mean_list  = scaler.mean_.astype(float).tolist()
scale_list = scaler.scale_.astype(float).tolist()

with open(os.path.join(PUBLIC_MODEL_DIR, "scaler_mean.json"), "w", encoding="utf-8") as f:
    json.dump(mean_list, f, indent=2)

with open(os.path.join(PUBLIC_MODEL_DIR, "scaler_scale.json"), "w", encoding="utf-8") as f:
    json.dump(scale_list, f, indent=2)


# ======================
# ONE-HOT
# ======================
y_train_cat = to_categorical(y_train, num_classes)
y_test_cat  = to_categorical(y_test, num_classes)


# ======================
# CLASS WEIGHTS (extra r/u)
# ======================
counts = np.bincount(y_train, minlength=num_classes)
freq = counts / counts.sum()

class_weight = {}
for i,c in enumerate(CLASSES):
    w = (1.0 / max(freq[i], 1e-6))
    if c in TARGET_HARD:
        w *= 1.7  # empuja separación r/u
    class_weight[i] = float(w)

# normaliza para que no explote
m = np.mean(list(class_weight.values()))
for k in class_weight:
    class_weight[k] /= m

print("class_weight:", class_weight)


# ======================
# FOCAL LOSS (errores difíciles)
# ======================
def categorical_focal_loss(gamma=2.0, alpha=0.75):
    def loss(y_true, y_pred_logits):
        # logits -> probs
        y_pred = tf.nn.softmax(y_pred_logits)
        ce = tf.keras.losses.categorical_crossentropy(y_true, y_pred)
        p_t = tf.reduce_sum(y_true * y_pred, axis=-1)
        fl = alpha * tf.pow(1.0 - p_t, gamma) * ce
        return fl
    return loss


# ======================
# MODEL (más capaz p/ r vs u)
# ======================
model = tf.keras.Sequential([
    tf.keras.layers.Input(shape=(63,)),
    tf.keras.layers.Dense(256, activation="relu"),
    tf.keras.layers.BatchNormalization(),
    tf.keras.layers.Dropout(0.35),

    tf.keras.layers.Dense(128, activation="relu"),
    tf.keras.layers.BatchNormalization(),
    tf.keras.layers.Dropout(0.25),

    tf.keras.layers.Dense(64, activation="relu"),
    tf.keras.layers.Dense(num_classes)  # logits (softmax en JS)
])

model.compile(
    optimizer=tf.keras.optimizers.Adam(1e-3),
    loss=categorical_focal_loss(gamma=FOCAL_GAMMA, alpha=FOCAL_ALPHA),
    metrics=["accuracy"]
)

cbs = [
    tf.keras.callbacks.ReduceLROnPlateau(
        monitor="val_loss", factor=0.5, patience=6, verbose=1
    ),
    tf.keras.callbacks.EarlyStopping(
        monitor="val_loss", patience=12, restore_best_weights=True, verbose=1
    )
]


# ======================
# TRAIN
# ======================
print("== Entrenando Keras ==")
model.fit(
    X_train_sc, y_train_cat,
    validation_data=(X_test_sc, y_test_cat),
    epochs=EPOCHS,
    batch_size=BATCH,
    class_weight=class_weight,
    callbacks=cbs,
    verbose=1
)


# ======================
# EVALUACIÓN (especial r/u)
# ======================
print("\n== Evaluación ==")
logits = model.predict(X_test_sc)
pred_idx = np.argmax(logits, axis=1)

from sklearn.metrics import classification_report, confusion_matrix
print(classification_report(y_test, pred_idx, target_names=CLASSES))
print("Matriz de confusión:")
print(confusion_matrix(y_test, pred_idx))


# ======================
# SAVE .h5 EN Entrenamiento
# ======================
model.save(H5_OUT)
print(f"\n✅ Guardado {H5_OUT}")


# ======================
# SAVE labels.json EN public/model
# ======================
labels_out = os.path.join(PUBLIC_MODEL_DIR, "labels.json")
with open(labels_out, "w", encoding="utf-8") as f:
    json.dump(CLASSES, f, ensure_ascii=False, indent=2)
print(f"✅ Guardado {labels_out}")


# ======================
# AUTO-CONVERT TO TFJS
# ======================
print("\n== Convirtiendo a TensorFlow.js (public/model) ==")
try:
    # usa el módulo, no binario, para que agarre el python actual
    subprocess.run([
        sys.executable, "-m", "tensorflowjs_converter",
        "--input_format=keras",
        H5_OUT,
        PUBLIC_MODEL_DIR
    ], check=True)
    print("✅ Convertido a TFJS. Ya tienes model.json + weights en public/model/")
except Exception as e:
    print("⚠️ No pude convertir a TFJS automáticamente.")
    print("   Asegúrate de tener instalado tensorflowjs:")
    print("   pip install tensorflowjs")
    print("   Luego corre manualmente:")
    print(f"   tensorflowjs_converter --input_format=keras {H5_OUT} {PUBLIC_MODEL_DIR}")
    print("Detalle:", e)
