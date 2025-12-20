// ==========================================
// MODO ONLINE (v17 - CON BANNER DESLIZANTE)
// ==========================================

// 1. CONFIGURACIÓN DE CONEXIÓN ROBUSTA
const SERVER_URL = 'https://impostor-server-gomitaexe.onrender.com'; 
const socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'], // Fuerza la mejor conexión posible
    reconnection: true
});

var myRoomCode = "";
var myName = "";
var isHost = false;
var oPlayers = [];
var isConnected = false; // Variable para saber si estamos online
var statusTimeout; // Variable para guardar el temporizador del cartel

// Configuración del Juego
var oSettings = {
    cat:'games', imps:1, tDisc:30, tVote:15, withTime:true, 
    hintsOn:false, hintsCount:1, noAudio:false, 
    balanced:false, balRate: 50, canGuess:false, maxGuesses: 1 
};

// Variables de Estado
var oTimerInt, oVotes={}, hasVoted=false, oTieTargets=[];
var oTurnOrder=[], oTurnIdx=0, currentPhase='DISCUSS';
var activeWordData = null; 
var oGuessesLeft = 1; 
var oImpHistory = JSON.parse(localStorage.getItem('o_imp_v7_history') || '{}');

// --- EL SEMÁFORO (Diagnóstico Visual Animado) ---

socket.on('connect', () => {
    isConnected = true;
    console.log("✅ CONECTADO AL SERVIDOR:", socket.id);
    updateStatus("🟢 ONLINE (Conectado)", "text-green-400");
});

socket.on('connect_error', (err) => {
    isConnected = false;
    console.error("❌ ERROR DE CONEXIÓN:", err);
    updateStatus("🔴 ERROR DE CONEXIÓN (Render durmiendo...)", "text-red-500");
});

socket.on('disconnect', () => {
    isConnected = false;
    updateStatus("🔴 DESCONECTADO", "text-red-500");
});

// Función Mejorada: Muestra 5 seg y se esconde para arriba
function updateStatus(msg, colorClass) {
    let el = document.getElementById('debug-status');
    
    // Si no existe, lo creamos con animación CSS
    if(!el) {
        let div = document.createElement('div');
        div.id = 'debug-status';
        // Agregamos 'transition-transform duration-500' para que deslice suave
        div.className = "fixed top-0 left-0 w-full text-center bg-black bg-opacity-90 p-1 z-50 font-bold text-xs pointer-events-none transition-transform duration-500";
        document.body.appendChild(div);
        el = div;
    }

    // 1. Limpiamos el reloj anterior para que no se oculte antes de tiempo
    if (statusTimeout) clearTimeout(statusTimeout);

    // 2. Actualizamos texto y mostramos (bajamos el cartel)
    el.innerText = msg;
    // Reseteamos las clases base + el color nuevo
    el.className = "fixed top-0 left-0 w-full text-center bg-black bg-opacity-90 p-1 z-50 font-bold text-xs pointer-events-none transition-transform duration-500 " + colorClass;
    el.style.transform = "translateY(0)"; // Posición visible (0%)

    // 3. Programamos que se esconda en 5 segundos
    statusTimeout = setTimeout(() => {
        el.style.transform = "translateY(-100%)"; // Se va para arriba (fuera de pantalla)
    }, 5000);
}

// --- LÓGICA DE CONEXIÓN ---

// Escuchar mensajes del Servidor
socket.on('GAME_EVENT', (data) => {
    if (isHost) {
        handleHostLogic(data);
    }
    handleClientLogic(data);
});

function goToOnline() { showScreen('online-menu'); }

function createRoom() {
    if(!isConnected) {
        // Forzamos mostrar el cartel si intenta crear sin internet
        updateStatus("⚠️ Esperando conexión...", "text-yellow-400");
        return showSystemMessage("Error", "Esperá que se ponga VERDE 🟢 el estado arriba.");
    }

    myName = document.getElementById('online-name').value.trim();
    if(!myName) return showSystemMessage("Error", "¡Ponete un nombre!");
    
    isHost = true;
    window.isHost = true;
    
    // Generar código simple de 4 números
    myRoomCode = Math.floor(1000 + Math.random() * 9000).toString();
    
    // Unirse a la sala en el servidor
    socket.emit('JOIN_ROOM', myRoomCode);
    
    // Configurar mi jugador
    oPlayers = [{ id: socket.id, name: myName, isHost: true, alive: true }];
    
    showScreen('online-lobby');
    document.getElementById('lobby-code').innerText = myRoomCode;
    renderOLobby();
    enableHost(true);
    document.getElementById('online-status').innerText = "Esperando jugadores...";
}

