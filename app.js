// --- Configuration ---
const STORAGE_KEY = 'groq_api_key';
const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

// Supabase Config
const SUPABASE_URL = "https://hedimvodzdzwnluekmtd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlZGltdm9kemR6d25sdWVrbXRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NjM3NTMsImV4cCI6MjA4NjMzOTc1M30.OJe37omxb53GnD0uohQ6tfxZPM48daH_sO1YR4SPHCw";
const supabaseClient = (typeof supabase !== 'undefined') ? supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// --- Elements ---
const modeBtns = document.querySelectorAll('.mode-btn');
const cameraInput = document.getElementById('camera-input');
const galleryInput = document.getElementById('gallery-input');
const preview = document.getElementById('preview');
const analyzeBtn = document.getElementById('analyze-btn');
const resultsArea = document.getElementById('results');
const dropZone = document.getElementById('drop-zone');

// Modes Results Areas
const cuisineResults = document.getElementById('cuisine-results');
const budgetResults = document.getElementById('budget-results');

// Modal Elements
const settingsModal = document.getElementById('settings-modal');
const openSettings = document.getElementById('open-settings');
const closeSettings = document.getElementById('close-modal-x');
const apiKeyInput = document.getElementById('api-key-input');
const saveKeyBtn = document.getElementById('save-key');

// --- State ---
let currentMode = 'auto';
let selectedImageBase64 = null;
let sessionApiKey = null;
let currentPseudo = localStorage.getItem('user_pseudo') || null;
let lastRawResponse = null;
const HISTORY_KEY = 'assistant_history';

// --- Auth Utils ---
async function hashPassword(password, pseudo) {
    if (!password) return "";
    const p = pseudo || "";
    const salt = "pingpong_smash_secure_v1_"; // Même sel que pingpong pour compatibilité
    const msgUint8 = new TextEncoder().encode(password + salt + p.toLowerCase());
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// --- Storage Helpers ---
function getApiKey() {
    try { return localStorage.getItem(STORAGE_KEY) || sessionApiKey; }
    catch (e) { return sessionApiKey; }
}
function setApiKey(key) {
    sessionApiKey = key;
    try { localStorage.setItem(STORAGE_KEY, key); } catch (e) {}
}

// --- Init ---
window.onload = () => {
    const savedKey = getApiKey();
    if (savedKey) apiKeyInput.value = savedKey;
    initAuth();
    renderHistory();
    loadChatHistory();
    loadCustomBackground();
    initTheme();
};

// --- Logic ---

// --- Navigation Hub ---
const hubView = document.getElementById('hub-view');
const categoriesView = document.getElementById('categories-view');
const backToHub = document.getElementById('back-to-hub');
const hubCards = document.querySelectorAll('.hub-card');
const categoryBlocks = document.querySelectorAll('.category-block');
const mainCard = document.querySelector('.main-card');

// Masquer le cadre d'analyse par défaut au chargement (puisqu'on commence sur le hub)
if (mainCard) mainCard.style.display = 'none';

hubCards.forEach(card => {
    card.addEventListener('click', () => {
        const cat = card.dataset.cat;
        
        // Cacher le hub, afficher la vue catégories et le cadre d'analyse
        hubView.style.display = 'none';
        categoriesView.style.display = 'flex';
        if (mainCard) mainCard.style.display = 'block';
        
        // Cacher tous les blocs, afficher celui sélectionné
        categoryBlocks.forEach(block => block.style.display = 'none');
        document.getElementById(`cat-${cat}`).style.display = 'block';
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
});

backToHub.addEventListener('click', () => {
    hubView.style.display = 'grid';
    categoriesView.style.display = 'none';
    if (mainCard) mainCard.style.display = 'none';
    resultsArea.style.display = 'none'; // Optionnel: cacher les résultats au retour
});

// Switch Mode
modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.dataset.mode;
        
        // S'assurer que le cadre est visible (utile si on change de mode)
        if (mainCard) mainCard.style.display = 'block';

        // Cacher les résultats précédents
        resultsArea.style.display = 'none';
        
        // Gestion de l'affichage selon le mode
        if (currentMode === 'chat' || currentMode === 'alarm') {
            dropZone.style.display = 'none';
            analyzeBtn.style.display = 'none';
            // Affichage immédiat pour ces modes
            displayResults({}); 
        } else {
            dropZone.style.display = 'flex';
            analyzeBtn.style.display = 'block';
        }

        // Scroll vers la zone d'action (Main Card) pour faciliter l'usage sur mobile
        if (mainCard) {
            mainCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        
        console.log("Mode actuel:", currentMode);
    });
});

