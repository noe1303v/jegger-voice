const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

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
                vocalActive: false,
                isMuted: false,
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
        if (!userId) return;
        const idString = userId.toString();
        socket.userId = idString;
        socket.join("salon-vocal-global");

        if (!positionsJoueurs[idString]) {
            positionsJoueurs[idString] = { username: "Via Web", x: 0, y: 0, z: 0, robloxActive: false };
        }
        positionsJoueurs[idString].vocalActive = true;
        positionsJoueurs[idString].isMuted = false;
        positionsJoueurs[idString].lastUpdate = Date.now();
        
        socket.to("salon-vocal-global").emit('joueur-rejoint', idString);
    });

    socket.on('signal-audio', (data) => {
        io.to("salon-vocal-global").emit('relais-signal', {
            emetteur: socket.userId,
            cible: data.cible,
            signal: data.signal
        });
    });

    socket.on('ice-candidate', (data) => {
        io.to("salon-vocal-global").emit('relais-ice', {
            emetteur: socket.userId,
            cible: data.cible,
            candidate: data.candidate
        });
    });

    socket.on('toggle-mute', (muteState) => {
        if (socket.userId && positionsJoueurs[socket.userId]) {
            positionsJoueurs[socket.userId].isMuted = muteState;
        }
    });

    socket.on('leave-voice', () => {
        if (socket.userId && positionsJoueurs[socket.userId]) {
            positionsJoueurs[socket.userId].vocalActive = false;
        }
        socket.leave("salon-vocal-global");
    });

    socket.on('disconnect', () => {
        if (socket.userId && positionsJoueurs[socket.userId]) {
            positionsJoueurs[socket.userId].vocalActive = false;
        }
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(PORT, () => console.log(`Serveur actif sur le port ${PORT}`));
