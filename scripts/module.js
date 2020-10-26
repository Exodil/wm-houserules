Hooks.on('init', () => {
    /** should surges be tested */
    game.settings.register("wm-houserules", "wmEnabled", {
      name: "Wild Magic Auto-Detect",
      hint: "Enables or disables this feature for the current user.",
      scope: "client",
      config: true,
      default: false,
      type: Boolean,
    });
  
    /** want more surges? you know you do */
    game.settings.register("wm-houserules", "wmMoreSurges", {
      name: "MORE Surges (homebrew)",
      hint: "A surge will occur on a d20 roll <= the spell level just cast, rather than only on a 1.",
      scope: "client",
      config: true,
      default: false,
      type: Boolean,
    });
  
    /** name of the feature to trigger on */
    game.settings.register("wm-houserules", "wmFeatureName", {
      name: "Wild Magic Feature Name",
      hint: "Name of feature that represents the Sorcerer's Wild Magic Surge (default: Wild Magic Surge)",
      scope: "client",
      config: true,
      default: "Wild Magic Surge",
      type: String,
    });
  
    /** name of the table on which to roll if a surge occurs */
    game.settings.register("wm-houserules", "wmTableName", {
      name: "Wild Magic Surge Table Name",
      hint: "Name of table that should be rolled on if a surge occurs (default: Wild-Magic-Surge-Table). Leave empty to skip this step.",
      scope: "client",
      config: true,
      default: "Wild-Magic-Surge-Table",
      type: String,
    });
  
    /** toggle result gm whisper for WM */
    game.settings.register("wm-houserules", "wmWhisper", {
      name: "Blind Table Draw",
      hint: "Hides table results of a successful surge. Viewable by GM only.",
      scope: "world",
      config: true,
      default: false,
      type: Boolean,
    });
    /** enable auto reaction reset */
    game.settings.register("wm-houserules", "cbtReactionEnable", {
      name: "Start of turn reaction reset.",
      hint: "Enables or disables this feature (global)",
      scope: "world",
      config: true,
      default: true,
      type: Boolean,
    });
  
    game.settings.register("wm-houserules", "cbtReactionStatus", {
      name: "Reaction status icon path",
      hint: "Icon path representing the used reaction status effect name (default: downgrade)",
      scope: "world",
      config: true,
      default: "downgrade",
      type: String,
    });
  });
  
  function RollForSurge(spellLevel, moreSurges, rollType=null, actorThreshhold){
  
    const surgeThreshold = actorThreshhold;
    const roll = new Roll("1d20").roll();
    const d20result = roll["result"];
    if (d20result <= surgeThreshold) {
      ChatMessage.create({
        content: "<i>surges as a level "+spellLevel+" spell is cast!</i> ([[/r "+d20result+" #1d20 result]])",
        speaker: ChatMessage.getSpeaker({alias: "The Weave"})
      });
  
      /** roll on the provided table */
      const wmTableName = game.settings.get('wm-houserules','wmTableName');
      if (wmTableName !== "")
      {
        game.tables.getName(wmTableName).draw({roll: null, results: [], displayChat:true, rollMode:rollType});
      }
      return true;
    }
    else{
      ChatMessage.create({
        content: "<i>remains calm as a level "+spellLevel+" spell is cast... but you can fill it starting to stirr ("+surgeThreshold+") </i> ([[/r "+d20result+" #1d20 result]])",
        speaker: ChatMessage.getSpeaker({alias: "The Weave"})
      });
      return false;
    }
  }
  
  /** Wild Magic Surge Handling */
  Hooks.on("preUpdateActor", async (actor, update, options, userId) => {
  
    /** are we enabled for the current user? */
    if (game.settings.get('wm-houserules','wmEnabled') == false){
      return;
    }
    const origSlots = actor.data.data.spells;   
  
    /** find the spell level just cast */
    const spellLvlNames = ["spell1","spell2","spell3","spell4","spell5","spell6", "spell7","spell8","spell9"];
    let lvl = spellLvlNames.findIndex(name => { return getProperty(update,"data.spells."+name) });
  
    const preCastSlotCount = getProperty(origSlots, spellLvlNames[lvl]+".value");
    const postCastSlotCount = getProperty(update, "data.spells."+spellLvlNames[lvl]+".value");
    const bWasCast = preCastSlotCount - postCastSlotCount > 0;
  
    const wmFeatureName = game.settings.get('wm-houserules','wmFeatureName');
    const wmFeature = actor.items.find(i => i.name === wmFeatureName) !== null
    const actorThreshhold = actor.data.data.resources.tertiary.value;
    console.log("Actor threshhold =" + actorThreshhold);
  
    lvl++;
    console.log("A level "+lvl+" slot was expended("+bWasCast+") by a user with the Wild Magic Feature("+wmFeatureName+")");
    if(wmFeature && bWasCast && lvl>0)
    {
      /** lets go baby lets go */
      console.log("Rolling for surge...");
  
      const moreSurges = game.settings.get('wm-houserules','wmMoreSurges');
  
      const rollMode = game.settings.get('wm-houserules','wmWhisper') ? "blindroll" : "roll";
      var bob = RollForSurge(lvl, moreSurges, rollMode, actorThreshhold);
      console.log("bool: " + bob);
      if(bob){
        actor.update({'data.resources.tertiary.value': 2});
      }else{
        actor.update({'data.resources.tertiary.value': actor.data.data.resources.tertiary.value+1});
      }
    }
  });
  
  /** auto reaction status remove at beginning of turn */
  Hooks.on("preUpdateCombat", async(combat, changed, options, userId) => {
  
    /** are we enabled for the current user? */
    if (game.settings.get('wm-houserules','cbtReactionEnable') == false){
      return;
    }
  
    /** only concerned with turn changes */
    if ( !("turn" in changed) ) {
      return;
    }
  
    /** just want this to run for GMs */
    const firstGm = game.users.find((u) => u.isGM && u.active);
    if (firstGm && game.user === firstGm){
  
      /** begin removal logic for the _next_ token */
      const nextTurn = combat.turns[changed.turn];
      /** data structure for 0.6 */
      let nextTokenId = null;
      if (getProperty(nextTurn,"tokenId"))
      {
        nextTokenId = nextTurn.tokenId;
      }
      else
      {
        nextTokenId = nextTurn.token._id;
      }
  
  
      let currentToken = canvas.tokens.get(nextTokenId);
      if (currentToken)
      {
        const reactionStatus = game.settings.get('wm-houserules','cbtReactionStatus');
  
        const isv6 = game.data.version.includes("0.6.");
        const isv7 = game.data.version.includes("0.7.");
        if (isv6) {
          if (currentToken.data.effects.includes(reactionStatus)) {
            await currentToken.toggleEffect(reactionStatus);
          }
        }
        else if (isv7){
          /** latest version, attempt to play nice with active effects */
          const statusEffect = CONFIG.statusEffects.find(e=>e.id === reactionStatus)
          if(!statusEffect)
          {
            console.log("wm-houserules: could not located active effect named: "+reactionStatus);
            return;
          }
  
          /** Remove an existing effect (stoken from foundy.js:44223 */
          const existing = currentToken.actor.effects.find(e => e.getFlag("core", "statusId") === statusEffect.id);
          if ( existing ) {
            await currentToken.toggleEffect(statusEffect);
          }
          
        }
      }
      else
      {
        console.log("wm-houserules: UNSUPPORTED VERSION FOR REACTION HANDLING");
      }
    }
  
  });
  