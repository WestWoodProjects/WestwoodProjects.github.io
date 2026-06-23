// ShelfSense scanner + shopping list (clean)

// Quick fix: ensure modal overlay isn't blocking clicks by default
document.addEventListener('DOMContentLoaded', () => {
    const overlay = document.getElementById('modal-overlay');
    if (overlay) {
        try {
            const style = getComputedStyle(overlay);
            if (style && style.display !== 'none') console.warn('modal-overlay was visible; hiding to restore interactivity.');
        } catch (e) {}
        overlay.style.display = 'none';
        overlay.style.pointerEvents = 'none';
    }
});

// Low-stock tracking
let lowStockItems = [];

function checkItem(itemName, level) {
    if (level === "Need to Fill") {
        if (!lowStockItems.includes(itemName)) lowStockItems.push(itemName);
    } else {
        lowStockItems = lowStockItems.filter(i => i !== itemName);
    }
    updateList();
}

function updateList() {
    const list = document.getElementById("lowStockList");
    if (!list) return;
    // Single clean script for scanner + shopping list
    // Low-stock tracking
    let lowStockItems = [];

    function checkItem(itemName, level) {
        if (level === "Need to Fill") {
            if (!lowStockItems.includes(itemName)) lowStockItems.push(itemName);
        } else {
            lowStockItems = lowStockItems.filter(i => i !== itemName);
        }
        updateList();
    }

    function updateList() {
        const list = document.getElementById("lowStockList");
        if (!list) return;
        list.innerHTML = "";
        if (lowStockItems.length === 0) {
            list.innerHTML = `
                <li class="text-green-600 font-medium">
                    ✅ All items are full
                </li>
            `;
            return;
        }
        lowStockItems.forEach(item => {
            const li = document.createElement("li");
            li.className = "bg-red-100 text-red-700 px-3 py-2 rounded-lg";
            li.textContent = item;
            list.appendChild(li);
        });
    }

    // Main scanner setup
    function setupScanner() {
        const URL = "https://teachablemachine.withgoogle.com/models/4cByU1YCI/";
        let model, webcam;
        let isRunning = false;
        let lastItem = "";
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
                if (container) {
                    container.innerHTML = '';
                    container.appendChild(webcam.canvas);
                }
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
            const resultStatus = $id('result-status'); if (resultStatus) resultStatus.innerHTML = `
                <span class="text-lg font-semibold">${status}</span><br>
                <span class="text-xs text-gray-600">Confidence: ${confidence}%</span>
            `;
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
            if (container) container.innerHTML = `
                <div class="text-center text-gray-400">
                    <i class="fas fa-camera text-4xl mb-2"></i>
                    <p class="font-medium">Camera stopped</p>
                    <p class="text-xs">Click "Start Scan" to resume</p>
                </div>
            `;
            $id('scan-animation')?.classList.add('hidden');
            $id('scan-prompt')?.classList.add('hidden');
            isRunning = false;
        }
    }

    // Initialize scanner + shopping list after DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { setupScanner(); loadShoppingList(); });
    } else {
        setupScanner(); loadShoppingList();
    }

    // ================= SHOPPING LIST =================
    function addShoppingItem() {
        const input = document.getElementById('shopping-input');
        if (!input) return;
        const item = input.value.trim(); if (!item) return;
        let list = JSON.parse(localStorage.getItem('shoppingList')) || [];
        list.push(item);
        localStorage.setItem('shoppingList', JSON.stringify(list));
        input.value = '';
        loadShoppingList();
    }

    function loadShoppingList() {
        const listContainer = document.getElementById('shopping-list');
        if (!listContainer) return;
        listContainer.innerHTML = '';
        let list = JSON.parse(localStorage.getItem('shoppingList')) || [];
        list.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center bg-gray-100 px-3 py-2 rounded-lg';
            li.innerHTML = `
                <span>${item}</span>
                <button onclick="removeItem(${index})" class="text-red-500 text-xs">
                    ❌
                </button>
            `;
            listContainer.appendChild(li);
        });
    }

    function removeItem(index) {
        let list = JSON.parse(localStorage.getItem('shoppingList')) || [];
        list.splice(index,1);
        localStorage.setItem('shoppingList', JSON.stringify(list));
        loadShoppingList();
    }

    // Order links
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

    // Simple local AI helper
    function askAI() {
        const inputEl = document.getElementById('ai-input');
        const responseBox = document.getElementById('ai-response');
        if (!inputEl || !responseBox) return;
        const input = inputEl.value.toLowerCase().trim(); if (!input) return;
        if (input.includes('wheat')) responseBox.innerText = 'Store wheat flour in an airtight container in a cool, dry place. You can refrigerate it to increase shelf life.';
        else if (input.includes('rice')) responseBox.innerText = 'Store rice in an airtight container away from moisture. Keep it in a cool place to avoid insects.';
        else if (input.includes('dal') || input.includes('moong')) responseBox.innerText = 'Keep dal in sealed containers. Avoid moisture and store in a dry place.';
        else if (input.includes('smell') || input.includes('spoiled')) responseBox.innerText = 'If food smells bad or looks discolored, it is better to discard it to avoid health risks.';
        else responseBox.innerText = 'Store food in airtight containers, keep away from moisture, and check regularly for freshness.';
    }

  // ================= STOP =================
  function stopCam() {
      if (webcam) {
          webcam.stop();
          webcam = null;
      }

      const container = $id("webcam-container");

      if (container) container.innerHTML = `
          <div class="text-center text-gray-400">
              <i class="fas fa-camera text-4xl mb-2"></i>
              <p class="font-medium">Camera stopped</p>
              <p class="text-xs">Click "Start Scan" to resume</p>
          </div>
      `;

      $id("scan-animation")?.classList.add("hidden");
      $id("scan-prompt")?.classList.add("hidden");

      isRunning = false;
  }

  // expose stopCam for outer scope if needed
}

