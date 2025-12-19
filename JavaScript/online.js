// ==========================================
// MODO ONLINE (v14 - FINAL: OPEN RELAY + UI FULL)
// ==========================================
var peer, conn, myId, myName, isHost=false, oPlayers=[];

var oSettings = {
    cat:'games', imps:1, tDisc:30, tVote:15, withTime:true, 
    hintsOn:false, hintsCount:1, 
    noAudio:false, 
    balanced:false, balRate: 50, 
    canGuess:false, maxGuesses: 1 
};

var oTimerInt, oVotes={}, hasVoted=false, oTieTargets=[];
var oTurnOrder=[], oTurnIdx=0, currentPhase='DISCUSS';
var activeWordData = null; 
var oGuessesLeft = 1; 
var oImpHistory = JSON.parse(localStorage.getItem('o_imp_v7_history') || '{}');
var connTimeout = null; 

window.isHost = false;

function goToOnline() { showScreen('online-menu'); }

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
    broadcast({type:'SYNC', payload:oSettings});
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

function createRoom() { myName=document.getElementById('online-name').value; if(!myName)return showSystemMessage("Error", "Nombre!"); isHost=true; window.isHost=true; document.getElementById('online-status').innerText="Creando..."; initPeer(); }
function joinRoom() { myName=document.getElementById('online-name').value; var c=document.getElementById('online-code').value; if(!myName||!c)return showSystemMessage("Error", "Datos!"); isHost=false; window.isHost=false; document.getElementById('online-status').innerText="Conectando..."; initPeer(null, c); }

function initPeer(id, target) {
    // --- LISTA DE SERVIDORES "ROMPE-MUROS" (TURN GRATIS) ---
    var peerConfig = {
        config: {
            iceServers: [
                // Servidores STUN de Google (Básicos)
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                
                // Servidores TURN de OpenRelay (ESTA ES LA CLAVE PARA QUE ANDE EN PC)
                {
                    urls: "turn:openrelay.metered.ca:80",
                    username: "openrelayproject",
                    credential: "openrelayproject"
                },
                {
                    urls: "turn:openrelay.metered.ca:443",
                    username: "openrelayproject",
                    credential: "openrelayproject"
                },
                {
                    urls: "turn:openrelay.metered.ca:443?transport=tcp",
                    username: "openrelayproject",
                    credential: "openrelayproject"
                }
            ]
        },
        debug: 1
    };

    peer = new Peer(id || 'IMP-'+Math.floor(Math.random()*9000+1000), peerConfig);

    peer.on('open', function(pid) { 
        myId=pid; 
        if(isHost) { 
            oPlayers=[{id:pid, name:myName, isHost:true, alive:true}]; 
            showScreen('online-lobby'); document.getElementById('lobby-code').innerText=pid; 
            renderOLobby(); enableHost(true); 
        } else { 
            // Intentamos conectar. Al usar TURN, 'reliable: false' suele ir mejor.
            conn = peer.connect(target, {
                reliable: false,
                serialization: 'json'
            }); 
            setupConn(conn); 
        } 
    });
    
    peer.on('connection', function(c) { setupConn(c); });
    
    peer.on('error', function(e) { 
        clearTimeout(connTimeout);
        var msg = "Error desconocido";
        if(e.type === 'peer-unavailable') msg = "Sala no encontrada. Verificá el código.";
        else if(e.type === 'network') msg = "Error de Red. El firewall está bloqueando.";
        else msg = e.type;
        
        showSystemMessage("Error de Conexión", msg); 
        document.getElementById('online-status').innerText="Fallo.";
    });
    
    window.addEventListener('beforeunload', function() { if(peer) peer.destroy(); });
}

function setupConn(c) { 
    // Damos 30 segundos porque los servidores TURN pueden tardar un poquito en negociar
    if(!isHost) {
        connTimeout = setTimeout(function() {
            if(!c.open) {
                c.close();
                showSystemMessage("Tiempo Agotado", "No se pudo conectar.\n\nSOLUCIÓN:\nEl Firewall de Windows bloqueó la conexión.\nDesactiven el Firewall un momento o usen Chrome.");
                document.getElementById('online-status').innerText="Tiempo fuera.";
            }
        }, 30000); 
    }

    c.on('open', function() { 
        clearTimeout(connTimeout); 
        if(!isHost) { 
            conn.send({type:'JOIN', payload:myName}); 
            showScreen('online-lobby'); 
            document.getElementById('lobby-code').innerText=c.peer; 
            enableHost(false); 
        } 
    }); 
    
    // Heartbeat para que no se duerma
    c.on('data', function(d) { 
        if(d.type === 'PING') return;
        if(isHost) handleHostData(c, d); else handleClientData(d); 
    }); 

    c.on('close', function() { 
        if(isHost){ oPlayers=oPlayers.filter(x=>x.id!==c.peer); broadcastLobby(); adjOnlineImp(0); } 
        else { 
            showSystemMessage("Aviso", "Desconectado del Host."); 
            setTimeout(() => location.reload(), 2000); 
        } 
    }); 
}

// Heartbeat cada 3 segundos
setInterval(function() {
    if(isHost && oPlayers.length > 1) broadcast({type:'PING'});
}, 3000);

