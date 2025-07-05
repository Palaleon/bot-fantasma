

import json
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
import os

# --- Configuración ---
DATA_FILE = 'learning_data.jsonl'
MODEL_DIR = 'model'
MODEL_PATH_ONNX = os.path.join(MODEL_DIR, 'model.onnx')

# --- 1. Carga y Preprocesamiento de Datos ---

def _normalize_and_vectorize(snapshot):
    """
    Convierte el snapshot del mercado en un vector de características normalizadas.
    Esta función DEBE ser idéntica a la de LearningManager.js
    """
    features = []
    timeframes = ['1m', '5m', '10m', '15m', '30m']

    for tf in timeframes:
        indicators = snapshot.get('strategic', {}).get(tf)
        chartist_pattern = snapshot.get('chartist', {}).get(tf)

        if indicators:
            price = indicators.get('sma_fast') or indicators.get('sma_slow', 0)
            
            features.append(indicators.get('rsi', 50) / 100.0)
            features.append(min(1, indicators.get('atr', 0) / price) if price > 0 else 0)
            features.append(indicators.get('adx', 0) / 100.0)

            bb = indicators.get('bb')
            if bb and bb.get('upper') is not None and bb.get('lower') is not None and (bb['upper'] - bb['lower']) > 0:
                bb_pos = (price - bb['lower']) / (bb['upper'] - bb['lower'])
                features.append(max(0, min(1.2, bb_pos if not np.isnan(bb_pos) else 0.5)))
            else:
                features.append(0.5)

            macd = indicators.get('macd')
            atr = indicators.get('atr', 0)
            if macd and macd.get('histogram') is not None and atr > 0:
                normalized_hist = macd['histogram'] / atr
                features.append(np.tanh(normalized_hist) if not np.isnan(normalized_hist) else 0)
            else:
                features.append(0)
        else:
            features.extend([0.5, 0, 0, 0.5, 0])

        pattern = chartist_pattern.get('pattern') if chartist_pattern else None
        features.append(1 if pattern == 'BullishEngulfing' else 0)
        features.append(1 if pattern == 'BearishEngulfing' else 0)
        features.append(1 if pattern == 'Hammer' else 0)
        
    return features

print("Iniciando proceso de entrenamiento del modelo de IA con PyTorch...")

X = []
y = []

print(f"Cargando datos desde {DATA_FILE}...")
try:
    with open(DATA_FILE, 'r') as f:
        for line in f:
            record = json.loads(line)
            if record.get('marketSnapshot'):
                features = _normalize_and_vectorize(record['marketSnapshot'])
                X.append(features)
                y.append(record['outcome'])
except FileNotFoundError:
    print(f"Error: No se encontro el archivo de datos {DATA_FILE}. Abortando.")
    exit()

if not X:
    print("Error: No se encontraron datos de entrenamiento validos. Abortando.")
    exit()

# Convertir a tensores de PyTorch
X_tensor = torch.tensor(X, dtype=torch.float32)
y_tensor = torch.tensor(y, dtype=torch.float32).unsqueeze(1)

print(f"Datos cargados. {len(X)} registros encontrados.")
print(f"   - Victorias: {torch.sum(y_tensor == 1).item()}")
print(f"   - Derrotas: {torch.sum(y_tensor == 0).item()}")

# --- 2. Construcción del Modelo con PyTorch ---

print("\nConstruyendo el modelo de red neuronal con PyTorch...")

'''class TradingModel(nn.Module):
    def __init__(self, input_features):
        super(TradingModel, self).__init__()
        self.network = nn.Sequential(
            nn.Linear(input_features, 128),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(64, 32),
            nn.ReLU(),
            # NOTA IMPORTANTE: La capa final NO debe tener una función de activación (como Sigmoid)
            # porque la función de pérdida `BCEWithLogitsLoss` la aplica internamente de forma
            # más estable numéricamente. El modelo devuelve "logits" brutos.
            nn.Linear(32, 1)
        )

    def forward(self, x):
        return self.network(x)

input_dim = X_tensor.shape[1]
model = TradingModel(input_dim)
print(model)

# --- 3. Entrenamiento ---

print("
Entrenando el modelo...")

# Pesos de clase para manejar el desequilibrio de datos (más victorias que derrotas o viceversa)
counts = np.bincount(np.array(y).astype(int))
neg = counts[0] if len(counts) > 0 else 0
pos = counts[1] if len(counts) > 1 else 0
total = neg + pos
weight_for_0 = total / (2.0 * neg) if neg > 0 else 1
weight_for_1 = total / (2.0 * pos) if pos > 0 else 1

# Se usa BCEWithLogitsLoss porque es numéricamente estable y maneja el desequilibrio de clases
# a través del parámetro `pos_weight`. Espera "logits" como entrada del modelo.
pos_weight = torch.tensor([weight_for_1 / weight_for_0], dtype=torch.float32) if weight_for_0 > 0 else torch.tensor([1.0], dtype=torch.float32)
criterion = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
optimizer = optim.Adam(model.parameters(), lr=0.001)

dataset = TensorDataset(X_tensor, y_tensor)
data_loader = DataLoader(dataset, batch_size=32, shuffle=True)

num_epochs = 50
for epoch in range(num_epochs):
    for inputs, labels in data_loader:
        optimizer.zero_grad()
        # Se obtienen los logits directamente del modelo
        outputs = model(inputs)
        # La función de pérdida `criterion` (definida fuera del bucle) se aplica aquí
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()
    
    if (epoch+1) % 10 == 0:
        print(f'Epoch [{epoch+1}/{num_epochs}], Loss: {loss.item():.4f}')

print("Entrenamiento completado.")

# --- 4. Evaluación ---
model.eval() # Poner el modelo en modo de evaluación
with torch.no_grad():
    # Para evaluar, primero obtenemos los logits del modelo
    y_logits = model(X_tensor)
    # Y LUEGO aplicamos la función sigmoide para convertirlos en probabilidades (0 a 1)
    y_pred_probs = torch.sigmoid(y_logits)
    # Redondeamos las probabilidades para obtener la predicción final (0 o 1)
    predicted = y_pred_probs.round()
    accuracy = (predicted.eq(y_tensor).sum() / float(y_tensor.shape[0]))
    print(f"
Evaluacion final del modelo:")
    print(f"   - Precision (Accuracy) en todo el dataset: {accuracy.item()*100:.2f}%")''

# --- 5. Guardado del Modelo en formato ONNX ---

print(f"\nGuardando el modelo para ONNX Runtime...")

if not os.path.exists(MODEL_DIR):
    os.makedirs(MODEL_DIR)

# Crear un input de ejemplo con las dimensiones correctas
dummy_input = torch.randn(1, input_dim, requires_grad=True)

torch.onnx.export(model,               # el modelo a ejecutar
                  dummy_input,         # un input de ejemplo
                  MODEL_PATH_ONNX,   # dónde guardar el modelo
                  export_params=True,  # guardar los pesos entrenados
                  opset_version=11,    # la versión de ONNX
                  do_constant_folding=True, # para optimización
                  input_names = ['input'],   # nombre del input
                  output_names = ['output'], # nombre del output
                  dynamic_axes={'input' : {0 : 'batch_size'}, # ejes dinámicos
                                'output' : {0 : 'batch_size'}})

print(f"   - Modelo convertido y guardado en formato ONNX: {MODEL_PATH_ONNX}")
print("\nProceso finalizado! El modelo esta listo para ser usado por el bot.")
