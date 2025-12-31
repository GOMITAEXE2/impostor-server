// ==========================================
// 1. BASE DE DATOS DE RESPALDO
// ==========================================
// Esta variable tiene los datos "de fábrica". Si fallan los JSON, se usa esto.
var DB = {
    games: ["Minecraft", "Fortnite", "GTA V", "Roblox", "League of Legends", "Among Us", "Call of Duty", "FIFA", "Clash Royale", "Free Fire", "Brawl Stars", "Candy Crush", "Pokémon GO", "Valorant", "CS:GO", "Mario Kart", "Zelda", "God of War", "Elden Ring", "Cyberpunk 2077", "Skyrim", "Resident Evil", "FNAF", "Terraria", "Sims 4", "Mortal Kombat", "Pac-Man", "Tetris", "Sonic", "Crash Bandicoot"],
    movies: ["Titanic", "Avatar", "Star Wars", "El Padrino", "Avengers", "Batman", "Joker", "Spider-Man", "Jurassic Park", "El Rey León", "Shrek", "Toy Story", "Frozen", "Coco", "Piratas del Caribe", "Rápidos y Furiosos", "Rocky", "Matrix", "Indiana Jones", "E.T.", "Gladiador", "El Exorcista", "Tiburón", "Barbie", "Oppenheimer", "Harry Potter", "El Señor de los Anillos"],
    places: ["Aeropuerto", "Hospital", "Escuela", "Supermercado", "Cine", "Playa", "Parque", "Cementerio", "Gimnasio", "Biblioteca", "Hotel", "Restaurante", "Estadio", "Iglesia", "Banco", "Cárcel", "Museo", "Teatro", "Shopping", "Farmacia", "Gasolinera", "Casino", "Comisaría", "Discoteca", "Castillo", "Cueva", "Isla", "Montaña", "Bosque", "Desierto"],
    football: ["Messi", "Maradona", "CR7", "Pelé", "Mbappé", "Neymar", "Haaland", "Ronaldinho", "Zidane", "Ronaldo Nazário"]
};

// Lista de archivos externos que querés cargar para ACTUALIZAR O EXPANDIR la DB.
const archivosExternos = [
    '../DATA/VideojuegosData.json',
    '../DATA/FotballData.json',
    '../DATA/LugaresData.json',
    '../DATA/PeliculasySeriesData.json'
];

// ==========================================
// 2. CARGA INICIAL 
// ==========================================
window.addEventListener('load', function() {
    console.log("Iniciando sistema...");

    // 1. Preparamos las promesas de carga
    var promesas = archivosExternos.map(function(archivo) {
        return fetch(archivo).then(function(respuesta) {
            if (!respuesta.ok) throw new Error("Fallo al cargar " + archivo);
            return respuesta.json();
        });
    });

    // 2. Intentamos cargar TODO
    Promise.all(promesas)
        .then(function(datosNuevos) {
            // SI LLEGAMOS ACÁ, SIGNIFICA QUE TODO CARGÓ JOYA 🟢
            console.log("¡Archivos externos cargados! Actualizando base de datos...");
            
            // Mezclamos los datos nuevos en la variable DB existente
            datosNuevos.forEach(function(data) {
                // Object.assign fusiona los datos sin borrar lo que no se toque
                Object.assign(DB, data);
            });
            console.log("Base de datos final:", DB);
        })
        .catch(function(error) {
            console.warn("⚠️ Hubo un drama con los JSON externos:", error);
            console.log("🛡️ ACTIVANDO PROTOCOLO DE RESPALDO: Usando base de datos interna.");
            // el juego sigue usando los datos hardcodeados del principio.
        })
        .finally(function() {
            // ESTO SE EJECUTA SIEMPRE (Haya error o no), para configurar la UI
            iniciarInterfaz();
        });
});

