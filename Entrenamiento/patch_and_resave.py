import json, h5py, tensorflow as tf

IN_H5  = "model_landmarks.h5"
OUT_H5 = "model_landmarks_patched.h5"
OUT_KERAS = "model_landmarks_full.keras"

def patch_config(obj):
    """
    - batch_shape -> batch_input_shape
    - dtype policy (Keras 3) -> "float32"
    Recorre dict/list recursivamente.
    """
    if isinstance(obj, dict):
        newd = {}
        for k, v in obj.items():
            # 1) batch_shape -> batch_input_shape
            if k == "batch_shape":
                newd["batch_input_shape"] = patch_config(v)

            # 2) dtype policy Keras3 -> float32
            elif k == "dtype" and isinstance(v, dict):
                cls = v.get("class_name", "")
                if cls in ("DTypePolicy", "FloatDTypePolicy"):
                    newd["dtype"] = "float32"
                else:
                    newd["dtype"] = patch_config(v)

            else:
                newd[k] = patch_config(v)
        return newd

    elif isinstance(obj, list):
        return [patch_config(x) for x in obj]
    else:
        return obj

print("== Leyendo model_config ==")
with h5py.File(IN_H5, "r") as f:
    if "model_config" not in f.attrs:
        raise RuntimeError("Este .h5 parece ser SOLO pesos (no trae model_config).")
    model_config = f.attrs["model_config"]

if isinstance(model_config, (bytes, bytearray)):
    model_config = model_config.decode("utf-8")

cfg = json.loads(model_config)
cfg2 = patch_config(cfg)
patched_bytes = json.dumps(cfg2).encode("utf-8")

print("== Copiando H5 y aplicando parches ==")
with h5py.File(IN_H5, "r") as src, h5py.File(OUT_H5, "w") as dst:
    # copiar atributos
    for k, v in src.attrs.items():
        dst.attrs[k] = v
    # sobrescribir model_config parchado
    dst.attrs["model_config"] = patched_bytes

    # copiar grupos top-level
    for name in src.keys():
        src.copy(name, dst)

print("✅ Guardado H5 parchado:", OUT_H5)

print("== Cargando modelo parchado con TF 2.15 y guardando completo ==")
model = tf.keras.models.load_model(OUT_H5, compile=False)
model.save(OUT_KERAS)
print("✅ Guardado modelo completo:", OUT_KERAS)
