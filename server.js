const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
app.use(express.json());

let positionsJoueurs = {};
const DISTANCE_MAX_ENTENDRE = 80; // Distance max dans Roblox (en studs) pour s'entendre

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

// Gestion du Peer-to-Peer Audio (WebRTC via Socket.io)
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
        
        // On signale aux autres qu'un nouveau joueur est prêt à échanger du son
        socket.to("salon-vocal-global").emit('joueur-rejoint', idString);
        console.log(`[SERVEUR] Joueur ${idString} connecté au vocal.`);
    });

    // Relais des clés de connexion WebRTC (Signaling)
    socket.on('signal-audio', (data) => {
        io.to("salon-vocal-global").emit('relais-signal', {
            emetteur: socket.userId,
            cible: data.cible,
            signal: data.signal
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
            positionsJoueurs[socket.userId].isMuted = false;
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
            <title>Jegger City - Chat Vocal</title>
        </head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding-top: 60px; background: #1a1a1a; color: white;">
            <h1 style="color: #00a2ff;">Jegger City Voice Connect</h1>
            <p style="font-size: 18px; margin-bottom: 30px;">Active ton micro de proximité pour le serveur de jeu.</p>
            
            <div id="box-connexion" style="background: #2a2a2a; padding: 30px; display: inline-block; border-radius: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); min-width: 300px;">
                <div id="formulaire">
                    <input type="text" id="uid" placeholder="Entre ton ID Roblox" style="padding: 12px; font-size: 16px; border-radius: 5px; border: none; width: 250px; text-align: center; margin-bottom: 20px;"><br>
                    <button onclick="lancerAudio()" style="padding: 12px 25px; font-size: 16px; background: #00a2ff; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; margin-bottom: 10px;">Lancer la Connexion</button>
                </div>
                
                <div id="statut-container" style="display: none;">
                    <p id="statut" style="color: #00ff64; font-size: 18px; font-weight: bold; margin-bottom: 20px;">🔴 Connexion active ! Laisse cet onglet ouvert.</p>
                    
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

            <div id="audios-distants"></div>
            
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

                let connexionsPairs = {}; // Stocke les liaisons WebRTC avec les autres
                let noeudsGainDistants = {}; // Stocke le contrôle du volume de chaque joueur

                const configurationPeer = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

                async function lancerAudio() {
                    monId = document.getElementById('uid').value.trim();
                    if(!monId) return alert("Erreur : Entre ton ID Roblox !");
                    
                    try {
                        monStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                        socket.emit('join-voice', monId);
                        
                        document.getElementById('formulaire').style.display = 'none';
                        document.getElementById('statut-container').style.display = 'block';
                        
                        audioContext = new (window.AudioContext || window.webkitAudioContext)();
                        analyser = audioContext.createAnalyser();
                        gainNode = audioContext.createGain();
                        
                        const source = audioContext.createMediaStreamSource(monStream);
                        source.connect(gainNode);
                        gainNode.connect(analyser);
                        
                        analyser.fftSize = 256;
                        const bufferLength = analyser.frequencyBinCount;
                        const dataArray = new Uint8Array(bufferLength);
                        
                        const slider = document.getElementById('volume-slider');
                        slider.oninput = function() {
                            if(!estMute && gainNode) gainNode.gain.value = this.value;
                        };

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

                        // Actualisation en boucle de la distance audio (3D Proximity)
                        setInterval(calculerDistancesAudio, 500);

                    } catch(err) {
                        alert("Erreur micro : Vérifie les autorisations.");
                        console.error(err);
                    }
                }

                // Quand un autre joueur rejoint le vocal, on ouvre le tunnel de communication
                socket.on('joueur-rejoint', async (idDistant) => {
                    if (idDistant === monId) return;
                    creerLiaisonPeer(idDistant, true);
                });

                // Réception des signaux de configuration réseau
                socket.on('relais-signal', async (data) => {
                    if (data.cible !== monId) return;
                    
                    if (!connexionsPairs[data.emetteur]) {
                        creerLiaisonPeer(data.emetteur, false);
                    }
                    
                    await connexionsPairs[data.emetteur].setRemoteDescription(new RTCSessionDescription(data.signal));
                    if (data.signal.type === 'offer') {
                        const answer = await connexionsPairs[data.emetteur].createAnswer();
                        await connexionsPairs[data.emetteur].setLocalDescription(answer);
                        socket.emit('signal-audio', { cible: data.emetteur, signal: answer });
                    }
                });

                function creerLiaisonPeer(idDistant, initierOffre) {
                    const peer = new RTCPeerConnection(configurationPeer);
                    connexionsPairs[idDistant] = peer;

                    monStream.getTracks().forEach(track => peer.addTrack(track, monStream));

                    peer.onicecandidate = (event) => {
                        if (event.candidate) {
                            // Pas besoin de forcer les candidats ICE séparément avec cette architecture simplifiée
                        }
                    };

                    // Quand on reçoit la voix de l'autre joueur
                    peer.ontrack = (event) => {
                        if (noeudsGainDistants[idDistant]) return; // Déjà configuré

                        const fluxDistant = event.streams[0];
                        
                        // Création du système audio spatialisé pour ce joueur précis
                        const ctx = audioContext;
                        const sourceDistante = ctx.createMediaStreamSource(fluxDistant);
                        const gainDistant = ctx.createGain();
                        
                        gainDistant.gain.value = 0; // Muet par défaut tant qu'on ne connaît pas sa position
                        
                        sourceDistante.connect(gainDistant);
                        gainDistant.connect(ctx.destination); // Envoi dans tes haut-parleurs/écouteurs
                        
                        noeudsGainDistants[idDistant] = gainDistant;
                    };

                    if (initierOffre) {
                        peer.onnegotiationneeded = async () => {
                            const offer = await peer.createOffer();
                            await peer.setLocalDescription(offer);
                            socket.emit('signal-audio', { cible: idDistant, signal: offer });
                        };
                    }
                }

                // Fonction magique qui calcule la distance et ajuste le volume en direct
                async function calculerDistancesAudio() {
                    if (!monId || !audioContext) return;

                    try {
                        // Demande la liste des positions au serveur
                        const response = await fetch('/update-positions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ userId: monId, x: 0, y: 0, z: 0 }) // Demande passive
                        });
                        const data = await response.json();
                        
                        if (!data.positions || !data.positions[monId]) return;
                        
                        const maPos = data.positions[monId];

                        // Pour chaque joueur dont on reçoit la voix
                        Object.keys(noeudsGainDistants).forEach(idDistant => {
                            const posAutre = data.positions[idDistant];
                            
                            if (posAutre && posAutre.robloxActive) {
                                // Formule mathématique de distance 3D (Pythagore)
                                const dx = maPos.x - posAutre.x;
                                const dy = maPos.y - posAutre.y;
                                const dz = maPos.z - posAutre.z;
                                const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);

                                if (distance <= ${DISTANCE_MAX_ENTENDRE}) {
                                    // Plus il est proche, plus le volume est fort (Linear Rolloff)
                                    let volumeCalculé = 1 - (distance / ${DISTANCE_MAX_ENTENDRE});
                                    noeudsGainDistants[idDistant].gain.setTargetAtTime(volumeCalculé, audioContext.currentTime, 0.1);
                                } else {
                                    // Trop loin -> Muet
                                    noeudsGainDistants[idDistant].gain.setTargetAtTime(0, audioContext.currentTime, 0.1);
                                }
                            } else {
                                // Pas sur Roblox -> Muet
                                noeudsGainDistants[idDistant].gain.setTargetAtTime(0, audioContext.currentTime, 0.1);
                            }
                        });

                    } catch (e) {
                        console.error("Erreur calcul distance audio:", e);
                    }
                }

                function toggleMute() {
                    if(!monStream || !gainNode) return;
                    estMute = !estMute;
                    monStream.getAudioTracks().forEach(track => track.enabled = !estMute);
                    
                    const btn = document.getElementById('btn-mute');
                    if(estMute) {
                        gainNode.gain.value = 0;
                        btn.innerText = "Démuter";
                        btn.style.background = "#00ff64";
                        document.getElementById('statut').innerText = "⏸️ Micro coupé (Mute)";
                        document.getElementById('statut').style.color = "#ff4141";
                    } else {
                        gainNode.gain.value = document.getElementById('volume-slider').value;
                        btn.innerText = "Muter";
                        btn.style.background = "#ff9d00";
                        document.getElementById('statut').innerText = "🔴 Connexion active ! Laisse cet onglet ouvert.";
                        document.getElementById('statut').style.color = "#00ff64";
                    }
                    socket.emit('toggle-mute', estMute);
                }

                function couperConnexion() {
                    socket.emit('leave-voice');
                    estMute = false;
                    
                    Object.keys(connexionsPairs).forEach(id => {
                        connexionsPairs[id].close();
                    });
                    connexionsPairs = {};
                    noeudsGainDistants = {};

                    if (monStream) {
                        monStream.getTracks().forEach(track => track.stop());
                        monStream = null;
                    }
                    if (audioContext) audioContext.close();
                    
                    document.getElementById('barre-volume').style.width = "0%";
                    document.getElementById('statut-container').style.display = 'none';
                    document.getElementById('formulaire').style.display = 'block';
                    
                    const btn = document.getElementById('btn-mute');
                    btn.innerText = "Muter";
                    btn.style.background = "#ff9d00";
                    document.getElementById('statut').innerText = "🔴 Connexion active ! Laisse cet onglet ouvert.";
                    document.getElementById('statut').style.color = "#00ff64";
                }
            </script>
        </body>
        </html>
    `);
});

server.listen(PORT, () => console.log(`Serveur actif sur le port ${PORT}`));
