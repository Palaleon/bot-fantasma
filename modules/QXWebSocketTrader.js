// /modules/QXWebSocketTrader.js

const { v4: uuidv4 } = require('uuid'); // 💉 INYECCIÓN DE LA HERRAMIENTA FALTANTE

const requestId = Math.floor(Date.now() / 1000);

/**
 * @class QXWebSocketTrader
 * @description Gestiona la comunicación directa con el broker vía WebSocket.
 * Implementa el blueprint de JEFE para una operación robusta y sin fugas de memoria.
 */
class QXWebSocketTrader {
  /**
   * @param {import('puppeteer').Page} page La instancia de la página de Puppeteer.
   */
  constructor(page) {
    if (!page) throw new Error("QXWebSocketTrader: La instancia de la página es mandatoria.");
    this.page = page;
    this.isReady = false;
    console.log("QXWebSocketTrader: Módulo instanciado.");
  }

  /**
   * Espera a que el WebSocket (inyectado por 'evaluateOnNewDocument') esté listo.
   * @returns {Promise<void>}
   */
  async hookWebSocket() {
    console.log("QXWebSocketTrader: Esperando a que el socket interceptado esté listo...");
    try {
      // Ahora solo esperamos, la inyección se hace desde otro lado.
      await this.page.waitForFunction(
        'window.__socket && window.__socket.readyState === 1',
        { timeout: 20000 } // Aumentamos a 20s por si la conexión es lenta
      );
      this.isReady = true;
      console.log("QXWebSocketTrader: ✅ ¡Éxito! El socket está abierto y bajo nuestro control.");
    } catch (error) {
      this.isReady = false;
      console.error("QXWebSocketTrader: ❌ Timeout esperando que el socket esté listo.", error);
      throw new Error("La página cargó, pero nunca estableció una conexión WebSocket que pudiéramos usar.");
    }
  }

  /**
   * Envía una orden de trading directamente a través del socket.
   * @param {object} ordenConfig - Objeto de configuración de la orden.
   * @returns {Promise<string>} El ID de la solicitud para trazabilidad.
   * @throws {Error} Si el socket no está listo o falla el envío.
   */
async enviarOrden(ordenConfig) {
    if (!this.isReady) {
      throw new Error("QXWebSocketTrader: El socket no está listo para enviar órdenes.");
    }

    const requestId = Math.floor(Date.now() / 1000); // ✅ ESTA ES LA LLAVE CORRECTA (genera un número de tiempo)
    const finalConfig = { ...ordenConfig, requestId };

    try {
      await this.page.evaluate((config) => {
        if (!window.__socket || window.__socket.readyState !== 1) {
          throw new Error(`Socket no disponible. Estado: ${window.__socket ? window.__socket.readyState : 'nulo'}`);
        }
        // El formato '42["event", payload]' es específico de Socket.IO. Se adopta según el blueprint.
        const payload = `42${JSON.stringify(["orders/open", config])}`;
        window.__socket.send(payload);
      }, finalConfig);

      console.log(`QXWebSocketTrader: Orden enviada. Request ID: ${requestId}`);
      return requestId;
    } catch(error) {
        console.error(`QXWebSocketTrader: Fallo crítico al enviar orden ${requestId}.`, error);
        this.isReady = false; // Marcar como no listo para forzar una revisión
        throw error;
    }
  }

  /**
   * Cierra el socket de forma segura y limpia todas las referencias en el navegador.
   * @returns {Promise<void>}
   */
  async cleanup() {
    console.log("QXWebSocketTrader: Ejecutando limpieza de recursos...");
    this.isReady = false;
    try {
      await this.page.evaluate(() => {
        if (window.__socket) {
          if (window.__socket.readyState === 1) { // 1 = OPEN
            window.__socket.close();
          }
          delete window.__socket;
        }
        // No borramos __wsHooked para mantener la idempotencia en la sesión.
      });
    } catch (error) {
        console.warn("QXWebSocketTrader: Error menor durante el cleanup (la página pudo haberse cerrado).", error.message);
    }
  }
}

module.exports = { QXWebSocketTrader };