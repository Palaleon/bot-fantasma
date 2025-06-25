# system_health_monitor.py (v1.2 Final - Con Bisturí Integrado)

import asyncio
import time
import os
import gc
import json
from datetime import datetime

try:
    import psutil
except ImportError:
    print("Error: La librería 'psutil' no está instalada. Por favor, instálala con: pip install psutil")
    exit(1)

def get_precise_timestamp():
    """Genera un timestamp formateado con precisión de microsegundos para los logs."""
    return datetime.now().strftime("[%H:%M:%S.%f]")

class SystemHealthMonitor:
    """
    Supervisor Autónomo v1.2. Con capacidad de intervención quirúrgica en la página
    para neutralizar scripts de alto consumo de memoria de forma proactiva y sigilosa.
    """

    def __init__(self, bot_proxy, config, client_writer):
        """
        Inicializa el monitor de salud.
        """
        self.bot_proxy = bot_proxy
        self.config = config
        self.client_writer = client_writer
        self.process = psutil.Process(os.getpid())
        
        # --- Umbrales y Configuraciones ---
        self.MAX_RAM_MB = self.config.get("MAX_RAM_MB", 800)
        self.MAX_CPU_PERCENT = self.config.get("MAX_CPU_PERCENT", 80)
        self.MAX_EXTRACTION_ERRORS = self.config.get("MAX_EXTRACTION_ERRORS", 100)
        self.MAX_JS_HEAP_MB = self.config.get("MAX_JS_HEAP_MB", 1000) # Límite para la memoria de JS en la página

        # --- Intervalos de Operación ---
        self.HEALTH_CHECK_INTERVAL = self.config.get("HEALTH_CHECK_INTERVAL", 240) # Chequeo cada 4 minutos
        self.DEEP_CLEAN_INTERVAL = self.config.get("DEEP_CLEAN_INTERVAL", 7200)
        
        self.last_deep_clean_time = time.time()
        self._monitor_task = None
        
        print(f"{get_precise_timestamp()} ✅ SystemHealthMonitor Construido (v1.2 con Intervención JS).")

    async def inject_canvas_freezer(self):
        """
        Inyecta un script en la página para "congelar" el renderizado del gráfico de canvas,
        reduciendo drásticamente el uso de CPU y memoria de la página. (El "Bisturí")
        """
        print(f"{get_precise_timestamp()} 💉 [Bisturí] Intentando inyectar 'Congelador de Canvas'...")
        try:
            page = self.bot_proxy.analyzer_data.get("page")
            if not page or page.is_closed():
                print(f"{get_precise_timestamp()} ❌ No se pudo inyectar: la página no está disponible.")
                return

            js_script = """
            () => {
                const scope = document.querySelector('div.page__content');
                if (!scope) {
                    return 'Error: Scope div.page__content no encontrado.';
                }

                const canvas = scope.querySelector('canvas');
                if (!canvas) {
                    return 'Error: Canvas no encontrado dentro del scope.';
                }

                // Opcional: Ocultar visualmente para asegurar que no moleste.
                canvas.style.display = 'none';

                const context = canvas.getContext('2d');
                if (!context) {
                    return 'Éxito: Canvas ocultado, pero no se pudo obtener el contexto 2D.';
                }

                const functionsToFreeze = [
                    'fillRect', 'strokeRect', 'clearRect', 'drawImage', 'putImageData',
                    'fillText', 'strokeText', 'beginPath', 'closePath', 'clip',
                    'moveTo', 'lineTo', 'arc', 'arcTo', 'rect', 'stroke', 'fill'
                ];
                
                let frozenCount = 0;
                functionsToFreeze.forEach(funcName => {
                    if (typeof context[funcName] === 'function') {
                        // Se reemplaza la función de dibujo por una función vacía que no hace nada.
                        context[funcName] = () => {};
                        frozenCount++;
                    }
                });

                return `Éxito: Canvas congelado. ${frozenCount} funciones de dibujo neutralizadas.`;
            }
            """
            
            result = await page.evaluate(js_script)
            print(f"{get_precise_timestamp()} ✅ [Bisturí] Resultado: {result}")
            await self.send_alert("canvas_freezer_injected", f"Se inyectó el congelador de canvas. Resultado: {result}")

        except Exception as e:
            print(f"{get_precise_timestamp()} ❌ Error crítico durante la inyección del 'Congelador de Canvas': {e}")
            await self.send_alert("canvas_freezer_failed", f"Falló la inyección del congelador de canvas: {e}")
    
    async def start(self):
        """Inicia el loop de monitoreo principal en una tarea de fondo."""
        if self._monitor_task is None or self._monitor_task.done():
            self._monitor_task = asyncio.create_task(self._monitor_loop())
            print(f"{get_precise_timestamp()} 🚀 SystemHealthMonitor ACTIVADO. La protección 24/7 está en curso.")
        else:
            print(f"{get_precise_timestamp()} ⚠️ SystemHealthMonitor ya se está ejecutando.")

    async def stop(self):
        """Detiene de forma segura la tarea de monitoreo."""
        if self._monitor_task and not self._monitor_task.done():
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
            print(f"{get_precise_timestamp()} 🛑 SystemHealthMonitor DETENIDO correctamente.")
        self._monitor_task = None

    async def _monitor_loop(self):
        """El corazón del monitor. Ejecuta chequeos de salud proactivos y reactivos."""
        while True:
            try:
                await asyncio.sleep(self.HEALTH_CHECK_INTERVAL)
                
                print(f"\n{get_precise_timestamp()} 🩺 [HealthCheck] Realizando chequeo de salud programado...")
                
                # Medición de recursos del proceso Python
                ram_usage_mb = self.process.memory_info().rss / (1024 * 1024)
                cpu_usage_percent = await asyncio.to_thread(self.process.cpu_percent, 1.0)
                
                # Medición proactiva de la memoria de la página web
                js_heap_mb = 0
                page = self.bot_proxy.analyzer_data.get("page")
                if page and not page.is_closed():
                    try:
                        cdp_session = await page.context.new_cdp_session(page)
                        await cdp_session.send("Performance.enable")
                        metrics = await cdp_session.send("Performance.getMetrics")
                        await cdp_session.detach()
                        
                        js_heap_size_bytes = next((m['value'] for m in metrics['metrics'] if m['name'] == 'JSHeapUsedSize'), 0)
                        js_heap_mb = js_heap_size_bytes / (1024 * 1024)
                    except Exception as e:
                        print(f"{get_precise_timestamp()} ⚠️ No se pudo medir la memoria de JS de la página: {e}")
                
                print(f"{get_precise_timestamp()}    📊 Estado Python: RAM: {ram_usage_mb:.2f} MB | CPU: {cpu_usage_percent:.2f}%")
                print(f"{get_precise_timestamp()}    📈 Estado Página (JS Heap): {js_heap_mb:.2f} MB / {self.MAX_JS_HEAP_MB} MB")

                # Lógica de Decisión Proactiva (basada en memoria de la página)
                if js_heap_mb > self.MAX_JS_HEAP_MB:
                    await self.send_alert("proactive_js_memory_restart", f"Memoria de JS ({js_heap_mb:.2f} MB) excedió el umbral. Reinicio preventivo.")
                    await self.perform_corrective_action("js_memory_leak_prevented")
                    continue

                # Lógica de Decisión Reactiva (como respaldo)
                extraction_errors = self.bot_proxy.coordinator.extraction_errors
                if extraction_errors > self.MAX_EXTRACTION_ERRORS:
                    await self.send_alert("persistent_extraction_errors", f"Contador de errores ({extraction_errors}) superó el límite. Iniciando acción correctiva.")
                    await self.perform_corrective_action("logic_error_or_crash")
                    self.bot_proxy.coordinator.extraction_errors = 0
                    continue

                # Ciclo de limpieza profunda periódica
                if time.time() - self.last_deep_clean_time > self.DEEP_CLEAN_INTERVAL:
                    await self.perform_deep_clean()
                
                print(f"{get_precise_timestamp()} ✅ [HealthCheck] El sistema opera en estado óptimo.")

            except asyncio.CancelledError:
                print(f"{get_precise_timestamp()} 🛑 Loop de monitoreo cancelado.")
                break
            except Exception as e:
                print(f"{get_precise_timestamp()} ❌ Error CRÍTICO en el _monitor_loop: {e}")
                await asyncio.sleep(self.HEALTH_CHECK_INTERVAL * 2)

    async def perform_corrective_action(self, problem_type: str):
        """
        Sistema de auto-reparación. Ahora SIEMPRE inyecta el 'congelador' después de recargar.
        """
        print(f"{get_precise_timestamp()} 🚑 ¡ACCIÓN CORRECTIVA INICIADA! Causa: {problem_type}")
        
        permission_granted = await self.bot_proxy.coordinator.request_asset_change_permission()
        if not permission_granted:
            print(f"{get_precise_timestamp()} ⚠️ No se pudo obtener bloqueo para acción correctiva.")
            return

        try:
            page = self.bot_proxy.analyzer_data.get("page")
            if not page or page.is_closed():
                print(f"{get_precise_timestamp()} ❌ La página no existe o está cerrada.")
                return

            print(f"{get_precise_timestamp()}    🔧 Nivel 1: Recargando página para obtener un estado limpio...")
            await page.reload(wait_until="networkidle", timeout=60000)
            print(f"{get_precise_timestamp()}    ✅ Página recargada.")

            # ✅ PASO CRÍTICO: Después de cada recarga, inyectamos nuestro 'Bisturí'.
            await self.inject_canvas_freezer()

            # Re-inyectamos también el CSS del modal por seguridad.
            await self.bot_proxy.inject_modal_css_minimizer()
            await self.send_alert("action_taken", f"Acción correctiva '{problem_type}': Página recargada y canvas congelado.")

        except Exception as e:
            print(f"{get_precise_timestamp()} ❌ Error durante la acción correctiva: {e}")
            await self.send_alert("action_failed", f"Falló la acción correctiva para '{problem_type}': {e}")
        finally:
            await self.bot_proxy.coordinator.finish_asset_change()
            print(f"{get_precise_timestamp()} 🔓 Sistema desbloqueado después de la acción correctiva.")
            
    async def perform_deep_clean(self):
        """Realiza una limpieza profunda del entorno."""
        print(f"{get_precise_timestamp()} 🧼 [Deep Clean] Iniciando ciclo de limpieza profunda...")
        permission_granted = await self.bot_proxy.coordinator.request_asset_change_permission()
        if not permission_granted:
            print(f"{get_precise_timestamp()} ⚠️ Limpieza profunda pospuesta. El sistema estaba ocupado.")
            return
        try:
            page = self.bot_proxy.analyzer_data.get("page")
            if page and not page.is_closed():
                cdp_session = await page.context.new_cdp_session(page)
                await cdp_session.send("Network.clearBrowserCache")
                await cdp_session.detach()
            
            await asyncio.to_thread(gc.collect)
            await self.send_alert("deep_clean_completed", "Ciclo de limpieza profunda periódica finalizado.")
        except Exception as e:
            print(f"{get_precise_timestamp()} ❌ Error durante la limpieza profunda: {e}")
        finally:
            self.last_deep_clean_time = time.time()
            await self.bot_proxy.coordinator.finish_asset_change()
            print(f"{get_precise_timestamp()} ✨ [Deep Clean] Ciclo de limpieza finalizado.")

    async def send_alert(self, alert_type: str, message: str):
        """Envía una alerta estructurada al bot principal."""
        if not self.client_writer or self.client_writer.is_closing():
            return
        alert_data = {"event": "healthAlert", "data": {"type": alert_type, "message": message, "source": "SystemHealthMonitor", "timestamp": int(time.time() * 1000)}}
        try:
            payload = json.dumps(alert_data) + "\n"
            self.client_writer.write(payload.encode())
            await self.client_writer.drain()
            print(f"{get_precise_timestamp()} 🚨 Alerta de salud enviada: [TIPO: {alert_type}]")
        except Exception as e:
            print(f"{get_precise_timestamp()} ❌ Error al enviar alerta de salud por TCP: {e}")