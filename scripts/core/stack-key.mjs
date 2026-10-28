// Regra única de agrupamento, usada na ficha e no Baú:
// mesmo tipo + mesmo nome (sem diferenciar maiúsculas e espaços nas pontas)
// + mesmas melhorias, material e encantos (system.upgrades do T20).
// Assim uma "Espada longa" comum não absorve uma "Espada longa" Certeira.
const norm=v=>String(v??"").trim().toLocaleLowerCase();

export const upgradeSignature=system=>{
  const upgrades=system?.upgrades;
  if(!upgrades||typeof upgrades!=="object")return "";
  return Object.values(upgrades).map(norm).filter(Boolean).sort().join("|");
};

// Aceita dados serializados, entradas do Baú ou Items da ficha. Para Items,
// usa os dados de origem (_source), sem valores calculados pelo sistema.
export const stackKey=source=>{
  const s=source?._source??source??{};
  return JSON.stringify([norm(s.type),norm(s.name),upgradeSignature(s.system)]);
};
