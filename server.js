const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
app.use(express.json());

// Base de données temporaire des joueurs connectés
let positionsJoueurs = {};

// Route appelée par Roblox pour envoyer ses positions et récupérer les connectés
app.post('/update-positions', (req, res) => {
    const { userId, username, x, y, z } = req.body;
    
    if (userId) {
        const idString = userId.toString();
        // Si le joueur existe déjà via le site web, on met juste à jour sa position Roblox
        if (positionsJoueurs[idString]) {
            positionsJoueurs[idString].x = parseFloat(x);
            positionsJoueurs[idString].y = parseFloat(y);
            positionsJoueurs[idString].z = parseFloat(z);
            positionsJoueurs[idString].robloxActive = true;
        } else {
            // Si le joueur n'a pas encore ouvert le site, on l'enregistre quand même en attente
            positionsJoueurs[idString] = {
                username: username || "Inconnu",
                x: parseFloat(x), y: parseFloat(y), z: parseFloat(z),
                vocalActive: false,
                robloxActive: true,
                lastUpdate: Date.now()
            };
        }
        positionsJoueurs[idString].lastUpdate = Date.now();
    }

    // Nettoyage des joueurs déconnectés (sans signe de vie depuis 12 secondes)
    const maintenant = Date.now();
    Object.keys(positionsJoueurs).forEach(id => {
        if (maintenant - positionsJoueurs[id].lastUpdate > 12000) {
            delete positionsJoueurs[id];
        }
    });

    // On renvoie la liste à Roblox
    res.json({ success: true, positions: positionsJoueurs });
});

// Gestion du site web et des micros
io.on('connection', (socket) => {
    socket.on('join-voice', (userId) => {
        if (!userId) return;
        const idString = userId.toString();
        socket.userId = idString;
        socket.join("salon-vocal-global");

        // Force l'activation du statut vocal sur le serveur
        if (!positionsJoueurs[idString]) {
            positionsJoueurs[idString] = { username: "Via Web", x: 0, y: 0, z: 0, robloxActive: false };
        }
        positionsJoueurs[idString].vocalActive = true;
        positionsJoueurs[idString].lastUpdate = Date.now();
        
        console.log(`[SERVEUR] Le joueur ${idString} a activé son vocal sur le site !`);
    });

    socket.on('disconnect', () => {
        if (socket.userId && positionsJoueurs[socket.userId]) {
            positionsJoueurs[socket.userId].vocalActive = false;
        }
    });
});

// Page HTML web affichée sur Render
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <title>Jegger City - Chat Vocal</title>
        </head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding-top: 80px; background: #1a1a1a; color: white;">
            <h1 style="color: #00a2ff;">Jegger City Voice Connect</h1>
            <p style="font-size: 18px; margin-bottom: 30px;">Active ton micro de proximité pour le serveur de jeu.</p>
            
            <div style="background: #2a2a2a; padding: 30px; display: inline-block; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
                <input type="text" id="uid" placeholder="Entre ton ID Roblox" style="padding: 12px; font-size: 16px; border-radius: 5px; border: none; width: 250px; text-align: center; margin-bottom: 20px;"><br>
                <button onclick="lancerAudio()" style="padding: 12px 25px; font-size: 16px; background: #00a2ff; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">Lancer la Connexion</button>
            </div>
            
            <p id="statut" style="color: #bbb; margin-top: 20px; font-size: 16px; font-weight: bold;"></p>

            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                async function lancerAudio() {
                    const userId = document.getElementById('uid').value.trim();
                    if(!userId) return alert("Erreur : Tu devez entrer ton ID Roblox !");
                    
                    try {
                        await navigator.mediaDevices.getUserMedia({ audio: true });
                        socket.emit('join-voice', userId);
                        document.getElementById('statut').innerText = "🔴 Connexion active ! Laisse cet onglet ouvert.";
                        document.getElementById('statut').style.color = "#00ff64";
                    } catch(err) {
                        alert("Erreur micro : Vérifie les autorisations de ton navigateur.");
                    }
                }
            </script>
        </body>
        </html>
    `);
});

server.listen(PORT, () => console.log(`Serveur actif sur le port ${PORT}`));
