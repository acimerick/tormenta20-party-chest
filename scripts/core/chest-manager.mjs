import { stackKey } from "./stack-key.mjs";
const id=p=>`${p}-${foundry.utils.randomID(16)}`;
const clone=v=>foundry.utils.deepClone(v);
const stableKey=s=>stackKey(s);

export class ChestManager{
  constructor({storage,adapter}){this.storage=storage;this.adapter=adapter}
  getData(){return this.storage.getData()}
  getItems(){return this.getData().items}
  getCurrency(){return this.getData().currency}
  getHistory(){return this.getData().history}
  isLocked(){return this.storage.isLocked()}
  async setLocked(locked){return this.storage.setLocked(locked)}
  async withPermission(description,fn){return this.storage.withPermission(description,fn)}

  diagnose(){
    const d=this.getData();
    return {
      initialized:true,
      schemaVersion:d.schemaVersion,
      itemCount:d.items.length,
      currency:d.currency,
      historyCount:d.history.length,
      locked:this.isLocked(),
      journal:this.storage.journal?.uuid??null,
      items:d.items
    }
  }

  _findEquivalent(items, serialized){
    const k=stableKey(serialized);
    return items.find(x=>{
      return stableKey(x)===k;
    });
  }

  async addItemData(serialized,{quantity=1,source=null,recordHistory=true,historyAction="deposit-copy"}={}){
    if(!serialized?.name||!serialized?.type)throw new Error("Dados de Item inválidos.");
    const n=Number(quantity);
    if(!Number.isInteger(n)||n<=0)throw new Error("Quantidade inválida.");
    return this.storage.requestMutation("addItemData",{
      serialized:clone(serialized),
      quantity:n,
      source:clone(source??{uuid:null}),
      recordHistory,
      historyAction,
      user:{id:game.user.id,name:game.user.name}
    });
  }

  async addItemFromActor(item,{quantity=null,actor=item?.actor,recordHistory=true,historyAction="deposit-copy"}={}){
    if(!this.adapter.canRepresentItem(item))throw new Error("Documento não é Item T20.");
    const s=this.adapter.serializeItem(item);
    const av=Number(this.adapter.getItemQuantity(item)??1);
    const n=quantity==null?av:Number(quantity);
    if(!Number.isInteger(n)||n<=0||n>av)throw new Error("Quantidade inválida/insuficiente.");

    return this.addItemData(s,{
      quantity:n,
      source:{
        uuid:item.uuid??null,
        actorUuid:actor?.uuid??null,
        actorName:actor?.name??null,
        itemId:item.id??null
      },
      recordHistory,
      historyAction
    });
  }

  async normalizeStacks(){
    return this.storage.update(d=>{
      const merged=[];
      for(const item of d.items){
        const s={name:item.name,type:item.type,img:item.img,system:item.system,effects:item.effects,flags:item.flags};
        const k=stableKey(s);
        const existing=merged.find(x=>stableKey(x)===k);
        if(existing){
          existing.quantity=Number(existing.quantity??0)+Number(item.quantity??0);
          existing.stableItemKey=k;
          existing.itemKey=k;
        }else{
          item.stableItemKey=k;
          item.itemKey=k;
          item.fingerprint=k;
          merged.push(item);
        }
      }
      d.items=merged;
      d.schemaVersion=Math.max(Number(d.schemaVersion??1),5);
      return d
    })
  }

  async removeItemSilent(itemId,n=1){
    const amount=Number(n);
    if(!Number.isInteger(amount)||amount<=0)throw new Error("Quantidade inválida.");
    return this.storage.requestMutation("removeItem",{
      itemId,
      quantity:amount,
      user:{id:game.user.id,name:game.user.name}
    });
  }

  async discardItem(itemId,n=1){
    const amount=Number(n);
    if(!Number.isInteger(amount)||amount<=0)throw new Error("Quantidade inválida.");
    return this.storage.requestMutation("discardItem",{
      itemId,
      quantity:amount,
      user:{id:game.user.id,name:game.user.name}
    });
  }

  async appendHistory(e){
    return this.storage.requestMutation("appendHistory",{
      entry:clone(e)
    });
  }

  async addCurrency(v,{history=null}={}){
    return this.storage.requestMutation("addCurrency",{
      currency:v,
      history
    });
  }

  async removeCurrency(v,{history=null}={}){
    return this.storage.requestMutation("removeCurrency",{
      currency:v,
      history
    });
  }

  async clearHistory(){
    if(!game.user.isGM)throw new Error("Somente GM.");
    return this.storage.update(d=>{d.history=[];return d})
  }
}
