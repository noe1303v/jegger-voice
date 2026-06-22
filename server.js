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
                x = parseFloat(x), y = parseFloat(y), z = parseFloat(z),
                vocalActive: false,
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
        positionsJoueurs[idString].lastUpdate = Date.now();
        console.log(`[SERVEUR] Joueur ${idString} connecté au vocal.`);
    });

    // Gestion de la déconnexion volontaire via le bouton
    socket.on('leave-voice', () => {
        if (socket.userId && positionsJoueurs[socket.userId]) {
            positionsJoueurs[socket.userId].vocalActive = false;
            console.log(`[SERVEUR] Joueur ${socket.userId} s'est déconnecté via le bouton.`);
        }
    });

    socket.on('disconnect', () => {
        if (socket.userId && positionsJoueurs[socket.userId]) {
            positionsJoueurs[socket.userId].vocalActive = false;
        }
    });
});

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <title>Jegger City - Chat Vocal</title>
        </head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding-top: 60px; background: #1a1a1a; color: white;">
            <h1 style="color: #00a2ff;">Jegger City Voice Connect</h1>
            <p style="font-size: 18px; margin-bottom: 30px;">Active ton micro de proximité pour le serveur de jeu.</p>
            
            <div id="box-connexion" style="background: #2a2a2a; padding: 30px; display: inline-block; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
                <div id="formulaire">
                    <input type="text" id="uid" placeholder="Entre ton ID Roblox" style="padding: 12px; font-size: 16px; border-radius: 5px; border: none; width: 250px; text-align: center; margin-bottom: 20px;"><br>
                    <button onclick="lancerAudio()" style="padding: 12px 25px; font-size: 16px; background: #00a2ff; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; margin-bottom: 10px;">Lancer la Connexion</button>
                </div>
                
                <div id="statut-container" style="display: none;">
                    <p id="statut" style="color: #00ff64; font-size: 18px; font-weight: bold; margin-bottom: 15px;">🔴 Connexion active ! Laisse cet onglet ouvert.</p>
                    
                    <!-- Indicateur visuel du micro (Test de fonctionnement) -->
                    <p style="font-size: 14px; color: #aaa; margin-bottom: 5px;">Test Micro ( doît bouger quand tu parles ) :</p>
                    <div style="width: 250px; height: 15px; background: #444; border-radius: 10px; margin: 0 auto 25px auto; overflow: hidden;">
                        <div id="barre-volume" style="width: 0%; height: 100%; background: #00ff64; transition: width 0.1s ease;"></div>
                    </div>

                    <button onclick="couperConnexion()" style="padding: 10px 20px; font-size: 14px; background: #ff4141; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">Déconnexion</button>
                </div>
            </div>
            
            <p style="color: #888; margin-top: 40px; font-size: 14px;">Laisse cet onglet ouvert en arrière-plan pendant que tu joues.</p>

            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                let monStream = null;
                let audioContext = null;
                let analyser = null;
                let javascriptNode = null;

                async function lancerAudio() {
                    const userId = document.getElementById('uid').value.trim();
                    if(!userId) return alert("Erreur : Tu dois entrer ton ID Roblox !");
                    
                    try {
                        monStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                        socket.emit('join-voice', userId);
                        
                        // Affichage de l'interface de contrôle
                        document.getElementById('formulaire').style.display = 'none';
                        document.getElementById('statut-container').style.display = 'block';
                        
                        // Système de vérification visuelle du micro
                        audioContext = new (window.AudioContext || window.webkitAudioContext)();
                        analyser = audioContext.createAnalyser();
                        const source = audioContext.createMediaStreamSource(monStream);
                        analyser.fftSize = 256;
                        source.connect(analyser);
                        
                        const bufferLength = analyser.frequencyBinCount;
                        const dataArray = new Uint8Array(bufferLength);
                        
                        function verifierVolume() {
                            if (!monStream) return;
                            analyser.getByteFrequencyData(dataArray);
                            let total = 0;
                            for (let i = 0; i < bufferLength; i++) {
                                total += dataArray[i];
                            }
                            let volume = total / bufferLength;
                            // Ajustement pour rendre la barre dynamique
                            let pourcentage = Math.min(100, Math.floor(volume * 2));
                            document.getElementById('barre-volume').style.width = pourcentage + "%";
                            requestAnimationFrame(verifierVolume);
                        }
                        verifierVolume();

                    } catch(err) {
                        alert("Erreur micro : Vérifie les autorisations de ton navigateur.");
                        console.error(err);
                    }
                }

                function couperConnexion() {
                    socket.emit('leave-voice');
                    
                    // Arrêt du flux micro
                    if (monStream) {
                        monStream.getTracks().forEach(track => track.stop());
                        monStream = null;
                    }
                    if (audioContext) {
                        audioContext.close();
                    }
                    
                    // Retour à l'écran de connexion
                    document.getElementById('barre-volume').style.width = "0%";
                    document.getElementById('statut-container').style.display = 'none';
                    document.getElementById('formulaire').style.display = 'block';
                }
            </script>
        </body>
        </html>
    `);
});

server.listen(PORT, () => console.log(`Serveur actif sur le port ${PORT}`));