function joinRoom() {
    if(!isConnected) {
        updateStatus("⚠️ Esperando conexión...", "text-yellow-400");
        return showSystemMessage("Error", "Sin conexión. Esperá el VERDE 🟢.");
    }

    myName = document.getElementById('online-name').value.trim();
    var code = document.getElementById('online-code').value.trim();
    if(!myName || !code) return showSystemMessage("Error", "Faltan datos.");
    
    isHost = false;
    window.isHost = false;
    myRoomCode = code;
    
    console.log("Intentando unirse a sala:", myRoomCode);

    showScreen('online-lobby');
    document.getElementById('lobby-code').innerText = myRoomCode;
    enableHost(false);
    document.getElementById('online-status').innerText = "Estableciendo conexión...";
    document.getElementById('online-player-list').innerHTML = "<li>Conectando...</li>";

    // 1. Unirse a la sala (físicamente en el server)
    socket.emit('JOIN_ROOM', myRoomCode);

    // 2. EL TRUCO DEL RETRASO (DOBLE CHECK)
    setTimeout(() => {
        console.log("Primer intento de saludo...");
        document.getElementById('online-status').innerText = "Saludando al host...";
        
        sendToHost({ type: 'JOIN_REQUEST', payload: { name: myName, id: socket.id } });

        setTimeout(() => {
            if(oPlayers.length === 0) {
                console.log("Reintentando saludo...");
                sendToHost({ type: 'JOIN_REQUEST', payload: { name: myName, id: socket.id } });
            }
        }, 2500);

    }, 1500);
}

// Función para enviar datos
function broadcast(msgObj) {
    socket.emit('GAME_EVENT', {
        room: myRoomCode,
        type: msgObj.type,
        payload: msgObj.payload
    });
}

function sendToHost(msgObj) {
    broadcast(msgObj);
}

// --- LÓGICA DEL HOST (Cerebro del juego) ---

function handleHostLogic(d) {
    if (d.type === 'JOIN_REQUEST') {
        if (d.payload.id !== socket.id) {
            var existing = oPlayers.find(p => p.id === d.payload.id);
            if (!existing) {
                oPlayers.push({ id: d.payload.id, name: d.payload.name, isHost: false, alive: true });
                updateLobbyAndSync();
                showSystemMessage("Info", d.payload.name + " se unió."); 
            } else {
                updateLobbyAndSync();
            }
        }
    }
    else if (d.type === 'SKIP_TURN') {
        if (oPlayers[oTurnOrder[oTurnIdx]].id === d.payload.fromId) hostNextTurn();
    }
    else if (d.type === 'CHAT_MSG') {
        broadcast({ type: 'SHOW_CHAT', payload: d.payload });
        showOnlineOverlay(d.payload.text, d.payload.author, d.payload.dur);
    }
    else if (d.type === 'GUESS_ATTEMPT') {
        hostCheckGuess(d.payload.id, d.payload.word);
    }
    else if (d.type === 'VOTE') {
        hostProcessVote(d.payload.fromId, d.payload.targetId);
    }
    else if (d.type === 'USER_LEFT') {
        var leftId = d.payload;
        var p = oPlayers.find(x => x.id === leftId);
        if (p) {
            showSystemMessage("Info", p.name + " se desconectó.");
            oPlayers = oPlayers.filter(x => x.id !== leftId);
            updateLobbyAndSync();
            adjOnlineImp(0);
        }
    }
}

function updateLobbyAndSync() {
    renderOLobby();
    broadcast({ type: 'LOBBY_UPDATE', payload: oPlayers });
    broadcast({ type: 'SYNC', payload: oSettings });
}

// --- LÓGICA DEL CLIENTE (Pantalla) ---

