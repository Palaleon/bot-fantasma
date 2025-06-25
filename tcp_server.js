import net from 'net';
import { EventEmitter } from 'events';

/**
 * Servidor TCP para comunicarse con el analizador de Python.
 * Emite eventos 'connection', 'disconnection', 'message', y 'error'.
 */
class TcpServer extends EventEmitter {
    constructor(port, host) {
        super();
        this.port = port;
        this.host = host;
        this.server = null;
        this.clientSocket = null;
        this.buffer = '';
    }

    start() {
        this.server = net.createServer((socket) => {
            console.log(`[TCP Server] Analizador conectado desde ${socket.remoteAddress}:${socket.remotePort}`);
            this.clientSocket = socket;

            this.emit('connection', socket);

            socket.on('data', (data) => {
                this.buffer += data.toString('utf-8');
                let boundary = this.buffer.indexOf('\n');
                while (boundary !== -1) {
                    const message = this.buffer.substring(0, boundary);
                    this.buffer = this.buffer.substring(boundary + 1);
                    try {
                        const jsonData = JSON.parse(message);
                        // Emitir el evento 'message' con el objeto JSON parseado
                        this.emit('message', jsonData);
                    } catch (e) {
                        console.error('[TCP Server] Error parseando JSON del analizador:', e);
                        console.error('[TCP Server] Mensaje problemático:', message);
                    }
                    boundary = this.buffer.indexOf('\n');
                }
            });

            socket.on('close', () => {
                console.log('[TCP Server] El analizador se ha desconectado.');
                this.clientSocket = null;
                this.emit('disconnection');
            });

            socket.on('error', (err) => {
                console.error('[TCP Server] Error en el socket del cliente:', err);
                this.emit('error', err);
            });
        });

        this.server.listen(this.port, this.host, () => {
            console.log(`[TCP Server] Escuchando conexiones del analizador en ${this.host}:${this.port}`);
        });
    }

    sendCommand(command) {
        if (this.clientSocket && !this.clientSocket.destroyed) {
            try {
                const message = JSON.stringify(command) + '\n'; // Python espera un newline
                this.clientSocket.write(message);
                console.log(`[TCP Server] Comando enviado al analizador:`, command);
                return true;
            } catch (e) {
                console.error('[TCP Server] Error enviando comando:', e);
                return false;
            }
        } else {
            console.warn('[TCP Server] No se puede enviar comando, el analizador no está conectado.');
            return false;
        }
    }

    stop() {
        if (this.server) this.server.close(() => console.log('[TCP Server] Servidor detenido.'));
        if (this.clientSocket) this.clientSocket.destroy();
    }
}

export default TcpServer;