// Función auxiliar para no repetir código en el finally
function iniciarInterfaz() {
    try { 
        var cw = document.getElementById('local-custom-input'); 
        if(localStorage.getItem('imp_cw') && cw) cw.value = localStorage.getItem('imp_cw'); 
    } catch(e){}
    try { toggleLocalPanel('time'); toggleLocalPanel('hint'); toggleOnlinePanel('time'); } catch(e) {}
}

// ==========================================
// 3. NAVEGACIÓN Y UTILIDADES
// ==========================================
function showScreen(id) { 
    var sections = document.querySelectorAll('section');
    for(var i=0; i<sections.length; i++) sections[i].classList.add('hidden');
    var t = document.getElementById(id); if(t) t.classList.remove('hidden');
    document.getElementById('result-modal').classList.add('hidden');
    document.getElementById('system-modal').classList.add('hidden');
    document.getElementById('donation-modal').classList.add('hidden');
}
function goToLocal() { showScreen('local-setup'); }
function goToOnline() { showScreen('online-menu'); }
function fmtTime(s) { var m = Math.floor(s/60).toString().padStart(2,'0'); var sec = (s%60).toString().padStart(2,'0'); return m + ":" + sec; }

function getSafeWordObj(rawItem, cantidad) {
    // Si no pasan cantidad, asumimos 0
    if (typeof cantidad === 'undefined') cantidad = 0;

    // CASO 1: Dato viejo o error de carga (String)
    if (typeof rawItem === 'string') {
        return { name: rawItem, hints: ["Sin pistas disponibles."] };
    }

    // CASO 2: Dato nuevo (Array) ["Minecraft", "Pista 1", "Pista 2"...]
    if (Array.isArray(rawItem)) {
        var nombre = rawItem[0];
        
        // Si el array solo tiene el nombre, no hay pistas
        if (rawItem.length <= 1) {
             return { name: nombre, hints: ["Sin pistas en la base de datos."] };
        }

        var todasLasPistas = rawItem.slice(1); // Copiamos las pistas
        var pistasSeleccionadas = [];

        if (cantidad > 0) {
            // Mezclamos las pistas (Shuffle)
            for (let i = todasLasPistas.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [todasLasPistas[i], todasLasPistas[j]] = [todasLasPistas[j], todasLasPistas[i]];
            }
            
            // Elegimos solo la cantidad que pidió el usuario con el slider
            pistasSeleccionadas = todasLasPistas.slice(0, cantidad);
        }

        return { 
            name: nombre, 
            hints: pistasSeleccionadas 
        };
    }

    return { name: "Error", hints: ["Error de datos"] };
}

// ==========================================
// UI HELPERS (Manejo de Paneles y Sliders)
// ==========================================

// Abre o cierra los paneles (Tiempo o Pistas) con animación
function toggleLocalPanel(tipo) {
    var sw = document.getElementById('local-' + tipo + '-switch');
    // Mapeo de IDs para saber qué panel abrir
    var panelId = 'local-' + tipo + '-panel'; 
    var p = document.getElementById(panelId);

    if (sw && p) {
        if (sw.checked) {
            p.classList.add('open');
            if (tipo === 'hint') checkLocalCustom();
        } else {
            p.classList.remove('open');
        }
    }
}

function toggleOnlinePanel(tipo) {
    var sw = document.getElementById('online-' + tipo + '-switch');
    var p = document.getElementById('online-' + tipo + '-panel');
    if (sw && p) {
        if (sw.checked) p.classList.add('open');
        else p.classList.remove('open');
    }
}

