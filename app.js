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
    // 1. Enregistrement PWA (Installation mobile)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    const savedKey = getApiKey();
    if (savedKey) apiKeyInput.value = savedKey;

    // 2. Assistant de Configuration
    const privacyAccepted = localStorage.getItem('privacy_accepted');
    const privacyModal = document.getElementById('privacy-modal');
    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');

    // Si tout est déjà configuré, on masque tout
    if (privacyAccepted && savedKey) {
        privacyModal.style.display = 'none';
    } else if (privacyAccepted && !savedKey) {
        // Déjà accepté la loi mais pas de clé
        step1.style.display = 'none';
        step2.style.display = 'block';
    }

    // Bouton Étape 1 (Privacy)
    document.getElementById('accept-privacy').onclick = () => {
        localStorage.setItem('privacy_accepted', 'true');
        step1.style.display = 'none';
        step2.style.display = 'block';
    };

    // Bouton Étape 2 (Clé API)
    document.getElementById('finish-setup').onclick = () => {
        const key = document.getElementById('setup-api-key').value.trim();
        if (key.startsWith('gsk_')) {
            setApiKey(key);
            apiKeyInput.value = key;
            privacyModal.style.display = 'none';
            showToast("Configuration réussie !", "success");
        } else {
            showToast("Clé invalide (doit commencer par gsk_)", "error");
        }
    };

    initAuth();
    renderHistory();

    loadChatHistory();
    loadCustomBackground();
    initTheme();
    initNightMode(); // 2. Mode Nuit Automatique
    if (typeof lucide !== 'undefined') lucide.createIcons();
};

function initNightMode() {
    const hour = new Date().getHours();
    // Mode nuit auto entre 21h et 7h
    if (hour >= 21 || hour < 7) {
        document.body.classList.add('night-mode-auto');
        console.log("🌙 Mode nuit automatique activé.");
    }
}

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

document.getElementById('change-img-btn')?.addEventListener('click', () => {
    selectedImageBase64 = null;
    preview.style.display = 'none';
    preview.src = '';
    dropZone.classList.remove('has-image');
    analyzeBtn.disabled = true;
    cameraInput.value = '';
    galleryInput.value = '';
});


