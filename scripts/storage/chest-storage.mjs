import { stackKey } from "../core/stack-key.mjs";
const D={schemaVersion:4,items:[],currency:{tc:0,tp:0,to:0,tl:0},history:[]};
const JOURNAL_NAME="Baú do Grupo";
const MUTATION_TIMEOUT=15000;
const PERMISSION_TIMEOUT=120000;
const GRANT_TTL=180000;

// O Baú é guardado nas flags de um Diário ("Baú do Grupo").
// Aberto: o Diário fica com permissão padrão de Dono e cada jogador grava
// direto, sem precisar de um Mestre online.
// Trancado: o Diário fica como Observador; o jogador pede autorização ao
// Mestre pelo socket e o Mestre executa a gravação em nome dele.
export class ChestStorage{
 constructor(id){
   this.id=id;
   this.key="chestData";
   this.channel=`module.${id}`;
   this.data=null;
   this.journal=null;
   this.initialized=false;
   this._pending=new Map();
   this._grants=new Map();
   this._grant=null;
   this._socketBound=false;
   this._hooksBound=false;
 }

 async initialize(){
   this.journal=this._findJournal();
   if(!this.journal && game.user.isGM) this.journal=await this._createJournal();

   // Sem Diário (o Mestre ainda não entrou desde a atualização): mostra os
   // dados antigos da configuração de mundo, apenas para leitura.
   const v=this.journal ? this.journal.getFlag(this.id,"data") : game.settings.get(this.id,this.key);
   this.data=this.n(v);
   this.initialized=true;
   this._bindSocket();
   this._bindHooks();
   ui.journal?.render();
   return this.getData();
 }

 _findJournal(){
   return game.journal?.find(j=>j.getFlag(this.id,"chest")===true) ?? null;
 }

 async _createJournal(){
   // Migração: o conteúdo atual da configuração de mundo vira o conteúdo do
   // Diário. A configuração antiga é mantida como cópia de segurança.
   const legacy=this.n(game.settings.get(this.id,this.key));
   const O=CONST.DOCUMENT_OWNERSHIP_LEVELS;
   return JournalEntry.create({
     name:JOURNAL_NAME,
     ownership:{default:O.OWNER},
     flags:{[this.id]:{chest:true,locked:false,data:legacy}}
   });
 }

 _bindHooks(){
   if(this._hooksBound)return;
   this._hooksBound=true;

   const refresh=doc=>{
     if(doc.getFlag(this.id,"chest")!==true)return;
     this.journal=doc;
     this.data=this.n(doc.getFlag(this.id,"data"));
     if(this.initialized) Hooks.callAll("t20pc-chest-updated",this.getData());
   };
   Hooks.on("createJournalEntry",refresh);
   Hooks.on("updateJournalEntry",refresh);

   // O Diário técnico não aparece na barra lateral dos jogadores.
   Hooks.on("renderJournalDirectory",(_app,html)=>{
     if(game.user.isGM||!this.journal)return;
     const root=html instanceof HTMLElement?html:html?.[0];
     root?.querySelector(`[data-entry-id="${this.journal.id}"]`)?.remove();
   });
 }

 _activeGM(){
   return game.users?.activeGM ?? game.users?.find?.(u=>u.isGM&&u.active) ?? null;
 }

 _isMutationAuthority(){
   const activeGm=this._activeGM();
   return game.user.isGM && (!activeGm || activeGm.id===game.user.id);
 }

 isLocked(){
   return this.journal?.getFlag(this.id,"locked")===true;
 }

 async setLocked(locked){
   if(!game.user.isGM)throw new Error("Somente o Mestre pode trancar ou abrir o Baú.");
   if(!this.journal)throw new Error("Diário do Baú não encontrado.");
   const O=CONST.DOCUMENT_OWNERSHIP_LEVELS;
   await this.journal.update({
     "ownership.default":locked?O.OBSERVER:O.OWNER,
     [`flags.${this.id}.locked`]:!!locked
   });
   return this.isLocked();
 }

 _canWriteDirectly(){
   if(!this.journal)return false;
   if(game.user.isGM)return true;
   return !this.isLocked() && this.journal.isOwner;
 }

 _bindSocket(){
   if(this._socketBound || !game.socket?.on)return;
   this._socketBound=true;

   game.socket.on(this.channel,async message=>{
     if(!message?.type)return;

     if(message.type==="response"){
       const pending=this._pending.get(message.requestId);
       if(!pending)return;
       this._pending.delete(message.requestId);
       if(message.ok) pending.resolve(message);
       else pending.reject(new Error(message.error||"Operação do Baú falhou."));
       return;
     }

     if(!this._isMutationAuthority())return;

     if(message.type==="permission-release"){
       this._grants.delete(message.grantId);
       return;
     }

     if(message.type==="permission-request"){
       const allowed=await this._askGMPermission(message);
       if(!allowed){
         this._respond(message,{ok:false,error:"O Mestre não autorizou a movimentação no Baú."});
         return;
       }
       const grantId=foundry.utils.randomID(16);
       this._grants.set(grantId,{userId:message.userId,expires:Date.now()+GRANT_TTL});
       this._respond(message,{ok:true,grantId});
       return;
     }

     if(message.type==="mutation-request"){
       try{
         if(this.isLocked()){
           const grant=this._grants.get(message.grantId);
           if(!grant || grant.userId!==message.userId || grant.expires<Date.now())
             throw new Error("O Baú está trancado e o pedido não tem autorização do Mestre.");
         }
         const data=await this._applyMutation(message.operation,message.payload??{});
         this._respond(message,{ok:true,data});
       }catch(error){
         this._respond(message,{ok:false,error:error?.message??String(error)});
       }
     }
   });
 }

