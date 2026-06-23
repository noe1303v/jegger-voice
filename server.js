const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static(path.join(__dirname)));

let positionsJoueurs = {};

app.post('/update-positions', (req, res) => {
    const { userId, username, x, y, z } = req.body;
    if (!userId) return res.status(400).send();
    
    const id = userId.toString();
    if (!positionsJoueurs[id]) positionsJoueurs[id] = { username, x:0, y:0, z:0, vocalActive: false, isMuted: false };
    
    positionsJoueurs[id].x = parseFloat(x);
    positionsJoueurs[id].y = parseFloat(y);
    positionsJoueurs[id].z = parseFloat(z);
    positionsJoueurs[id].lastUpdate = Date.now();
    
    res.json({ positions: positionsJoueurs });
});

io.on('connection', (socket) => {
    socket.on('join-voice', (id) => {
        socket.userId = id.toString();
        if (positionsJoueurs[socket.userId]) positionsJoueurs[socket.userId].vocalActive = true;
        io.emit('update-list', positionsJoueurs);
    });

    socket.on('toggle-mute', (data) => {
        if (positionsJoueurs[data.userId]) positionsJoueurs[data.userId].isMuted = data.mute;
        io.emit('update-list', positionsJoueurs);
    });

    socket.on('flux-audio-brut', (buffer) => {
        socket.to("salon-global").emit('stream-audio-serveur', { emetteur: socket.userId, buffer });
    });

    socket.on('disconnect', () => {
        if (socket.userId && positionsJoueurs[socket.userId]) positionsJoueurs[socket.userId].vocalActive = false;
        io.emit('update-list', positionsJoueurs);
    });
});

server.listen(3000, () => console.log("Serveur actif"));
