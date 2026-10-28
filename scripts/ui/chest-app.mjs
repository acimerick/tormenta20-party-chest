const CATS = [
  ["all", "Todos", "fas fa-layer-group"],
  ["arma", "Armas", "fas fa-swords"],
  ["equipamento", "Equipamentos", "fas fa-shield-halved"],
  ["consumivel", "Consumíveis", "fas fa-flask"],
  ["tesouro", "Tesouros", "fas fa-gem"],
  ["mobilia", "Mobiliário", "fas fa-chair"],
  ["comodo", "Cômodos", "fas fa-house"]
];

const COINS = [
  ["to", "TO", "Tibar de ouro", "gold"],
  ["tp", "TP", "Tibar de prata", "silver"],
  ["tc", "TC", "Tibar de cobre", "copper"]
];

const escape = (v) => foundry.utils.escapeHTML(String(v ?? ""));

export class ChestApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "t20-party-chest",
    classes: ["t20-party-chest"],
    tag: "section",
    window: {
      title: "Baú do Grupo",
      icon: "fas fa-box-open",
      resizable: true
    },
    position: {
      width: 980,
      height: 680
    }
  };

  constructor({ chest, transfer, adapter }) {
    super();
    this.chest = chest;
    this.transfer = transfer;
    this.adapter = adapter;
    this.category = "all";
    this.search = "";
    this.tab = "items";
    this._rendering = false;
  }

  async _renderHTML(_context, _options) {
    const data = this.chest.getData();
    const locked = this.chest.isLocked();
    const items = data.items.filter(item =>
      (this.category === "all" || item.type === this.category) &&
      (!this.search || item.name.toLocaleLowerCase().includes(this.search.toLocaleLowerCase()))
    );
    const total = data.items.reduce((n, x) => n + Number(x.quantity ?? 0), 0);

    const root = document.createElement("div");
    root.className = "t20pc-shell";

    root.innerHTML = `
      <header class="t20pc-header">
        <div class="t20pc-title">
          <span class="t20pc-emblem" aria-hidden="true"><i class="fas fa-box-open"></i></span>
          <div class="t20pc-title-text">
            <h2>Baú do Grupo</h2>
            <small>Patrimônio compartilhado · ${total} ${total === 1 ? "item" : "itens"}</small>
          </div>
          ${this._lockHTML()}
        </div>

        <div class="t20pc-coins">
          ${COINS.map(([key, label, title, metal]) => `
            <div class="t20pc-coin t20pc-coin-${metal}" data-coin="${key}" title="${escape(title)}">
              <span class="t20pc-coin-disc" aria-hidden="true">${label}</span>
              <span class="t20pc-coin-info">
                <b>${Number(data.currency[key] ?? 0)}</b>
                <small>${escape(title)}</small>
              </span>
              <span class="t20pc-coin-actions">
                <button type="button" data-coin-action="add" data-coin="${key}" title="Depositar ${label}" aria-label="Depositar ${label}">+</button>
                <button type="button" data-coin-action="remove" data-coin="${key}" title="Retirar ${label}" aria-label="Retirar ${label}">−</button>
              </span>
            </div>
          `).join("")}
        </div>
      </header>

      ${locked ? `
        <div class="t20pc-locked-banner">
          <i class="fas fa-lock"></i>
          <span>${game.user.isGM
            ? "O Baú está trancado. Cada movimentação dos jogadores pede a sua autorização."
            : "O Mestre trancou o Baú. Você pode ver tudo, mas cada movimentação precisa da autorização dele."}</span>
        </div>
      ` : ""}

      <nav class="t20pc-tabs">
        <button type="button" data-tab="items" class="${this.tab === "items" ? "active" : ""}">
          <i class="fas fa-boxes-stacked"></i> Itens
        </button>
        <button type="button" data-tab="history" class="${this.tab === "history" ? "active" : ""}">
          <i class="fas fa-clock-rotate-left"></i> Histórico
        </button>
        ${game.user.isGM ? `
          <div class="t20pc-gm-money">
            <button type="button" class="t20pc-gm-deposit" data-gm-deposit title="Depósito do Mestre">
              <i class="fas fa-circle-plus"></i>
              <span>Depósito do Mestre</span>
            </button>
            <button type="button" class="t20pc-gm-withdraw" data-gm-withdraw title="Saque do Mestre">
              <i class="fas fa-circle-minus"></i>
              <span>Saque do Mestre</span>
            </button>
          </div>
        ` : ""}
      </nav>

      <section class="t20pc-body">
        <aside class="t20pc-sidebar">
          <span class="t20pc-sidebar-label">Categorias</span>
          ${CATS.map(([id, label, icon]) => {
            const count = id === "all"
              ? total
              : data.items.filter(x => x.type === id).reduce((n, x) => n + Number(x.quantity ?? 0), 0);
            const classes = [this.category === id ? "active" : "", count ? "" : "empty"].filter(Boolean).join(" ");

            return `
              <button type="button" data-cat="${id}" class="${classes}">
                <i class="${icon}"></i>
                <span>${label}</span>
                <em>${count}</em>
              </button>
            `;
          }).join("")}
        </aside>

        <main class="t20pc-main">
          ${this.tab === "items"
            ? this._itemsHTML(items)
            : this._historyHTML(data.history)}
        </main>
      </section>
    `;

    this._bind(root);
    return root;
  }

  _lockHTML() {
    const locked = this.chest.isLocked();
    const title = locked
      ? "Baú trancado: jogadores precisam da autorização do Mestre para movimentar."
      : "Baú aberto: jogadores movimentam livremente.";
    const hint = game.user.isGM ? (locked ? " Clique para abrir." : " Clique para trancar.") : "";
    return `
      <button type="button" class="t20pc-lock ${locked ? "locked" : "open"}" data-lock
        ${game.user.isGM ? "" : "disabled"} title="${escape(title + hint)}">
        <i class="fas ${locked ? "fa-lock" : "fa-lock-open"}"></i>
        <span>${locked ? "Trancado" : "Aberto"}</span>
      </button>
    `;
  }

  _replaceHTML(result, content, _options) {
    // ApplicationV2 V13 requires both abstract rendering methods.
    // _renderHTML returns the complete content HTMLElement; replace the
    // existing content without touching the outer Foundry application frame.
    if (!(result instanceof HTMLElement)) {
      throw new Error("ChestApp._renderHTML deve retornar um HTMLElement.");
    }
    content.replaceChildren(result);
  }

  _itemsHTML(items) {
    return `
      <div class="t20pc-toolbar">
        <label>
          <i class="fas fa-search"></i>
          <input data-search placeholder="Buscar item..." aria-label="Buscar item" value="${escape(this.search)}">
          <small>Arraste itens da ficha para cá</small>
        </label>
      </div>

      <div class="t20pc-items">
        ${items.length
          ? items.map(item => `
            <article class="t20pc-item" draggable="true" data-id="${escape(item.id)}">
              <span class="t20pc-item-img">
                <img src="${escape(item.img)}" alt="">
                <b>×${Number(item.quantity ?? 0)}</b>
              </span>
              <div class="t20pc-item-info">
                <strong title="${escape(item.name)}">${escape(item.name)}</strong>
                <small>${escape(this.adapter.getItemCategory(item))}</small>
              </div>
              <span class="t20pc-item-actions">
                <button type="button" class="t20pc-take" data-take="${escape(item.id)}" title="Retirar para um personagem">
                  <i class="fas fa-hand"></i> Retirar
                </button>
                <button type="button" class="t20pc-discard" data-discard="${escape(item.id)}" title="Descartar" aria-label="Descartar ${escape(item.name)}">
                  <i class="fas fa-trash"></i>
                </button>
              </span>
            </article>
          `).join("")
          : `
            <div class="t20pc-empty">
              <i class="fas fa-box-open"></i>
              <p>Nenhum item encontrado.</p>
              <small>Arraste um item da ficha, do Diretório ou de um Compêndio para o Baú.</small>
            </div>
          `
        }
        ${items.length ? `<div class="t20pc-empty t20pc-search-empty" hidden>
          <i class="fas fa-search"></i>
          <p>Nenhum item corresponde à busca.</p>
        </div>` : ""}
      </div>
    `;
  }

  _historyKind(action) {
    if (action === "discard") return "trash";
    if (/^(chest-to-actor|gm-currency-withdraw|currency-remove)/.test(action ?? "")) return "out";
    return "in";
  }

  _historyQuantity(entry, kind) {
    const sign = kind === "in" ? "+" : kind === "out" ? "−" : "";
    if (entry.currency && typeof entry.currency === "object") {
      return Object.entries(entry.currency)
        .filter(([, v]) => Number(v))
        .map(([k, v]) => `${sign}${Number(v)} ${k.toUpperCase()}`)
        .join(" ");
    }
    if (entry.quantity == null) return "";
    if (typeof entry.currency === "string") return `${sign}${entry.quantity} ${entry.currency.toUpperCase()}`;
    return `×${entry.quantity}`;
  }

  _historyHTML(history) {
    const icons = { in: "fa-arrow-down", out: "fa-arrow-up", trash: "fa-trash" };
    return `
      <div class="t20pc-history-head">
        <div>
          <strong>Movimentações</strong>
          <small>Registros mais recentes primeiro.</small>
        </div>

        ${game.user.isGM
          ? `<button type="button" data-clear><i class="fas fa-trash"></i> Limpar histórico</button>`
          : ""}
      </div>

      <div class="t20pc-history">
        ${history.length
          ? history.slice().reverse().map(entry => {
            const kind = this._historyKind(entry.action);
            return `
              <div class="t20pc-history-row t20pc-${kind}">
                <span class="t20pc-history-icon" aria-hidden="true"><i class="fas ${icons[kind]}"></i></span>
                <div class="t20pc-history-text">
                  <span><strong>${escape(entry.itemName ?? "Moedas")}</strong> · ${escape(this._historyText(entry))}</span>
                  <small>${entry.userName ? `por ${escape(entry.userName)} · ` : ""}${escape(new Date(entry.timestamp).toLocaleString())}${entry.note && entry.action?.startsWith("gm-") ? ` · ${escape(entry.note)}` : ""}</small>
                </div>
                <b>${escape(this._historyQuantity(entry, kind))}</b>
              </div>
            `;
          }).join("")
          : `
            <div class="t20pc-empty">
              <i class="fas fa-clock-rotate-left"></i>
              <p>Nenhum registro.</p>
            </div>
          `
        }
      </div>
    `;
  }

  _historyText(entry) {
    return ({
      "actor-to-chest": `${entry.sourceActorName ?? "Personagem"} → Baú`,
      "chest-to-actor": `Baú → ${entry.destinationActorName ?? "Personagem"}`,
      "actor-to-actor": `${entry.sourceActorName ?? "Personagem"} → ${entry.destinationActorName ?? "Personagem"}`,
      "discard": "Baú → Lixo",
      "currency-add": "Moedas adicionadas ao Baú",
      "currency-remove": "Moedas retiradas do Baú",
      "actor-to-chest-currency": `${entry.sourceActorName ?? "Personagem"} → Baú`,
      "chest-to-actor-currency": `Baú → ${entry.destinationActorName ?? "Personagem"}`,
      "gm-currency-deposit": "Depósito direto do Mestre",
      "gm-currency-withdraw": "Saque direto do Mestre"
    })[entry.action] ?? entry.action ?? "Movimentação";
  }

  async _askQuantity({title, itemName, max, defaultValue=null}) {
    const limit = Number(max);
    const initial = Number(defaultValue ?? limit);
    const DialogV2 = foundry.applications.api.DialogV2;
    if (!DialogV2?.input) throw new Error("DialogV2.input não está disponível no Foundry V13.");

    const fd = await DialogV2.input({
      window: { title },
      content: `
        <form>
          <p>Quantidade de <strong>${escape(itemName)}</strong> (máximo ${limit}).</p>
          <input name="quantity" type="number" min="1" max="${limit}" step="1" value="${initial}" autofocus>
        </form>
      `,
      ok: { label: "Confirmar" },
      rejectClose: false
    });

    if (!fd) return null;
    const n = Number(fd.quantity);
    if (!Number.isInteger(n) || n < 1 || n > limit) {
      ui.notifications.warn(`Informe uma quantidade entre 1 e ${limit}.`);
      return null;
    }
    return n;
  }

  async _chooseActor() {
    const characters = game.actors.filter(a => a.type === "character" && a.isOwner);
    if (!characters.length) throw new Error("Nenhum personagem disponível para receber o item.");

    const DialogV2 = foundry.applications.api.DialogV2;
    const options = characters.map(a =>
      `<option value="${escape(a.uuid)}">${escape(a.name)}</option>`
    ).join("");

    const fd = await DialogV2.input({
      window: { title: "Retirar item do Baú" },
      content: `
        <form>
          <label>Personagem</label>
          <select name="actor" autofocus>${options}</select>
        </form>
      `,
      ok: { label: "Continuar" },
      rejectClose: false
    });
    if (!fd) return null;
    return await fromUuid(fd.actor);
  }

  async _discard(chestId) {
    const item = this.chest.getItems().find(x => x.id === chestId);
    if (!item) throw new Error("Item não encontrado.");

    const n = await this._askQuantity({
      title: "Descartar item",
      itemName: item.name,
      max: Number(item.quantity ?? 0)
    });
    if (n == null) return;

    await this.chest.withPermission(`descartar ${item.name} ×${n}`,
      () => this.chest.discardItem(chestId, n));
    ui.notifications.info(`${item.name} descartado do Baú (×${n}).`);
    await this.render();
  }

  async handleActorSheetDrop(actor, data) {
    const item = this.chest.getItems().find(x => x.id === data.chestId);
    if (!item) throw new Error("Item do Baú não encontrado.");

    const n = await this._askQuantity({
      title: `Retirar do Baú → ${actor.name}`,
      itemName: item.name,
      max: Number(item.quantity ?? 0),
      defaultValue: Math.min(Number(data.quantity ?? item.quantity ?? 1), Number(item.quantity ?? 1))
    });
    if (n == null) return null;

    const result = await this.chest.withPermission(`retirar ${item.name} ×${n} para ${actor.name}`,
      () => this.transfer.chestToActor(item.id, actor, { quantity: n }));
    ui.notifications.info(`${item.name} ×${n} transferido para ${actor.name}.`);
    await this.render();
    return result;
  }

  async _takeToActor(chestId) {
    const item = this.chest.getItems().find(x => x.id === chestId);
    if (!item) throw new Error("Item não encontrado.");

    const actor = await this._chooseActor();
    if (!actor) return;

    const n = await this._askQuantity({
      title: "Retirar item do Baú",
      itemName: item.name,
      max: Number(item.quantity ?? 0)
    });
    if (n == null) return;

    const result = await this.chest.withPermission(`retirar ${item.name} ×${n} para ${actor.name}`,
      () => this.transfer.chestToActor(chestId, actor, {quantity:n}));
    ui.notifications.info(`${item.name} ×${n} transferido para ${actor.name}.`);
    await this.render();
    return result;
  }

  async _gmDeposit() {
    if (!game.user.isGM) {
      ui.notifications.warn("Somente o Mestre pode fazer um depósito direto.");
      return;
    }

    const DialogV2 = foundry.applications.api.DialogV2;
    if (!DialogV2?.input) throw new Error("DialogV2.input não está disponível no Foundry V13.");

    const fd = await DialogV2.input({
      window: { title: "Depósito do Mestre" },
      content: `
        <form>
          <p>Adicione diretamente ao patrimônio do grupo. Nenhum personagem será alterado.</p>
          <label>Valor em Tibar de Ouro (TO)
            <input name="to" type="number" min="0" step="1" value="0" autofocus>
          </label>
          <label>Valor em Tibar de Prata (TP)
            <input name="tp" type="number" min="0" step="1" value="0">
          </label>
          <label>Valor em Tibar de Cobre (TC)
            <input name="tc" type="number" min="0" step="1" value="0">
          </label>
          <label>Observação
            <input name="note" type="text" placeholder="Ex.: Tesouro encontrado na masmorra">
          </label>
        </form>
      `,
      ok: { label: "Depositar" },
      rejectClose: false
    });

    if (!fd) return;

    const values = {
      to: Math.max(0, Math.trunc(Number(fd.to ?? 0))),
      tp: Math.max(0, Math.trunc(Number(fd.tp ?? 0))),
      tc: Math.max(0, Math.trunc(Number(fd.tc ?? 0))),
      tl: 0
    };

    if (!values.to && !values.tp && !values.tc) {
      ui.notifications.warn("Informe pelo menos um valor para depositar.");
      return;
    }

    await this.chest.addCurrency(values);
    await this.chest.appendHistory({
      action: "gm-currency-deposit",
      userId: game.user.id,
      userName: game.user.name,
      itemName: "Depósito do Mestre",
      quantity: null,
      currency: values,
      destination: "chest",
      note: fd.note?.trim() || "Valor adicionado diretamente pelo Mestre."
    });

    ui.notifications.info("Valor adicionado diretamente ao Baú.");
    await this.render();
  }

  async _gmWithdraw() {
    if (!game.user.isGM) {
      ui.notifications.warn("Somente o Mestre pode fazer um saque direto.");
      return;
    }

    const DialogV2 = foundry.applications.api.DialogV2;
    if (!DialogV2?.input) throw new Error("DialogV2.input não está disponível no Foundry V13.");

    const fd = await DialogV2.input({
      window: { title: "Saque do Mestre" },
      content: `
        <form>
          <p>Retire diretamente do patrimônio do grupo. Nenhum personagem será alterado.</p>
          <label>Valor em Tibar de Ouro (TO)
            <input name="to" type="number" min="0" step="1" value="0" autofocus>
          </label>
          <label>Valor em Tibar de Prata (TP)
            <input name="tp" type="number" min="0" step="1" value="0">
          </label>
          <label>Valor em Tibar de Cobre (TC)
            <input name="tc" type="number" min="0" step="1" value="0">
          </label>
          <label>Observação
            <input name="note" type="text" placeholder="Ex.: Correção de tesouro lançado por engano">
          </label>
        </form>
      `,
      ok: { label: "Sacar" },
      rejectClose: false
    });

    if (!fd) return;

    const values = {
      to: Math.max(0, Math.trunc(Number(fd.to ?? 0))),
      tp: Math.max(0, Math.trunc(Number(fd.tp ?? 0))),
      tc: Math.max(0, Math.trunc(Number(fd.tc ?? 0))),
      tl: 0
    };

    if (!values.to && !values.tp && !values.tc) {
      ui.notifications.warn("Informe pelo menos um valor para sacar.");
      return;
    }

    const current = this.chest.getCurrency();
    for (const key of ["to", "tp", "tc"]) {
      if (values[key] > Number(current?.[key] ?? 0)) {
        throw new Error(`O Baú não possui ${values[key]} ${key.toUpperCase()} para esse saque.`);
      }
    }

    await this.chest.removeCurrency({
      to: values.to,
      tp: values.tp,
      tc: values.tc,
      tl: 0
    });

    await this.chest.appendHistory({
      action: "gm-currency-withdraw",
      userId: game.user.id,
      userName: game.user.name,
      itemName: "Saque do Mestre",
      quantity: null,
      currency: values,
      destination: "gm",
      note: fd.note?.trim() || "Valor retirado diretamente pelo Mestre."
    });

    ui.notifications.info("Valor retirado diretamente do Baú.");
    await this.render();
  }

  _bind(root) {
    root.querySelectorAll("[data-tab]").forEach(button => {
      button.addEventListener("click", () => {
        this.tab = button.dataset.tab;
        this.render();
      });
    });

    root.querySelectorAll("[data-cat]").forEach(button => {
      button.addEventListener("click", () => {
        this.category = button.dataset.cat;
        this.render();
      });
    });

    root.querySelectorAll("[data-discard]").forEach(button => {
      button.addEventListener("click", async event => {
        event.stopPropagation();
        try { await this._discard(button.dataset.discard); }
        catch (error) { ui.notifications.error(error.message); }
      });
    });

    root.querySelectorAll("[data-take]").forEach(button => {
      button.addEventListener("click", async event => {
        event.stopPropagation();
        try { await this._takeToActor(button.dataset.take); }
        catch (error) { ui.notifications.error(error.message); }
      });
    });

    // Itens do Baú também podem ser arrastados para uma ficha.
    // O payload usa uma chave própria para não ser confundido com um Item UUID.
    root.querySelectorAll(".t20pc-item[draggable='true']").forEach(element => {
      element.addEventListener("dragstart", event => {
        const item = this.chest.getItems().find(x => x.id === element.dataset.id);
        if (!item || !event.dataTransfer) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", JSON.stringify({
          type: "T20PartyChestItem",
          chestId: item.id,
          quantity: Number(item.quantity ?? 0)
        }));
      });
    });

    const search = root.querySelector("[data-search]");
    if (search) {
      search.addEventListener("input", () => {
        this.search = search.value;
        const query = this.search.trim().toLocaleLowerCase();
        root.querySelectorAll(".t20pc-item").forEach(item => {
          const name = item.querySelector("strong")?.textContent?.toLocaleLowerCase() ?? "";
          item.hidden = !!query && !name.includes(query);
        });
        const empty = root.querySelector(".t20pc-search-empty");
        if (empty) {
          const visible = [...root.querySelectorAll(".t20pc-item")].some(item => !item.hidden);
          empty.hidden = visible;
        }
      });
    }

    root.querySelector("[data-lock]")?.addEventListener("click", async event => {
      event.stopPropagation();
      if (!game.user.isGM) return;
      try {
        const locked = await this.chest.setLocked(!this.chest.isLocked());
        ui.notifications.info(locked ? "Baú trancado." : "Baú aberto para os jogadores.");
      } catch (error) { ui.notifications.error(error.message); }
    });

    root.querySelector("[data-gm-deposit]")?.addEventListener("click", async event => {
      event.stopPropagation();
      try { await this._gmDeposit(); }
      catch (error) { ui.notifications.error(error.message); }
    });

    root.querySelector("[data-gm-withdraw]")?.addEventListener("click", async event => {
      event.stopPropagation();
      try { await this._gmWithdraw(); }
      catch (error) { ui.notifications.error(error.message); }
    });

    root.querySelector("[data-clear]")?.addEventListener("click", async () => {
      const confirmed = await Dialog.confirm({
        title: "Limpar histórico",
        content: "<p>Remover todos os registros? O conteúdo do Baú não será alterado.</p>"
      });

      if (!confirmed) return;
      await this.chest.clearHistory();
      this.render();
    });

    root.querySelectorAll("[data-coin-action]").forEach(button => {
      button.addEventListener("click", async event => {
        event.stopPropagation();

        const key = button.dataset.coin;

        try {
          const actor = await this._chooseActor();
          if (!actor) return;

          const isDeposit = button.dataset.coinAction === "add";
          const actorAmount = Number(foundry.utils.getProperty(actor, `system.dinheiro.${key}`) ?? 0);
          const chestAmount = Number(this.chest.getCurrency()?.[key] ?? 0);
          const max = isDeposit ? actorAmount : chestAmount;

          if (max <= 0) {
            throw new Error(
              isDeposit
                ? `${actor.name} não possui ${key.toUpperCase()} para depositar.`
                : `O Baú não possui ${key.toUpperCase()} para retirar.`
            );
          }

          const amount = await this._askQuantity({
            title: isDeposit
              ? `Depositar ${key.toUpperCase()} no Baú`
              : `Retirar ${key.toUpperCase()} do Baú`,
            itemName: isDeposit
              ? `${key.toUpperCase()} de ${actor.name}`
              : `${key.toUpperCase()} do Baú`,
            max
          });

          if (amount == null) return;

          if (isDeposit) {
            await this.chest.withPermission(`depositar ${amount} ${key.toUpperCase()} de ${actor.name}`,
              () => this.transfer.actorToChestCurrency(actor, key, amount));
            ui.notifications.info(
              `${amount} ${key.toUpperCase()} depositado por ${actor.name}.`
            );
          } else {
            await this.chest.withPermission(`retirar ${amount} ${key.toUpperCase()} para ${actor.name}`,
              () => this.transfer.chestToActorCurrency(key, actor, amount));
            ui.notifications.info(
              `${amount} ${key.toUpperCase()} transferido para ${actor.name}.`
            );
          }

          await this.render();
        } catch (error) {
          ui.notifications.error(error.message);
        }
      });
    });

    root.addEventListener("dragover", event => {
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      event.preventDefault();
      root.classList.add("t20pc-drag-over");
    });
    root.addEventListener("dragleave", event => {
      if (!root.contains(event.relatedTarget)) root.classList.remove("t20pc-drag-over");
    });
    root.addEventListener("drop", event => {
      event.preventDefault();
      event.stopPropagation();
      root.classList.remove("t20pc-drag-over");
      this._handleDrop(event).catch(error => ui.notifications.error(error.message));
    });
  }

  async _handleDrop(event) {
    const raw = event.dataTransfer?.getData("text/plain") || event.dataTransfer?.getData("application/json");
    if (!raw) throw new Error("O Baú não recebeu dados do item.");
    let data;
    try { data = JSON.parse(raw); }
    catch { throw new Error("Formato de arrastar inválido."); }

    if (data.type !== "Item" || !data.uuid) {
      throw new Error("Arraste um Item do Compêndio, Diretório ou ficha.");
    }

    // Transferência a partir de uma ficha deve ser uma operação real:
    // o item é depositado no Baú e removido/reduzido no Actor.
    // Não usar addItemData() aqui, pois esse método é deliberadamente uma
    // operação de cópia para fontes sem Actor (Compêndio/Diretório).
    if (data.type === "Item" && data.uuid) {
      const document = await fromUuid(data.uuid);
      if (!document || document.documentName !== "Item") {
        throw new Error("O documento arrastado não é um Item.");
      }

      if (!this.adapter.canRepresentItem(document)) {
        throw new Error("O item não é compatível com o sistema Tormenta20.");
      }

      if (document.actor) {
        if (!document.actor.isOwner) {
          throw new Error(`Sem permissão para ${document.actor.name}.`);
        }

        const available = Number(this.adapter.getItemQuantity(document) ?? 1);
        const quantity = await this._askQuantity({
          title: "Mover para o Baú",
          itemName: document.name,
          max: available > 0 ? available : 1
        });
        if (quantity == null) return;

        await this.chest.withPermission(`depositar ${document.name} ×${quantity} de ${document.actor.name}`,
          () => this.transfer.actorToChest(document, { quantity }));

        ui.notifications.info(`${document.name} ×${quantity} movido para o Baú.`);
      } else {
        // Itens de Compêndio/Diretório continuam sendo cópias: não existe
        // Actor de origem para ser alterado.
        const available = Number(this.adapter.getItemQuantity(document) ?? 1);
        const quantity = await this._askQuantity({
          title: "Adicionar ao Baú",
          itemName: document.name,
          max: available > 0 ? available : 1
        });
        if (quantity == null) return;

        await this.chest.withPermission(`adicionar ${document.name} ×${quantity}`,
          () => this.chest.addItemData(
            this.adapter.serializeItem(document),
            {
              quantity,
              source: {
                uuid: document.uuid,
                actorUuid: null,
                actorName: null,
                itemId: document.id ?? null
              }
            }
          ));

        ui.notifications.info(`${document.name} ×${quantity} adicionado ao Baú.`);
      }

      await this.render();
      return;
    }

    throw new Error("Arraste um Item do Compêndio, Diretório ou ficha.");
  }

  async _coinDialog(_key) { return; }

}
