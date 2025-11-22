import tensorflow as tf

# cargamos el modelo parchado que SÍ abre en TF 2.15
model = tf.keras.models.load_model("model_landmarks_patched.h5", compile=False)

# guardamos como H5 completo (legacy pero compatible con tfjs)
model.save("model_landmarks_full.h5")
print("✅ Guardado model_landmarks_full.h5")
