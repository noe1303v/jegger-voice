const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
app.use(express.json());

let positionsJoueurs = {};

app.post('/update-positions', (req, res) => {
    const { userId, username, x, y, z } = req.body;
    if (!userId) return res.status(400).json({ error: "Id joueur manquant" });

    positionsJoueurs[userId] = {
        username: username,
        x: parseFloat(x),
        y: parseFloat(y),
        z: parseFloat(z),
        lastUpdate: Date.now()
    };

    const maintenant = Date.now();
    Object.keys(positionsJoueurs).forEach(id => {
        if (maintenant - positionsJoueurs[id].lastUpdate > 10000) {
            delete positionsJoueurs[id];
        }
    });

    res.json({ success: true, positions: positionsJoueurs });
});

io.on('connection', (socket) => {
    console.log("Un joueur s'est connecté au système audio !");

    socket.on('join-voice', (userId) => {
        socket.userId = userId;
        socket.join("salon-vocal-global");
        console.log(`Joueur lié à l'ID Roblox : ${userId}`);
    });

    socket.on('signal', (data) => {
        io.to("salon-vocal-global").emit('signal-recu', {
            emetteur: socket.userId,
            donnees: data.signal,
            cible: data.cible
        });
    });

    socket.on('disconnect', () => {
        console.log("Un joueur a fermé la page audio.");
    });
});

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <title>Jegger City - Chat Vocal de Proximité</title>
        </head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding-top: 80px; background: #1a1a1a; color: white;">
            <h1 style="color: #00a2ff;">Jegger City Voice Connect</h1>
            <p style="font-size: 18px; margin-bottom: 30px;">Active ton micro de proximité pour le serveur de jeu.</p>
            
            <div style="background: #2a2a2a; padding: 30px; display: inline-block; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
                <input type="text" id="uid" placeholder="Entre ton ID Roblox" style="padding: 12px; font-size: 16px; border-radius: 5px; border: none; width: 250px; text-align: center; margin-bottom: 20px;"><br>
                <button onclick="lancerAudio()" style="padding: 12px 25px; font-size: 16px; background: #00a2ff; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">Lancer la Connexion</button>
            </div>
            
            <p style="color: #888; margin-top: 40px; font-size: 14px;">Laisse cet onglet ouvert en arrière-plan pendant que tu joues.</p>

            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                let monStream;

                async function lancerAudio() {
                    const userId = document.getElementById('uid').value;
                    if(!userId) return alert("Erreur : Tu dois renseigner ton ID Roblox !");
                    
                    try {
                        monStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                        socket.emit('join-voice', userId);
                        alert("Micro synchronisé avec succès ! Tu peux retourner sur Roblox.");
                    } catch(err) {
                        alert("Erreur : Impossible d'accéder à ton micro. Vérifie tes autorisations de navigateur.");
                    }
                }
            </script>
        </body>
        </html>
    `);
});

server.listen(PORT, () => console.log(`Serveur de chat vocal démarré sur le port ${PORT}`));
