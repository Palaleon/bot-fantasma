import ort from 'onnxruntime-node';
import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger.js';

class LearningManager {
    constructor() {
        // CAMBIO: La ruta ahora apunta al modelo en formato ONNX.
        this.modelPath = path.resolve('./model/model.onnx');
        this.trainingDataPath = './learning_data.jsonl'; 
        this.session = null; // CAMBIO: Ya no es 'model', ahora es 'session'.
        this.isModelReady = false;

        this._initialize();
    }

    async _initialize() {
        try {
            await fs.access(this.modelPath);
            // CAMBIO: Carga del modelo con ONNX Runtime.
            ort.InferenceSession.create(this.modelPath).then(session => {
                this.session = session;
                this.isModelReady = true;
                logger.warn('🧠 LEARNING-MANAGER: ¡Modelo de IA (PyTorch/ONNX) cargado y activo! Las decisiones serán potenciadas.');
            }).catch(error => {
                 logger.error(`🧠 LEARNING-MANAGER: Error al cargar el modelo ONNX. ${error.message}`);
            });
        } catch (error) {
            logger.info('🧠 LEARNING-MANAGER: No se encontró un modelo entrenado. Operando en modo de recolección de datos.');
        }
    }

    isReady() {
        return this.isModelReady;
    }

    async predict(marketSnapshot) {
        if (!this.session) {
            return null; 
        }

        const featureVector = this._normalizeAndVectorize(marketSnapshot);
        
        try {
            const inputTensor = new ort.Tensor('float32', featureVector, [1, featureVector.length]);
            const feeds = { 'input': inputTensor };
            const results = await this.session.run(feeds);
            const outputTensor = results.output;

            // El modelo ahora devuelve un "logit" (un valor bruto), no una probabilidad.
            const logit = outputTensor.data[0];

            // Aplicamos la función sigmoide manualmente para convertir el logit en una probabilidad (0 a 1).
            const confidence = 1 / (1 + Math.exp(-logit));

            // Ahora podemos tomar la decisión basándonos en la probabilidad, como antes.
            const decision = confidence > 0.5 ? 'call' : 'put';
            const finalConfidence = decision === 'call' ? confidence : 1 - confidence;

            return { decision, confidence: finalConfidence };

        } catch (error) {
            logger.error(`🧠 LEARNING-MANAGER: Error durante la inferencia con ONNX. ${error.message}`);
            return null;
        }
    }

    async captureTrainingData(tradeData) {
        const { signal, isWin } = tradeData;

        const trainingRecord = {
            tradeId: signal.requestId,
            timestamp: Date.now(),
            outcome: isWin ? 1 : 0,
            marketSnapshot: signal.marketSnapshot,
            expectedCandleIds: signal.expectedCandleIds,
            signalDiagnosis: signal.diagnosis
        };

        const dataLine = JSON.stringify(trainingRecord) + '\n';

        try {
            await fs.appendFile(this.trainingDataPath, dataLine);
            logger.info(`🧠 LEARNING-MANAGER: Datos de trade [${signal.requestId}] guardados. Resultado: ${isWin ? 'VICTORIA' : 'DERROTA'}.`);
        } catch (error) {
            logger.error(`🧠 LEARNING-MANAGER: Fallo al guardar los datos de aprendizaje. Error: ${error.message}`);
        }
    }

    _normalizeAndVectorize(snapshot) {
        // NOTA IMPORTANTE PARA FUTUROS DESARROLLADORES:
        // Esta función debe ser una réplica exacta de su contraparte en `train_model.py`.
        // Se usan valores por defecto (ej. `|| 50`) para manejar datos faltantes y asegurar
        // que el modelo reciba un vector numérico sin `NaN`s, previniendo el desfase
        // entre los datos de entrenamiento y los de producción (train-serve skew).
        const features = [];
        const timeframes = ['1m', '5m', '10m', '15m', '30m'];
    
        for (const tf of timeframes) {
            // Usamos '|| {}' para asegurar que no haya errores si el timeframe no existe
            const indicators = snapshot.strategic[tf] || {};
            const chartistPattern = snapshot.chartist[tf] || {};
    
            // --- Procesamiento de Indicadores ---
            const price = indicators.sma_fast || indicators.sma_slow || 0;
    
            // Usamos valores por defecto idénticos a los del script de Python
            features.push((indicators.rsi || 50) / 100.0);
            features.push(price > 0 ? Math.min(1, (indicators.atr || 0) / price) : 0);
            features.push((indicators.adx || 0) / 100.0);
    
            const bb = indicators.bb;
            if (bb && bb.upper != null && bb.lower != null && (bb.upper - bb.lower) > 0) {
                const bb_pos = (price - bb.lower) / (bb.upper - bb.lower);
                // Aseguramos que no se introduzca un NaN y se mantenga en el rango esperado
                features.push(isNaN(bb_pos) ? 0.5 : Math.max(0, Math.min(1.2, bb_pos)));
            } else {
                features.push(0.5);
            }
    
            const macd = indicators.macd;
            const atr = indicators.atr || 0;
            if (macd && macd.histogram != null && atr > 0) {
                const normalized_hist = macd.histogram / atr;
                // Usamos tanh para normalizar, asegurando que no sea NaN
                features.push(isNaN(normalized_hist) ? 0 : Math.tanh(normalized_hist));
            } else {
                features.push(0);
            }
    
            // --- Procesamiento de Patrones Chartistas ---
            const pattern = chartistPattern.pattern;
            features.push(pattern === 'BullishEngulfing' ? 1 : 0);
            features.push(pattern === 'BearishEngulfing' ? 1 : 0);
            features.push(pattern === 'Hammer' ? 1 : 0);
        }
    
        return features;
    }
}

export default LearningManager;