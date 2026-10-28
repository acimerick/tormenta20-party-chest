import { stackKey } from "./stack-key.mjs";
const TYPES=new Set(["arma","equipamento","consumivel","tesouro","comodo","mobilia"]);
const c=v=>foundry.utils.deepClone(v);
const q=i=>{
  const n=Number(foundry.utils.getProperty(i,"system.qtd")??1);
  return Number.isFinite(n)&&n>0?n:1
};
const key=s=>stackKey(s);

export class TransferManager{
  constructor({storage,chest,adapter}){this.storage=storage;this.chest=chest;this.adapter=adapter}

  diagnose(){
    return{
      schemaVersion:4,
      transferableTypes:[...TYPES],
      actorToChest:true,
      chestToActor:true,
      actorToActor:true,
      atomicCompensation:true,
      singleHistoryEntryPerTransfer:true,
      stableItemKey:true,
      partialQuantity:true,
      discard:true
    }
  }

  isTransferable(i){return !!(i&&this.adapter.canRepresentItem(i)&&TYPES.has(i.type))}

  async actorToChest(item,{quantity=null}={}){
    if(!this.isTransferable(item))throw new Error("Item não transferível.");
    if(!item.actor?.isOwner)throw new Error(`Sem permissão para ${item.actor?.name}.`);

    const av=q(item);
    const n=Number(quantity??av);
    if(!Number.isInteger(n)||n<=0||n>av)throw new Error("Quantidade inválida/insuficiente.");

    const before=this.storage.getData();

    await this.chest.addItemFromActor(item,{
      quantity:n,
      actor:item.actor,
      recordHistory:false,
      historyAction:"actor-to-chest"
    });
    const serialized=this.adapter.serializeItem(item);
    const chestEntry=this.chest.getItems().find(x=>key(x)===key(serialized));
    const chestEntryId=chestEntry?.id;

    try{
      if(av>n){
        await item.actor.updateEmbeddedDocuments("Item",[{
          _id:item.id,
          "system.qtd":av-n
        }]);
      }else{
        await item.actor.deleteEmbeddedDocuments("Item",[item.id]);
      }
    }catch(e){
      try{
        if(chestEntryId) await this.chest.removeItemSilent(chestEntryId,n);
      }catch(compensationError){
        console.error("[tormenta20-party-chest] Falha na compensação actor-to-chest",compensationError);
      }
      throw e
    }

    await this.chest.appendHistory({
      action:"actor-to-chest",
      userId:game.user.id,
      userName:game.user.name,
      itemName:item.name,
      quantity:n,
      sourceActorUuid:item.actor.uuid,
      sourceActorName:item.actor.name,
      sourceItemUuid:item.uuid,
      destination:"chest"
    });

    return{
      ok:true,
      direction:"actor-to-chest",
      actor:item.actor.name,
      item:item.name,
      quantity:n
    }
  }


  async actorToChestCurrency(actor,key,amount){
    if(!actor?.isOwner)throw new Error(`Sem permissão para ${actor?.name}.`);
    if(!["tc","tp","to","tl"].includes(key))throw new Error("Moeda inválida.");

    const n=Number(amount);
    const current=Number(foundry.utils.getProperty(actor,`system.dinheiro.${key}`)??0);
    if(!Number.isInteger(n)||n<=0||n>current)
      throw new Error("Quantidade de moeda inválida/insuficiente.");

    try{
      await actor.update({[`system.dinheiro.${key}`]:current-n});
      await this.chest.addCurrency({[key]:n},{
        history:{
          action:"actor-to-chest-currency",
          userId:game.user.id,
          userName:game.user.name,
          itemName:key.toUpperCase(),
          quantity:n,
          currency:key,
          sourceActorUuid:actor.uuid,
          sourceActorName:actor.name,
          destination:"chest",
          note:`${actor.name} depositou ${n} ${key.toUpperCase()} no Baú.`
        }
      });
    }catch(e){
      try{await actor.update({[`system.dinheiro.${key}`]:current});}catch(_){}
      throw new Error(`Depósito de moeda falhou: ${e.message}`);
    }

    return{
      ok:true,
      direction:"actor-to-chest-currency",
      actor:actor.name,
      currency:key,
      quantity:n
    };
  }