// LÓGICA HOST
function handleHostData(c, d) { 
    if(d.type==='JOIN'){ oPlayers.push({id:c.peer, name:d.payload, conn:c, alive:true}); broadcastLobby(); adjOnlineImp(0); broadcast({type:'SYNC', payload:oSettings}); }
    if(d.type==='SKIP_TURN') { if(oPlayers[oTurnOrder[oTurnIdx]].id === c.peer) hostNextTurn(); }
    if(d.type==='CHAT_MSG') { broadcast(d); } 
    if(d.type==='GUESS_ATTEMPT') { hostCheckGuess(c.peer, d.payload); }
    if(d.type==='VOTE') hostProcessVote(c.peer, d.payload);
}

function startOnlineGame() {
    if(oPlayers.length<3) return showSystemMessage("Error", "Mínimo 3 jugadores");
    oGuessesLeft = oSettings.maxGuesses;

    var list = DB[oSettings.cat] || DB.games;
    var rawItem = list[Math.floor(Math.random()*list.length)];
    var cantPistas = oSettings.hintsOn ? oSettings.hintsCount : 0;
    activeWordData = getSafeWordObj(rawItem, cantPistas); 

    var roles = new Array(oPlayers.length).fill('civil');
    var idxs = Array.from({length:oPlayers.length}, (_,i)=>i);
    
    if (oSettings.balanced) {
        oPlayers.forEach(p => { if(!oImpHistory[p.name]) oImpHistory[p.name] = { chance: 0, streak: 0 }; });
        idxs.sort((a,b) => {
            var pA = oImpHistory[oPlayers[a].name];
            var pB = oImpHistory[oPlayers[b].name];
            if (pB.chance !== pA.chance) return pB.chance - pA.chance;
            return Math.random() - 0.5;
        });
        var impsCount = oSettings.imps;
        var selected = idxs.slice(0, impsCount);
        selected.forEach(idx => roles[idx] = 'impostor');

        oPlayers.forEach((p, i) => {
            var data = oImpHistory[p.name];
            if (roles[i] === 'impostor') {
                data.streak++;
                if (data.streak >= 3) data.chance = 0;
                else if (data.chance >= 100) data.chance = Math.max(0, data.chance - 50);
                else if (data.streak === 1) data.chance = Math.max(0, data.chance - 15);
                else if (data.streak === 2) data.chance = Math.max(0, data.chance - 30);
            } else {
                data.streak = 0;
                data.chance = Math.min(100, data.chance + oSettings.balRate);
            }
            oImpHistory[p.name] = data;
        });
        localStorage.setItem('o_imp_v7_history', JSON.stringify(oImpHistory));
    } else {
        idxs.sort(() => Math.random()-0.5);
        for(var i=0; i<oSettings.imps; i++) roles[idxs[i]]='impostor';
    }

    var startIdx = Math.floor(Math.random()*oPlayers.length);
    oTurnOrder = [];
    for(let i=0; i<oPlayers.length; i++) oTurnOrder.push((startIdx+i)%oPlayers.length);
    oTurnIdx = -1; 

    oPlayers.forEach((p, i) => {
        p.role = roles[i]; p.alive = true; p.hasVoted = false;
        var load = {
            role: p.role, 
            word: p.role==='impostor' ? '???' : activeWordData.name, 
            hints: activeWordData.hints,
            players: oPlayers.map(x=>({id:x.id, name:x.name, alive:x.alive})),
            settings: oSettings 
        };
        if(p.isHost) renderOGame(load); else p.conn.send({type:'START', payload:load});
    });

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
        if(p.conn) p.conn.send({type:'MSG', payload: msg}); else showSystemMessage("Incorrecto", msg); 
        if(oGuessesLeft <= 0) { if(p.conn) p.conn.send({type:'DISABLE_GUESS'}); else document.getElementById('btn-online-guess').classList.add('hidden'); }
    }
}

