const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static('public'));

// MEMORIA DEL SERVIDOR
// socketRooms: { socketId: roomCode } -> Para saber rápido dónde está cada uno
// roomState: { roomCode: [socketId1, socketId2...] } -> La lista ordenada (el 0 es Host)
let socketRooms = {};
let roomState = {};

io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);

    socket.on('JOIN_ROOM', (roomCode) => {
        socket.join(roomCode);
        socketRooms[socket.id] = roomCode;
        
        // Inicializar sala si no existe
        if (!roomState[roomCode]) {
            roomState[roomCode] = [];
        }
        
        // Agregamos a la lista si no está
        if (!roomState[roomCode].includes(socket.id)) {
            roomState[roomCode].push(socket.id);
        }

        console.log(`Socket ${socket.id} entró a sala ${roomCode}. Total: ${roomState[roomCode].length}`);
    });

    socket.on('GAME_EVENT', (data) => {
        // Rebotamos el mensaje a todos en la sala (incluido al que lo envió)
        io.to(data.room).emit('GAME_EVENT', data);
    });

    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
        const room = socketRooms[socket.id];
        
        if (room && roomState[room]) {
            // 1. Sacarlo de la lista
            const wasHost = (roomState[room][0] === socket.id); // ¿Era el rey?
            roomState[room] = roomState[room].filter(id => id !== socket.id);
            
            // Avisar a la sala que se fue (para que lo maten o lo saquen del lobby)
            io.to(room).emit('GAME_EVENT', {
                type: 'USER_LEFT',
                payload: { id: socket.id, wasHost: wasHost }
            });

            // 2. MIGRACIÓN DE HOST (Si era host y queda gente)
            if (wasHost && roomState[room].length > 0) {
                const newHostId = roomState[room][0]; // El siguiente en la fila es el nuevo rey
                console.log(`Sala ${room}: Nuevo Host asignado -> ${newHostId}`);
                
                io.to(room).emit('GAME_EVENT', {
                    type: 'NEW_HOST_ASSIGNED',
                    payload: newHostId
                });
            }

            // Limpieza si no queda nadie
            if (roomState[room].length === 0) {
                delete roomState[room];
            }
        }
        
        delete socketRooms[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});