 _respond(message,body){
   game.socket.emit(this.channel,{type:"response",requestId:message.requestId,...body});
 }

 async _askGMPermission(message){
   const DialogV2=foundry.applications.api.DialogV2;
   const esc=v=>foundry.utils.escapeHTML(String(v??""));
   try{
     return await DialogV2.confirm({
       window:{title:"Baú do Grupo trancado",icon:"fas fa-lock"},
       content:`<p><strong>${esc(message.userName)}</strong> pede permissão para: ${esc(message.description)}.</p><p>Autorizar?</p>`,
       yes:{label:"Autorizar"},
       no:{label:"Negar"},
       rejectClose:false
     })===true;
   }catch(_){return false}
 }

 _socketRequest(type,body,timeoutMs,timeoutMessage){
   if(!game.socket?.emit)throw new Error("Canal de sincronização do Baú indisponível.");
   const requestId=foundry.utils.randomID(16);
   const promise=new Promise((resolve,reject)=>{
     const timeout=setTimeout(()=>{
       this._pending.delete(requestId);
       reject(new Error(timeoutMessage));
     },timeoutMs);
     this._pending.set(requestId,{
       resolve:value=>{clearTimeout(timeout);resolve(value)},
       reject:error=>{clearTimeout(timeout);reject(error)}
     });
   });
   game.socket.emit(this.channel,{
     type,
     requestId,
     userId:game.user.id,
     userName:game.user.name,
     ...body
   });
   return promise;
 }

 // Envolve uma movimentação completa (que pode ter várias mutações).
 // Com o Baú aberto, apenas executa. Trancado, pede autorização ao Mestre
 // antes de mexer em qualquer ficha.
 async withPermission(description,fn){
   if(game.user.isGM || !this.isLocked())return fn();
   if(!this._activeGM())
     throw new Error("O Baú está trancado pelo Mestre, e nenhum Mestre está online para autorizar.");

   ui.notifications.info("Baú trancado: aguardando autorização do Mestre…");
   const response=await this._socketRequest(
     "permission-request",
     {description},
     PERMISSION_TIMEOUT,
     "O Mestre não respondeu ao pedido de acesso ao Baú."
   );

   this._grant=response.grantId;
   try{
     return await fn();
   }finally{
     game.socket.emit(this.channel,{type:"permission-release",grantId:this._grant});
     this._grant=null;
   }
 }

 _historyEntry(payload, fallback={}){
   const h=foundry.utils.deepClone(payload??{});
   return {
     id:foundry.utils.randomID(16),
     timestamp:Date.now(),
     ...fallback,
     ...h
   };
 }

 _applyAddItemData(d,payload){
   const serialized=payload.serialized;
   if(!serialized?.name||!serialized?.type)throw new Error("Dados de Item inválidos.");
   const n=Number(payload.quantity??1);
   if(!Number.isInteger(n)||n<=0)throw new Error("Quantidade inválida.");

   const k=stackKey(serialized);
   const equivalent=d.items.find(x=>{
     return stackKey(x)===k;
   });

   if(equivalent){
     equivalent.quantity=Number(equivalent.quantity??0)+n;
     equivalent.stableItemKey=k;
     equivalent.itemKey=k;
   }else{
     d.items.push({
       id:`chest-${foundry.utils.randomID(16)}`,
       itemKey:k,
       stableItemKey:k,
       fingerprint:k,
       name:serialized.name,
       type:serialized.type,
       img:serialized.img,
       system:foundry.utils.deepClone(serialized.system??{}),
       effects:foundry.utils.deepClone(serialized.effects??[]),
       flags:foundry.utils.deepClone(serialized.flags??{}),
       quantity:n,
       source:foundry.utils.deepClone(payload.source??{uuid:null}),
       createdAt:Date.now()
     });
   }

   if(payload.recordHistory!==false){
     const user=payload.user??{};
     d.history.push(this._historyEntry({
       action:payload.historyAction??"deposit-copy",
       userId:user.id??null,
       userName:user.name??null,
       itemName:serialized.name,
       quantity:n,
       sourceUuid:payload.source?.uuid??null,
       sourceActorUuid:payload.source?.actorUuid??null,
       sourceActorName:payload.source?.actorName??null,
       note:"Item adicionado ao Baú."
     }));
   }
   return d;
 }

