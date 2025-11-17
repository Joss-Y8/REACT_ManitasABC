
import os, json, numpy as np, argparse, tensorflow as tf
from sklearn.model_selection import train_test_split

parser = argparse.ArgumentParser()
parser.add_argument("--data_dir", type=str, default="Entrenamiento", help="Carpeta con X_landmarks.npy y y_labels_idx.npy")
parser.add_argument("--epochs", type=int, default=60)
parser.add_argument("--batch", type=int, default=32)
parser.add_argument("--lr", type=float, default=1e-3)
parser.add_argument("--hidden1", type=int, default=128)
parser.add_argument("--hidden2", type=int, default=64)
parser.add_argument("--drop1", type=float, default=0.2)
parser.add_argument("--drop2", type=float, default=0.1)
parser.add_argument("--seed", type=int, default=42)
parser.add_argument("--standardize", action="store_true", help="Estandariza X con media y desviación (guardará mean/scale)")
args = parser.parse_args()

np.random.seed(args.seed)
tf.random.set_seed(args.seed)

X = np.load(os.path.join(args.data_dir, "X_landmarks.npy"))  # (N, 63)
y_idx = np.load(os.path.join(args.data_dir, "y_labels_idx.npy"))  # (N,)
CLASSES = json.load(open(os.path.join(args.data_dir, "classes.json"), "r", encoding="utf-8"))
num_classes = len(CLASSES)

print("X shape:", X.shape, "| y shape:", y_idx.shape, "| classes:", CLASSES)

if args.standardize:
    from sklearn.preprocessing import StandardScaler
    scaler = StandardScaler()
    X = scaler.fit_transform(X)
    np.save("scaler_mean.npy", scaler.mean_)
    np.save("scaler_scale.npy", scaler.scale_)
    print("Estandarización aplicada y guardada (scaler_mean.npy, scaler_scale.npy)")

Xtr, Xte, ytr, yte = train_test_split(X, y_idx, test_size=0.2, stratify=y_idx, random_state=args.seed)

model = tf.keras.Sequential([
    tf.keras.layers.Input(shape=(63,)),
    tf.keras.layers.Dense(args.hidden1, activation="relu"),
    tf.keras.layers.Dropout(args.drop1),
    tf.keras.layers.Dense(args.hidden2, activation="relu"),
    tf.keras.layers.Dropout(args.drop2),
    tf.keras.layers.Dense(num_classes)  # logits
])

model.compile(optimizer=tf.keras.optimizers.Adam(args.lr),
              loss=tf.keras.losses.SparseCategoricalCrossentropy(from_logits=True),
              metrics=["accuracy"])

callbacks = [
    tf.keras.callbacks.EarlyStopping(patience=10, restore_best_weights=True, monitor="val_accuracy")
]

history = model.fit(Xtr, ytr, epochs=args.epochs, batch_size=args.batch, validation_data=(Xte, yte), callbacks=callbacks, verbose=2)
print("Eval:", model.evaluate(Xte, yte, verbose=0))

model.save("model_landmarks.h5")
json.dump(CLASSES, open("labels.json","w",encoding="utf-8"), ensure_ascii=False)
print("Guardado model_landmarks.h5 y labels.json")
