/**
 * ═══════════════════════════════════════════════════════
 * VIBE AGENT SDK v1.0 (MVP)
 * Incluye: Visibility, Price Comparison, Rage Clicks, Ping-Pong & Beacon API
 * ═══════════════════════════════════════════════════════
 */

(function () {
    // ────────────────────────────────────────────────────────
    // 1. CONFIGURACIÓN & ESTADO
    // ────────────────────────────────────────────────────────
    const CONFIG = {
        api_endpoint: ' https://lannie-fumiest-ricki.ngrok-free.dev/api/track',
        thresholds: {
            visibility: 0.5,      // 50% visible
            time_visible: 2000,   // 2 segundos
            rage_clicks: 3,       // 3 clicks rápidos
            rage_time: 800,       // en menos de 800ms
            doubt_pingpong: 4,    // 4 cambios de opción
            doubt_time: 10000     // en 10 segundos
        },
        colors: {
            rage: "#ff4d4d",   // Rojo
            doubt: "#ffc107",  // Amarillo
            agent: "#212529"   // Negro
        }
    };

    // Estado interno (Memoria a corto plazo)
    let history = {
        clicks: [],
        options: []
    };

    // ── SESSION ID (identifica al usuario durante la sesión) ──
    function generateSessionId() {
        var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var id = '';
        for (var i = 0; i < 16; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    }

    if (!sessionStorage.getItem('vibe_session_id')) {
        sessionStorage.setItem('vibe_session_id', generateSessionId());
    }
    var SESSION_ID = sessionStorage.getItem('vibe_session_id');
    console.log('🎫 Vibe Session ID:', SESSION_ID);

    // ────────────────────────────────────────────────────────
    // 2. CAPA DE RED (NETWORK LAYER)
    // ────────────────────────────────────────────────────────

    /**
     * Envía eventos al Backend usando Beacon API (Persistente)
     */
    /**
     * Envía eventos y ESPERA RESPUESTA del Backend (Smart Fetch)
     */
    function sendVibeEvent(eventType, data) {
        const payload = {
            event_type: eventType,
            element_id: data.elementId || 'unknown',
            meta: data.meta || {},
            timestamp: new Date().toISOString(),
            url: window.location.href,
            session_id: SESSION_ID
        };

        // Usamos fetch para poder recibir la respuesta del cerebro (Python)
        fetch(CONFIG.api_endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            },
            body: JSON.stringify(payload)
        })
            .then(response => response.json())
            .then(data => {
                // 🧠 CEREBRO ACTIVO: Si el backend manda una acción, la ejecutamos
                console.log("📥 Respuesta del Agente:", data);

                if (data.action === 'toast' && data.message) {
                    // UI es accesible porque está en el scope del closure
                    UI.speak(data.message, data.emotion || 'agent', data.button || 'none');
                }
            })
            .catch(err => console.error('❌ Error de conexión:', err));
    }

    function fallbackFetch(payload) {
        fetch(CONFIG.api_endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true
        }).catch(err => console.error('❌ Vibe Sync Error:', err));
    }

    // ────────────────────────────────────────────────────────
    // 3. CAPA DE UI PREMIUM (TOAST NOTIFICATIONS)
    // ────────────────────────────────────────────────────────

    function initUI() {
        const style = document.createElement('style');
        style.innerHTML = `
            .vibe-toast {
                position: fixed; bottom: 24px; right: 24px;
                background: #ffffff; color: #1a1a1a; padding: 16px 20px;
                border-radius: 12px; 
                box-shadow: 0 10px 40px -10px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.1);
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 14px; line-height: 1.4; z-index: 2147483647; /* Máximo z-index posible */
                transform: translateY(120px) scale(0.95); opacity: 0; 
                transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease;
                display: flex; flex-direction: column; gap: 12px; 
                border-left: 5px solid #1a1a1a;
                max-width: 340px; min-width: 280px;
                box-sizing: border-box;
            }
            .vibe-toast.visible { 
                transform: translateY(0) scale(1); opacity: 1; 
            }
            .vibe-toast-header { 
                display: flex; align-items: flex-start; gap: 12px; 
            }
            .vibe-icon-wrapper {
                background: #f3f4f6; border-radius: 50%; width: 32px; height: 32px;
                display: flex; align-items: center; justify-content: center; flex-shrink: 0;
                font-size: 16px;
            }
            .vibe-message { font-weight: 500; margin-top: 6px; }
            .vibe-actions { display: flex; gap: 10px; margin-top: 4px; }
            
            .vibe-btn {
                display: flex; align-items: center; justify-content: center; gap: 6px;
                border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer;
                font-size: 13px; font-weight: 600; font-family: inherit;
                transition: all 0.2s ease; width: 100%;
            }
            .vibe-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
            .vibe-btn:active { transform: translateY(0); }
            
            /* Botón WhatsApp */
            .vibe-btn--whatsapp { background: #25D366; color: white; }
            .vibe-btn--whatsapp:hover { background: #22bf5b; }
            
            /* Botón Checkout */
            .vibe-btn--checkout { background: #000000; color: white; }
            .vibe-btn--checkout:hover { background: #333333; }
        `;
        document.head.appendChild(style);

        const toast = document.createElement('div');
        toast.className = 'vibe-toast';
        document.body.appendChild(toast);

        // Íconos SVG puros
        const ICONS = {
            whatsapp: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>`,
            checkout: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>`
        };

        const BUTTON_CONFIG = {
            whatsapp: {
                text: 'Consultar por WhatsApp',
                className: 'vibe-btn vibe-btn--whatsapp',
                icon: ICONS.whatsapp,
                action: function () {
                    // Número hardcodeado para la demo MVP
                    window.open('https://wa.me/5491100000000?text=Hola,%20tengo%20una%20duda%20en%20la%20tienda', '_blank');
                }
            },
            checkout: {
                text: 'Ir a Pagar',
                className: 'vibe-btn vibe-btn--checkout',
                icon: ICONS.checkout,
                action: function () {
                    window.location.href = '/checkout';
                }
            }
        };

        return {
            speak: function (message, emotion, buttonType) {
                emotion = emotion || 'agent';
                buttonType = buttonType || 'none';

                // Definir emoji del Agente según emoción
                let agentEmoji = '🤖';
                if (emotion === 'rage') agentEmoji = '🆘';
                if (emotion === 'doubt') agentEmoji = '💡';

                var html = '<div class="vibe-toast-header">';
                html += '<div class="vibe-icon-wrapper">' + agentEmoji + '</div>';
                html += '<div class="vibe-message">' + message + '</div>';
                html += '</div>';

                if (buttonType !== 'none' && BUTTON_CONFIG[buttonType]) {
                    html += '<div class="vibe-actions">';
                    html += '<button class="' + BUTTON_CONFIG[buttonType].className + '" id="vibe-action-btn">';
                    html += BUTTON_CONFIG[buttonType].icon + ' ' + BUTTON_CONFIG[buttonType].text;
                    html += '</button>';
                    html += '</div>';
                }

                toast.innerHTML = html;
                toast.style.borderLeftColor = CONFIG.colors[emotion] || CONFIG.colors.agent;
                toast.classList.add('visible');

                if (buttonType !== 'none' && BUTTON_CONFIG[buttonType]) {
                    var actionBtn = document.getElementById('vibe-action-btn');
                    if (actionBtn) {
                        actionBtn.addEventListener('click', BUTTON_CONFIG[buttonType].action);
                    }
                }

                setTimeout(function () { toast.classList.remove('visible'); }, 8000);
            }
        };
    }

    const UI = initUI(); // Inicializamos la UI

    // ────────────────────────────────────────────────────────
    // 4. SENSORES (TRACKERS)
    // ────────────────────────────────────────────────────────

    /**
     * SENSOR 1: Visibilidad Real (IntersectionObserver)
     */
    function initVisibilityTracker() {
        const elementTimers = new Map();
        const observedAt = new Map();

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const element = entry.target;
                const elementId = element.id || element.getAttribute('data-vibe-id') || 'unknown';

                if (entry.isIntersecting && entry.intersectionRatio >= CONFIG.thresholds.visibility) {
                    // Entró en vista
                    if (!observedAt.has(element)) observedAt.set(element, Date.now());
                    if (elementTimers.has(element)) clearTimeout(elementTimers.get(element));

                    // Iniciar Timer
                    const timerId = setTimeout(() => {
                        const timeVisible = Date.now() - observedAt.get(element);

                        console.log(`👁️ Interés confirmado: ${elementId}`);
                        sendVibeEvent('interest', {
                            elementId: elementId,
                            meta: { time_visible: timeVisible, type: 'visual_focus' }
                        });

                        observer.unobserve(element); // Dejar de observar
                        elementTimers.delete(element);
                    }, CONFIG.thresholds.time_visible);

                    elementTimers.set(element, timerId);
                } else {
                    // Salió de vista (Reset)
                    if (elementTimers.has(element)) {
                        clearTimeout(elementTimers.get(element));
                        elementTimers.delete(element);
                    }
                }
            });
        }, { threshold: CONFIG.thresholds.visibility });

        document.querySelectorAll('[data-vibe="track"]').forEach(el => observer.observe(el));
    }

    /**
     * SENSOR 2: Comparación de Precios (Selection API)
     */
    function initSelectionTracker() {
        document.addEventListener('mouseup', () => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return;

            const text = selection.toString().trim();
            if (text.length <= 3) return; // Ruido

            // Obtener contexto (Padre con ID o Clase)
            let node = selection.anchorNode;
            let context = 'unknown';
            let elId = 'unknown';

            if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;

            // Subir hasta encontrar algo útil
            let curr = node;
            while (curr && curr !== document.body) {
                if (curr.id) { context = `#${curr.id}`; elId = curr.id; break; }
                if (curr.className) { context = `.${curr.className.split(' ')[0]}`; break; }
                curr = curr.parentElement;
            }

            console.log(`✂️ Selección: "${text}" en ${context}`);
            sendVibeEvent('compare_price', {
                elementId: elId,
                meta: { text_selected: text, context_selector: context }
            });
        });
    }

    /**
     * SENSOR 3: Comportamiento (Rage Click & Ping Pong)
     */
    function initBehaviorTracker() {
        document.addEventListener('click', (event) => {
            const now = Date.now();

            // A) RAGE CLICK
            const btn = event.target.closest('button, .btn, a');
            if (btn) {
                history.clicks.push({ x: event.clientX, y: event.clientY, time: now });
                history.clicks = history.clicks.filter(c => (now - c.time) < CONFIG.thresholds.rage_time);

                if (history.clicks.length >= CONFIG.thresholds.rage_clicks) {
                    // Detección confirmada: Solo avisamos al backend
                    sendVibeEvent('rage_click', {
                        elementId: btn.id || btn.innerText || 'unknown_button',
                        meta: { click_count: history.clicks.length }
                    });
                    history.clicks = []; // Reset
                    return;
                }
            }

            // B) PING PONG (Duda entre opciones)
            const option = event.target.closest('[data-vibe="option"]');
            if (option) {
                const val = option.getAttribute('data-value') || option.innerText;
                history.options.push({ val: val, time: now });
                history.options = history.options.filter(o => (now - o.time) < CONFIG.thresholds.doubt_time);

                if (history.options.length >= CONFIG.thresholds.doubt_pingpong) {
                    const unique = new Set(history.options.map(o => o.val));
                    if (unique.size >= 2) {
                        // Detección confirmada: Solo avisamos al backend
                        sendVibeEvent('hesitation', {
                            elementId: 'option_selector',
                            meta: { options_compared: Array.from(unique) }
                        });
                        history.options = []; // Reset
                    }
                }
            }
        });
    }

    // ────────────────────────────────────────────────────────
    // 5. INICIALIZACIÓN MAESTRA
    // ────────────────────────────────────────────────────────
    function init() {
        console.log("🚀 Vibe Agent v1.0: Cargado y Observando.");
        initVisibilityTracker();
        initSelectionTracker();
        initBehaviorTracker();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();