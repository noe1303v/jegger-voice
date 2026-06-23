const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Remplace par TES vraies valeurs du Dashboard Roblox
const CLIENT_ID = '7083652784926961699';
const CLIENT_SECRET = 'RBX-B81Sg0QjC0uTebnvmmpFBZ2FCASj9dsPLlJDBf8KJL7ULICcVIkxz31aojvd_EF5'; 
const REDIRECT_URI = 'https://jegger-voice-proximity.onrender.com//callback';

app.use(express.json());
app.use(express.static(path.join(__dirname)));

let positionsJoueurs = {};

// Gestion OAuth2 Roblox
app.get('/auth/roblox', (req, res) => {
    res.redirect(`https://apis.roblox.com/oauth/v1/authorize?client_id=${CLIENT_ID}&response_type=code&scope=openid+profile&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`);
});

app.get('/callback', async (req, res) => {
    const { code } = req.query;
    const tokenRes = await fetch('https://apis.roblox.com/oauth/v1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=authorization_code&code=${code}`
    });
    const tokens = await tokenRes.json();
    const userRes = await fetch('https://apis.roblox.com/oauth/v1/userinfo', { headers: { 'Authorization': `Bearer ${tokens.access_token}` } });
    const user = await userRes.json();
    res.redirect(`/?id=${user.sub}`);
});

// Sync position Roblox (pour ton script jeu)
app.post('/update-positions', (req, res) => {
    const { userId, username, x, y, z } = req.body;
    if(userId) {
        positionsJoueurs[userId] = { ...positionsJoueurs[userId], username, x, y, z, lastUpdate: Date.now() };
    }
    res.json({ positions: positionsJoueurs });
});

io.on('connection', (socket) => {
    socket.on('join-voice', (id) => {
        socket.userId = id;
        if(!positionsJoueurs[id]) positionsJoueurs[id] = { username: "Joueur", vocalActive: true, isMuted: false };
        else positionsJoueurs[id].vocalActive = true;
        io.emit('update-list', positionsJoueurs);
    });
    socket.on('flux-audio-brut', (data) => socket.to("salon-global").emit('stream-audio-serveur', { emetteur: socket.userId, buffer: data }));
    socket.on('disconnect', () => {
        if(socket.userId && positionsJoueurs[socket.userId]) positionsJoueurs[socket.userId].vocalActive = false;
        io.emit('update-list', positionsJoueurs);
    });
});

server.listen(3000, () => console.log("Panel actif"));
