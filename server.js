const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { 
    cors: { origin: "*" },
    maxHttpBufferSize: 1e7
});

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname)));

io.on('connection', (socket) => {
    
    socket.on('join-voice', (userId) => {
        socket.userId = userId;
        socket.join("salon-global");
        console.log(`Joueur connecté : ${userId}`);
    });

    socket.on('flux-audio-brut', (bufferAudio) => {
        socket.to("salon-global").emit('stream-audio-serveur', {
            emetteur: socket.userId,
            buffer: bufferAudio
        });
    });

    socket.on('disconnect', () => {
        socket.leave("salon-global");
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(PORT, () => console.log(`Serveur en ligne sur le port ${PORT}`));