 _applyRemoveItem(d,payload,{history=false,action="discard"}={}){
   const itemId=payload.itemId;
   const amount=Number(payload.quantity??1);
   if(!Number.isInteger(amount)||amount<=0)throw new Error("Quantidade inválida.");
   const i=d.items.findIndex(x=>x.id===itemId);
   if(i<0)throw new Error("Item não encontrado.");
   const e=d.items[i];
   if(Number(e.quantity??0)<amount)throw new Error("Quantidade insuficiente.");
   e.quantity-=amount;
   if(e.quantity===0)d.items.splice(i,1);

   if(history){
     const user=payload.user??{};
     d.history.push(this._historyEntry({
       action,
       userId:user.id??null,
       userName:user.name??null,
       itemName:e.name,
       quantity:amount,
       destination:"trash",
       note:"Item descartado do Baú."
     }));
   }
   return d;
 }

 async _applyMutation(operation,payload){
   switch(operation){
     case "addCurrency":
       return this._localUpdate(d=>{
         for(const k of["tc","tp","to","tl"])d.currency[k]+=Number(payload.currency?.[k]??0);
         if(payload.history)d.history.push(this._historyEntry(payload.history));
         return d;
       });

     case "removeCurrency":
       return this._localUpdate(d=>{
         for(const k of["tc","tp","to","tl"]){
           const n=Number(payload.currency?.[k]??0);
           if(n<0||d.currency[k]<n)throw new Error(`Saldo insuficiente de ${k}.`);
           d.currency[k]-=n;
         }
         if(payload.history)d.history.push(this._historyEntry(payload.history));
         return d;
       });

     case "addItemData":
       return this._localUpdate(d=>this._applyAddItemData(d,payload));

     case "removeItem":
       return this._localUpdate(d=>this._applyRemoveItem(d,payload));

     case "discardItem":
       return this._localUpdate(d=>this._applyRemoveItem(d,payload,{history:true,action:"discard"}));

     case "appendHistory":
       return this._localUpdate(d=>{
         d.history.push(this._historyEntry(payload.entry??{}));
         return d;
       });

     case "clearHistory":
       return this._localUpdate(d=>{d.history=[];return d});

     default:
       throw new Error(`Mutação do Baú não permitida: ${operation}`);
   }
 }

 async _localUpdate(fn){
   // Relê o Diário imediatamente antes de aplicar a mudança para reduzir o
   // risco de sobrescrever a movimentação de outro jogador.
   const d=this.journal ? this.n(this.journal.getFlag(this.id,"data")) : this.getData();
   const result=await fn(d);
   this.data=this.n(result??d);
   await this.save();
   return this.getData();
 }

 async requestMutation(operation,payload={}){
   if(this._canWriteDirectly())return this._applyMutation(operation,payload);

   if(!this.journal)
     throw new Error("O Baú ainda não foi preparado. O Mestre precisa entrar no mundo uma vez com esta versão do módulo.");
   if(!this.isLocked())
     throw new Error(`Sem permissão de escrita no Diário "${JOURNAL_NAME}". Peça ao Mestre para conferir as permissões dele.`);
   if(!this._grant)
     throw new Error("O Baú está trancado. É preciso a autorização do Mestre.");

   const response=await this._socketRequest(
     "mutation-request",
     {operation,payload:foundry.utils.deepClone(payload),grantId:this._grant},
     MUTATION_TIMEOUT,
     "Não foi possível sincronizar a operação do Baú com o Mestre."
   );
   if(response.data) this.data=this.n(response.data);
   return this.getData();
 }

 getData(){if(!this.initialized)throw new Error("Storage não inicializado.");return foundry.utils.deepClone(this.data)}
 n(v){v=v&&typeof v==="object"?v:{};return{schemaVersion:Math.max(4,Number(v.schemaVersion??1)),items:Array.isArray(v.items)?foundry.utils.deepClone(v.items):[],currency:{tc:Number(v.currency?.tc??0),tp:Number(v.currency?.tp??0),to:Number(v.currency?.to??0),tl:Number(v.currency?.tl??0)},history:Array.isArray(v.history)?foundry.utils.deepClone(v.history):[]}}

 async save(){
   this.data=this.n(this.data);
   if(!this._canWriteDirectly())throw new Error("Sem permissão para gravar no Baú.");
   const data=foundry.utils.deepClone(this.data);
   await this.journal.update({[`flags.${this.id}.data`]:data});
   return this.getData();
 }

 async update(fn){
   if(!game.user.isGM)throw new Error("Persistência direta indisponível para este usuário.");
   return this._localUpdate(fn);
 }

 async replaceData(d){
   if(!game.user.isGM)throw new Error("Operação administrativa do Baú indisponível para este usuário.");
   this.data=this.n(d);
   await this.save();
   return this.getData();
 }

 async clear(){return this.replaceData(D)}
}