function handleClientLogic(d) {
    if (d.type === 'LOBBY_UPDATE') {
        oPlayers = d.payload; 
        renderCLobby(oPlayers);
        document.getElementById('online-status').innerText = "Conectado al Lobby";
    }
    else if (d.type === 'SYNC') {
        updateClientSettings(d.payload);
    }
    else if (d.type === 'START') {
        renderOGame(d.payload);
    }
    else if (d.type === 'TURN_UPDATE') {
        handleClientTurnUpdate(d.payload);
    }
    else if (d.type === 'PHASE_CHANGE') {
        document.getElementById('online-phase-lbl').innerText = d.payload.isTie ? "DESEMPATE" : (d.payload.phase==='DISCUSS'?"DEBATE":"VOTACIÓN");
        if(d.payload.states) {
            d.payload.states.forEach(s => {
                var p = oPlayers.find(x => x.id === s.id);
                if(p) p.alive = s.alive;
            });
            renderOGrid(oPlayers);
        }
        updateOVoteCounts({});
    }
    else if (d.type === 'VOTES_UPDATE') {
        updateOVoteCounts(d.payload);
    }
    else if (d.type === 'SHOW_CHAT') {
        showOnlineOverlay(d.payload.text, d.payload.author, d.payload.dur);
    }
    else if (d.type === 'RESULT') {
        handleOResult(d.payload);
    }
    else if (d.type === 'MSG') {
        showSystemMessage("Aviso", d.payload);
    }
    else if (d.type === 'DISABLE_GUESS') {
        document.getElementById('btn-online-guess').classList.add('hidden');
    }
    else if (d.type === 'RESET') {
        showScreen('online-lobby');
        document.getElementById('result-modal').classList.add('hidden');
    }
    else if (d.type === 'KICK') {
        if(d.payload === socket.id) {
            showSystemMessage("Aviso", "Te echaron."); 
            location.reload();
        }
    }
}

// --- FUNCIONES DEL JUEGO (HOST) ---

function startOnlineGame() {
    if(oPlayers.length < 3) return showSystemMessage("Error", "Mínimo 3 jugadores");
    oGuessesLeft = oSettings.maxGuesses;

    var list = DB[oSettings.cat] || DB.games;
    var rawItem = list[Math.floor(Math.random()*list.length)];
    var cantPistas = oSettings.hintsOn ? oSettings.hintsCount : 0;
    activeWordData = getSafeWordObj(rawItem, cantPistas); 

    var roles = new Array(oPlayers.length).fill('civil');
    var idxs = Array.from({length:oPlayers.length}, (_,i)=>i);
    
    idxs.sort(() => Math.random()-0.5);
    for(var i=0; i<oSettings.imps; i++) roles[idxs[i]]='impostor';

    var startIdx = Math.floor(Math.random()*oPlayers.length);
    oTurnOrder = [];
    for(let i=0; i<oPlayers.length; i++) oTurnOrder.push((startIdx+i)%oPlayers.length);
    oTurnIdx = -1; 

    oPlayers.forEach((p, i) => {
        p.role = roles[i]; p.alive = true; p.hasVoted = false;
    });
    
    var gameMap = {};
    oPlayers.forEach(p => {
        gameMap[p.id] = {
            role: p.role,
            word: p.role==='impostor' ? '???' : activeWordData.name,
            hints: activeWordData.hints
        };
    });
    
    broadcast({ type: 'START', payload: { map: gameMap, players: oPlayers, settings: oSettings } });

    currentPhase = 'DISCUSS';
    hostNextTurn(); 
}

function hostNextTurn() {
    oTurnIdx++;
    if(oTurnIdx >= oTurnOrder.length) { 
        if(currentPhase === 'DISCUSS') hostPhase('VOTE'); 
        else resolveOVotes();
        return; 
    }

    var pIdx = oTurnOrder[oTurnIdx];
    var p = oPlayers[pIdx];

    if(!p.alive) { hostNextTurn(); return; }

    var time = (currentPhase === 'DISCUSS') ? oSettings.tDisc : oSettings.tVote;
    var state = { phase: currentPhase, activePlayerId: p.id, timeLeft: time, turnIdx: oTurnIdx, totalTurns: oTurnOrder.length };
    
    broadcast({type:'TURN_UPDATE', payload: state});
    handleClientTurnUpdate(state); 

    clearInterval(oTimerInt);
    if(oSettings.withTime) {
        var left = time;
        oTimerInt = setInterval(() => { left--; if(left <= 0) { 
            if(currentPhase === 'VOTE') hostTimeoutVote(p.id);
            else { clearInterval(oTimerInt); hostNextTurn(); }
        } }, 1000);
    }
}

