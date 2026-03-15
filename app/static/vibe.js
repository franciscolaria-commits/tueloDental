/**
 * ═══════════════════════════════════════════════════════
 * VIBE AGENT SDK v2.0 (Agnostic & Chat UI)
 * ═══════════════════════════════════════════════════════
 */

(function () {
    // ────────────────────────────────────────────────────────
    // 1. CONFIGURACIÓN & ESTADO
    // ────────────────────────────────────────────────────────
    const CONFIG = {
        api_endpoint: window.VIBE_API_URL || 'http://localhost:8000/api/track', // Para prod: defini window.VIBE_API_URL antes de cargar este script
        thresholds: {
            visibility: 0.5,
            time_visible: 2000,
            rage_clicks: 3,
            rage_time: 800,
            doubt_pingpong: 4,
            doubt_time: 10000
        },
        colors: {
            primary: "#000000",
            bg: "#ffffff",
            userMsg: "#f0f0f0",
            agentMsg: "#000000",
            whatsapp: "#25D366"
        }
    };

    // CAPTURA DEL TENANT ID (Fase 2) - Declarado una sola vez
    const currentScript = document.currentScript;
    const STORE_ID = currentScript?.getAttribute('data-store-id') || window.VIBE_STORE_ID || window.location.hostname || "unknown_store";

    // API GLOBAL PARA INYECCIÓN DE CONTEXTO (Fase 3) - Declarado una sola vez
    window.VibeAgent = {
        context: {
            cart: {} // Acá las tiendas inyectarán el objeto del carrito
        },
        updateCart: function (cartData) {
            this.context.cart = cartData;
            console.log("🛒 [VibeAgent] Carrito actualizado:", this.context.cart);
        }
    };

    let history = { clicks: [], options: [] };

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
    // 2. EXTRACCIÓN AGNÓSTICA DEL PRODUCTO (Cerebro Frontend)
    // ────────────────────────────────────────────────────────
    function getUniversalProductName() {
        // 1. Open Graph Meta tag
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle && ogTitle.content) {
            return ogTitle.content.trim();
        }

        // 2. JSON-LD Schema.org
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (let i = 0; i < scripts.length; i++) {
            try {
                const data = JSON.parse(scripts[i].innerText);
                const items = Array.isArray(data) ? data : [data];
                for (let j = 0; j < items.length; j++) {
                    const item = items[j];
                    if (item['@type'] === 'Product' && item.name) {
                        return item.name.trim();
                    }
                    if (item['@graph']) {
                        const productNode = item['@graph'].find(node => node['@type'] === 'Product');
                        if (productNode && productNode.name) return productNode.name.trim();
                    }
                }
            } catch (e) {
                // Ignore parse errors for badly formatted JSON-LD
            }
        }

        // 3. FALLBACK: Meta tags de Meta Ads / Google Shopping
        const metaAdsSources = [
            document.querySelector('meta[property="product:title"]'),
            document.querySelector('meta[name="title"]'),
            document.querySelector('meta[itemprop="name"]'),
            document.querySelector('meta[name="twitter:title"]'),
        ];
        for (const meta of metaAdsSources) {
            if (meta && meta.content && meta.content.trim().length > 2) {
                return meta.content.trim();
            }
        }

        // 4. Google Shopping: itemprop=name en el body
        const itempropName = document.querySelector('[itemprop="name"]');
        if (itempropName && itempropName.innerText && itempropName.innerText.trim().length > 2) {
            return itempropName.innerText.trim();
        }

        // 5. Ultimo fallback: document.title
        let title = document.title;
        title = title.split(' - ')[0];
        title = title.split(' | ')[0];
        return title.trim() || 'Producto Desconocido';
    }


    // ────────────────────────────────────────────────────────
    // 3. INTERFAZ DE CHAT (UI)
    // ────────────────────────────────────────────────────────
    function initChatUI() {
        const style = document.createElement('style');
        style.innerHTML = `
            .vibe-chat-widget {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 2147483647;
                font-family: system-ui, -apple-system, sans-serif;
            }
            .vibe-chat-toggle {
                width: 60px;
                height: 60px;
                border-radius: 50%;
                background-color: ${CONFIG.colors.primary};
                color: #fff;
                border: none;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.2s ease;
            }
            .vibe-chat-toggle:hover {
                transform: scale(1.05);
            }
            .vibe-chat-window {
                position: absolute;
                bottom: 80px;
                right: 0;
                width: 350px;
                height: 500px;
                max-height: calc(100vh - 120px);
                background: #fff;
                border-radius: 16px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.1);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                opacity: 0;
                visibility: hidden;
                transform: translateY(20px) scale(0.95);
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                transform-origin: bottom right;
            }
            .vibe-chat-window.open {
                opacity: 1;
                visibility: visible;
                transform: translateY(0) scale(1);
            }
            .vibe-chat-header {
                background: ${CONFIG.colors.primary};
                color: #fff;
                padding: 16px;
                font-weight: 600;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .vibe-chat-header button {
                background: none;
                border: none;
                color: #fff;
                cursor: pointer;
                font-size: 20px;
                line-height: 1;
            }
            .vibe-chat-messages {
                flex: 1;
                padding: 16px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 12px;
                background: #fdfdfd;
            }
            .vibe-chat-messages::-webkit-scrollbar { width: 6px; }
            .vibe-chat-messages::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }
            
            .vibe-msg {
                max-width: 85%;
                padding: 12px 16px;
                border-radius: 12px;
                font-size: 14px;
                line-height: 1.4;
                animation: vibeFadeInUp 0.3s ease forwards;
            }
            @keyframes vibeFadeInUp {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .vibe-msg.agent {
                background: ${CONFIG.colors.agentMsg};
                color: #fff;
                align-self: flex-start;
                border-bottom-left-radius: 4px;
            }
            .vibe-msg.user {
                background: ${CONFIG.colors.userMsg};
                color: #1a1a1a;
                align-self: flex-end;
                border-bottom-right-radius: 4px;
            }
            .vibe-chat-input-area {
                padding: 16px;
                background: #fff;
                border-top: 1px solid #eee;
                display: flex;
                gap: 8px;
            }
            .vibe-chat-input {
                flex: 1;
                border: 1px solid #ddd;
                border-radius: 20px;
                padding: 10px 16px;
                font-size: 14px;
                outline: none;
                font-family: inherit;
            }
            .vibe-chat-input:focus {
                border-color: ${CONFIG.colors.primary};
            }
            .vibe-chat-send {
                background: ${CONFIG.colors.primary};
                color: white;
                border: none;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .vibe-btn-action {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 10px 16px;
                border-radius: 8px;
                border: none;
                color: white;
                font-weight: 600;
                cursor: pointer;
                margin-top: 8px;
                text-decoration: none;
                font-size: 13px;
                font-family: inherit;
            }
            .vibe-btn-whatsapp {
                background: ${CONFIG.colors.whatsapp};
            }
            .vibe-btn-whatsapp:hover {
                background: #22bf5b;
            }
            .vibe-btn-checkout {
                background: #000000;
                color: #ffffff;
            }
            .vibe-btn-checkout:hover {
                background: #333333;
            }
        `;
        document.head.appendChild(style);

        const widget = document.createElement('div');
        widget.className = 'vibe-chat-widget';

        widget.innerHTML = `
            <div class="vibe-chat-window" id="vibeChatWindow">
                <div class="vibe-chat-header">
                    <span>Vibe Assistant</span>
                    <button id="vibeChatClose">&times;</button>
                </div>
                <div class="vibe-chat-messages" id="vibeChatMessages">
                </div>
                <div class="vibe-chat-input-area">
                    <input type="text" class="vibe-chat-input" id="vibeChatInput" placeholder="Escribe un mensaje..." autocomplete="off">
                    <button class="vibe-chat-send" id="vibeChatSend">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                </div>
            </div>
            <button class="vibe-chat-toggle" id="vibeChatToggle">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="vibeChatOpenIcon"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" id="vibeChatCloseIcon" style="display: none;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;
        document.body.appendChild(widget);

        const chatWindow = document.getElementById('vibeChatWindow');
        const chatToggle = document.getElementById('vibeChatToggle');
        const chatClose = document.getElementById('vibeChatClose');
        const openIcon = document.getElementById('vibeChatOpenIcon');
        const closeIcon = document.getElementById('vibeChatCloseIcon');
        const messagesArea = document.getElementById('vibeChatMessages');
        const chatInput = document.getElementById('vibeChatInput');
        const chatSendBtn = document.getElementById('vibeChatSend');

        let isOpen = false;

        function toggleChat(forceOpen = false) {
            isOpen = forceOpen ? true : !isOpen;
            if (isOpen) {
                chatWindow.classList.add('open');
                openIcon.style.display = 'none';
                closeIcon.style.display = 'block';
                chatInput.focus();
            } else {
                chatWindow.classList.remove('open');
                openIcon.style.display = 'block';
                closeIcon.style.display = 'none';
            }
        }

        chatToggle.addEventListener('click', () => toggleChat());
        chatClose.addEventListener('click', () => toggleChat(false));

        function addMessage(text, sender = 'agent', options = {}) {
            const msgDiv = document.createElement('div');
            msgDiv.className = `vibe-msg ${sender}`;
            msgDiv.innerText = text;

            if (options.button === 'whatsapp') {
                const btn = document.createElement('a');
                btn.className = 'vibe-btn-action vibe-btn-whatsapp';
                btn.href = 'https://wa.me/5491100000000?text=Hola,%20tengo%20una%20duda%20en%20la%20tienda';
                btn.target = '_blank';
                btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg> WhatsApp`;

                const wrapper = document.createElement('div');
                wrapper.className = `vibe-msg ${sender}`;
                wrapper.style.display = 'flex';
                wrapper.style.flexDirection = 'column';
                wrapper.style.alignItems = 'flex-start';

                const textSpan = document.createElement('span');
                textSpan.innerText = text;
                wrapper.appendChild(textSpan);
                wrapper.appendChild(btn);

                messagesArea.appendChild(wrapper);
            } else {
                messagesArea.appendChild(msgDiv);
            }

            messagesArea.scrollTop = messagesArea.scrollHeight;
        }

        async function handleSend() {
            const text = chatInput.value.trim();
            if (!text) return;
            addMessage(text, 'user');
            chatInput.value = '';

            // Leer directamente de la API Global Push
            const cartData = window.VibeAgent.context.cart;
            sendVibeEvent('chat_message', { meta: { text: text }, cart: cartData });
        }

        chatSendBtn.addEventListener('click', handleSend);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSend();
        });

        let streamingBubble = null;
        let streamingBubbleWrapper = null;
        let isInsideTag = false;

        function createEmptyAgentBubble() {
            streamingBubbleWrapper = document.createElement('div');
            streamingBubbleWrapper.className = 'vibe-msg agent';
            streamingBubbleWrapper.style.display = 'flex';
            streamingBubbleWrapper.style.flexDirection = 'column';
            streamingBubbleWrapper.style.alignItems = 'flex-start';

            streamingBubble = document.createElement('span');
            streamingBubbleWrapper.appendChild(streamingBubble);

            messagesArea.appendChild(streamingBubbleWrapper);
            messagesArea.scrollTop = messagesArea.scrollHeight;
            isInsideTag = false;
        }

        function appendStreamChunk(text) {
            if (streamingBubble) {
                let visibleText = "";
                for (let i = 0; i < text.length; i++) {
                    let char = text[i];
                    if (char === '[') {
                        isInsideTag = true;
                    } else if (char === ']') {
                        isInsideTag = false;
                        continue;
                    }

                    if (!isInsideTag && char !== '[') {
                        visibleText += char;
                    }
                }
                streamingBubble.textContent += visibleText;
                messagesArea.scrollTop = messagesArea.scrollHeight;
            }
        }

        function finalizeStream(options = {}) {
            if (streamingBubbleWrapper && options.button === 'whatsapp') {
                const btn = document.createElement('a');
                btn.className = 'vibe-btn-action vibe-btn-whatsapp';
                btn.href = 'https://wa.me/5491100000000?text=Hola,%20tengo%20una%20duda%20en%20la%20tienda';
                btn.target = '_blank';
                btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg> WhatsApp`;
                streamingBubbleWrapper.appendChild(btn);
                messagesArea.scrollTop = messagesArea.scrollHeight;
            } else if (streamingBubbleWrapper && options.button === 'checkout') {
                const btn = document.createElement('button');
                btn.className = 'vibe-btn-action vibe-btn-checkout';
                btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg> Agregar al Carrito`;

                btn.addEventListener('click', () => {
                    const selectors = [
                        'button[name="add"]',
                        'form[action*="/cart/add"] button[type="submit"]',
                        '[data-testid="add-to-cart"]',
                        '[data-js-product-form-add-to-cart]',
                        '.js-add-to-cart',
                        'button[data-action="add-to-cart"]',
                        'input[name="add-to-cart"]',
                        'button.single_add_to_cart_button',
                        '.woocommerce button[type="submit"]',
                        'button.add_to_cart_button',
                        '#add-to-cart',
                        '.btn-add-to-cart',
                        '#add_to_cart button',
                        '.vtex-store-components-3-x-buyButton',
                        '[class*="buyButton"]',
                        '[data-store-buyButton]',
                        '.js-addtocart',
                        'button[data-add-to-cart]',
                        'button[id*="add-to-cart"]',
                        'button[id*="addtocart"]',
                        'button[class*="add-to-cart"]',
                        'button[class*="addtocart"]',
                        'button[class*="comprar"]',
                        'a[class*="add-to-cart"]',
                        '.btn-comprar',
                        '#btn-comprar',
                        '[data-add-to-cart]',
                    ];

                    let addToCartBtn = null;
                    for (const selector of selectors) {
                        try {
                            const found = document.querySelector(selector);
                            if (found && !found.disabled) {
                                addToCartBtn = found;
                                break;
                            }
                        } catch (e) { }
                    }

                    if (addToCartBtn) {
                        console.log('🛒 Vibe: Clickeando botón nativo de agregar al carrito:', addToCartBtn);
                        addToCartBtn.click();
                    } else {
                        const productForm = document.querySelector(
                            'form[action*="cart"], form[action*="comprar"], form[id*="product"], form[class*="product-form"]'
                        );
                        if (productForm) {
                            console.log('🛒 Vibe: Submit del formulario de producto:', productForm);
                            productForm.submit();
                        } else {
                            console.log('🛒 Vibe: Sin botón nativo, redirigiendo a /cart');
                            window.location.href = '/cart';
                        }
                    }
                });

                streamingBubbleWrapper.appendChild(btn);
                messagesArea.scrollTop = messagesArea.scrollHeight;
            } else if (streamingBubbleWrapper && options.button === 'goto_checkout') {
                const btnGo = document.createElement('button');
                btnGo.className = 'vibe-btn-action vibe-btn-checkout';
                btnGo.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Ir a Comprar`;

                btnGo.addEventListener('click', () => {
                    const checkoutSelectors = [
                        'a[href*="/checkout"]',
                        'button[class*="checkout"]',
                        'a[class*="checkout"]',
                        '[data-checkout]',
                        '.cart__checkout',
                        '#checkout',
                        'input[name="checkout"]',
                        'button[name="checkout"]',
                        '[class*="proceed-to-checkout"]',
                        '.js-checkout',
                    ];
                    let nativeBtn = null;
                    for (const sel of checkoutSelectors) {
                        try {
                            const found = document.querySelector(sel);
                            if (found && !found.disabled) { nativeBtn = found; break; }
                        } catch (e) { }
                    }

                    if (nativeBtn) {
                        console.log('🛒 Vibe: Clickeando botón nativo de checkout:', nativeBtn);
                        nativeBtn.click();
                    } else {
                        const checkoutUrl = window.VIBE_CHECKOUT_URL || '/checkout';
                        console.log('🛒 Vibe: Redirigiendo a checkout URL:', checkoutUrl);
                        window.location.href = checkoutUrl;
                    }
                });

                streamingBubbleWrapper.appendChild(btnGo);
                messagesArea.scrollTop = messagesArea.scrollHeight;
            } else if (streamingBubbleWrapper && options.button === 'catalogo') {
                const btnCat = document.createElement('button');
                btnCat.className = 'vibe-btn-action vibe-btn-checkout';
                btnCat.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"></path><path d="M9 16v-8"></path><path d="M15 16v-8"></path></svg> Ir al Catálogo`;

                btnCat.addEventListener('click', () => {
                    const catalogSelectors = [
                        'a[href*="/collections/all"]',
                        'a[href*="/productos"]',
                        'a[href*="/shop"]',
                        '.js-keep-shopping'
                    ];

                    let nativeBtn = null;
                    for (const sel of catalogSelectors) {
                        try {
                            const found = document.querySelector(sel);
                            if (found && !found.disabled) { nativeBtn = found; break; }
                        } catch (e) { }
                    }

                    if (nativeBtn) {
                        console.log('🛒 Vibe: Clickeando enlace nativo al catálogo:', nativeBtn);
                        nativeBtn.click();
                    } else {
                        const catalogUrl = window.VIBE_CATALOG_URL || '/productos';
                        console.log('🛒 Vibe: Redirigiendo URL de catálogo:', catalogUrl);
                        window.location.href = catalogUrl;
                    }
                });

                streamingBubbleWrapper.appendChild(btnCat);
                messagesArea.scrollTop = messagesArea.scrollHeight;
            }

            streamingBubble = null;
            streamingBubbleWrapper = null;
        }

        return {
            openChat: () => toggleChat(true),
            addMessage: addMessage,
            createEmptyAgentBubble: createEmptyAgentBubble,
            appendStreamChunk: appendStreamChunk,
            finalizeStream: finalizeStream
        };
    }

    const ChatUI = initChatUI();

    // ────────────────────────────────────────────────────────
    // 4. CAPA DE RED (NETWORK LAYER)
    // ────────────────────────────────────────────────────────
    async function sendVibeEvent(eventType, data) {
        const productName = getUniversalProductName();

        const payload = {
            event_type: eventType,
            element_id: productName,
            meta: data.meta || {},
            timestamp: new Date().toISOString(),
            url: window.location.href,
            session_id: SESSION_ID,
            tienda_id: STORE_ID,
            ...(data.cart ? { cart: data.cart } : {})
        };

        try {
            const response = await fetch(CONFIG.api_endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true' // <-- Fuerza a Ngrok a dejar pasar la API
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                console.error("❌ Error de red:", response.status);
                return;
            }

            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                const jsonData = await response.json();
                console.log("ℹ️ Evento procesado como JSON estático:", jsonData);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = '';
            let finalButton = null;
            let bubbleCreated = false;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                const parts = buffer.split('\n\n');
                buffer = parts.pop();

                for (const part of parts) {
                    if (part.startsWith('data: ')) {
                        const jsonStr = part.substring(6).trim();
                        if (jsonStr === '[DONE]') continue;

                        try {
                            const parsedData = JSON.parse(jsonStr);

                            if (!bubbleCreated && (parsedData.chunk || parsedData.button)) {
                                ChatUI.openChat();
                                ChatUI.createEmptyAgentBubble();
                                bubbleCreated = true;
                            }

                            if (parsedData.chunk && bubbleCreated) {
                                ChatUI.appendStreamChunk(parsedData.chunk);
                            }
                            if (parsedData.button) {
                                finalButton = parsedData.button;
                            }
                        } catch (e) {
                            console.error('Error parseando JSON del SSE:', e, jsonStr);
                        }
                    }
                }
            }

            if (buffer.trim().startsWith('data: ')) {
                const jsonStr = buffer.trim().substring(6).trim();
                if (jsonStr !== '[DONE]') {
                    try {
                        const parsedData = JSON.parse(jsonStr);

                        if (!bubbleCreated && (parsedData.chunk || parsedData.button)) {
                            ChatUI.openChat();
                            ChatUI.createEmptyAgentBubble();
                            bubbleCreated = true;
                        }

                        if (parsedData.chunk && bubbleCreated) {
                            ChatUI.appendStreamChunk(parsedData.chunk);
                        }
                        if (parsedData.button) {
                            finalButton = parsedData.button;
                        }
                    } catch (e) {
                        console.error('Error parseando final JSON chunk:', e);
                    }
                }
            }

            if (bubbleCreated) {
                ChatUI.finalizeStream({ button: finalButton });
            }

        } catch (err) {
            console.error('❌ Error enviando evento o procesando stream:', err);
        }
    }

    // ────────────────────────────────────────────────────────
    // 5. SENSORES (TRACKERS)
    // ────────────────────────────────────────────────────────
    function initVisibilityTracker() {
        const elementTimers = new Map();
        const observedAt = new Map();

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const element = entry.target;

                if (entry.isIntersecting && entry.intersectionRatio >= CONFIG.thresholds.visibility) {
                    if (!observedAt.has(element)) observedAt.set(element, Date.now());
                    if (elementTimers.has(element)) clearTimeout(elementTimers.get(element));

                    const timerId = setTimeout(() => {
                        const timeVisible = Date.now() - observedAt.get(element);
                        console.log(`👁️ Interés confirmado`);
                        sendVibeEvent('interest', {
                            meta: { time_visible: timeVisible, type: 'visual_focus' }
                        });

                        observer.unobserve(element);
                        elementTimers.delete(element);
                    }, CONFIG.thresholds.time_visible);

                    elementTimers.set(element, timerId);
                } else {
                    if (elementTimers.has(element)) {
                        clearTimeout(elementTimers.get(element));
                        elementTimers.delete(element);
                    }
                }
            });
        }, { threshold: CONFIG.thresholds.visibility });

        document.querySelectorAll('[data-vibe="track"]').forEach(el => observer.observe(el));
    }

    function initSelectionTracker() {
        document.addEventListener('mouseup', () => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return;

            const text = selection.toString().trim();
            if (text.length <= 3) return;

            let node = selection.anchorNode;
            let context = 'unknown';

            if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;

            let curr = node;
            while (curr && curr !== document.body) {
                if (curr.id) { context = `#${curr.id}`; break; }
                if (curr.className) { context = `.${curr.className.split(' ')[0]}`; break; }
                curr = curr.parentElement;
            }

            console.log(`✂️ Selección: "${text}" en ${context}`);
            sendVibeEvent('compare_price', {
                meta: { text_selected: text, context_selector: context }
            });
        });
    }

    function initBehaviorTracker() {
        let doubtTimer = null;

        document.addEventListener('click', (event) => {
            const now = Date.now();

            // A) RAGE CLICK
            const btn = event.target.closest('button, .btn, a');
            if (btn) {
                history.clicks.push({ x: event.clientX, y: event.clientY, time: now });
                history.clicks = history.clicks.filter(c => (now - c.time) < CONFIG.thresholds.rage_time);

                if (history.clicks.length >= CONFIG.thresholds.rage_clicks) {
                    sendVibeEvent('rage_click', {
                        meta: { click_count: history.clicks.length }
                    });
                    history.clicks = [];
                    return;
                }
            }

            // B) PING PONG
            const option = event.target.closest('[data-vibe="option"]');
            if (option) {
                const val = option.getAttribute('data-value') || option.innerText;
                history.options.push({ val: val, time: now });
                history.options = history.options.filter(o => (now - o.time) < CONFIG.thresholds.doubt_time);

                if (doubtTimer) clearTimeout(doubtTimer);

                doubtTimer = setTimeout(() => {
                    if (history.options.length >= CONFIG.thresholds.doubt_pingpong) {
                        const unique = new Set(history.options.map(o => o.val));
                        if (unique.size >= 2) {
                            sendVibeEvent('hesitation', {
                                meta: { options_compared: Array.from(unique) }
                            });
                            ChatUI.openChat();
                            history.options = [];
                        }
                    }
                }, 2000);
            }
        });
    }

    // ────────────────────────────────────────────────────────
    // 6. PIXEL DE CONVERSIÓN (B2B SaaS)
    // ────────────────────────────────────────────────────────
    function initConversionTracker() {
        // Prevenir envío duplicado por sesión
        if (sessionStorage.getItem('vibe_conversion_tracked')) return;

        let isConverted = false;
        let totalValue = 0.0;
        const currentUrl = window.location.href.toLowerCase();

        // Estrategia 1: Detectar URLs genéricas de éxito
        const successKeywords = ['/checkout/success', '/thank-you', '/orders/', '/order-confirmation'];
        if (successKeywords.some(keyword => currentUrl.includes(keyword))) {
            isConverted = true;
            const totalElements = document.querySelectorAll('.order-total, .cart-total, [data-checkout-total]');
            if (totalElements.length > 0) {
                let textTotal = totalElements[0].innerText.replace(/[^0-9.,]/g, '');
                if (textTotal) {
                    textTotal = textTotal.replace(',', '.');
                    totalValue = parseFloat(textTotal) || 0;
                }
            }
        }

        // Estrategia 2: DataLayer de Google Tag Manager (GTM)
        if (!isConverted && typeof window.dataLayer !== 'undefined' && Array.isArray(window.dataLayer)) {
            for (let i = 0; i < window.dataLayer.length; i++) {
                const dlEvent = window.dataLayer[i];
                if (dlEvent && (dlEvent.event === 'purchase' || dlEvent.event === 'transaction')) {
                    isConverted = true;
                    if (dlEvent.ecommerce && dlEvent.ecommerce.value) {
                        totalValue = parseFloat(dlEvent.ecommerce.value);
                    } else if (dlEvent.revenue) {
                        totalValue = parseFloat(dlEvent.revenue);
                    }
                    break;
                }
            }
        }

        if (isConverted) {
            console.log(`🎉 [Vibe] Conversión detectada. Valor estimado: $${totalValue}`);
            // Reportar backend
            const conversionEndpoint = CONFIG.api_endpoint.replace('/track', '/conversion');

            fetch(conversionEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: SESSION_ID,
                    tienda_id: STORE_ID,
                    total_value: totalValue
                })
            }).then(r => {
                if (r.ok) {
                    sessionStorage.setItem('vibe_conversion_tracked', 'true');
                    console.log('✅ [Vibe] Conversión imputada exitosamente al Dashboard B2B.');
                }
            }).catch(e => console.error('Error enviando conversión:', e));
        }
    }

    function init() {
        console.log("🚀 Vibe Agent v2.0 (Chat UI Agnostic): Cargado y Observando.");
        initVisibilityTracker();
        initSelectionTracker();
        initBehaviorTracker();
        initConversionTracker();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // EXPORT PARA TESTING LOCAL
    window.ChatUI = ChatUI;

})();