// CLIENTE
function handleClientData(d) {
    if(d.type==='LOBBY') renderCLobby(d.payload);
    if(d.type==='SYNC') updateClientSettings(d.payload);
    if(d.type==='START') renderOGame(d.payload);
    if(d.type==='TURN_UPDATE') handleClientTurnUpdate(d.payload);
    
    if(d.type==='PHASE_CHANGE') { 
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
    
    if(d.type==='VOTES_UPDATE') updateOVoteCounts(d.payload);
    if(d.type==='CHAT_MSG') showOnlineOverlay(d.payload.text, d.payload.author, d.payload.dur);
    if(d.type==='RESULT') handleOResult(d.payload);
    if(d.type==='MSG') showSystemMessage("Aviso", d.payload);
    if(d.type==='DISABLE_GUESS') document.getElementById('btn-online-guess').classList.add('hidden');
    if(d.type==='RESET') { showScreen('online-lobby'); document.getElementById('result-modal').classList.add('hidden'); }
    if(d.type==='KICK') { showSystemMessage("Aviso", "Te echaron."); location.reload(); }
}

function handleClientTurnUpdate(state) {
    var bar=document.getElementById('online-timer-bar'), disp=document.getElementById('online-timer');
    if(oSettings.withTime) {
        var left = state.timeLeft; disp.innerText = fmtTime(left);
        if(window.clT) clearInterval(window.clT);
        window.clT = setInterval(()=>{ left--; disp.innerText = fmtTime(left); bar.style.width = ((left/state.timeLeft)*100)+"%"; if(left<=0) clearInterval(window.clT); }, 1000);
    } else { disp.innerText = "∞"; bar.style.width="100%"; }

    var isMyTurn = (state.activePlayerId === myId);
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

function onlineSkipTurn() { if(isHost) hostNextTurn(); else conn.send({type:'SKIP_TURN'}); }
function sendOnlineMessage() { var inp = document.getElementById('online-chat-input'), txt = inp.value.trim(); if(!txt) return; var dur = Math.min(5000, 1000 + (txt.length * 100)), msgData = { text: txt, author: myName, dur: dur }; if(isHost) { broadcast({type:'CHAT_MSG', payload:msgData}); showOnlineOverlay(txt, myName, dur); } else { conn.send({type:'CHAT_MSG', payload:msgData}); } setTimeout(onlineSkipTurn, 200); inp.value = ""; }
function showOnlineOverlay(text, author, time) { var ov = document.getElementById('online-msg-overlay'); document.getElementById('o-overlay-text').innerText = text; document.getElementById('o-overlay-author').innerText = author; ov.classList.remove('hidden'); setTimeout(() => ov.classList.add('hidden'), time); }

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
    if(isHost) hostCheckGuess(myId, word); else conn.send({type:'GUESS_ATTEMPT', payload:word});
    toggleOnlineGuess();
}

function onlineVote(targetId) { var grid = document.getElementById('online-grid'); if(grid.classList.contains('pointer-events-none')) return; showSystemConfirm("Confirmar", "¿Votar?", function() { if(isHost) hostProcessVote(myId, targetId); else conn.send({type:'VOTE', payload:targetId}); grid.classList.add('pointer-events-none'); document.getElementById('online-vote-msg').innerText = "Voto enviado..."; }); }

function renderOGame(d) {
    showScreen('online-game');
    if(!isHost) {
        oSettings = d.settings;
        oPlayers = d.players; // FIX: Guardar jugadores en memoria del cliente
    }
    
    document.getElementById('online-role-text').innerText = d.role==='impostor'?"IMPOSTOR":"CIVIL";
    document.getElementById('online-role-text').className = d.role==='impostor'?"text-4xl font-bold text-red-500 digital-font mb-2 animate-pulse":"text-4xl font-bold text-cyan-400 digital-font mb-2";
    document.getElementById('online-the-word').innerText = d.word;
    var hCont = document.getElementById('online-hint-container');
    if(d.role==='impostor' && d.hintsOn && d.hints.length>0) {
        document.getElementById('online-imp-cat-hint').innerText = "- " + d.hints.join("\n- ");
        hCont.classList.remove('hidden');
    } else hCont.classList.add('hidden');
    
    renderOGrid(d.players);
}

function renderOGrid(l){
    document.getElementById('online-grid').innerHTML=l.map(p => 
        `<button data-id="${p.id}" onclick="onlineVote('${p.id}')" class="relative p-4 rounded font-bold transition bg-slate-700 text-white ${p.alive?'':'opacity-50 bg-slate-900'}">
            ${p.name} ${p.alive?'':'💀'}
        </button>`
    ).join('');
}

function broadcastLobby() { renderOLobby(); broadcast({type:'LOBBY', payload:oPlayers.map(p=>({id:p.id, name:p.name, isHost:p.isHost}))}); }
function broadcast(msg) { oPlayers.forEach(p=>{if(p.conn) p.conn.send(msg)}); }
function enableHost(en) { var c=document.getElementById('host-controls'), i=c.querySelectorAll('input,select,button'); i.forEach(e=>{e.disabled=!en;e.classList.toggle('disabled-input',!en)}); if(en){c.classList.remove('opacity-50');document.getElementById('btn-start-online').classList.remove('hidden');document.getElementById('msg-wait-host').classList.add('hidden');}else{c.classList.add('opacity-50');document.getElementById('btn-start-online').classList.add('hidden');document.getElementById('msg-wait-host').classList.remove('hidden');} }
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
        if(c>0) {
            var b=""; for(var k=0;k<c;k++)b+="☝️"; 
            btn.innerHTML+='<span class="vote-count-badge">'+b+'</span>';
        }
    }
}
function kickPlayer(pid){var p=oPlayers.find(x=>x.id===pid); if(p&&p.conn)p.conn.send({type:'KICK'}); oPlayers=oPlayers.filter(x=>x.id!==pid); broadcastLobby(); adjOnlineImp(0);}
function adjOnlineImp(d){var cur=parseInt(document.getElementById('online-imp-count').innerText)+d, max = Math.ceil(oPlayers.length / 2) - 1; if(max < 1) max = 1; if(oPlayers.length < 3) max = 1; if(cur > max) cur = max; if(cur < 1) cur = 1; document.getElementById('online-imp-count').innerText=cur; syncSettings();}