function hostPhase(phase, isTie) {
    currentPhase = phase;
    var playerStates = oPlayers.map(p => ({id: p.id, alive: p.alive}));
    if(phase === 'VOTE') {
        oVotes = {}; 
        oPlayers.forEach(p => p.hasVoted = false);
        oTurnOrder = oTurnOrder.filter(idx => oPlayers[idx].alive);
        oTurnIdx = -1;
        broadcast({type:'PHASE_CHANGE', payload: { phase: 'VOTE', isTie: !!isTie, states: playerStates } });
        hostNextTurn();
    } else {
        oTurnOrder = oTurnOrder.filter(idx => oPlayers[idx].alive);
        oTurnIdx = -1;
        broadcast({type:'PHASE_CHANGE', payload: { phase: 'DISCUSS', states: playerStates } });
        hostNextTurn();
    }
}

function hostProcessVote(voterId, targetId) {
    var currentActor = oPlayers[oTurnOrder[oTurnIdx]];
    if(currentActor.id !== voterId) return;

    if(!oVotes[targetId]) oVotes[targetId]=0; oVotes[targetId]++;
    broadcast({type:'VOTES_UPDATE', payload: oVotes});
    updateOVoteCounts(oVotes); 
    hostNextTurn();
}

function hostTimeoutVote(voterId) {
    clearInterval(oTimerInt);
    var targets = oPlayers.filter(p => p.alive && p.id !== voterId);
    if(targets.length > 0) {
        var randomTarget = targets[Math.floor(Math.random() * targets.length)];
        if(!oVotes[randomTarget.id]) oVotes[randomTarget.id]=0; oVotes[randomTarget.id]++;
        broadcast({type:'VOTES_UPDATE', payload: oVotes});
        updateOVoteCounts(oVotes);
    }
    hostNextTurn();
}

function resolveOVotes() {
    clearInterval(oTimerInt);
    var max=-1, tgts=[]; 
    for(var id in oVotes) { if(oVotes[id]>max){max=oVotes[id]; tgts=[id];} else if(oVotes[id]===max) tgts.push(id); }
    
    if(tgts.length>1) { 
        oTieTargets=tgts; 
        broadcast({type:'MSG', payload:"¡EMPATE!"}); 
        setTimeout(function(){hostPhase('VOTE', true)}, 2000); 
    }
    else if(tgts.length===1) {
        var p = oPlayers.find(x=>x.id===tgts[0]);
        if(p) {
            p.alive=false; 
            var imp=p.role==='impostor';
            var desc = `<span class="text-white font-bold">${p.name}</span> era <span class="${imp?'text-red-500':'text-cyan-400'} font-bold">${imp?'IMPOSTOR':'CIVIL'}</span>`;
            var ic=oPlayers.filter(x=>x.role==='impostor'&&x.alive).length; 
            var cc=oPlayers.filter(x=>x.role==='civil'&&x.alive).length;
            
            var resType = 'ELIMINATED';
            if(ic===0) resType = 'VICTORY_CIVIL';
            else if(ic>=cc) resType = 'VICTORY_IMP';
            
            var resData = { result: resType, desc: desc };
            broadcast({type:'RESULT', payload: resData}); 
            handleOResult(resData);
        }
    } else { 
        broadcast({type:'MSG', payload:"Nadie votado."}); 
        hostPhase('DISCUSS'); 
    }
}

function hostCheckGuess(impId, word) {
    var p = oPlayers.find(x => x.id === impId);
    if(!p || p.role !== 'impostor') return;
    if(word.toLowerCase() === activeWordData.name.toLowerCase()) {
        var res = { result: 'VICTORY_IMP', desc: `<span class="text-white font-bold">${p.name}</span> adivinó la palabra secreta:<br><span class="text-green-400 text-xl">${activeWordData.name}</span>` };
        broadcast({type:'RESULT', payload: res}); handleOResult(res);
    } else {
        oGuessesLeft--;
        var msg = "Incorrecto. ";
        if(oGuessesLeft > 0) msg += "Te quedan " + oGuessesLeft + " intentos.";
        else msg += "Sin intentos restantes.";
        
        broadcast({type:'MSG', payload: "El Impostor falló al adivinar."});
        
        if(oGuessesLeft <= 0) { 
            broadcast({type:'DISABLE_GUESS'}); 
        }
    }
}

// --- RENDERING Y UI ---