// Controla qué ver: ¿Slider de cantidad o Inputs manuales?
function checkLocalCustom() {
    var catEl = document.getElementById('local-cat-select');
    if (!catEl) return;

    var esCustom = catEl.value === 'custom';
    var pistasActivadas = document.getElementById('local-hint-switch').checked;

    // 1. Mostrar/Ocultar el input gigante de palabras custom
    var inputPalabras = document.getElementById('local-custom-input');
    if (inputPalabras) {
        inputPalabras.className = esCustom ? 
            "w-full bg-slate-900 border border-slate-600 rounded p-2 text-xs text-white mt-2 block" : 
            "hidden";
    }

    // 2. Gestionar el panel de pistas (Slider vs Manual)
    var panelStandard = document.getElementById('local-standard-hints-config');
    var panelCustom = document.getElementById('local-custom-hints-config');

    if (pistasActivadas) {
        if (esCustom) {
            // Si es custom -> Ocultar Slider, Mostrar Inputs manuales
            if (panelStandard) panelStandard.classList.add('hidden');
            if (panelCustom) panelCustom.classList.remove('hidden');
        } else {
            // Si es normal -> Mostrar Slider, Ocultar Inputs manuales
            if (panelStandard) panelStandard.classList.remove('hidden');
            if (panelCustom) panelCustom.classList.add('hidden');
        }
    }
}

// ==========================================
// LÓGICA DE DATOS (El Cerebro de las Pistas)
// ==========================================
/**
 * Agarra un dato crudo (String o Array) y devuelve un objeto limpio con pistas random.
 * @param {string|Array} rawItem - El dato de la DB.
 * @param {number} cantidad - Cuántas pistas queremos (0 a 5).
 */
function getSafeWordObj(rawItem, cantidad) {
    // Si no pasan cantidad, asumimos 0 (sin pistas)
    if (typeof cantidad === 'undefined') cantidad = 0;

    // CASO 1: Dato viejo o simple string (Ej: "Minecraft")
    if (typeof rawItem === 'string') {
        return { 
            name: rawItem, 
            hints: ["Sin pistas disponibles."] 
        };
    }

    // CASO 2: Dato nuevo (Array) ["Messi", "Pista 1", "Pista 2"...]
    if (Array.isArray(rawItem)) {
        var nombre = rawItem[0];
        var todasLasPistas = rawItem.slice(1); // Copiamos las pistas (índice 1 en adelante)
        var pistasSeleccionadas = [];

        if (cantidad > 0 && todasLasPistas.length > 0) {
            // Mezclamos las pistas (Shuffle) para que no salgan siempre las mismas
            for (let i = todasLasPistas.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [todasLasPistas[i], todasLasPistas[j]] = [todasLasPistas[j], todasLasPistas[i]];
            }
            
            // Cortamos el array para quedarnos solo con la cantidad pedida
            // Si pedís 5 y hay 3, te devuelve las 3.
            pistasSeleccionadas = todasLasPistas.slice(0, cantidad);
        } else {
            pistasSeleccionadas = [];
        }

        return { 
            name: nombre, 
            hints: pistasSeleccionadas 
        };
    }

    return { name: "Error", hints: [] };
}

// ==========================================
// 4. SISTEMA DE ALERTAS
// ==========================================
function showSystemMessage(title, msg) {
    var m = document.getElementById('system-modal');
    if(!m) return alert(msg);
    document.getElementById('sys-title').innerText = title;
    document.getElementById('sys-msg').innerText = msg;
    document.getElementById('sys-ok').classList.remove('hidden');
    document.getElementById('sys-confirm-btns').classList.add('hidden');
    m.classList.remove('hidden');
    document.getElementById('sys-ok').onclick = function() { m.classList.add('hidden'); };
}
function showSystemConfirm(title, msg, onConfirm) {
    var m = document.getElementById('system-modal');
    if(!m) { if(confirm(msg)) onConfirm(); return; }
    document.getElementById('sys-title').innerText = title;
    document.getElementById('sys-msg').innerText = msg;
    document.getElementById('sys-ok').classList.add('hidden');
    document.getElementById('sys-confirm-btns').classList.remove('hidden');
    m.classList.remove('hidden');
    document.getElementById('sys-yes').onclick = function() { m.classList.add('hidden'); if(onConfirm) onConfirm(); };
    document.getElementById('sys-no').onclick = function() { m.classList.add('hidden'); };
}

// ==========================================
// 5. MODAL DE RESULTADOS (VISIBILIDAD GARANTIZADA)
// ==========================================
// BUSCÁ LA FUNCIÓN showResultModal Y REEMPLAZALA POR ESTA:

