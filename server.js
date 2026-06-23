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

// C'est ici que Roblox envoie sa position et demande l'état des autres
app.post('/update-positions', (req, res) => {
    const { userId, username, x, y, z } = req.body;
    const idString = userId.toString();

    if (positionsJoueurs[idString]) {
        positionsJoueurs[idString].x = parseFloat(x);
        positionsJoueurs[idString].y = parseFloat(y);
        positionsJoueurs[idString].z = parseFloat(z);
        positionsJoueurs[idString].robloxActive = true;
    } else {
        positionsJoueurs[idString] = {
            username: username,
            x: parseFloat(x), y: parseFloat(y), z: parseFloat(z),
            vocalActive: false,
            isMuted: false,
            robloxActive: true,
            lastUpdate: Date.now()
        };
    }
    positionsJoueurs[idString].lastUpdate = Date.now();

    // On renvoie TOUT le tableau pour que Roblox puisse lire l'état "vocalActive" de tout le monde
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

    socket.on('flux-audio-brut', (buffer) => {
        socket.to("salon-global").emit('stream-audio-serveur', { emetteur: socket.userId, buffer });
    });

    socket.on('disconnect', () => {
        if (positionsJoueurs[socket.userId]) positionsJoueurs[socket.userId].vocalActive = false;
    });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
server.listen(PORT, () => console.log(`Serveur actif`));
