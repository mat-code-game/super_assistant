// --- Configuration ---
const STORAGE_KEY = 'groq_api_key';
const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

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
const closeSettings = document.getElementById('close-modal');
const apiKeyInput = document.getElementById('api-key-input');
const saveKeyBtn = document.getElementById('save-key');

// --- State ---
let currentMode = 'cuisine';
let selectedImageBase64 = null;
let sessionApiKey = null;

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
};

// --- Logic ---

// Switch Mode
modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMode = btn.dataset.mode;
        resultsArea.style.display = 'none';
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
        alert("Veuillez configurer votre clé API dans les paramètres.");
        settingsModal.style.display = 'flex';
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
closeSettings.addEventListener('click', () => settingsModal.style.display = 'none');
document.getElementById('close-modal-x').addEventListener('click', () => settingsModal.style.display = 'none');
document.getElementById('close-results').addEventListener('click', () => resultsArea.style.display = 'none');

saveKeyBtn.addEventListener('click', () => {
    setApiKey(apiKeyInput.value.trim());
    settingsModal.style.display = 'none';
});

document.getElementById('hide-console').addEventListener('click', () => {
    if (typeof eruda !== 'undefined') {
        eruda.destroy();
        alert("Console désactivée. Rechargez la page pour la retrouver.");
        settingsModal.style.display = 'none';
    }
});

// --- Functions ---

function setLoading(isLoading, text = "Analyse...") {
    analyzeBtn.disabled = isLoading;
    document.getElementById('btn-text').innerHTML = isLoading ? 
        `<span class="spinner"></span> ${text}` : "Analyser";
}

async function callGroq(apiKey, base64Image) {
    const base64Data = base64Image.split(',')[1];
    
    let prompt = "";
    if (currentMode === 'cuisine') {
        prompt = `Analyse cette photo de nourriture. Liste les ingrédients principaux et propose 3 recettes simples (Titre + Étapes). 
        Réponds UNIQUEMENT au format JSON : 
        {"ingredients": ["..."], "recipes": [{"title": "...", "steps": "..."}]}`;
    } else if (currentMode === 'budget') {
        prompt = `Analyse ce ticket de caisse. Extrait le marchand, la date, le total et les articles.
        Réponds UNIQUEMENT au format JSON :
        {"merchant": "...", "date": "...", "total": "...", "currency": "€", "items": [{"name": "...", "price": "..."}]}`;
    } else if (currentMode === 'minecraft') {
        prompt = `Analyse cette photo d'architecture. Donne des conseils pour la reproduire dans Minecraft (blocs, dimensions, étapes).
        Réponds UNIQUEMENT au format JSON :
        {"title": "Guide Minecraft", "content": "### Blocs suggérés... ### Étapes..."}`;
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
        prompt = `Analyse cette liste écrite à la main. Transcris-la proprement sous forme de liste à puces.
        Réponds UNIQUEMENT au format JSON :
        {"title": "Liste Digitalisée", "content": "### Tâches... "}`;
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

function displayResults(data) {
    console.log("Données reçues de l'IA:", data); // Debug
    
    resultsArea.style.display = 'block';
    cuisineResults.style.display = 'none';
    budgetResults.style.display = 'none';
    const genericArea = document.getElementById('generic-results');
    genericArea.style.display = 'none';

    if (currentMode === 'cuisine') {
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
    } else {
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
    
    resultsArea.scrollIntoView({ behavior: 'smooth' });
}
