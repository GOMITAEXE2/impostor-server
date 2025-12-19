const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static('public'));

// Diccionario para saber en qué sala está cada socket (Para manejar desconexiones)
let socketRooms = {};

io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);

    socket.on('JOIN_ROOM', (roomCode) => {
        socket.join(roomCode);
        socketRooms[socket.id] = roomCode; // Guardamos dónde está
        console.log(`Socket ${socket.id} se unió a sala ${roomCode}`);
    });

    socket.on('GAME_EVENT', (data) => {
        // IMPORTANTE: Usamos io.to() para que le llegue A TODOS (incluido al que envió)
        // Esto arregla que el Host se quede tildado.
        io.to(data.room).emit('GAME_EVENT', data);
    });

    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
        // Buscar en qué sala estaba
        const room = socketRooms[socket.id];
        if (room) {
            // Avisar a la sala que este usuario se fue
            io.to(room).emit('GAME_EVENT', {
                type: 'USER_LEFT',
                payload: socket.id
            });
            // Borrar registro
            delete socketRooms[socket.id];
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});