  async chestToActorCurrency(key,actor,amount){
    if(!actor?.isOwner)throw new Error(`Sem permissão para ${actor?.name}.`);
    if(!["tc","tp","to","tl"].includes(key))throw new Error("Moeda inválida.");

    const n=Number(amount);
    const available=Number(this.chest.getCurrency()?.[key]??0);
    if(!Number.isInteger(n)||n<=0||n>available)
      throw new Error("Quantidade de moeda inválida/insuficiente no Baú.");

    const current=Number(foundry.utils.getProperty(actor,`system.dinheiro.${key}`)??0);

    try{
      await this.chest.removeCurrency({[key]:n},{
        history:{
          action:"chest-to-actor-currency",
          userId:game.user.id,
          userName:game.user.name,
          itemName:key.toUpperCase(),
          quantity:n,
          currency:key,
          destinationActorUuid:actor.uuid,
          destinationActorName:actor.name,
          destination:"actor",
          note:`${actor.name} retirou ${n} ${key.toUpperCase()} do Baú.`
        }
      });
      await actor.update({[`system.dinheiro.${key}`]:current+n});
    }catch(e){
      // If the actor update failed after the chest was debited, compensate
      // through the same authoritative GM mutation path.
      try{
        await this.chest.addCurrency({[key]:n});
      }catch(_){}
      throw new Error(`Saque de moeda falhou: ${e.message}`);
    }

    return{
      ok:true,
      direction:"chest-to-actor-currency",
      actor:actor.name,
      currency:key,
      quantity:n
    };
  }

  async chestToActor(chestId,actor,{quantity=null}={}){
    if(!actor?.isOwner)throw new Error(`Sem permissão para ${actor?.name}.`);

    const e=this.chest.getItems().find(x=>x.id===chestId);
    if(!e)throw new Error("Item não encontrado.");

    const available=Number(e.quantity??0);
    const n=Number(quantity??available);
    if(!Number.isInteger(n)||n<=0||n>available)throw new Error("Quantidade inválida/insuficiente.");

    const s={
      name:e.name,
      type:e.type,
      img:e.img,
      system:c(e.system),
      effects:c(e.effects??[]),
      flags:c(e.flags??{})
    };

    // Soma numa pilha da ficha com mesmo tipo, nome e melhorias, se existir.
    const existing=actor.items.find(i=>TYPES.has(i.type)&&key(i)===key(s));
    const actorBefore=existing?{id:existing.id,quantity:q(existing)}:null;
    let target=null;
    let operation="created";

    try{
      if(existing){
        await actor.updateEmbeddedDocuments("Item",[{
          _id:existing.id,
          "system.qtd":actorBefore.quantity+n
        }]);
        target=existing.id;
        operation="stacked";
      }else{
        const [created]=await actor.createEmbeddedDocuments("Item",[{
          ...s,
          system:{...s.system,qtd:n}
        }]);
        target=created.id;
      }

      await this.chest.removeItemSilent(chestId,n);
    }catch(e){
      // Compensate Actor mutation if the chest mutation failed.
      try{
        if(actorBefore){
          await actor.updateEmbeddedDocuments("Item",[{
            _id:actorBefore.id,
            "system.qtd":actorBefore.quantity
          }]);
        }else if(target){
          await actor.deleteEmbeddedDocuments("Item",[target]);
        }
      }catch(compensationError){
        console.error("[tormenta20-party-chest] Falha na compensação chest-to-actor",compensationError);
      }
      throw new Error(`Transferência Baú → ficha falhou: ${e.message}`);
    }

    await this.chest.appendHistory({
      action:"chest-to-actor",
      userId:game.user.id,
      userName:game.user.name,
      itemName:e.name,
      quantity:n,
      destinationActorUuid:actor.uuid,
      destinationActorName:actor.name,
      destinationItemId:target
    });

    return{
      ok:true,
      direction:"chest-to-actor",
      actor:actor.name,
      item:e.name,
      quantity:n,
      operation,
      actorItemId:target
    }
  }
}
