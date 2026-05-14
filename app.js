// --- Configuration ---
const STORAGE_KEY = 'groq_api_key';
const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

// --- Elements ---
const modeBtns = document.querySelectorAll('.mode-btn');
const imageInput = document.getElementById('image-input');
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

// Image handling
imageInput.addEventListener('change', async (e) => {
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
saveKeyBtn.addEventListener('click', () => {
    setApiKey(apiKeyInput.value.trim());
    settingsModal.style.display = 'none';
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
