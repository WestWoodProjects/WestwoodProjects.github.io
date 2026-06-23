// Single clean implementation with explicit global export

// Hide modal overlay by default so it doesn't block clicks
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) { overlay.style.display = 'none'; overlay.style.pointerEvents = 'none'; }
});

// Low-stock tracking
let lowStockItems = [];

function updateList() {
    const list = document.getElementById('lowStockList');
    if (!list) return;
    list.innerHTML = '';
    if (lowStockItems.length === 0) {
        list.innerHTML = '<li class="text-green-600 font-medium">✅ All items are full</li>';
        return;
    }
    lowStockItems.forEach(item => {
        const li = document.createElement('li');
        li.className = 'bg-red-100 text-red-700 px-3 py-2 rounded-lg';
        li.textContent = item;
        list.appendChild(li);
    });
}

function checkItem(itemName, level) {
    if (level === 'Need to Fill') {
        if (!lowStockItems.includes(itemName)) lowStockItems.push(itemName);
    } else {
        lowStockItems = lowStockItems.filter(i => i !== itemName);
    }
    updateList();
}

// Main scanner setup
function setupScanner() {
    const URL = 'https://teachablemachine.withgoogle.com/models/4cByU1YCI/';
    let model, webcam;
    let isRunning = false;
    let lastItem = '';
    let lastPredictionTime = 0;
    const PREDICTION_INTERVAL = 300;

    function $id(id) { return document.getElementById(id); }

    const startBtn = $id('start-btn');
    const stopBtn = $id('stop-btn');
    if (startBtn) startBtn.addEventListener('click', init);
    if (stopBtn) stopBtn.addEventListener('click', stopCam);

    async function init() {
        if (isRunning) return;
        isRunning = true;
        try {
            if (typeof tf === 'undefined' || typeof tmImage === 'undefined') throw new Error('TF or TM lib missing');
            await tf.setBackend('webgl');
            await tf.ready();
            model = await tmImage.load(URL + 'model.json', URL + 'metadata.json');
            webcam = new tmImage.Webcam(224, 224, true);
            await webcam.setup();
            await webcam.play();
            const container = $id('webcam-container');
            if (container) { container.innerHTML = ''; container.appendChild(webcam.canvas); }
            $id('scan-animation')?.classList.remove('hidden');
            $id('scan-prompt')?.classList.remove('hidden');
            requestAnimationFrame(loop);
        } catch (e) {
            console.error(e);
            alert('❌ Camera or model error. Allow camera access or check console.');
            isRunning = false;
        }
    }

    async function loop() {
        if (!webcam || !isRunning) return;
        webcam.update();
        const now = Date.now();
        if (now - lastPredictionTime > PREDICTION_INTERVAL) {
            lastPredictionTime = now;
            predict();
        }
        requestAnimationFrame(loop);
    }

    async function predict() {
        if (!model || !webcam) return;
        let prediction;
        try { prediction = await model.predict(webcam.canvas); }
        catch (e) { console.log('Prediction error', e); return; }
        let best = prediction.reduce((max, p) => p.probability > max.probability ? p : max, prediction[0]);
        if (!best) return;
        let confidence = Math.round(best.probability * 100);
        if (confidence < 75) return;
        let raw = best.className.toLowerCase();
        let item = raw.replace(/needs to be filled|half filled|fully filled/g, '')
                                    .replace(/30|50|100/g, '')
                                    .replace(/\s+/g,' ').trim();
        item = item.replace(/\b\w/g, l => l.toUpperCase());
        let status = '';
        if (raw.includes('fully') || raw.includes('100')) status = 'Full Stock ✅';
        else if (raw.includes('half') || raw.includes('50')) status = 'Medium Stock ⚠️';
        else status = 'Low Stock ❌';
        if (item === lastItem && confidence < 90) return;
        lastItem = item;

        const resultItem = $id('result-item'); if (resultItem) resultItem.innerText = item;
        const resultStatus = $id('result-status'); if (resultStatus) resultStatus.innerHTML = `\n      <span class="text-lg font-semibold">${status}</span><br>\n      <span class="text-xs text-gray-600">Confidence: ${confidence}%</span>\n    `;
        const box = $id('result-box');
        if (box) {
            box.classList.remove('bg-green-100','bg-yellow-100','bg-red-100');
            if (status.includes('Full')) box.classList.add('bg-green-100');
            else if (status.includes('Medium')) box.classList.add('bg-yellow-100');
            else box.classList.add('bg-red-100');
        }
        document.querySelectorAll('.item-card').forEach(card => {
            card.classList.remove('item-highlight');
            if (card.dataset.item && card.dataset.item.toLowerCase() === item.toLowerCase()) card.classList.add('item-highlight');
        });
        checkItem(item, status.includes('Low') ? 'Need to Fill' : 'Full');
        const label = $id('label-container'); if (label) label.innerHTML = `<b>${item}</b><br>${confidence}%`;
    }

    function stopCam() {
        if (webcam) { webcam.stop(); webcam = null; }
        const container = $id('webcam-container');
        if (container) {
            container.innerHTML = `\n      <div class="text-center text-gray-400">\n        <i class="fas fa-camera text-4xl mb-2"></i>\n        <p class="font-medium">Camera stopped</p>\n        <p class="text-xs">Click \"Start Scan\" to resume</p>\n      </div>\n    `;
        }
        $id('scan-animation')?.classList.add('hidden');
        $id('scan-prompt')?.classList.add('hidden');
        isRunning = false;
    }
}