function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const MAX = 800; // Taille optimisée pour Groq Vision
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
    if (resultsArea) resultsArea.style.display = 'none';

    try {
        const response = await callGroq(apiKey, selectedImageBase64);
        displayResults(response);
    } catch (error) {
        console.error("Détails de l'erreur:", error);
        alert("⚠️ Problème : " + error.message);
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

const resetAppBtn = document.getElementById('reset-app');
if (resetAppBtn) {
    resetAppBtn.addEventListener('click', () => {
        resetAppBtn.innerHTML = `<span class="spinner"></span> Réinitialisation en cours...`;
        resetAppBtn.disabled = true;
        
        setTimeout(() => {
            // Nettoyer les clés de configuration
            localStorage.removeItem('privacy_accepted');
            localStorage.removeItem(STORAGE_KEY);
            sessionApiKey = null;
            apiKeyInput.value = '';
            
            // Remettre le bouton à son état initial
            resetAppBtn.innerHTML = `<i data-lucide="refresh-ccw"></i> Réinitialiser l'application`;
            resetAppBtn.disabled = false;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            
            // Fermer les paramètres et rouvrir l'assistant de configuration
            settingsModal.style.display = 'none';
            const privacyModal = document.getElementById('privacy-modal');
            const step1 = document.getElementById('step-1');
            const step2 = document.getElementById('step-2');
            
            privacyModal.style.display = 'flex';
            step1.style.display = 'block';
            step2.style.display = 'none';
            
            showToast("Application réinitialisée", "success");
        }, 1500); // Petite pause pour l'animation
    });
}

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

function setLoading(isLoading, text = "Analyse en cours...") {
    const analyzeBtn = document.getElementById('analyze-btn');
    if (!analyzeBtn) return;
    analyzeBtn.disabled = isLoading;
    const btnText = document.getElementById('btn-text');
    if (btnText) {
        btnText.innerHTML = isLoading ? `<span class="spinner"></span> ${text}` : "Analyser";
    }
}

async function callGroq(apiKey, base64Image) {
    const base64Data = base64Image.split(',')[1];
    
    const prompts = {
        auto: `CONSIGNE : Identifie l'élément principal et donne les 3 infos les plus surprenantes. JSON: {"title": "Découverte", "content": "### 🔍 Objet : ...\\n### 💡 Info : ..."}`,
        cuisine: `Identifie les aliments. JSON: {"ingredients": ["..."], "title": "Cuisine", "content": "### 🥘 Recette rapide :\\n..."}`,
        budget: `Analyse ce ticket de caisse. JSON: {"merchant": "...", "date": "...", "total": "...", "currency": "€", "items": [{"name": "...", "price": "..."}]}`,
        jardinier: `CONSIGNE : Botaniste expert. Diagnostique la plante et donne un calendrier d'entretien. JSON: {"title": "Jardinier", "content": "### 🌿 Espèce : ...\\n### 🏥 Santé : ...\\n### 📅 Entretien : ..."}`,
        minecraft: `CONSIGNE : Transforme la photo en projet Minecraft (blocs + étapes). JSON: {"title": "Minecraft", "content": "### 🧱 Blocs : ...\\n### 🏗️ Étapes : ..."}`,
        nutrition: `CONSIGNE : Nutritionniste. Donne calories et Nutri-Score. JSON: {"title": "Nutrition", "content": "### 🍎 Calories : ...\\n### 🏆 Score : ..."}`,
        sante: `CONSIGNE : Bien-être. Analyse et donne des conseils de prévention. JSON: {"title": "Santé", "content": "### 🩺 Observation : ...\\n### 🛡️ Prévention : ..."}`,
        tri: `CONSIGNE : Expert Éco. Dis où jeter et donne une idée de recyclage. JSON: {"title": "Tri Éco", "content": "### ♻️ Poubelle : ...\\n### 🎨 Recyclage : ..."}`,
        taches: `CONSIGNE : Expert Nettoyage. Donne la solution pour cette tache. JSON: {"title": "SOS Taches", "content": "### 🫧 Type : ...\\n### 🧪 Solution : ..."}`,
        energie: `CONSIGNE : Expert Énergie. Donne une astuce pour consommer moins ici. JSON: {"title": "Énergie", "content": "### ⚡ Analyse : ...\\n### 📉 Économie : ..."}`,
        magique: `CONSIGNE : Magicien. Explique le principe de l'illusion ou donne un indice. JSON: {"title": "Magie", "content": "### 🪄 Effet : ...\\n### 🧩 Indice : ..."}`,
        traduction: `CONSIGNE : Traducteur. Traduis le texte et explique une expression. JSON: {"title": "Traduction", "content": "### 🌍 Traduction : ...\\n### 🗣️ Expression : ..."}`,
        qrcode: `CONSIGNE : Décode le QR Code et analyse le lien. JSON: {"title": "QR Code", "content": "### 🔗 Lien : ...\\n### 🛡️ Sécurité : ..."}`,
        art: `CONSIGNE : Critique d'Art. Analyse style et émotion. JSON: {"title": "Art", "content": "### 🎨 Style : ...\\n### 🎭 Émotion : ..."}`,
        style: `CONSIGNE : Coach Style. Analyse le look et donne un conseil d'accessoire. JSON: {"title": "Style", "content": "### 👗 Look : ...\\n### 👜 Conseil : ..."}`,
        histoires: `CONSIGNE : Historien. Raconte une anecdote passionnante sur cet objet/lieu. JSON: {"title": "Histoire", "content": "### 📜 Époque : ...\\n### 🏛️ Anecdote : ..."}`,
        jdr: `CONSIGNE : Maître du Jeu. Crée une quête courte basée sur l'image. JSON: {"title": "JDR", "content": "### ⚔️ Quête : ...\\n### 🐲 Ennemi : ..."}`,
        code: `CONSIGNE : Développeur. Explique le code et propose une optimisation. JSON: {"title": "Code", "content": "### 💻 Logique : ...\\n### 🚀 Optimisation : ..."}`,
        notes: `Extrais les points clés ou crée une checklist. JSON: {"title": "Notes", "items": ["..."]}`,
        quiz: `CONSIGNE : Créateur de Quiz. Génère 3 questions sur l'image. JSON: {"title": "Quiz", "content": "### ❓ Questions : ...\\n### 🔑 Réponses : ..."}`,
        insectes: `CONSIGNE : Entomologiste. Identifie et donne le rôle dans la nature. JSON: {"title": "Insectes", "content": "### 🐜 Espèce : ...\\n### 🌍 Rôle : ..."}`,
        puzzles: `CONSIGNE : Expert Enigmes. Donne la stratégie pour gagner. JSON: {"title": "Puzzle", "content": "### 🧩 Analyse : ...\\n### 🏆 Solution : ..."}`,
        monuments: `CONSIGNE : Guide. Donne le secret caché de ce lieu. JSON: {"title": "Monuments", "content": "### 🏛️ Lieu : ...\\n### 🤫 Secret : ..."}`,
        humeur: `CONSIGNE : Coach Positif. Analyse l'ambiance et donne un conseil Zen. JSON: {"title": "Humeur", "content": "### ✨ Ambiance : ...\\n### 🧘 Conseil : ..."}`,
        musique: `CONSIGNE : Musicologue. Analyse la musique/instrument et donne une technique. JSON: {"title": "Musique", "content": "### 🎵 Analyse : ...\\n### 🎹 Technique : ..."}`
    };

    const prompt = prompts[currentMode] || prompts.auto;

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: MODEL,
            messages: [
                {
                    role: "system",
                    content: "Tu es un assistant visuel expert. Réponds TOUJOURS au format JSON strict."
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: prompt },
                        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
                    ]
                }
            ],
            response_format: { type: "json_object" }
        })
    });

    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(`Erreur API: ${errData.error?.message || "Inconnue"}`);
    }
    const data = await res.json();
    return JSON.parse(data.choices[0].message.content);
}


