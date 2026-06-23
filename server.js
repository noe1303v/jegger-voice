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
app.use(express.json());
app.use(express.static(path.join(__dirname)));

let positionsJoueurs = {};

app.post('/update-positions', (req, res) => {
    const { userId, username, x, y, z } = req.body;
    
    if (userId) {
        const idString = userId.toString();
        if (positionsJoueurs[idString]) {
            positionsJoueurs[idString].x = parseFloat(x);
            positionsJoueurs[idString].y = parseFloat(y);
            positionsJoueurs[idString].z = parseFloat(z);
            positionsJoueurs[idString].robloxActive = true;
        } else {
            positionsJoueurs[idString] = {
                username: username || "Inconnu",
                x: parseFloat(x), 
                y: parseFloat(y), 
                z: parseFloat(z),
                robloxActive: true,
                lastUpdate: Date.now()
            };
        }
        positionsJoueurs[idString].lastUpdate = Date.now();
    }

    const maintenant = Date.now();
    Object.keys(positionsJoueurs).forEach(id => {
        if (maintenant - positionsJoueurs[id].lastUpdate > 12000) {
            delete positionsJoueurs[id];
        }
    });

    res.json({ success: true, positions: positionsJoueurs });
});

io.on('connection', (socket) => {
    
    socket.on('join-voice', (userId) => {
        socket.userId = userId.toString();
        socket.join("salon-global");
    });

    socket.on('flux-audio-brut', (bufferAudio) => {
        socket.to("salon-global").emit('stream-audio-serveur', {
            emetteur: socket.userId,
            buffer: bufferAudio
        });
    });

    socket.on('leave-voice', () => {
        socket.leave("salon-global");
    });

    socket.on('disconnect', () => {
        socket.leave("salon-global");
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(PORT, () => console.log(`Serveur actif sur le port ${PORT}`));