// Logic
const handleImage = async (e) => {
    const file = e.target.files[0];
    if (file) {
        setLoading(true, "Traitement...");
        try {
            selectedImageBase64 = await compressImage(file);
            preview.src = selectedImageBase64;
            preview.style.display = 'block';
            dropZone.classList.add('has-image');
            analyzeBtn.disabled = false;
        } catch (err) {
            alert("Erreur d'image");
        } finally {
            setLoading(false);
        }
    }
};

cameraInput.addEventListener('change', handleImage);
galleryInput.addEventListener('change', handleImage);

function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX = 1000;
                if (width > height && width > MAX) {
                    height *= MAX / width;
                    width = MAX;
                } else if (height > MAX) {
                    width *= MAX / height;
                    height = MAX;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Analyze
analyzeBtn.addEventListener('click', async () => {
    const apiKey = getApiKey();
    if (!apiKey) {
        alert("Veuillez configurer votre clé API dans les paramètres (icône engrenage).");
        return;
    }

    setLoading(true);
    resultsArea.style.display = 'none';

    try {
        const response = await callGroq(apiKey, selectedImageBase64);
        displayResults(response);
    } catch (error) {
        alert("Erreur : " + error.message);
    } finally {
        setLoading(false);
    }
});

// Settings Logic
openSettings.addEventListener('click', () => settingsModal.style.display = 'flex');

// Fonction pour fermer la modale
const closeModal = () => settingsModal.style.display = 'none';

if (closeSettings) closeSettings.addEventListener('click', closeModal);
const bottomCloseBtn = document.getElementById('close-modal');
if (bottomCloseBtn) bottomCloseBtn.addEventListener('click', closeModal);

document.getElementById('close-results').addEventListener('click', () => resultsArea.style.display = 'none');


saveKeyBtn.addEventListener('click', () => {
    setApiKey(apiKeyInput.value.trim());
    settingsModal.style.display = 'none';
});

// --- Auth Logic ---
function initAuth() {
    if (currentPseudo) {
        updateAuthUI(true, currentPseudo);
    }
}

async function handleLogin() {
    const pseudo = document.getElementById('pseudo-input').value.trim();
    const password = document.getElementById('password-input').value.trim();
    const errorEl = document.getElementById('auth-error');
    const loginBtn = document.getElementById('login-btn');

    if (!pseudo || !password) {
        errorEl.textContent = "Pseudo et mot de passe requis";
        errorEl.style.display = 'block';
        return;
    }

    errorEl.style.display = 'none';
    loginBtn.disabled = true;
    loginBtn.textContent = "Vérification...";

    try {
        const hash = await hashPassword(password, pseudo);
        
        // 1. Chercher le profil existant
        let { data: profile, error } = await supabaseClient
            .from('profils_arcade')
            .select('*')
            .eq('pseudo', pseudo)
            .maybeSingle();

        if (profile) {
            // Vérifier le mot de passe
            if (profile.password_hash === hash) {
                loginSuccess(pseudo, profile.avatar_url);
            } else {
                throw new Error("Mot de passe incorrect");
            }
        } else {
            // Créer un nouveau compte
            const avatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${pseudo}`;
            const { error: insError } = await supabaseClient
                .from('profils_arcade')
                .insert([{ pseudo, password_hash: hash, avatar_url: avatarUrl }]);
            
            if (insError) throw insError;
            loginSuccess(pseudo, avatarUrl);
        }
    } catch (e) {
        errorEl.textContent = e.message;
        errorEl.style.display = 'block';
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = "Se connecter / S'inscrire";
    }
}

function loginSuccess(pseudo, avatar) {
    currentPseudo = pseudo;
    localStorage.setItem('user_pseudo', pseudo);
    if (avatar) localStorage.setItem('user_avatar', avatar);
    updateAuthUI(true, pseudo, avatar);
    renderHistory(); // Recharger l'historique du nouvel utilisateur
}

function handleLogout() {
    currentPseudo = null;
    localStorage.removeItem('user_pseudo');
    localStorage.removeItem('user_avatar');
    updateAuthUI(false);
    renderHistory();
}

function updateAuthUI(isLoggedIn, pseudo = "", avatar = "") {
    const loginView = document.getElementById('login-view');
    const loggedView = document.getElementById('logged-view');
    const userBadge = document.getElementById('user-badge');
    const userName = document.getElementById('user-name');
    const userAvatar = document.getElementById('user-avatar');
    const loggedPseudo = document.getElementById('logged-pseudo');
    
    // Nettoyage des badges précédents
    const existingBadge = document.getElementById('god-badge');
    if (existingBadge) existingBadge.remove();

    if (isLoggedIn) {
        loginView.style.display = 'none';
        loggedView.style.display = 'block';
        userBadge.style.display = 'flex';
        userName.textContent = pseudo;
        loggedPseudo.textContent = pseudo;

        // Activation du GOD MODE pour "portable"
        if (pseudo.toLowerCase() === 'portable') {
            const badge = document.createElement('span');
            badge.id = 'god-badge';
            badge.textContent = '🤖 GOD MODE';
            badge.style.cssText = 'color: #f59e0b; font-size: 0.65rem; font-weight: 800; margin-left: 5px;';
            userBadge.appendChild(badge);
            
            // Ajouter le bouton voir le code secret dans la vue connectée
            if (!document.getElementById('view-secret-btn')) {
                const secretBtn = document.createElement('button');
                secretBtn.id = 'view-secret-btn';
                secretBtn.className = 'btn-secondary';
                secretBtn.style.marginTop = '10px';
                secretBtn.innerHTML = '<i data-lucide="key"></i> Voir le code secret';
                loggedView.insertBefore(secretBtn, document.getElementById('logout-btn'));
                if (typeof lucide !== 'undefined') lucide.createIcons();
                
                secretBtn.onclick = () => alert("🤫 Ton code secret est : tetris");
            }
        }
        const savedAvatar = avatar || localStorage.getItem('user_avatar');
        if (savedAvatar) userAvatar.src = savedAvatar;
    } else {
        loginView.style.display = 'block';
        loggedView.style.display = 'none';
        userBadge.style.display = 'none';
    }
}

document.getElementById('login-btn').addEventListener('click', handleLogin);
document.getElementById('logout-btn').addEventListener('click', handleLogout);

// Toggle visibilité mot de passe
document.getElementById('toggle-password').addEventListener('click', () => {
    const passInput = document.getElementById('password-input');
    const toggleBtn = document.getElementById('toggle-password');
    // Lucide remplace le <i> par un <svg>, on cherche donc l'un ou l'autre
    const icon = toggleBtn.querySelector('i, svg');
    
    if (passInput.type === 'password') {
        passInput.type = 'text';
        if (icon) icon.setAttribute('data-lucide', 'eye-off');
    } else {
        passInput.type = 'password';
        if (icon) icon.setAttribute('data-lucide', 'eye');
    }
    if (typeof lucide !== 'undefined') lucide.createIcons();
});

// --- Theme Logic ---
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeUI(savedTheme);
}

document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeUI(next);
});

function updateThemeUI(theme) {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const span = btn.querySelector('span');
    const icon = btn.querySelector('i, svg'); // Cherche l'icône ou le SVG généré par Lucide
    
    if (theme === 'light') {
        if (span) span.textContent = "Thème Clair";
        if (icon) icon.setAttribute('data-lucide', 'sun');
    } else {
        if (span) span.textContent = "Thème Sombre";
        if (icon) icon.setAttribute('data-lucide', 'moon');
    }
    if (window.lucide) lucide.createIcons();
}


document.getElementById('bg-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        const base64 = await compressImage(file);
        localStorage.setItem('custom_bg', base64);
        applyBackground(base64);
    }
});

function applyBackground(base64) {
    document.body.style.backgroundImage = `linear-gradient(var(--bg-overlay), var(--bg-overlay)), url(${base64})`;
}

function loadCustomBackground() {
    const savedBg = localStorage.getItem('custom_bg');
    if (savedBg) applyBackground(savedBg);
}

// --- Functions ---

function setLoading(isLoading, text = "Analyse...") {
    analyzeBtn.disabled = isLoading;
    const btnText = document.getElementById('btn-text');
    if (btnText) {
        btnText.innerHTML = isLoading ? `<span class="spinner"></span> ${text}` : "Analyser";
    }
}

async function callGroq(apiKey, base64Image) {
    const base64Data = base64Image.split(',')[1];
    
    let prompt = "";
    if (currentMode === 'auto') {
        prompt = `Analyse cette image sans contexte préalable. 
        1. Identifie ce que c'est de façon précise. 
        2. Donne les informations les plus utiles selon l'objet (recette si nourriture, calcul si maths, conseils si objet, mode si vêtement, etc.).
        Réponds UNIQUEMENT au format JSON :
        {"title": "Analyse Magique", "content": "### Objet détecté : ... ### Détails..."}`;
    } else if (currentMode === 'musique') {
        prompt = `Analyse cette photo liée à la musique (partition, paroles, instrument). 
        1. Si c'est une partition : explique la tonalité et les premières notes. 
        2. Si c'est des paroles : traduis-les et explique le sens. 
        3. Si c'est un instrument : donne 3 conseils pour débutant.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Assistant Musique", "content": "### Analyse... ### Conseils..."}`;
    } else if (currentMode === 'cuisine') {
        prompt = `Analyse cette photo de nourriture. Liste les ingrédients principaux et propose 3 recettes simples (Titre + Étapes). 
        Réponds UNIQUEMENT au format JSON : 
        {"ingredients": ["..."], "recipes": [{"title": "...", "steps": "..."}]}`;
    } else if (currentMode === 'jardinier') {
        prompt = `Analyse cette plante. Identifie l'espèce, son état de santé et donne 3 conseils d'entretien (arrosage, lumière, rempotage).
        Réponds UNIQUEMENT au format JSON :
        {"title": "Expert Jardinage", "content": "### Plante : ... ### État : ... ### Conseils : ..."}`;
    } else if (currentMode === 'budget') {
        prompt = `Analyse ce ticket de caisse. Extrait le marchand, la date, le total et les articles.
        Réponds UNIQUEMENT au format JSON :
        {"merchant": "...", "date": "...", "total": "...", "currency": "€", "items": [{"name": "...", "price": "..."}]}`;
    } else if (currentMode === 'minecraft') {
        prompt = `Analyse cette photo. Donne les instructions pour la reproduire dans Minecraft : 
        1. Liste des blocs nécessaires. 
        2. Plan de construction étape par étape.
        3. Astuces de décoration.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Projet Minecraft", "content": "### Matériaux... ### Étapes..."}`;
    } else if (currentMode === 'etudes') {
        prompt = `Analyse cet exercice. Explique la méthode de résolution sans donner la réponse finale.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Aide aux Études", "content": "### Concept... ### Méthode..."}`;
    } else if (currentMode === 'dev') {
        prompt = `Analyse ce code. Transcris-le et propose des corrections ou explications.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Analyse de Code", "content": "### Code... ### Explications..."}`;
    } else if (currentMode === 'style') {
        prompt = `Analyse ce look. Donne un avis sur les couleurs et suggère des accessoires.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Conseils Style", "content": "### Analyse... ### Suggestions..."}`;
    } else if (currentMode === 'puzzles') {
        prompt = `Analyse ce puzzle (Sudoku, jeu, etc.). Donne le prochain coup ou la solution.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Solution Puzzle", "content": "### Analyse... ### Solution..."}`;
    } else if (currentMode === 'humeur') {
        prompt = `Analyse cette photo de visage. Détermine l'humeur dominante (joyeux, triste, neutre, etc.). Suggère un genre musical et un conseil positif.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Analyse Humeur", "content": "### Humeur détectée... ### Conseil..."}`;
    } else if (currentMode === 'art') {
        prompt = `Analyse ce dessin ou cette œuvre. Décris le style et le sujet de façon poétique. Donne 3 conseils pour l'améliorer.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Analyse Artistique", "content": "### Style... ### Conseils..."}`;
    } else if (currentMode === 'insectes') {
        prompt = `Analyse cette photo d'insecte. Identifie-le. Précise s'il est inoffensif ou utile. Donne une anecdote intéressante.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Expert Insectes", "content": "### Espèce... ### Utilité... ### Anecdote..."}`;
    } else if (currentMode === 'histoires') {
        prompt = `Analyse cet objet ou ce lieu. Invente une mini-histoire fantastique courte dont cet élément est le héros.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Histoire Instantanée", "content": "### L'histoire..."}`;
    } else if (currentMode === 'jdr') {
        prompt = `Analyse cette figurine ou ce personnage. Crée une fiche de personnage RPG : Nom, PV, Force, Magie et une capacité.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Fiche JDR", "content": "### Statistiques... ### Histoire..."}`;
    } else if (currentMode === 'nutrition') {
        prompt = `Analyse ce plat ou cet aliment. Donne les bienfaits nutritionnels et une astuce santé.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Coach Nutrition", "content": "### Bienfaits... ### Astuce..."}`;
    } else if (currentMode === 'quiz') {
        prompt = `Analyse ce document ou ce texte. Génère un quiz de 5 questions pour tester la compréhension.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Quiz Rapide", "content": "### Questions..."}`;
    } else if (currentMode === 'notes') {
        prompt = `Analyse cette liste ou ces notes. Extrais les éléments sous forme de liste de tâches.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Ma Liste", "items": ["...", "..."]}`;
    } else if (currentMode === 'tri') {
        prompt = `Analyse cet objet ou emballage. Dis dans quelle poubelle (Jaune, Vert, Gris, Déchetterie) il doit aller.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Guide de Tri", "content": "### Poubelle... ### Pourquoi..."}`;
    } else if (currentMode === 'taches') {
        prompt = `Analyse cette tache sur un tissu. Identifie-la et donne une astuce pour l'enlever.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Expert Anti-Taches", "content": "### Tache... ### Solution..."}`;
    } else if (currentMode === 'sante') {
        prompt = `Analyse cette boîte de médicament. Résume son usage et donne les précautions majeures. Ajoute 'Demandez à un médecin'.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Mémo Santé", "content": "### Usage... ### Précautions..."}`;
    } else if (currentMode === 'energie') {
        prompt = `Analyse cette pièce ou appareil. Donne un conseil concret pour économiser de l'énergie ici.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Éco-Conseil", "content": "### Astuce..."}`;
    } else if (currentMode === 'traduction') {
        prompt = `Analyse le texte présent sur cette image. 
        1. Transcris le texte original. 
        2. Traduis-le en Français de façon naturelle. 
        3. Explique brièvement le contexte ou des points culturels si nécessaire.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Traducteur Visuel", "content": "### Texte Original... ### Traduction... ### Notes..."}`;
    } else if (currentMode === 'qr') {
        prompt = `Analyse ce QR Code ou code-barres. 
        1. Décode le contenu (URL, texte, etc.). 
        2. Si c'est une URL, explique où elle mène. 
        3. Donne un conseil de sécurité ou une description de ce que l'utilisateur va trouver.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Lecteur Intelligent", "content": "### Contenu détecté... ### Analyse... ### Conseil..."}`;
    } else if (currentMode === 'monuments') {
        prompt = `Analyse cette photo de monument ou lieu historique. Identifie-le et raconte son histoire de façon intéressante.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Guide Touristique", "content": "### Monument... ### Histoire..."}`;
    } else if (currentMode === 'alarm') {
        // Le mode alarme est géré par l'interface spéciale
        return;
    }

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [{
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
                ]
            }],
            response_format: { type: "json_object" }
        })
    });

    if (!res.ok) throw new Error("API Groq Erreur");
    const data = await res.json();
    return JSON.parse(data.choices[0].message.content);
}

