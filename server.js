const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
// Configuration des paquets WebSocket pour transporter un flux audio lourd sans coupure
const io = socketIo(server, { 
    cors: { origin: "*" },
    maxHttpBufferSize: 1e7 // 10 Mo pour éviter les saturations de flux
});

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
        
        console.log(`[SERVEUR] Joueur ${idString} diffuse son flux audio sur le serveur.`);
    });

    // LE COEUR DU SYSTÈME : Le serveur reçoit le flux audio brut (comme une vidéo) et le retransmet
    socket.on('flux-audio-brut', (donneesAudio) => {
        if (!socket.userId) return;
        
        // On vérifie si le joueur n'est pas muté avant de diffuser son stream
        if (positionsJoueurs[socket.userId] && positionsJoueurs[socket.userId].isMuted) return;

        socket.to("salon-vocal-global").emit('stream-audio-serveur', {
            emetteur: socket.userId,
            buffer: donneesAudio // Données binaires du micro
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
    res.send(`
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <title>Jegger City - Chat Vocal Live Stream</title>
        </head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding-top: 60px; background: #1a1a1a; color: white;">
            <h1 style="color: #00a2ff;">Jegger City Voice Stream</h1>
            <p style="font-size: 18px; margin-bottom: 30px;">Le son est diffusé en direct depuis le serveur web.</p>
            
            <div id="box-connexion" style="background: #2a2a2a; padding: 30px; display: inline-block; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); min-width: 320px;">
                <div id="formulaire">
                    <input type="text" id="uid" placeholder="Entre ton ID Roblox" style="padding: 12px; font-size: 16px; border-radius: 5px; border: none; width: 250px; text-align: center; margin-bottom: 20px;"><br>
                    <button onclick="lancerAudio()" style="padding: 12px 25px; font-size: 16px; background: #00a2ff; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; margin-bottom: 10px;">Lancer la Connexion</button>
                </div>
                
                <div id="statut-container" style="display: none;">
                    <p id="statut" style="color: #00ff64; font-size: 18px; font-weight: bold; margin-bottom: 25px;">🔴 Stream en direct connecté !</p>
                    
                    <div style="width: 250px; height: 15px; background: #444; border-radius: 10px; margin: 0 auto 20px auto; overflow: hidden;">
                        <div id="barre-volume" style="width: 0%; height: 100%; background: #00ff64; transition: width 0.05s ease;"></div>
                    </div>

                    <div style="margin-bottom: 25px;">
                        <label for="volume-slider" style="font-size: 14px; color: #ccc; display: block; margin-bottom: 5px;">Volume du micro :</label>
                        <input type="range" id="volume-slider" min="0" max="2" step="0.1" value="1" style="width: 200px; cursor: pointer;">
                    </div>

                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button id="btn-mute" onclick="toggleMute()" style="padding: 10px 15px; font-size: 14px; background: #ff9d00; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; width: 110px;">Muter</button>
                        <button onclick="couperConnexion()" style="padding: 10px 15px; font-size: 14px; background: #ff4141; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; width: 110px;">Déconnexion</button>
                    </div>
                </div>
            </div>
            
            <p style="color: #888; margin-top: 40px; font-size: 14px;">Laisse cet onglet ouvert en arrière-plan pendant que tu joues.</p>

            <script src="/socket.io/socket.io.js"></script>
            <script>
                const socket = io();
                let monStream = null;
                let audioContext = null;
                let analyser = null;
                let gainNode = null;
                let estMute = false;
                let monId = null;
                let scriptProcessor = null;

                // File d'attente pour stocker et lire les morceaux de son reçus du serveur sans coupure
                let morceauxAudioA_Lire = {}; 
                const DISTANCE_MAX = 80;
                let positionsServeur Cache = {};

                async function lancerAudio() {
                    monId = document.getElementById('uid').value.trim();
                    if(!monId) return alert("Erreur : Entre ton ID Roblox !");
                    
                    try {
                        monStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                        
                        audioContext = new (window.AudioContext || window.webkitAudioContext)();
                        
                        // Forcer l'activation du son de la page web immédiatement
                        if (audioContext.state === 'suspended') {
                            await audioContext.resume();
                        }

                        socket.emit('join-voice', monId);
                        
                        document.getElementById('formulaire').style.display = 'none';
                        document.getElementById('statut-container').style.display = 'block';
                        
                        analyser = audioContext.createAnalyser();
                        gainNode = audioContext.createGain();
                        
                        const source = audioContext.createMediaStreamSource(monStream);
                        source.connect(gainNode);
                        gainNode.connect(analyser);
                        
                        // Découpage du micro en petits morceaux binaires (comme un flux vidéo) pour l'envoyer au serveur
                        scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(audioContext.destination);
                        
                        scriptProcessor.onaudioprocess = function(e) {
                            if (estMute) return;
                            const donneesEntree = e.inputBuffer.getChannelData(0);
                            // Envoi direct au serveur web
                            socket.emit('flux-audio-brut', donneesEntree);
                        };

                        analyser.fftSize = 256;
                        const bufferLength = analyser.frequencyBinCount;
                        const dataArray = new Uint8Array(bufferLength);

                        function verifierVolume() {
                            if (!monStream || !analyser) return;
                            analyser.getByteFrequencyData(dataArray);
                            let total = 0;
                            for (let i = 0; i < bufferLength; i++) total += dataArray[i];
                            let volume = total / bufferLength;
                            let pourcentage = Math.min(100, Math.floor(volume * 3));
                            document.getElementById('barre-volume').style.width = estMute ? "0%" : pourcentage + "%";
                            requestAnimationFrame(verifierVolume);
                        }
                        verifierVolume();

                        setInterval(calculerDistancesAudio, 500);

                    } catch(err) {
                        alert("Erreur micro : Vérifie les autorisations.");
                        console.error(err);
                    }
                }

                // LE SITE WEB REÇOIT LE SON DU SERVEUR (COMME UNE VIDÉO)
                socket.on('stream-audio-serveur', (data) => {
                    if (!audioContext || data.emetteur === monId) return;

                    const idDistant = data.emetteur;
                    const donnéesBrutes = new Float32Array(data.buffer);

                    // Calcul de la distance pour savoir si on doit jouer le morceau de son reçu
                    let volumeCalculé = 0;
                    const maPos = positionsServeurCache[monId];
                    const posAutre = positionsServeurCache[idDistant];

                    if (maPos && posAutre && posAutre.robloxActive) {
                        const dx = maPos.x - posAutre.x;
                        const dy = maPos.y - posAutre.y;
                        const dz = maPos.z - posAutre.z;
                        const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);

                        if (distance <= DISTANCE_MAX) {
                            volumeCalculé = 1 - (distance / DISTANCE_MAX);
                        }
                    }

                    // Si le joueur est assez proche, le navigateur génère et joue le son reçu du serveur
                    if (volumeCalculé > 0) {
                        const bufferAudio = audioContext.createBuffer(1, donnéesBrutes.length, audioContext.sampleRate);
                        bufferAudio.getChannelData(0).set(donnéesBrutes);

                        const sourceLecture = audioContext.createBufferSource();
                        sourceLecture.buffer = bufferAudio;

                        const gainLecture = audioContext.createGain();
                        gainLecture.gain.value = volumeCalculé;

                        sourceLecture.connect(gainLecture);
                        gainLecture.connect(audioContext.destination);
                        
                        // Joue le son instantanément dans le navigateur
                        sourceLecture.start();
                    }
                });

                async function calculerDistancesAudio() {
                    if (!monId || !audioContext) return;

                    try {
                        const response = await fetch('/update-positions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: monId, x: 0, y: 0, z: 0 })
                        });
                        const data = await response.json();
                        if (data.positions) {
                            positionsServeurCache = data.positions;
                        }
                    } catch (e) {}
                }

                function toggleMute() {
                    if(!monStream) return;
                    estMute = !estMute;
                    monStream.getAudioTracks().forEach(track => track.enabled = !estMute);
                    
                    const btn = document.getElementById('btn-mute');
                    if(estMute) {
                        btn.innerText = "Démuter";
                        btn.style.background = "#00ff64";
                        document.getElementById('statut').innerText = "⏸️ Micro coupé (Mute)";
                        document.getElementById('statut').style.color = "#ff4141";
                    } else {
                        btn.innerText = "Muter";
                        btn.style.background = "#ff9d00";
                        document.getElementById('statut').innerText = "🔴 Stream en direct connecté !";
                        document.getElementById('statut').style.color = "#00ff64";
                    }
                    socket.emit('toggle-mute', estMute);
                }

                function couperConnexion() {
                    socket.emit('leave-voice');
                    estMute = false;
                    
                    if (scriptProcessor) {
                        scriptProcessor.disconnect();
                        scriptProcessor = null;
                    }
                    if (monStream) {
                        monStream.getTracks().forEach(track => track.stop());
                        monStream = null;
                    }
                    if (audioContext) audioContext.close();
                    
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