// Ensure setupScanner runs whether DOMContentLoaded fired or not
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setupScanner();
        if (typeof loadShoppingList === 'function') loadShoppingList();
    });
} else {
    setupScanner();
    if (typeof loadShoppingList === 'function') loadShoppingList();
}
// ================= SHOPPING LIST =================

// Load saved list on page load
document.addEventListener("DOMContentLoaded", () => {
    loadShoppingList();
});

function addShoppingItem() {
    const input = document.getElementById("shopping-input");
    const item = input.value.trim();

    if (item === "") return;

    let list = JSON.parse(localStorage.getItem("shoppingList")) || [];
    list.push(item);

    localStorage.setItem("shoppingList", JSON.stringify(list));

    input.value = "";
    loadShoppingList();
}

function loadShoppingList() {
    const listContainer = document.getElementById("shopping-list");
    listContainer.innerHTML = ""; 		 

    let list = JSON.parse(localStorage.getItem("shoppingList")) || [];

    list.forEach((item, index) => {
        const li = document.createElement("li");

        li.className = "flex justify-between items-center bg-gray-100 px-3 py-2 rounded-lg";

        li.innerHTML = `
            <span>${item}</span>
            <button onclick="removeItem(${index})" class="text-red-500 text-xs">
                ❌
            </button>
        `;

        listContainer.appendChild(li);
    });
}

function removeItem(index) {
    let list = JSON.parse(localStorage.getItem("shoppingList")) || [];

    list.splice(index, 1);

    localStorage.setItem("shoppingList", JSON.stringify(list));

    loadShoppingList();
}
function askAI() {
    const input = document.getElementById("ai-input").value.toLowerCase();
    const responseBox = document.getElementById("ai-response");

    if (!input.trim()) return;

    // SIMPLE SMART RESPONSES (NO API NEEDED)

    if (input.includes("wheat")) {
        responseBox.innerText = "Store wheat flour in an airtight container in a cool, dry place. You can refrigerate it to increase shelf life.";
    }
    else if (input.includes("rice")) {
        responseBox.innerText = "Store rice in an airtight container away from moisture. Keep it in a cool place to avoid insects.";
    }
    else if (input.includes("dal") || input.includes("moong")) {
        responseBox.innerText = "Keep dal in sealed containers. Avoid moisture and store in a dry place.";
    }
    else if (input.includes("smell") || input.includes("spoiled")) {
        responseBox.innerText = "If food smells bad or looks discolored, it is better to discard it to avoid health risks.";
    }
    else {
        responseBox.innerText = "Store food in airtight containers, keep away from moisture, and check regularly for freshness.";
    }
}