function displayResults(data, skipSave = false) {
    console.log("Données reçues de l'IA:", data); // Debug
    lastRawResponse = data;
    const rawCode = document.getElementById('raw-code');
    if (rawCode) rawCode.textContent = JSON.stringify(data, null, 2);
    
    // Masquer la vue code au début d'un nouveau résultat
    document.getElementById('code-display').style.display = 'none';
    
    resultsArea.style.display = 'block';
    cuisineResults.style.display = 'none';
    budgetResults.style.display = 'none';
    document.getElementById('notes-results').style.display = 'none';
    document.getElementById('alarm-results').style.display = 'none';
    document.getElementById('chat-results').style.display = 'none';
    const genericArea = document.getElementById('generic-results');
    genericArea.style.display = 'none';

    if (currentMode === 'notes' && data.items) {
        const area = document.getElementById('notes-results');
        area.style.display = 'block';
        const container = document.getElementById('checklist-container');
        container.innerHTML = data.items.map(item => `
            <div class="check-item" onclick="this.classList.toggle('done'); this.querySelector('input').checked = !this.querySelector('input').checked;">
                <input type="checkbox">
                <span>${item}</span>
            </div>
        `).join('');
    } else if (currentMode === 'cuisine') {
        cuisineResults.style.display = 'block';
        document.getElementById('found-ingredients').textContent = "Ingrédients : " + (data.ingredients ? data.ingredients.join(', ') : "Non détectés");
        const list = document.getElementById('recipes-list');
        list.innerHTML = "";
        if (data.recipes) {
            data.recipes.forEach(r => {
                const card = document.createElement('div');
                card.className = 'recipe-card';
                card.innerHTML = `<h3>${r.title || "Recette"}</h3><p>${r.steps || ""}</p>`;
                list.appendChild(card);
            });
        }
    } else if (currentMode === 'budget') {
        budgetResults.style.display = 'block';
        document.getElementById('merchant-name').textContent = data.merchant || "Marchand inconnu";
        document.getElementById('total-price').textContent = (data.total || "0") + (data.currency || "€");
        document.getElementById('ticket-date').textContent = data.date || "Date inconnue";
        const list = document.getElementById('items-list');
        list.innerHTML = "";
        if (data.items) {
            data.items.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${item.name || "Article"}</td><td style="text-align: right;">${item.price || ""}${data.currency || ""}</td>`;
                list.appendChild(tr);
            });
        }
    } else if (currentMode === 'alarm') {
        document.getElementById('alarm-results').style.display = 'block';
        dropZone.style.display = 'none';
        analyzeBtn.style.display = 'none';
    } else if (currentMode === 'chat') {
        document.getElementById('chat-results').style.display = 'block';
        dropZone.style.display = 'none';
        analyzeBtn.style.display = 'none';
    } else {
        dropZone.style.display = 'flex';
        analyzeBtn.style.display = 'block';
        genericArea.style.display = 'block';
        // Fallback si les clés sont légèrement différentes
        const title = data.title || data.nom || data.sujet || "Analyse terminée";
        let content = data.content || data.description || data.guide || data.instructions || data;
        
        // Fonction récursive pour transformer n'importe quel objet en texte lisible
        function formatRecursive(obj, level = 3) {
            if (typeof obj !== 'object' || obj === null) return obj;
            if (Array.isArray(obj)) return obj.map(item => formatRecursive(item, level)).join('\n');
            
            return Object.entries(obj).map(([key, value]) => {
                const header = "#".repeat(level) + " " + key;
                const body = typeof value === 'object' ? formatRecursive(value, level + 1) : value;
                return `${header}\n${body}`;
            }).join('\n\n');
        }

        const formattedContent = formatRecursive(content)
            .replace(/\n/g, '<br>')
            .replace(/###+ (.*)/g, '<h3>$1</h3>'); // Transforme les niveaux de # en titres
            
        document.getElementById('generic-title').textContent = title;
        document.getElementById('generic-content').innerHTML = formattedContent;
    }
    
    
    // Sauvegarder dans l'historique (sauf pour alarme, chat ou si on vient déjà de l'historique)
    if (!skipSave && currentMode !== 'alarm' && currentMode !== 'chat') {
        saveToHistory(currentMode, data, selectedImageBase64);
    }

    resultsArea.scrollIntoView({ behavior: 'smooth' });
}

// --- Système d'Historique ---

async function saveToHistory(mode, data, fullImage) {
    // Créer une miniature pour économiser le localStorage (max 5MB total)
    const thumbnail = await createThumbnail(fullImage, 100);
    
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const title = data.title || (data.merchant ? "Ticket: " + data.merchant : null) || (data.ingredients ? "Cuisine: " + data.ingredients[0] : "Analyse");
    
    const entry = {
        date: new Date().toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
        mode: mode,
        title: title,
        data: data,
        image: thumbnail,
        user_pseudo: currentPseudo // Lier au pseudo si connecté
    };

    // Sauvegarde Locale (Fallback)
    history.unshift(entry);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 10)));

    // Sauvegarde Supabase
    if (supabaseClient) {
        try {
            await supabaseClient.from('assistant_history').insert([entry]);
            console.log("Sauvegarde Supabase réussie");
        } catch (e) {
            console.error("Erreur Supabase:", e);
        }
    }
    
    renderHistory();
}

function createThumbnail(base64, size) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, size, size);
            resolve(canvas.toDataURL('image/jpeg', 0.5));
        };
        img.src = base64;
    });
}

async function renderHistory() {
    const list = document.getElementById('history-list');
    let history = [];

    // Priorité Supabase
    if (supabaseClient) {
        try {
            let query = supabaseClient
                .from('assistant_history')
                .select('*');
            
            // Filtrer par utilisateur si connecté, sinon public ou vide
            if (currentPseudo) {
                query = query.eq('user_pseudo', currentPseudo);
            } else {
                query = query.is('user_pseudo', null);
            }

            const { data, error } = await query
                .order('created_at', { ascending: false })
                .limit(10);
            
            if (!error && data) {
                history = data;
            }
        } catch (e) {
            console.warn("Impossible de charger Supabase, repli sur local.");
        }
    }

    // Fallback Local si Supabase vide ou échoue
    if (history.length === 0) {
        history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    }
    
    if (history.length === 0) {
        list.innerHTML = "<p style='opacity:0.5; text-align:center;'>Aucun historique</p>";
        return;
    }

    list.innerHTML = history.map(item => `
        <div class="history-item" onclick="loadHistoryItemOnline('${item.id || ""}', ${JSON.stringify(item.data).replace(/"/g, '&quot;')}, '${item.image}', '${item.mode}')">
            <img src="${item.image}" class="history-img">
            <div class="history-info">
                <span class="history-title">${item.title}</span>
                <span class="history-date">${item.date || new Date(item.created_at).toLocaleString()}</span>
            </div>
            <span class="history-badge">${item.mode}</span>
        </div>
    `).join('');
}

// Nouvelle fonction pour charger un item (gestion ID ou objet direct)
window.loadHistoryItemOnline = (id, data, image, mode) => {
    currentMode = mode;
    modeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === currentMode));
    
    displayResults(data, true); // true = skipSave
    preview.src = image;
    preview.style.display = 'block';
    dropZone.classList.add('has-image');
    if (mainCard) mainCard.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

document.getElementById('show-history').addEventListener('click', () => {
    const panel = document.getElementById('history-panel');
    const isHidden = panel.style.display === 'none';
    panel.style.display = isHidden ? 'block' : 'none';
    if (isHidden) panel.scrollIntoView({ behavior: 'smooth' });
});

// --- Reconnaissance Vocale ---
const voiceBtn = document.getElementById('voice-btn');
const recognition = window.SpeechRecognition || window.webkitSpeechRecognition ? new (window.SpeechRecognition || window.webkitSpeechRecognition)() : null;

if (recognition) {
    recognition.lang = 'fr-FR';
    recognition.continuous = false;

    voiceBtn.addEventListener('click', () => {
        if (voiceBtn.classList.contains('recording')) {
            recognition.stop();
        } else {
            recognition.start();
            voiceBtn.classList.add('recording');
        }
    });

    recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        voiceBtn.classList.remove('recording');
        
        // On bascule automatiquement sur le chat
        currentMode = 'chat';
        modeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === 'chat'));
        document.getElementById('chat-results').style.display = 'block';
        resultsArea.style.display = 'block';
        
        addChatMessage('user', transcript);
        const reply = await getAiReply(transcript);
        addChatMessage('ai', reply);
        speak(reply);
    };

    recognition.onerror = () => voiceBtn.classList.remove('recording');
    recognition.onend = () => voiceBtn.classList.remove('recording');
} else {
    voiceBtn.style.display = 'none';
}

async function getAiReply(text) {
    const apiKey = getApiKey();
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: "system", content: "Tu es un assistant vocal intelligent et chaleureux." },
                    { role: "user", content: text }
                ]
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) {
        return "Désolé, je n'ai pas pu traiter ta demande.";
    }
}

// --- Système de Réveil & Chat ---
let alarmTime = null;
let alarmInterval = null;

document.getElementById('set-alarm').addEventListener('click', () => {
    alarmTime = document.getElementById('alarm-time').value;
    if (!alarmTime) return alert("Choisis une heure !");
    
    document.getElementById('alarm-status').textContent = `Réveil réglé pour ${alarmTime}`;
    if (alarmInterval) clearInterval(alarmInterval);
    
    alarmInterval = setInterval(() => {
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        if (currentTime === alarmTime) {
            clearInterval(alarmInterval);
            triggerAlarm();
        }
    }, 1000);
});

async function triggerAlarm() {
    // On bascule automatiquement sur le chat pour le réveil
    currentMode = 'chat';
    modeBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.mode === 'chat') btn.classList.add('active');
    });
    
    // On affiche la zone de chat
    document.getElementById('alarm-results').style.display = 'none';
    document.getElementById('chat-results').style.display = 'block';
    resultsArea.style.display = 'block';
    
    const msg = "Bonjour ! C'est l'heure de se réveiller ! Comment tu te sens ce matin ?";
    addChatMessage('ai', msg);
    speak(msg);
}

function addChatMessage(role, text, skipSave = false) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    
    const div = document.createElement('div');
    div.className = `message msg-${role}`;
    div.textContent = text;
    container.appendChild(div);
    
    if (!skipSave) saveChatHistory(role, text);
    
    container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth'
    });
}

function saveChatHistory(role, text) {
    let chatHistory = JSON.parse(localStorage.getItem('chat_history') || '[]');
    chatHistory.push({ role, text, date: new Date().toISOString() });
    localStorage.setItem('chat_history', JSON.stringify(chatHistory.slice(-50)));
}

function loadChatHistory() {
    let chatHistory = JSON.parse(localStorage.getItem('chat_history') || '[]');
    chatHistory.forEach(msg => addChatMessage(msg.role, msg.text, true));
}

document.getElementById('download-chat')?.addEventListener('click', () => {
    const chatHistory = JSON.parse(localStorage.getItem('chat_history') || '[]');
    if (chatHistory.length === 0) return alert("Rien à télécharger !");

    let text = "--- DISCUSSION AVEC SUPER ASSISTANT IA ---\n\n";
    chatHistory.forEach(msg => {
        const name = msg.role === 'user' ? "MOI" : "IA";
        text += `[${new Date(msg.date).toLocaleString()}] ${name}: ${msg.text}\n\n`;
    });

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `discussion_assistant_${new Date().toLocaleDateString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
});


