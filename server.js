const CLIENT_ID = '7083652784926961699';
const CLIENT_SECRET = 'RBX-B81Sg0QjC0uTebnvmmpFBZ2FCASj9dsPLlJDBf8KJL7ULICcVIkxz31aojvd_EF5'; // Mets ton secret ici
const REDIRECT_URI = 'https://jegger-voice-proximity.onrender.com//callback'; // Remplace par ton URL Render

app.get('/auth/roblox', (req, res) => {
    const authUrl = `https://apis.roblox.com/oauth/v1/authorize?client_id=${CLIENT_ID}&response_type=code&scope=openid+profile&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=xyz`;
    res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
    const { code } = req.query;
    
    // 1. Échanger le code contre un token
    const tokenResponse = await fetch('https://apis.roblox.com/oauth/v1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=authorization_code&code=${code}`
    });
    const tokens = await tokenResponse.json();

    // 2. Récupérer l'ID du joueur avec le token
    const userResponse = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` }
    });
    const userInfo = await userResponse.json();

    // 3. Rediriger vers ton site avec l'ID dans l'URL pour la connexion
    res.redirect(`/?id=${userInfo.sub}`);
});
