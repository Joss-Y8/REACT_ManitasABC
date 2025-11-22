import tensorflow as tf

# carga el .h5 que tienes
model = tf.keras.models.load_model("model_landmarks.h5", compile=False)

# vuelve a guardarlo completo (formato keras recomendado)
model.save("model_landmarks_full.keras")
print("✅ Guardado model_landmarks_full.keras")