function speak(text, articulate = false) {
    if (!text) return;
    
    // Nettoyage du texte pour la synthèse vocale (enlever les astérisques, les dièses, etc.)
    let cleanText = text
        .replace(/[*#_]/g, '') // Enlever *, #, _
        .replace(/\[.*?\]/g, '') // Enlever les liens markdown [texte]
        .replace(/\(.*?\)/g, '') // Enlever les parenthèses (souvent du markdown)
        .replace(/:.*?:/g, '') // Enlever les emojis en format :emoji:
        .trim();

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'fr-FR';
    utterance.rate = articulate ? 0.9 : 1.0;
    utterance.pitch = 1.1;
    
    const voices = window.speechSynthesis.getVoices();
    const femaleVoice = voices.find(v => v.lang.startsWith('fr') && (v.name.includes('Google') || v.name.includes('Premium')));
    if (femaleVoice) utterance.voice = femaleVoice;

    window.speechSynthesis.speak(utterance);
}


document.getElementById('send-chat').addEventListener('click', () => handleChatSend());
document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleChatSend();
});

async function handleChatSend() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    
    input.value = "";
    addChatMessage('user', text);
    
    const apiKey = getApiKey();
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: "system", content: "Tu es un ami bienveillant. Sois chaleureux, motivant et parle comme un ami proche. Évite les formats markdown complexes (pas trop d'astérisques ou de listes), parle simplement comme si tu discutais à haute voix." },
                    { role: "user", content: text }
                ]
            })
        });
        const data = await response.json();
        const reply = data.choices[0].message.content;
        addChatMessage('ai', reply);
        speak(reply, true);
    } catch (e) {
        addChatMessage('ai', "Désolé, j'ai un petit souci de connexion...");
    }
}