function renderOGame(payload) {
    showScreen('online-game');
    
    var myData = payload.map[socket.id];
    if(!myData) return; 
    
    if(!isHost) {
        oSettings = payload.settings;
        oPlayers = payload.players;
    }
    
    document.getElementById('online-role-text').innerText = myData.role==='impostor'?"IMPOSTOR":"CIVIL";
    document.getElementById('online-role-text').className = myData.role==='impostor'?"text-4xl font-bold text-red-500 digital-font mb-2 animate-pulse":"text-4xl font-bold text-cyan-400 digital-font mb-2";
    document.getElementById('online-the-word').innerText = myData.word;
    
    var hCont = document.getElementById('online-hint-container');
    if(myData.role==='impostor' && oSettings.hintsOn && myData.hints.length>0) {
        document.getElementById('online-imp-cat-hint').innerText = "- " + myData.hints.join("\n- ");
        hCont.classList.remove('hidden');
    } else hCont.classList.add('hidden');
    
    renderOGrid(payload.players);
}

function renderOGrid(l){
    document.getElementById('online-grid').innerHTML=l.map(p => 
        `<button data-id="${p.id}" onclick="onlineVote('${p.id}')" class="relative p-4 rounded font-bold transition bg-slate-700 text-white ${p.alive?'':'opacity-50 bg-slate-900'}">
            ${p.name} ${p.alive?'':'💀'}
        </button>`
    ).join('');
}

function handleClientTurnUpdate(state) {
    var bar=document.getElementById('online-timer-bar'), disp=document.getElementById('online-timer');
    if(oSettings.withTime) {
        var left = state.timeLeft; disp.innerText = fmtTime(left);
        if(window.clT) clearInterval(window.clT);
        window.clT = setInterval(()=>{ left--; disp.innerText = fmtTime(left); bar.style.width = ((left/state.timeLeft)*100)+"%"; if(left<=0) clearInterval(window.clT); }, 1000);
    } else { disp.innerText = "∞"; bar.style.width="100%"; }

    var isMyTurn = (state.activePlayerId === socket.id);
    var activeP = oPlayers.find(p => p.id === state.activePlayerId) || {name:"..."};
    document.getElementById('online-current-turn').innerText = activeP.name; document.getElementById('online-current-turn').classList.remove('hidden');
    
    var grid = document.getElementById('online-grid');
    Array.from(grid.children).forEach(btn => {
        btn.classList.remove('turn-active', 'vote-active-btn');
        if (state.phase === 'VOTE' && isMyTurn && !btn.disabled) {
            btn.classList.add('vote-active-btn');
        } else if (state.phase === 'DISCUSS' && btn.getAttribute('data-id') === state.activePlayerId) {
            btn.classList.add('turn-active');
        }
    });

    var skipBtn = document.getElementById('btn-skip-online'), inputArea = document.getElementById('online-input-area'), chatBox = document.getElementById('online-chat-box'), guessBtn = document.getElementById('btn-online-guess');
    skipBtn.classList.add('hidden'); inputArea.classList.add('hidden'); grid.classList.add('pointer-events-none'); 

    if(isMyTurn) {
        skipBtn.classList.remove('hidden'); 
        if(state.phase === 'DISCUSS') {
            if(oSettings.noAudio) {
                inputArea.classList.remove('hidden'); document.getElementById('online-chat-input').value = "";
                var myRole = document.getElementById('online-role-text').innerText === "IMPOSTOR" ? 'impostor' : 'civil';
                chatBox.className = "chat-container " + (myRole==='impostor'?'role-imp':'role-civil');
                if(myRole === 'impostor' && oSettings.canGuess) guessBtn.classList.remove('hidden'); else guessBtn.classList.add('hidden');
            }
        } else if (state.phase === 'VOTE') {
            grid.classList.remove('pointer-events-none'); 
            document.getElementById('online-vote-msg').innerText = "¡ES TU TURNO DE VOTAR!";
            document.getElementById('online-vote-msg').className = "text-center text-sm text-blue-400 font-bold uppercase mb-2 animate-pulse";
        }
    } else { 
        document.getElementById('online-vote-msg').innerText = "Esperando a " + activeP.name + "...";
        document.getElementById('online-vote-msg').className = "text-center text-xs text-slate-500 font-bold uppercase mb-2";
    }
}

