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
imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            selectedImageBase64 = event.target.result;
            preview.src = selectedImageBase64;
            preview.style.display = 'block';
            dropZone.classList.add('has-image');
            analyzeBtn.disabled = false;
        };
        reader.readAsDataURL(file);
    }
});

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

function setLoading(isLoading) {
    analyzeBtn.disabled = isLoading;
    document.getElementById('btn-text').innerHTML = isLoading ? 
        `<span class="spinner"></span> Analyse...` : "Analyser";
}

async function callGroq(apiKey, base64Image) {
    const base64Data = base64Image.split(',')[1];
    
    let prompt = "";
    if (currentMode === 'cuisine') {
        prompt = `Analyse cette photo de nourriture/frigo. 
        1. Liste les ingrédients principaux visibles (en français).
        2. Propose 3 recettes simples et détaillées utilisant ces ingrédients.
        Réponds UNIQUEMENT au format JSON : 
        {
            "ingredients": ["ingrédient 1", "ingrédient 2"],
            "recipes": [
                {"title": "Titre Recette 1", "steps": "Étapes de préparation..."},
                {"title": "Titre Recette 2", "steps": "Étapes de préparation..."}
            ]
        }`;
    } else {
        prompt = `Analyse ce ticket de caisse.
        1. Extrait le nom du marchand, la date, le montant total et la devise.
        2. Liste les articles et leurs prix si lisibles.
        Réponds UNIQUEMENT au format JSON :
        {
            "merchant": "Nom",
            "date": "Date",
            "total": "Montant",
            "currency": "€",
            "items": [
                {"name": "Article 1", "price": "1.50"},
                {"name": "Article 2", "price": "2.00"}
            ]
        }`;
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
    resultsArea.style.display = 'block';
    cuisineResults.style.display = 'none';
    budgetResults.style.display = 'none';

    if (currentMode === 'cuisine') {
        cuisineResults.style.display = 'block';
        document.getElementById('found-ingredients').textContent = "Ingrédients détectés : " + data.ingredients.join(', ');
        const list = document.getElementById('recipes-list');
        list.innerHTML = "";
        data.recipes.forEach(r => {
            const card = document.createElement('div');
            card.className = 'recipe-card';
            card.innerHTML = `<h3>${r.title}</h3><p style="font-size: 0.9rem; margin-top: 5px;">${r.steps}</p>`;
            list.appendChild(card);
        });
    } else {
        budgetResults.style.display = 'block';
        document.getElementById('merchant-name').textContent = data.merchant;
        document.getElementById('total-price').textContent = data.total + data.currency;
        document.getElementById('ticket-date').textContent = "Date : " + data.date;
        const list = document.getElementById('items-list');
        list.innerHTML = "";
        data.items.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${item.name}</td><td style="text-align: right;">${item.price}${data.currency}</td>`;
            list.appendChild(tr);
        });
    }
    
    resultsArea.scrollIntoView({ behavior: 'smooth' });
}