function showResultModal(type, title, desc, onReplay, onContinue) {
    var m=document.getElementById('result-modal'), cd=document.getElementById('modal-countdown'), cnt=document.getElementById('modal-content'), num=document.getElementById('count-num');
    m.classList.remove('hidden'); cd.classList.remove('hidden'); cnt.classList.add('hidden');
    
    if(window.clT) clearInterval(window.clT);
    if(window.lInt) clearInterval(window.lInt);
    
    var count = 3; num.innerText = count;
    if(window.mInt) clearInterval(window.mInt);
    
    window.mInt = setInterval(function(){
        count--;
        if(count > 0) { num.innerText = count; } 
        else {
            clearInterval(window.mInt); cd.classList.add('hidden'); cnt.classList.remove('hidden');
            
            document.getElementById('modal-title').innerText = title;
            document.getElementById('modal-desc').innerHTML = desc;
            
            var ico = document.getElementById('modal-icon');
            var tit = document.getElementById('modal-title');
            
            if(type==='VICTORY_CIVIL'){ico.innerText='🏆'; tit.className="text-3xl font-bold mb-4 text-green-500 digital-font";}
            else if(type==='VICTORY_IMP'){ico.innerText='🔪'; tit.className="text-3xl font-bold mb-4 text-red-500 digital-font";}
            else {ico.innerText='💀'; tit.className="text-3xl font-bold mb-4 text-slate-300 digital-font";}

            // --- LÓGICA DE BOTONES CORREGIDA ---
            var hostControls = document.getElementById('modal-host-controls');
            var clientMsg = document.getElementById('modal-client-msg');
            var btnCont = document.getElementById('btn-continue-game'); // Botón fuera del contenedor host
            var isOnline = !document.getElementById('online-game').classList.contains('hidden');
            var amIHost = isOnline ? (window.isHost === true) : true;

            // 1. CONFIGURAR BOTÓN CONTINUAR (PARA TODOS)
            // Si es eliminación, habilitamos el botón para cualquiera
            if(type === 'ELIMINATED') {
                if(btnCont) {
                    btnCont.classList.remove('hidden');
                    // ¡ACÁ ESTABA EL ERROR! Ahora le asignamos el click a todos, no solo al host
                    btnCont.onclick = function() { 
                        m.classList.add('hidden'); 
                        if(onContinue) onContinue(); 
                    };
                }
                // Ocultamos controles de fin de partida (volver/salir)
                if(document.getElementById('modal-btns-game-over')) 
                    document.getElementById('modal-btns-game-over').classList.add('hidden');
                
                // Ocultamos mensaje de espera
                if(clientMsg) clientMsg.classList.add('hidden');
            
            } else {
                // 2. CONFIGURAR FINAL DE PARTIDA (SOLO HOST CONTROLA)
                if(btnCont) btnCont.classList.add('hidden'); // Ocultar continuar
                
                if(amIHost) {
                    if(hostControls) { hostControls.classList.remove('hidden'); hostControls.classList.add('flex'); }
                    if(document.getElementById('modal-btns-game-over')) 
                        document.getElementById('modal-btns-game-over').classList.remove('hidden');
                    
                    document.getElementById('btn-replay').onclick = function() { m.classList.add('hidden'); if(onReplay) onReplay(); };
                    document.getElementById('btn-exit').onclick = function() { location.reload(); };
                    if(clientMsg) clientMsg.classList.add('hidden');
                } else {
                    // Cliente esperando que el host decida en Game Over
                    if(hostControls) { hostControls.classList.add('hidden'); hostControls.classList.remove('flex'); }
                    if(clientMsg) clientMsg.classList.remove('hidden');
                }
            }
        }
    }, 1000);
}