// UI HELPERS
function onlineSkipTurn() { 
    if(isHost) hostNextTurn(); 
    else broadcast({type:'SKIP_TURN', payload: { fromId: socket.id }}); 
}

function sendOnlineMessage() { 
    var inp = document.getElementById('online-chat-input'), txt = inp.value.trim(); 
    if(!txt) return; 
    var dur = Math.min(5000, 1000 + (txt.length * 100));
    var msgData = { text: txt, author: myName, dur: dur }; 
    broadcast({type:'CHAT_MSG', payload: msgData}); 
    setTimeout(onlineSkipTurn, 200); 
    inp.value = ""; 
}

function onlineVote(targetId) { 
    var grid = document.getElementById('online-grid'); 
    if(grid.classList.contains('pointer-events-none')) return; 
    showSystemConfirm("Confirmar", "¿Votar?", function() { 
        if(isHost) hostProcessVote(socket.id, targetId); 
        else broadcast({type:'VOTE', payload: { fromId: socket.id, targetId: targetId }}); 
        
        grid.classList.add('pointer-events-none'); 
        document.getElementById('online-vote-msg').innerText = "Voto enviado..."; 
    }); 
}

var oGuessing = false;
function toggleOnlineGuess() {
    oGuessing = !oGuessing;
    var modal = document.getElementById('online-guess-modal');
    var inp = document.getElementById('online-guess-modal-input');
    if(oGuessing) { modal.classList.remove('hidden'); inp.value = ""; inp.focus(); inp.oninput = handleOnlineGuessInput; } 
    else { modal.classList.add('hidden'); inp.oninput = null; document.getElementById('online-guess-modal-suggestions').classList.add('hidden'); }
}
function handleOnlineGuessInput(e) {
    var val = e.target.value.toLowerCase();
    var sugg = document.getElementById('online-guess-modal-suggestions');
    sugg.innerHTML = ""; sugg.classList.add('hidden');
    if(val.length < 2) return;
    var list = DB[oSettings.cat] || DB.games; 
    var matches = list.filter(item => item[0].toLowerCase().includes(val));
    if(matches.length>0) {
        sugg.classList.remove('hidden');
        sugg.innerHTML = matches.slice(0,3).map(m => `<div class="p-3 text-white hover:bg-slate-600 cursor-pointer border-b border-slate-600 last:border-0" onclick="confirmOnlineGuessFromModal('${m[0]}')">${m[0]}</div>`).join('');
    }
}
function confirmOnlineGuessFromModal(val) {
    var word = val || document.getElementById('online-guess-modal-input').value;
    if(!word) return;
    if(isHost) hostCheckGuess(socket.id, word); 
    else broadcast({type:'GUESS_ATTEMPT', payload: { id: socket.id, word: word }});
    toggleOnlineGuess();
}

// Sync Controls & Misc
function syncSettings() {
    if(!isHost) return;
    oSettings.cat = document.getElementById('online-cat-select').value;
    oSettings.withTime = document.getElementById('online-time-switch').checked;
    oSettings.tDisc = parseInt(document.getElementById('online-time-discuss').value) || 30;
    oSettings.tVote = parseInt(document.getElementById('online-time-vote').value) || 15;
    oSettings.hintsOn = document.getElementById('online-hint-switch').checked;
    oSettings.hintsCount = parseInt(document.getElementById('online-hint-count').value) || 1;
    oSettings.noAudio = document.getElementById('online-noaudio-switch').checked;
    oSettings.imps = parseInt(document.getElementById('online-imp-count').innerText);
    oSettings.balanced = document.getElementById('online-balanced-switch').checked;
    oSettings.balRate = parseInt(document.getElementById('online-balanced-rate').value) || 50;
    oSettings.canGuess = document.getElementById('online-guess-switch').checked;
    oSettings.maxGuesses = parseInt(document.getElementById('online-guess-attempts').value) || 1;
    
    toggleOnlinePanel('time'); toggleOnlinePanel('hint'); 
    toggleOnlinePanel('balanced'); toggleOnlinePanel('guess');
    updateLobbyAndSync();
}