function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'info';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'alert-circle';
    
    toast.innerHTML = `<i data-lucide="${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    setTimeout(() => toast.remove(), 3000);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast("Copié dans le presse-papier !", "success");
    });
}

function displayResults(data, skipSave = false) {
    try {
        console.log("Données reçues de l'IA:", data);
        lastRawResponse = data;
        
        // Cacher tous les blocs de résultats
        document.querySelectorAll('#results > div').forEach(div => div.style.display = 'none');
        resultsArea.style.display = 'block';

        switch(currentMode) {
            case 'notes': renderNotes(data); break;
            case 'cuisine': renderCuisine(data); break;
            case 'budget': renderBudget(data); break;
            case 'jardinier': renderGeneric(data, "🌿 Jardinage"); break;
            case 'nutrition': renderGeneric(data, "🍎 Nutrition"); break;
            case 'sante': renderGeneric(data, "⚕️ Santé"); break;
            case 'tri': renderGeneric(data, "♻️ Recyclage"); break;
            case 'taches': renderGeneric(data, "🧼 Nettoyage"); break;
            case 'energie': renderGeneric(data, "⚡ Énergie"); break;
            case 'magique': renderGeneric(data, "🪄 Magie"); break;
            case 'minecraft': renderGeneric(data, "⛏️ Minecraft"); break;
            case 'traduction': renderGeneric(data, "🌍 Traduction"); break;
            case 'qrcode': renderGeneric(data, "🔗 Lien QR"); break;
            case 'art': renderGeneric(data, "🎨 Art"); break;
            case 'style': renderGeneric(data, "👗 Style"); break;
            case 'histoires': renderGeneric(data, "📜 Histoire"); break;
            case 'jdr': renderGeneric(data, "🎲 JDR"); break;
            case 'code': renderGeneric(data, "💻 Code"); break;
            case 'quiz': renderGeneric(data, "❓ Quiz"); break;
            case 'insectes': renderGeneric(data, "🐜 Insecte"); break;
            case 'puzzles': renderGeneric(data, "🧩 Puzzle"); break;
            case 'monuments': renderGeneric(data, "🏛️ Monument"); break;
            case 'humeur': renderGeneric(data, "😊 Humeur"); break;
            case 'chat': renderChat(); break;
            case 'alarm': renderAlarm(); break;
            default: renderGeneric(data, data.title || "Analyse"); break;
        }




        if (!skipSave && currentMode !== 'alarm' && currentMode !== 'chat') {
            saveToHistory(currentMode, data, selectedImageBase64);
        }
        
        resultsArea.scrollIntoView({ behavior: 'smooth' });

    } catch (e) {
        console.error("Erreur d'affichage:", e);
        showToast("Erreur lors de l'affichage des résultats.", "error");
    }
}

function renderNotes(data) {
    const notesRes = document.getElementById('notes-results');
    if (notesRes) notesRes.style.display = 'block';
    const container = document.getElementById('checklist-container');
    if (container && data.items) {
        container.innerHTML = data.items.map(item => `
            <div class="check-item" onclick="this.classList.toggle('done'); this.querySelector('input').checked = !this.querySelector('input').checked;">
                <input type="checkbox">
                <span>${item}</span>
            </div>
        `).join('');
    }
}

function renderCuisine(data) {
    if (cuisineResults) cuisineResults.style.display = 'block';
    const selectionContainer = document.getElementById('ingredients-selection');
    const generateBtn = document.getElementById('generate-recipes-btn');
    const list = document.getElementById('recipes-list');

    if (list) list.innerHTML = "";
    
    if (selectionContainer && data.ingredients) {
        selectionContainer.innerHTML = "";
        let selectedList = [...data.ingredients];

        data.ingredients.forEach(ing => {
            const tag = document.createElement('div');
            tag.className = 'ingredient-tag selected';
            tag.textContent = ing;
            tag.onclick = () => {
                tag.classList.toggle('selected');
                const idx = selectedList.indexOf(ing);
                if (idx > -1) selectedList.splice(idx, 1);
                else selectedList.push(ing);
                generateBtn.style.display = selectedList.length > 0 ? 'flex' : 'none';
            };
            selectionContainer.appendChild(tag);
        });

        if (generateBtn) {
            generateBtn.style.display = 'flex';
            generateBtn.onclick = () => generateFinalRecipes(selectedList);
        }
    }
}

async function generateFinalRecipes(ingredients) {
    const list = document.getElementById('recipes-list');
    if (!list) return;
    
    list.innerHTML = `<div class="spinner-container" style="text-align:center; padding:20px;">
        <span class="spinner"></span><br>Création de vos recettes...
    </div>`;

    const apiKey = getApiKey();
    if (!apiKey) return showToast("Config prise manquante", "error");

    try {
        const prompt = `En tant que Chef, propose 3 idées de recettes simples et rapides utilisant uniquement ces ingrédients : ${ingredients.join(', ')}. Réponds en Markdown avec Titre, Ingrédients et Étapes.`;
        
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant", // Modèle plus récent et stable
                messages: [
                    { role: "system", content: "Tu es un chef cuisinier expert en recettes rapides." },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7
            })
        });

        const data = await response.json();
        
        if (!response.ok || !data.choices || !data.choices[0]) {
            throw new Error(data.error?.message || "Réponse invalide de l'IA");
        }

        const content = data.choices[0].message.content;
        list.innerHTML = `<div class="markdown-content">${marked.parse(content)}</div>`;
        list.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error("Erreur Cuisine Final:", error);
        list.innerHTML = `<p style='color:var(--accent); padding:10px;'>⚠️ ${error.message}</p>`;
    }
}



function renderBudget(data) {
    if (budgetResults) budgetResults.style.display = 'block';
    const merchantEl = document.getElementById('merchant-name');
    const totalEl = document.getElementById('total-price');
    const dateEl = document.getElementById('ticket-date');
    const list = document.getElementById('items-list');
    const saveBtn = document.getElementById('save-budget-btn');

    if (merchantEl) merchantEl.textContent = data.merchant || data.marchand || "Inconnu";
    if (dateEl) dateEl.textContent = data.date || "Date inconnue";
    
    let total = data.total;
    if ((!total || total == "0" || total == "0.00" || total == "0€") && data.items) {
        const sum = data.items.reduce((acc, item) => {
            const priceStr = item.price?.toString() || "0";
            const price = parseFloat(priceStr.replace(/[^\d.,]/g, '').replace(',', '.') || 0);
            return acc + price;
        }, 0);
        if (sum > 0) total = sum.toFixed(2);
    }
    
    if (totalEl) totalEl.textContent = (total || "0.00") + (data.currency || "€");
    if (saveBtn) saveBtn.style.display = 'flex';

    if (list) {
        list.innerHTML = "";
        if (data.items) {
            data.items.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${item.name || "Article"}</td><td style="text-align: right;">${item.price || ""}${data.currency || ""}</td>`;
                list.appendChild(tr);
            });
        }
    }
}

