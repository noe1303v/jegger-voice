const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" }, maxHttpBufferSize: 1e7 });

const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(path.join(__dirname)));

let positionsJoueurs = {};

// Route pour Roblox
app.post('/update-positions', (req, res) => {
    const { userId, username, x, y, z } = req.body;
    if (!userId) return res.status(400).send();
    
    const idString = userId.toString();

    if (!positionsJoueurs[idString]) {
        positionsJoueurs[idString] = {
            username: username,
            x: 0, y: 0, z: 0,
            vocalActive: false,
            isMuted: false,
            robloxActive: true
        };
    }

    positionsJoueurs[idString].x = parseFloat(x);
    positionsJoueurs[idString].y = parseFloat(y);
    positionsJoueurs[idString].z = parseFloat(z);
    positionsJoueurs[idString].robloxActive = true;
    positionsJoueurs[idString].lastUpdate = Date.now();

    res.json({ positions: positionsJoueurs });
});

io.on('connection', (socket) => {
    socket.on('join-voice', (userId) => {
        const idString = userId.toString();
        socket.userId = idString;
        if (!positionsJoueurs[idString]) {
            positionsJoueurs[idString] = { vocalActive: true, isMuted: false };
        } else {
            positionsJoueurs[idString].vocalActive = true;
        }
        socket.join("salon-global");
    });

    socket.on('toggle-mute', (data) => {
        if (positionsJoueurs[data.userId]) {
            positionsJoueurs[data.userId].isMuted = data.mute;
        }
    });

    socket.on('flux-audio-brut', (buffer) => {
        socket.to("salon-global").emit('stream-audio-serveur', { emetteur: socket.userId, buffer });
    });

    socket.on('disconnect', () => {
        if (socket.userId && positionsJoueurs[socket.userId]) {
            positionsJoueurs[socket.userId].vocalActive = false;
        }
    });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
server.listen(PORT, () => console.log(`Serveur prêt sur le port ${PORT}`));