function updateClientSettings(s){
    oSettings = s;
    document.getElementById('online-cat-select').value = s.cat; 
    document.getElementById('online-imp-count').innerText = s.imps;
    document.getElementById('online-time-switch').checked = s.withTime;
    document.getElementById('online-time-discuss').value = s.tDisc;
    document.getElementById('online-time-vote').value = s.tVote;
    document.getElementById('online-hint-switch').checked = s.hintsOn;
    document.getElementById('online-hint-count').value = s.hintsCount;
    document.getElementById('online-hint-val').innerText = s.hintsCount;
    document.getElementById('online-noaudio-switch').checked = s.noAudio;
    document.getElementById('online-balanced-switch').checked = s.balanced;
    document.getElementById('online-balanced-rate').value = s.balRate;
    document.getElementById('online-balanced-val').innerText = s.balRate + '%';
    document.getElementById('online-guess-switch').checked = s.canGuess;
    document.getElementById('online-guess-attempts').value = s.maxGuesses;
    document.getElementById('online-guess-val').innerText = s.maxGuesses;
    
    toggleOnlinePanel('time'); toggleOnlinePanel('hint');
    toggleOnlinePanel('balanced'); toggleOnlinePanel('guess');
}

function enableHost(en) { 
    var c=document.getElementById('host-controls'), i=c.querySelectorAll('input,select,button'); 
    i.forEach(e=>{e.disabled=!en;e.classList.toggle('disabled-input',!en)}); 
    if(en){ c.classList.remove('opacity-50'); document.getElementById('btn-start-online').classList.remove('hidden'); document.getElementById('msg-wait-host').classList.add('hidden'); }
    else{ c.classList.add('opacity-50'); document.getElementById('btn-start-online').classList.add('hidden'); document.getElementById('msg-wait-host').classList.remove('hidden'); } 
}
function renderOLobby(){ document.getElementById('online-player-list').innerHTML=oPlayers.map(p=>`<li class="bg-slate-700 p-2 rounded text-white text-sm flex justify-between items-center"><span>${p.name} ${p.isHost?'👑':''}</span> ${(isHost&&!p.isHost)?`<button onclick="kickPlayer('${p.id}')" class="text-[10px] bg-red-600 px-2 py-1 rounded">🥾</button>`:''}</li>`).join(''); }
function renderCLobby(l){ document.getElementById('online-player-list').innerHTML=l.map(p=>`<li class="bg-slate-700 p-2 rounded text-white text-sm flex justify-between"><span>${p.name} ${p.isHost?'👑':''}</span></li>`).join(''); }
function toggleCode(){document.getElementById('lobby-code').classList.toggle('blur-code');}
function handleOResult(d){ if(d.result==='ELIMINATED'){ showResultModal('ELIMINATED','ELIMINADO',d.desc,null,()=>{if(isHost) hostPhase('DISCUSS');}); } else { showResultModal(d.result,d.result==='VICTORY_IMP'?'VICTORIA IMPOSTOR':'VICTORIA CIVIL',d.desc,()=>{if(isHost){broadcast({type:'RESET'});showScreen('online-lobby');}},()=>{location.reload()}); } }
function leaveRoom(){showSystemConfirm("Salir", "¿Seguro?", ()=>{location.reload()});}
function updateOVoteCounts(v){
    var btns=document.getElementById('online-grid').children; 
    for(var i=0; i<btns.length; i++){
        var btn=btns[i], id=btn.getAttribute('data-id'), c=v[id]||0; 
        var o=btn.querySelector('.vote-count-badge'); if(o)o.remove(); 
        if(c>0) { var b=""; for(var k=0;k<c;k++)b+="☝️"; btn.innerHTML+='<span class="vote-count-badge">'+b+'</span>'; }
    }
}
function showOnlineOverlay(text, author, time) { var ov = document.getElementById('online-msg-overlay'); document.getElementById('o-overlay-text').innerText = text; document.getElementById('o-overlay-author').innerText = author; ov.classList.remove('hidden'); setTimeout(() => ov.classList.add('hidden'), time); }
function kickPlayer(pid){broadcast({type:'KICK', payload: pid}); oPlayers=oPlayers.filter(x=>x.id!==pid); updateLobbyAndSync(); adjOnlineImp(0);}
function adjOnlineImp(d){var cur=parseInt(document.getElementById('online-imp-count').innerText)+d, max = Math.ceil(oPlayers.length / 2) - 1; if(max < 1) max = 1; if(oPlayers.length < 3) max = 1; if(cur > max) cur = max; if(cur < 1) cur = 1; document.getElementById('online-imp-count').innerText=cur; syncSettings();}