function renderGeneric(data, title) {
    const genericRes = document.getElementById('generic-results');
    const genericTitle = document.getElementById('generic-title');
    const genericContent = document.getElementById('generic-content');
    if (genericRes) genericRes.style.display = 'block';
    if (genericTitle) genericTitle.textContent = title;
    
    // Extraction sécurisée du contenu (on cherche 'content' ou 'description' ou 'instructions')
    let rawContent = data.content || data.description || data.guide || data.instructions || data.analysis || data;
    
    let finalMarkdown = "";
    
    if (typeof rawContent === 'string') {
        finalMarkdown = rawContent;
    } else if (typeof rawContent === 'object' && rawContent !== null) {
        // Si c'est un objet complexe, on formate chaque clé proprement
        finalMarkdown = Object.entries(rawContent)
            .filter(([k]) => k !== 'title')
            .map(([k, v]) => `### ${k.charAt(0).toUpperCase() + k.slice(1)}\n${typeof v === 'object' ? JSON.stringify(v, null, 2) : v}`)
            .join('\n\n');
    }
 else {
        finalMarkdown = String(rawContent);
    }
    
    if (genericContent) {
        genericContent.innerHTML = marked.parse(finalMarkdown);
    }
}

function renderChat() {
    const chatRes = document.getElementById('chat-results');
    if (chatRes) {
        chatRes.style.display = 'block';
        // Charger l'historique si le conteneur est vide
        const container = document.getElementById('chat-messages');
        if (container && container.children.length === 0) {
            loadChatHistory();
        }
    }
}