// Expose for global calls and guard initialization
window.setupScanner = setupScanner;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        try { setupScanner(); } catch (e) { console.warn('setupScanner call failed:', e); }
        if (typeof loadShoppingList === 'function') loadShoppingList();
    });
} else {
    try { setupScanner(); } catch (e) { console.warn('setupScanner call failed:', e); }
    if (typeof loadShoppingList === 'function') loadShoppingList();
}

// Shopping list functions
function addShoppingItem() {
    const input = document.getElementById('shopping-input'); if (!input) return;
    const item = input.value.trim(); if (!item) return;
    let list = JSON.parse(localStorage.getItem('shoppingList')) || [];
    list.push(item);
    localStorage.setItem('shoppingList', JSON.stringify(list));
    input.value = '';
    loadShoppingList();
}

function loadShoppingList() {
    const listContainer = document.getElementById('shopping-list'); if (!listContainer) return;
    listContainer.innerHTML = '';
    let list = JSON.parse(localStorage.getItem('shoppingList')) || [];
    list.forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'flex justify-between items-center bg-gray-100 px-3 py-2 rounded-lg';
        li.innerHTML = `\n      <span>${item}</span>\n      <button onclick="removeItem(${index})" class="text-red-500 text-xs">\n        ❌\n      </button>\n    `;
        listContainer.appendChild(li);
    });
}

function removeItem(index) {
    let list = JSON.parse(localStorage.getItem('shoppingList')) || [];
    list.splice(index,1);
    localStorage.setItem('shoppingList', JSON.stringify(list));
    loadShoppingList();
}

function orderItem(platform) {
    const itemEl = document.getElementById('result-item');
    const item = itemEl ? itemEl.innerText : '';
    if (!item || item === 'Waiting for scan...') { alert('⚠️ Scan an item first!'); return; }
    let url = '';
    if (platform === 'blinkit') url = `https://blinkit.com/s/?q=${encodeURIComponent(item)}`;
    else if (platform === 'zepto') url = `https://www.zeptonow.com/search?query=${encodeURIComponent(item)}`;
    else if (platform === 'amazon') url = `https://www.amazon.in/s?k=${encodeURIComponent(item)}`;
    if (url) window.open(url, '_blank');
}

function askAI() {
    const inputEl = document.getElementById('ai-input'); const responseBox = document.getElementById('ai-response');
    if (!inputEl || !responseBox) return; const input = inputEl.value.toLowerCase().trim(); if (!input) return;
    if (input.includes('wheat')) responseBox.innerText = 'Store wheat flour in an airtight container in a cool, dry place. You can refrigerate it to increase shelf life.';
    else if (input.includes('rice')) responseBox.innerText = 'Store rice in an airtight container away from moisture. Keep it in a cool place to avoid insects.';
    else if (input.includes('dal') || input.includes('moong')) responseBox.innerText = 'Keep dal in sealed containers. Avoid moisture and store in a dry place.';
    else if (input.includes('smell') || input.includes('spoiled')) responseBox.innerText = 'If food smells bad or looks discolored, it is better to discard it to avoid health risks.';
    else responseBox.innerText = 'Store food in airtight containers, keep away from moisture, and check regularly for freshness.';
}
// Load shopping list on page load (single implementation above)
document.addEventListener("DOMContentLoaded", () => {
    if (typeof loadShoppingList === 'function') loadShoppingList();
});

// --- Quick diagnostics and fallback helpers ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.group('App diagnostics');
        console.log('tf:', typeof tf);
        console.log('tmImage:', typeof tmImage);
        console.log('setupScanner:', typeof window.setupScanner);
        const startBtn = document.getElementById('start-btn');
        console.log('start-btn exists:', !!startBtn);
        if (startBtn) console.log(startBtn.outerHTML);

        // attempt to find common overlay elements and hide them to avoid blocking clicks
        const overlayCandidates = [
            document.getElementById('modal-overlay'),
            document.querySelector('.overlay'),
            document.getElementById('overlay'),
            document.querySelector('[role="dialog"]')
        ].filter(Boolean);
        if (overlayCandidates.length) {
            overlayCandidates.forEach(o => {
                if (o) {
                    console.log('found overlay:', o.id || o.className || o.tagName, getComputedStyle(o).display, getComputedStyle(o).zIndex, 'pointerEvents=', getComputedStyle(o).pointerEvents);
                    o.style.display = 'none';
                    o.style.pointerEvents = 'none';
                    console.log('overlay hidden');
                }
            });
        } else {
            console.log('no overlay-like element found');
        }

        // fallback: if Start button exists and doesn't have a handler, attach one that calls setupScanner
        if (startBtn && !startBtn.dataset.fallbackAttached) {
            startBtn.addEventListener('click', () => {
                console.log('Fallback start button click — invoking window.setupScanner if available');
                try { if (typeof window.setupScanner === 'function') window.setupScanner(); }
                catch (err) { console.error('fallback start error', err); }
            });
            startBtn.dataset.fallbackAttached = '1';
        }

        console.groupEnd();
    } catch (e) {
        console.error('Diagnostics failed', e);
    }
});