// ==========================================
// SISTEMA DE REGLAS (TUTORIAL)
// ==========================================
var currentRuleIdx = 0;
var rulesData = [
    "Se selecciona una categoría en particular y a cada jugador se le da una palabra relacionada con ella menos al impostor.",
    "Todos los jugadores tienen que decir una palabra relacionada al tema, por ejemplo: La palabra es supermercado, alguien puede decir Productos comestibles.",
    "Los jugadores tienen que adivinar quién puede ser el impostor según quién dijo qué palabras, y el impostor tiene que hacer creer a los demás que él es inocente.",
    "Luego de terminar una ronda los jugadores votan a quién expulsar y se expulsa a quien tenga más votos y se comienza una ronda nueva, la partida se termina cuando todos los impostores queden expulsados o solamente queden en pie los impostores contra 1 Civil."
];

function goToRules() {
    currentRuleIdx = 0; // Empezar siempre desde la 1
    showScreen('rules-section');
    renderRule();
}

function nextRule() {
    if (currentRuleIdx < rulesData.length - 1) {
        currentRuleIdx++;
        renderRule();
    } else {
        // Si es la última regla, el botón sirve para salir
        showScreen('main-menu');
    }
}

function prevRule() {
    if (currentRuleIdx > 0) {
        // Si no es la primera, volvemos uno atrás
        currentRuleIdx--;
        renderRule();
    } else {
        // SI ES LA PRIMERA (0), SALIMOS AL MENÚ
        showScreen('main-menu');
    }
}

function renderRule() {
    // 1. Textos
    document.getElementById('rule-step-num').innerText = currentRuleIdx + 1;
    var textEl = document.getElementById('rule-text-content');
    textEl.innerText = rulesData[currentRuleIdx];

    // 2. Animaciones (Gestión de clases CSS)
    for(var i=1; i<=4; i++) {
        var el = document.getElementById('rule-anim-' + i);
        if(el) {
            el.classList.add('hidden');
            el.classList.remove('active'); 
        }
    }
    
    // Activar la nueva animación
    var currentAnim = document.getElementById('rule-anim-' + (currentRuleIdx + 1));
    if(currentAnim) {
        currentAnim.classList.remove('hidden');
        // Pequeño hack para reiniciar el GIF CSS
        void currentAnim.offsetWidth; 
        currentAnim.classList.add('active');
    }

    // 3. BOTONES (Lógica Actualizada)
    var btnPrev = document.getElementById('btn-prev-rule');
    var btnNext = document.getElementById('btn-next-rule');

    // CONFIGURACIÓN BOTÓN "VOLVER"
    // Siempre habilitado. Si es el índice 0, actúa como "Salir".
    btnPrev.disabled = false;
    btnPrev.classList.remove('opacity-50'); // Aseguramos que se vea activo

    if (currentRuleIdx === 0) {
        btnPrev.innerHTML = "← Menú"; // O "Salir"
    } else {
        btnPrev.innerHTML = "← Volver";
    }

    // CONFIGURACIÓN BOTÓN "SIGUIENTE"
    if (currentRuleIdx === rulesData.length - 1) {
        btnNext.innerHTML = "¡A JUGAR! 🎮";
        btnNext.className = "flex-1 bg-gradient-to-r from-green-500 to-cyan-500 text-white font-bold py-3 rounded-xl transition hover:from-green-400 hover:to-cyan-400 active:scale-95 shadow-lg";
    } else {
        btnNext.innerHTML = "Siguiente →";
        btnNext.className = "flex-1 bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-bold py-3 rounded-xl transition hover:from-yellow-400 hover:to-orange-400 active:scale-95 shadow-lg";
    }
}
// --- DONACIÓN ---
function openDonation() { document.getElementById('donation-modal').classList.remove('hidden'); }
function closeDonation() { document.getElementById('donation-modal').classList.add('hidden'); document.getElementById('copy-feedback').classList.add('opacity-0'); }
function copyToClip(id) {
    var t = document.getElementById(id); t.select(); t.setSelectionRange(0,99999); 
    navigator.clipboard.writeText(t.value).then(function(){
        var f=document.getElementById('copy-feedback'); f.classList.remove('opacity-0'); setTimeout(function(){f.classList.add('opacity-0');},2000);
    });
}