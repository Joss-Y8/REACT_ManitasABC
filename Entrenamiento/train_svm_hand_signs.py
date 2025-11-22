import numpy as np
import json
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.svm import SVC
from sklearn.metrics import classification_report, confusion_matrix
import joblib

print("== Cargando datos ==")
X = np.load("X_landmarks.npy")          # (N, 63)
y_idx = np.load("y_labels_idx.npy")     # (N,)

with open("classes.json", "r", encoding="utf-8") as f:
    CLASSES = json.load(f)

with open("label_to_idx.json", "r", encoding="utf-8") as f:
    label_to_idx = json.load(f)

print("X:", X.shape)
print("Clases:", CLASSES)
print("label_to_idx:", label_to_idx)

# --- split ---
X_train, X_test, y_train, y_test = train_test_split(
    X, y_idx,
    test_size=0.2,
    stratify=y_idx,
    random_state=42
)

idx_r = label_to_idx["r"]

# --- augment solo para 'r' ---
def augment_landmarks(sample, n_aug=3, angle_deg=8.0):
    pts = sample.reshape(-1, 3)
    out = []
    for _ in range(n_aug):
        theta = np.deg2rad(np.random.uniform(-angle_deg, angle_deg))
        c, s = np.cos(theta), np.sin(theta)
        R = np.array([[c, -s],
                      [s,  c]])
        xy = pts[:, :2] @ R.T
        z = pts[:, 2:3]
        new_pts = np.concatenate([xy, z], axis=1)
        out.append(new_pts.reshape(-1).astype(np.float32))
    return out

print("== Generando augment para 'r' en TRAIN ==")
X_extra = []
y_extra = []
count_r = 0

for xi, yi in zip(X_train, y_train):
    if yi == idx_r:
        count_r += 1
        for aug in augment_landmarks(xi, n_aug=3, angle_deg=8.0):
            X_extra.append(aug)
            y_extra.append(yi)

if X_extra:
    X_extra = np.vstack(X_extra)  # (N_extra, 63)
    y_extra = np.array(y_extra, dtype=y_train.dtype)
    X_train = np.vstack([X_train, X_extra])
    y_train = np.concatenate([y_train, y_extra])

print(f"Muestras originales de 'r' en train: {count_r}")
print("Nuevo tamaño de X_train:", X_train.shape[0])

# --- pesos extra para 'r' ---
sample_weight = np.ones_like(y_train, dtype=np.float32)
sample_weight[y_train == idx_r] *= 1.5

# --- modelo SVM ---
model = Pipeline([
    ("scaler", StandardScaler()),
    ("clf", SVC(
        kernel="rbf",
        C=10,
        gamma="scale",
        probability=True,
        class_weight="balanced"
    ))
])

print("== Entrenando SVM ==")
model.fit(X_train, y_train, clf__sample_weight=sample_weight)

# --- evaluación ---
y_pred = model.predict(X_test)
print("\n=== Classification report ===")
print(classification_report(y_test, y_pred, target_names=CLASSES))
print("=== Matriz de confusión ===")
print(confusion_matrix(y_test, y_pred))

joblib.dump(model, "hand_sign_svm.joblib")
print("\n✅ Modelo guardado en hand_sign_svm.joblib")
