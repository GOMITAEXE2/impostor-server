const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// 1. Servir los archivos de tu juego (HTML, CSS, JS)
app.use(express.static(__dirname));

// 2. Lógica de Conexión (El "Árbitro")
io.on('connection', (socket) => {
    console.log('jugador conectado:', socket.id);

    // Cuando alguien crea o se une a una sala
    socket.on('JOIN_ROOM', (roomCode) => {
        socket.join(roomCode);
        console.log(`Jugador ${socket.id} se unió a la sala: ${roomCode}`);
    });

    // Reenviar cualquier mensaje a los demás en la sala (Puente)
    socket.on('GAME_EVENT', (data) => {
        // data trae: { room: 'CODIGO', type: 'TIPO_MSG', payload: 'DATOS' }
        // Se lo mandamos a todos en la sala MENOS al que lo envió
        socket.to(data.room).emit('GAME_EVENT', data);
    });

    socket.on('disconnect', () => {
        console.log('Jugador desconectado:', socket.id);
    });
});

// 3. Encender el servidor en el puerto 3000
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`✅ SERVIDOR CORRIENDO EN: http://localhost:${PORT}`);
});