function renderAlarm() {
    const alarmRes = document.getElementById('alarm-results');
    if (alarmRes) alarmRes.style.display = 'block';
}



    
    
    // --- Système Budgétaire ---

async function saveBudgetTransaction() {
    // On récupère ce qui est affiché à l'écran (au cas où l'utilisateur a corrigé manuellement)
    const merchantVal = document.getElementById('merchant-name').textContent;
    const totalVal = document.getElementById('total-price').textContent;
    
    if (!merchantVal || !totalVal || totalVal === "0.00€") {
        alert("⚠️ Aucune donnée valide à enregistrer.");
        return;
    }

    const saveBtn = document.getElementById('save-budget-btn');
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span class="spinner"></span> Enregistrement...`;

    // Nettoyage du montant affiché
    const cleanAmount = parseFloat(totalVal.replace(/[^\d.,]/g, '').replace(',', '.'));

    const transaction = {
        merchant: merchantVal,
        amount: cleanAmount,
        date: lastRawResponse?.date || new Date().toLocaleDateString('fr-FR'),
        items: lastRawResponse?.items || [], // On enregistre la liste complète
        user_pseudo: currentPseudo,
        created_at: new Date().toISOString()
    };



    try {
        if (supabaseClient) {
            const { error } = await supabaseClient
                .from('budget_transactions')
                .insert([transaction]);
            if (error) throw error;
        } else {
            let localBudget = JSON.parse(localStorage.getItem('local_budget') || '[]');
            localBudget.unshift(transaction);
            localStorage.setItem('local_budget', JSON.stringify(localBudget));
        }
        
        alert("✅ Dépense de " + cleanAmount + "€ enregistrée !");
        saveBtn.style.display = 'none';
    } catch (e) {
        console.error("Erreur sauvegarde budget:", e);
        alert("Erreur lors de la sauvegarde.");
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
}


async function loadBudgetDashboard() {
    const dash = document.getElementById('budget-dashboard');
    const results = document.getElementById('results');
    const totalEl = document.getElementById('budget-total-sum');
    const listEl = document.getElementById('budget-transactions-list');

    // Masquer les autres
    document.querySelectorAll('#results > div').forEach(div => div.style.display = 'none');
    dash.style.display = 'block';
    results.style.display = 'block';

    let transactions = [];
    try {
        if (supabaseClient) {
            let query = supabaseClient.from('budget_transactions').select('*');
            if (currentPseudo) query = query.eq('user_pseudo', currentPseudo);
            else query = query.is('user_pseudo', null);
            
            const { data, error } = await query.order('created_at', { ascending: false });
            if (!error) transactions = data;
        } else {
            transactions = JSON.parse(localStorage.getItem('local_budget') || '[]');
        }
    } catch (e) {
        transactions = JSON.parse(localStorage.getItem('local_budget') || '[]');
    }

    const total = transactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    totalEl.textContent = total.toFixed(2) + "€";

    if (transactions.length === 0) {
        listEl.innerHTML = "<p style='opacity:0.5; text-align:center;'>Aucune dépense enregistrée.</p>";
    } else {
        listEl.innerHTML = transactions.map((t, i) => `
            <div class="transaction-card" onclick="toggleTransactionDetails(${i})">
                <div class="transaction-item">
                    <div class="trans-info">
                        <span class="trans-merchant">${t.merchant}</span>
                        <span class="trans-date">${t.date}</span>
                    </div>
                    <span class="trans-amount">${parseFloat(t.amount).toFixed(2)}€</span>
                </div>
                <div id="details-${i}" class="trans-details" style="display: none;">
                    <ul class="details-list">
                        ${(t.items || []).map(item => `
                            <li><span>${item.name || "Article"}</span> <span>${item.price || ""}</span></li>
                        `).join('')}
                    </ul>
                </div>
            </div>
        `).join('');
    }

    
    dash.scrollIntoView({ behavior: 'smooth' });
}

window.toggleTransactionDetails = function(index) {
    const details = document.getElementById(`details-${index}`);
    if (details) {
        const isHidden = details.style.display === 'none';
        details.style.display = isHidden ? 'block' : 'none';
    }
};



async function clearBudgetHistory() {
    if (!confirm("Voulez-vous vraiment effacer tout votre historique budgétaire ?")) return;

    try {
        if (supabaseClient) {
            let query = supabaseClient.from('budget_transactions').delete();
            if (currentPseudo) query = query.eq('user_pseudo', currentPseudo);
            else query = query.is('user_pseudo', null);
            await query;
        }
        localStorage.removeItem('local_budget');
        loadBudgetDashboard();
    } catch (e) {
        alert("Erreur lors de la suppression.");
    }
}

// Listeners
document.getElementById('save-budget-btn')?.addEventListener('click', saveBudgetTransaction);
document.getElementById('open-budget-dashboard')?.addEventListener('click', loadBudgetDashboard);
document.getElementById('clear-budget-btn')?.addEventListener('click', clearBudgetHistory);



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

async function getAiReply(text) {
    const apiKey = getApiKey();
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    try {
        let chatHistory = JSON.parse(localStorage.getItem('chat_history') || '[]');
        let apiMessages = [
            { 
                role: "system", 
                content: `Tu es l'Ami IA de ${currentPseudo || 'ton pote'}. 
                CONTEXTE TEMPOREL : Nous sommes le ${dateStr} et il est ${timeStr}.
                Ton style : super amical, décontracté, tu tutoies systématiquement. 
                Tu parles comme un ami proche sur WhatsApp. Utilise des emojis et des abréviations (cc, cv, mrc, tk, slt, tb).` 
            }
        ];
        
        // Garder les 15 derniers messages pour le contexte
        const recentHistory = chatHistory.slice(-15);
        recentHistory.forEach(msg => {
            apiMessages.push({
                role: msg.role === 'ai' ? 'assistant' : msg.role,
                content: msg.text
            });
        });
        
        // Ajouter le message actuel (non sauvegardé par l'appel vocal)
        apiMessages.push({ role: "user", content: text });

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: MODEL,
                messages: apiMessages
            })
        });
        const data = await response.json();
        
        // Sauvegarder dans l'historique (pour que la discussion vocale ait une suite cohérente)
        saveChatHistory('user', text);
        saveChatHistory('ai', data.choices[0].message.content);
        
        return data.choices[0].message.content;
    } catch (e) {
        return "Désolé mon pote, j'ai eu un petit bug de connexion... On réessaie ?";
    }
}


// --- Système de Réveil & Chat ---
let alarmTime = null;
let alarmInterval = null;
let wakeLock = null;

// Demander la permission de notification au chargement si possible
if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
}

document.getElementById('set-alarm').addEventListener('click', async () => {
    alarmTime = document.getElementById('alarm-time').value;
    if (!alarmTime) return showToast("Choisis une heure !", "error");
    
    document.getElementById('alarm-status').textContent = `🔔 Réveil actif pour ${alarmTime}`;
    document.getElementById('set-alarm').textContent = "Modifier l'heure";
    
    // Demander le Wake Lock
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {
        console.log("WakeLock non supporté.");
    }

    // Lancer un son silencieux pour maintenir le processus en vie si l'écran est éteint
    const sound = document.getElementById('alarm-sound');
    if (sound) {
        sound.volume = 0;
        sound.play().catch(() => {});
        // On remettra le son à 1.0 lors de la vraie alarme
    }

    if (alarmInterval) clearInterval(alarmInterval);
    
    alarmInterval = setInterval(() => {
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        if (currentTime === alarmTime) {
            clearInterval(alarmInterval);
            triggerAlarm();
        }
    }, 1000);

    showToast("Réveil programmé !", "success");
});

document.getElementById('stop-alarm').addEventListener('click', () => {
    const sound = document.getElementById('alarm-sound');
    if (sound) {
        sound.pause();
        sound.currentTime = 0;
    }
    document.getElementById('stop-alarm').style.display = 'none';
    document.getElementById('set-alarm').style.display = 'block';
    document.getElementById('alarm-status').textContent = "Réveil arrêté.";
    
    // Libérer le Wake Lock
    if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
    }
});

async function triggerAlarm() {
    const sound = document.getElementById('alarm-sound');
    if (sound) {
        sound.volume = 1.0;
        sound.play().catch(e => console.log("Erreur lecture audio:", e));
    }

    document.getElementById('stop-alarm').style.display = 'block';
    document.getElementById('set-alarm').style.display = 'none';

    // Notification pour réveiller l'écran
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification("⏰ RÉVEIL !", {
            body: "Il est l'heure ! Clique pour arrêter.",
            icon: "favicon.ico"
        });
    }

    // Basculer sur le chat pour l'interaction matinale
    currentMode = 'chat';
    renderChat();
    
    const msg = "Bonjour ! C'est l'heure de se réveiller ! ☀️ Comment tu te sens ce matin ?";
    addChatMessage('ai', msg);
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

// --- LOGIQUE D'APPEL VOCAL ---
let recognition = null;
let isCallMuted = false;

function initSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'fr-FR';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onresult = async (event) => {
            const text = event.results[0][0].transcript;
            console.log("Appel - entendu:", text);
            document.getElementById('call-status').textContent = "L'Ami IA réfléchit...";
            
            const reply = await getAiReply(text);
            speakResponse(reply);
        };

        recognition.onend = () => {
            if (document.getElementById('call-overlay').style.display === 'flex' && !isCallMuted) {
                recognition.start(); // Reprendre l'écoute
            }
        };
    }
}

function speakResponse(text) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    
    // Annuler toute lecture en cours pour éviter la superposition
    if (synth.speaking) synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    
    // Sélectionner la voix préférée ou la meilleure disponible
    const savedVoiceName = localStorage.getItem('preferred_voice_name');
    const voices = synth.getVoices();
    let selectedVoice = voices.find(v => v.name === savedVoiceName);
    
    if (!selectedVoice) {
        const frVoices = voices.filter(v => v.lang.startsWith('fr'));
        selectedVoice = getBestFrenchVoice(frVoices);
    }
    
    if (selectedVoice) {
        utterance.voice = selectedVoice;
    }
    
    // Paramètres optimisés pour un rendu fluide et naturel
    utterance.rate = 1.05; // Très légèrement plus dynamique (enlever l'effet robot monotone)
    utterance.pitch = 1.0; // Hauteur neutre

    // Animation de l'avatar quand l'IA parle
    utterance.onstart = () => {
        document.getElementById('call-avatar-anim').classList.add('speaking');
        document.getElementById('call-status').textContent = "L'Ami IA parle...";
    };
    utterance.onend = () => {
        document.getElementById('call-avatar-anim').classList.remove('speaking');
        document.getElementById('call-status').textContent = "À vous, je vous écoute...";
    };

    synth.speak(utterance);
}

// Trouver automatiquement la voix française la plus moderne (Neural, Google, Siri Premium, etc.)
function getBestFrenchVoice(frVoices) {
    const priorities = [
        v => v.name.toLowerCase().includes('google') && v.name.toLowerCase().includes('natural'),
        v => v.name.toLowerCase().includes('google'),
        v => v.name.toLowerCase().includes('natural'),
        v => v.name.toLowerCase().includes('premium'),
        v => v.name.toLowerCase().includes('neural'),
        v => v.name.toLowerCase().includes('hortense'),
        v => v.name.toLowerCase().includes('julie'),
        v => v.name.toLowerCase().includes('paul'),
        v => v.localService === true
    ];
    for (const predicate of priorities) {
        const best = frVoices.find(predicate);
        if (best) return best;
    }
    return frVoices[0] || null;
}

// Remplir dynamiquement le sélecteur de voix dans les paramètres
function populateVoiceList() {
    if (typeof speechSynthesis === 'undefined') return;
    const voices = speechSynthesis.getVoices();
    const voiceSelect = document.getElementById('voice-select');
    if (!voiceSelect) return;

    const selectedVoiceName = localStorage.getItem('preferred_voice_name');
    voiceSelect.innerHTML = '';

    const frVoices = voices.filter(v => v.lang.startsWith('fr'));
    
    if (frVoices.length === 0) {
        const opt = document.createElement('option');
        opt.textContent = "Aucune voix française détectée";
        voiceSelect.appendChild(opt);
        return;
    }

    frVoices.forEach(voice => {
        const option = document.createElement('option');
        // Nettoyage esthétique des noms de voix
        const cleanName = voice.name
            .replace('Microsoft', 'MS')
            .replace('Google', 'Google')
            .replace('Desktop', '')
            .trim();
        option.textContent = cleanName;
        option.value = voice.name;
        
        if (selectedVoiceName && voice.name === selectedVoiceName) {
            option.selected = true;
        }
        voiceSelect.appendChild(option);
    });

    if (!selectedVoiceName) {
        const best = getBestFrenchVoice(frVoices);
        if (best) {
            voiceSelect.value = best.name;
            localStorage.setItem('preferred_voice_name', best.name);
        }
    }
}

// Gérer le changement de voix depuis les paramètres
document.getElementById('voice-select')?.addEventListener('change', (e) => {
    localStorage.setItem('preferred_voice_name', e.target.value);
    speakResponse("Salut mon pote ! Tu aimes ma nouvelle voix ?");
});

if (typeof speechSynthesis !== 'undefined') {
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoiceList;
    }
    setTimeout(populateVoiceList, 600);
}


async function startCall() {
    const overlay = document.getElementById('call-overlay');
    overlay.style.display = 'flex';
    document.getElementById('call-status').textContent = "Connexion...";
    
    if (!recognition) initSpeech();
    
    // Message de bienvenue
    const welcome = `Salut ${currentPseudo || 'mon pote'} ! Content de t'avoir au téléphone, ça va ?`;
    speakResponse(welcome);
    
    setTimeout(() => {
        if (recognition && !isCallMuted) recognition.start();
    }, 2000);
}

