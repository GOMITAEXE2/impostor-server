const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static('public'));

let socketRooms = {};
let roomState = {};

io.on('connection', (socket) => {
    socket.on('JOIN_ROOM', (roomCode) => {
        socket.join(roomCode);
        socketRooms[socket.id] = roomCode;
        if (!roomState[roomCode]) roomState[roomCode] = [];
        if (!roomState[roomCode].includes(socket.id)) roomState[roomCode].push(socket.id);
    });

    socket.on('GAME_EVENT', (data) => {
        io.to(data.room).emit('GAME_EVENT', data);
    });

    socket.on('disconnect', () => {
        const room = socketRooms[socket.id];
        if (room && roomState[room]) {
            const wasHost = (roomState[room][0] === socket.id);
            roomState[room] = roomState[room].filter(id => id !== socket.id);
            
            io.to(room).emit('GAME_EVENT', {
                type: 'USER_LEFT',
                payload: { id: socket.id, wasHost: wasHost }
            });

            if (wasHost && roomState[room].length > 0) {
                const newHostId = roomState[room][0];
                io.to(room).emit('GAME_EVENT', {
                    type: 'NEW_HOST_ASSIGNED',
                    payload: newHostId
                });
            }
            if (roomState[room].length === 0) delete roomState[room];
        }
        delete socketRooms[socket.id];
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Servidor en puerto ${PORT}`); });