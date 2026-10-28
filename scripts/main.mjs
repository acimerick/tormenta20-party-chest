import { T20Adapter } from "./t20/adapter.mjs";
import { ChestStorage } from "./storage/chest-storage.mjs";
import { ChestManager } from "./core/chest-manager.mjs";
import { TransferManager } from "./core/transfer-manager.mjs";
import { ChestApp } from "./ui/chest-app.mjs";
const ID="tormenta20-party-chest";
Hooks.once("init",()=>{
 game.settings.register(ID,"chestData",{name:"Dados do Baú do Grupo",hint:"Armazenamento interno.",scope:"world",config:false,type:Object,default:{schemaVersion:5,items:[],currency:{tc:0,tp:0,to:0,tl:0},history:[]}});
 game.settings.register(ID,"openButton",{name:"Mostrar botão do Baú",scope:"world",config:true,type:Boolean,default:true});
 const m=game.modules.get(ID); if(!m)return;
 m.api={version:"1.10.1",adapter:null,storage:null,chest:null,transfer:null,app:null,status(){return{module:m.id,version:m.version,active:m.active,api:true,foundry:game.version,system:game.system?.id,systemVersion:game.system?.version,adapterLoaded:!!this.adapter,storageLoaded:!!this.storage,chestLoaded:!!this.chest,transferLoaded:!!this.transfer,uiLoaded:!!this.app}},async diagnose(){if(!this.adapter||!this.chest||!this.transfer)return{ok:false,phase:4,status:this.status()};return{phase:4,status:this.status(),environment:this.adapter.validateEnvironment(),chest:this.chest.diagnose(),transfer:this.transfer.diagnose(),ui:{loaded:!!this.app}}},open(){return this.app?.render(true)},async handleActorSheetDrop(actor,data){
    if(!this.app||data?.type!=="T20PartyChestItem") return false;
    if(!actor?.isOwner) throw new Error(`Sem permissão para ${actor?.name}.`);
    return this.app.handleActorSheetDrop(actor,data);
  }};
});
Hooks.once("ready",async()=>{
 const m=game.modules.get(ID); if(!m?.api)return;
 try{
   const adapter=new T20Adapter();
   const storage=new ChestStorage(ID);
   await storage.initialize();
   const chest=new ChestManager({storage,adapter});
   if(game.user.isGM) await chest.normalizeStacks();
   const transfer=new TransferManager({storage,chest,adapter});
   const app=new ChestApp({chest,transfer,adapter});
   Object.assign(m.api,{adapter,storage,chest,transfer,app});

   Hooks.on("t20pc-chest-updated",()=>{
     if(app.rendered) app.render();
   });

   console.log(`[${ID}] Fase 4.2 pronta.`,m.api.status())
 }catch(e){
   m.api.error={message:e.message,stack:e.stack};
   console.error(`[${ID}]`,e)
 }
});
function addChestDirectoryButton() {
  const m = game.modules.get(ID);
  if (!m?.active || !m.api?.app || game.settings.get(ID, "openButton") === false) return false;

  const section = document.querySelector("#sidebar-content #items.items-sidebar");
  const header = section?.querySelector(".directory-header");
  if (!header || header.querySelector("#t20-party-chest-button")) return !!header;

  const button = document.createElement("button");
  button.id = "t20-party-chest-button";
  button.type = "button";
  button.title = "Baú do Grupo";
  button.innerHTML = '<i class="fas fa-box-open"></i> Baú do Grupo';
  button.addEventListener("click", () => m.api.app.render(true));

  // The working Party Overview button is a direct child of .directory-header.
  // Mirror that exact DOM placement for ItemDirectory.
  header.prepend(button);
  return true;
}

function installItemDirectoryButtonObserver() {
  if (globalThis.__t20PartyChestItemObserver) return;

  const install = () => {
    addChestDirectoryButton();
    const content = document.querySelector("#sidebar-content");
    if (!content) return false;

    const observer = new MutationObserver(() => addChestDirectoryButton());
    observer.observe(content, { childList: true, subtree: true });
    globalThis.__t20PartyChestItemObserver = observer;
    return true;
  };

  if (!install()) {
    const bootObserver = new MutationObserver(() => {
      if (install()) bootObserver.disconnect();
    });
    bootObserver.observe(document.body, { childList: true, subtree: true });
  }
}

Hooks.once("ready", () => installItemDirectoryButtonObserver());

Hooks.on("dropActorSheetData", (actor, sheet, data) => {
  const m = game.modules.get(ID);
  if (!m?.active || data?.type !== "T20PartyChestItem" || !m.api?.handleActorSheetDrop) return;
  Promise.resolve(m.api.handleActorSheetDrop(actor, data))
    .catch(error => ui.notifications.error(error.message));
});