document.getElementById('call-ai')?.addEventListener('click', startCall);

document.getElementById('end-call')?.addEventListener('click', () => {
    document.getElementById('call-overlay').style.display = 'none';
    window.speechSynthesis.cancel();
    if (recognition) recognition.stop();
});

document.getElementById('mute-call')?.addEventListener('click', () => {
    isCallMuted = !isCallMuted;
    const btn = document.getElementById('mute-call');
    btn.style.background = isCallMuted ? "#e94560" : "rgba(255,255,255,0.1)";
    btn.innerHTML = isCallMuted ? '<i data-lucide="mic"></i>' : '<i data-lucide="mic-off"></i>';
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    if (isCallMuted) recognition.stop();
    else recognition.start();
});

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
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    try {
        let chatHistory = JSON.parse(localStorage.getItem('chat_history') || '[]');
        let apiMessages = [
            { 
                role: "system", 
                content: `Tu es l'Ami IA de ${currentPseudo || 'ton pote'}. 
                CONTEXTE TEMPOREL : Nous sommes le ${dateStr} et il est ${timeStr}.
                Ton style : super amical, décontracté, tu tutoies systématiquement. 
                Tu parles comme un ami proche sur WhatsApp. Utilise des emojis et des abréviations (cc, cv, mrc, tk, slt, tb).` 
            }
        ];
        
        // Le message actuel est déjà dans chatHistory (via addChatMessage plus haut)
        const recentHistory = chatHistory.slice(-15);
        recentHistory.forEach(msg => {
            apiMessages.push({
                role: msg.role === 'ai' ? 'assistant' : msg.role,
                content: msg.text
            });
        });

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: MODEL,
                messages: apiMessages
            })
        });
        const data = await response.json();
        const reply = data.choices[0].message.content;
        addChatMessage('ai', reply);
    } catch (e) {
        addChatMessage('ai', "Désolé mon pote, j'ai un petit souci de connexion...");
    }
}


// --- SYSTÈME DE DIAGNOSTIC AUTOMATIQUE ---

async function runDiagnostic() {
    showToast("🔍 Diagnostic en cours...", "info");
    const report = [];
    let errors = 0;

    const check = (name, condition) => {
        if (condition) {
            report.push(`✅ ${name}`);
        } else {
            report.push(`❌ ${name}`);
            errors++;
        }
    };

    // 1. Vérification du DOM
    check("Bouton d'analyse présent", !!document.getElementById('analyze-btn'));
    check("Zone de résultats présente", !!document.getElementById('results'));
    check("Zone de chat présente", !!document.getElementById('chat-messages'));
    check("Bouton de cuisine présent", !!document.getElementById('generate-recipes-btn'));

    // 2. Vérification de la configuration
    const key = getApiKey();
    check("Clé API configurée", !!key);

    // 3. Test de connexion API (si clé présente)
    if (key) {
        try {
            const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "llama-3.1-8b-instant",
                    messages: [{ role: "user", content: "ping" }],
                    max_tokens: 1
                })
            });
            if (!res.ok) {
                const err = await res.json();
                console.error("Détails erreur Groq:", err);
            }
            check("Connexion API Groq réussie", res.ok);
        } catch (e) {
            check("Connexion API Groq réussie", false);
        }
    }

    // 4. Vérification des fonctions critiques
    check("Fonction 'callGroq' définie", typeof callGroq === 'function');
    check("Fonction 'generateFinalRecipes' définie", typeof generateFinalRecipes === 'function');
    check("Fonction 'renderGeneric' définie", typeof renderGeneric === 'function');

    // Affichage du rapport
    const finalReport = report.join('\n');
    console.log("--- RAPPORT DE DIAGNOSTIC ---\n" + finalReport);
    
    if (errors === 0) {
        alert("🎉 DIAGNOSTIC RÉUSSI !\n\nToutes les fonctions sont opérationnelles.\n\n" + finalReport);
        showToast("Tout est OK !", "success");
    } else {
        alert("⚠️ DIAGNOSTIC ÉCHOUÉ (" + errors + " erreurs)\n\nCertaines fonctions sont cassées.\n\n" + finalReport);
        showToast("Problèmes détectés", "error");
    }
}

document.getElementById('run-diagnostic')?.addEventListener('click', runDiagnostic);

document.getElementById('reset-app')?.addEventListener('click', () => {
    if (confirm("⚠️ ATTENTION : Cela va supprimer votre clé API, votre historique et toutes vos données. Voulez-vous continuer ?")) {
        localStorage.clear();
        sessionStorage.clear();
        location.reload();
    }
});
